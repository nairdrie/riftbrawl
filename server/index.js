// ─────────────────────────────────────────────────────────────────────────────
// SMASH server — static hosting + single websocket for auth, social (friends /
// presence / invites), matchmaking, and realtime match traffic.
// ─────────────────────────────────────────────────────────────────────────────

import './env.js';        // load .env into process.env before anything reads it
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import * as store from './store.js';
import * as skins from './skins.js';
import {
  Room, joinQueue, leaveQueue, createPracticeRoom, createPrivateRoom,
  roomCount, findRoomByUid, setRoomDissolvedHandler,
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
// uploaded skin part-images (read-only; written via the gated design API)
app.use('/skins', express.static(skins.SKINS_DIR, { maxAge: '1h', fallthrough: true }));

app.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), sessions: sessions.size, rooms: roomCount() });
});

// ── design / skins HTTP API ───────────────────────────────────────────────
// Read is public (every client loads it to render); writes are gated to the
// DESIGN_ROLES allowlist. Image uploads come over HTTP (the websocket caps
// payloads at 8KB), so this router gets its own generous JSON body limit.
const api = express.Router();
api.use(express.json({ limit: '8mb' }));

function tokenFrom(req) {
  const auth = req.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.body?.token || req.query?.token || '';
}

// crude per-IP throttle for the password-checking login endpoint
const loginHits = new Map();
function loginThrottled(ip) {
  const now = Date.now();
  const rec = loginHits.get(ip) || { n: 0, at: now };
  if (now - rec.at > 60000) { rec.n = 0; rec.at = now; }
  rec.n++;
  loginHits.set(ip, rec);
  if (loginHits.size > 5000) loginHits.clear();
  return rec.n > 20;
}

function requireDesigner(req, res, next) {
  const user = store.verifyToken(tokenFrom(req));
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  if (!skins.isDesigner(user.username)) return res.status(403).json({ error: 'Designer access required' });
  req.user = user;
  next();
}

// public — all clients load this to render reskinned fighters
api.get('/skins', (req, res) => res.json(skins.getDoc()));

// who am I + can I design? (drives the /design page gate)
api.get('/design/me', (req, res) => {
  const user = store.verifyToken(tokenFrom(req));
  if (!user) return res.json({ authed: false, designersConfigured: skins.designersConfigured() });
  res.json({
    authed: true,
    username: user.username,
    isDesigner: skins.isDesigner(user.username),
    designersConfigured: skins.designersConfigured(),
  });
});

