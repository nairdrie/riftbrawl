// Dev-only RIG MAP / art template. Open /dev/rig.html.
// Left: REED's rest skeleton with labelled sockets + proportions — the blueprint
// an artist draws a design on top of. Right: the same measured grid, empty, to
// trace over. Bottom: the live data rig moving through its states.

import { ACT } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { drawFighter } from '/js/fighters.js';
import { ikSolve } from '/js/rigs/common.js';
import { reedSpec } from '/js/rigs/data/reed.rig.js';

const TAU = Math.PI * 2;
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

// ── layout ────────────────────────────────────────────────────────────────
const CELL = 460, GAP = 24, PARADE_H = 250;
canvas.width = CELL * 2 + GAP;
canvas.height = CELL + GAP + PARADE_H;

// world→panel transform: feet (0,0) sit near the bottom; SCALE px per local unit
const SCALE = 3.0;
const FOOT_Y = CELL - 70;            // where local y=0 lands inside a panel

// Rest skeleton straight from the spec proportions (matches the runtime idle).
function restSkeleton(spec) {
  const sk = spec.skel;
  const st = sk.stance ?? 12;
  const f1 = [st, 0], f2 = [-st, 0];                       // feet
  const hipF = [sk.hipW ?? 7, sk.hipY], hipB = [-(sk.hipW ?? 7), sk.hipY];
  const legF = ikSolve(hipF[0], hipF[1], f1[0], f1[1] - 3, sk.thigh, sk.shin, 1);
  const legB = ikSolve(hipB[0], hipB[1], f2[0], f2[1] - 3, sk.thigh, sk.shin, -1);
  const shF = [sk.shoulderX ?? 9, sk.shoulderY + 3], shB = [-(sk.shoulderX ?? 9), sk.shoulderY + 2];
  const handF = [14, sk.shoulderY + 15], handB = [-(sk.shoulderX ?? 9) * 1.5, sk.shoulderY + 12];
  const armF = ikSolve(shF[0], shF[1], handF[0], handF[1], sk.upper, sk.fore, -1);
  const armB = ikSolve(shB[0], shB[1], handB[0], handB[1], sk.upper, sk.fore, 1);
  return {
    head: [0, sk.headY], headR: sk.headR,
    shF, shB, hipF, hipB, f1, f2,
    kneeF: [legF.jx, legF.jy], kneeB: [legB.jx, legB.jy],
    elbowF: [armF.jx, armF.jy], elbowB: [armB.jx, armB.jy],
    handF: [armF.ex, armF.ey], handB: [armB.ex, armB.ey],
  };
}

