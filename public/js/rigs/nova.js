// ─────────────────────────────────────────────────────────────────────────────
// NOVA — The Void Sentinel. A dying star given armor: a hooded void helm with a
// glowing star-eye (the whole face is a star), crescent pauldrons, an armored
// bust over a glowing star-core, and — critically — NO legs: the lower body
// trails away into a luminous stardust wisp tail. Three crystal shards orbit her
// constantly (a pass behind the body and a pass over it), and a telekinetic void
// orb sweeps around her on its own, leading every strike. A faint halo ring sits
// behind her head. Built regal and bright-plated above, dissolving below.
// Animation personality: weightless and slow — a floaty heavyweight that DRIFTS
// and hovers; her big cosmic hits land hard but she never stands or stomps.
// One key light (top/front): cel-shadow on the dark flank, rim on the lit edge.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, clamp01, palette, paint, ink, disc, roundRect, poly,
  stroke2, ikSolve, platedSeg, jointCap, gauntlet, glowOn, glowOff,
  chain, chainLocal, ribbon, swingTrail, chargeOrb, dizzyStars, drawStar,
  shade, mixc,
} from './common.js';

// ── arm metrics (local units; "feet" at 0, +x forward, y up = negative) ──────
const ARM_U = 15, ARM_F = 14;            // upper-arm / forearm bone lengths

// The telekinetic void orb — a singularity sphere with an event-horizon ring and
// a white core, leaning toward the key light. `hot` brightens it mid-strike.
function voidOrb(ctx, C, r, t, hot = 0) {
  // outer aura
  glowOn(ctx, C.glow, 16 + hot * 16);
  disc(ctx, 0, 0, r, shade(C.secondary, 0.9), C.ink, 2.2);
  glowOff(ctx);
  // cel-shaded core: dark void rim, bright magenta belly, white pinpoint
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
  disc(ctx, 0, 0, r, '#170f30', null);
  disc(ctx, -r * 0.22, -r * 0.22, r * 0.78, mixc(C.accent, C.secondary, 0.15), null);
  disc(ctx, -r * 0.28, -r * 0.3, r * 0.42, C.glow, null);
  ctx.restore();
  glowOn(ctx, C.glow, 10 + hot * 14);
  disc(ctx, -r * 0.28, -r * 0.3, r * 0.26, '#ffffff', null);
  glowOff(ctx);
  // event-horizon ring sweeping on its own
  ink(ctx, C.accent, 1.8);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.55, r * 0.5, 0.5 + t * 0.9, 0, TAU);
  ctx.stroke();
  ink(ctx, C.glow + 'aa', 1.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.42, r * 0.42, 0.5 + t * 0.9, t * 2, t * 2 + 2.6);
  ctx.stroke();
}

// A crystal shard — a faceted prism with a lit face + a shadow facet + a glow
// spine, so it reads as solid volume rather than a flat diamond.
function shard(ctx, C, sz, a) {
  ctx.save();
  ctx.rotate(a);
  // body
  poly(ctx, [[0, -sz], [sz * 0.58, 0], [0, sz * 1.25], [-sz * 0.58, 0]]);
  paint(ctx, C.primary, C.ink, 2);
  // shadow facet (the unlit half)
  poly(ctx, [[0, -sz], [-sz * 0.58, 0], [0, sz * 1.25]]);
  paint(ctx, shade(C.primary, 0.66), null);
  // glow spine + lit edge
  glowOn(ctx, C.glow, 5);
  poly(ctx, [[0, -sz * 0.5], [sz * 0.28, 0], [0, sz * 0.7], [-sz * 0.28, 0]]);
  paint(ctx, C.glow, null);
  glowOff(ctx);
  ink(ctx, shade(C.primary, 1.5), 1.2);
  ctx.beginPath(); ctx.moveTo(0, -sz * 0.92); ctx.lineTo(sz * 0.5, -sz * 0.05); ctx.stroke();
  ctx.restore();
}

