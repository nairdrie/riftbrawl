// ─────────────────────────────────────────────────────────────────────────────
// AEGIS — The Bastion. A rune-forged colossus: massive pauldrons, crowned helm
// with a streaming plume, heavy cape, two-handed warhammer. Animation
// personality: monumental. Slow heavy breathing, hammer planted at rest,
// stomping run with real weight, huge committed swings.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, easeOut, easeIn, palette, paint, ink, disc, roundRect,
  poly, stroke2, limbIK, glowOn, glowOff, chain, chainLocal, ribbon,
  swingTrail, chargeOrb, dizzyStars, face,
} from './common.js';

function hammer(ctx, C, gripK = 0.18) {
  // drawn along +x from the grip hand; gripK = where along the haft we hold
  const L = 62;
  const x0 = -L * gripK, x1 = L * (1 - gripK);
  ctx.save();
  // haft
  stroke2(ctx, c => { c.moveTo(x0, 0); c.lineTo(x1, 0); }, 6.5, C.secL, C.ink);
  // grip wrap
  stroke2(ctx, c => { c.moveTo(x0 + 3, 0); c.lineTo(x0 + 16, 0); }, 8, C.secD, C.ink, 3);
  // head
  glowOn(ctx, C.accent, 10);
  roundRect(ctx, x1 - 13, -17, 30, 34, 6);
  paint(ctx, C.primary, C.ink, 3);
  glowOff(ctx);
  // strike faces
  roundRect(ctx, x1 + 11, -14, 7, 28, 3);
  paint(ctx, C.priL, C.ink, 2.2);
  roundRect(ctx, x1 - 17, -11, 7, 22, 3);
  paint(ctx, C.priD, C.ink, 2.2);
  // rune core
  glowOn(ctx, C.glow, 14);
  roundRect(ctx, x1 - 5, -8, 8, 16, 3);
  paint(ctx, C.accent, null);
  glowOff(ctx);
  ctx.restore();
}

