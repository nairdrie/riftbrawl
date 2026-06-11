// ─────────────────────────────────────────────────────────────────────────────
// Persistence + auth. JSON-file backed user store, scrypt password hashing,
// HMAC-signed session tokens. Zero native deps so it runs anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SMASH_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

let db = { secret: crypto.randomBytes(32).toString('hex'), users: {} };

try {
  if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
} catch (e) {
  console.error('[store] failed to load db, starting fresh:', e.message);
}

let saveTimer = null;
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(db));
    } catch (e) {
      console.error('[store] save failed:', e.message);
    }
  }, 250);
}

// ── users ───────────────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

export function findUserByName(username) {
  const lower = String(username).toLowerCase();
  return Object.values(db.users).find(u => u.username.toLowerCase() === lower) || null;
}

export function getUser(uid) {
  return db.users[uid] || null;
}

export function register(username, password) {
  if (!USERNAME_RE.test(username)) return { error: 'Username must be 3-16 letters, numbers or _' };
  if (typeof password !== 'string' || password.length < 4) return { error: 'Password must be at least 4 characters' };
  if (findUserByName(username)) return { error: 'That tag is already taken' };
  const uid = crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[uid] = {
    uid, username, salt,
    passHash: hashPassword(password, salt),
    friends: [], requestsIn: [],
    wins: 0, losses: 0,
    created: Date.now(),
  };
  save();
  return { user: db.users[uid] };
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
  return crypto.createHmac('sha256', db.secret).update(payload).digest('base64url');
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
  const from = getUser(fromUid);
  const to = findUserByName(toUsername);
  if (!to) return { error: 'No fighter with that tag' };
  if (to.uid === fromUid) return { error: "You can't befriend yourself" };
  if (from.friends.includes(to.uid)) return { error: 'Already friends' };
  if (to.requestsIn.includes(fromUid)) return { error: 'Request already sent' };
  if (from.requestsIn.includes(to.uid)) {
    // they already asked us — auto-accept
    return acceptFriendRequest(fromUid, to.uid);
  }
  to.requestsIn.push(fromUid);
  save();
  return { to };
}

export function acceptFriendRequest(uid, fromUid) {
  const me = getUser(uid);
  const them = getUser(fromUid);
  if (!them || !me.requestsIn.includes(fromUid)) return { error: 'No such request' };
  me.requestsIn = me.requestsIn.filter(id => id !== fromUid);
  if (!me.friends.includes(fromUid)) me.friends.push(fromUid);
  if (!them.friends.includes(uid)) them.friends.push(uid);
  save();
  return { to: them };
}

export function declineFriendRequest(uid, fromUid) {
  const me = getUser(uid);
  me.requestsIn = me.requestsIn.filter(id => id !== fromUid);
  save();
  return {};
}

export function removeFriend(uid, friendUid) {
  const me = getUser(uid);
  const them = getUser(friendUid);
  me.friends = me.friends.filter(id => id !== friendUid);
  if (them) them.friends = them.friends.filter(id => id !== uid);
  save();
  return {};
}

export function recordResult(winnerUid, loserUid) {
  const w = getUser(winnerUid);
  const l = getUser(loserUid);
  if (w) w.wins++;
  if (l) l.losses++;
  save();
}
