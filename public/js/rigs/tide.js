// ─────────────────────────────────────────────────────────────────────────────
// TIDE — The Wave Duelist. An aquatic fencer of the Drowned Order: fin-crested
// helm, high-collared duelist jacket, flowing water-sash, shell-guard rapier.
// Animation personality: elegant. True fencing stance (side profile, rear arm
// curled), wave-like weight rocking at idle, dramatic full-extension lunges.
// Built lean and tall — a poised swordsman, not a tank — but given real volume:
// plated, rim-lit limbs that taper, gloved hands, and a shaded fin-crest helm.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, easeOut, palette, paint, ink, disc, roundRect, poly,
  stroke2, ikSolve, platedSeg, jointCap, glowOn, glowOff, chain, chainLocal,
  ribbon, swingTrail, chargeOrb, dizzyStars, face, shade, decal, slotHidden,
} from './common.js';

// ── limb metrics (local units; feet at 0, +x forward, y up = negative) ───────
const LEG_T = 21, LEG_S = 20;            // thigh / shin bone lengths (long, lean)
const ARM_U = 15, ARM_F = 13;            // upper-arm / forearm bone lengths

// The shell-guard rapier — a slim trident-tipped blade drawn along +x from the
// gloved hand. Pale water-metal with a glowing core line.
function rapier(ctx, C) {
  glowOn(ctx, C.glow, 8);
  // blade
  stroke2(ctx, c => { c.moveTo(6, 0); c.lineTo(46, 0); }, 2.8, C.trail, C.ink, 2.6);
  stroke2(ctx, c => { c.moveTo(8, -0.5); c.lineTo(44, -0.5); }, 1, '#ffffff', null, 0);
  // trident tip
  stroke2(ctx, c => {
    c.moveTo(40, -4.5); c.lineTo(49, 0); c.lineTo(40, 4.5);
  }, 2.4, C.trail, C.ink, 2.4);
  glowOff(ctx);
  // shell guard — a scalloped fan with a rim
  ctx.beginPath();
  ctx.arc(5, 0, 6.4, -Math.PI * 0.62, Math.PI * 0.62);
  paint(ctx, C.primary, C.ink, 2.2);
  ink(ctx, shade(C.primary, 1.45), 1.4);
  ctx.beginPath(); ctx.arc(5, 0, 4.4, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
  // pommel + wrapped grip
  stroke2(ctx, c => { c.moveTo(-4, 0); c.lineTo(4, 0); }, 4, C.secondary, C.ink, 2.6);
  disc(ctx, -4.5, 0, 2.2, C.accent, C.ink, 1.4);
}

// a slim duelist sea-boot — pointed toe forward, turned-down accent cuff, sole
function seaBoot(ctx, x, y, C, fill) {
  ctx.save();
  ctx.translate(x, y);
  poly(ctx, [[-5, -9], [5, -9], [11, -2], [11, 2.6], [-6, 2.6], [-7, -3.5]]);
  paint(ctx, fill, C.ink, 2.2);
  // sole band
  roundRect(ctx, -7, 0.4, 18, 3.4, 1.8); paint(ctx, shade(fill, 0.7), null);
  // turned-down cuff
  roundRect(ctx, -5.5, -11, 11, 4.2, 2); paint(ctx, C.accent, C.ink, 1.6);
  // toe rim
  ink(ctx, shade(fill, 1.42), 1.3);
  ctx.beginPath(); ctx.moveTo(-4, -7.8); ctx.lineTo(7, -7.8); ctx.stroke();
  ctx.restore();
}

// a fencer's gauntlet — slim flared cuff + a gloved hand gripping along `ang`.
// lighter and more tapered than the heavy plate gauntlet, to keep him quick.
function glove(ctx, x, y, r, ang, C, o = {}) {
  const fill = o.fill ?? C.primary;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  // flared cuff (behind the hand)
  poly(ctx, [[-r * 1.3, -r * 1.05], [-r * 0.5, -r * 0.85], [-r * 0.5, r * 0.85], [-r * 1.3, r * 1.05]]);
  paint(ctx, shade(fill, 0.82), C.ink, 2);
  // hand mass
  roundRect(ctx, -r * 0.5, -r * 0.9, r * 1.5, r * 1.8, r * 0.5);
  paint(ctx, fill, C.ink, 2.2);
  // shaded underside
  ctx.save();
  roundRect(ctx, -r * 0.5, -r * 0.9, r * 1.5, r * 1.8, r * 0.5); ctx.clip();
  roundRect(ctx, -r * 0.5, r * 0.12, r * 1.5, r * 1.0, r * 0.3);
  paint(ctx, shade(fill, 0.74), null);
  ctx.restore();
  // knuckle line + rim on the lit edge
  ink(ctx, C.ink, 1.2);
  ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.4); ctx.lineTo(r * 1.0, -r * 0.4); ctx.stroke();
  ink(ctx, shade(fill, 1.42), 1.3);
  ctx.beginPath(); ctx.moveTo(-r * 0.28, -r * 0.82); ctx.lineTo(r * 0.92, -r * 0.82); ctx.stroke();
  if (o.accent) disc(ctx, r * 0.18, -r * 0.04, r * 0.3, o.accent, C.ink, 1.3);
  ctx.restore();
}

