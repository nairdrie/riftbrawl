// Dev-only CHARACTER DESIGNER. Open /dev/tuner.html.
// • Open an existing character to tweak its skeleton/pose, or build a new one on
//   the REED base and skin body parts with images.
// • EDIT mode: static preview with sliders (skeleton, pose, part images), a
//   reference overlay and a bones underlay for aligning art.
// • PLAY mode: runs the real shared sim with the real game controls, so you see
//   your rig walk / jump / attack / shield exactly as in a match.
// Edits mutate a working spec the engine reads live; production rigs untouched.

import { createGameState, step } from '/shared/sim.js';
import { ACT, PHASE, MS_PER_TICK } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { drawFighter, getDataSpec, setRig, buildSpecRig } from '/js/fighters.js';
import { reedSpec } from '/js/rigs/data/reed.rig.js';
import { Renderer } from '/js/renderer.js';
import { sampleInput } from '/js/input.js';

const $ = (id) => document.getElementById(id);
const c = $('c');
const PANEL = 340;
const cloneOf = (o) => JSON.parse(JSON.stringify(o));

// ── state ───────────────────────────────────────────────────────────────────
let selId = 'reed';
let workingSpec = null;     // editable data spec (null for bespoke legends)
let editable = false;
let mode = 'edit';          // 'edit' | 'play'
let renderer = null, sim = null;
const view = { zoom: 3.4 };
const refState = { op: 0.5, scale: 1, x: 0, y: 0 };
let refImg = null;

// ── canvas sizing (fills the area left of the panel) ────────────────────────
function layout() {
  const w = window.innerWidth - PANEL, h = window.innerHeight;
  c.style.width = w + 'px'; c.style.height = h + 'px';
  if (mode === 'play' && renderer) renderer.resize();
  else { c.width = w * devicePixelRatio; c.height = h * devicePixelRatio; }
}
window.addEventListener('resize', layout);

// ── labelled-range helper ───────────────────────────────────────────────────
function mkRange(host, label, min, max, step, val, onInput) {
  const row = document.createElement('div'); row.className = 'row';
  const l = document.createElement('label'); l.textContent = label;
  const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
  const v = document.createElement('span'); v.className = 'val';
  const fmt = (x) => (+x).toFixed(step < 1 ? 2 : 0);
  v.textContent = fmt(val);
  r.addEventListener('input', () => { v.textContent = fmt(r.value); onInput(+r.value); });
  row.append(l, r, v); host.appendChild(row);
  return { set: (x) => { r.value = x; v.textContent = fmt(x); } };
}

// path get/set on the working spec
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { if (!o) return; const ks = p.split('.'); const last = ks.pop(); let t = o; for (const k of ks) { t[k] = t[k] || {}; t = t[k]; } t[last] = v; }

// ── spec-bound slider groups ────────────────────────────────────────────────
const SKEL = [
  ['Hip Y', 'skel.hipY', -60, -20, 1], ['Shoulder Y', 'skel.shoulderY', -98, -50, 1],
  ['Head Y', 'skel.headY', -118, -64, 1], ['Head R', 'skel.headR', 5, 22, 0.5],
  ['Thigh', 'skel.thigh', 12, 34, 0.5], ['Shin', 'skel.shin', 12, 34, 0.5],
  ['Upper arm', 'skel.upper', 10, 30, 0.5], ['Forearm', 'skel.fore', 10, 30, 0.5],
  ['Stance', 'skel.stance', 4, 24, 0.5], ['Shoulder X', 'skel.shoulderX', 2, 18, 0.5],
  ['Hip W', 'skel.hipW', 2, 16, 0.5],
];
const POSE = [
  ['Depth', 'depth', 0, 1, 0.01], ['Settle', 'idleSettle', -4, 16, 0.5],
  ['Lead foot X', 'idlePose.leadFoot', -8, 30, 0.5], ['Rear foot X', 'idlePose.rearFoot', -30, 6, 0.5],
  ['Rear heel ↑', 'idlePose.rearLift', -4, 12, 0.5], ['Lean fwd', 'idlePose.leanAdd', -0.5, 0.5, 0.01],
  ['Shoulder ∠', 'idlePose.shoulderAngle', -0.7, 0.7, 0.02],
  ['Hand X', 'idlePose.handX', -10, 40, 0.5], ['Hand Y', 'idlePose.handY', -34, 30, 0.5],
  ['Blade ∠', 'idlePose.wrist', -3.14, 3.14, 0.02],
  ['Off-hand X', 'idlePose.backHandX', -22, 26, 0.5], ['Off-hand Y', 'idlePose.backHandY', -22, 30, 0.5],
];
const WEAPON = [['Length', 'weapon.length', 16, 92, 1], ['Grip', 'weapon.grip', 0, 22, 0.5], ['Width', 'weapon.width', 2, 16, 0.5]];

