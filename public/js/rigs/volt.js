// ─────────────────────────────────────────────────────────────────────────────
// VOLT — The Storm Dancer. Pint-sized lightning duelist: a chunky crackling mane
// of energy hair, a goggle visor with glowing lens eyes, a streaming bolt-scarf,
// and a reverse-grip storm dagger. Built tiny, wiry and electric — lean tapered
// limbs (sinew, not plate), a real gripping hand and a boxer fist, all rim-lit by
// one key light. Animation personality: kinetic. Bounces on his toes at idle,
// sprints in a full lean with speed streaks, snaps through attacks with electric
// arcs and almost no wind-up — the lightest, snappiest fighter on the roster.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, palette, paint, ink, disc, roundRect, poly,
  stroke2, shade, ikSolve, platedSeg, jointCap, glowOn, glowOff,
  chain, chainLocal, ribbon, swingTrail, bolt, chargeOrb, dizzyStars, face,
} from './common.js';

// ── limb metrics (local units; feet at 0, +x forward, y up = negative) ───────
const LEG_T = 16, LEG_S = 15.5;          // thigh / shin bone lengths (short, lithe)
const ARM_U = 13, ARM_F = 12;            // upper-arm / forearm bone lengths (whippy)

// The storm dagger — a glowing zigzag blade, drawn along +x from the grip hand.
// Held in a reverse grip, so the blade runs back past the wrist (negative x).
function dagger(ctx, C, twirl = 0, hot = false) {
  ctx.save();
  if (twirl) ctx.rotate(twirl);
  // cross-guard + wrapped grip core at the hand
  stroke2(ctx, c => { c.moveTo(-1, -5.5); c.lineTo(-1, 5.5); }, 3.4, C.secL, C.ink, 2.6);
  disc(ctx, -1, 0, 2.1, C.primary, C.ink, 1.6);
  // jagged blade — bright accent core with an inked edge and a white hot line
  glowOn(ctx, C.accent, hot ? 18 : 11);
  stroke2(ctx, c => {
    c.moveTo(2, 0); c.lineTo(13, -4); c.lineTo(21, 2); c.lineTo(33, -3);
  }, 5, C.accent, C.ink, 3.6);
  stroke2(ctx, c => {
    c.moveTo(3, 0); c.lineTo(13, -3); c.lineTo(21, 1); c.lineTo(31, -2.5);
  }, 1.7, '#ffffff', null, 0);
  glowOff(ctx);
  ctx.restore();
}

// a light runner's boot — pointed toe forward, thin sole band, ankle rim
function sprintBoot(ctx, x, y, C, fill) {
  ctx.save();
  ctx.translate(x, y);
  poly(ctx, [[-4, -7], [4, -7], [9, -1.5], [9, 2], [-5, 2], [-6, -3]]);
  paint(ctx, fill, C.ink, 2);
  roundRect(ctx, -6, 0, 15, 2.8, 1.4); paint(ctx, shade(fill, 0.7), null);   // sole
  ink(ctx, C.accent, 1.3);                                                    // accent lace flash
  ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(5, -6); ctx.stroke();
  ctx.restore();
}

// a light glove gripping along `ang` — a quick, tapered hand (not heavy plate).
// `rev` flips the cuff behind for a reverse grip. Optional accent knuckle stud.
function glove(ctx, x, y, r, ang, C, o = {}) {
  const fill = o.fill ?? C.primary;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  // tapered cuff behind the hand
  poly(ctx, [[-r * 1.25, -r * 0.92], [-r * 0.45, -r * 0.78], [-r * 0.45, r * 0.78], [-r * 1.25, r * 0.92]]);
  paint(ctx, shade(fill, 0.8), C.ink, 1.9);
  // hand mass
  roundRect(ctx, -r * 0.45, -r * 0.82, r * 1.4, r * 1.64, r * 0.5);
  paint(ctx, fill, C.ink, 2.1);
  // shaded underside
  ctx.save();
  roundRect(ctx, -r * 0.45, -r * 0.82, r * 1.4, r * 1.64, r * 0.5); ctx.clip();
  roundRect(ctx, -r * 0.45, r * 0.1, r * 1.4, r * 0.9, r * 0.3);
  paint(ctx, shade(fill, 0.74), null);
  ctx.restore();
  // knuckle line + rim on the lit edge
  ink(ctx, C.ink, 1.1);
  ctx.beginPath(); ctx.moveTo(r * 0.45, -r * 0.36); ctx.lineTo(r * 0.9, -r * 0.36); ctx.stroke();
  ink(ctx, shade(fill, 1.5), 1.2);
  ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.74); ctx.lineTo(r * 0.85, -r * 0.74); ctx.stroke();
  if (o.accent) disc(ctx, r * 0.18, -r * 0.02, r * 0.28, o.accent, C.ink, 1.2);
  ctx.restore();
}

