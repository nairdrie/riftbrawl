// ─────────────────────────────────────────────────────────────────────────────
// EMBER — The Cinder Witch. Big bent witch hat with a sprung tip, long flowing
// hair, bell dress with a flame-trimmed hem, pyre staff with a floating flame
// orb that never quite touches it. Animation personality: smouldering — she
// glides rather than runs, embers rise off her, the orb pulses like a heart.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, easeOut, palette, paint, ink, disc, roundRect, poly,
  stroke2, limbIK, glowOn, glowOff, chain, chainLocal, ribbon,
  swingTrail, flame, chargeOrb, dizzyStars, face, shade,
} from './common.js';

function staff(ctx, C, t, orbK = 1) {
  // drawn along +x from the hand; curled head at the far end, orb floats past it
  stroke2(ctx, c => { c.moveTo(-14, 0); c.lineTo(40, 0); }, 4.6, '#6b4234', '#241318');
  // curl
  stroke2(ctx, c => { c.arc(44, -1, 5.5, Math.PI * 0.7, TAU * 0.92); }, 3.4, '#6b4234', '#241318', 3);
  // floating flame orb
  const bob = Math.sin(t * 3.1) * 1.8;
  glowOn(ctx, C.glow, 16 * orbK);
  const pulse = 1 + Math.sin(t * 5.3) * 0.1;
  disc(ctx, 55, -2 + bob, 6.2 * pulse * orbK, C.accent, null);
  disc(ctx, 55, -2 + bob, 3.4 * pulse * orbK, '#fff0d8', null);
  glowOff(ctx);
}