// dedicated HTTP login for the design tool — avoids the websocket's
// single-connection-per-account kick when you're also in a game tab
api.post('/design/login', (req, res) => {
  if (loginThrottled(req.ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute' });
  const r = store.login(String(req.body?.username || ''), String(req.body?.password || ''));
  if (r.error) return res.status(401).json({ error: r.error });
  res.json({
    ok: true,
    token: store.issueToken(r.user.uid),
    username: r.user.username,
    isDesigner: skins.isDesigner(r.user.username),
  });
});

// upload one part image → returns the served path to bind into a slot
api.post('/design/upload', requireDesigner, (req, res) => {
  try {
    const url = skins.saveImage(String(req.body?.charId || ''), String(req.body?.slot || ''), req.body?.dataUrl);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// replace the whole skins document (validated/sanitized server-side)
api.post('/design/skins', requireDesigner, (req, res) => {
  const saved = skins.saveDoc(req.body?.skins || {});
  res.json({ ok: true, doc: saved });
});

app.use('/api', api);
app.get('/design', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'design', 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

// uid → Session (one active connection per account)
const sessions = new Map();

// message types that hit crypto or the database — much stricter budget
const SENSITIVE = new Set(['register', 'login', 'resume', 'addFriend', 'invite']);

class Session {
  constructor(ws) {
    this.ws = ws;
    this.user = null;     // store user record
    this.room = null;
    this.queued = false;
    this.invitesOut = new Map(); // toUid → timestamp
    // token buckets: general traffic (inputs at 60/s + headroom) and sensitive ops
    this.bucket = { tokens: 240, cap: 240, rate: 130, at: Date.now() };
    this.slowBucket = { tokens: 10, cap: 10, rate: 0.5, at: Date.now() };
    // flood detection over a sliding window — NOT lifetime-cumulative, so a
    // long session can never "save up" enough drops to get disconnected
    this.drops = 0;
    this.dropWindowStart = Date.now();
  }

  takeToken(sensitive) {
    const b = sensitive ? this.slowBucket : this.bucket;
    const now = Date.now();
    if (now - this.dropWindowStart > 10000) {
      this.drops = 0;
      this.dropWindowStart = now;
    }
    b.tokens = Math.min(b.cap, b.tokens + (now - b.at) / 1000 * b.rate);
    b.at = now;
    if (b.tokens < 1) {
      this.drops++;
      return false;
    }
    b.tokens--;
    return true;
  }
  get uid() { return this.user?.uid; }
  get username() { return this.user?.username; }
  send(obj) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
  status() {
    if (this.room?.state) return 'in match';
    if (this.room) return 'in lobby';
    if (this.queued) return 'searching';
    return 'online';
  }
}

function sessionOf(uid) { return sessions.get(uid) || null; }

setRoomDissolvedHandler((roomId, uids) => {
  for (const uid of uids) {
    const s = sessionOf(uid);
    if (s?.room?.id === roomId) s.room = null;
    notifyFriends(uid);
  }
});

// ── social payloads ─────────────────────────────────────────────────────────

function socialPayload(user) {
  const fresh = store.getUser(user.uid);
  return {
    t: 'social',
    me: { uid: fresh.uid, username: fresh.username, wins: fresh.wins, losses: fresh.losses },
    friends: fresh.friends.map(fid => {
      const f = store.getUser(fid);
      const s = sessionOf(fid);
      return f && {
        uid: f.uid, username: f.username,
        wins: f.wins, losses: f.losses,
        online: !!s, status: s ? s.status() : 'offline',
      };
    }).filter(Boolean),
    requests: fresh.requestsIn.map(rid => {
      const r = store.getUser(rid);
      return r && { uid: r.uid, username: r.username };
    }).filter(Boolean),
  };
}

function pushSocial(uid) {
  const s = sessionOf(uid);
  if (s?.user) s.send(socialPayload(s.user));
}

// tell my friends my presence changed
function notifyFriends(uid) {
  const user = store.getUser(uid);
  if (!user) return;
  for (const fid of user.friends) pushSocial(fid);
}

// ── auth flow ───────────────────────────────────────────────────────────────

function completeAuth(session, user) {
  // kick any existing connection on this account
  const existing = sessionOf(user.uid);
  if (existing && existing !== session) {
    existing.send({ t: 'error', code: 'replaced', msg: 'Signed in from another tab' });
    existing.ws.close();
    cleanup(existing, false);
  }
  session.user = user;
  sessions.set(user.uid, session);
  session.send({
    t: 'auth', ok: true,
    token: store.issueToken(user.uid),
    user: { uid: user.uid, username: user.username, wins: user.wins, losses: user.losses },
  });
  session.send(socialPayload(user));
  // reconnect support: if they have a live room, plug them back in
  const room = findRoomByUid(user.uid);
  if (room && room.reattach(user.uid, (obj) => session.send(obj))) {
    session.room = room;
  } else {
    session.room = null;
    session.send({ t: 'roomGone' });
  }
  notifyFriends(user.uid);
}

// ── room membership helper ──────────────────────────────────────────────────

function memberFor(session) {
  return {
    uid: session.uid,
    username: session.username,
    send: (obj) => session.send(obj),
  };
}

function attachRoom(session, room) {
  if (!room) return;
  for (const m of room.members) {
    const s = sessionOf(m.uid);
    if (s) { s.room = room; s.queued = false; }
  }
  for (const m of room.members) notifyFriends(m.uid);
}

function leaveRoom(session, reason = 'left') {
  const room = session.room;
  if (!room) return;
  const others = room.members.filter(m => m.uid !== session.uid && !m.isBot);
  room.removeMember(session.uid, reason);
  session.room = null;
  for (const m of others) {
    const s = sessionOf(m.uid);
    if (s) s.room = null;
    notifyFriends(m.uid);
  }
  notifyFriends(session.uid);
}

function cleanup(session, notify = true) {
  leaveQueue(session.uid);
  if (session.room) {
    // hold the seat (match or lobby) for the 30s grace window
    session.room.memberDisconnected(session.uid);
    session.room = null;
  }
  if (session.uid && sessions.get(session.uid) === session) {
    sessions.delete(session.uid);
    if (notify) notifyFriends(session.uid);
  }
}

// ── message routing ─────────────────────────────────────────────────────────

const handlers = {
  register(session, msg) {
    const r = store.register(String(msg.username || ''), String(msg.password || ''));
    if (r.error) return session.send({ t: 'auth', ok: false, error: r.error });
    completeAuth(session, r.user);
  },

  login(session, msg) {
    const r = store.login(String(msg.username || ''), String(msg.password || ''));
    if (r.error) return session.send({ t: 'auth', ok: false, error: r.error });
    completeAuth(session, r.user);
  },

  resume(session, msg) {
    const user = store.verifyToken(msg.token);
    if (!user) return session.send({ t: 'auth', ok: false, error: 'Session expired' });
    completeAuth(session, user);
  },

  addFriend(session, msg) {
    const r = store.sendFriendRequest(session.uid, String(msg.username || ''));
    if (r.error) return session.send({ t: 'toast', kind: 'error', msg: r.error });
    session.send({ t: 'toast', kind: 'ok', msg: `Request sent to ${r.to.username}` });
    pushSocial(session.uid);
    pushSocial(r.to.uid);
  },

  acceptFriend(session, msg) {
    const r = store.acceptFriendRequest(session.uid, String(msg.uid || ''));
    if (r.error) return session.send({ t: 'toast', kind: 'error', msg: r.error });
    pushSocial(session.uid);
    pushSocial(r.to.uid);
  },

  declineFriend(session, msg) {
    store.declineFriendRequest(session.uid, String(msg.uid || ''));
    pushSocial(session.uid);
  },

  removeFriend(session, msg) {
    store.removeFriend(session.uid, String(msg.uid || ''));
    pushSocial(session.uid);
    pushSocial(String(msg.uid || ''));
  },

  invite(session, msg) {
    const target = sessionOf(String(msg.uid || ''));
    const me = store.getUser(session.uid);
    if (!me.friends.includes(msg.uid)) return session.send({ t: 'toast', kind: 'error', msg: 'Not your friend' });
    if (!target) return session.send({ t: 'toast', kind: 'error', msg: 'Friend is offline' });
    if (target.room || session.room) return session.send({ t: 'toast', kind: 'error', msg: 'Busy in a match' });
    session.invitesOut.set(target.uid, Date.now());
    target.send({ t: 'invited', from: { uid: session.uid, username: session.username } });
    session.send({ t: 'toast', kind: 'ok', msg: `Invite sent to ${target.username}` });
  },

  acceptInvite(session, msg) {
    const inviter = sessionOf(String(msg.uid || ''));
    if (!inviter || !inviter.invitesOut.has(session.uid) ||
        Date.now() - inviter.invitesOut.get(session.uid) > 120e3) {
      return session.send({ t: 'toast', kind: 'error', msg: 'Invite expired' });
    }
    if (inviter.room) return session.send({ t: 'toast', kind: 'error', msg: 'They joined another match' });
    inviter.invitesOut.delete(session.uid);
    leaveQueue(session.uid); leaveQueue(inviter.uid);
    session.queued = false; inviter.queued = false;
    attachRoom(session, createPrivateRoom(memberFor(inviter), memberFor(session)));
  },

  declineInvite(session, msg) {
    const inviter = sessionOf(String(msg.uid || ''));
    if (inviter) {
      inviter.invitesOut.delete(session.uid);
      inviter.send({ t: 'toast', kind: 'error', msg: `${session.username} declined` });
    }
  },

  queue(session) {
    if (session.room) return;
    session.queued = true;
    const room = joinQueue(memberFor(session));
    if (room) attachRoom(session, room);
    else notifyFriends(session.uid);
  },

  unqueue(session) {
    leaveQueue(session.uid);
    session.queued = false;
    session.send({ t: 'unqueued' });
    notifyFriends(session.uid);
  },

  practice(session) {
    if (session.room) return;
    attachRoom(session, createPracticeRoom(memberFor(session)));
  },

  selectChar(session, msg) {
    session.room?.selectChar(session.uid, String(msg.charId || ''));
  },

  ready(session, msg) {
    session.room?.setReady(session.uid, String(msg.charId || ''));
  },

  unready(session) {
    session.room?.setUnready(session.uid);
  },

  input(session, msg) {
    session.room?.handleInput(session.uid, msg);
  },

  pause(session) {
    session.room?.pause(session.uid);
  },

  unpause(session) {
    session.room?.unpause(session.uid);
  },

  leaveRoom(session) {
    leaveRoom(session);
  },
};

const UNAUTHED = new Set(['register', 'login', 'resume']);

wss.on('connection', (ws) => {
  const session = new Session(ws);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const fn = handlers[msg.t];
    if (!fn) return;
    if (!session.user && !UNAUTHED.has(msg.t)) return;
    if (process.env.SMASH_TRACE && msg.t !== 'input') {
      console.log('[trace]', session.username || '?', msg.t, msg.charId || '');
    }
    if (!session.takeToken(SENSITIVE.has(msg.t))) {
      if (session.drops > 2000) {
        // >2000 dropped messages within a 10s window is a genuine flood
        console.warn(`[ws] flood disconnect: ${session.username || 'unauthed'} (${msg.t})`);
        ws.terminate();
      }
      return;
    }
    try { fn(session, msg); } catch (e) {
      console.error(`[ws] handler ${msg.t} failed:`, e);
    }
  });
  ws.on('close', () => cleanup(session));
  ws.on('error', () => {});
});

setInterval(() => {
  // keepalive
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.ping();
  }
}, 25000);

server.listen(PORT, () => {
  console.log(`⚔  SMASH server live → http://localhost:${PORT}`);
});
