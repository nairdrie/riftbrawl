// ─────────────────────────────────────────────────────────────────────────────
// Global character skins: palette overrides + per-part image overlays that every
// client loads and renders (looks are pure presentation — the deterministic sim
// never touches them, so a global reskin needs no netcode changes). Skins live in
// $SMASH_DATA_DIR/skins.json; uploaded part images live in $SMASH_DATA_DIR/skins/
// and are served read-only at /skins/<file>. Writes are gated to admin accounts
// (profiles.is_admin) — that check lives in server/index.js, next to auth.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { CHARACTERS } from '../shared/characters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SMASH_DATA_DIR || path.join(__dirname, '..', 'data');

export const SKINS_DIR = path.join(DATA_DIR, 'skins');
const SKINS_FILE = path.join(DATA_DIR, 'skins.json');

fs.mkdirSync(SKINS_DIR, { recursive: true });

// ── shared shape constants ──────────────────────────────────────────────────

export const CHAR_IDS = Object.keys(CHARACTERS);
export const COLOR_KEYS = ['primary', 'secondary', 'accent', 'glow', 'trail'];
export const SLOTS = ['root', 'head', 'torso', 'frontHand', 'backHand', 'weapon', 'frontFoot', 'backFoot'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const IMG_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/;
// only ever store paths we serve ourselves (no external URLs)
const SKIN_PATH_RE = /^\/skins\/[A-Za-z0-9._-]+$/;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;     // 4MB decoded — generous for dev art

const EXT_BY_MIME = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };

// ── document load / persist ─────────────────────────────────────────────────

let doc = { version: 1, updated: 0, skins: {} };
try {
  if (fs.existsSync(SKINS_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(SKINS_FILE, 'utf8'));
    doc = sanitizeDoc(parsed);
  }
} catch (e) {
  console.error('[skins] failed to load skins.json (starting empty):', e.message);
}

export function getDoc() {
  return doc;
}

function persist() {
  const tmp = SKINS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, SKINS_FILE);
}

// ── validation / sanitization ───────────────────────────────────────────────

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeSlot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.img !== 'string' || !SKIN_PATH_RE.test(raw.img)) return null;  // must reference an uploaded file
  return {
    img: raw.img,
    x: clamp(raw.x, -400, 400, 0),
    y: clamp(raw.y, -400, 400, 0),
    scale: clamp(raw.scale, 0.05, 20, 1),
    rot: clamp(raw.rot, -360, 360, 0),          // degrees
    opacity: clamp(raw.opacity, 0, 1, 1),
    flip: !!raw.flip,
    hideBase: !!raw.hideBase,
  };
}

function sanitizeCharSkin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  // colors
  if (raw.colors && typeof raw.colors === 'object') {
    const colors = {};
    for (const k of COLOR_KEYS) {
      const v = raw.colors[k];
      if (typeof v === 'string' && HEX_RE.test(v)) colors[k] = v.toLowerCase();
    }
    if (Object.keys(colors).length) out.colors = colors;
  }
  // slots
  if (raw.slots && typeof raw.slots === 'object') {
    const slots = {};
    for (const name of SLOTS) {
      const s = sanitizeSlot(raw.slots[name]);
      if (s) slots[name] = s;
    }
    if (Object.keys(slots).length) out.slots = slots;
  }
  return (out.colors || out.slots) ? out : null;
}

function sanitizeDoc(raw) {
  const skins = {};
  const src = raw && raw.skins && typeof raw.skins === 'object' ? raw.skins : {};
  for (const id of CHAR_IDS) {
    const cleaned = sanitizeCharSkin(src[id]);
    if (cleaned) skins[id] = cleaned;
  }
  return { version: 1, updated: Number(raw?.updated) || 0, skins };
}

// Save a fully-replaced skins document (already validated here). Returns the
// canonical stored doc.
export function saveDoc(rawSkinsMap) {
  doc = sanitizeDoc({ skins: rawSkinsMap, updated: Date.now() });
  doc.updated = Date.now();
  persist();
  garbageCollectImages();
  return doc;
}

// ── image upload ────────────────────────────────────────────────────────────

// Decodes a validated image data URL, writes it under a content-hashed name, and
// returns the public path. Throws on bad input.
export function saveImage(charId, slot, dataUrl) {
  if (!CHAR_IDS.includes(charId)) throw new Error('unknown character');
  if (!SLOTS.includes(slot)) throw new Error('unknown slot');
  if (typeof dataUrl !== 'string') throw new Error('missing image');
  const m = IMG_RE.exec(dataUrl);
  if (!m) throw new Error('not a supported image');
  const ext = EXT_BY_MIME[m[1]] || 'png';
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new Error('empty image');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large (max 4MB)');
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const file = `${charId}-${slot}-${hash}.${ext}`;
  fs.writeFileSync(path.join(SKINS_DIR, file), buf);
  return `/skins/${file}`;
}

// Remove uploaded images no longer referenced by any saved skin.
function garbageCollectImages() {
  try {
    const referenced = new Set();
    for (const id of Object.keys(doc.skins)) {
      const slots = doc.skins[id].slots || {};
      for (const name of Object.keys(slots)) {
        const p = slots[name].img;
        if (p) referenced.add(path.basename(p));
      }
    }
    for (const file of fs.readdirSync(SKINS_DIR)) {
      if (!referenced.has(file)) {
        try { fs.unlinkSync(path.join(SKINS_DIR, file)); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.error('[skins] image GC failed:', e.message);
  }
}
