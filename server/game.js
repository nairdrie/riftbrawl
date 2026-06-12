// ─────────────────────────────────────────────────────────────────────────────
// Match rooms: authoritative 60Hz simulation, snapshot broadcast, character
// select / rematch flow, matchmaking queue, and a practice-mode CPU.
// ─────────────────────────────────────────────────────────────────────────────

import { createGameState, step, serializeState } from '../shared/sim.js';
import { CHARACTER_LIST, CHARACTERS } from '../shared/characters.js';
import { TICK_RATE, SNAP_EVERY, BTN, ACT, PHASE, STAGE, quant } from '../shared/constants.js';
import { recordResult } from './store.js';

const rooms = new Map();      // roomId → Room
let nextRoomId = 1;

export function getRoom(roomId) { return rooms.get(roomId); }
export function roomCount() { return rooms.size; }

export function findRoomByUid(uid) {
  for (const room of rooms.values()) {
    if (room.members.some(m => m.uid === uid)) return room;
  }
  return null;
}

// index.js registers a hook so dissolved rooms clear session.room pointers
let onRoomDissolved = () => {};
export function setRoomDissolvedHandler(fn) { onRoomDissolved = fn; }

// ── CPU opponent ────────────────────────────────────────────────────────────

class Bot {
  constructor(uid) {
    this.uid = uid;
    this.username = 'CPU';
    this.cool = 0;
    this.shieldHold = 0;
  }
  think(state, myIdx) {
    const me = state.players[myIdx];
    const foe = state.players.find(p => p.idx !== myIdx && p.stocks > 0);
    if (!me || me.act === ACT.DEAD) return { b: 0, x: 0, y: 0 };
    if (me.act === ACT.LEDGE) return { b: 0, x: me.x > 0 ? -1 : 1, y: 0 };
    let b = 0, x = 0, y = 0;
    this.cool = Math.max(0, this.cool - 1);
    this.shieldHold = Math.max(0, this.shieldHold - 1);

    const offstage = Math.abs(me.x) > STAGE.halfWidth - 10;
    if (offstage || me.y < -50 && !me.grounded) {
      // recover toward center
      x = me.x > 0 ? -1 : 1;
      if (me.vy > 2 && me.jumpsLeft > 0 && Math.random() < 0.2) b |= BTN.JUMP;
      else if (me.vy > 4 && !me.exhausted && me.y > -60 && Math.random() < 0.3) {
        b |= BTN.SPECIAL; y = -1; // up-B
      }
      return { b, x: quant(x), y: quant(y) };
    }
    if (!foe) return { b: 0, x: 0, y: 0 };

    if (this.shieldHold > 0) { b |= BTN.SHIELD; return { b, x: 0, y: 0 }; }

    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.abs(dx);

    if (dist > 110) {
      x = Math.sign(dx);
      if (Math.random() < 0.012 && me.grounded) b |= BTN.JUMP;
      if (dist > 320 && this.cool === 0 && Math.random() < 0.025) {
        b |= BTN.SPECIAL; this.cool = 50; // neutral-B projectile
      }
    } else if (this.cool === 0) {
      // in range — pick an attack
      const roll = Math.random();
      if (foe.act === ACT.ATTACK && Math.random() < 0.25) {
        this.shieldHold = 22; b |= BTN.SHIELD;
      } else if (dy < -60) {
        b |= BTN.ATTACK; y = -1; this.cool = 26;       // up-tilt / up-air
      } else if (roll < 0.45) {
        b |= BTN.ATTACK; x = Math.sign(dx); this.cool = 24;
      } else if (roll < 0.65) {
        b |= BTN.ATTACK; this.cool = 20;
      } else if (roll < 0.8) {
        b |= BTN.SPECIAL; x = Math.sign(dx); this.cool = 44; // side-B
      } else {
        b |= BTN.JUMP; this.cool = 10;
      }
    } else {
      x = Math.sign(dx) * 0.6;
    }
    return { b, x: quant(x), y: quant(y) };
  }
}

// ── Room ────────────────────────────────────────────────────────────────────

export class Room {
  constructor(members, { practice = false } = {}) {
    this.id = `r${nextRoomId++}`;
    this.practice = practice;
    // members: [{uid, username, send(obj), isBot?}]
    this.members = members;
    this.phase = 'select';
    this.picks = new Map();    // uid → {charId, ready}
    this.state = null;
    this.inputs = [];          // idx → latest {b,x,y}
    this.lastSeq = new Map();  // uid → last applied input seq
    this.bot = null;
    this.timer = null;
    this.startTime = 0;
    this.tick = 0;
    this.paused = false;
    this.resumeAt = 0;
    this.dcTimers = new Map();   // uid → forfeit timeout while disconnected
    this.dcWait = new Set();     // uids currently disconnected
    rooms.set(this.id, this);
    for (const m of members) {
      if (m.isBot) {
        this.bot = new Bot(m.uid);
        this.picks.set(m.uid, { charId: CHARACTER_LIST[Math.floor(Math.random() * CHARACTER_LIST.length)], ready: true });
      } else {
        this.picks.set(m.uid, { charId: null, ready: false });
      }
    }
    this.broadcastLobby();
  }

