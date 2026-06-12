// ─────────────────────────────────────────────────────────────────────────────
// TIDE — The Wave Duelist. An aquatic fencer of the Drowned Order: fin-crested
// helm, high-collared duelist jacket, flowing water-sash, shell-guard rapier.
// Animation personality: elegant. True fencing stance (side profile, rear arm
// curled), wave-like weight rocking at idle, dramatic full-extension lunges.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, easeOut, palette, paint, ink, disc, roundRect, poly,
  stroke2, limbIK, glowOn, glowOff, chain, chainLocal, ribbon,
  swingTrail, chargeOrb, dizzyStars, face,
} from './common.js';

function rapier(ctx, C) {
  // drawn along +x from the hand
  glowOn(ctx, C.glow, 8);
  // blade
  stroke2(ctx, c => { c.moveTo(6, 0); c.lineTo(46, 0); }, 2.6, C.trail, C.ink, 2.6);
  stroke2(ctx, c => { c.moveTo(8, -0.5); c.lineTo(44, -0.5); }, 1, '#ffffff', null, 0);
  // trident tip
  stroke2(ctx, c => {
    c.moveTo(40, -4.5); c.lineTo(49, 0); c.lineTo(40, 4.5);
  }, 2.4, C.trail, C.ink, 2.4);
  glowOff(ctx);
  // shell guard
  ctx.beginPath();
  ctx.arc(5, 0, 6, -Math.PI * 0.62, Math.PI * 0.62);
  paint(ctx, C.primary, C.ink, 2.2);
  // grip
  stroke2(ctx, c => { c.moveTo(-3, 0); c.lineTo(4, 0); }, 4, C.secondary, C.ink, 2.6);
}

const THRUSTS = new Set(['jab', 'ftilt', 'fair', 'dair', 'dtilt', 'nb', 'sb']);