export const emberRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const SKIN = '#f6d3ab';
    const HAIR = '#b8455f';
    const CLOTH = '#5e2a48';      // rich plum for hat + dress

    // ── metrics ──────────────────────────────────────────────────────────
    const hover = (!A.airborne && !A.crouch) ? Math.sin(t * 2.3) * 1.4 : 0;
    const crouchDrop = A.crouch * 12;
    const waistY = -35 + crouchDrop + hover;
    const shY = -56 + crouchDrop * 1.1 + hover + A.breathe * 1.1;
    const headY = -71 + crouchDrop * 1.15 + hover + A.breathe * 1.3;
    const headR = 10.5;

    let lean = A.lean;
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 5;
      if (M.ph === 'wind') lean -= 0.13 * M.wk;
      else if (M.ph === 'hit') lean += 0.2;
      else lean += 0.2 * (1 - M.rk);
      if (M.id === 'ub') lean = -0.22;
    }
    if (A.reel) lean = -0.5;
    const hipSway = (!M && A.grounded && A.runAmt < 0.05) ? Math.sin(t * 1.7) * 1.6 : 0;

    // ── cloth chains ─────────────────────────────────────────────────────
    const wxy = (lx, ly) => [p.x + lx * p.facing * s, p.y + ly * s];
    const [hax, hay] = wxy(-9, headY - 3);
    const hairPts = chainLocal(
      chain(A.st, 'hair', 5, 8 * s, hax, hay, { damp: 0.88, grav: 150, windX: -p.facing * 40 }),
      p, s,
    );
    const [tax, tay] = wxy(-2, headY - headR * 2.05);
    const hatTip = chainLocal(
      chain(A.st, 'hattip', 3, 8.5 * s, tax, tay, { damp: 0.84, grav: -140, windX: -p.facing * 110 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge + hipSway * 0.4, 0);
    ctx.rotate(lean * 0.5);

    // ── rising embers (ambient) ──────────────────────────────────────────
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const cyc = ((t * 0.55 + i * 0.31) % 1);
      const ex = Math.sin(t * 1.3 + i * 2.4) * (10 + i * 4);
      const ey = -10 - cyc * 70;
      ctx.globalAlpha = (1 - cyc) * 0.7;
      glowOn(ctx, C.accent, 6);
      disc(ctx, ex, ey, 1.6 + (1 - cyc), i % 2 ? C.accent : C.glow, null);
      glowOff(ctx);
    }
    ctx.restore();

    // ── hair (behind everything) ─────────────────────────────────────────
    ribbon(ctx, hairPts, 9, 3, HAIR, C.ink, 2.2);

    // ── legs/boots peeking under the dress ──────────────────────────────
    const legW = 4.6;
    let f1 = [5 + hipSway * 0.5, 0], f2 = [-5 + hipSway * 0.5, 0];
    if (A.hang) {
      f1 = [2, -4]; f2 = [-4, -1];
    } else if (A.airborne) {
      if (M && M.id === 'dair') { f1 = [4, 4]; f2 = [-6, -8]; }     // comet heel!
      else { f1 = [7, -8 - A.rise * 4]; f2 = [-7, -2]; }
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase, k = A.runAmt;
      f1 = [Math.sin(ph) * 13 * k, -Math.max(0, Math.cos(ph)) * 6 * k];
      f2 = [Math.sin(ph + Math.PI) * 13 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 6 * k];
    }
    limbIK(ctx, -3, waistY + 6, f2[0], f2[1] - 2, 16, 16, -1, legW, C.secD, C.ink);
    roundRect(ctx, f2[0] - 5, f2[1] - 5, 10, 6, 2.5); paint(ctx, C.secD, C.ink, 2);
    limbIK(ctx, 3, waistY + 6, f1[0], f1[1] - 2, 16, 16, 1, legW, C.secondary, C.ink);
    roundRect(ctx, f1[0] - 5, f1[1] - 6, 11, 7, 2.5); paint(ctx, C.primary, C.ink, 2);
    if (M && M.id === 'dair' && M.ph === 'hit') flame(ctx, f1[0] + 2, f1[1] + 6, 6, C.accent, '#fff0d8', t, 3);

    // ── bell dress ───────────────────────────────────────────────────────
    const sway = Math.max(-6, Math.min(6, -p.vx * p.facing * 0.7)) + Math.sin(t * 2.1) * 1.2;
    const flare = M && M.id === 'db' && M.ph !== 'wind' ? 1 + (M.ph === 'hit' ? M.hk : 1 - M.rk) * 0.35 : 1;
    const hemY = -3 + crouchDrop * 0.4;
    const hw = 17 * flare;
    ctx.beginPath();
    ctx.moveTo(-9, waistY - 2);
    ctx.quadraticCurveTo(-13, waistY + 12, -hw + sway * 0.4, hemY);
    // scalloped hem
    ctx.quadraticCurveTo(-hw * 0.55 + sway * 0.7, hemY + 4.5, -hw * 0.3 + sway * 0.8, hemY + 1);
    ctx.quadraticCurveTo(sway * 0.9, hemY + 5.5, hw * 0.36 + sway * 0.8, hemY + 1.2);
    ctx.quadraticCurveTo(hw * 0.62 + sway * 0.7, hemY + 4.5, hw + sway * 0.4, hemY);
    ctx.quadraticCurveTo(13, waistY + 12, 9, waistY - 2);
    ctx.closePath();
    paint(ctx, CLOTH, C.ink, 2.6);
    // dress shadow panel
    ctx.beginPath();
    ctx.moveTo(-6, waistY + 6);
    ctx.quadraticCurveTo(-10, waistY + 16, -hw * 0.8 + sway * 0.45, hemY - 1);
    ctx.lineTo(-hw * 0.3 + sway * 0.7, hemY + 1);
    ctx.quadraticCurveTo(-4, waistY + 18, -2, waistY + 6);
    ctx.closePath();
    paint(ctx, shade(CLOTH, 0.78), null);
    // flame trim at the hem
    glowOn(ctx, C.accent, 6);
    ink(ctx, C.accent, 2.2);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.82 + sway * 0.5, hemY + 0.5);
    ctx.quadraticCurveTo(-hw * 0.45 + sway * 0.7, hemY + 3.5, -hw * 0.25 + sway * 0.8, hemY + 0.2);
    ctx.quadraticCurveTo(sway * 0.9, hemY + 4.4, hw * 0.3 + sway * 0.8, hemY + 0.4);
    ctx.quadraticCurveTo(hw * 0.58 + sway * 0.7, hemY + 3.5, hw * 0.78 + sway * 0.5, hemY + 0.5);
    ctx.stroke();
    glowOff(ctx);

    // ── bodice ───────────────────────────────────────────────────────────
    poly(ctx, [[-8, shY - 1], [8, shY - 1], [9, waistY], [-9, waistY]]);
    paint(ctx, C.primary, C.ink, 2.6);
    poly(ctx, [[-8.4, shY + 9], [8.4, shY + 9], [9, waistY], [-9, waistY]]);
    paint(ctx, C.priD, null);
    // collar brooch
    glowOn(ctx, C.glow, 7);
    disc(ctx, 0, shY + 3.5, 2.8, C.accent, C.ink, 1.8);
    glowOff(ctx);

    // ── back arm (puffy sleeve) ──────────────────────────────────────────
    const armW = 4.6, armL = 13.5;
    const shB = [-5.5, shY + 2];
    let hB = [-11, shY + 14];
    if (A.hang) hB = [4, headY - headR * 1.2];                       // holds her hat down!
    else if (M && M.id === 'db') hB = [-18, shY + 2 - (M.ph === 'hit' ? M.hk : 1) * 8];
    else if (M) hB = [-12, shY + 8];
    else if (A.reel) hB = [-15, shY - 6];
    disc(ctx, shB[0] - 1, shB[1] + 1, 5, C.primary, C.ink, 2.2);     // sleeve puff
    limbIK(ctx, shB[0], shB[1], hB[0], hB[1], armL, armL, 1, armW, C.secD, C.ink);
    disc(ctx, hB[0], hB[1], 3.2, SKIN, C.ink, 1.8);

    // ── head + witch hat ─────────────────────────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    disc(ctx, 0, 0, headR, SKIN, C.ink, 2.6);
    // fringe sweeping across the brow
    ctx.beginPath();
    ctx.moveTo(-headR * 1.02, -headR * 0.05);
    ctx.quadraticCurveTo(-headR * 0.85, -headR * 1.1, headR * 0.2, -headR * 0.98);
    ctx.quadraticCurveTo(headR * 1.12, -headR * 0.8, headR * 1.0, -headR * 0.05);
    ctx.quadraticCurveTo(headR * 0.6, -headR * 0.5, headR * 0.05, -headR * 0.42);
    ctx.quadraticCurveTo(-headR * 0.55, -headR * 0.3, -headR * 1.02, -headR * 0.05);
    ctx.closePath();
    paint(ctx, HAIR, C.ink, 2.2);
    face(ctx, headR * 0.18, headR * 0.22, headR * 1.15, C, A, { color: '#3c1a26', spread: headR * 0.5 });
    // little smirk
    ink(ctx, '#46202e', 1.5);
    ctx.beginPath();
    if (A.hit || A.dizzy) ctx.arc(headR * 0.3, headR * 0.66, headR * 0.15, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(headR * 0.22, headR * 0.5, headR * 0.2, Math.PI * 0.15, Math.PI * 0.7);
    ctx.stroke();

    // hat: wide brim + tall cone, the tip rides the spring chain
    const tip = hatTip.map(([x, y]) => [x - lean * 5, y - headY]);
    ctx.beginPath();
    ctx.moveTo(-headR * 1.05, -headR * 0.68);
    ctx.quadraticCurveTo(tip[1][0] - headR * 0.5, tip[1][1] + headR * 0.3, tip[2][0], tip[2][1]);
    ctx.quadraticCurveTo(tip[1][0] + headR * 0.55, tip[1][1] + headR * 0.55, headR * 0.8, -headR * 0.78);
    ctx.closePath();
    paint(ctx, CLOTH, C.ink, 2.6);
    // brim over the cone base
    ctx.beginPath();
    ctx.ellipse(-0.5, -headR * 0.62, headR * 1.85, headR * 0.48, -0.07, 0, TAU);
    paint(ctx, CLOTH, C.ink, 2.6);
    ctx.beginPath();
    ctx.ellipse(-0.5, -headR * 0.7, headR * 1.5, headR * 0.32, -0.07, 0, TAU);
    paint(ctx, shade(CLOTH, 1.25), null);
    // hat band + buckle
    stroke2(ctx, c => { c.moveTo(-headR * 0.86, -headR * 0.9); c.lineTo(headR * 0.72, -headR * 0.96); }, 3.4, C.accent, null, 0);
    disc(ctx, -headR * 0.05, -headR * 0.96, 1.8, '#fff0d8', null);
    // tip ember
    glowOn(ctx, C.accent, 8);
    disc(ctx, tip[2][0], tip[2][1], 2.2, C.accent, null);
    glowOff(ctx);
    ctx.restore();

    // ── front arm + staff ────────────────────────────────────────────────
    const shF = [5.5, shY + 2];
    let hF, wA, orbK = 1;
    if (A.hang) {
      hF = [13, shY - 25 + Math.sin(t * 2.6) * 1.5]; wA = -1.35;
    } else if (A.guard) {
      hF = [11, shY + 8]; wA = -Math.PI / 2 + 0.12;
    } else if (A.dizzy) {
      hF = [13 + Math.sin(t * 8.5) * 3, shY + 15]; wA = 0.9;
    } else if (A.reel) {
      hF = [15, shY - 6]; wA = -0.4;
    } else if (M) {
      const reach = 20;
      if (M.id === 'ub') {
        hF = [4, shY - 15]; wA = -Math.PI / 2; orbK = 1.4;          // staff skyward, phoenix rise
      } else if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : 1;
        hF = [lerp(10, 4, k), shY - 4 - k * 12]; wA = -Math.PI / 2; orbK = 1.5;
      } else {
        hF = [Math.cos(M.swing) * reach, shY + 2 + Math.sin(M.swing) * reach];
        wA = M.swing; orbK = M.ph === 'hit' ? 1.5 : 1.1;
      }
    } else if (A.airborne) {
      hF = [12, shY + 5 - A.rise * 4]; wA = -0.85 + A.fall * 0.4;
    } else if (A.runAmt > 0.05) {
      hF = [11, shY + 10]; wA = -0.55;
    } else {
      // idle: staff held beside her, tip leaning forward off her face
      hF = [14 + hipSway * 0.3, shY + 13]; wA = -1.32;
    }
    disc(ctx, shF[0] + 1, shF[1] + 1, 5, C.primary, C.ink, 2.2);     // sleeve puff
    limbIK(ctx, shF[0], shF[1], hF[0], hF[1], armL, armL, -1, armW, C.primary, C.ink);
    ctx.save();
    ctx.translate(hF[0], hF[1]);
    ctx.rotate(wA);
    staff(ctx, C, t, orbK);
    ctx.restore();
    disc(ctx, hF[0], hF[1], 3.2, SKIN, C.ink, 1.8);

    // ── fire FX ──────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // cataclysm ring — expanding ring of flame
        const k = M.hk;
        glowOn(ctx, C.glow, 18);
        ink(ctx, C.accent, 5 * (1 - k) + 1.5);
        ctx.globalAlpha *= 0.95 - k * 0.5;
        ctx.beginPath();
        ctx.ellipse(0, -28, 18 + k * 62, 10 + k * 34, 0, 0, TAU);
        ctx.stroke();
        glowOff(ctx);
        ctx.globalAlpha = 1;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + t * 1.1;
          flame(ctx, Math.cos(a) * (16 + k * 50), -28 + Math.sin(a) * (9 + k * 26), 5.5, C.accent, '#fff0d8', t, i);
        }
      } else if (M.id === 'ub') {
        // phoenix spiral
        for (let i = 0; i < 3; i++) {
          const a = t * 9 + i * (TAU / 3);
          flame(ctx, Math.cos(a) * 17, -30 + Math.sin(a) * 8 - M.hk * 10, 6, C.accent, '#fff0d8', t, i);
        }
      } else if (M.id !== 'nb') {
        swingTrail(ctx, 0, shY + 2, 20, 58, M.aim - 1.7 + M.hk * 0.7, M.swing + 0.3, C.accent, 0.7);
        const tx2 = hF[0] + Math.cos(wA) * 48, ty2 = hF[1] + Math.sin(wA) * 48;
        flame(ctx, tx2, ty2, 6.5, C.accent, '#fff0d8', t, 7);
      }
    }
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      chargeOrb(ctx, hF[0] + Math.cos(wA) * 55, hF[1] + Math.sin(wA) * 55, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.6, t);

    ctx.restore();
  },
};