  humans() { return this.members.filter(m => !m.isBot); }

  broadcast(obj) {
    for (const m of this.humans()) m.send(obj);
  }

  broadcastLobby() {
    this.broadcast({
      t: 'room',
      roomId: this.id,
      phase: this.phase,
      practice: this.practice,
      players: this.members.map(m => ({
        uid: m.uid, username: m.username, bot: !!m.isBot,
        charId: this.picks.get(m.uid)?.charId || null,
        ready: !!this.picks.get(m.uid)?.ready,
      })),
    });
  }

  selectChar(uid, charId) {
    if (this.phase !== 'select' || !CHARACTERS[charId]) return;
    const pick = this.picks.get(uid);
    if (!pick || pick.ready) return;
    pick.charId = charId;
    this.broadcastLobby();
  }

  setReady(uid, charId) {
    if (this.phase !== 'select') return;
    const pick = this.picks.get(uid);
    if (!pick) return;
    if (CHARACTERS[charId]) pick.charId = charId;
    if (!pick.charId) return;
    pick.ready = true;
    this.broadcastLobby();
    if ([...this.picks.values()].every(p => p.ready)) this.startMatch();
  }

  startMatch() {
    this.phase = 'playing';
    const specs = this.members.map(m => ({ uid: m.uid, charId: this.picks.get(m.uid).charId }));
    this.state = createGameState(specs);
    this.inputs = this.members.map(() => ({ b: 0, x: 0, y: 0 }));
    this.lastSeq = new Map(this.members.map(m => [m.uid, 0]));
    this.tick = 0;
    this.paused = false;
    this.resumeAt = 0;
    this.startTime = Date.now();
    this.broadcast({
      t: 'start',
      roomId: this.id,
      players: this.members.map((m, i) => ({
        uid: m.uid, username: m.isBot ? 'CPU' : m.username,
        bot: !!m.isBot, charId: this.picks.get(m.uid).charId, idx: i,
      })),
      s: serializeState(this.state),
    });
    // fixed-timestep loop with catch-up so we never drift
    this.timer = setInterval(() => this.pump(), 1000 / TICK_RATE / 2);
  }

  pump() {
    if (!this.state) return;
    if (this.paused) {
      if (this.resumeAt && Date.now() >= this.resumeAt) {
        this.paused = false;
        this.resumeAt = 0;
        this.broadcast({ t: 'resumed' });
      } else {
        // freeze the clock so no ticks accumulate while paused
        this.startTime = Date.now() - this.tick * (1000 / TICK_RATE);
        return;
      }
    }
    const target = Math.floor((Date.now() - this.startTime) * TICK_RATE / 1000);
    let guard = 0;
    while (this.tick < target && guard++ < 10) this.stepOnce();
  }

  pause(uid) {
    if (!this.state || this.state.phase !== PHASE.PLAYING) return;
    if (this.paused) return;
    const m = this.members.find(mm => mm.uid === uid);
    if (!m) return;
    this.paused = true;
    this.resumeAt = 0;
    this.broadcast({ t: 'paused', by: m.username });
  }

  unpause(uid) {
    if (!this.paused || this.resumeAt) return;
    if (this.dcWait.size > 0) return;   // can't resume while a player is gone
    if (!this.members.some(mm => mm.uid === uid)) return;
    const delay = 3200; // 3‑2‑1 countdown so the resume is fair
    this.resumeAt = Date.now() + delay;
    this.broadcast({ t: 'resuming', inMs: delay });
  }

  stepOnce() {
    this.tick++;
    if (this.bot) {
      const botIdx = this.members.findIndex(m => m.isBot);
      if (this.state.phase === PHASE.PLAYING) {
        this.inputs[botIdx] = this.bot.think(this.state, botIdx);
      }
    }
    const events = step(this.state, this.inputs);
    if (this.tick % SNAP_EVERY === 0 || events.length) {
      const s = serializeState(this.state);
      const serverEvents = events.filter(e => e.type === 'ko' || e.type === 'gameover' || e.type === 'go');
      for (const m of this.humans()) {
        m.send({ t: 'snap', s, ack: this.lastSeq.get(m.uid) || 0, ev: serverEvents });
      }
    }
    if (this.state.phase === PHASE.OVER) this.endMatch();
  }

  handleInput(uid, msg) {
    if (!this.state || this.state.phase === PHASE.OVER) return;
    const idx = this.members.findIndex(m => m.uid === uid);
    if (idx < 0) return;
    const b = msg.b | 0;
    this.inputs[idx] = { b, x: quant(+msg.x || 0), y: quant(+msg.y || 0) };
    this.lastSeq.set(uid, msg.seq | 0);
  }

