// ─────────────────────────────────────────────────────────────────────────────
// Skin Forge — the /design editor. Pick a legend, repaint its palette, and bind
// uploaded images to body-part slots (which ride the existing animation). Saves a
// global skin document that every client loads, so reskins show up in char-select
// and in live matches. Gated to admin Archway accounts (profiles.is_admin), proven
// with the same Supabase access token the game uses — enforced server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { ACT } from '/shared/constants.js';
import { CHARACTERS, CHARACTER_LIST } from '/shared/characters.js';
import { drawFighter, drawPortrait } from '/js/fighters.js';
import { initSupa, signIn, currentSession } from '/js/supa.js';
import { openPaint } from '/design/paint.js';
import {
  loadSkins, getSkinsDoc, setSkinsDoc, setPreviewSkin,
  COLOR_KEYS, SLOT_DEFS, CHAR_SLOTS,
} from '/js/skins.js';

const $ = (s) => document.querySelector(s);
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

let supaReady = false;
let doc = { version: 1, updated: 0, skins: {} };
let work = {};                          // working copy of doc.skins (raw, editable)
let cur = CHARACTER_LIST[0];
let states = [];
let stateIdx = 0;
let facing = 1;
let frozen = false;
let cyclePlay = false;
let clock = 0, lastTs = 0, cycleAt = 0;
const rosterCanvases = new Map();
const openSlots = new Set();

// ── auth gate (Supabase / "Sign in with Archway") ───────────────────────────

// the live Supabase access token — the SDK refreshes it for us, so fetch it
// fresh per request rather than caching it
async function token() {
  try { return (await currentSession())?.access_token || ''; }
  catch { return ''; }
}
async function authHeader() { const t = await token(); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function jsonAuth() { return { 'Content-Type': 'application/json', ...(await authHeader()) }; }

async function checkMe() {
  try {
    const r = await fetch('/api/design/me', { headers: await authHeader() });
    return await r.json();
  } catch { return { authed: false }; }
}

function showGate(info) {
  $('#gate').hidden = false;
  $('#app').hidden = true;
  const msg = $('#gate-msg');
  if (info && info.authed && !info.isAdmin) {
    msg.textContent = `Signed in as ${info.username}, but that account isn't an admin.`;
    msg.classList.remove('ok');
  }
}

$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supaReady) { $('#gate-msg').textContent = 'Connecting to Archway…'; return; }
  const email = $('#gate-email').value.trim();
  const password = $('#gate-pass').value;
  if (!email || !password) return;
  const btn = $('#gate-submit'); btn.disabled = true;
  const msg = $('#gate-msg'); msg.textContent = '';
  try {
    const r = await signIn(email, password);
    if (r.error) { msg.textContent = r.error; return; }
    const me = await checkMe();
    if (me.authed && me.isAdmin) await enterApp(me.username);
    else showGate(me);
  } catch {
    msg.textContent = 'Sign-in failed';
  } finally {
    btn.disabled = false;
  }
});

// ── app ────────────────────────────────────────────────────────────────────

async function enterApp(username) {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('#who').textContent = username ? `admin · ${username}` : '';
  await loadSkins();
  doc = getSkinsDoc();
  work = clone(doc.skins) || {};
  applyAllPreviews();
  buildRoster();
  selectChar(cur);
  requestAnimationFrame(loop);
}

function applyAllPreviews() {
  for (const c of CHARACTER_LIST) setPreviewSkin(c, work[c] || null);
}
function applyPreview(c) { setPreviewSkin(c, work[c] || null); }

function ensureChar(c) { return (work[c] = work[c] || {}); }

function prunedSkins() {
  const out = {};
  for (const c of CHARACTER_LIST) {
    const s = work[c];
    const hasColors = s && s.colors && Object.keys(s.colors).length;
    const hasSlots = s && s.slots && Object.keys(s.slots).length;
    if (hasColors || hasSlots) out[c] = s;
  }
  return out;
}

function refreshDirty() {
  const dirty = JSON.stringify(prunedSkins()) !== JSON.stringify(doc.skins);
  $('#btn-save').disabled = !dirty;
  $('#dirty-note').hidden = !dirty;
  return dirty;
}