// a boxer's fist — a compact knuckled mass, rim-lit; the back guard hand.
function fist(ctx, x, y, r, ang, C, fill) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  disc(ctx, 0, 0, r, fill, C.ink, 2);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.45, r * 0.95, 0, TAU);
  ctx.fillStyle = shade(fill, 0.74); ctx.fill();
  ctx.restore();
  ink(ctx, C.ink, 1.1);                                   // knuckle creases
  ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.55); ctx.lineTo(r * 0.2, r * 0.55); ctx.stroke();
  ink(ctx, shade(fill, 1.5), 1.2);                        // rim crown
  ctx.beginPath(); ctx.arc(0, 0, r * 0.72, Math.PI * 1.12, Math.PI * 1.9); ctx.stroke();
  ctx.restore();
}

// a slim tapered arm: upper plate + elbow couter + forearm plate. returns hand pt.
function drawArm(ctx, sx, sy, hx, hy, dir, C, o) {
  const { jx, jy, ex, ey } = ikSolve(sx, sy, hx, hy, ARM_U, ARM_F, dir);
  platedSeg(ctx, sx, sy, jx, jy, o.uw, C, { fill: o.fill, light: -1 });
  platedSeg(ctx, jx, jy, ex, ey, o.fw, C, { fill: o.fill, light: -1 });
  jointCap(ctx, jx, jy, o.elbow, C, { fill: o.fill });
  return [ex, ey];
}

// a slim tapered leg: thigh + knee + shin + boot
function drawLeg(ctx, hx, hy, foot, bend, C, o) {
  const { jx, jy, ex, ey } = ikSolve(hx, hy, foot[0], foot[1] - 2.5, LEG_T, LEG_S, bend);
  platedSeg(ctx, hx, hy, jx, jy, o.tw, C, { fill: o.fill, light: -1 });
  platedSeg(ctx, jx, jy, ex, ey, o.sw, C, { fill: o.fill, light: -1 });
  jointCap(ctx, jx, jy, o.knee, C, { fill: o.fill });
  sprintBoot(ctx, ex, ey, C, o.fill);
}