const ctl = {};
function buildGroup(defs, host) {
  for (const [label, path, mn, mx, st] of defs)
    ctl[path] = mkRange(host, label, mn, mx, st, getPath(reedSpec, path) ?? 0, (v) => setPath(workingSpec, path, v));
}
buildGroup(SKEL, $('skelRows'));
buildGroup(POSE, $('poseRows'));
buildGroup(WEAPON, $('wpRows'));

mkRange($('zoomRow'), 'Zoom', 0.5, 9, 0.1, view.zoom, (x) => view.zoom = x);
const REF = [['Opacity', 'op', 0, 1, 0.02, 0.5], ['Scale', 'scale', 0.1, 5, 0.01, 1], ['Offset X', 'x', -400, 400, 1, 0], ['Offset Y', 'y', -500, 300, 1, 0]];
for (const [label, key, mn, mx, st, def] of REF) mkRange($('refRows'), label, mn, mx, st, def, (v) => refState[key] = v);

// ── body-part image skinning ────────────────────────────────────────────────
const PARTS = ['head', 'torso', 'upperArm', 'foreArm', 'thigh', 'shin', 'hand', 'foot', 'weapon'];
const partSel = $('part');
for (const p of PARTS) { const o = document.createElement('option'); o.value = p; o.textContent = p; partSel.appendChild(o); }
partSel.value = 'torso';
const PT = [['Scale', 'scale', 0.05, 6, 0.01], ['Offset X', 'ox', -80, 80, 0.5], ['Offset Y', 'oy', -80, 80, 0.5], ['Rotate', 'rot', -3.14, 3.14, 0.02]];
const ptCtl = {};
for (const [label, key, mn, mx, st] of PT)
  ptCtl[key] = mkRange($('partRows'), label, mn, mx, st, key === 'scale' ? 1 : 0, (v) => { const cf = workingSpec?.images?.[partSel.value]; if (cf) cf[key] = v; });
function syncPartUI() {
  const cf = workingSpec?.images?.[partSel.value];
  $('partState').textContent = cf ? 'image ✓' : 'vector';
  $('partState').className = 'tag' + (cf ? ' on' : '');
  ptCtl.scale.set(cf?.scale ?? 1); ptCtl.ox.set(cf?.ox ?? 0); ptCtl.oy.set(cf?.oy ?? 0); ptCtl.rot.set(cf?.rot ?? 0);
}
partSel.addEventListener('change', syncPartUI);
$('img').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f || !workingSpec) return;
  workingSpec.images = workingSpec.images || {};
  workingSpec.images[partSel.value] = { src: URL.createObjectURL(f), scale: 1, ox: 0, oy: 0, rot: 0 };
  syncPartUI(); e.target.value = '';
});
$('clearPart').addEventListener('click', () => { if (workingSpec?.images) delete workingSpec.images[partSel.value]; syncPartUI(); });
$('ref').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => refImg = img; img.src = URL.createObjectURL(f); });

// ── legs mode + weapon type / dual wield ────────────────────────────────────
$('legs').addEventListener('change', () => { if (!editable) return; workingSpec.legs = $('legs').value; });
$('wType').addEventListener('change', () => { if (!editable) return; workingSpec.weapon = workingSpec.weapon || {}; workingSpec.weapon.type = $('wType').value; });
$('dual').addEventListener('change', () => { if (!editable) return; workingSpec.dualWield = $('dual').checked; });
function syncBodyUI() {
  $('legs').value = workingSpec?.legs || 'two';
  $('wType').value = workingSpec?.weapon?.type || 'none';
  $('dual').checked = !!workingSpec?.dualWield;
}