// ── roster ───────────────────────────────────────────────────────────────────

function buildRoster() {
  const nav = $('#roster');
  nav.innerHTML = '';
  rosterCanvases.clear();
  for (const id of CHARACTER_LIST) {
    const ch = CHARACTERS[id];
    const card = document.createElement('div');
    card.className = 'card' + (id === cur ? ' active' : '');
    card.dataset.id = id;
    const cv = document.createElement('canvas');
    cv.width = 108; cv.height = 132;
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = ch.name;
    const dot = document.createElement('div'); dot.className = 'dot';
    card.append(cv, nm, dot);
    card.addEventListener('click', () => selectChar(id));
    nav.appendChild(card);
    rosterCanvases.set(id, cv);
  }
}

function refreshRosterActive() {
  for (const card of $('#roster').children) {
    const id = card.dataset.id;
    card.classList.toggle('active', id === cur);
    const has = work[id] && ((work[id].colors && Object.keys(work[id].colors).length) || (work[id].slots && Object.keys(work[id].slots).length));
    card.querySelector('.dot').textContent = has ? '✦ skinned' : '';
  }
}

// ── character selection ────────────────────────────────────────────────────

function selectChar(id) {
  cur = id;
  states = makeStates(CHARACTERS[cur]);
  if (stateIdx >= states.length) stateIdx = 0;
  $('#panel-title').textContent = `${CHARACTERS[cur].name} — ${CHARACTERS[cur].title}`;
  buildStateSelect();
  buildPalette();
  buildSlots();
  refreshRosterActive();
}

// ── palette editor ───────────────────────────────────────────────────────────

function buildPalette() {
  const wrap = $('#palette');
  wrap.innerHTML = '';
  const defaults = CHARACTERS[cur].colors;
  for (const key of COLOR_KEYS) {
    const override = work[cur]?.colors?.[key];
    const value = override || defaults[key];
    const row = document.createElement('div'); row.className = 'color-row';

    const swatch = document.createElement('input');
    swatch.type = 'color'; swatch.className = 'swatch'; swatch.value = value;

    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = key;
    const hex = document.createElement('span'); hex.className = 'hex'; hex.textContent = value;
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'reset'; reset.title = 'Reset to default';
    reset.textContent = '↺'; reset.hidden = !override;

    swatch.addEventListener('input', () => {
      const c = ensureChar(cur); c.colors = c.colors || {};
      c.colors[key] = swatch.value;
      hex.textContent = swatch.value;
      reset.hidden = false;
      applyPreview(cur); refreshDirty(); refreshRosterActive();
    });
    reset.addEventListener('click', () => {
      if (work[cur]?.colors) { delete work[cur].colors[key]; if (!Object.keys(work[cur].colors).length) delete work[cur].colors; }
      swatch.value = defaults[key]; hex.textContent = defaults[key]; reset.hidden = true;
      applyPreview(cur); refreshDirty(); refreshRosterActive();
    });

    row.append(swatch, lbl, hex, reset);
    wrap.appendChild(row);
  }
}

// ── slot (part image) editor ───────────────────────────────────────────────