// A crescent pauldron with true dome volume: a bright domed outer plate, a
// cel-shadowed under-curl, an inner lame ridge and a rim sweep, tipped with a
// glowing accent point so the dark mass never closes up. Echoes aegis's pauldron
// but swept into Nova's signature crescent horns.
function crescentPauldron(ctx, px, py, back, C) {
  const fill = back ? C.secondary : C.primary;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(back ? -1 : 1, 1);
  // outer crescent dome
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 11.5, -0.2, Math.PI * 0.82, TAU + Math.PI * 0.2);
  ctx.lineTo(2, 6);
  ctx.closePath();
  paint(ctx, fill, C.ink, 2.6);
  // cel shadow under-curl
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 11.5, -0.2, Math.PI * 0.82, TAU + Math.PI * 0.2);
  ctx.lineTo(2, 6); ctx.closePath(); ctx.clip();
  ctx.beginPath(); ctx.ellipse(1, 6, 14, 10, -0.2, 0, TAU);
  paint(ctx, shade(fill, 0.72), null);
  ctx.restore();
  // inner lame ridge + rim sweep
  ink(ctx, shade(fill, 1.5), 1.6);
  ctx.beginPath(); ctx.arc(-1, -1, 10.5, Math.PI * 1.12, Math.PI * 1.72); ctx.stroke();
  // the crescent horn tip — swept up and out, glowing accent
  glowOn(ctx, C.glow, 6);
  ctx.beginPath();
  ctx.moveTo(-10, -3);
  ctx.quadraticCurveTo(-15, -11, -10.5, -16);
  ctx.quadraticCurveTo(-9, -10, -6, -6.5);
  ctx.closePath();
  paint(ctx, back ? shade(C.accent, 0.7) : C.accent, C.ink, 1.8);
  glowOff(ctx);
  disc(ctx, -6, -2.5, 1.8, C.glow, C.ink, 1.2);
  ctx.restore();
}

// A plated arm: upper plate + elbow couter + forearm plate. Returns the hand pt.
function drawArm(ctx, sx, sy, hx, hy, dir, C, o) {
  const { jx, jy, ex, ey } = ikSolve(sx, sy, hx, hy, ARM_U, ARM_F, dir);
  platedSeg(ctx, sx, sy, jx, jy, o.uw, C, { fill: o.fill, light: -1 });
  platedSeg(ctx, jx, jy, ex, ey, o.fw, C, { fill: o.fill, light: -1 });
  jointCap(ctx, jx, jy, o.elbow, C, { fill: o.fill });
  return [ex, ey];
}