// ── animation poses (per-state / per-attack keyframes) ──────────────────────
const ATTACKS = ['jab', 'ftilt', 'utilt', 'dtilt', 'nair', 'fair', 'bair', 'uair', 'dair', 'nb', 'sb', 'ub', 'db'];
const A_STATES = ['idle', 'run', 'crouch', 'air', 'jumpsquat', 'shield', 'shieldStun', 'dizzy', 'roll', 'ledge', 'hitReel', 'grab', 'grabbed', ...ATTACKS];
const isAttack = (k) => ATTACKS.includes(k);
const aState = $('aState'), aPhase = $('aPhase');
for (const s of A_STATES) { const o = document.createElement('option'); o.value = s; o.textContent = s; aState.appendChild(o); }
aState.value = 'idle';
const APOSE = [
  ['Hand X', 'handX', -20, 46, 0.5], ['Hand Y', 'handY', -60, 40, 0.5], ['Blade ∠', 'wrist', -3.14, 3.14, 0.02],
  ['Off-hand X', 'backHandX', -26, 30, 0.5], ['Off-hand Y', 'backHandY', -40, 40, 0.5],
  ['Lead foot X', 'leadFootX', -26, 30, 0.5], ['Lead foot Y', 'leadFootY', -30, 20, 0.5],
  ['Rear foot X', 'rearFootX', -34, 20, 0.5], ['Rear foot Y', 'rearFootY', -30, 20, 0.5],
  ['Lean', 'lean', -0.9, 0.9, 0.02], ['Lunge', 'lunge', -16, 16, 0.5], ['Shoulder ∠', 'shoulderAngle', -0.7, 0.7, 0.02],
];
const aCtl = {};
for (const [label, f, mn, mx, st] of APOSE)
  aCtl[f] = mkRange($('aRows'), label, mn, mx, st, 0, (v) => { if (!editable || aState.value === 'idle') return; const t = ensureTarget(); if (t) t[f] = v; });
function getTarget() {
  const k = aState.value; if (k === 'idle' || !workingSpec?.poses) return null;
  return isAttack(k) ? (workingSpec.poses[k]?.[aPhase.value] || null) : (workingSpec.poses[k] || null);
}
function ensureTarget() {
  const k = aState.value; if (k === 'idle' || !workingSpec) return null;
  workingSpec.poses = workingSpec.poses || {};
  if (isAttack(k)) { workingSpec.poses[k] = workingSpec.poses[k] || {}; return workingSpec.poses[k][aPhase.value] = workingSpec.poses[k][aPhase.value] || {}; }
  return workingSpec.poses[k] = workingSpec.poses[k] || {};
}
const defA = (f) => { const ip = workingSpec?.idlePose || {}; const d = { handX: 24, handY: 5, wrist: -0.5, backHandX: 3, backHandY: 13 }; return f in d ? (ip[f] ?? d[f]) : 0; };
function seedPose() { return { handX: defA('handX'), handY: defA('handY'), wrist: defA('wrist'), backHandX: defA('backHandX'), backHandY: defA('backHandY'), lean: 0, lunge: 0 }; }
function syncAPose() {
  const k = aState.value, atk = isAttack(k);
  aPhase.style.display = atk ? '' : 'none';
  const t = getTarget();
  $('aStatus').textContent = k === 'idle' ? '↑ edit in Idle pose' : (t ? 'authored ✓' : 'procedural (Author to edit)');
  $('aStatus').className = 'tag' + (t ? ' on' : '');
  for (const [, f] of APOSE) aCtl[f].set(t?.[f] ?? defA(f));
}
aState.addEventListener('change', syncAPose);
aPhase.addEventListener('change', syncAPose);
$('authorPose').addEventListener('click', () => { if (!editable || aState.value === 'idle') return; Object.assign(ensureTarget(), seedPose()); syncAPose(); });
$('clearPose').addEventListener('click', () => {
  const k = aState.value; if (k === 'idle' || !workingSpec?.poses) return;
  if (isAttack(k)) { if (workingSpec.poses[k]) delete workingSpec.poses[k][aPhase.value]; } else delete workingSpec.poses[k];
  syncAPose();
});

