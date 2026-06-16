// Dev-only CHARACTER DESIGNER. Open /dev/tuner.html.
// Builds on the REED base rig: skin body parts with images, dial the stance, and
// export a new <id>.rig.js. It renders the working spec through the REAL engine
// (buildDataRig), so the preview is exactly what the game draws. Editing mutates
// the working spec live; nothing here touches production characters.

import { ACT } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { deriveAnim } from '/js/rigs/common.js';
import { buildDataRig } from '/js/rigs/data/runtime.js';
import { reedSpec } from '/js/rigs/data/reed.rig.js';

const $ = (id) => document.getElementById(id);
const c = $('c'), ctx = c.getContext('2d');
const PANEL = 340;
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseChar = CHARACTERS.reed;        // colours/scale/stats the base look uses

// working spec (a private clone of the base) + its rig, rebuilt on "New"
let workingSpec = clone(reedSpec);
if (!workingSpec.images) workingSpec.images = {};
let rig = buildDataRig(workingSpec);

// ── canvas fills the area left of the panel ─────────────────────────────────
function resize() { c.width = (window.innerWidth - PANEL) * devicePixelRatio; c.height = window.innerHeight * devicePixelRatio;
  c.style.width = (window.innerWidth - PANEL) + 'px'; c.style.height = window.innerHeight + 'px'; }
window.addEventListener('resize', resize); resize();

// ── tiny labelled-range helper ──────────────────────────────────────────────
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

// ── preview controls ────────────────────────────────────────────────────────
const view = { zoom: 3.4 };
mkRange($('zoomRow'), 'Zoom', 0.5, 9, 0.1, view.zoom, (x) => view.zoom = x);

// ── idle pose sliders → mutate workingSpec ──────────────────────────────────
// [label, path, min, max, step] where path targets the spec.
const POSE = [
  ['Depth', 'depth', 0, 1, 0.01],
  ['Settle', 'idleSettle', -4, 16, 0.5],
  ['Lead foot X', 'idlePose.leadFoot', -8, 30, 0.5],
  ['Rear foot X', 'idlePose.rearFoot', -30, 6, 0.5],
  ['Rear heel ↑', 'idlePose.rearLift', -4, 12, 0.5],
  ['Lean fwd', 'idlePose.leanAdd', -0.5, 0.5, 0.01],
  ['Shoulder ∠', 'idlePose.shoulderAngle', -0.7, 0.7, 0.02],
  ['Hand X', 'idlePose.handX', -10, 40, 0.5],
  ['Hand Y', 'idlePose.handY', -34, 30, 0.5],
  ['Blade ∠', 'idlePose.wrist', -3.14, 3.14, 0.02],
  ['Off-hand X', 'idlePose.backHandX', -22, 26, 0.5],
  ['Off-hand Y', 'idlePose.backHandY', -22, 30, 0.5],
];
const WEAPON = [
  ['Length', 'weapon.length', 16, 92, 1],
  ['Grip', 'weapon.grip', 0, 22, 0.5],
  ['Width', 'weapon.width', 2, 16, 0.5],
];
const REF = [['Opacity', 'op', 0, 1, 0.02, 0.5], ['Scale', 'scale', 0.1, 5, 0.01, 1], ['Offset X', 'x', -400, 400, 1, 0], ['Offset Y', 'y', -500, 300, 1, 0]];

const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); let t = o; for (const k of ks) { t[k] = t[k] || {}; t = t[k]; } t[last] = v; }

const poseCtl = {}, wpCtl = {};
for (const [label, path, mn, mx, st] of POSE)
  poseCtl[path] = mkRange($('poseRows'), label, mn, mx, st, getPath(workingSpec, path) ?? 0, (v) => setPath(workingSpec, path, v));
for (const [label, path, mn, mx, st] of WEAPON)
  wpCtl[path] = mkRange($('wpRows'), label, mn, mx, st, getPath(workingSpec, path) ?? 0, (v) => setPath(workingSpec, path, v));

const refState = {};
for (const [label, key, mn, mx, st, def] of REF) { refState[key] = def; mkRange($('refRows'), label, mn, mx, st, def, (v) => refState[key] = v); }

// ── body-part image skinning ────────────────────────────────────────────────
const PARTS = ['head', 'torso', 'upperArm', 'foreArm', 'thigh', 'shin', 'hand', 'foot', 'weapon'];
const partSel = $('part');
for (const p of PARTS) { const o = document.createElement('option'); o.value = p; o.textContent = p; partSel.appendChild(o); }
partSel.value = 'torso';

const PT = [['Scale', 'scale', 0.05, 6, 0.01], ['Offset X', 'ox', -80, 80, 0.5], ['Offset Y', 'oy', -80, 80, 0.5], ['Rotate', 'rot', -3.14, 3.14, 0.02]];
const ptCtl = {};
for (const [label, key, mn, mx, st] of PT)
  ptCtl[key] = mkRange($('partRows'), label, mn, mx, st, key === 'scale' ? 1 : 0, (v) => { const conf = workingSpec.images[partSel.value]; if (conf) conf[key] = v; });