// a plated arm: sleeve plate + elbow couter + forearm plate. returns the hand pt.
function drawArm(ctx, sx, sy, hx, hy, dir, C, o) {
  const { jx, jy, ex, ey } = ikSolve(sx, sy, hx, hy, ARM_U, ARM_F, dir);
  platedSeg(ctx, sx, sy, jx, jy, o.uw, C, { fill: o.fill, light: -1 });
  platedSeg(ctx, jx, jy, ex, ey, o.fw, C, { fill: o.fill, light: -1 });
  jointCap(ctx, jx, jy, o.elbow, C, { fill: o.fill });
  return [ex, ey];
}

// a plated leg: thigh (breeches) + knee poleyn + greave + sea-boot
function drawLeg(ctx, hx, hy, foot, bend, C, o) {
  const { jx, jy, ex, ey } = ikSolve(hx, hy, foot[0], foot[1] - 3, LEG_T, LEG_S, bend);
  platedSeg(ctx, hx, hy, jx, jy, o.tw, C, { fill: o.fill, light: -1 });
  platedSeg(ctx, jx, jy, ex, ey, o.sw, C, { fill: o.fill, light: -1 });
  jointCap(ctx, jx, jy, o.knee, C, { fill: o.fill });
  seaBoot(ctx, ex, ey, C, o.fill);
}

const THRUSTS = new Set(['jab', 'ftilt', 'fair', 'dair', 'dtilt', 'nb', 'sb']);