// build a frozen preview player for the selected state/phase
function phaseFrame(ch, key, ph) {
  if (['nb', 'sb', 'ub', 'db'].includes(key)) {
    const s = ch.specials[key], from = s.from ?? s.fire ?? 8, to = s.to ?? (s.fire ?? 8) + 4, total = s.total;
    return ph === 'wind' ? Math.max(1, from - 1) : ph === 'hit' ? Math.floor((from + to) / 2) : Math.min(total - 1, to + 2);
  }
  const m = ch.moves[key], hb = m.hitboxes[0];
  return ph === 'wind' ? Math.max(1, hb.from - 1) : ph === 'hit' ? Math.floor((hb.from + hb.to) / 2) : Math.min(m.total - 1, hb.to + 2);
}
function fakePreview() {
  const k = aState.value, p = fakeIdle($('facing').checked ? 1 : -1);
  if (k === 'idle') return p;
  const ch = CHARACTERS[selId];
  if (isAttack(k)) {
    p.act = ACT.ATTACK; p.moveId = k; p.actFrame = phaseFrame(ch, k, aPhase.value);
    if (['nair', 'fair', 'bair', 'uair', 'dair', 'ub'].includes(k)) { p.grounded = false; p.vy = k === 'dair' ? 5 : -2; }
    return p;
  }
  switch (k) {
    case 'run': p.vx = ch.runSpeed; p.x = 40; break;
    case 'crouch': p.lastIn = { b: 0, x: 0, y: 1 }; break;
    case 'air': p.grounded = false; p.vy = 4; break;
    case 'jumpsquat': p.act = ACT.JUMPSQUAT; break;
    case 'shield': p.act = ACT.SHIELD; break;
    case 'shieldStun': p.act = ACT.SHIELDSTUN; p.stun = 20; break;
    case 'dizzy': p.act = ACT.SHIELDBREAK; break;
    case 'roll': p.act = ACT.ROLL; p.actFrame = 10; p.rollDir = 1; break;
    case 'ledge': p.act = ACT.LEDGE; p.grounded = false; break;
    case 'hitReel': p.act = ACT.HITSTUN; p.vx = 2; p.stun = 20; break;
    case 'grab': p.act = ACT.GRAB; p.grabbing = -1; p.actFrame = 6; break;
    case 'grabbed': p.act = ACT.GRABBED; break;
  }
  return p;
}

// ── open / new character ────────────────────────────────────────────────────
const charSel = $('char');
function refreshCharList() {
  charSel.innerHTML = '';
  for (const id of Object.keys(CHARACTERS)) { const o = document.createElement('option'); o.value = id; o.textContent = CHARACTERS[id].name + (getDataSpec(id) ? '' : ' (bespoke)'); charSel.appendChild(o); }
  charSel.value = selId;
}
function syncSlidersFromSpec() {
  for (const [, path] of [...SKEL, ...POSE, ...WEAPON]) ctl[path]?.set(getPath(workingSpec, path) ?? getPath(reedSpec, path) ?? 0);
  syncPartUI();
  if (typeof syncAPose === 'function') syncAPose();
  if (typeof syncBodyUI === 'function') syncBodyUI();
}
function setEditableUI() {
  $('editState').textContent = editable ? 'editable ✓' : 'bespoke — view/play only';
  $('editState').className = 'tag' + (editable ? ' on' : ' warn');
  for (const g of ['gSkel', 'gParts', 'gPose', 'gWeapon', 'gAnim']) $(g).classList.toggle('dim', !editable);
}
function openChar(id) {
  selId = id;
  const base = getDataSpec(id);          // a data rig's live spec, or null
  if (base) {
    workingSpec = cloneOf(base); workingSpec.id = id; workingSpec.images = workingSpec.images || {};
    setRig(id, buildSpecRig(workingSpec));   // engine now draws our editable clone
    editable = true; syncSlidersFromSpec();
  } else {
    workingSpec = null; editable = false;     // bespoke legend: view/drive only
  }
  setEditableUI();
  if (mode === 'play') ensureSim();
  refreshCharList();
}
charSel.addEventListener('change', () => openChar(charSel.value));
$('new').addEventListener('click', () => {
  const id = ($('id').value.trim() || 'myhero').replace(/[^a-z0-9_]/gi, '');
  CHARACTERS[id] = CHARACTERS[id] || { ...cloneOf(CHARACTERS.reed), id, name: id.toUpperCase() };
  workingSpec = cloneOf(reedSpec); workingSpec.id = id; workingSpec.images = {};
  setRig(id, buildSpecRig(workingSpec));
  selId = id; editable = true; setEditableUI(); syncSlidersFromSpec();
  if (mode === 'play') ensureSim();
  refreshCharList();
});
$('reset').addEventListener('click', () => {
  if (!editable) return;
  for (const [, path] of [...POSE, ...WEAPON]) { const v = getPath(reedSpec, path) ?? 0; setPath(workingSpec, path, v); ctl[path].set(v); }
});