export const novaRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const VOID = '#170f30';                 // the dark void interior tone

    // ── float: she never stands, she hovers and drifts ───────────────────────
    const idle = A.grounded && !M && !A.guard && !A.dizzy && !A.reel &&
                 A.runAmt < 0.05 && A.crouch < 0.2;
    const bob = Math.sin(t * 1.7 + (p.idx ?? 0)) * 3.2;          // slow float bob
    const drift = idle ? Math.sin(t * 0.9 + (p.idx ?? 0) * 1.3) : 0;  // lateral drift
    // she hovers above the floor even when "grounded"
    const hover = (A.grounded ? -11 : -3) + bob + A.crouch * 7 - A.rise * 4 + A.fall * 2;
    const waistY = -30 + hover;
    const shY = -56 + hover + A.breathe * 1.5;
    const headY = -74 + hover + A.breathe * 1.9;
    const headR = 11.5;

    // ── lean / lunge: floaty, drifting, never planted ────────────────────────
    let lean = A.lean * 1.25;
    if (A.grounded) lean = A.runAmt * 0.28 * (p.vx * p.facing >= 0 ? 1 : -0.5);
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 6;                                       // a gentle float-in
      if (M.ph === 'wind') lean -= 0.13 * M.wk;
      else if (M.ph === 'hit') lean += 0.2;
      else lean += 0.2 * (1 - M.rk);
      if (M.id === 'ub') lean = -0.32;
      if (M.id === 'db') lean = M.ph === 'wind' ? -0.06 : 0.04;  // upright, drawing in
    }
    if (A.reel) lean = -0.45;
    if (A.hang) lean = -0.12;

    // ── stardust wisp tail (replaces legs) — verlet chain ────────────────────
    const wxy = (lx, ly) => [p.x + (lx + drift) * p.facing * s, p.y + ly * s];
    const [tx0, ty0] = wxy(0, waistY + 4);
    const tailPts = chainLocal(
      chain(A.st, 'tail', 7, 8 * s, tx0, ty0,
        { damp: 0.93, grav: 54, windX: -p.facing * (18 + Math.abs(p.vx) * 22),
          windY: Math.sin(t * 2.6 + (p.idx ?? 0)) * 26 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge + drift * 0.6, 0);
    ctx.rotate(lean * 0.5);

    // ── halo ring behind everything ──────────────────────────────────────────
    ctx.save();
    ctx.translate(0, headY - 1);
    ctx.rotate(Math.sin(t * 0.7) * 0.12);
    glowOn(ctx, C.glow, 13);
    ink(ctx, C.accent + 'cc', 2.4);
    ctx.beginPath(); ctx.ellipse(0, 0, headR * 2.5, headR * 2.5 * 0.3, -0.18, 0, TAU); ctx.stroke();
    ink(ctx, C.glow + '88', 1.3);
    ctx.beginPath(); ctx.ellipse(0, 0, headR * 2.5 * 0.92, headR * 2.5 * 0.27, -0.18, t * 2, t * 2 + 3.4); ctx.stroke();
    glowOff(ctx);
    ctx.restore();

    // ── orbiting shards: compute positions, draw the BACK pass behind body ───
    const shardPos = [];
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + (i / 3) * TAU;
      const sx = Math.cos(a) * 31, sy = -44 + hover * 0.5 + Math.sin(a) * 13;
      shardPos.push([sx, sy, a, Math.sin(a) < 0]);
    }
    for (const [sx, sy, a, back] of shardPos) {
      if (back) {
        ctx.save(); ctx.globalAlpha *= 0.7; ctx.translate(sx, sy);
        shard(ctx, C, 4.6, a * 0.7); ctx.restore();
      }
    }

    // ── the wisp tail: a fuller, formed stardust ribbon with rim + inner light ─
    const tail = [[0, waistY + 1], [0.4, waistY + 9], ...tailPts.slice(2)];
    // soft outer glow body (wide, translucent — the dust haze)
    ctx.save();
    ctx.globalAlpha *= 0.5;
    glowOn(ctx, C.glow, 16);
    ribbon(ctx, tail, 30, 3, C.glow, null);
    glowOff(ctx);
    ctx.restore();
    // solid tapered core: bright primary with a cel-shadow under-ribbon + rim
    ribbon(ctx, tail, 22, 1.6, C.primary, C.ink, 2.4);
    ctx.save();
    ctx.beginPath();                                            // clip to the core
    const L = [], R = [];
    for (let i = 0; i < tail.length; i++) {
      const [x, y] = tail[i];
      const [px, py] = tail[Math.max(0, i - 1)];
      const [nx, ny] = tail[Math.min(tail.length - 1, i + 1)];
      let tdx = nx - px, tdy = ny - py; const d = Math.hypot(tdx, tdy) || 1e-4;
      tdx /= d; tdy /= d; const w = lerp(22, 1.6, i / (tail.length - 1)) / 2;
      L.push([x - tdy * w, y + tdx * w]); R.push([x + tdy * w, y - tdx * w]);
    }
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath(); ctx.clip();
    // cel-shadow down the trailing (dark) flank
    ribbon(ctx, tail.map(([x, y]) => [x - 4, y + 1]), 14, 1, shade(C.primary, 0.66), null);
    ctx.restore();
    // bright rim sliver on the leading edge
    ctx.save();
    ctx.globalAlpha *= 0.85;
    ink(ctx, shade(C.primary, 1.55), 1.6);
    ctx.beginPath();
    tail.forEach(([x, y], i) => i ? ctx.lineTo(x + 3.5, y - 1) : ctx.moveTo(x + 3.5, y - 1));
    ctx.stroke();
    ctx.restore();
    // twinkling inner stars drifting down the dust
    for (let i = 1; i < tail.length - 1; i++) {
      const [px2, py2] = tail[i];
      const tw = 0.5 + 0.5 * Math.sin(t * 3.2 + i * 2.0);
      ctx.save();
      ctx.globalAlpha *= 0.4 + tw * 0.6;
      glowOn(ctx, C.glow, 5);
      drawStar(ctx, px2 + Math.sin(t * 1.8 + i) * 2, py2, Math.max(0.9, 2.6 - i * 0.34),
        i % 2 ? C.accent : '#ffffff');
      glowOff(ctx);
      ctx.restore();
    }

    // ── BACK arm (far, mid tone) — computed early, drawn before the torso ─────
    const shB = [-8, shY + 3];
    let hB = [-15, shY + 15 + Math.sin(t * 1.7) * 1.6];
    if (A.hang) hB = [-3, shY + 13];
    else if (A.guard) hB = [-12, shY + 9];
    else if (A.dizzy) hB = [-16, shY + 13];
    else if (A.reel) hB = [-17, shY - 5];
    else if (M && M.ph !== 'wind') hB = [-16, shY + 7];
    else if (A.airborne) hB = [-14, shY + 9];
    else if (A.runAmt > 0.05) hB = [-13 - Math.sin(A.runPhase) * 5 * A.runAmt, shY + 12];
    drawArm(ctx, shB[0], shB[1], hB[0], hB[1], 1, C,
      { uw: 9, fw: 7.6, elbow: 4.8, fill: C.secondary });
    gauntlet(ctx, hB[0], hB[1], 4.6, Math.atan2(hB[1] - shB[1], hB[0] - shB[0]) + 0.5, C,
      { fill: C.secD });

    // ── back crescent pauldron (peeks behind the bust) ───────────────────────
    crescentPauldron(ctx, -15, shY - 3, true, C);

    // ── torso: armored bust (gorget / breastplate / cel / rim / star-core) ───
    // gorget collar tucked under the hood
    roundRect(ctx, -9, shY - 9, 18, 9, 4); paint(ctx, C.secD, C.ink, 2.2);
    // breastplate — the dominant bright read
    poly(ctx, [[-16, shY - 1], [16, shY - 1], [10, waistY + 2], [-10, waistY + 2]]);
    paint(ctx, C.primary, C.ink, 2.8);
    // cel shadow on the lower/dark flank
    poly(ctx, [[-13.5, shY + 11], [13.5, shY + 11], [10, waistY + 2], [-10, waistY + 2]]);
    paint(ctx, C.priD, null);
    // sternum ridge + pectoral rim sweeps (rim-lit)
    ink(ctx, shade(C.primary, 1.4), 1.7);
    ctx.beginPath(); ctx.moveTo(0, shY + 2); ctx.lineTo(0, waistY + 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, shY + 1); ctx.quadraticCurveTo(-7, shY - 2, -2, shY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, shY + 1); ctx.quadraticCurveTo(7, shY - 2, 2, shY + 5); ctx.stroke();
    // accent seam down the front breaks the plate mass
    ink(ctx, C.accent, 1.3);
    ctx.beginPath(); ctx.moveTo(-7, shY + 13); ctx.lineTo(7, shY + 13); ctx.stroke();
    // the glowing STAR-CORE set into the chest
    glowOn(ctx, C.accent, M ? 18 : 12);
    drawStar(ctx, 0, shY + 7, 4.6 + Math.sin(t * 2.6) * 0.6, C.accent);
    disc(ctx, 0, shY + 7, 1.8, '#ffffff', null);
    glowOff(ctx);

    // ── front crescent pauldron (over the shoulder) ──────────────────────────
    crescentPauldron(ctx, 15, shY - 3, false, C);

    // ── head: hooded void helm with star-eye face ────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    // hood cowl (dark secondary) framing the helm — a pointed peak, drawn down
    // into two short shoulder-points, broken with an accent trim so it isn't a blob
    ctx.beginPath();
    ctx.moveTo(-headR * 1.05, headR * 0.85);
    ctx.quadraticCurveTo(-headR * 1.22, -headR * 0.6, -headR * 0.25, -headR * 1.28);
    ctx.quadraticCurveTo(0, -headR * 1.42, headR * 0.25, -headR * 1.28);
    ctx.quadraticCurveTo(headR * 1.22, -headR * 0.6, headR * 1.05, headR * 0.85);
    ctx.quadraticCurveTo(0, headR * 0.25, -headR * 1.05, headR * 0.85);
    ctx.closePath();
    paint(ctx, C.secondary, C.ink, 2.6);
    // rim light on the lit edge of the cowl + a faint accent inner seam
    ink(ctx, shade(C.secondary, 1.7), 1.4);
    ctx.beginPath();
    ctx.moveTo(headR * 0.25, -headR * 1.24);
    ctx.quadraticCurveTo(headR * 1.1, -headR * 0.55, headR * 0.98, headR * 0.7);
    ctx.stroke();
    ink(ctx, C.accent + 'aa', 1.2);
    ctx.beginPath();
    ctx.moveTo(-headR * 0.18, -headR * 1.18);
    ctx.quadraticCurveTo(-headR * 0.95, -headR * 0.4, -headR * 0.82, headR * 0.55);
    ctx.stroke();
    // bright rim-lit helm dome with a darker cel back-curve
    ctx.beginPath();
    ctx.arc(0, -headR * 0.05, headR * 1.04, Math.PI * 0.9, TAU + Math.PI * 0.1);
    paint(ctx, C.primary, C.ink, 2.4);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, -headR * 0.05, headR * 1.04, Math.PI * 0.9, TAU + Math.PI * 0.1); ctx.clip();
    ctx.beginPath(); ctx.arc(-headR * 0.45, headR * 0.1, headR * 1.0, 0, TAU);
    paint(ctx, C.priD, null);
    ctx.restore();
    ink(ctx, shade(C.primary, 1.45), 1.6);
    ctx.beginPath(); ctx.arc(0, -headR * 0.05, headR * 0.88, Math.PI * 1.12, Math.PI * 1.82); ctx.stroke();
    // crown crescent (glowing accent horn over the brow)
    glowOn(ctx, C.glow, 8);
    stroke2(ctx, c => { c.arc(0, -headR * 0.95, headR * 0.52, Math.PI * 1.06, Math.PI * 1.94); },
      2.8, C.accent, C.ink, 2.4);
    glowOff(ctx);
    // the dark star-eye face recess, broken with a faint accent rim so it isn't a blob
    ctx.beginPath(); ctx.arc(headR * 0.1, headR * 0.12, headR * 0.74, 0, TAU);
    paint(ctx, VOID, null);
    ink(ctx, mixc(C.accent, VOID, 0.5), 1.2);
    ctx.beginPath(); ctx.arc(headR * 0.1, headR * 0.12, headR * 0.74, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    // star-eye — the entire face is a star
    const eyeFlare = M ? 1.25 : (A.hit || A.dizzy) ? 0.65 : 1;
    const eyeCol = A.hit ? '#ff8a6b' : '#ffffff';
    glowOn(ctx, A.hit ? '#ff8a6b' : C.accent, 14);
    if (A.blink && !M && !A.hit && !A.dizzy) {
      stroke2(ctx, c => { c.moveTo(headR * -0.18, headR * 0.1); c.lineTo(headR * 0.4, headR * 0.1); },
        2.2, C.accent, null, 0);
    } else if (A.dizzy) {
      ink(ctx, C.accent, 2.2);
      ctx.beginPath(); ctx.arc(headR * 0.1, headR * 0.1, headR * 0.32, t * 7, t * 7 + 4.8); ctx.stroke();
    } else {
      drawStar(ctx, headR * 0.1, headR * 0.1, headR * 0.4 * eyeFlare, eyeCol);
      disc(ctx, headR * 0.1, headR * 0.1, headR * 0.13, A.hit ? '#ff8a6b' : C.accent, null);
    }
    glowOff(ctx);
    ctx.restore();

    // ── FRONT arm: gestures; the orb obeys her hand ──────────────────────────
    const shF = [8, shY + 3];
    let hF, orbX, orbY, orbR = 8, orbHot = 0;
    const orbIdleA = t * 1.1;
    if (A.hang) {
      hF = [14, shY - 25 + Math.sin(t * 2.2) * 1.5];
      orbX = -11; orbY = shY - 6;
    } else if (A.guard) {
      hF = [12, shY + 8];
      orbX = 19; orbY = shY + 2; orbHot = 0.5;
    } else if (A.dizzy) {
      hF = [14 + Math.sin(t * 8.2) * 3, shY + 14];
      orbX = Math.cos(t * 5) * 16; orbY = headY - 14 + Math.sin(t * 5) * 4;
    } else if (A.reel) {
      hF = [16, shY - 6];
      orbX = -14; orbY = shY - 10;
    } else if (M) {
      orbHot = M.ph === 'hit' ? 1 : 0.5;
      if (M.id === 'db') {
        // Black Halo: orb held high, the singularity drawing everything in
        const k = M.ph === 'hit' ? M.hk : 0;
        hF = [7, shY - 13];
        orbX = 0; orbY = shY - 28; orbR = 10 + k * 5;
      } else if (M.id === 'ub') {
        // Supernova Climb: orb drops below as a booster
        hF = [5, shY - 15];
        orbX = 0; orbY = waistY + 18; orbR = 9; orbHot = 1;
      } else {
        // the orb leads the strike arc; the hand points along it
        const reach = M.ph === 'wind' ? 18 : 36;
        orbX = Math.cos(M.swing) * reach;
        orbY = shY + 4 + Math.sin(M.swing) * reach * 0.9;
        hF = [Math.cos(M.swing) * 15, shY + 3 + Math.sin(M.swing) * 15];
      }
    } else if (A.airborne) {
      hF = [13, shY + 7 - A.rise * 4];
      orbX = Math.cos(orbIdleA) * 24; orbY = shY + 6 + Math.sin(orbIdleA) * 9;
    } else {
      // idle: palm up, the orb lazily circling above it
      hF = [13, shY + 12];
      orbX = 13 + Math.cos(orbIdleA) * 7;
      orbY = shY - 2 + Math.sin(orbIdleA * 2) * 3;
    }
    const handF = drawArm(ctx, shF[0], shF[1], hF[0], hF[1], -1, C,
      { uw: 9.4, fw: 8, elbow: 5, fill: C.primary });
    const wA = Math.atan2(orbY - handF[1], orbX - handF[0]);
    gauntlet(ctx, handF[0], handF[1], 5.2, wA, C, { fill: C.primary, accent: C.accent });

    // the telekinetic void orb (drawn over the hand, leading the gesture)
    ctx.save();
    ctx.translate(orbX, orbY);
    voidOrb(ctx, C, orbR, t, orbHot);
    ctx.restore();

    // ── orbiting shards: FRONT pass (over the body) ──────────────────────────
    for (const [sx, sy, a, back] of shardPos) {
      if (!back) { ctx.save(); ctx.translate(sx, sy); shard(ctx, C, 5.2, a * 0.7); ctx.restore(); }
    }

    // ── void FX (signature beat per special) ─────────────────────────────────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // collapsing rings → implosion at the singularity
        const k = M.hk;
        glowOn(ctx, C.glow, 17);
        ink(ctx, C.accent, 2.6);
        for (let i = 0; i < 3; i++) {
          const rr = lerp(72, 12, clamp01(k * 1.3 - i * 0.12));
          ctx.globalAlpha = 0.85 - i * 0.22;
          ctx.beginPath();
          ctx.ellipse(0, shY - 28, rr, rr * 0.62, t * 0.8 + i, 0, TAU);
          ctx.stroke();
        }
        // inward streaks of light being swallowed
        ink(ctx, C.glow + 'cc', 1.6);
        for (let i = 0; i < 6; i++) {
          const a = i * (TAU / 6) + t * 0.6, r0 = lerp(60, 18, k);
          ctx.globalAlpha = 0.5 * (1 - k * 0.4);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, shY - 28 + Math.sin(a) * r0 * 0.62);
          ctx.lineTo(Math.cos(a) * 14, shY - 28 + Math.sin(a) * 9);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glowOff(ctx);
      } else if (M.id === 'ub') {
        // booster star trail streaming below
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.globalAlpha *= 0.7 - i * 0.15;
          glowOn(ctx, C.glow, 7);
          drawStar(ctx, Math.sin(t * 9 + i * 2) * 6, waistY + 26 + i * 13, 4 - i * 0.7,
            i % 2 ? C.accent : '#ffffff');
          glowOff(ctx);
          ctx.restore();
        }
      } else if (M.id !== 'nb') {
        // a drifting cosmic arc trailing the orb's sweep
        swingTrail(ctx, 0, shY + 4, 18, 54, M.aim - 1.8 + M.hk * 0.7, M.swing + 0.3, C.accent, 0.6);
        ctx.save();
        ctx.globalAlpha *= 0.8;
        glowOn(ctx, C.accent, 12);
        ink(ctx, C.accent, 1.8);
        ctx.beginPath(); ctx.arc(orbX, orbY, orbR * 1.9, t * 14, t * 14 + 2.2); ctx.stroke();
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
