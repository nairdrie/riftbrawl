// ─────────────────────────────────────────────────────────────────────────────
// Persistence + auth. SQLite-backed user store (WAL, crash-safe writes),
// scrypt password hashing, HMAC-signed session tokens.
// Migrates automatically from the legacy data/db.json on first boot.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SMASH_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'smash.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    uid      TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passHash TEXT NOT NULL,
    salt     TEXT NOT NULL,
    wins     INTEGER NOT NULL DEFAULT 0,
    losses   INTEGER NOT NULL DEFAULT 0,
    created  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS friends (
    a TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    b TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    PRIMARY KEY (a, b)
  );
  CREATE TABLE IF NOT EXISTS requests (
    from_uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    to_uid   TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    PRIMARY KEY (from_uid, to_uid)
  );
`);

// ── one-time migration from the legacy JSON store ───────────────────────────

const legacyPath = path.join(DATA_DIR, 'db.json');
if (fs.existsSync(legacyPath) && db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (uid, username, passHash, salt, wins, losses, created) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertFriend = db.prepare('INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)');
    const insertReq = db.prepare('INSERT OR IGNORE INTO requests (from_uid, to_uid) VALUES (?, ?)');
    db.transaction(() => {
      if (legacy.secret) {
        db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('secret', legacy.secret);
      }
      for (const u of Object.values(legacy.users || {})) {
        insertUser.run(u.uid, u.username, u.passHash, u.salt, u.wins | 0, u.losses | 0, u.created || Date.now());
      }
      for (const u of Object.values(legacy.users || {})) {
        for (const f of u.friends || []) { insertFriend.run(u.uid, f); insertFriend.run(f, u.uid); }
        for (const r of u.requestsIn || []) insertReq.run(r, u.uid);
      }
    })();
    fs.renameSync(legacyPath, legacyPath + '.migrated');
    console.log('[store] migrated legacy db.json → smash.db');
  } catch (e) {
    console.error('[store] legacy migration failed (continuing fresh):', e.message);
  }
}

// ── token secret ────────────────────────────────────────────────────────────

let secret = db.prepare('SELECT value FROM meta WHERE key = ?').get('secret')?.value;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('secret', secret);
}

// ── prepared statements ─────────────────────────────────────────────────────

const q = {
  userByUid: db.prepare('SELECT * FROM users WHERE uid = ?'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  insertUser: db.prepare(
    'INSERT INTO users (uid, username, passHash, salt, wins, losses, created) VALUES (?, ?, ?, ?, 0, 0, ?)'),
  friendsOf: db.prepare('SELECT b FROM friends WHERE a = ?'),
  requestsTo: db.prepare('SELECT from_uid FROM requests WHERE to_uid = ?'),
  isFriend: db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?'),
  hasRequest: db.prepare('SELECT 1 FROM requests WHERE from_uid = ? AND to_uid = ?'),
  addRequest: db.prepare('INSERT OR IGNORE INTO requests (from_uid, to_uid) VALUES (?, ?)'),
  delRequest: db.prepare('DELETE FROM requests WHERE from_uid = ? AND to_uid = ?'),
  addFriend: db.prepare('INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)'),
  delFriend: db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)'),
  addWin: db.prepare('UPDATE users SET wins = wins + 1 WHERE uid = ?'),
  addLoss: db.prepare('UPDATE users SET losses = losses + 1 WHERE uid = ?'),
};

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    friends: q.friendsOf.all(row.uid).map(r => r.b),
    requestsIn: q.requestsTo.all(row.uid).map(r => r.from_uid),
  };
}

// ── users ───────────────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

export function findUserByName(username) {
  return hydrate(q.userByName.get(String(username)));
}

export function getUser(uid) {
  return hydrate(q.userByUid.get(uid));
}

export function register(username, password) {
  if (!USERNAME_RE.test(username)) return { error: 'Username must be 3-16 letters, numbers or _' };
  if (typeof password !== 'string' || password.length < 4) return { error: 'Password must be at least 4 characters' };
  if (q.userByName.get(username)) return { error: 'That tag is already taken' };
  const uid = crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  q.insertUser.run(uid, username, hashPassword(password, salt), salt, Date.now());
  return { user: getUser(uid) };
}

export function login(username, password) {
  const user = findUserByName(username);
  if (!user) return { error: 'Unknown fighter tag' };
  const hash = hashPassword(String(password), user.salt);
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passHash))) {
    return { error: 'Wrong password' };
  }
  return { user };
}

// ── tokens ──────────────────────────────────────────────────────────────────

function sign(payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(uid) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 30 * 24 * 3600e3 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const expect = sign(payload);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return getUser(data.uid);
  } catch {
    return null;
  }
}

// ── friends ─────────────────────────────────────────────────────────────────

export function sendFriendRequest(fromUid, toUsername) {
  const to = findUserByName(toUsername);
  if (!to) return { error: 'No fighter with that tag' };
  if (to.uid === fromUid) return { error: "You can't befriend yourself" };
  if (q.isFriend.get(fromUid, to.uid)) return { error: 'Already friends' };
  if (q.hasRequest.get(fromUid, to.uid)) return { error: 'Request already sent' };
  if (q.hasRequest.get(to.uid, fromUid)) {
    // they already asked us — auto-accept
    return acceptFriendRequest(fromUid, to.uid);
  }
  q.addRequest.run(fromUid, to.uid);
  return { to };
}

export function acceptFriendRequest(uid, fromUid) {
  const them = getUser(fromUid);
  if (!them || !q.hasRequest.get(fromUid, uid)) return { error: 'No such request' };
  db.transaction(() => {
    q.delRequest.run(fromUid, uid);
    q.addFriend.run(uid, fromUid);
    q.addFriend.run(fromUid, uid);
  })();
  return { to: them };
}

export function declineFriendRequest(uid, fromUid) {
  q.delRequest.run(fromUid, uid);
  return {};
}

export function removeFriend(uid, friendUid) {
  q.delFriend.run(uid, friendUid, friendUid, uid);
  return {};
}

export function recordResult(winnerUid, loserUid) {
  db.transaction(() => {
    q.addWin.run(winnerUid);
    q.addLoss.run(loserUid);
  })();
}
