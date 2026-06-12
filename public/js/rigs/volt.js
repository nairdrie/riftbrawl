// ─────────────────────────────────────────────────────────────────────────────
// VOLT — The Storm Dancer. Pint-sized lightning duelist: huge crackling energy
// hair, goggle visor, streaming bolt-scarf, reverse-grip storm dagger.
// Animation personality: kinetic. Bounces on his toes at idle, sprints in a
// full lean with speed streaks, snaps through attacks with electric arcs.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, easeOut, palette, paint, ink, disc, roundRect, poly,
  stroke2, limbIK, glowOn, glowOff, chain, chainLocal, ribbon,
  swingTrail, bolt, chargeOrb, dizzyStars, face,
} from './common.js';

function dagger(ctx, C, twirl = 0) {
  ctx.save();
  if (twirl) ctx.rotate(twirl);
  // zigzag blade
  glowOn(ctx, C.accent, 12);
  stroke2(ctx, c => {
    c.moveTo(3, 0); c.lineTo(14, -4); c.lineTo(22, 2); c.lineTo(34, -3);
  }, 5, C.accent, C.ink, 3.6);
  stroke2(ctx, c => {
    c.moveTo(4, 0); c.lineTo(14, -3); c.lineTo(22, 1); c.lineTo(32, -2.5);
  }, 1.8, '#ffffff', null, 0);
  glowOff(ctx);
  // guard + grip
  stroke2(ctx, c => { c.moveTo(2, -5); c.lineTo(2, 5); }, 3.6, C.primary, C.ink, 3);
  ctx.restore();
}

