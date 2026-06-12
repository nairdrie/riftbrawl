// ─────────────────────────────────────────────────────────────────────────────
// Fighter rendering hub. Every character has a bespoke rig (see js/rigs/) with
// its own silhouette, proportions, cloth physics and per-move performances —
// driven directly by sim state (no sprite assets, crisp at any zoom).
// Convention: feet at (0,0), y negative = up, +x = facing direction.
// ─────────────────────────────────────────────────────────────────────────────

import { ACT } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { deriveAnim, drawStar as starFn, TAU } from './rigs/common.js';
import { aegisRig } from './rigs/aegis.js';
import { voltRig } from './rigs/volt.js';
import { emberRig } from './rigs/ember.js';
import { tideRig } from './rigs/tide.js';
import { novaRig } from './rigs/nova.js';

const RIGS = {
  aegis: aegisRig,
  volt: voltRig,
  ember: emberRig,
  tide: tideRig,
  nova: novaRig,
};

export const drawStar = starFn;

// p: sim player, t: seconds for ambient anim, opts: {ghost}
export function drawFighter(ctx, p, t, opts = {}) {
  const char = CHARACTERS[p.charId];
  const rig = RIGS[p.charId];
  if (!char || !rig) return;
  const c = char.colors;
  const s = char.scale;
  const A = deriveAnim(p, char, t);

  ctx.save();
  if (opts.ghost) ctx.globalAlpha = 0.45;
  // invulnerability shimmer
  if (p.invuln > 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha *= 0.45;

  // ambient aura (world-aligned, behind the rig)
  const aura = ctx.createRadialGradient(0, -42 * s, 6, 0, -42 * s, 72 * s);
  aura.addColorStop(0, c.glow + '2e');
  aura.addColorStop(1, c.glow + '00');
  ctx.fillStyle = aura;
  ctx.fillRect(-72 * s, -114 * s, 144 * s, 144 * s);

  ctx.scale(p.facing * s, s);
  ctx.translate(A.jitter.x, A.jitter.y);

  if (A.tumble) {
    ctx.translate(0, -40);
    ctx.rotate(A.tumble);
    ctx.translate(0, 40);
  }

  // squash & stretch about the feet
  if (A.squash !== 1) ctx.scale(1 + (1 - A.squash) * 0.65, A.squash);

  rig.draw(ctx, p, char, A, t);
  ctx.restore();

  // shield bubble (world-aligned, drawn over everything)
  if (p.act === ACT.SHIELD) {
    const shieldT = p.shield / 60;
    const r = (46 + shieldT * 18) * s;
    ctx.save();
    const g = ctx.createRadialGradient(0, -40 * s, r * 0.3, 0, -40 * s, r);
    g.addColorStop(0, c.glow + '14');
    g.addColorStop(0.8, c.glow + '52');
    g.addColorStop(1, c.glow + 'aa');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -40 * s, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = c.glow + 'dd';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// ── portrait rendering (char select cards, HUD chips) ───────────────────────

export function drawPortrait(canvas, charId, t = 0, hover = 0) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const char = CHARACTERS[charId];
  const c = char.colors;
  ctx.clearRect(0, 0, w, h);

  // backdrop
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, c.secondary);
  bg.addColorStop(1, '#0a0c18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const halo = ctx.createRadialGradient(w / 2, h * 0.58, 10, w / 2, h * 0.58, w * 0.72);
  halo.addColorStop(0, c.glow + (hover ? '5e' : '36'));
  halo.addColorStop(1, c.glow + '00');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // pedestal glow
  ctx.save();
  ctx.globalAlpha = 0.7;
  const ped = ctx.createRadialGradient(w / 2, h * 0.92, 2, w / 2, h * 0.92, w * 0.34);
  ped.addColorStop(0, c.glow + '66');
  ped.addColorStop(1, c.glow + '00');
  ctx.fillStyle = ped;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.92, w * 0.34, h * 0.05, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // fighter in idle pose, feet near bottom
  const fake = {
    charId, idx: 0, facing: 1, grounded: true, vx: 0, vy: 0,
    act: ACT.FREE, actFrame: 0, moveId: '', invuln: 0, shield: 60,
    hitlag: 0, charge: 0, fastFalling: false,
    x: 0, y: 0, lastIn: { b: 0, x: 0, y: 0 },
  };
  ctx.save();
  ctx.translate(w / 2 - 4, h * 0.93);
  const sc = (h / 124) * (1 + hover * 0.05);
  ctx.scale(sc, sc);
  drawFighter(ctx, fake, t);
  ctx.restore();
}