export const voltRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const SKIN = '#ffe3bd';

    // Storm Blink: gone between vanish and reappear — draw only a crackling streak
    if (M && M.id === 'sb' && M.data.warp != null &&
        M.f >= M.data.warp - 1 && M.f <= M.data.warp + 2) {
      glowOn(ctx, C.accent, 20);
      ink(ctx, C.accent, 3.4);
      ctx.beginPath();
      ctx.moveTo(-32, -44); ctx.lineTo(-6, -52); ctx.lineTo(3, -36); ctx.lineTo(28, -46);
      ctx.stroke();
      ink(ctx, '#ffffff', 1.5);
      ctx.beginPath();
      ctx.moveTo(-27, -44); ctx.lineTo(-6, -50); ctx.lineTo(3, -38); ctx.lineTo(23, -45);
      ctx.stroke();
      glowOff(ctx);
      return;
    }

    // ── metrics + idle toe-bounce ────────────────────────────────────────────
    const idleAmt = A.grounded && !M && !A.guard && !A.dizzy && !A.reel &&
                    A.runAmt < 0.05 && A.crouch < 0.2 ? 1 : 0;
    const bounce = idleAmt * Math.abs(Math.sin(t * 4.8)) * -2.6;   // springy boxer bounce
    const weightShift = idleAmt * Math.sin(t * 2.4) * 2.0;
    const crouchDrop = A.crouch * 12;
    const breathY = A.breathe * 1.0;
    const hipY = -31 + crouchDrop + bounce * 0.6;
    const shY = -53 + crouchDrop * 1.1 + bounce + breathY;
    const headY = -68 + crouchDrop * 1.15 + bounce * 1.15 + breathY * 1.1;
    const headR = 11;

    // ── lean / lunge (snappy — almost no wind-up coil) ───────────────────────
    let lean = A.lean * 1.5;
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 8;
      if (M.ph === 'wind') lean -= 0.1 * M.wk;        // barely any anticipation
      else if (M.ph === 'hit') lean += 0.32;
      else lean += 0.32 * (1 - M.rk);
      if (M.id === 'sb') { lean = M.ph === 'hit' ? 0.75 : lean; lunge = M.ph === 'hit' ? 12 : 0; }
      if (M.id === 'ub') lean = M.ph === 'wind' ? -0.1 : -0.35;
      if (M.id === 'db') lean = M.ph === 'hit' ? 0 : lean;     // upright burst
    }
    if (A.reel) lean = -0.55;
    if (A.hang) lean = -0.1;

    // ── scarf (world space → verlet → local) ─────────────────────────────────
    const wxy = (lx, ly) => [p.x + lx * p.facing * s, p.y + ly * s];
    const [sax, say] = wxy(-4, shY + 1);
    const scarfPts = chainLocal(
      chain(A.st, 'scarf', 6, 8 * s, sax, say,
        { damp: 0.9, grav: 50, windX: -p.facing * (90 + Math.abs(p.vx) * 18), windY: Math.sin(t * 7) * 40 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge + weightShift * 0.4, 0);

    // speed streaks when sprinting (behind everything)
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

    // nair / dair: whole-body spin (the Ion Wheel / Thunder Drop)
    if (M && (M.id === 'nair' || M.id === 'dair') && M.ph !== 'wind') {
      const spin = (M.ph === 'hit' ? M.hk : 1 + M.rk * 0.3) * TAU * (M.id === 'dair' ? 0.6 : 1);
      ctx.translate(0, hipY); ctx.rotate(spin * (M.id === 'dair' ? 0.3 : 1)); ctx.translate(0, -hipY);
    }

    // ── scarf behind the body ────────────────────────────────────────────────
    glowOn(ctx, C.accent, 6);
    ribbon(ctx, scarfPts, 10, 3, C.accent, C.ink, 2);
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ribbon(ctx, scarfPts.map(([x, y]) => [x + 1.5, y - 1.5]), 4.5, 1.5, '#ffffff', null);
    ctx.restore();
    glowOff(ctx);

    // ── foot targets (stance / run / air / brace) ────────────────────────────
    let f1 = [7 + weightShift * 0.4, bounce * 0.25], f2 = [-7 + weightShift * 0.4, bounce * 0.25];
    let bend1 = 1, bend2 = -1;
    if (A.hang) {
      f1 = [3, -8 + Math.sin(t * 6) * 2]; f2 = [-5, -3 + Math.sin(t * 6 + 1.5) * 2];   // impatient kick
    } else if (A.airborne) {
      if (M && M.id === 'dair') { f1 = [2, 6]; f2 = [-3, 7]; }                          // drill point
      else { f1 = [9 + A.rise * 4, -14 - A.rise * 7]; f2 = [-9, -3 - A.rise * 6]; }     // tuck
    } else if (A.runAmt > 0.05) {
      const ph = A.runPhase * 1.15, k = A.runAmt;
      f1 = [Math.sin(ph) * 19 * k, -Math.max(0, Math.cos(ph)) * 11 * k];
      f2 = [Math.sin(ph + Math.PI) * 19 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 11 * k];
    } else if (M && M.ph !== 'wind' && M.id !== 'db' && M.id !== 'ub') {
      f1 = [11, 0]; f2 = [-10, 0];                                                      // braced wide
    } else if (idleAmt) {
      f1 = [7 + weightShift * 0.4 - weightShift * 0.6, 0]; f2 = [-7 + weightShift * 0.4, 0];
    }
    if (A.crouch > 0.3) { f1[0] += 3; f2[0] -= 3; }

    // ── back leg (far, darker) ───────────────────────────────────────────────
    drawLeg(ctx, -3.5, hipY, f2, bend2, C, { fill: C.secondary, tw: 7, sw: 5.6, knee: 3.6 });
    // ── front leg (near, bright) ─────────────────────────────────────────────
    drawLeg(ctx, 3.5, hipY, f1, bend1, C, { fill: C.primary, tw: 7.6, sw: 6, knee: 4 });

    // ── pelvis wedge + belt (tie the legs to the torso) ──────────────────────
    poly(ctx, [[-8, hipY - 3], [8, hipY - 3], [6, hipY + 5], [-6, hipY + 5]]);
    paint(ctx, C.secondary, C.ink, 2.2);
    roundRect(ctx, -8.5, hipY - 4, 17, 4.6, 2); paint(ctx, C.primary, C.ink, 1.8);   // belt
    ink(ctx, C.accD, 1.3);
    ctx.beginPath(); ctx.moveTo(-6, hipY - 1.6); ctx.lineTo(6, hipY - 1.6); ctx.stroke();
    glowOn(ctx, C.glow, M ? 8 : 5);                                                  // belt buckle spark
    disc(ctx, 0, hipY - 1.6, 1.8, C.accent, C.ink, 1.2);
    glowOff(ctx);

    // ── back arm (boxer guard / counterweight) — computed up front ───────────
    const shB = [-4.5, shY + 2];
    let hB = [-12, shY + 10], wAB = 0;
    if (idleAmt) hB = [3 - weightShift * 0.3, shY + 5 + Math.sin(t * 4.8) * 1.3];     // guard fist up
    else if (A.hang) hB = [-3, shY + 12];
    else if (A.guard) hB = [9, shY + 8];
    else if (A.dizzy) hB = [-14, shY + 14];
    else if (A.reel) hB = [-15, shY - 8];
    else if (A.airborne) hB = [-12, shY - 4];
    else if (A.runAmt > 0.05) hB = [-11 - Math.sin(A.runPhase * 1.15) * 7 * A.runAmt, shY + 7];
    else if (M) {
      if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : 1;
        hB = [lerp(-6, -22, k), shY + lerp(6, -12, k)];        // X-pose burst
      } else if (M.id === 'ub') {
        hB = [-9, shY + 12];                                   // trailing arm in the zip
      } else hB = [-13, shY + 8 - M.k * 4];                    // tucked guard during attacks
    }
    wAB = Math.atan2(hB[1] - shB[1], hB[0] - shB[0]);

    // ── torso: sleeveless lightning suit ─────────────────────────────────────
    // collar yoke behind the head
    roundRect(ctx, -7, shY - 8, 14, 8, 3.5); paint(ctx, C.secD, C.ink, 2);
    // suit body — bright primary plate (the dominant read) with a cel shadow
    poly(ctx, [[-9.5, shY - 2], [9.5, shY - 2], [7.5, hipY + 2], [-7.5, hipY + 2]]);
    paint(ctx, C.primary, C.ink, 2.6);
    poly(ctx, [[-8.5, shY + 9], [8.5, shY + 9], [7.5, hipY + 2], [-7.5, hipY + 2]]);
    paint(ctx, C.priD, null);                                  // cel shadow lower half
    // one navy flank on the unlit (back) side — keeps the single key light read
    poly(ctx, [[-9.5, shY - 2], [-6, shY - 2], [-4.5, hipY + 2], [-7.5, hipY + 2]]);
    paint(ctx, C.secondary, null);
    // collarbone trim + sternum sheen
    ink(ctx, C.secL, 1.4);
    ctx.beginPath(); ctx.moveTo(-8.5, shY - 0.5); ctx.quadraticCurveTo(0, shY - 4, 8.5, shY - 0.5); ctx.stroke();
    ink(ctx, C.priL, 1.4);
    ctx.beginPath(); ctx.moveTo(-7.5, shY + 1.5); ctx.quadraticCurveTo(0, shY - 1.5, 7.5, shY + 1.5); ctx.stroke();
    // glowing lightning chevron down the chest
    glowOn(ctx, C.accent, M ? 11 : 8);
    stroke2(ctx, c => {
      c.moveTo(-4, shY + 3); c.lineTo(3, shY + 8); c.lineTo(-3, shY + 12); c.lineTo(4, shY + 17);
    }, 3, C.accent, null, 0);
    stroke2(ctx, c => {
      c.moveTo(-4, shY + 3); c.lineTo(3, shY + 8); c.lineTo(-3, shY + 12); c.lineTo(4, shY + 17);
    }, 1.1, '#ffffff', null, 0);
    glowOff(ctx);

    // ── back arm (far) — drawn behind the head/front arm ─────────────────────
    const handB = drawArm(ctx, shB[0], shB[1], hB[0], hB[1], 1, C,
      { uw: 6, fw: 5, elbow: 3.4, fill: C.secD });
    fist(ctx, handB[0], handB[1], 3.8, wAB, C, C.secD);

    // ── head: spiky energy hair + goggle visor ───────────────────────────────
    ctx.save();
    ctx.translate(lean * 6 + weightShift * 0.3, headY);
    // hair — one chunky mass swept up and back, flickering like live current
    const flick = (i) => Math.sin(t * 13 + i * 2.7) * 1.8;
    glowOn(ctx, C.glow, 10);
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
    glowOff(ctx);
    // hair cel shadow at the roots (form, not flat)
    poly(ctx, [
      [headR * 0.55, -headR * 0.78],
      [headR * 0.1, -headR * 1.05],
      [-headR * 0.62, -headR * 1.0],
      [-headR * 0.95, -headR * 0.5],
      [headR * 0.4, -headR * 0.55],
    ]);
    paint(ctx, C.priD, null);
    // rim-lit forelock edges (lit side catches the key light)
    ink(ctx, C.priL, 1.4);
    ctx.beginPath();
    ctx.moveTo(headR * 0.5, -headR * 1.08); ctx.lineTo(headR * 0.9, -headR * 1.78);
    ctx.moveTo(headR * 0.04, -headR * 1.3); ctx.lineTo(-headR * 0.12, -headR * 2.3);
    ctx.stroke();
    // face
    disc(ctx, 0, 0, headR, SKIN, C.ink, 2.4);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, headR, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.arc(-headR * 0.45, headR * 0.4, headR * 0.95, 0, TAU);
    paint(ctx, shade(SKIN, 0.86), null);                      // cel shadow on the dark flank
    ctx.restore();
    // goggle band — navy strap across the brow with a forged rim
    roundRect(ctx, -headR * 1.04, -headR * 0.5, headR * 2.1, headR * 0.74, headR * 0.34);
    paint(ctx, C.secondary, C.ink, 2.2);
    ink(ctx, C.secL, 1.3);
    ctx.beginPath(); ctx.moveTo(-headR * 0.95, -headR * 0.4); ctx.lineTo(headR * 0.95, -headR * 0.4); ctx.stroke();
    // glowing lens eyes set in the goggle
    glowOn(ctx, C.accent, A.hit || A.dizzy ? 6 : 10);
    face(ctx, headR * 0.18, headR * -0.1, headR * 1.05, C,
      A, { color: A.hit || A.dizzy ? '#ff9a6b' : C.accent, spread: headR * 0.58 });
    glowOff(ctx);
    // cocky grin (or a grimace when hurt)
    ink(ctx, C.ink, 1.6);
    ctx.beginPath();
    if (A.hit || A.dizzy) ctx.arc(headR * 0.3, headR * 0.64, headR * 0.18, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(headR * 0.26, headR * 0.44, headR * 0.26, Math.PI * 0.1, Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();

    // ── front arm + dagger (foreground) ──────────────────────────────────────
    const shF = [4.5, shY + 2];
    let hF, wA = 0, twirl = 0, hot = false;
    if (A.hang) {
      hF = [13, shY - 26 + Math.sin(t * 3) * 1.5]; wA = -1.3;
    } else if (A.guard) {
      hF = [11, shY + 6]; wA = -1.0;                            // dagger up, guarding
    } else if (A.dizzy) {
      hF = [13 + Math.sin(t * 9) * 3, shY + 16]; wA = 0.8;
    } else if (A.reel) {
      hF = [15, shY - 7]; wA = -0.5;
    } else if (M) {
      hot = M.ph === 'hit';
      const reach = 19;
      if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : 1;
        hF = [lerp(8, 22, k), shY + lerp(6, -12, k)]; wA = -0.8;   // X-pose burst
      } else if (M.id === 'ub') {
        const up = M.ph === 'wind' ? M.wk : 1;
        hF = [lerp(8, 6, up), shY + lerp(2, -17, up)]; wA = -Math.PI / 2 + 0.1;   // skyward zip
      } else {
        hF = [Math.cos(M.swing) * reach, shY + 2 + Math.sin(M.swing) * reach];
        wA = M.swing;
      }
    } else if (A.airborne) {
      hF = [13, shY + 4 - A.rise * 5]; wA = -0.5 + A.fall * 0.5;
    } else if (A.runAmt > 0.05) {
      hF = [10 + Math.sin(A.runPhase * 1.15 + Math.PI) * 9 * A.runAmt, shY + 9];
      wA = 0.45;                                                 // blade trailing low while sprinting
    } else {
      // boxer guard; periodic dagger twirl flourish
      hF = [10 + weightShift * 0.3, shY + 5 + Math.sin(t * 4.8 + 0.6) * 1.3];
      wA = -1.15;
      if (A.fidget > 0.82 && A.fidget < 0.95) twirl = ((A.fidget - 0.82) / 0.13) * TAU;
    }
    const handF = drawArm(ctx, shF[0], shF[1], hF[0], hF[1], -1, C,
      { uw: 6.4, fw: 5.2, elbow: 3.6, fill: C.primary });
    ctx.save();
    ctx.translate(handF[0], handF[1]);
    ctx.rotate(wA);
    dagger(ctx, C, twirl, hot);
    ctx.restore();
    glove(ctx, handF[0], handF[1], 4.4, wA, C, { fill: C.primary, accent: C.accent });

    // ── electric FX ──────────────────────────────────────────────────────────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // Overload Nova — radial overload bolts + a shock ring at his feet
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + t * 2;
          const rr = 22 + M.hk * 26;
          bolt(ctx, Math.cos(a) * 10, shY + Math.sin(a) * 10,
            Math.cos(a) * rr, shY + Math.sin(a) * rr, t * 60 + i, C.accent, 2.2, C.glow);
        }
        ctx.save();
        ctx.globalAlpha *= (1 - M.hk) * 0.8;
        glowOn(ctx, C.glow, 12);
        ink(ctx, C.trail, 2.4);
        ctx.beginPath(); ctx.ellipse(0, -1, 26 * (0.5 + M.hk), 7, 0, 0, TAU); ctx.stroke();
        glowOff(ctx);
        ctx.restore();
      } else if (M.id === 'ub') {
        // Sky Fracture — an upward bolt-lance erupts along the zip
        const k = M.hk;
        ctx.save();
        glowOn(ctx, C.accent, 16);
        bolt(ctx, 6, shY + 4, 6 - lean * 6, shY - 60 - k * 26, Math.floor(t * 40), C.accent, 2.6, C.glow);
        ink(ctx, '#ffffff', 1.4);
        ctx.globalAlpha *= 0.7;
        bolt(ctx, 6, shY + 4, 6 - lean * 6, shY - 56 - k * 26, Math.floor(t * 40) + 3, '#ffffff', 1.4);
        glowOff(ctx);
        ctx.restore();
      } else if (M.id !== 'nb') {
        swingTrail(ctx, 0, shY + 2, 16, 50, M.aim - 1.6 + M.hk * 0.8, M.swing + 0.35, C.trail, 0.75);
        const tipX = hF[0] + Math.cos(wA) * 30, tipY = hF[1] + Math.sin(wA) * 30;
        bolt(ctx, hF[0], hF[1], tipX + 8, tipY, Math.floor(t * 30), '#ffffff', 1.8, C.accent);
      }
    }
    // ambient idle sparks crackling off the hair
    if (idleAmt && Math.sin(t * 9.1) > 0.93) {
      const a = t * 17 % TAU;
      bolt(ctx, Math.cos(a) * 9, headY - 4, Math.cos(a) * 19, headY - 10 + Math.sin(a) * 8, t * 40, C.accent, 1.6);
    }
    // static stacks: the storm builds visibly around him (reads p.stacks)
    const stacks = p.stacks || 0;
    if (stacks > 0) {
      for (let i = 0; i < stacks; i++) {
        const a = t * (3.4 + stacks * 0.5) + (i / 5) * TAU;
        const rr = 26 + Math.sin(t * 7 + i * 2) * 3;
        glowOn(ctx, C.accent, 8);
        disc(ctx, Math.cos(a) * rr, -42 + Math.sin(a) * rr * 0.7, 1.7 + stacks * 0.18, i % 2 ? '#ffffff' : C.accent, null);
        glowOff(ctx);
      }
      if (stacks >= 5 && Math.sin(t * 13) > 0.4) {
        const a = t * 23 % TAU;
        bolt(ctx, Math.cos(a) * 12, -46, Math.cos(a) * 30, -46 + Math.sin(a) * 18, t * 50, '#ffffff', 1.8, C.accent);
      }
    }
    if (p.moveId === 'nb' && (p.charge || 0) > 0) {
      chargeOrb(ctx, hF[0] + Math.cos(wA) * 22, hF[1] + Math.sin(wA) * 22, p.charge, 66, C, t);
    }
    if (A.dizzy) dizzyStars(ctx, 0, headY - headR * 2.4, t);

    ctx.restore();
  },
};