function buildSlots() {
  const wrap = $('#slots');
  wrap.innerHTML = '';
  const slots = CHAR_SLOTS[cur] || [];
  for (const id of slots) {
    const def = SLOT_DEFS.find(d => d.id === id);
    const data = work[cur]?.slots?.[id];
    const key = cur + ':' + id;
    if (data && !openSlots.has(key)) openSlots.add(key);

    const card = document.createElement('div');
    card.className = 'slot' + (openSlots.has(key) ? ' open' : '');

    // header
    const head = document.createElement('div'); head.className = 'slot-head';
    const nm = document.createElement('div'); nm.className = 'nm';
    nm.innerHTML = `${def.label}${def.hint ? `<small>${def.hint}</small>` : ''}`;
    const badge = document.createElement('span'); badge.className = 'badge';
    badge.textContent = data ? (data.hideBase && def.hide ? '● replacing' : '● overlay') : '';
    head.append(nm, badge);
    head.addEventListener('click', () => {
      if (openSlots.has(key)) openSlots.delete(key); else openSlots.add(key);
      card.classList.toggle('open');
    });

    // body
    const body = document.createElement('div'); body.className = 'slot-body';

    const thumb = document.createElement('div'); thumb.className = 'slot-thumb';
    if (data?.img) {
      const img = document.createElement('img'); img.src = data.img; thumb.appendChild(img);
    } else {
      thumb.textContent = 'Click or drop a PNG/WebP';
    }
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.style.display = 'none';
    thumb.addEventListener('click', () => file.click());
    file.addEventListener('change', () => file.files[0] && uploadFile(id, file.files[0]));
    thumb.addEventListener('dragover', (e) => { e.preventDefault(); thumb.classList.add('drag'); });
    thumb.addEventListener('dragleave', () => thumb.classList.remove('drag'));
    thumb.addEventListener('drop', (e) => {
      e.preventDefault(); thumb.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (f) uploadFile(id, f);
    });
    // upload + paint actions
    const actions = document.createElement('div'); actions.className = 'slot-actions';
    const uploadBtn = document.createElement('button'); uploadBtn.className = 'btn ghost';
    uploadBtn.textContent = data?.img ? 'Replace image' : 'Upload image';
    uploadBtn.addEventListener('click', () => file.click());
    const paintBtn = document.createElement('button'); paintBtn.className = 'btn ghost';
    paintBtn.textContent = data?.img ? '✎ Edit in paint' : '✎ Paint';
    paintBtn.addEventListener('click', () => openPaint({
      title: `${CHARACTERS[cur].name} · ${def.label}`,
      startUrl: data?.img || null,
      color: CHARACTERS[cur].colors.primary,
      onApply: (dataUrl) => uploadDataUrl(id, dataUrl),
    }));
    actions.append(uploadBtn, paintBtn);
    body.append(thumb, file, actions);

    if (data) {
      body.append(
        rangeRow('X', -120, 120, 1, data.x ?? 0, v => v.toFixed(0), v => setSlot(id, 'x', v)),
        rangeRow('Y', -120, 120, 1, data.y ?? 0, v => v.toFixed(0), v => setSlot(id, 'y', v)),
        rangeRow('Scale', 0.1, 6, 0.05, data.scale ?? 1, v => v.toFixed(2), v => setSlot(id, 'scale', v)),
        rangeRow('Rotate', -180, 180, 1, data.rot ?? 0, v => v.toFixed(0) + '°', v => setSlot(id, 'rot', v)),
        rangeRow('Opacity', 0, 1, 0.05, data.opacity ?? 1, v => v.toFixed(2), v => setSlot(id, 'opacity', v)),
      );

      const foot = document.createElement('div'); foot.className = 'slot-foot';
      foot.appendChild(checkbox('Flip', !!data.flip, v => setSlot(id, 'flip', v)));
      if (def.hide) foot.appendChild(checkbox('Replace base art', !!data.hideBase, v => setSlot(id, 'hideBase', v)));
      const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = 'Remove';
      rm.addEventListener('click', () => removeSlot(id));
      foot.appendChild(rm);
      body.appendChild(foot);
    }

    card.append(head, body);
    wrap.appendChild(card);
  }
}

function rangeRow(label, min, max, step, value, fmt, oninput) {
  const row = document.createElement('div'); row.className = 'ctrl';
  const lbl = document.createElement('label'); lbl.textContent = label;
  const range = document.createElement('input');
  range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = value;
  const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(Number(value));
  range.addEventListener('input', () => {
    const v = Number(range.value);
    val.textContent = fmt(v);
    oninput(v);
  });
  row.append(lbl, range, val);
  return row;
}

function checkbox(label, checked, onchange) {
  const wrap = document.createElement('label');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked;
  cb.addEventListener('change', () => onchange(cb.checked));
  wrap.append(cb, document.createTextNode(label));
  return wrap;
}

function setSlot(id, field, value) {
  const sc = ensureChar(cur); sc.slots = sc.slots || {}; sc.slots[id] = sc.slots[id] || {};
  sc.slots[id][field] = value;
  applyPreview(cur); refreshDirty();
  if (field === 'hideBase') buildSlots();      // the overlay/replacing badge depends on this
}