export const tideRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const SKIN = '#b9e6da';

    // ── metrics + wave rock ──────────────────────────────────────────────
    const idleAmt = A.grounded && !M && !A.guard && !A.dizzy && A.runAmt < 0.05 && !A.crouch ? 1 : 0;
    const rock = idleAmt * Math.sin(t * 1.6) * 2.2;
    const crouchDrop = A.crouch * 13;
    const isThrust = M && THRUSTS.has(M.id);
    const lungeK = isThrust ? (M.ph === 'hit' ? 1 : M.ph === 'rec' ? 1 - M.rk : 0) : 0;
    const hipY = -36 + crouchDrop + lungeK * 5;
    const shY = -62 + crouchDrop * 1.1 + A.breathe * 1.2 + lungeK * 6;
    const headY = -77 + crouchDrop * 1.15 + A.breathe * 1.4 + lungeK * 6;
    const headR = 10;

    let lean = A.lean;
    let lunge = 0;
    if (M) {
      lunge = M.lunge * (isThrust ? 13 : 6);
      if (M.ph === 'wind') lean -= 0.16 * M.wk;
      else if (M.ph === 'hit') lean += isThrust ? 0.34 : 0.2;
      else lean += 0.2 * (1 - M.rk);
      if (M.id === 'ub') lean = -0.25;
    }
    if (A.reel) lean = -0.5;

    // ── water sash ───────────────────────────────────────────────────────
    const wxy = (lx, ly) => [p.x + lx * p.facing * s, p.y + ly * s];
    const [sax, say] = wxy(-7, hipY - 1);
    const sashPts = chainLocal(
      chain(A.st, 'sash', 6, 9.5 * s, sax, say,
        { damp: 0.9, grav: 90, windX: -p.facing * (60 + Math.abs(p.vx) * 14), windY: Math.sin(t * 4.2) * 50 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge + rock * 0.5, 0);
    ctx.rotate(lean * 0.5);

    // sash behind the body — translucent water ribbon
    ctx.save();
    ctx.globalAlpha *= 0.9;
    glowOn(ctx, C.glow, 10);
    ribbon(ctx, sashPts, 13, 3.5, C.glow, C.ink, 2.2);
    ctx.globalAlpha *= 0.55;
    ribbon(ctx, sashPts.map(([x, y]) => [x + 2, y - 2]), 6, 2, '#e8fffb', null);
    glowOff(ctx);
    ctx.restore();

    // ── legs: fencing footwork ───────────────────────────────────────────
    const legW = 5.4, legL = 19;
    let f1 = [11 + rock * 0.6, 0], f2 = [-9 + rock * 0.3, 0];
    let bend1 = 1, bend2 = -1;
    if (A.hang) {
      f1 = [3, -7]; f2 = [-5, -2];
    } else if (A.airborne) {
      if (M && M.id === 'dair') { f1 = [3, 2]; f2 = [-8, -10]; }      // pointed plunge
      else { f1 = [8, -12 - A.rise * 5]; f2 = [-11, -2 + A.fall * 2]; } // scissor
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase, k = A.runAmt;
      f1 = [Math.sin(ph) * 23 * k, -Math.max(0, Math.cos(ph)) * 8 * k];
      f2 = [Math.sin(ph + Math.PI) * 23 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 8 * k];
    } else if (lungeK > 0) {
      f1 = [20 + lungeK * 6, 0]; f2 = [-14 - lungeK * 6, 0];          // full lunge extension
      bend2 = -1;
    }
    limbIK(ctx, -4, hipY, f2[0], f2[1] - 3, legL, legL, bend2, legW, C.secD, C.ink);
    poly(ctx, [[f2[0] - 6, f2[1] - 5], [f2[0] + 6, f2[1] - 5], [f2[0] + 7, f2[1]], [f2[0] - 6, f2[1]]]);
    paint(ctx, C.secD, C.ink, 2);
    limbIK(ctx, 4, hipY, f1[0], f1[1] - 3, legL, legL, bend1, legW, C.secondary, C.ink);
    poly(ctx, [[f1[0] - 6, f1[1] - 5.5], [f1[0] + 7, f1[1] - 5.5], [f1[0] + 9, f1[1]], [f1[0] - 6, f1[1]]]);
    paint(ctx, C.primary, C.ink, 2);

    // ── torso: duelist jacket with high collar ───────────────────────────
    poly(ctx, [[-10.5, shY - 2], [10.5, shY - 2], [8, hipY + 1], [-8, hipY + 1]]);
    paint(ctx, C.primary, C.ink, 2.6);
    poly(ctx, [[-9.2, shY + 11], [9.2, shY + 11], [8, hipY + 1], [-8, hipY + 1]]);
    paint(ctx, C.priD, null);
    // jacket front seam + buttons
    ink(ctx, C.accD, 1.6);
    ctx.beginPath(); ctx.moveTo(2, shY); ctx.lineTo(1, hipY); ctx.stroke();
    for (let i = 0; i < 3; i++) disc(ctx, 4.5, shY + 6 + i * 6.5, 1.3, C.accent, null);
    // waist sash knot
    roundRect(ctx, -8.5, hipY - 4, 17, 5.5, 2.5); paint(ctx, C.glow, C.ink, 2);
    // high collar
    poly(ctx, [[-7.5, shY - 2], [7.5, shY - 2], [6.5, shY - 8], [-6.5, shY - 8]]);
    paint(ctx, C.secondary, C.ink, 2.2);

    // ── back arm: fencer's curl ──────────────────────────────────────────
    const armW = 5, armL = 14.5;
    const shB = [-6, shY + 2];
    let hB = [-13, shY - 12 + rock * 0.4];                  // curled up behind
    if (A.hang) hB = [-4, shY + 12];
    else if (A.guard) hB = [10, shY + 9];
    else if (A.dizzy) hB = [-15, shY + 14];
    else if (A.reel) hB = [-17, shY - 6];
    else if (A.airborne) hB = [-12, shY - 6];
    else if (A.runAmt > 0.05) hB = [-12 - Math.sin(A.runPhase) * 7 * A.runAmt, shY + 6];
    else if (M && M.id === 'db') {
      const k = M.ph === 'hit' ? M.hk : M.ph === 'rec' ? 1 : 0;
      hB = [Math.cos(2.4 + k * 4) * 16, shY + 2 + Math.sin(2.4 + k * 4) * 12];
    } else if (lungeK > 0) hB = [-19 - lungeK * 3, shY - 4 + lungeK * 6];  // counterbalance
    limbIK(ctx, shB[0], shB[1], hB[0], hB[1], armL, armL, 1, armW, C.secD, C.ink);
    disc(ctx, hB[0], hB[1], 3.4, SKIN, C.ink, 1.8);

    // ── head: fin-crest helm ─────────────────────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    disc(ctx, 0, 0, headR, SKIN, C.ink, 2.4);
    // fin ears
    poly(ctx, [[-headR * 0.8, -headR * 0.1], [-headR * 1.8, -headR * 0.55], [-headR * 0.9, headR * 0.5]]);
    paint(ctx, C.glow, C.ink, 2.2);
    poly(ctx, [[-headR * 0.85, -headR * 0.02], [-headR * 1.45, -headR * 0.3], [-headR * 0.9, headR * 0.3]]);
    paint(ctx, C.trail, null);
    // helm cap
    ctx.beginPath();
    ctx.arc(0, -headR * 0.12, headR * 1.08, Math.PI * 0.9, TAU + Math.PI * 0.08);
    paint(ctx, C.primary, C.ink, 2.4);
    // fin crest — tall swept-back sail
    const crestSway = Math.sin(t * 2.8) * 1.2 - p.vx * p.facing * 0.35;
    ctx.beginPath();
    ctx.moveTo(headR * 0.45, -headR * 1.02);
    ctx.quadraticCurveTo(headR * 0.1, -headR * 2.3, -headR * 1.9 + crestSway, -headR * 2.25);
    ctx.quadraticCurveTo(-headR * 1.25 + crestSway * 0.6, -headR * 1.45, -headR * 0.85, -headR * 0.72);
    ctx.closePath();
    paint(ctx, C.glow, C.ink, 2.4);
    ctx.beginPath();
    ctx.moveTo(headR * 0.1, -headR * 1.12);
    ctx.quadraticCurveTo(-headR * 0.1, -headR * 1.95, -headR * 1.2 + crestSway * 0.8, -headR * 1.95);
    ctx.quadraticCurveTo(-headR * 0.85 + crestSway * 0.5, -headR * 1.35, -headR * 0.5, -headR * 0.85);
    ctx.closePath();
    paint(ctx, C.trail, null);
    // crest ribs
    ink(ctx, C.primary, 1.6);
    for (const k of [0.35, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(headR * (0.3 - k * 1.3), -headR * (1.0 + k * 0.18));
      ctx.lineTo(headR * (0.1 - k * 1.9) + crestSway * k, -headR * (1.05 + k * 1.1));
      ctx.stroke();
    }
    face(ctx, headR * 0.3, headR * 0.05, headR, C, A, { color: '#10333d', spread: headR * 0.55 });
    ctx.restore();

    // ── front arm + rapier ───────────────────────────────────────────────
    const shF = [6, shY + 2];
    let hF, wA, flourish = 0;
    if (A.hang) {
      hF = [14, shY - 27 + Math.sin(t * 2.4) * 1.4]; wA = -1.35;
    } else if (A.guard) {
      hF = [13, shY + 6]; wA = -0.9;                       // blade up, guarding
    } else if (A.dizzy) {
      hF = [13 + Math.sin(t * 8.7) * 3, shY + 16]; wA = 0.85;
    } else if (A.reel) {
      hF = [16, shY - 6]; wA = -0.4;
    } else if (M) {
      if (M.id === 'db') {
        // whirlpool: blade sweeps a full circle around him
        const k = M.ph === 'wind' ? 0 : M.ph === 'hit' ? M.hk : 1;
        const a = -0.6 + k * TAU;
        hF = [Math.cos(a) * 17, shY + 4 + Math.sin(a) * 13];
        wA = a + 0.5;
      } else if (M.id === 'ub') {
        hF = [4, shY - 16]; wA = -Math.PI / 2 + 0.06;       // skyward point
      } else if (isThrust) {
        const ext = M.ph === 'wind' ? -M.wk * 0.45 : M.ph === 'hit' ? easeOut(M.hk) : 1 - M.rk * 0.8;
        const reach = 10 + ext * 14;
        hF = [Math.cos(M.aim) * reach, shY + 3 + Math.sin(M.aim) * reach];
        wA = M.aim;                                          // blade locked on target line
      } else {
        const reach = 19;
        hF = [Math.cos(M.swing) * reach, shY + 2 + Math.sin(M.swing) * reach];
        wA = M.swing;
      }
    } else if (A.airborne) {
      hF = [13, shY + 4 - A.rise * 4]; wA = -0.35 + A.fall * 0.45;
    } else if (A.runAmt > 0.05) {
      hF = [12, shY + 10]; wA = 0.55;                        // blade trailing low
    } else {
      // en garde: blade low in front; periodic circular flourish
      if (A.fidget > 0.84 && A.fidget < 0.97) flourish = ((A.fidget - 0.84) / 0.13) * TAU;
      hF = [12 + rock * 0.5 + Math.cos(flourish) * (flourish ? 3 : 0),
            shY + 12 + Math.sin(flourish) * (flourish ? 3 : 0)];
      wA = 0.5 + (flourish ? Math.sin(flourish) * 0.35 : Math.sin(t * 1.6) * 0.05);
    }
    limbIK(ctx, shF[0], shF[1], hF[0], hF[1], armL, armL, -1, armW, C.primary, C.ink);
    ctx.save();
    ctx.translate(hF[0], hF[1]);
    ctx.rotate(wA);
    rapier(ctx, C);
    ctx.restore();
    disc(ctx, hF[0], hF[1], 3.4, SKIN, C.ink, 1.8);

    // ── water FX ─────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      const tipX = hF[0] + Math.cos(wA) * 48, tipY = hF[1] + Math.sin(wA) * 48;
      if (M.id === 'db') {
        // whirlpool rings
        const k = M.hk;
        glowOn(ctx, C.glow, 14);
        ink(ctx, C.glow, 3);
        for (let i = 0; i < 3; i++) {
          const rr = 16 + i * 12 + k * 26;
          ctx.globalAlpha = (0.8 - i * 0.2) * (1 - k * 0.5);
          ctx.beginPath();
          ctx.ellipse(0, -30, rr, rr * 0.5, 0, t * 4 + i, t * 4 + i + 4.6);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glowOff(ctx);
      } else if (isThrust) {
        // ripple rings off the point
        glowOn(ctx, C.glow, 12);
        ink(ctx, C.trail, 2.2);
        for (let i = 0; i < 2; i++) {
          const rr = 4 + (M.hk * 1.4 + i * 0.5) * 10;
          ctx.globalAlpha = clamp01(1.1 - M.hk - i * 0.3);
          ctx.beginPath();
          ctx.ellipse(tipX, tipY, rr * 0.5, rr, wA, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glowOff(ctx);
        // thrust line
        ctx.save();
        ctx.globalAlpha *= (1 - M.hk) * 0.8;
        glowOn(ctx, C.glow, 10);
        stroke2(ctx, c => { c.moveTo(shF[0] + 6, shF[1] + 3); c.lineTo(tipX, tipY); }, 2, '#ffffff', null, 0);
        glowOff(ctx);
        ctx.restore();
      } else {
        swingTrail(ctx, 0, shY + 2, 18, 56, M.aim - 1.7 + M.hk * 0.7, M.swing + 0.3, C.trail, 0.7);
      }
    }
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      chargeOrb(ctx, hF[0] + Math.cos(wA) * 48, hF[1] + Math.sin(wA) * 48, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.4, t);

    ctx.restore();
  },
};

