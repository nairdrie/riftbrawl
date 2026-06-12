// Dev-only pose sheet: every character × every animation state on one canvas.
// Open /dev/poses.html — used by test/poses.js for visual verification.

import { ACT } from '/shared/constants.js';
import { CHARACTERS, CHARACTER_LIST } from '/shared/characters.js';
import { drawFighter } from '/js/fighters.js';

const CELL_W = 148, CELL_H = 198, LABEL_H = 26;

function fake(charId, col, over = {}) {
  return {
    charId, idx: 0, uid: `${charId}:${col}`, facing: 1, grounded: true,
    vx: 0, vy: 0, percent: 0, act: ACT.FREE, actFrame: 0, moveId: '',
    stun: 0, hitlag: 0, shield: 60, invuln: 0, jumpsLeft: 1,
    exhausted: false, fastFalling: false, charge: 0, x: 0, y: 0,
    lastIn: { b: 0, x: 0, y: 0 },
    ...over,
  };
}

function midHit(char, id) {
  const mv = char.moves[id];
  return Math.floor((mv.hitboxes[0].from + mv.hitboxes[0].to) / 2) + 1;
}

const COLS = [
  ['idle', () => ({})],
  ['run', (char, t) => ({ vx: char.runSpeed, x: t * char.runSpeed * 22 })],
  ['crouch', () => ({ lastIn: { b: 0, x: 0, y: 1 } })],
  ['rise', () => ({ grounded: false, vy: -11 })],
  ['fall', () => ({ grounded: false, vy: 9 })],
  ['jab', (char) => ({ act: ACT.ATTACK, moveId: 'jab', actFrame: midHit(char, 'jab') })],
  ['ftilt wind', (char) => ({ act: ACT.ATTACK, moveId: 'ftilt', actFrame: Math.max(1, char.moves.ftilt.hitboxes[0].from - 3) })],
  ['ftilt hit', (char) => ({ act: ACT.ATTACK, moveId: 'ftilt', actFrame: midHit(char, 'ftilt') })],
  ['uair', (char) => ({ act: ACT.ATTACK, moveId: 'uair', actFrame: midHit(char, 'uair'), grounded: false, vy: -3 })],
  ['dair', (char) => ({ act: ACT.ATTACK, moveId: 'dair', actFrame: midHit(char, 'dair'), grounded: false, vy: 5 })],
  ['nb charge', (char) => ({ act: ACT.ATTACK, moveId: 'nb', actFrame: Math.max(1, (char.specials.nb.fire ?? 10) - 1), charge: 52 })],
  ['side B', (char) => ({ act: ACT.ATTACK, moveId: 'sb', actFrame: Math.floor(((char.specials.sb.from ?? 8) + (char.specials.sb.to ?? 20)) / 2) })],
  ['up B', (char) => ({ act: ACT.ATTACK, moveId: 'ub', actFrame: Math.floor(((char.specials.ub.from ?? 6) + (char.specials.ub.to ?? 20)) / 2), grounded: false, vy: -12 })],
  ['down B', (char) => ({ act: ACT.ATTACK, moveId: 'db', actFrame: Math.floor(((char.specials.db.from ?? 14) + (char.specials.db.to ?? 22)) / 2) })],
  ['shield', () => ({ act: ACT.SHIELD })],
  ['reel', () => ({ act: ACT.HITSTUN, vx: 2, stun: 20 })],
  ['ledge', () => ({ act: ACT.LEDGE, grounded: false })],
  ['dizzy', () => ({ act: ACT.SHIELDBREAK })],
];

const canvas = document.getElementById('sheet');
canvas.width = COLS.length * CELL_W;
canvas.height = CHARACTER_LIST.length * CELL_H + LABEL_H;
const ctx = canvas.getContext('2d');

let t = 0;
function frame() {
  t += 1 / 60;
  ctx.fillStyle = '#0c1026';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // column labels
  ctx.fillStyle = '#8d99c2';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  COLS.forEach(([label], i) => {
    ctx.fillText(label.toUpperCase(), i * CELL_W + CELL_W / 2, 17);
  });

  CHARACTER_LIST.forEach((charId, row) => {
    const char = CHARACTERS[charId];
    const baseY = LABEL_H + row * CELL_H + CELL_H - 28;
    COLS.forEach(([label, make], col) => {
      const cx = col * CELL_W + CELL_W / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(col * CELL_W, LABEL_H + row * CELL_H, CELL_W, CELL_H);
      ctx.clip();
      // cell frame + floor line
      ctx.strokeStyle = '#1d2342';
      ctx.strokeRect(col * CELL_W + 0.5, LABEL_H + row * CELL_H + 0.5, CELL_W - 1, CELL_H - 1);
      ctx.strokeStyle = '#2a3052';
      ctx.beginPath(); ctx.moveTo(col * CELL_W + 8, baseY); ctx.lineTo(col * CELL_W + CELL_W - 8, baseY); ctx.stroke();

      // drawFighter expects the origin at the player's feet. The run column
      // advances p.x for cloth/stride, but stays put on screen.
      const p = fake(charId, col, make(char, t));
      ctx.translate(cx, baseY);
      ctx.scale(1.04, 1.04);
      drawFighter(ctx, p, t);
      ctx.restore();
    });
    // row label
    ctx.save();
    ctx.fillStyle = char.colors.accent;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(char.name, 8, LABEL_H + row * CELL_H + 20);
    ctx.restore();
  });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
