// ─────────────────────────────────────────────────────────────────────────────
// NOVA — The Void Sentinel. A dying star given armor: hooded void helm with a
// glowing star-eye, crescent pauldrons, NO legs — the body trails into a
// stardust wisp tail. Three crystal shards orbit her constantly and her void
// orb fights telekinetically, sweeping around her on its own.
// Animation personality: weightless and slow — everything drifts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, easeOut, palette, paint, ink, disc, roundRect, poly,
  stroke2, limbIK, glowOn, glowOff, chain, chainLocal, ribbon,
  swingTrail, chargeOrb, dizzyStars, drawStar, shade,
} from './common.js';

function voidOrb(ctx, C, r, t, hot = 0) {
  glowOn(ctx, C.glow, 16 + hot * 14);
  disc(ctx, 0, 0, r, C.secD, C.ink, 2.4);
  disc(ctx, 0, 0, r * 0.66, C.accent, null);
  disc(ctx, 0, 0, r * 0.3, '#ffffff', null);
  glowOff(ctx);
  // orbit ring
  ink(ctx, C.primary, 1.8);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.55, r * 0.5, 0.5 + t * 0.9, 0, TAU);
  ctx.stroke();
}

function shard(ctx, C, sz, a) {
  ctx.save();
  ctx.rotate(a);
  poly(ctx, [[0, -sz], [sz * 0.55, 0], [0, sz * 1.25], [-sz * 0.55, 0]]);
  paint(ctx, C.primary, C.ink, 2);
  poly(ctx, [[0, -sz * 0.5], [sz * 0.28, 0], [0, sz * 0.7], [-sz * 0.28, 0]]);
  paint(ctx, C.glow, null);
  ctx.restore();
}

