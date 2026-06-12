// ─────────────────────────────────────────────────────────────────────────────
// Fighter rendering hub. Every character has a bespoke rig (see js/rigs/) with
// its own silhouette, proportions, cloth physics and per-move performances —
// driven directly by sim state (no sprite assets, crisp at any zoom).
// Convention: feet at (0,0), y negative = up, +x = facing direction.
// ─────────────────────────────────────────────────────────────────────────────

import { ACT, SMASH_CHARGE } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { deriveAnim, drawStar as starFn, TAU } from './rigs/common.js';

const SMASH_MOVES = new Set(['ftilt', 'utilt', 'dtilt']);
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

  // grabbing arm + hand (local space: +x is forward)
  if (p.act === ACT.GRAB) {
    const open = (p.grabbing ?? -1) < 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = c.secondary; ctx.lineWidth = 7.5;
    ctx.beginPath(); ctx.moveTo(7, -46); ctx.lineTo(30, -44); ctx.stroke();
    ctx.strokeStyle = c.primary; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(7, -46); ctx.lineTo(30, -44); ctx.stroke();
    ctx.shadowColor = c.glow; ctx.shadowBlur = open ? 0 : 12;
    ctx.fillStyle = open ? c.primary : c.accent;
    if (open) {                              // open hand — spread fingers
      for (let i = 0; i < 3; i++) {
        const a = -0.5 + i * 0.5;
        ctx.beginPath(); ctx.moveTo(30, -44);
        ctx.lineTo(38 + Math.cos(a) * 2, -44 + Math.sin(a) * 8);
        ctx.lineWidth = 3; ctx.strokeStyle = c.primary; ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(31, -44, open ? 5.5 : 6, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.restore();

  // smash-attack charge aura (world-aligned)
  if (p.act === ACT.ATTACK && (p.charge || 0) > 0 && SMASH_MOVES.has(p.moveId)) {
    const k = Math.min(1, p.charge / SMASH_CHARGE.max);
    const r = (38 + k * 26) * s;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(t * (9 + k * 18)));
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2 + k * 3;
    ctx.shadowColor = c.glow; ctx.shadowBlur = 12 + k * 24;
    ctx.beginPath(); ctx.arc(0, -40 * s, r, 0, TAU); ctx.stroke();
    if (k >= 1) {
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 6; i++) {
        const a = t * 7 + i * (TAU / 6);
        const rr = r * (0.9 + Math.sin(t * 20 + i) * 0.12);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, -40 * s + Math.sin(a) * rr, 2.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

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