function syncPartUI() {
  const conf = workingSpec.images[partSel.value];
  $('partState').textContent = conf ? 'image ✓' : 'vector';
  $('partState').className = 'tag' + (conf ? ' on' : '');
  ptCtl.scale.set(conf?.scale ?? 1); ptCtl.ox.set(conf?.ox ?? 0); ptCtl.oy.set(conf?.oy ?? 0); ptCtl.rot.set(conf?.rot ?? 0);
}
partSel.addEventListener('change', syncPartUI);
$('img').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const src = URL.createObjectURL(f);
  workingSpec.images[partSel.value] = { src, scale: 1, ox: 0, oy: 0, rot: 0 };
  syncPartUI(); e.target.value = '';
});
$('clearPart').addEventListener('click', () => { delete workingSpec.images[partSel.value]; syncPartUI(); });
syncPartUI();

// ── reference overlay image ─────────────────────────────────────────────────
let refImg = null;
$('ref').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => refImg = img; img.src = URL.createObjectURL(f); });

// ── new character + export ──────────────────────────────────────────────────
$('new').addEventListener('click', () => {
  workingSpec = clone(reedSpec); workingSpec.images = {};
  workingSpec.id = ($('id').value.trim() || 'mychar');
  rig = buildDataRig(workingSpec);
  for (const [, path] of POSE) poseCtl[path].set(getPath(workingSpec, path) ?? 0);
  for (const [, path] of WEAPON) wpCtl[path].set(getPath(workingSpec, path) ?? 0);
  syncPartUI();
});
$('reset').addEventListener('click', () => {
  for (const [, path] of POSE) { const v = getPath(reedSpec, path) ?? 0; setPath(workingSpec, path, v); poseCtl[path].set(v); }
  for (const [, path] of WEAPON) { const v = getPath(reedSpec, path) ?? 0; setPath(workingSpec, path, v); wpCtl[path].set(v); }
});

function exportText() {
  const id = ($('id').value.trim() || 'mychar');
  const out = clone(workingSpec); out.id = id;
  for (const k in (out.images || {})) if (out.images[k]?.src) out.images[k].src = `/assets/chars/${id}/${k}.png`;
  const json = JSON.stringify(out, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v, 2);
  return `// ${id}.rig.js — generated by /dev/tuner.html\n// drop part PNGs in public/assets/chars/${id}/ , then register in fighters.js\nexport const ${id}Spec = ${json};\n`;
}
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(exportText()); $('copy').textContent = 'Copied ✓'; setTimeout(() => $('copy').textContent = 'Export spec', 1200); } catch {}
});

// ── render loop ─────────────────────────────────────────────────────────────
const fake = (facing) => ({ charId: workingSpec.id || 'reed', idx: 0, uid: 'tuner', facing, grounded: true, vx: 0, vy: 0, percent: 0,
  act: ACT.FREE, actFrame: 0, moveId: '', stun: 0, hitlag: 0, shield: 60, invuln: 0, jumpsLeft: 1, fastFalling: false, charge: 0, x: 0, y: 0, lastIn: { b: 0, x: 0, y: 0 } });

function drawChar(p, t, zoom, gx, gy) {
  const A = deriveAnim(p, baseChar, t);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.scale(zoom, zoom);
  ctx.scale(p.facing * baseChar.scale, baseChar.scale);
  ctx.translate(A.jitter.x, A.jitter.y);
  if (A.squash !== 1) ctx.scale(1 + (1 - A.squash) * 0.65, A.squash);
  rig.draw(ctx, p, baseChar, A, t);
  ctx.restore();
}

let t = 0;
function frame() {
  t += 1 / 60;
  const dpr = devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = window.innerWidth - PANEL, H = window.innerHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0c1026'; ctx.fillRect(0, 0, W, H);

  const gx = W / 2, gy = H * 0.74;
  // guides
  ctx.strokeStyle = '#1c2742'; ctx.beginPath(); ctx.moveTo(gx, 30); ctx.lineTo(gx, H); ctx.stroke();
  ctx.strokeStyle = '#243150'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();

  // reference overlay (behind), anchored at the feet
  if (refImg) {
    ctx.save(); ctx.globalAlpha = refState.op;
    const w = refImg.width * refState.scale, h = refImg.height * refState.scale;
    ctx.drawImage(refImg, gx - w / 2 + refState.x, gy - h + refState.y, w, h);
    ctx.restore();
  }

  const facing = $('facing').checked ? 1 : -1;
  const tt = $('freeze').checked ? 12.3 : t;
  const p = fake(facing);

  // skeleton underlay: draw the same pose as faint VECTORS (images suppressed)
  if ($('bones').checked) {
    const saved = workingSpec.images; workingSpec.images = {};
    ctx.save(); ctx.globalAlpha = 0.28; drawChar(p, tt, view.zoom, gx, gy); ctx.restore();
    workingSpec.images = saved;
  }
  drawChar(p, tt, view.zoom, gx, gy);

  $('out').textContent = exportText();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
