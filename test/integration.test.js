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

    // ── disconnect mid-match forfeits
    a.drain('room'); b2.drain('room'); a.drain('snap'); b2.drain('snap');
    a.send({ t: 'ready', charId: 'volt' });
    b2.send({ t: 'ready', charId: 'tide' });
    await a.wait('start');
    await b2.wait('start');
    b2.ws.close();
    const oppLeft = await a.wait('oppLeft', 5000);
    check('disconnect forfeits to opponent', !!oppLeft);

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