// ── export ──────────────────────────────────────────────────────────────────
function exportText() {
  if (!workingSpec) return `// ${selId} is a bespoke rig (hand-written in js/rigs/${selId}.js) — not data-editable.`;
  const id = ($('id').value.trim() || workingSpec.id || 'myhero');
  const out = cloneOf(workingSpec); out.id = id;
  for (const k in (out.images || {})) if (out.images[k]?.src) out.images[k].src = `/assets/chars/${id}/${k}.png`;
  const json = JSON.stringify(out, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v, 2);
  return `// ${id}.rig.js — generated by /dev/tuner.html\nexport const ${id}Spec = ${json};\n`;
}
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(exportText()); $('copy').textContent = 'Copied ✓'; setTimeout(() => $('copy').textContent = 'Export spec', 1200); } catch {}
});

// ── play mode (real sim + controls) ─────────────────────────────────────────
function ensureSim() {
  if (!CHARACTERS[selId]) CHARACTERS[selId] = { ...cloneOf(CHARACTERS.reed), id: selId };
  sim = createGameState([{ uid: 'p0', charId: selId }]);
  sim.phase = PHASE.PLAYING;
}
$('mode').addEventListener('click', () => {
  mode = mode === 'play' ? 'edit' : 'play';
  $('mode').textContent = mode === 'play' ? '⏸ Edit' : '▶ Play';
  $('mode').classList.toggle('go', mode !== 'play');
  if (mode === 'play') { renderer = renderer || new Renderer(c); ensureSim(); last = performance.now(); acc = 0; }
  layout();
});

// ── render loop ─────────────────────────────────────────────────────────────
const fakeIdle = (facing) => ({ charId: selId, idx: 0, uid: 'design', facing, grounded: true, vx: 0, vy: 0, percent: 0,
  act: ACT.FREE, actFrame: 0, moveId: '', stun: 0, hitlag: 0, shield: 60, invuln: 0, jumpsLeft: 1, fastFalling: false, charge: 0, x: 0, y: 0, lastIn: { b: 0, x: 0, y: 0 } });

let last = performance.now(), acc = 0;
function frame(now) {
  const dtMs = Math.max(0, Math.min(100, now - last)); last = now;
  if (mode === 'play' && renderer && sim) {
    // fixed 60Hz timestep — rAF can fire at 120/144Hz, so stepping once per
    // frame would run the sim 2–2.4× too fast. Accumulate and step in ticks,
    // exactly like the real client loop (with the same spiral-of-death guard).
    acc += dtMs;
    let n = 0;
    while (acc >= MS_PER_TICK && n++ < 6) { step(sim, [sampleInput()]); acc -= MS_PER_TICK; }
    if (n >= 6) acc = 0;
    sim.players[0].stocks = 3;                 // endless sandbox (never KO's out)
    renderer.render(dtMs / 1000, { players: sim.players, projectiles: sim.projectiles,
      meta: [{ charId: selId, username: (workingSpec?.id || CHARACTERS[selId]?.name || selId) }],
      myIdx: 0, phase: sim.phase, phaseTimer: sim.phaseTimer });
    $('out').textContent = exportText();
    requestAnimationFrame(frame); return;
  }
  // ── edit (pose) mode ──
  const dpr = devicePixelRatio;
  const W = window.innerWidth - PANEL, H = window.innerHeight;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0c1026'; ctx.fillRect(0, 0, W, H);
  const gx = W / 2, gy = H * 0.74;
  ctx.strokeStyle = '#1c2742'; ctx.beginPath(); ctx.moveTo(gx, 30); ctx.lineTo(gx, H); ctx.stroke();
  ctx.strokeStyle = '#243150'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  if (refImg) {
    ctx.save(); ctx.globalAlpha = refState.op;
    const w = refImg.width * refState.scale, h = refImg.height * refState.scale;
    ctx.drawImage(refImg, gx - w / 2 + refState.x, gy - h + refState.y, w, h);
    ctx.restore();
  }
  const tt = $('freeze').checked ? 12.3 : now / 1000;
  const p = fakePreview();
  const drawAt = (t) => { ctx.save(); ctx.translate(gx, gy); ctx.scale(view.zoom, view.zoom); drawFighter(ctx, p, t); ctx.restore(); };
  if ($('bones').checked && workingSpec) {        // faint vector underlay for aligning art
    const saved = workingSpec.images; workingSpec.images = {};
    ctx.save(); ctx.globalAlpha = 0.3; drawAt(tt); ctx.restore();
    workingSpec.images = saved;
  }
  drawAt(tt);
  $('out').textContent = exportText();
  requestAnimationFrame(frame);
}

// ── boot ────────────────────────────────────────────────────────────────────
layout();
openChar('reed');
requestAnimationFrame(frame);