export const voltRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const SKIN = '#ffe3bd';

    // ── metrics + idle bounce ────────────────────────────────────────────
    const idleAmt = A.grounded && !M && !A.guard && !A.dizzy && A.runAmt < 0.05 && !A.crouch ? 1 : 0;
    const bounce = idleAmt * Math.abs(Math.sin(t * 4.8)) * -2.6;
    const crouchDrop = A.crouch * 12;
    const hipY = -31 + crouchDrop + bounce * 0.6;
    const shY = -53 + crouchDrop * 1.1 + bounce;
    const headY = -68 + crouchDrop * 1.15 + bounce * 1.15;
    const headR = 11.5;

    let lean = A.lean * 1.5;             // exaggerated sprint lean
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 8;
      if (M.ph === 'wind') lean -= 0.18 * M.wk;
      else if (M.ph === 'hit') lean += 0.3;
      else lean += 0.3 * (1 - M.rk);
      if (M.id === 'sb') { lean = M.ph === 'hit' ? 0.75 : lean; lunge = M.ph === 'hit' ? 12 : 0; }
      if (M.id === 'ub') lean = -0.35;
    }
    if (A.reel) lean = -0.55;
    const weightShift = idleAmt * Math.sin(t * 2.4) * 2.2;

    // ── scarf (world space) ──────────────────────────────────────────────
    const wxy = (lx, ly) => [p.x + lx * p.facing * s, p.y + ly * s];
    const [sax, say] = wxy(-4, shY + 1);
    const scarfPts = chainLocal(
      chain(A.st, 'scarf', 6, 8 * s, sax, say,
        { damp: 0.9, grav: 50, windX: -p.facing * (90 + Math.abs(p.vx) * 18), windY: Math.sin(t * 7) * 40 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge + weightShift * 0.4, 0);

    // speed streaks when sprinting
    if (A.grounded && Math.abs(p.vx) > 6) {
      ctx.save();
      ctx.globalAlpha *= 0.4;
      glowOn(ctx, C.accent, 8);
      ink(ctx, C.accent, 2.2);
      for (let i = 0; i < 3; i++) {
        const yy = -16 - i * 16 + Math.sin(t * 31 + i * 2) * 2;
        ctx.beginPath();
        ctx.moveTo(-18 - i * 7, yy);
        ctx.lineTo(-44 - i * 9, yy + 2);
        ctx.stroke();
      }
      glowOff(ctx);
      ctx.restore();
    }

    ctx.rotate(lean * 0.55);

    // nair / dair: whole-body spin
    let bodySpin = 0;
    if (M && (M.id === 'nair' || M.id === 'dair') && M.ph !== 'wind') {
      bodySpin = (M.ph === 'hit' ? M.hk : 1 + M.rk * 0.3) * TAU * (M.id === 'dair' ? 0.6 : 1);
      ctx.translate(0, hipY); ctx.rotate(bodySpin * (M.id === 'dair' ? 0.3 : 1)); ctx.translate(0, -hipY);
    }

    // ── scarf behind body ────────────────────────────────────────────────
    glowOn(ctx, C.accent, 6);
    ribbon(ctx, scarfPts, 10, 3, C.accent, C.ink, 2);
    glowOff(ctx);

    // ── legs ─────────────────────────────────────────────────────────────
    const legW = 6.2, legL = 16.5;
    let f1 = [7 + weightShift * 0.4, bounce * 0.25], f2 = [-7 + weightShift * 0.4, bounce * 0.25];
    let bend1 = 1, bend2 = -1;
    if (A.hang) {
      f1 = [3, -8 + Math.sin(t * 6) * 2]; f2 = [-5, -3 + Math.sin(t * 6 + 1.5) * 2];  // impatient kicking
    } else if (A.airborne) {
      if (M && M.id === 'dair') { f1 = [2, 6]; f2 = [-3, 7]; }                        // drill point
      else { f1 = [9 + A.rise * 4, -14 - A.rise * 7]; f2 = [-9, -3 - A.rise * 6]; }   // tuck
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase * 1.15, k = A.runAmt;
      f1 = [Math.sin(ph) * 19 * k, -Math.max(0, Math.cos(ph)) * 11 * k];
      f2 = [Math.sin(ph + Math.PI) * 19 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 11 * k];
    }
    limbIK(ctx, -3.5, hipY, f2[0], f2[1] - 3, legL, legL, bend2, legW, C.secD, C.ink);
    roundRect(ctx, f2[0] - 6, f2[1] - 6, 13, 7, 3); paint(ctx, C.priD, C.ink, 2);
    limbIK(ctx, 3.5, hipY, f1[0], f1[1] - 3, legL, legL, bend1, legW, C.secondary, C.ink);
    roundRect(ctx, f1[0] - 6, f1[1] - 7, 14, 8, 3); paint(ctx, C.primary, C.ink, 2);

    // ── torso: sleeveless suit ───────────────────────────────────────────
    poly(ctx, [[-10, shY - 2], [10, shY - 2], [8, hipY + 2], [-8, hipY + 2]]);
    paint(ctx, C.secL, C.ink, 2.6);
    poly(ctx, [[-9, shY + 10], [9, shY + 10], [8, hipY + 2], [-8, hipY + 2]]);
    paint(ctx, C.secondary, null);
    // lightning chevron on chest
    glowOn(ctx, C.accent, 8);
    stroke2(ctx, c => {
      c.moveTo(-5, shY + 4); c.lineTo(3, shY + 9); c.lineTo(-3, shY + 13); c.lineTo(5, shY + 18);
    }, 3.4, C.primary, null, 0);
    glowOff(ctx);
    // belt
    roundRect(ctx, -8.5, hipY - 3, 17, 4.5, 2); paint(ctx, C.primary, C.ink, 1.8);

    // ── back arm (boxer guard / swing assist) ────────────────────────────
    const armW = 5.8, armL = 13.5;
    const shB = [-5, shY + 2];
    let hB = [-12, shY + 10];
    if (idleAmt) hB = [2 - weightShift * 0.3, shY + 6 + Math.sin(t * 4.8) * 1.4];   // guard fist up
    if (A.hang) hB = [-3, shY + 12];
    if (M) {
      if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : 1;
        hB = [lerp(-6, -22, k), shY + lerp(6, -12, k)];        // X-pose
      } else hB = [-13, shY + 8 - M.k * 4];
    }
    if (A.reel) hB = [-16, shY - 8];
    limbIK(ctx, shB[0], shB[1], hB[0], hB[1], armL, armL, 1, armW, C.secD, C.ink);
    disc(ctx, hB[0], hB[1], 4, C.priD, C.ink, 2);

    // ── head: spiky energy hair + goggles ────────────────────────────────
    ctx.save();
    ctx.translate(lean * 6 + weightShift * 0.3, headY);
    // hair — one chunky mass swept up and back, flickering like live current
    const flick = (i) => Math.sin(t * 13 + i * 2.7) * 1.8;
    glowOn(ctx, C.accent, 10);
    poly(ctx, [
      [headR * 0.92, -headR * 0.42],
      [headR * 0.5, -headR * 1.1],
      [headR * 0.9 + flick(3) * 0.5, -headR * 1.8],
      [headR * 0.08, -headR * 1.32],
      [-headR * 0.12, -headR * 2.35 + flick(2)],
      [-headR * 0.72, -headR * 1.28],
      [-headR * 1.65 + flick(1), -headR * 1.7],
      [-headR * 1.02, -headR * 0.72],
      [-headR * 2.3 + flick(0), -headR * 0.68],
      [-headR * 1.02, -headR * 0.08],
    ]);
    paint(ctx, C.primary, C.ink, 2.2);
    // hair shadow at the roots
    poly(ctx, [
      [headR * 0.55, -headR * 0.78],
      [headR * 0.1, -headR * 1.05],
      [-headR * 0.62, -headR * 1.0],
      [-headR * 0.95, -headR * 0.5],
      [headR * 0.4, -headR * 0.55],
    ]);
    paint(ctx, C.priD, null);
    glowOff(ctx);
    // face
    disc(ctx, 0, 0, headR, SKIN, C.ink, 2.6);
    // goggle band + glowing lens eyes
    roundRect(ctx, -headR * 1.0, -headR * 0.42, headR * 2.05, headR * 0.78, headR * 0.36);
    paint(ctx, C.secondary, C.ink, 2.2);
    glowOn(ctx, C.accent, 8);
    face(ctx, headR * 0.18, headR * -0.02, headR * 1.05, C, A, { color: C.accent, spread: headR * 0.6 });
    glowOff(ctx);
    // grin
    ink(ctx, C.ink, 1.6);
    ctx.beginPath();
    if (A.hit || A.dizzy) ctx.arc(headR * 0.3, headR * 0.62, headR * 0.18, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(headR * 0.28, headR * 0.42, headR * 0.26, Math.PI * 0.12, Math.PI * 0.78);
    ctx.stroke();
    ctx.restore();

    // ── front arm + dagger ───────────────────────────────────────────────
    const shF = [5, shY + 2];
    let hF, wA = 0, twirl = 0, showDagger = true;
    if (A.hang) {
      hF = [13, shY - 26 + Math.sin(t * 3) * 1.5]; wA = -1.3;
    } else if (A.guard) {
      hF = [11, shY + 7]; wA = -1.0;
    } else if (A.dizzy) {
      hF = [14 + Math.sin(t * 9) * 3, shY + 16]; wA = 0.8;
    } else if (A.reel) {
      hF = [16, shY - 7]; wA = -0.5;
    } else if (M) {
      const reach = 19;
      if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : 1;
        hF = [lerp(8, 22, k), shY + lerp(6, -12, k)]; wA = -0.8;   // X-pose burst
      } else if (M.id === 'ub') {
        hF = [6, shY - 17]; wA = -Math.PI / 2;                      // superman zip
      } else {
        hF = [Math.cos(M.swing) * reach, shY + 2 + Math.sin(M.swing) * reach];
        wA = M.swing;
      }
    } else if (A.airborne) {
      hF = [13, shY + 4 - A.rise * 5]; wA = -0.5 + A.fall * 0.5;
    } else if (A.runAmt > 0.05) {
      hF = [10 + Math.sin(A.runPhase * 1.15 + Math.PI) * 9 * A.runAmt, shY + 9];
      wA = 0.45;          // blade trailing low while sprinting
    } else {
      // boxer guard; periodic dagger twirl
      hF = [10 + weightShift * 0.3, shY + 5 + Math.sin(t * 4.8 + 0.6) * 1.4];
      wA = -1.15;
      if (A.fidget > 0.82 && A.fidget < 0.95) twirl = ((A.fidget - 0.82) / 0.13) * TAU;
    }
    limbIK(ctx, shF[0], shF[1], hF[0], hF[1], armL, armL, -1, armW, C.secL, C.ink);
    if (showDagger) {
      ctx.save();
      ctx.translate(hF[0], hF[1]);
      ctx.rotate(wA);
      dagger(ctx, C, twirl);
      ctx.restore();
    }
    disc(ctx, hF[0], hF[1], 4.2, C.primary, C.ink, 2);

    // ── electric FX ──────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // radial overload bolts
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + t * 2;
          const rr = 22 + M.hk * 26;
          bolt(ctx, Math.cos(a) * 10, shY + Math.sin(a) * 10,
            Math.cos(a) * rr, shY + Math.sin(a) * rr, t * 60 + i, C.accent, 2.2, C.glow);
        }
      } else if (M.id !== 'nb') {
        swingTrail(ctx, 0, shY + 2, 16, 50, M.aim - 1.6 + M.hk * 0.8, M.swing + 0.35, C.trail, 0.75);
        const tipX = hF[0] + Math.cos(wA) * 30, tipY = hF[1] + Math.sin(wA) * 30;
        bolt(ctx, hF[0], hF[1], tipX + 8, tipY, Math.floor(t * 30), '#ffffff', 1.8, C.accent);
      }
    }
    // ambient idle sparks
    if (idleAmt && Math.sin(t * 9.1) > 0.93) {
      const a = t * 17 % TAU;
      bolt(ctx, Math.cos(a) * 9, headY - 4, Math.cos(a) * 19, headY - 10 + Math.sin(a) * 8, t * 40, C.accent, 1.6);
    }
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      chargeOrb(ctx, hF[0] + Math.cos(wA) * 22, hF[1] + Math.sin(wA) * 22, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.4, t);

    ctx.restore();
  },
};