  endMatch() {
    clearInterval(this.timer);
    this.timer = null;
    const winnerIdx = this.state.winner;
    const players = this.members.map((m, i) => ({
      uid: m.uid, username: m.isBot ? 'CPU' : m.username, idx: i,
      charId: this.picks.get(m.uid).charId,
      stocks: this.state.players[i].stocks,
      percent: Math.round(this.state.players[i].percent),
    }));
    if (winnerIdx >= 0 && !this.practice) {
      const winner = this.members[winnerIdx];
      const loser = this.members.find((m, i) => i !== winnerIdx);
      if (winner && loser && !winner.isBot && !loser.isBot) {
        recordResult(winner.uid, loser.uid);
      }
    }
    this.broadcast({ t: 'end', winner: winnerIdx, players });
    this.state = null;
    // back to character select for a rematch
    this.phase = 'select';
    for (const [uid, pick] of this.picks) {
      const m = this.members.find(mm => mm.uid === uid);
      pick.ready = !!m?.isBot;
    }
    setTimeout(() => { if (rooms.has(this.id)) this.broadcastLobby(); }, 100);
  }

  // a player's socket dropped mid-match: pause and wait for them
  memberDisconnected(uid) {
    const m = this.members.find(mm => mm.uid === uid);
    if (!m) return;
    if (!this.state || this.state.phase === PHASE.OVER) {
      // lobby / between matches — no grace needed
      this.removeMember(uid, 'disconnected');
      return;
    }
    if (this.dcTimers.has(uid)) return;
    m.send = () => {};            // dead sink until they come back
    this.dcWait.add(uid);
    this.paused = true;
    this.resumeAt = 0;
    this.broadcast({ t: 'paused', by: m.username, reason: 'disconnected', graceMs: 30000 });
    this.dcTimers.set(uid, setTimeout(() => {
      this.dcTimers.delete(uid);
      this.dcWait.delete(uid);
      this.removeMember(uid, 'disconnected');
    }, 30000));
  }

  // the player reconnected: restore their pipe, resync, resume
  reattach(uid, send) {
    const m = this.members.find(mm => mm.uid === uid);
    if (!m) return false;
    m.send = send;
    const timer = this.dcTimers.get(uid);
    if (timer) { clearTimeout(timer); this.dcTimers.delete(uid); }
    this.dcWait.delete(uid);
    if (this.state) {
      m.send({
        t: 'resync',
        roomId: this.id,
        players: this.members.map((mm, i) => ({
          uid: mm.uid, username: mm.isBot ? 'CPU' : mm.username,
          bot: !!mm.isBot, charId: this.picks.get(mm.uid)?.charId, idx: i,
        })),
        s: serializeState(this.state),
        paused: this.paused,
      });
      if (this.paused && this.dcWait.size === 0 && !this.resumeAt) {
        this.resumeAt = Date.now() + 3200;
        this.broadcast({ t: 'resuming', inMs: 3200 });
      }
    } else {
      this.broadcastLobby();
    }
    return true;
  }

  removeMember(uid, reason = 'left') {
    const m = this.members.find(mm => mm.uid === uid);
    if (!m) return;
    this.members = this.members.filter(mm => mm.uid !== uid);
    this.picks.delete(uid);
    const humansLeft = this.humans();
    if (this.state && this.state.phase !== PHASE.OVER) {
      // forfeit: remaining player wins
      clearInterval(this.timer);
      this.timer = null;
      const winner = humansLeft[0];
      if (winner && !this.practice) recordResult(winner.uid, uid);
      this.broadcast({ t: 'oppLeft', reason });
      this.state = null;
    } else {
      this.broadcast({ t: 'oppLeft', reason });
    }
    this.destroy();
  }

  destroy() {
    clearInterval(this.timer);
    this.timer = null;
    for (const t of this.dcTimers.values()) clearTimeout(t);
    this.dcTimers.clear();
    const humanUids = this.members.filter(m => !m.isBot).map(m => m.uid);
    rooms.delete(this.id);
    onRoomDissolved(this.id, humanUids);
  }
}

// ── matchmaking ─────────────────────────────────────────────────────────────

const queue = [];   // [{uid, username, send}]

export function joinQueue(member) {
  if (queue.some(q => q.uid === member.uid)) return null;
  queue.push(member);
  member.send({ t: 'queued' });
  if (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    return new Room([a, b]);
  }
  return null;
}

export function leaveQueue(uid) {
  const i = queue.findIndex(q => q.uid === uid);
  if (i >= 0) queue.splice(i, 1);
}

export function createPracticeRoom(member) {
  const bot = { uid: `bot_${member.uid}`, username: 'CPU', isBot: true, send: () => {} };
  return new Room([member, bot], { practice: true });
}

export function createPrivateRoom(a, b) {
  return new Room([a, b]);
}