export const novaRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;

    // ── float: she never stands ──────────────────────────────────────────
    const bob = Math.sin(t * 2.1 + (p.idx ?? 0)) * 3;
    const hover = (A.grounded ? -9 : -2) + bob + A.crouch * 7;
    const waistY = -30 + hover;
    const shY = -56 + hover + A.breathe * 1.4;
    const headY = -72 + hover + A.breathe * 1.7;
    const headR = 11.5;

    let lean = A.lean * 1.3;                       // glides with a forward tilt
    if (A.grounded) lean = A.runAmt * 0.3 * (p.vx * p.facing >= 0 ? 1 : -0.5);
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 5;
      if (M.ph === 'wind') lean -= 0.12 * M.wk;
      else if (M.ph === 'hit') lean += 0.18;
      else lean += 0.18 * (1 - M.rk);
      if (M.id === 'ub') lean = -0.35;
    }
    if (A.reel) lean = -0.45;

    // ── stardust tail (replaces legs) ────────────────────────────────────
    const wxy = (lx, ly) => [p.x + lx * p.facing * s, p.y + ly * s];
    const [tx0, ty0] = wxy(0, waistY + 4);
    const tailPts = chainLocal(
      chain(A.st, 'tail', 6, 8.5 * s, tx0, ty0,
        { damp: 0.92, grav: 60, windX: -p.facing * (20 + Math.abs(p.vx) * 22), windY: Math.sin(t * 3.1) * 30 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge, 0);
    ctx.rotate(lean * 0.55);

    // ── halo ring behind everything ──────────────────────────────────────
    ctx.save();
    ctx.translate(0, headY - 2);
    ctx.rotate(Math.sin(t * 0.7) * 0.12);
    glowOn(ctx, C.glow, 12);
    ink(ctx, C.accent + 'bb', 2.4);
    ctx.beginPath(); ctx.ellipse(0, 0, headR * 2.5, headR * 2.5 * 0.3, -0.18, 0, TAU); ctx.stroke();
    glowOff(ctx);
    ctx.restore();

    // ── orbiting shards: back pass ───────────────────────────────────────
    const shardPos = [];
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + (i / 3) * TAU;
      const sx = Math.cos(a) * 30, sy = -42 + hover * 0.5 + Math.sin(a) * 13;
      shardPos.push([sx, sy, a, Math.sin(a) < 0]);
    }
    for (const [sx, sy, a, back] of shardPos) {
      if (back) { ctx.save(); ctx.globalAlpha *= 0.75; ctx.translate(sx, sy); shard(ctx, C, 5, a * 0.7); ctx.restore(); }
    }

    // ── tail ─────────────────────────────────────────────────────────────
    const tail = [[0, waistY + 2], ...tailPts.slice(1)];
    glowOn(ctx, C.glow, 12);
    ribbon(ctx, tail, 21, 2, shade(C.secondary, 1.5), C.ink, 2.6);
    ctx.save();
    ctx.globalAlpha *= 0.55;
    ribbon(ctx, tail.map(([x, y]) => [x + 1.5, y]), 11, 1, C.primary, null);
    ctx.restore();
    glowOff(ctx);
    // stars inside the tail
    for (let i = 1; i < 4; i++) {
      const [px2, py2] = tail[i];
      const tw = 0.5 + 0.5 * Math.sin(t * 3.4 + i * 2.2);
      ctx.save();
      ctx.globalAlpha *= 0.5 + tw * 0.5;
      drawStar(ctx, px2 + Math.sin(t * 2 + i) * 2, py2, 2.4 - i * 0.4, i % 2 ? C.accent : '#ffffff');
      ctx.restore();
    }

    // ── back arm ─────────────────────────────────────────────────────────
    const armW = 6, armL = 14;
    const shB = [-7, shY + 3];
    let hB = [-13, shY + 16 + Math.sin(t * 2.1) * 1.5];
    if (A.hang) hB = [-2, shY + 14];
    else if (A.dizzy) hB = [-15, shY + 14];
    else if (A.reel) hB = [-16, shY - 5];
    else if (M && M.ph !== 'wind') hB = [-15, shY + 6];
    limbIK(ctx, shB[0], shB[1], hB[0], hB[1], armL, armL, 1, armW, C.secD, C.ink);
    disc(ctx, hB[0], hB[1], 4.4, C.secD, C.ink, 2);

    // ── torso: armored bust ──────────────────────────────────────────────
    poly(ctx, [[-15, shY - 2], [15, shY - 2], [10, waistY + 2], [-10, waistY + 2]]);
    paint(ctx, C.primary, C.ink, 2.8);
    poly(ctx, [[-13, shY + 10], [13, shY + 10], [10, waistY + 2], [-10, waistY + 2]]);
    paint(ctx, C.priD, null);
    // star core
    glowOn(ctx, C.accent, A.move ? 16 : 10);
    drawStar(ctx, 0, shY + 8, 5 + Math.sin(t * 2.6) * 0.6, C.accent);
    glowOff(ctx);
    // crescent pauldrons
    for (const [px2, back] of [[-13, true], [13, false]]) {
      ctx.beginPath();
      ctx.arc(px2, shY - 2, 9.5, Math.PI * 0.85, TAU * 1.08);
      paint(ctx, back ? shade(C.primary, 0.6) : shade(C.primary, 0.82), C.ink, 2.6);
      glowOn(ctx, C.glow, 6);
      stroke2(ctx, c => { c.arc(px2, shY - 4, 7, Math.PI * 1.15, Math.PI * 1.85); }, 2.4, C.accent, null, 0);
      glowOff(ctx);
    }

    // ── head: hooded void helm with star eye ─────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    // hood
    ctx.beginPath();
    ctx.arc(0, 0, headR * 1.12, 0, TAU);
    paint(ctx, C.secondary, C.ink, 2.8);
    ctx.beginPath();
    ctx.arc(0, -headR * 0.16, headR * 1.06, Math.PI * 0.88, TAU + Math.PI * 0.12);
    paint(ctx, C.primary, C.ink, 2.4);
    // crown crescent
    glowOn(ctx, C.accent, 8);
    stroke2(ctx, c => { c.arc(0, -headR * 1.05, headR * 0.5, Math.PI * 1.05, Math.PI * 1.95); }, 2.6, C.accent, C.ink, 2.4);
    glowOff(ctx);
    // void face
    disc(ctx, headR * 0.12, headR * 0.1, headR * 0.78, '#120c26', null);
    // star eye — the entire face
    const eyeFlare = M ? 1.3 : A.hit || A.dizzy ? 0.6 : 1;
    glowOn(ctx, C.accent, 13);
    if (A.blink && !M && !A.hit && !A.dizzy) {
      stroke2(ctx, c => { c.moveTo(headR * -0.1, headR * 0.05); c.lineTo(headR * 0.5, headR * 0.05); }, 2, C.accent, null, 0);
    } else if (A.dizzy) {
      ink(ctx, C.accent, 2);
      ctx.beginPath(); ctx.arc(headR * 0.2, headR * 0.05, headR * 0.3, t * 7, t * 7 + 4.8); ctx.stroke();
    } else {
      drawStar(ctx, headR * 0.2, headR * 0.05, headR * 0.34 * eyeFlare, A.hit ? '#ff8a6b' : '#ffffff');
      disc(ctx, headR * 0.2, headR * 0.05, headR * 0.1, A.hit ? '#ff8a6b' : C.accent, null);
    }
    glowOff(ctx);
    ctx.restore();

    // ── front arm: gestures, the orb obeys ───────────────────────────────
    const shF = [7, shY + 3];
    let hF, orbX, orbY, orbR = 8, orbHot = 0;
    const orbIdleA = t * 1.1;
    if (A.hang) {
      hF = [14, shY - 26 + Math.sin(t * 2.2) * 1.5];
      orbX = -10; orbY = shY - 6;
    } else if (A.guard) {
      hF = [13, shY + 8];
      orbX = 18; orbY = shY + 2; orbHot = 0.5;
    } else if (A.dizzy) {
      hF = [14 + Math.sin(t * 8.2) * 3, shY + 15];
      orbX = Math.cos(t * 5) * 16; orbY = headY - 14 + Math.sin(t * 5) * 4;
    } else if (A.reel) {
      hF = [16, shY - 6];
      orbX = -14; orbY = shY - 10;
    } else if (M) {
      orbHot = M.ph === 'hit' ? 1 : 0.5;
      if (M.id === 'db') {
        // black halo: orb high, rings collapse
        hF = [6, shY - 14];
        orbX = 0; orbY = shY - 26; orbR = 10 + (M.ph === 'hit' ? M.hk * 4 : 0);
      } else if (M.id === 'ub') {
        hF = [4, shY - 16];
        orbX = 0; orbY = waistY + 18; orbR = 9;            // orb as booster below
      } else {
        // orb sweeps the strike arc; hand points along it
        const reach = M.ph === 'wind' ? 18 : 34;
        orbX = Math.cos(M.swing) * reach;
        orbY = shY + 4 + Math.sin(M.swing) * reach * 0.9;
        hF = [Math.cos(M.swing) * 15, shY + 3 + Math.sin(M.swing) * 15];
      }
    } else if (A.airborne) {
      hF = [13, shY + 6 - A.rise * 4];
      orbX = Math.cos(orbIdleA) * 24; orbY = shY + 6 + Math.sin(orbIdleA) * 9;
    } else {
      // idle: palm up, orb lazily circling above it
      hF = [13, shY + 12];
      orbX = 13 + Math.cos(orbIdleA) * 7;
      orbY = shY - 2 + Math.sin(orbIdleA * 2) * 3;
    }
    limbIK(ctx, shF[0], shF[1], hF[0], hF[1], armL, armL, -1, armW, C.primary, C.ink);
    disc(ctx, hF[0], hF[1], 4.4, C.secondary, C.ink, 2);
    glowOn(ctx, C.glow, 6);
    disc(ctx, hF[0], hF[1], 2, C.accent, null);             // palm light
    glowOff(ctx);

    // the orb itself
    ctx.save();
    ctx.translate(orbX, orbY);
    voidOrb(ctx, C, orbR, t, orbHot);
    ctx.restore();

    // ── front shards ─────────────────────────────────────────────────────
    for (const [sx, sy, a, back] of shardPos) {
      if (!back) { ctx.save(); ctx.translate(sx, sy); shard(ctx, C, 5.5, a * 0.7); ctx.restore(); }
    }

    // ── void FX ──────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // collapsing rings → implosion
        const k = M.hk;
        glowOn(ctx, C.glow, 16);
        ink(ctx, C.accent, 2.6);
        for (let i = 0; i < 3; i++) {
          const rr = lerp(70, 12, clamp01(k * 1.3 - i * 0.12));
          ctx.globalAlpha = 0.85 - i * 0.22;
          ctx.beginPath();
          ctx.ellipse(0, -34, rr, rr * 0.62, t * 0.8 + i, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glowOff(ctx);
      } else if (M.id === 'ub') {
        // booster star trail
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.globalAlpha *= 0.7 - i * 0.2;
          drawStar(ctx, Math.sin(t * 9 + i * 2) * 6, waistY + 26 + i * 12, 4 - i * 0.8, i % 2 ? C.accent : '#ffffff');
          ctx.restore();
        }
      } else if (M.id !== 'nb') {
        swingTrail(ctx, 0, shY + 4, 18, 52, M.aim - 1.8 + M.hk * 0.7, M.swing + 0.3, C.accent, 0.65);
        // void crackle at the orb
        ctx.save();
        ctx.globalAlpha *= 0.8;
        glowOn(ctx, C.accent, 12);
        ink(ctx, C.accent, 1.8);
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbR * 1.9, t * 14, t * 14 + 2.2);
        ctx.stroke();
        glowOff(ctx);
        ctx.restore();
      }
    }
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      chargeOrb(ctx, orbX, orbY - 12, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.3, t);

    ctx.restore();
  },
};