function gridPanel(ox, oy, title) {
  ctx.save();
  ctx.translate(ox, oy);
  // panel bg + frame
  ctx.fillStyle = '#0a0d1d';
  ctx.fillRect(0, 0, CELL, CELL);
  ctx.strokeStyle = '#23304f'; ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);
  // grid (every 10 units fine, 50 bold), origin at (CELL/2, FOOT_Y)
  const cx = CELL / 2;
  for (let u = -150; u <= 150; u += 10) {
    const x = cx + u * SCALE;
    if (x < 2 || x > CELL - 2) continue;
    ctx.strokeStyle = u % 50 === 0 ? '#2c3c6a' : '#16203a';
    ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, CELL - 4); ctx.stroke();
  }
  for (let u = -160; u <= 30; u += 10) {
    const y = FOOT_Y + u * SCALE;
    if (y < 2 || y > CELL - 2) continue;
    ctx.strokeStyle = u % 50 === 0 ? '#2c3c6a' : '#16203a';
    ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(CELL - 4, y); ctx.stroke();
    if (u % 20 === 0) {
      ctx.fillStyle = '#5a688a';
      ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${u}`, 6, y - 2);
    }
  }
  // origin axes
  ctx.strokeStyle = '#3d9bff66'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, CELL - 4); ctx.stroke();        // x=0
  ctx.strokeStyle = '#41e3a066';
  ctx.beginPath(); ctx.moveTo(4, FOOT_Y); ctx.lineTo(CELL - 4, FOOT_Y); ctx.stroke(); // y=0 (ground)
  ctx.fillStyle = '#7da6e0'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('y = 0  (feet / ground)', 8, FOOT_Y + 14);
  ctx.fillText('x = 0', cx + 5, 16);
  ctx.fillStyle = '#eef2fb'; ctx.font = '700 13px system-ui';
  ctx.fillText(title, 12, CELL - 12);
  ctx.restore();
  return [ox + cx, oy + FOOT_Y];
}

function L(x) { return x * SCALE; }      // local → px (no origin)
function dot(px, py, r, fill, line) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function bone(ax, ay, bx, by) {
  ctx.strokeStyle = '#6f8bc0'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}
function label(px, py, text, color = '#ffce3f', align = 'left') {
  ctx.font = '600 11px system-ui'; ctx.textAlign = align;
  ctx.fillStyle = '#0a0d1d'; ctx.lineWidth = 3; ctx.strokeStyle = '#0a0d1d';
  ctx.strokeText(text, px, py); ctx.fillStyle = color; ctx.fillText(text, px, py);
}

function drawBlueprint(originX, originY) {
  const S = restSkeleton(reedSpec);
  const P = ([x, y]) => [originX + L(x), originY + L(y)];
  // bones
  bone(...P(S.hipF), ...P(S.kneeF)); bone(...P(S.kneeF), ...P(S.f1));
  bone(...P(S.hipB), ...P(S.kneeB)); bone(...P(S.kneeB), ...P(S.f2));
  bone(...P(S.shF), ...P(S.elbowF)); bone(...P(S.elbowF), ...P(S.handF));
  bone(...P(S.shB), ...P(S.elbowB)); bone(...P(S.elbowB), ...P(S.handB));
  bone(...P(S.hipF), ...P(S.shF)); bone(...P(S.hipB), ...P(S.shB));
  bone(...P([0, reedSpec.skel.hipY]), ...P([0, reedSpec.skel.shoulderY]));
  // head circle
  const [hx, hy] = P(S.head);
  ctx.strokeStyle = '#6f8bc0'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(hx, hy, L(S.headR), 0, TAU); ctx.stroke();
  // socket dots + labels
  const G = '#ffce3f', J = '#9fd0ff', F = '#41e3a0';
  dot(hx, hy, 4, G); label(hx + L(S.headR) + 6, hy - 4, `head  (0, ${reedSpec.skel.headY})  r=${reedSpec.skel.headR}`);
  for (const [pt, name, c] of [
    [S.shF, 'shoulder', J], [S.hipF, 'hip', J],
    [S.kneeF, 'knee (IK)', F], [S.elbowF, 'elbow (IK)', F],
    [S.handF, 'hand ▶ weapon grip', G], [S.f1, 'foot', G],
  ]) {
    const [px, py] = P(pt); dot(px, py, 4, c, '#0a0d1d');
    label(px + 8, py + 3, name, c);
  }
  // back-limb sockets (dim)
  for (const pt of [S.shB, S.hipB, S.kneeB, S.elbowB, S.handB, S.f2]) {
    const [px, py] = P(pt); dot(px, py, 3, '#5a688a');
  }
  // proportion callouts down the left
  const sk = reedSpec.skel;
  ctx.textAlign = 'right';
  for (const [y, t] of [[sk.headY, 'headY'], [sk.shoulderY, 'shoulderY'], [sk.hipY, 'hipY']]) {
    const py = originY + L(y);
    ctx.strokeStyle = '#ffce3f44'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(originX - L(40), py); ctx.lineTo(originX + L(40), py); ctx.stroke();
    ctx.setLineDash([]);
    label(originX - L(40) - 4, py + 3, `${t}=${y}`, '#cdb56a', 'right');
  }
}

// ── parade: the live rig across states ──────────────────────────────────────
function midHit(ch, id) { const m = ch.moves[id]; return Math.floor((m.hitboxes[0].from + m.hitboxes[0].to) / 2) + 1; }
function spc(ch, id) { const s = ch.specials[id]; return Math.floor(((s.from ?? s.fire ?? 8) + (s.to ?? (s.fire ?? 8) + 4)) / 2); }
const fake = (id, o = {}) => ({ charId: id, idx: 0, uid: id + '_p', facing: 1, grounded: true, vx: 0, vy: 0, percent: 0, act: ACT.FREE, actFrame: 0, moveId: '', stun: 0, hitlag: 0, shield: 60, invuln: 0, jumpsLeft: 1, fastFalling: false, charge: 0, x: 0, y: 0, lastIn: { b: 0, x: 0, y: 0 }, ...o });

function paradeStates(ch) {
  return [
    ['idle', {}],
    ['run', { vx: ch.runSpeed, x: performance.now() * 0.02 }],
    ['jump', { grounded: false, vy: -10 }],
    ['ftilt', { act: ACT.ATTACK, moveId: 'ftilt', actFrame: midHit(ch, 'ftilt') }],
    ['fair', { act: ACT.ATTACK, moveId: 'fair', actFrame: midHit(ch, 'fair'), grounded: false, vy: -2 }],
    ['nb', { act: ACT.ATTACK, moveId: 'nb', actFrame: ch.specials.nb.fire - 1, charge: 50 }],
    ['upB', { act: ACT.ATTACK, moveId: 'ub', actFrame: spc(ch, 'ub'), grounded: false, vy: -12 }],
  ];
}

let t = 0;
function frame() {
  t += 1 / 60;
  ctx.fillStyle = '#0c1026';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const [bx, by] = gridPanel(0, 0, 'BLUEPRINT — REED rest skeleton + sockets');
  // faint live silhouette behind the skeleton so the body reads
  ctx.save(); ctx.globalAlpha = 0.5; ctx.translate(bx, by); ctx.scale(SCALE, SCALE);
  drawFighter(ctx, fake('reed'), t); ctx.restore();
  drawBlueprint(bx, by);

  gridPanel(CELL + GAP, 0, 'YOUR ART HERE — trace at these proportions');
  // ghost of the figure on the trace panel too (very faint)
  ctx.save(); ctx.globalAlpha = 0.16; ctx.translate(CELL + GAP + CELL / 2, by); ctx.scale(SCALE, SCALE);
  drawFighter(ctx, fake('reed'), t); ctx.restore();

  // parade strip across the bottom
  const py0 = CELL + GAP;
  ctx.fillStyle = '#0a0d1d'; ctx.fillRect(0, py0, canvas.width, PARADE_H);
  ctx.strokeStyle = '#23304f'; ctx.strokeRect(0.5, py0 + 0.5, canvas.width - 1, PARADE_H - 1);
  const ch = CHARACTERS.reed;
  const states = paradeStates(ch);
  const cw = canvas.width / states.length;
  states.forEach(([name, ov], i) => {
    const cx = i * cw + cw / 2, cy = py0 + PARADE_H - 36;
    ctx.fillStyle = '#8d99c2'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(name.toUpperCase(), cx, py0 + 20);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1.55, 1.55); drawFighter(ctx, fake('reed', ov), t); ctx.restore();
  });

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