function removeSlot(id) {
  if (work[cur]?.slots) {
    delete work[cur].slots[id];
    if (!Object.keys(work[cur].slots).length) delete work[cur].slots;
  }
  openSlots.delete(cur + ':' + id);
  applyPreview(cur); refreshDirty(); refreshRosterActive(); buildSlots();
}

async function uploadFile(slot, fileObj) {
  if (!fileObj.type.startsWith('image/')) return toast('That file is not an image', 'error');
  let dataUrl;
  try { dataUrl = await readDataURL(fileObj); } catch { return toast('Could not read file', 'error'); }
  await uploadDataUrl(slot, dataUrl);
}

// store a PNG/image data URL (from a file upload or the paint canvas) and bind it
// to the slot, preserving any existing transform.
async function uploadDataUrl(slot, dataUrl) {
  try {
    const r = await fetch('/api/design/upload', {
      method: 'POST', headers: await jsonAuth(),
      body: JSON.stringify({ charId: cur, slot, dataUrl }),
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Upload failed', 'error');
    const sc = ensureChar(cur); sc.slots = sc.slots || {};
    const prev = sc.slots[slot] || {};
    sc.slots[slot] = {
      img: j.url,
      x: prev.x ?? 0, y: prev.y ?? 0, scale: prev.scale ?? 1, rot: prev.rot ?? 0,
      opacity: prev.opacity ?? 1, flip: !!prev.flip, hideBase: !!prev.hideBase,
    };
    openSlots.add(cur + ':' + slot);
    applyPreview(cur); refreshDirty(); refreshRosterActive(); buildSlots();
    toast('Art bound to ' + slot, 'ok');
  } catch {
    toast('Upload failed', 'error');
  }
}

function readDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// ── save / revert ────────────────────────────────────────────────────────────

$('#btn-save').addEventListener('click', async () => {
  const btn = $('#btn-save'); btn.disabled = true;
  try {
    const r = await fetch('/api/design/skins', {
      method: 'POST', headers: await jsonAuth(),
      body: JSON.stringify({ skins: prunedSkins() }),
    });
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'Save failed', 'error'); refreshDirty(); return; }
    doc = j.doc;
    setSkinsDoc(doc);
    work = clone(doc.skins) || {};
    applyAllPreviews();
    buildPalette(); buildSlots(); refreshRosterActive(); refreshDirty();
    toast('Saved — live for all players', 'ok');
  } catch {
    toast('Save failed', 'error'); refreshDirty();
  }
});

$('#btn-revert').addEventListener('click', () => {
  work[cur] = clone(doc.skins?.[cur]) || {};
  for (const k of [...openSlots]) if (k.startsWith(cur + ':')) openSlots.delete(k);
  applyPreview(cur); buildPalette(); buildSlots(); refreshRosterActive(); refreshDirty();
  toast('Reverted ' + CHARACTERS[cur].name, 'ok');
});

// ── preview ──────────────────────────────────────────────────────────────────

function buildStateSelect() {
  const sel = $('#state-select');
  sel.innerHTML = '';
  states.forEach(([label], i) => {
    const o = document.createElement('option'); o.value = String(i); o.textContent = label;
    sel.appendChild(o);
  });
  sel.value = String(stateIdx);
}
$('#state-select').addEventListener('change', (e) => { stateIdx = Number(e.target.value); });
$('#btn-facing').addEventListener('click', () => { facing = -facing; });
$('#btn-freeze').addEventListener('click', (e) => { frozen = !frozen; e.target.classList.toggle('ghost', !frozen); });
$('#chk-cycle').addEventListener('change', (e) => { cyclePlay = e.target.checked; cycleAt = clock; });

function fakePlayer(char, over) {
  return {
    charId: char.id, idx: 0, uid: `design:${char.id}`, facing, grounded: true,
    vx: 0, vy: 0, percent: 0, act: ACT.FREE, actFrame: 0, moveId: '',
    stun: 0, hitlag: 0, shield: 60, invuln: 0, jumpsLeft: 1, exhausted: false,
    fastFalling: false, charge: 0, x: 0, y: 0, stacks: 3, lastIn: { b: 0, x: 0, y: 0 },
    ...over,
  };
}

