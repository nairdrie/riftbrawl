// ─────────────────────────────────────────────────────────────────────────────
// AEGIS — The Bastion. A rune-forged colossus of the Iron Court: a small crowned
// helm sunk between colossal pauldrons, a deep breastplate, a heavy cape and
// tassets, and a two-handed citadel-breaker warhammer. Built bolder than a
// person — tiny head, hulking shoulders, thick plated limbs — so the silhouette
// reads MONUMENT, not man. Animation personality: enormous mass moved with
// intent. He breathes slow, shifts his weight, plants the hammer to rest, and
// commits his whole body to every swing, then lets the momentum settle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, easeOut, shade, palette, paint, ink, disc, roundRect, poly, stroke2,
  ikSolve, platedSeg, jointCap, gauntlet, groundImpact, glowOn, glowOff,
  chain, chainLocal, ribbon, swingTrail, chargeOrb, dizzyStars,
} from './common.js';

// ── limb metrics (local units; feet at 0, +x forward, y up = negative) ───────
const LEG_T = 23, LEG_S = 22;            // thigh / shin bone lengths
const ARM_U = 18, ARM_F = 17;            // upper-arm / forearm bone lengths

// The warhammer — a banded haft and a rune-forged head, drawn along +x from the
// grip hand at the origin. gripK = how far up the haft the hand chokes.
function hammer(ctx, C, gripK, hot) {
  const L = 82;
  const x0 = -L * gripK, x1 = L * (1 - gripK);
  ctx.save();
  // haft: pale metal core with a dark ink, choked grip-wrap near the hand
  stroke2(ctx, c => { c.moveTo(x0, 0); c.lineTo(x1 - 12, 0); }, 8, C.secL, C.ink);
  stroke2(ctx, c => { c.moveTo(x0 + 2, 0); c.lineTo(x0 + 22, 0); }, 10, C.secD, C.ink, 3);
  // forged bands down the haft
  ink(ctx, C.accD, 2.2);
  for (let i = 0; i < 4; i++) {
    const bx = lerp(x0 + 24, x1 - 22, i / 3);
    ctx.beginPath(); ctx.moveTo(bx, -4.6); ctx.lineTo(bx, 4.6); ctx.stroke();
  }
  // head — a heavy block
  glowOn(ctx, C.accent, hot ? 18 : 8);
  roundRect(ctx, x1 - 19, -23, 42, 46, 8);
  paint(ctx, C.primary, C.ink, 3);
  glowOff(ctx);
  // cel shadow over the lower head
  ctx.save();
  roundRect(ctx, x1 - 19, -23, 42, 46, 8); ctx.clip();
  roundRect(ctx, x1 - 19, 2, 42, 21, 4); paint(ctx, C.priD, null);
  ctx.restore();
  // bright striking faces front & back
  roundRect(ctx, x1 + 19, -18, 9, 36, 3); paint(ctx, C.priL, C.ink, 2.2);
  roundRect(ctx, x1 - 28, -15, 9, 30, 3); paint(ctx, C.priD, C.ink, 2.2);
  // crown rim on the head
  ink(ctx, C.priL, 2);
  ctx.beginPath(); ctx.moveTo(x1 - 15, -21); ctx.lineTo(x1 + 17, -21); ctx.stroke();
  // glowing rune core (a forged eye in the metal)
  glowOn(ctx, C.glow, hot ? 22 : 13);
  poly(ctx, [[x1 + 3, -13], [x1 + 11, 0], [x1 + 3, 13], [x1 - 6, 0]]);
  paint(ctx, C.accent, null);
  disc(ctx, x1 + 3, 0, 3.6, '#ffffff', null);
  glowOff(ctx);
  ctx.restore();
}

// an armored boot — toe forward, sole band, ankle rim
function sabaton(ctx, x, y, C, fill) {
  ctx.save();
  ctx.translate(x, y);
  poly(ctx, [[-8, -10], [7, -10], [13, -3], [13, 3], [-9, 3], [-10, -4]]);
  paint(ctx, fill, C.ink, 2.4);
  roundRect(ctx, -9, -1, 23, 5, 2.5); paint(ctx, C.accD, null);
  ink(ctx, shade(fill, 1.4), 1.4);
  ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(8, -9); ctx.stroke();
  ctx.restore();
}

