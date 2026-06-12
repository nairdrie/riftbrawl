// End-to-end integration test: boots the real server, drives two websocket
// clients through register → friend → invite → char select → a full match.
// Run: npm test

import { spawn } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3107;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;

function check(name, cond) {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}`);
  if (!cond) failures++;
}

class Client {
  constructor(name) {
    this.name = name;
    this.msgs = [];
    this.waiters = [];
  }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.on('open', res);
      this.ws.on('error', rej);
      this.ws.on('message', (d) => {
        const m = JSON.parse(d);
        this.msgs.push(m);
        this.waiters = this.waiters.filter(w => !w(m));
      });
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  // resolve on next message of type t (or already received & unconsumed)
  wait(t, timeout = 5000, pred = () => true) {
    const idx = this.msgs.findIndex(m => m.t === t && pred(m));
    if (idx >= 0) return Promise.resolve(this.msgs.splice(idx, 1)[0]);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error(`${this.name}: timeout waiting for '${t}'`)), timeout);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) {
          clearTimeout(to);
          this.msgs.splice(this.msgs.indexOf(m), 1);
          res(m);
          return true;
        }
        return false;
      });
    });
  }
  drain(t) { this.msgs = this.msgs.filter(m => m.t !== t); }
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-test-'));
  const server = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), SMASH_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
  await new Promise((res, rej) => {
    server.stdout.on('data', d => { if (String(d).includes('live')) res(); });
    server.on('exit', () => rej(new Error('server died')));
    setTimeout(() => rej(new Error('server boot timeout')), 5000);
  });
  console.log('server booted');

  try {
    // ── static hosting
    const html = await (await fetch(`http://localhost:${PORT}/`)).text();
    check('serves index.html', html.includes('RIFTBRAWL'));
    const sim = await (await fetch(`http://localhost:${PORT}/shared/sim.js`)).text();
    check('serves shared sim module', sim.includes('export function step'));

    // ── auth
    const a = new Client('alice');
    const b = new Client('bob');
    await a.connect();
    await b.connect();

    a.send({ t: 'register', username: 'alice', password: 'hunter2' });
    const authA = await a.wait('auth');
    check('alice registers', authA.ok && authA.user.username === 'alice');
    check('alice gets a token', typeof authA.token === 'string' && authA.token.length > 20);

    b.send({ t: 'register', username: 'bob', password: 'hunter2' });
    const authB = await b.wait('auth');
    check('bob registers', authB.ok);

    // duplicate username rejected
    const c0 = new Client('dup');
    await c0.connect();
    c0.send({ t: 'register', username: 'ALICE', password: 'xx1234' });
    const dup = await c0.wait('auth');
    check('duplicate tag rejected (case-insensitive)', !dup.ok);
    // wrong password rejected
    c0.send({ t: 'login', username: 'alice', password: 'wrong' });
    check('wrong password rejected', !(await c0.wait('auth')).ok);
    // token resume works
    c0.send({ t: 'resume', token: authB.token });
    const resumed = await c0.wait('auth');
    check('token resume works', resumed.ok && resumed.user.username === 'bob');
    // bob's original socket got replaced — reconnect bob
    await b.wait('error', 3000).catch(() => {});
    b.ws.close();
    const b2 = new Client('bob2');
    await b2.connect();
    c0.ws.close();
    await new Promise(r => setTimeout(r, 200));
    b2.send({ t: 'resume', token: authB.token });
    check('bob reconnects', (await b2.wait('auth')).ok);

    // ── friends
    a.drain('social'); b2.drain('social');
    a.send({ t: 'addFriend', username: 'bob' });
    await a.wait('toast');
    const socB = await b2.wait('social', 5000, m => m.requests?.length > 0);
    check('bob sees friend request', socB.requests[0].username === 'alice');
    b2.send({ t: 'acceptFriend', uid: socB.requests[0].uid });
    const socA = await a.wait('social', 5000, m => m.friends?.length > 0);
    check('alice sees bob as friend & online', socA.friends[0].username === 'bob' && socA.friends[0].online);

    // ── invite → room
    const bobUid = socA.friends[0].uid;
    a.send({ t: 'invite', uid: bobUid });
    const inv = await b2.wait('invited');
    check('bob receives invite', inv.from.username === 'alice');
    b2.send({ t: 'acceptInvite', uid: inv.from.uid });
    const roomA = await a.wait('room');
    const roomB = await b2.wait('room');
    check('both enter char select', roomA.phase === 'select' && roomB.phase === 'select');

    // ── char select → start
    a.send({ t: 'ready', charId: 'volt' });
    b2.send({ t: 'ready', charId: 'aegis' });
    const startA = await a.wait('start');
    await b2.wait('start');
    check('match starts with both fighters', startA.players.length === 2 &&
      startA.players.some(p => p.charId === 'volt') && startA.players.some(p => p.charId === 'aegis'));

    // ── gameplay: drive inputs, observe snapshots
    const myIdxA = startA.players.findIndex(p => p.uid === authA.user.uid);
    const oppIdx = 1 - myIdxA;
    let seq = 0;
    const driver = setInterval(() => {
      // alice walks at bob and mashes attack; bob walks into her
      seq++;
      a.send({ t: 'input', seq, b: seq % 14 < 2 ? 1 : 0, x: myIdxA === 0 ? 1 : -1, y: 0 });
      b2.send({ t: 'input', seq, b: 0, x: myIdxA === 0 ? -1 : 1, y: 0 });
    }, 16);

    const firstSnap = await a.wait('snap');
    check('snapshots flow', Array.isArray(firstSnap.s.pl) && firstSnap.s.pl.length === 2);
    check('input acks flow', typeof firstSnap.ack === 'number');

    // ── pause / resume (only legal once the countdown has finished)
    await a.wait('snap', 10000, m => m.s.ph === 1);
    a.send({ t: 'pause' });
    const pausedMsg = await b2.wait('paused', 5000);
    check('pause reaches the other player with the pauser name', pausedMsg.by === 'alice');
    await sleep(300);
    a.drain('snap'); b2.drain('snap');
    await sleep(500);
    const noSnaps = a.msgs.filter(m => m.t === 'snap').length;
    check('simulation freezes while paused', noSnaps === 0, );
    b2.send({ t: 'unpause' });
    const resuming = await a.wait('resuming', 5000);
    check('unpause announces a countdown', resuming.inMs > 1000);
    await a.wait('resumed', 8000);
    check('match resumes after the countdown', true);
    await a.wait('snap', 5000);
    check('snapshots flow again after resume', true);

    // wait for a KO event
    const koSnap = await a.wait('snap', 90000, m => (m.ev || []).some(e => e.type === 'ko'));
    const ko = koSnap.ev.find(e => e.type === 'ko');
    check('percent-based KO happens', ko.victim === oppIdx || ko.victim === myIdxA);

    // wait for match end
    const end = await a.wait('end', 240000);
    clearInterval(driver);
    check('match ends with a winner', end.winner === 0 || end.winner === 1);
    check('results include stocks/percent', end.players.every(p => typeof p.stocks === 'number' && typeof p.percent === 'number'));

    const back = await a.wait('room', 5000);
    check('room returns to select for rematch', back.phase === 'select');

    // ── win recorded
    a.drain('social');
    a.send({ t: 'addFriend', username: 'bob' }); // no-op to trigger nothing
    await a.wait('toast').catch(() => {});

    // ── un-ready works and select-phase disconnects hold the seat
    a.drain('room'); b2.drain('room');
    a.send({ t: 'ready', charId: 'volt' });
    await a.wait('room', 5000, m => m.players?.some(p => p.username === 'alice' && p.ready));
    a.send({ t: 'unready' });
    const unr = await a.wait('room', 5000, m => m.players?.some(p => p.username === 'alice' && !p.ready));
    check('un-ready cancels the ready state', !!unr);
    // bob's socket blips during char select — seat held, lobby shows dc
    b2.ws.terminate();
    const dcLobby = await a.wait('room', 5000, m => m.players?.some(p => p.username === 'bob' && p.dc));
    check('select-phase disconnect holds the seat (no instant dissolve)', !!dcLobby);
    const b2b = new Client('bob2b');
    await b2b.connect();
    b2b.send({ t: 'resume', token: authB.token });
    await b2b.wait('auth');
    const backLobby = await b2b.wait('room', 5000, m => m.phase === 'select');
    check('reconnect during select rejoins the lobby', !!backLobby);
    await a.wait('room', 5000, m => m.players?.some(p => p.username === 'bob' && !p.dc));
    // restore b2 handle for the tests below
    b2.ws = b2b.ws; b2.msgs = b2b.msgs; b2.waiters = b2b.waiters;
    b2b.ws.removeAllListeners('message');
    b2.ws.on('message', (d) => {
      const m = JSON.parse(d);
      b2.msgs.push(m);
      b2.waiters = b2.waiters.filter(w => !w(m));
    });

    // ── mid-match disconnect → grace pause → reconnect → resync
    a.drain('room'); b2.drain('room'); a.drain('snap'); b2.drain('snap');
    a.drain('paused'); b2.drain('paused');
    a.send({ t: 'ready', charId: 'volt' });
    b2.send({ t: 'ready', charId: 'tide' });
    const rcStart = await a.wait('start');
    await b2.wait('start');
    await a.wait('snap', 10000, m => m.s.ph === 1);   // countdown done
    b2.ws.terminate();                                 // hard drop, no goodbye
    const dcPause = await a.wait('paused', 5000);
    check('disconnect pauses the match with a grace period', dcPause.reason === 'disconnected' && dcPause.graceMs > 0);
    // bob comes back on a fresh socket with his token
    const b3 = new Client('bob3');
    await b3.connect();
    b3.send({ t: 'resume', token: authB.token });
    await b3.wait('auth');
    const rs = await b3.wait('resync', 5000);
    check('reconnect resyncs full match state', Array.isArray(rs.s.pl) && rs.s.pl.length === 2 && rs.players.length === 2);
    await a.wait('resuming', 5000);
    await a.wait('resumed', 8000);
    check('match resumes after reconnect countdown', true);
    await b3.wait('snap', 5000);
    check('snapshots flow to the reconnected player', true);
    // cleanly leave so later tests aren't affected
    b3.send({ t: 'leaveRoom' });
    await a.wait('oppLeft', 5000);
    a.drain('room'); a.drain('end'); a.drain('snap');

    // ── rate limiting: sensitive ops are budget-capped
    const flood = new Client('flood');
    await flood.connect();
    for (let i = 0; i < 40; i++) flood.send({ t: 'login', username: 'alice', password: 'wrong' });
    await sleep(1500);
    const authReplies = flood.msgs.filter(m => m.t === 'auth').length;
    check('sensitive message flood is rate-limited', authReplies <= 12 && authReplies >= 5);
    flood.ws.close();

    // ── healthz
    const health = await (await fetch(`http://localhost:${PORT}/healthz`)).json();
    check('healthz reports server state', health.ok === true && typeof health.rooms === 'number');

    // ── practice mode vs CPU
    const d = new Client('dana');
    await d.connect();
    d.send({ t: 'register', username: 'dana', password: 'pass1234' });
    await d.wait('auth');
    d.send({ t: 'practice' });
    const pRoom = await d.wait('room');
    check('practice room has CPU ready', pRoom.players.some(p => p.bot && p.ready));
    d.send({ t: 'ready', charId: 'ember' });
    const pStart = await d.wait('start');
    check('practice match starts', pStart.players.length === 2);
    let pseq = 0;
    const pdrive = setInterval(() => { pseq++; d.send({ t: 'input', seq: pseq, b: 0, x: 0.5, y: 0 }); }, 16);
    const psnap = await d.wait('snap', 10000, m => m.s.f > 200);
    clearInterval(pdrive);
    check('CPU match simulates past countdown', psnap.s.f > 200);
    d.send({ t: 'leaveRoom' });

    // ── disconnect mid-match forfeits once the grace period expires
    a.drain('room'); a.drain('snap'); a.drain('paused'); a.drain('oppLeft');
    a.send({ t: 'invite', uid: bobUid });
    const inv2 = await b3.wait('invited');
    b3.send({ t: 'acceptInvite', uid: inv2.from.uid });
    await a.wait('room');
    await b3.wait('room');
    a.send({ t: 'ready', charId: 'volt' });
    b3.send({ t: 'ready', charId: 'tide' });
    await a.wait('start');
    await b3.wait('start');
    b3.ws.terminate();
    await a.wait('paused', 5000);                      // grace pause kicks in
    const oppLeft = await a.wait('oppLeft', 40000);    // …and expires after 30s
    check('disconnect forfeits after the grace period', !!oppLeft);

    a.ws.close();
    d.ws.close();
  } catch (e) {
    console.error('  ✗ FAIL (exception):', e.message);
    failures++;
  } finally {
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(failures ? `\n${failures} failure(s)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
}

main();