function makeStates(char) {
  const af = (total) => 1 + Math.floor((clock * 38) % Math.max(1, total - 1));   // play the whole move
  const mv = (id) => char.moves[id];
  const sp = (m) => char.specials[m];
  const tilts = ['jab', 'ftilt', 'utilt', 'dtilt'];
  const airs = ['nair', 'fair', 'bair', 'uair'];
  return [
    ['Idle', () => ({})],
    ['Run', () => ({ vx: char.runSpeed, x: clock * char.runSpeed * 22 })],
    ['Crouch', () => ({ lastIn: { b: 0, x: 0, y: 1 } })],
    ['Rise', () => ({ grounded: false, vy: -11 })],
    ['Fall', () => ({ grounded: false, vy: 9 })],
    ['Shield', () => ({ act: ACT.SHIELD })],
    ['Ledge', () => ({ act: ACT.LEDGE, grounded: false })],
    ['Hitstun', () => ({ act: ACT.HITSTUN, vx: 2, stun: 20 })],
    ['Dizzy', () => ({ act: ACT.SHIELDBREAK })],
    ['Grab', () => ({ act: ACT.GRAB })],
    ...tilts.map(id => [id.toUpperCase(), () => ({ act: ACT.ATTACK, moveId: id, actFrame: af(mv(id).total) })]),
    ...airs.map(id => [id.toUpperCase(), () => ({ act: ACT.ATTACK, moveId: id, actFrame: af(mv(id).total), grounded: false, vy: -2 })]),
    ['DAIR', () => ({ act: ACT.ATTACK, moveId: 'dair', actFrame: af(mv('dair').total), grounded: false, vy: 6 })],
    ['NB (charge)', () => ({ act: ACT.ATTACK, moveId: 'nb', actFrame: Math.max(1, (sp('nb').fire ?? 10) - 1), charge: 52 })],
    ['SB', () => ({ act: ACT.ATTACK, moveId: 'sb', actFrame: af(sp('sb').total) })],
    ['UB', () => ({ act: ACT.ATTACK, moveId: 'ub', actFrame: af(sp('ub').total), grounded: false, vy: -12 })],
    ['DB', () => ({ act: ACT.ATTACK, moveId: 'db', actFrame: af(sp('db').total) })],
  ];
}

function loop(ts) {
  const dt = lastTs ? (ts - lastTs) / 1000 : 0;
  lastTs = ts;
  if (!frozen) clock += dt;
  if (cyclePlay && clock - cycleAt > 1.6) {
    cycleAt = clock;
    stateIdx = (stateIdx + 1) % states.length;
    $('#state-select').value = String(stateIdx);
  }
  render();
  for (const [id, cv] of rosterCanvases) drawPortrait(cv, id, clock, id === cur ? 1 : 0);
  requestAnimationFrame(loop);
}

function render() {
  const cv = $('#preview');
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const baseY = h * 0.8;
  ctx.strokeStyle = '#2a3160'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, baseY + 0.5); ctx.lineTo(w - 40, baseY + 0.5); ctx.stroke();

  const char = CHARACTERS[cur];
  const entry = states[stateIdx] || states[0];
  const p = fakePlayer(char, entry[1]());
  ctx.save();
  ctx.translate(w / 2, baseY);
  ctx.scale(2.4, 2.4);
  drawFighter(ctx, p, clock);
  ctx.restore();
}

// ── toasts ─────────────────────────────────────────────────────────────────

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2800);
}

// ── boot ───────────────────────────────────────────────────────────────────

(async function init() {
  try {
    await initSupa();
    supaReady = true;
  } catch (e) {
    showGate(null);
    $('#gate-msg').textContent = e.message || 'Archway sign-in is unavailable right now.';
    return;
  }
  const info = await checkMe();
  if (info.authed && info.isAdmin) await enterApp(info.username);
  else showGate(info);
})();