export const aegisRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;

    // ── metrics ──────────────────────────────────────────────────────────
    const crouchDrop = A.crouch * 15;
    const breathY = A.breathe * 1.6;
    const stepBob = A.grounded ? Math.abs(Math.sin(A.runPhase)) * 4.5 * A.runAmt : 0;
    const hipY = -39 + crouchDrop + stepBob * 0.55;
    const shY = -66 + crouchDrop * 1.12 + breathY + stepBob;
    const headY = -82 + crouchDrop * 1.18 + breathY * 1.25 + stepBob;
    const headR = 11;

    let lean = A.lean;
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 6;
      if (M.ph === 'wind') lean -= 0.14 * M.wk;
      else if (M.ph === 'hit') lean += 0.22;
      else lean += 0.22 * (1 - M.rk);
      if (M.id === 'sb') { lean = M.ph === 'hit' ? 0.5 : lean + 0.3 * M.wk; lunge = M.ph === 'hit' ? 10 : 0; }
      if (M.id === 'ub') lean = -0.18;
      if (M.id === 'db') lean = M.ph === 'wind' ? -0.1 : 0.08;
    }
    if (A.reel) lean = -0.5;
    if (A.hang) lean = -0.1;

    // ── cloth (world space anchors) ──────────────────────────────────────
    const wx = (lx, ly) => [p.x + lx * p.facing * s, p.y + ly * s];
    const [cax, cay] = wx(-8 - lean * 8, shY + 3);
    const capePts = chainLocal(
      chain(A.st, 'cape', 5, 13 * s, cax, cay, { damp: 0.88, windX: -p.facing * 30 }),
      p, s,
    );
    const [pax, pay] = wx(-2, headY - headR * 1.3);
    const plumePts = chainLocal(
      chain(A.st, 'plume', 5, 7 * s, pax, pay, { damp: 0.85, grav: -110, windX: -p.facing * 230 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge, 0);
    ctx.rotate(lean * 0.5);

    // ── cape (furthest back) ─────────────────────────────────────────────
    ribbon(ctx, capePts, 22, 34, C.secondary, C.ink, 2.6);
    // cape sheen + gold trim edge
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ribbon(ctx, capePts.map(([x, y]) => [x + 2.5, y - 1]), 11, 20, C.secL, null);
    ctx.restore();

    // ── pose targets ─────────────────────────────────────────────────────
    const stance = 13;
    let f1 = [stance + 3, 0], f2 = [-stance, 0];          // front, back foot
    let bend1 = 1, bend2 = -1;
    if (A.airborne && !A.hang) {
      f1 = [10 + A.rise * 5, -13 - A.rise * 6];
      f2 = [-12, -4 + A.fall * 2];
    } else if (A.hang) {
      f1 = [2, -6]; f2 = [-7, -2];
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase, k = A.runAmt;
      f1 = [Math.sin(ph) * 21 * k, -Math.max(0, Math.cos(ph)) * 9 * k];
      f2 = [Math.sin(ph + Math.PI) * 21 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 9 * k];
    } else if (M && M.ph !== 'wind') {
      f1 = [stance + 8, 0]; f2 = [-stance - 4, 0];        // braced wide
    }
    if (A.crouch > 0.3) { f1[0] += 4; f2[0] -= 4; }

    // ── back leg, tassets, torso ─────────────────────────────────────────
    const legW = 10.5;
    limbIK(ctx, -5, hipY, f2[0], f2[1] - 4, 21, 21, bend2, legW, C.secD, C.ink);
    roundRect(ctx, f2[0] - 8, f2[1] - 9, 16, 10, 4); paint(ctx, C.secD, C.ink, 2.4); // back greave

    // tasset skirt
    poly(ctx, [[-15, hipY - 6], [15, hipY - 6], [18, hipY + 10], [10, hipY + 13], [0, hipY + 9], [-10, hipY + 13], [-18, hipY + 10]]);
    paint(ctx, C.secondary, C.ink, 2.6);

    // torso — broad chestplate tapering down
    poly(ctx, [[-20, shY - 3], [20, shY - 3], [16, hipY - 2], [-16, hipY - 2]]);
    paint(ctx, C.primary, C.ink, 3);
    // cel shadow on lower half
    poly(ctx, [[-17.4, shY + 12], [17.4, shY + 12], [16, hipY - 2], [-16, hipY - 2]]);
    paint(ctx, C.priD, null);
    // gold belt + chest sigil
    roundRect(ctx, -16, hipY - 7, 32, 6, 3); paint(ctx, C.accD, C.ink, 2);
    glowOn(ctx, C.glow, 8);
    poly(ctx, [[0, shY + 4], [5.5, shY + 10], [0, shY + 16], [-5.5, shY + 10]]);
    paint(ctx, C.accent, C.ink, 2);
    glowOff(ctx);

    // ── front leg ────────────────────────────────────────────────────────
    limbIK(ctx, 5, hipY, f1[0], f1[1] - 4, 21, 21, bend1, legW, C.secondary, C.ink);
    roundRect(ctx, f1[0] - 8, f1[1] - 10, 17, 11, 4); paint(ctx, C.primary, C.ink, 2.4);  // greave
    roundRect(ctx, f1[0] - 8, f1[1] - 4, 17, 4, 2); paint(ctx, C.accD, null);

    // ── pauldrons ────────────────────────────────────────────────────────
    for (const [px2, back] of [[-19, true], [19, false]]) {
      ctx.beginPath();
      ctx.ellipse(px2, shY - 4, 12, 10, back ? 0.15 : -0.15, Math.PI * 0.95, TAU + Math.PI * 0.08);
      paint(ctx, back ? C.secD : C.primary, C.ink, 3);
      stroke2(ctx, c => { c.arc(px2, shY - 2, 9, Math.PI * 1.12, Math.PI * 1.88); }, 3, C.accent, null, 0);
    }

    // ── arm/hand targets ─────────────────────────────────────────────────
    const armW = 8.6, armL = 17;
    const shF = [6, shY + 3], shB = [-6, shY + 3];
    let hF, hB, wA = 1.15, twoHand = true, drawHammer = true;

    if (A.hang) {
      hF = [15, shY - 30 + Math.sin(t * 2.2) * 1.6];
      hB = [-2, shY + 14];
      wA = 1.5; twoHand = false;
    } else if (A.guard) {
      // kneeling ward: hammer planted vertical in front
      hF = [20, shY + 12]; hB = [12, shY + 16];
      wA = Math.PI / 2 - 0.06; twoHand = false;
    } else if (A.dizzy) {
      hF = [16 + Math.sin(t * 8) * 3, shY + 20]; hB = [-16, shY + 20];
      wA = 1.4; twoHand = false;
    } else if (A.reel) {
      hF = [18, shY - 8]; hB = [-18, shY - 6]; wA = 0.9; twoHand = false;
    } else if (M) {
      const reach = 26;
      if (M.id === 'jab') {
        // gauntlet punch with the back hand, hammer stays low
        const ext = M.ph === 'hit' ? 1 : M.ph === 'wind' ? M.wk * 0.3 : 1 - M.rk;
        hB = [lerp(-8, 46, easeOut(ext)), shY + lerp(14, 9, ext)];
        hF = [16, shY + 22]; wA = 1.1; twoHand = false;
      } else if (M.id === 'db') {
        // overhead earthquake slam
        const a = M.ph === 'wind' ? lerp(0.9, -Math.PI / 2, M.wk)
          : M.ph === 'hit' ? lerp(-Math.PI / 2, 1.25, easeIn(M.hk))
          : lerp(1.25, 0.9, M.rk * 0.4);
        hF = [Math.cos(a) * reach, shY + 3 + Math.sin(a) * reach];
        wA = a;
      } else if (M.id === 'ub') {
        hF = [4, shY - 16]; wA = -Math.PI / 2 + 0.1;
      } else if (M.id === 'sb') {
        hF = [10, shY + 14]; wA = -0.25; twoHand = true;
      } else {
        const a = M.swing;
        hF = [Math.cos(a) * reach, shY + 3 + Math.sin(a) * reach];
        wA = a + 0.12;
      }
      if (twoHand && !hB) {
        hB = [hF[0] * 0.45 - 4, hF[1] * 0.45 + shY * 0.55 + 6];
      }
    } else if (A.airborne) {
      hF = [15, shY + 8 - A.rise * 5]; hB = [-14, shY + 12];
      wA = -0.7 + A.fall * 0.6; twoHand = false;
    } else if (A.runAmt > 0.05) {
      // hammer hoisted onto the shoulder
      hF = [11, shY + 9]; hB = [-9 - Math.sin(A.runPhase) * 6 * A.runAmt, shY + 15];
      wA = -2.45; twoHand = false;
    } else {
      // idle: hammer planted head-down in front, both hands resting on it
      const regrip = A.fidget > 0.86 ? Math.sin((A.fidget - 0.86) / 0.14 * Math.PI) : 0;
      hF = [15, shY + 17 - regrip * 2];
      hB = [11, shY + 20];
      wA = 1.18 + regrip * 0.06;
      twoHand = true;
    }

    // back arm
    limbIK(ctx, shB[0], shB[1], hB ? hB[0] : -14, hB ? hB[1] : shY + 16, armL, armL, 1, armW, C.secD, C.ink);
    if (hB) disc(ctx, hB[0], hB[1], 5.4, C.secD, C.ink, 2.2);

    // ── head: full crowned helm ──────────────────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    // plume (sprouts from the crown, streams behind)
    ribbon(ctx, plumePts.map(([x, y]) => [x - lean * 5, y - headY]), 8, 2.5, C.accent, C.ink, 2.2);
    // helm dome
    ctx.beginPath();
    ctx.arc(0, 0, headR * 1.18, Math.PI * 0.92, TAU + Math.PI * 0.08);
    paint(ctx, C.primary, C.ink, 3);
    // faceplate
    roundRect(ctx, -headR * 1.02, -headR * 0.18, headR * 2.14, headR * 1.06, headR * 0.32);
    paint(ctx, C.secondary, C.ink, 2.6);
    // crown ridge
    poly(ctx, [[-headR * 0.5, -headR * 1.04], [0, -headR * 1.6], [headR * 0.5, -headR * 1.04]]);
    paint(ctx, C.accent, C.ink, 2.2);
    // visor slit — glows, doubles as the "eye"
    glowOn(ctx, C.glow, A.move ? 14 : 8);
    const vw = A.dizzy ? headR * 0.5 : headR * 0.95;
    roundRect(ctx, headR * 0.1, -headR * 0.02, vw, headR * 0.3, headR * 0.15);
    paint(ctx, A.hit || A.dizzy ? '#ff8a6b' : C.glow, null);
    glowOff(ctx);
    // breath vents
    ink(ctx, C.ink, 1.8);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(headR * (0.2 + i * 0.26), headR * 0.5);
      ctx.lineTo(headR * (0.3 + i * 0.26), headR * 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // ── front arm + hammer ───────────────────────────────────────────────
    limbIK(ctx, shF[0], shF[1], hF[0], hF[1], armL, armL, -1, armW, C.primary, C.ink);
    if (drawHammer) {
      ctx.save();
      ctx.translate(hF[0], hF[1]);
      ctx.rotate(wA);
      hammer(ctx, C, twoHand ? 0.3 : 0.16);
      ctx.restore();
    }
    // gauntlet
    disc(ctx, hF[0], hF[1], 6, C.accent, C.ink, 2.4);

    // ── move FX ──────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // ground shock ring
        const k = M.hk;
        glowOn(ctx, C.glow, 20);
        ink(ctx, C.glow, 4 * (1 - k) + 1);
        ctx.globalAlpha *= 0.9 - k * 0.5;
        ctx.beginPath();
        ctx.ellipse(18, -4, 20 + k * 75, 8 + k * 18, 0, Math.PI, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        glowOff(ctx);
      } else if (M.id !== 'jab' && M.id !== 'nb' && M.id !== 'sb') {
        swingTrail(ctx, 0, shY + 3, 30, 78, M.aim - 1.9 + M.hk * 0.6, M.swing + 0.3, C.trail, 0.8);
      } else if (M.id === 'sb') {
        // shoulder-charge speed wedge
        ctx.save();
        ctx.globalAlpha *= 0.55;
        glowOn(ctx, C.glow, 14);
        poly(ctx, [[-46, shY - 14], [-14, shY + 2], [-46, shY + 18]]);
        paint(ctx, C.trail + '88', null);
        glowOff(ctx);
        ctx.restore();
      }
    }
    // neutral-B charge held at the hammer head
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      const hx = hF[0] + Math.cos(wA) * 52, hy = hF[1] + Math.sin(wA) * 52;
      chargeOrb(ctx, hx, hy, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.1, t);

    ctx.restore();
  },
};