// a layered, oversized pauldron sitting on the shoulder
function pauldron(ctx, px, py, back, C) {
  const fill = back ? C.secondary : C.primary;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(back ? -1 : 1, 1);                 // mirror the far one
  // big outer dome
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 15, -0.16, Math.PI * 0.86, TAU + Math.PI * 0.16);
  ctx.lineTo(2, 8);
  ctx.closePath();
  paint(ctx, fill, C.ink, 3);
  // cel shadow under-curl
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 15, -0.16, Math.PI * 0.86, TAU + Math.PI * 0.16);
  ctx.lineTo(2, 8); ctx.closePath(); ctx.clip();
  ctx.beginPath(); ctx.ellipse(0, 7, 18, 13, -0.16, 0, TAU);
  paint(ctx, shade(fill, 0.74), null);
  ctx.restore();
  // inner lame ridge + rim + a forged stud
  ink(ctx, C.accent, 2.4);
  ctx.beginPath(); ctx.arc(-1, 0, 10, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
  ink(ctx, shade(fill, 1.42), 1.8);
  ctx.beginPath(); ctx.arc(-1, -1, 14, Math.PI * 1.12, Math.PI * 1.7); ctx.stroke();
  disc(ctx, -8, -3, 2.4, C.accent, C.ink, 1.4);
  ctx.restore();
}

// a plated arm: upper plate + elbow couter + forearm plate. returns the hand pt.
function drawArm(ctx, sx, sy, hx, hy, dir, C, o) {
  const { jx, jy, ex, ey } = ikSolve(sx, sy, hx, hy, ARM_U, ARM_F, dir);
  platedSeg(ctx, sx, sy, jx, jy, o.uw, C, { fill: o.fill, light: o.light });
  platedSeg(ctx, jx, jy, ex, ey, o.fw, C, { fill: o.fill, light: o.light });
  jointCap(ctx, jx, jy, o.elbow, C, { fill: o.fill });
  return [ex, ey];
}

// a plated leg: cuisse + knee poleyn + greave + sabaton
function drawLeg(ctx, hx, hy, foot, bend, C, o) {
  const { jx, jy, ex, ey } = ikSolve(hx, hy, foot[0], foot[1] - 4, LEG_T, LEG_S, bend);
  platedSeg(ctx, hx, hy, jx, jy, o.tw, C, { fill: o.fill, light: -1 });
  platedSeg(ctx, jx, jy, ex, ey, o.sw, C, { fill: o.fill, light: -1 });
  jointCap(ctx, jx, jy, o.knee, C, { fill: o.fill });
  sabaton(ctx, ex, ey, C, o.fill);
}

