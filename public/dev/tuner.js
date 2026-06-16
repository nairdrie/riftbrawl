// Dev-only POSE TUNER. Open /dev/tuner.html.
// Drives the REAL data-rig (via globalThis.__RIG_TUNE__) with live slider values
// so what you see is exactly what the engine draws. Tune the idle stance + sword
// hold (optionally over a reference image), then "Copy spec" and paste the
// numbers into the character's rig spec. Removes the guesswork from posing.

import { ACT } from '/shared/constants.js';
import { CHARACTERS, CHARACTER_LIST } from '/shared/characters.js';
import { drawFighter } from '/js/fighters.js';

const TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const c = $('c'), ctx = c.getContext('2d');

// only data-rig characters expose tunable idle params; list all, default reed
const charSel = $('char');
for (const id of CHARACTER_LIST) {
  const o = document.createElement('option'); o.value = id; o.textContent = CHARACTERS[id].name; charSel.appendChild(o);
}
charSel.value = CHARACTERS.reed ? 'reed' : CHARACTER_LIST[0];

// ── tunable parameter definitions (label, key, min, max, step, default) ──────
const POSE = [
  ['Depth', 'depth', 0, 1, 0.01, 0.55],
  ['Settle', 'settle', -4, 16, 0.5, 3],
  ['Lead foot X', 'leadFoot', -8, 30, 0.5, 8],
  ['Rear foot X', 'rearFoot', -30, 6, 0.5, -11],
  ['Rear heel ↑', 'rearLift', -4, 12, 0.5, 1.5],
  ['Lean fwd', 'leanAdd', -0.5, 0.5, 0.01, 0],
  ['Hand X', 'handX', -10, 40, 0.5, 24],
  ['Hand Y', 'handY', -34, 30, 0.5, 5],
  ['Blade angle', 'wrist', -3.14, 3.14, 0.02, -0.5],
  ['Off-hand X', 'backHandX', -22, 26, 0.5, 3],
  ['Off-hand Y', 'backHandY', -22, 30, 0.5, 13],
  ['Shoulder ∠', 'shoulderAngle', -0.7, 0.7, 0.02, 0],
];
const WEAPON = [
  ['Length', 'length', 16, 92, 1, 56],
  ['Grip', 'grip', 0, 22, 0.5, 9],
  ['Width', 'width', 2, 16, 0.5, 6],
];
const REF = [
  ['Opacity', 'op', 0, 1, 0.02, 0.5],
  ['Scale', 'scale', 0.1, 5, 0.01, 1],
  ['Offset X', 'x', -300, 300, 1, 0],
  ['Offset Y', 'y', -400, 200, 1, 0],
];

const state = {};               // current values, keyed by param key
function buildRows(defs, host) {
  for (const [label, key, min, max, step, def] of defs) {
    state[key] = def;
    const row = document.createElement('div'); row.className = 'row';
    const l = document.createElement('label'); l.textContent = label;
    const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = def;
    const v = document.createElement('span'); v.className = 'val'; v.textContent = (+def).toFixed(step < 1 ? 2 : 0);
    r.addEventListener('input', () => { state[key] = +r.value; v.textContent = (+r.value).toFixed(step < 1 ? 2 : 0); });
    row.append(l, r, v); host.appendChild(row);
    state['_set_' + key] = (val) => { r.value = val; state[key] = +val; v.textContent = (+val).toFixed(step < 1 ? 2 : 0); };
  }
}
buildRows(POSE, $('poseRows'));
buildRows(WEAPON, $('wpRows'));
buildRows(REF, $('refRows'));

// reference image
let refImg = null;
$('ref').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image(); img.onload = () => { refImg = img; }; img.src = URL.createObjectURL(f);
});

$('reset').addEventListener('click', () => {
  for (const [, key, , , , def] of [...POSE, ...WEAPON]) state['_set_' + key](def);
});

// ── live spec snippet + copy ────────────────────────────────────────────────
function specText() {
  const f2 = (n) => Number(n.toFixed(2));
  return `// paste into the character's spec (e.g. reed.rig.js)
depth: ${f2(state.depth)},
idleSettle: ${f2(state.settle)},
idlePose: {
  leadFoot: ${f2(state.leadFoot)}, rearFoot: ${f2(state.rearFoot)}, rearLift: ${f2(state.rearLift)},
  handX: ${f2(state.handX)}, handY: ${f2(state.handY)}, wrist: ${f2(state.wrist)},
  backHandX: ${f2(state.backHandX)}, backHandY: ${f2(state.backHandY)}, leanAdd: ${f2(state.leanAdd)},
  shoulderAngle: ${f2(state.shoulderAngle)},
},
weapon: { /* merge into existing */ length: ${f2(state.length)}, grip: ${f2(state.grip)}, width: ${f2(state.width)} },`;
}
$('copy').addEventListener('click', async () => {
  const txt = specText();
  try { await navigator.clipboard.writeText(txt); $('copy').textContent = 'Copied ✓'; setTimeout(() => $('copy').textContent = 'Copy spec', 1200); }
  catch { /* clipboard may be blocked; the <pre> is selectable */ }
});

// ── fake player ─────────────────────────────────────────────────────────────
const fake = (id, facing) => ({
  charId: id, idx: 0, uid: 'tuner', facing, grounded: true, vx: 0, vy: 0, percent: 0,
  act: ACT.FREE, actFrame: 0, moveId: '', stun: 0, hitlag: 0, shield: 60, invuln: 0,
  jumpsLeft: 1, fastFalling: false, charge: 0, x: 0, y: 0, lastIn: { b: 0, x: 0, y: 0 },
});

const GROUND_Y = 470, SC = 4.4;
let t = 0;
function frame() {
  t += 1 / 60;
  const id = charSel.value;
  const facing = $('facing').checked ? 1 : -1;
  const tt = $('freeze').checked ? 12.3 : t;     // a fixed phase freezes the sway/breath

  // push live values into the real engine
  globalThis.__RIG_TUNE__ = {
    [id]: {
      depth: state.depth,
      settle: state.settle,
      idlePose: {
        leadFoot: state.leadFoot, rearFoot: state.rearFoot, rearLift: state.rearLift,
        handX: state.handX, handY: state.handY, wrist: state.wrist,
        backHandX: state.backHandX, backHandY: state.backHandY, leanAdd: state.leanAdd,
        shoulderAngle: state.shoulderAngle,
      },
      weapon: { length: state.length, grip: state.grip, width: state.width },
    },
  };

  ctx.fillStyle = '#0c1026'; ctx.fillRect(0, 0, c.width, c.height);
  // guides
  ctx.strokeStyle = '#243150'; ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(c.width, GROUND_Y); ctx.stroke();
  ctx.strokeStyle = '#1a2440'; ctx.beginPath(); ctx.moveTo(c.width / 2, 30); ctx.lineTo(c.width / 2, c.height); ctx.stroke();

  // reference image (behind), anchored near the feet
  if (refImg) {
    ctx.save(); ctx.globalAlpha = state.op;
    const w = refImg.width * state.scale, h = refImg.height * state.scale;
    ctx.drawImage(refImg, c.width / 2 - w / 2 + state.x, GROUND_Y - h + state.y, w, h);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(c.width / 2, GROUND_Y);
  ctx.scale(SC, SC);
  drawFighter(ctx, fake(id, facing), tt);
  ctx.restore();

  $('out').textContent = specText();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