export const tideRig = {
  draw(ctx, p, char, A, t, skin) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const SKIN = '#b9e6da';

    // ── metrics + wave rock + breathing ──────────────────────────────────
    const idleAmt = A.grounded && !M && !A.guard && !A.dizzy && !A.reel &&
                    A.runAmt < 0.05 && A.crouch < 0.2 ? 1 : 0;
    const rock = idleAmt * Math.sin(t * 1.6) * 2.2;        // slow wave weight-rock
    const sway = idleAmt * Math.sin(t * 1.6 + 0.7);        // contrapposto counter-turn
    const crouchDrop = A.crouch * 14;
    const isThrust = M && THRUSTS.has(M.id);
    const lungeK = isThrust ? (M.ph === 'hit' ? 1 : M.ph === 'rec' ? 1 - M.rk : 0) : 0;
    const breathY = A.breathe * 1.3;
    const hipY = -38 + crouchDrop + lungeK * 6;
    const shY = -64 + crouchDrop * 1.1 + breathY + lungeK * 7;
    const headY = -80 + crouchDrop * 1.15 + breathY * 1.15 + lungeK * 7;
    const headR = 10;

    let lean = A.lean - sway * 0.04;
    let lunge = 0;
    if (M) {
      lunge = M.lunge * (isThrust ? 14 : 6);
      if (M.ph === 'wind') lean -= 0.16 * M.wk;
      else if (M.ph === 'hit') lean += isThrust ? 0.34 : 0.2;
      else lean += 0.2 * (1 - M.rk);
      if (M.id === 'ub') lean = -0.25;
      if (M.id === 'db') lean = M.ph === 'hit' ? 0 : lean;       // upright spin
    }
    if (A.reel) lean = -0.5;
    if (A.hang) lean = -0.1;

    // ── water sash (world space → verlet → local) ────────────────────────
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
    let f1 = [11 + rock * 0.6, 0], f2 = [-9 + rock * 0.3, 0];
    let bend1 = 1, bend2 = -1;
    if (A.hang) {
      f1 = [3, -7]; f2 = [-5, -2];
    } else if (A.airborne) {
      if (M && M.id === 'dair') { f1 = [3, 2]; f2 = [-8, -10]; }      // pointed plunge
      else { f1 = [8, -12 - A.rise * 5]; f2 = [-11, -2 + A.fall * 2]; } // scissor
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase, k = A.runAmt;
      f1 = [Math.sin(ph) * 23 * k, -Math.max(0, Math.cos(ph)) * 9 * k];
      f2 = [Math.sin(ph + Math.PI) * 23 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 9 * k];
    } else if (lungeK > 0) {
      f1 = [22 + lungeK * 8, 0]; f2 = [-16 - lungeK * 7, 0];          // full lunge extension
    } else if (idleAmt) {
      f1 = [11 + rock * 0.6 - sway * 1.2, 0]; f2 = [-9 + rock * 0.3 - sway * 1.6, 0];
    }

    // back leg (far, darker) then front leg (near, bright)
    drawLeg(ctx, -4, hipY, f2, bend2, C, { fill: C.secondary, tw: 10, sw: 8.3, knee: 5 });
    decal(ctx, skin, 'backFoot', f2[0], f2[1], 0, 18);
    drawLeg(ctx, 4, hipY, f1, bend1, C, { fill: C.primary, tw: 11, sw: 9, knee: 5.4 });
    decal(ctx, skin, 'frontFoot', f1[0], f1[1], 0, 18);

    // ── back arm: fencer's curl (drawn behind the torso) ─────────────────
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
    } else if (lungeK > 0) hB = [-19 - lungeK * 4, shY - 4 + lungeK * 7];  // counterbalance
    const handB = drawArm(ctx, shB[0], shB[1], hB[0], hB[1], 1, C,
      { uw: 8, fw: 6.6, elbow: 4.4, fill: C.secD });
    if (!slotHidden(skin, 'backHand')) glove(ctx, handB[0], handB[1], 4.4, Math.atan2(hB[1] - shB[1], hB[0] - shB[0]) + 0.6, C, { fill: C.secD });
    decal(ctx, skin, 'backHand', handB[0], handB[1], Math.atan2(hB[1] - shB[1], hB[0] - shB[0]), 13);

    // ── torso: high-collared duelist jacket ──────────────────────────────
    // collar yoke behind the head
    roundRect(ctx, -8.5, shY - 9, 17, 9, 4); paint(ctx, C.secD, C.ink, 2.2);
    // jacket body — bright plate read with a cel shadow + sternum rim
    poly(ctx, [[-11, shY - 2], [11, shY - 2], [8.5, hipY + 1], [-8.5, hipY + 1]]);
    paint(ctx, C.primary, C.ink, 2.6);
    poly(ctx, [[-9.6, shY + 11], [9.6, shY + 11], [8.5, hipY + 1], [-8.5, hipY + 1]]);
    paint(ctx, C.priD, null);
    ink(ctx, shade(C.primary, 1.4), 1.6);
    ctx.beginPath(); ctx.moveTo(-8.5, shY + 1); ctx.quadraticCurveTo(0, shY - 3, 8.5, shY + 1); ctx.stroke();
    // lapel trim + buttons (break the dark, accent line down the front)
    ink(ctx, C.accent, 1.7);
    ctx.beginPath(); ctx.moveTo(2.5, shY); ctx.lineTo(1.2, hipY); ctx.stroke();
    for (let i = 0; i < 3; i++) disc(ctx, 4.7, shY + 6 + i * 6.5, 1.3, C.accent, null);
    // chest shell sigil
    glowOn(ctx, C.glow, M ? 9 : 6);
    poly(ctx, [[-3.5, shY + 4], [3.5, shY + 4], [2, shY + 9], [-2, shY + 9]]);
    paint(ctx, C.accent, C.ink, 1.4);
    glowOff(ctx);
    // waist sash knot
    roundRect(ctx, -9, hipY - 4, 18, 5.5, 2.5); paint(ctx, C.glow, C.ink, 2);
    ink(ctx, '#e8fffb', 1.2);
    ctx.beginPath(); ctx.moveTo(-7, hipY - 2); ctx.lineTo(7, hipY - 2); ctx.stroke();
    // high collar (over the yoke)
    poly(ctx, [[-7.5, shY - 1], [7.5, shY - 1], [6, shY - 9], [-6, shY - 9]]);
    paint(ctx, C.secondary, C.ink, 2.2);
    ink(ctx, C.glow, 1.5);
    ctx.beginPath(); ctx.moveTo(-5.5, shY - 8); ctx.lineTo(-4.5, shY - 1); ctx.stroke();

    // ── fin epaulettes on the shoulders (echo the helm crest) ────────────
    for (const [ex, far] of [[-8.5, true], [8.5, false]]) {
      ctx.save();
      ctx.translate(ex, shY + 1);
      const fill = far ? shade(C.secondary, 1.1) : C.primary;
      poly(ctx, [[0, -5], [far ? -8 : 7, -3], [far ? -5 : 4, 4], [0, 3]]);
      paint(ctx, fill, C.ink, 2);
      ink(ctx, shade(fill, 1.45), 1.3);
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(far ? -6 : 5, -2.5); ctx.stroke();
      ctx.restore();
    }
    decal(ctx, skin, 'torso', 0, (shY + hipY) / 2, 0, 30);

    // ── head: fin-crest helm ─────────────────────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    if (!slotHidden(skin, 'head')) {
    // face
    disc(ctx, 0, 0, headR, SKIN, C.ink, 2.4);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, headR, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.arc(-headR * 0.45, headR * 0.35, headR * 0.95, 0, TAU);
    paint(ctx, shade(SKIN, 0.86), null);                  // cel shadow on the dark flank
    ctx.restore();
    // fin ears (back of the head)
    poly(ctx, [[-headR * 0.8, -headR * 0.1], [-headR * 1.8, -headR * 0.55], [-headR * 0.9, headR * 0.5]]);
    paint(ctx, C.glow, C.ink, 2.2);
    poly(ctx, [[-headR * 0.85, -headR * 0.02], [-headR * 1.45, -headR * 0.3], [-headR * 0.9, headR * 0.3]]);
    paint(ctx, C.trail, null);
    // helm cap — bright, rim-lit, with a darker back curve
    ctx.beginPath();
    ctx.arc(0, -headR * 0.12, headR * 1.1, Math.PI * 0.9, TAU + Math.PI * 0.08);
    paint(ctx, C.primary, C.ink, 2.4);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, -headR * 0.12, headR * 1.1, Math.PI * 0.9, TAU + Math.PI * 0.08); ctx.clip();
    ctx.beginPath(); ctx.arc(-headR * 0.5, headR * 0.05, headR * 1.0, 0, TAU);
    paint(ctx, C.priD, null);
    ctx.restore();
    ink(ctx, shade(C.primary, 1.45), 1.6);
    ctx.beginPath(); ctx.arc(0, -headR * 0.12, headR * 0.9, Math.PI * 1.12, Math.PI * 1.82); ctx.stroke();
    // cheek guard (a small swept plate)
    poly(ctx, [[headR * 0.9, -headR * 0.1], [headR * 0.5, -headR * 0.1], [headR * 0.62, headR * 0.7]]);
    paint(ctx, C.secondary, C.ink, 1.8);
    // fin crest — tall swept-back sail
    const crestSway = Math.sin(t * 2.8) * 1.2 - p.vx * p.facing * 0.35;
    ctx.beginPath();
    ctx.moveTo(headR * 0.45, -headR * 1.04);
    ctx.quadraticCurveTo(headR * 0.1, -headR * 2.3, -headR * 1.9 + crestSway, -headR * 2.25);
    ctx.quadraticCurveTo(-headR * 1.25 + crestSway * 0.6, -headR * 1.45, -headR * 0.85, -headR * 0.72);
    ctx.closePath();
    paint(ctx, C.glow, C.ink, 2.4);
    ctx.beginPath();
    ctx.moveTo(headR * 0.1, -headR * 1.14);
    ctx.quadraticCurveTo(-headR * 0.1, -headR * 1.95, -headR * 1.2 + crestSway * 0.8, -headR * 1.95);
    ctx.quadraticCurveTo(-headR * 0.85 + crestSway * 0.5, -headR * 1.35, -headR * 0.5, -headR * 0.85);
    ctx.closePath();
    paint(ctx, C.trail, null);
    // leading-edge rim + crest ribs
    ink(ctx, '#e8fffb', 1.5);
    ctx.beginPath();
    ctx.moveTo(headR * 0.4, -headR * 1.06);
    ctx.quadraticCurveTo(headR * 0.05, -headR * 2.24, -headR * 1.82 + crestSway, -headR * 2.2);
    ctx.stroke();
    ink(ctx, C.primary, 1.5);
    for (const k of [0.35, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(headR * (0.3 - k * 1.3), -headR * (1.0 + k * 0.18));
      ctx.lineTo(headR * (0.1 - k * 1.9) + crestSway * k, -headR * (1.05 + k * 1.1));
      ctx.stroke();
    }
    face(ctx, headR * 0.3, headR * 0.05, headR, C, A, { color: '#10333d', spread: headR * 0.55 });
    }
    ctx.restore();
    decal(ctx, skin, 'head', lean * 5, headY, 0, headR * 4);

    // ── front arm + rapier + glove ───────────────────────────────────────
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
        const reach = 11 + ext * 15;
        hF = [Math.cos(M.aim) * reach, shY + 3 + Math.sin(M.aim) * reach];
        wA = M.aim;                                          // blade locked on target line
      } else {
        const reach = 20;
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
    const handF = drawArm(ctx, shF[0], shF[1], hF[0], hF[1], -1, C,
      { uw: 8.4, fw: 7, elbow: 4.7, fill: C.primary });
    if (!slotHidden(skin, 'weapon')) {
      ctx.save();
      ctx.translate(handF[0], handF[1]);
      ctx.rotate(wA);
      rapier(ctx, C);
      ctx.restore();
    }
    decal(ctx, skin, 'weapon', handF[0], handF[1], wA, 52);
    if (!slotHidden(skin, 'frontHand')) glove(ctx, handF[0], handF[1], 5.2, wA, C, { fill: C.primary, accent: C.accent });
    decal(ctx, skin, 'frontHand', handF[0], handF[1], wA, 16);

    // ── water FX ─────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      const tipX = handF[0] + Math.cos(wA) * 48, tipY = handF[1] + Math.sin(wA) * 48;
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
      chargeOrb(ctx, handF[0] + Math.cos(wA) * 48, handF[1] + Math.sin(wA) * 48, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.4, t);

    ctx.restore();
  },
};