export const aegisRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const M = A.move;
    const st = A.st;
    const landK = st?.landK ?? 0;

    // ── breathing, idle weight-shift, stomp bob ──────────────────────────────
    const idle = A.grounded && !M && !A.guard && !A.dizzy && !A.reel &&
                 A.runAmt < 0.05 && A.crouch < 0.2;
    const sway = idle ? Math.sin(t * 0.85 + (p.idx ?? 0)) : 0;     // slow contrapposto
    const crouchDrop = A.crouch * 16 + landK * 9;                   // load knees on landing
    const breathY = A.breathe * 1.7;
    const stepBob = A.grounded ? Math.abs(Math.sin(A.runPhase)) * 5 * A.runAmt : 0;
    const hipX = sway * 2.4;
    const hipY = -42 + crouchDrop + stepBob * 0.5;
    const shY = -73 + crouchDrop * 1.05 + breathY + stepBob;
    const headY = -89 + crouchDrop * 1.1 + breathY * 1.2 + stepBob;
    const headR = 10.4;

    // ── lean / lunge per state ───────────────────────────────────────────────
    let lean = A.lean - sway * 0.05;          // counter-rotate shoulders vs hips
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 7;
      if (M.ph === 'wind') lean -= 0.16 * M.wk;
      else if (M.ph === 'hit') lean += 0.24;
      else lean += 0.24 * (1 - M.rk);
      if (M.id === 'sb') { lean = M.ph === 'hit' ? 0.52 : lean + 0.32 * M.wk; lunge = M.ph === 'hit' ? 12 : 0; }
      if (M.id === 'ub') lean = M.ph === 'wind' ? 0.16 : -0.2;     // coil, then erupt
      if (M.id === 'db') lean = M.ph === 'wind' ? -0.1 : 0.1;
      if (M.id === 'utilt') lean = M.ph === 'hit' ? -0.12 : lean;  // rise tall
    }
    if (A.reel) lean = -0.5;
    if (A.hang) lean = -0.1;

    // ── cloth anchors (world space → verlet → local) ─────────────────────────
    const wx = (lx, ly) => [p.x + (lx + hipX) * p.facing * char.scale, p.y + ly * char.scale];
    const [cax, cay] = wx(-10 - lean * 8, shY + 2);
    const capePts = chainLocal(
      chain(st, 'cape', 6, 13 * char.scale, cax, cay, { damp: 0.88, windX: -p.facing * 30 }),
      p, char.scale,
    );
    const [pax, pay] = wx(-2, headY - headR * 1.5);
    const plumePts = chainLocal(
      chain(st, 'plume', 5, 7.5 * char.scale, pax, pay, { damp: 0.85, grav: -120, windX: -p.facing * 240 }),
      p, char.scale,
    );

    ctx.save();
    ctx.translate(lunge + hipX, 0);
    ctx.rotate(lean * 0.5);

    // ── cape (furthest back) ─────────────────────────────────────────────────
    ribbon(ctx, capePts, 30, 40, C.secondary, C.ink, 2.6);
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ribbon(ctx, capePts.map(([x, y]) => [x + 3, y - 1]), 14, 22, C.secL, null);
    ctx.restore();
    // gold trim down the cape spine
    ctx.save();
    ctx.globalAlpha *= 0.6;
    ink(ctx, C.accD, 2);
    ctx.beginPath();
    capePts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    ctx.restore();

    // ── foot targets (stance / run / air / brace) ────────────────────────────
    const stance = 16;
    let f1 = [stance + 3 + sway * 1.5, 0], f2 = [-stance + sway * 1.5, 0];
    let bend1 = 1, bend2 = -1;
    if (A.airborne && !A.hang) {
      f1 = [11 + A.rise * 5, -14 - A.rise * 7];
      f2 = [-13, -4 + A.fall * 3];
      if (M && M.id === 'dair') { f1 = [6, 4]; f2 = [-9, -12]; }   // stomp tuck
    } else if (A.hang) {
      f1 = [3, -7]; f2 = [-8, -2];
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase, k = A.runAmt;
      f1 = [Math.sin(ph) * 23 * k, -Math.max(0, Math.cos(ph)) * 10 * k];
      f2 = [Math.sin(ph + Math.PI) * 23 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 10 * k];
    } else if (M && M.ph !== 'wind') {
      f1 = [stance + 9, 0]; f2 = [-stance - 5, 0];                 // braced wide
    } else if (idle) {
      f1 = [stance + 3 - sway * 2, 0]; f2 = [-stance - sway * 3, 0];  // weight on a leg
    }
    if (A.crouch > 0.3) { f1[0] += 5; f2[0] -= 5; }

    // ── BACK LEG (far, mid tone) ─────────────────────────────────────────────
    drawLeg(ctx, hipX - 6, hipY, f2, bend2, C,
      { fill: C.secondary, tw: 14, sw: 12.5, knee: 7 });

    // ── FRONT LEG (near, bright) ─────────────────────────────────────────────
    drawLeg(ctx, hipX + 6, hipY, f1, bend1, C,
      { fill: C.primary, tw: 15, sw: 13, knee: 7.4 });

    // ── pelvis + tasset skirt (over the thigh tops) ──────────────────────────
    poly(ctx, [[-18, hipY - 7], [18, hipY - 7], [22, hipY + 12], [11, hipY + 16],
               [0, hipY + 11], [-11, hipY + 16], [-22, hipY + 12]]);
    paint(ctx, C.secondary, C.ink, 2.6);
    poly(ctx, [[-16, hipY + 5], [16, hipY + 5], [22, hipY + 12], [11, hipY + 16],
               [0, hipY + 11], [-11, hipY + 16], [-22, hipY + 12]]);
    paint(ctx, shade(C.secondary, 0.74), null);
    // gold trim along the skirt hem + central seam break up the dark mass
    ink(ctx, C.accent, 1.8);
    ctx.beginPath();
    ctx.moveTo(-21, hipY + 11.5); ctx.lineTo(-11, hipY + 15); ctx.lineTo(0, hipY + 10);
    ctx.lineTo(11, hipY + 15); ctx.lineTo(21, hipY + 11.5);
    ctx.stroke();
    ink(ctx, C.accD, 1.6);
    ctx.beginPath(); ctx.moveTo(0, hipY - 4); ctx.lineTo(0, hipY + 10); ctx.stroke();
    ink(ctx, shade(C.secondary, 1.5), 1.4);
    ctx.beginPath(); ctx.moveTo(-15, hipY - 4); ctx.lineTo(-19, hipY + 9); ctx.stroke();

    // ── back pauldron (peeks behind the torso) ───────────────────────────────
    pauldron(ctx, -24, shY - 5, true, C);

    // ── back arm target (computed up front; drawn after the torso) ───────────
    const armO = { uw: 13, fw: 11, elbow: 7 };
    const shF = [8, shY + 4], shB = [-9, shY + 3];
    let hF, hB, wA = 1.15, twoHand = true, drawHammer = true, hot = false;

    if (A.hang) {
      hF = [16, shY - 32 + Math.sin(t * 2.2) * 1.6]; hB = [-2, shY + 16];
      wA = 1.5; twoHand = false;
    } else if (A.guard) {
      hF = [21, shY + 13]; hB = [13, shY + 17]; wA = Math.PI / 2 - 0.06; twoHand = false;
    } else if (A.dizzy) {
      hF = [17 + Math.sin(t * 8) * 3, shY + 22]; hB = [-17, shY + 22]; wA = 1.4; twoHand = false;
    } else if (A.reel) {
      hF = [19, shY - 9]; hB = [-19, shY - 7]; wA = 0.9; twoHand = false;
    } else if (M) {
      const reach = 28;
      hot = M.ph === 'hit';
      if (M.id === 'jab') {
        const ext = M.ph === 'hit' ? 1 : M.ph === 'wind' ? M.wk * 0.3 : 1 - M.rk;
        hB = [lerp(-9, 50, easeOut(ext)), shY + lerp(15, 9, ext)];
        hF = [17, shY + 24]; wA = 1.1; twoHand = false;
      } else if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : M.ph === 'rec' ? 1 - M.rk : 1;
        hF = [lerp(16, 21, k), shY + lerp(18, 9, k)];
        hB = [lerp(12, 28, k), shY + lerp(21, 13, k)];
        wA = lerp(1.2, -0.42, k); twoHand = false;
      } else if (M.id === 'ub') {
        // coil low in wind-up, then drive the hammer skyward
        const up = M.ph === 'wind' ? M.wk : 1;
        hF = [lerp(14, 4, up), shY + lerp(20, -20, up)];
        wA = lerp(0.7, -Math.PI / 2 + 0.1, up);
      } else if (M.id === 'sb') {
        hF = [12, shY + 16]; hB = [2, shY + 18]; wA = -0.25; twoHand = true;
      } else {
        const a = M.swing;
        hF = [Math.cos(a) * reach, shY + 4 + Math.sin(a) * reach];
        wA = a + 0.12;
      }
      if (twoHand && !hB) hB = [hF[0] * 0.42 - 5, hF[1] * 0.42 + shY * 0.58 + 7];
    } else if (A.airborne) {
      hF = [16, shY + 8 - A.rise * 5]; hB = [-15, shY + 12]; wA = -0.7 + A.fall * 0.6; twoHand = false;
    } else if (A.runAmt > 0.05) {
      hF = [12, shY + 9]; hB = [-10 - Math.sin(A.runPhase) * 6 * A.runAmt, shY + 16]; wA = -2.45; twoHand = false;
    } else {
      // idle: hammer planted head-down in front, both gauntlets resting on it,
      // a slow lean into it; occasional re-grip fidget
      const regrip = A.fidget > 0.86 ? Math.sin((A.fidget - 0.86) / 0.14 * Math.PI) : 0;
      hF = [16, shY + 19 - regrip * 2 + sway * 1.2];
      hB = [11, shY + 22 + sway * 1.2];
      wA = 1.18 + regrip * 0.06;
      twoHand = true;
    }

    // ── torso: gorget, broad breastplate, ab lames, belt + sigil ─────────────
    roundRect(ctx, -11, shY - 10, 22, 10, 4); paint(ctx, C.secD, C.ink, 2.4);   // gorget
    poly(ctx, [[-24, shY - 2], [24, shY - 2], [16, hipY + 2], [-16, hipY + 2]]); // breastplate
    paint(ctx, C.primary, C.ink, 3);
    poly(ctx, [[-21.5, shY + 15], [21.5, shY + 15], [16, hipY + 2], [-16, hipY + 2]]);
    paint(ctx, C.priD, null);                                                    // cel shadow
    // sternum ridge + pectoral rim
    ink(ctx, C.priL, 2);
    ctx.beginPath(); ctx.moveTo(0, shY); ctx.lineTo(0, hipY - 1); ctx.stroke();
    ink(ctx, C.priL, 1.6);
    ctx.beginPath(); ctx.moveTo(-21, shY + 1); ctx.quadraticCurveTo(-11, shY - 3, -2, shY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(21, shY + 1); ctx.quadraticCurveTo(11, shY - 3, 2, shY + 5); ctx.stroke();
    // ab lames
    for (let i = 0; i < 2; i++) {
      const ly = lerp(shY + 17, hipY - 2, i / 1.4);
      roundRect(ctx, -14 + i, ly, 28 - i * 2, 5, 2);
      paint(ctx, C.secondary, C.ink, 1.7);
    }
    // belt + glowing chest sigil
    roundRect(ctx, -17, hipY - 7, 34, 7, 3); paint(ctx, C.accD, C.ink, 2);
    glowOn(ctx, C.glow, M ? 11 : 8);
    poly(ctx, [[0, shY + 5], [6, shY + 12], [0, shY + 19], [-6, shY + 12]]);
    paint(ctx, C.accent, C.ink, 2);
    glowOff(ctx);

    // ── front pauldron (over the chest/shoulder) ─────────────────────────────
    pauldron(ctx, 24, shY - 5, false, C);

    // ── head: small crowned helm sunk into the gorget ────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    // plume streaming from the crown
    ribbon(ctx, plumePts.map(([x, y]) => [x - lean * 5, y - headY]), 9, 2.5, C.accent, C.ink, 2.2);
    // helm dome (bright, rim-lit) with a darker back curve
    ctx.beginPath();
    ctx.arc(0, 0, headR * 1.22, Math.PI * 0.88, TAU + Math.PI * 0.12);
    paint(ctx, C.primary, C.ink, 3);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, headR * 1.22, Math.PI * 0.88, TAU + Math.PI * 0.12); ctx.clip();
    ctx.beginPath(); ctx.arc(-headR * 0.4, headR * 0.2, headR * 1.2, 0, TAU);
    paint(ctx, C.priD, null);
    ctx.restore();
    ink(ctx, C.priL, 1.8);
    ctx.beginPath(); ctx.arc(0, 0, headR * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    // dark T-visor recess
    roundRect(ctx, -headR * 0.92, -headR * 0.1, headR * 1.84, headR * 0.96, headR * 0.28);
    paint(ctx, shade(C.secondary, 0.78), C.ink, 2.4);
    // brow ridge over the visor
    roundRect(ctx, -headR * 0.96, -headR * 0.34, headR * 1.92, headR * 0.32, headR * 0.14);
    paint(ctx, C.secondary, C.ink, 2);
    // cheek guards
    poly(ctx, [[-headR * 0.92, 0], [-headR * 0.5, 0], [-headR * 0.64, headR * 0.78]]);
    paint(ctx, C.primary, C.ink, 1.8);
    poly(ctx, [[headR * 0.92, 0], [headR * 0.5, 0], [headR * 0.64, headR * 0.78]]);
    paint(ctx, C.primary, C.ink, 1.8);
    // tall crown ridge (gold)
    poly(ctx, [[-headR * 0.5, -headR * 1.08], [-headR * 0.15, -headR * 1.82],
               [headR * 0.15, -headR * 1.82], [headR * 0.5, -headR * 1.08]]);
    paint(ctx, C.accent, C.ink, 2.2);
    ink(ctx, C.accD, 1.4);
    ctx.beginPath(); ctx.moveTo(0, -headR * 1.05); ctx.lineTo(0, -headR * 1.72); ctx.stroke();
    // glowing visor slit (the "eye")
    glowOn(ctx, C.glow, M ? 16 : 9);
    const vw = A.dizzy ? headR * 0.5 : headR * 1.0;
    roundRect(ctx, headR * 0.05, headR * 0.1, vw * 0.86, headR * 0.32, headR * 0.16);
    paint(ctx, A.hit || A.dizzy ? '#ff8a6b' : C.glow, null);
    disc(ctx, headR * 0.05, headR * 0.26, headR * 0.17, A.hit || A.dizzy ? '#ffd2b0' : '#eaf4ff', null);
    glowOff(ctx);
    ctx.restore();

    // ── back arm (the far holding arm) ───────────────────────────────────────
    if (hB) {
      drawArm(ctx, shB[0], shB[1], hB[0], hB[1], 1, C, { ...armO, fill: C.secD, light: -1 });
      gauntlet(ctx, hB[0], hB[1], 6.4, wA + Math.PI, C, { fill: C.secD });
    }

    // ── front arm + gauntlet + hammer (foreground) ───────────────────────────
    const handF = drawArm(ctx, shF[0], shF[1], hF[0], hF[1], -1, C,
      { ...armO, fill: C.primary, light: -1 });
    if (drawHammer) {
      ctx.save();
      ctx.translate(handF[0], handF[1]);
      ctx.rotate(wA);
      hammer(ctx, C, twoHand ? 0.3 : 0.16, hot);
      ctx.restore();
    }
    gauntlet(ctx, handF[0], handF[1], 7.2, wA, C, { fill: C.primary, accent: C.accent });

    // ── move FX ──────────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      const heavyGround = A.grounded && (M.id === 'ftilt' || M.id === 'utilt' ||
                          M.id === 'dtilt' || M.id === 'fair' || M.id === 'sb');
      if (M.id === 'db') {
        // Verdict Counter: a watching rune ward shimmers in front of him
        const pulse = 0.7 + 0.3 * Math.sin(t * 10);
        glowOn(ctx, C.glow, 18 * pulse);
        ink(ctx, C.accent + 'cc', 2.8);
        ctx.beginPath(); ctx.ellipse(28, shY + 6, 14 * pulse, 32 * pulse, 0, 0, TAU); ctx.stroke();
        ink(ctx, C.glow + '88', 1.8);
        ctx.beginPath(); ctx.ellipse(28, shY + 6, 8, 19, 0, t * 3, t * 3 + 4.4); ctx.stroke();
        glowOff(ctx);
      } else if (M.id === 'sb') {
        // shoulder-charge speed wedge
        ctx.save();
        ctx.globalAlpha *= 0.55;
        glowOn(ctx, C.glow, 14);
        poly(ctx, [[-48, shY - 16], [-14, shY + 2], [-48, shY + 20]]);
        paint(ctx, C.trail + '88', null);
        glowOff(ctx);
        ctx.restore();
      } else if (M.id === 'ub') {
        // Ascendant Pillar — a rising column of rune-light erupts around him
        const k = M.hk;
        ctx.save();
        glowOn(ctx, C.glow, 22);
        const g = ctx.createLinearGradient(0, shY + 18, 0, shY - 132);
        g.addColorStop(0, C.glow + '00');
        g.addColorStop(0.35, C.glow + '5a');
        g.addColorStop(0.8, C.accent + '4a');
        g.addColorStop(1, C.accent + '00');
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = g;
        const cw = 13 + 4 * Math.sin(t * 24);
        ctx.fillRect(-cw, shY - 132, cw * 2, 150);
        // upward rune streaks
        ink(ctx, C.accent, 2.4);
        for (let i = -1; i <= 1; i++) {
          ctx.globalAlpha = 0.6;
          const sx = i * 11;
          ctx.beginPath();
          ctx.moveTo(sx, shY + 16 - k * 24);
          ctx.lineTo(sx, shY - 78 - k * 38);
          ctx.stroke();
        }
        // base shock ring kicking off the launch
        ctx.globalAlpha = 0.8 * (1 - k);
        ink(ctx, C.glow, 3);
        ctx.beginPath(); ctx.ellipse(0, shY + 26, 28 * (0.5 + k), 8, 0, 0, TAU); ctx.stroke();
        glowOff(ctx);
        ctx.restore();
      } else if (M.id !== 'jab' && M.id !== 'nb') {
        swingTrail(ctx, 0, shY + 3, 34, 88, M.aim - 1.9 + M.hk * 0.6, M.swing + 0.3, C.trail, 0.85);
      }
      // ground shock under heavy grounded swings, synced to the strike (feet=0)
      if (heavyGround) {
        const ix = M.id === 'utilt' ? 8 : 46;
        groundImpact(ctx, ix, 1, M.hk, easeOut(M.hk), C);
      }
    }
    // neutral-B charge held at the hammer head
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      const hx = handF[0] + Math.cos(wA) * 56, hy = handF[1] + Math.sin(wA) * 56;
      chargeOrb(ctx, hx, hy, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.2, t);

    ctx.restore();
  },
};
