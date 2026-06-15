// ─────────────────────────────────────────────────────────────────────────────
// EMBER — The Cinder Witch. A big bent witch hat with a sprung, ember-tipped peak
// (it rides a verlet spring), long layered hair with a lit strand, a voluminous
// flame-trimmed bell dress over an underskirt, puffed sleeves, slender gloved
// hands, and a wrapped pyre staff whose floating flame orb pulses like a heart —
// and never quite touches the haft. Built as CLOTH, not plate: volume comes from
// layered fabric panels + one consistent key light (form-shadow on the dark flank,
// a warm rim on the lit edge), never armor. Animation personality: smouldering —
// she GLIDES on a heat-haze rather than runs, ambient embers rise off her, and she
// commits softly and floats out of every cast (a featherweight caster, no hit-stop).
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, palette, paint, ink, disc, roundRect, poly,
  stroke2, ikSolve, glowOn, glowOff, chain, chainLocal, ribbon,
  swingTrail, flame, chargeOrb, dizzyStars, face, shade,
} from './common.js';

// ── limb metrics (local units; feet at 0, +x forward, y up = negative) ───────
const LEG_T = 15, LEG_S = 15;            // thigh / shin bone lengths (slim, hidden)
const ARM_U = 13, ARM_F = 12;            // upper-arm / forearm bone lengths

// ── local cloth/caster helpers (Ember is fabric, so no platedSeg armor) ──────

// A soft fabric limb: a tapered dark under-sleeve, a brighter lit fabric face on
// the +x flank, and a thin rim on the lit edge. Reads as cloth, never plate.
// returns the end point so a hand can sit on it.
function clothArm(ctx, sx, sy, hx, hy, dir, C, o) {
  const { jx, jy, ex, ey } = ikSolve(sx, sy, hx, hy, ARM_U, ARM_F, dir);
  const fill = o.fill, w = o.w;
  // 1) full ink-backed under-sleeve (structural)
  stroke2(ctx, c => { c.moveTo(sx, sy); c.lineTo(jx, jy); c.lineTo(ex, ey); },
    w, shade(fill, 0.72), C.ink);
  // 2) lit fabric face nudged toward the light (+x), tapering to the cuff
  const litShift = 0.22 * w;
  stroke2(ctx, c => {
    c.moveTo(sx + litShift, sy - litShift * 0.3);
    c.lineTo(jx + litShift, jy - litShift * 0.3);
    c.lineTo(lerp(jx, ex, 0.85) + litShift * 0.6, lerp(jy, ey, 0.85));
  }, w * 0.62, fill, null);
  // 3) rim sliver on the lit edge
  ink(ctx, shade(fill, 1.4), Math.max(1, w * 0.16));
  ctx.beginPath();
  ctx.moveTo(sx + litShift * 1.3, sy - litShift * 0.7);
  ctx.lineTo(jx + litShift * 1.3, jy - litShift * 0.7);
  ctx.stroke();
  return [ex, ey];
}

// A puffed sleeve cap at the shoulder — a gathered fabric dome with a cel shadow
// underside and a lit crown, so the shoulders carry real volume.
function puffSleeve(ctx, x, y, r, C, fill) {
  disc(ctx, x, y, r, fill, C.ink, 2.2);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.arc(x - r * 0.32, y + r * 0.5, r * 0.95, 0, TAU);
  paint(ctx, shade(fill, 0.74), null);
  ctx.restore();
  ink(ctx, shade(fill, 1.4), 1.3);
  ctx.beginPath(); ctx.arc(x, y, r * 0.7, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();
  // little gather pleats
  ink(ctx, shade(fill, 0.6), 1);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.4, y + r * 0.2);
    ctx.lineTo(x + i * r * 0.5, y + r * 0.85);
    ctx.stroke();
  }
}

// A slender gloved caster hand gripping along `ang`: a cuff, a delicate hand mass
// with a shaded underside + rim. Kept small and graceful — a witch, not a bruiser.
function casterHand(ctx, x, y, r, ang, C, o = {}) {
  const fill = o.fill ?? C.primary;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  // flared little cuff behind the hand
  poly(ctx, [[-r * 1.25, -r * 0.95], [-r * 0.4, -r * 0.78], [-r * 0.4, r * 0.78], [-r * 1.25, r * 0.95]]);
  paint(ctx, shade(fill, 0.8), C.ink, 1.9);
  // slim hand mass
  roundRect(ctx, -r * 0.4, -r * 0.78, r * 1.35, r * 1.56, r * 0.5);
  paint(ctx, fill, C.ink, 2);
  ctx.save();
  roundRect(ctx, -r * 0.4, -r * 0.78, r * 1.35, r * 1.56, r * 0.5); ctx.clip();
  roundRect(ctx, -r * 0.4, r * 0.1, r * 1.35, r * 0.9, r * 0.3);
  paint(ctx, shade(fill, 0.74), null);
  ctx.restore();
  ink(ctx, shade(fill, 1.42), 1.2);
  ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.7); ctx.lineTo(r * 0.85, -r * 0.7); ctx.stroke();
  if (o.accent) disc(ctx, r * 0.2, -r * 0.02, r * 0.26, o.accent, C.ink, 1.2);
  ctx.restore();
}

// A pointed cloth slipper peeking under the dress hem.
function slipper(ctx, x, y, C, fill) {
  ctx.save();
  ctx.translate(x, y);
  poly(ctx, [[-4, -4], [4, -4], [9, 0], [9, 3], [-5, 3], [-5.5, -2]]);
  paint(ctx, fill, C.ink, 2);
  ink(ctx, shade(fill, 1.4), 1.1);
  ctx.beginPath(); ctx.moveTo(-3, -3.2); ctx.lineTo(6, -3.2); ctx.stroke();
  ctx.restore();
}

// The pyre staff — a wrapped, banded haft with heft and a curled head, drawn along
// +x from the grip hand. The floating flame orb is a living layered core (outer
// haze, body, hot core, white heart) that pulses and bobs, never touching the haft.
function staff(ctx, C, t, orbK, hot) {
  ctx.save();
  // 1) dark structural haft
  stroke2(ctx, c => { c.moveTo(-16, 0); c.lineTo(42, 0); }, 5.2, '#3a2118', C.ink);
  // 2) lit wood face on top
  stroke2(ctx, c => { c.moveTo(-14, -0.9); c.lineTo(40, -0.9); }, 2.4, '#7a4a32', null, 0);
  ink(ctx, '#9a6a48', 1.1);
  ctx.beginPath(); ctx.moveTo(-12, -1.7); ctx.lineTo(36, -1.7); ctx.stroke();
  // 3) wrapped grip near the hand
  ink(ctx, '#2a1610', 1.4);
  for (let i = 0; i < 4; i++) {
    const gx = -14 + i * 4.2;
    ctx.beginPath(); ctx.moveTo(gx, -3); ctx.lineTo(gx + 2.4, 3); ctx.stroke();
  }
  // 4) forged bands down the haft
  ink(ctx, C.accD, 1.8);
  for (const bx of [6, 20, 32]) { ctx.beginPath(); ctx.moveTo(bx, -3); ctx.lineTo(bx, 3); ctx.stroke(); }
  // 5) curled iron head cradling the orb
  stroke2(ctx, c => { c.arc(45, -2, 6.2, Math.PI * 0.55, TAU * 0.95); }, 3.6, '#3a2118', C.ink, 3);
  stroke2(ctx, c => { c.arc(45, -2, 6.2, Math.PI * 0.7, TAU * 0.88); }, 1.6, '#7a4a32', null, 0);
  // 6) floating flame orb — layered living core, bobbing above the cradle
  const bob = Math.sin(t * 3.1) * 1.8;
  const pulse = 1 + Math.sin(t * 5.3) * 0.12;
  const ox = 55, oy = -6 + bob, R = 6.4 * pulse * orbK;
  glowOn(ctx, C.glow, (hot ? 26 : 16) * orbK);
  disc(ctx, ox, oy, R * 1.35, C.glow + '55', null);     // outer haze
  disc(ctx, ox, oy, R, C.accent, null);                  // orb body
  glowOff(ctx);
  disc(ctx, ox, oy - R * 0.18, R * 0.62, C.glow, null);  // hot inner
  disc(ctx, ox - R * 0.18, oy - R * 0.28, R * 0.32, '#fff0d8', null); // white heart
  // a couple of licks rising off the orb
  ctx.globalAlpha *= 0.85;
  flame(ctx, ox + Math.sin(t * 4) * 1.5, oy - R * 1.4, 2.6 * orbK, C.accent, '#fff0d8', t, 4);
  ctx.restore();
}

export const emberRig = {
  draw(ctx, p, char, A, t) {
    const C = palette(char.colors);
    const s = char.scale;
    const M = A.move;
    const SKIN = '#f6d3ab';
    const HAIR = '#a83a5a';
    const HAIRL = '#d65b78';        // lit hair strand
    const CLOTH = '#5e2a48';        // rich plum for hat + dress
    const CLOTHL = shade(CLOTH, 1.42);  // lit fabric
    const CLOTHD = shade(CLOTH, 0.7);   // cel-shadow fabric

    // ── metrics + smouldering glide ──────────────────────────────────────
    const idle = A.grounded && !M && !A.guard && !A.dizzy && !A.reel &&
                 A.runAmt < 0.05 && A.crouch < 0.2;
    // she never quite rests on the floor — a slow heat-haze hover + drift
    const hover = (!A.airborne) ? Math.sin(t * 2.0 + (p.idx ?? 0)) * 1.6 : 0;
    const sway = idle ? Math.sin(t * 1.5 + (p.idx ?? 0)) : 0;     // graceful contrapposto
    const crouchDrop = A.crouch * 12;
    const breathY = A.breathe * 1.2;
    const hipX = sway * 1.8;
    const waistY = -35 + crouchDrop + hover;
    const shY = -56 + crouchDrop * 1.1 + hover + breathY;
    const headY = -71 + crouchDrop * 1.15 + hover + breathY * 1.25;
    const headR = 10.5;

    let lean = A.lean - sway * 0.04;
    let lunge = 0;
    if (M) {
      lunge = M.lunge * 5;
      if (M.ph === 'wind') lean -= 0.13 * M.wk;
      else if (M.ph === 'hit') lean += 0.2;
      else lean += 0.2 * (1 - M.rk);
      if (M.id === 'ub') lean = M.ph === 'wind' ? 0.12 : -0.24;     // coil, then rise
      if (M.id === 'db') lean = M.ph === 'wind' ? -0.08 : 0.06;
      if (M.id === 'sb') { lean = -0.3; lunge = -M.lunge * 6; }     // retreating flare step
    }
    if (A.reel) lean = -0.5;
    if (A.hang) lean = -0.1;

    // ── cloth chains (world space → verlet → local) ──────────────────────
    const wxy = (lx, ly) => [p.x + (lx + hipX) * p.facing * s, p.y + ly * s];
    // back hair layer (long, heavy)
    const [hax, hay] = wxy(-8, headY - 2);
    const hairPts = chainLocal(
      chain(A.st, 'hair', 6, 8.5 * s, hax, hay, { damp: 0.89, grav: 150, windX: -p.facing * 44 }),
      p, s,
    );
    // front hair lock (lighter, faster)
    const [h2x, h2y] = wxy(6, headY + 1);
    const hair2Pts = chainLocal(
      chain(A.st, 'hair2', 4, 6.5 * s, h2x, h2y, { damp: 0.86, grav: 165, windX: -p.facing * 30 }),
      p, s,
    );
    // sprung hat tip
    const [tax, tay] = wxy(-1, headY - headR * 2.05);
    const hatTip = chainLocal(
      chain(A.st, 'hattip', 3, 8.5 * s, tax, tay, { damp: 0.84, grav: -140, windX: -p.facing * 110 }),
      p, s,
    );

    ctx.save();
    ctx.translate(lunge + hipX, 0);
    ctx.rotate(lean * 0.5);

    // ── rising ambient embers (behind, drifting up off her) ──────────────
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const cyc = ((t * 0.5 + i * 0.27) % 1);
      const ex = Math.sin(t * 1.2 + i * 2.4) * (10 + i * 4) - 4;
      const ey = -8 - cyc * 78;
      ctx.globalAlpha = (1 - cyc) * 0.7;
      glowOn(ctx, C.accent, 6);
      disc(ctx, ex, ey, 1.5 + (1 - cyc) * 1.1, i % 2 ? C.accent : C.glow, null);
      glowOff(ctx);
    }
    ctx.restore();

    // ── back hair (furthest back), with a lit strand ─────────────────────
    ribbon(ctx, hairPts, 11, 3, HAIR, C.ink, 2.2);
    ctx.save();
    ctx.globalAlpha *= 0.8;
    ribbon(ctx, hairPts.map(([x, y]) => [x + 2, y - 1]), 4.5, 1.6, HAIRL, null);
    ctx.restore();

    // ── foot targets (stance / glide / air) ──────────────────────────────
    let f1 = [5 + sway * 0.6, 0], f2 = [-5 + sway * 0.4, 0];
    let bend1 = 1, bend2 = -1;
    if (A.hang) {
      f1 = [2, -4]; f2 = [-4, -1];
    } else if (A.airborne) {
      if (M && M.id === 'dair') { f1 = [4, 6]; f2 = [-6, -8]; }      // comet heel down
      else { f1 = [7, -8 - A.rise * 4]; f2 = [-7, -2 + A.fall * 2]; }
    } else if (A.runAmt > 0.05) {
      // a glide, not a sprint — short, soft strides
      const ph = A.runPhase, k = A.runAmt;
      f1 = [Math.sin(ph) * 12 * k, -Math.max(0, Math.cos(ph)) * 5 * k];
      f2 = [Math.sin(ph + Math.PI) * 12 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 5 * k];
    } else if (idle) {
      f1 = [5 + sway * 0.6 - sway, 0]; f2 = [-5 + sway * 0.4 - sway * 1.4, 0];
    }

    // back leg (far, darker) — under the dress
    const lhx = hipX;
    drawClothLeg(ctx, lhx - 3, waistY + 6, f2, bend2, C, C.secD);
    // front leg (near, brighter)
    drawClothLeg(ctx, lhx + 3, waistY + 6, f1, bend1, C, C.secondary);
    if (M && M.id === 'dair' && M.ph === 'hit') {
      // comet-heel flame trailing the plunging foot
      flame(ctx, f1[0] + 2, f1[1] + 7, 7, C.accent, '#fff0d8', t, 3);
      flame(ctx, f1[0] - 3, f1[1] + 11, 4, C.glow, '#fff0d8', t, 5);
    }

    // ── bell dress: underskirt + lit front panel + cel-shadow flank + trim ─
    const dsway = Math.max(-6, Math.min(6, -p.vx * p.facing * 0.7)) + Math.sin(t * 1.9) * 1.3 + sway * 0.6;
    const flare = M && M.id === 'db' && M.ph !== 'wind'
      ? 1 + (M.ph === 'hit' ? M.hk : 1 - M.rk) * 0.35
      : (M && M.id === 'ub' ? 1.12 : 1);
    const hemY = -2 + crouchDrop * 0.4;
    const hw = 18 * flare;

    // 1) darker underskirt peeking lower & behind for layered depth
    ctx.beginPath();
    ctx.moveTo(-7, waistY + 2);
    ctx.quadraticCurveTo(-13, waistY + 16, -hw * 0.95 + dsway * 0.4, hemY + 4);
    ctx.quadraticCurveTo(0, hemY + 9, hw * 0.95 + dsway * 0.4, hemY + 4);
    ctx.quadraticCurveTo(13, waistY + 16, 7, waistY + 2);
    ctx.closePath();
    paint(ctx, shade(CLOTH, 0.5), C.ink, 2.2);

    // 2) main bell — bright plum, scalloped hem
    ctx.beginPath();
    ctx.moveTo(-9, waistY - 2);
    ctx.quadraticCurveTo(-14, waistY + 12, -hw + dsway * 0.4, hemY);
    ctx.quadraticCurveTo(-hw * 0.55 + dsway * 0.7, hemY + 4.5, -hw * 0.3 + dsway * 0.8, hemY + 0.5);
    ctx.quadraticCurveTo(dsway * 0.9, hemY + 5.5, hw * 0.36 + dsway * 0.8, hemY + 0.8);
    ctx.quadraticCurveTo(hw * 0.62 + dsway * 0.7, hemY + 4.5, hw + dsway * 0.4, hemY);
    ctx.quadraticCurveTo(14, waistY + 12, 9, waistY - 2);
    ctx.closePath();
    paint(ctx, CLOTH, C.ink, 2.6);

    // 3) lit front panel (dominant read on the +x flank)
    ctx.beginPath();
    ctx.moveTo(0, waistY - 1);
    ctx.quadraticCurveTo(7, waistY + 12, hw * 0.86 + dsway * 0.5, hemY + 0.2);
    ctx.quadraticCurveTo(hw * 0.5 + dsway * 0.7, hemY + 4.5, hw * 0.18 + dsway * 0.8, hemY + 1);
    ctx.quadraticCurveTo(3, waistY + 14, 0, waistY - 1);
    ctx.closePath();
    paint(ctx, CLOTHL, null);

    // 4) cel-shadow on the dark (back) flank
    ctx.beginPath();
    ctx.moveTo(-2, waistY);
    ctx.quadraticCurveTo(-11, waistY + 14, -hw * 0.7 + dsway * 0.45, hemY + 0.5);
    ctx.quadraticCurveTo(-hw * 0.4 + dsway * 0.7, hemY + 4, -hw * 0.12 + dsway * 0.8, hemY + 1.2);
    ctx.quadraticCurveTo(-4, waistY + 15, -2, waistY);
    ctx.closePath();
    paint(ctx, CLOTHD, null);

    // 5) believable vertical folds breaking up the mass
    ink(ctx, shade(CLOTH, 0.52), 1.3);
    for (const fx of [-0.62, -0.28, 0.28, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(fx * 9, waistY + 4);
      ctx.quadraticCurveTo(fx * hw * 0.7 + dsway * 0.5, waistY + 16, fx * hw * 0.92 + dsway * 0.8, hemY);
      ctx.stroke();
    }

    // 6) glowing flame-trim hem — the signature accent that breaks the dark
    glowOn(ctx, C.glow, 7);
    ink(ctx, C.accent, 2.6);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.86 + dsway * 0.5, hemY + 0.3);
    ctx.quadraticCurveTo(-hw * 0.55 + dsway * 0.7, hemY + 4, -hw * 0.3 + dsway * 0.8, hemY);
    ctx.quadraticCurveTo(-hw * 0.06 + dsway * 0.85, hemY + 4.6, hw * 0.18 + dsway * 0.85, hemY + 0.3);
    ctx.quadraticCurveTo(hw * 0.42 + dsway * 0.8, hemY + 4.6, hw * 0.62 + dsway * 0.7, hemY);
    ctx.quadraticCurveTo(hw * 0.78 + dsway * 0.6, hemY + 4, hw * 0.86 + dsway * 0.5, hemY + 0.3);
    ctx.stroke();
    // little flame tongues licking off the hem
    ink(ctx, C.glow, 1.6);
    for (const fx of [-0.62, -0.2, 0.24, 0.64]) {
      const px = fx * hw + dsway * 0.7;
      ctx.beginPath();
      ctx.moveTo(px, hemY + 2);
      ctx.quadraticCurveTo(px + 1.5, hemY - 2.5, px - 0.5, hemY - 4.5);
      ctx.stroke();
    }
    glowOff(ctx);

    // ── bodice: layered cloth, form-shadow, accent seam, collar brooch ───
    poly(ctx, [[-8, shY - 1], [8, shY - 1], [9, waistY + 1], [-9, waistY + 1]]);
    paint(ctx, C.primary, C.ink, 2.6);
    // cel shadow on the back flank of the bodice
    poly(ctx, [[-8, shY + 1], [-1, shY + 1], [-1, waistY + 1], [-9, waistY + 1]]);
    paint(ctx, C.priD, null);
    // lit sternum sheen
    ink(ctx, C.priL, 1.6);
    ctx.beginPath(); ctx.moveTo(3, shY + 1); ctx.lineTo(3.5, waistY); ctx.stroke();
    // laced corset seam (accent break) + cinch
    ink(ctx, C.accent, 1.5);
    for (let i = 0; i < 3; i++) {
      const ly = lerp(shY + 4, waistY - 2, i / 2);
      ctx.beginPath(); ctx.moveTo(-3.5, ly); ctx.lineTo(3.5, ly + 1.4); ctx.stroke();
    }
    roundRect(ctx, -8.5, waistY - 3, 17.5, 4.5, 2); paint(ctx, C.accD, C.ink, 1.6);
    // collar brooch (glowing ember clasp)
    glowOn(ctx, C.glow, 8);
    disc(ctx, 0.5, shY + 3, 2.9, C.accent, C.ink, 1.8);
    disc(ctx, 0.5, shY + 3, 1.3, '#fff0d8', null);
    glowOff(ctx);

    // ── back arm (puffed sleeve, behind the torso) ───────────────────────
    const shB = [-5.5, shY + 2];
    let hB = [-11, shY + 14], wB = 1.2;
    if (A.hang) { hB = [4, headY - headR * 1.1]; wB = -1.4; }         // grips her hat brim
    else if (A.guard) { hB = [9, shY + 9]; wB = -0.6; }
    else if (A.dizzy) { hB = [-14, shY + 14]; wB = 1.4; }
    else if (A.reel) { hB = [-15, shY - 6]; wB = 0.6; }
    else if (A.airborne) { hB = [-12, shY + 4]; wB = 1.0; }
    else if (A.runAmt > 0.05) { hB = [-11 - Math.sin(A.runPhase) * 5 * A.runAmt, shY + 12]; wB = 1.0; }
    else if (M && M.id === 'db') { hB = [-16, shY + 2 - (M.ph === 'hit' ? M.hk : 1) * 8]; wB = 0.4; }
    else if (M && M.id === 'ub') { hB = [-12, shY - 2]; wB = 0.2; }
    else if (M) { hB = [-12, shY + 8]; wB = 0.9; }
    puffSleeve(ctx, shB[0] - 1, shB[1] + 1, 5, C, C.secondary);
    const handB = clothArm(ctx, shB[0], shB[1], hB[0], hB[1], 1, C, { fill: C.secD, w: 5 });
    casterHand(ctx, handB[0], handB[1], 3.4, wB + Math.PI, C, { fill: C.secD });

    // ── front hair lock (over the shoulder, lit) ─────────────────────────
    ribbon(ctx, hair2Pts, 6, 1.6, HAIRL, C.ink, 1.8);

    // ── head + witch hat ─────────────────────────────────────────────────
    ctx.save();
    ctx.translate(lean * 5, headY);
    // face base with a cel shadow on the dark flank
    disc(ctx, 0, 0, headR, SKIN, C.ink, 2.6);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, headR, 0, TAU); ctx.clip();
    ctx.beginPath(); ctx.arc(-headR * 0.5, headR * 0.32, headR * 0.95, 0, TAU);
    paint(ctx, shade(SKIN, 0.88), null);
    ctx.restore();
    // fringe sweeping across the brow
    ctx.beginPath();
    ctx.moveTo(-headR * 1.02, -headR * 0.05);
    ctx.quadraticCurveTo(-headR * 0.85, -headR * 1.1, headR * 0.2, -headR * 0.98);
    ctx.quadraticCurveTo(headR * 1.12, -headR * 0.8, headR * 1.0, -headR * 0.05);
    ctx.quadraticCurveTo(headR * 0.6, -headR * 0.5, headR * 0.05, -headR * 0.42);
    ctx.quadraticCurveTo(-headR * 0.55, -headR * 0.3, -headR * 1.02, -headR * 0.05);
    ctx.closePath();
    paint(ctx, HAIR, C.ink, 2.2);
    ink(ctx, HAIRL, 1.2);
    ctx.beginPath();
    ctx.moveTo(-headR * 0.5, -headR * 0.55);
    ctx.quadraticCurveTo(headR * 0.1, -headR * 0.9, headR * 0.8, -headR * 0.6);
    ctx.stroke();
    face(ctx, headR * 0.18, headR * 0.22, headR * 1.15, C, A, { color: '#3c1a26', spread: headR * 0.5 });
    // little smirk
    ink(ctx, '#46202e', 1.5);
    ctx.beginPath();
    if (A.hit || A.dizzy) ctx.arc(headR * 0.3, headR * 0.66, headR * 0.15, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(headR * 0.22, headR * 0.5, headR * 0.2, Math.PI * 0.15, Math.PI * 0.7);
    ctx.stroke();

    // hat: cone (rides the spring) + wide brim with a lit edge + shadow under it
    const tip = hatTip.map(([x, y]) => [x - lean * 5, y - headY]);
    // cone
    ctx.beginPath();
    ctx.moveTo(-headR * 1.05, -headR * 0.68);
    ctx.quadraticCurveTo(tip[1][0] - headR * 0.5, tip[1][1] + headR * 0.3, tip[2][0], tip[2][1]);
    ctx.quadraticCurveTo(tip[1][0] + headR * 0.55, tip[1][1] + headR * 0.55, headR * 0.8, -headR * 0.78);
    ctx.closePath();
    paint(ctx, CLOTH, C.ink, 2.6);
    // cone cel-shadow on the back flank + lit front edge
    ctx.beginPath();
    ctx.moveTo(-headR * 1.05, -headR * 0.68);
    ctx.quadraticCurveTo(tip[1][0] - headR * 0.5, tip[1][1] + headR * 0.3, tip[2][0], tip[2][1]);
    ctx.quadraticCurveTo(tip[1][0] - headR * 0.05, tip[1][1] + headR * 0.4, -headR * 0.2, -headR * 0.72);
    ctx.closePath();
    paint(ctx, CLOTHD, null);
    ink(ctx, CLOTHL, 1.4);
    ctx.beginPath();
    ctx.moveTo(headR * 0.78, -headR * 0.78);
    ctx.quadraticCurveTo(tip[1][0] + headR * 0.45, tip[1][1] + headR * 0.5, tip[2][0] + 1, tip[2][1] + 1);
    ctx.stroke();
    // brim base (over the cone bottom): under-shadow ellipse then lit top
    ctx.beginPath();
    ctx.ellipse(-0.5, -headR * 0.55, headR * 1.9, headR * 0.5, -0.07, 0, TAU);
    paint(ctx, CLOTHD, C.ink, 2.6);
    ctx.beginPath();
    ctx.ellipse(-0.5, -headR * 0.66, headR * 1.78, headR * 0.42, -0.07, 0, TAU);
    paint(ctx, CLOTH, C.ink, 2.4);
    // lit top of the brim
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.74, headR * 1.45, headR * 0.3, -0.07, Math.PI * 1.05, TAU + Math.PI * 0.1);
    ink(ctx, CLOTHL, 1.8); ctx.stroke();
    // hat band + buckle
    stroke2(ctx, c => { c.moveTo(-headR * 0.86, -headR * 0.92); c.lineTo(headR * 0.74, -headR * 1.0); }, 3.4, C.accent, null, 0);
    glowOn(ctx, C.glow, 5);
    disc(ctx, -headR * 0.05, -headR * 0.98, 1.9, '#fff0d8', null);
    glowOff(ctx);
    // sprung tip ember
    glowOn(ctx, C.accent, 10);
    disc(ctx, tip[2][0], tip[2][1], 2.6, C.glow, null);
    disc(ctx, tip[2][0], tip[2][1], 1.3, '#fff0d8', null);
    glowOff(ctx);
    ctx.restore();

    // ── front arm + staff ────────────────────────────────────────────────
    const shF = [5.5, shY + 2];
    let hF, wA, orbK = 1, hot = false;
    if (A.hang) {
      hF = [13, shY - 25 + Math.sin(t * 2.6) * 1.5]; wA = -1.35;
    } else if (A.guard) {
      hF = [11, shY + 8]; wA = -Math.PI / 2 + 0.12;
    } else if (A.dizzy) {
      hF = [13 + Math.sin(t * 8.5) * 3, shY + 15]; wA = 0.9;
    } else if (A.reel) {
      hF = [15, shY - 6]; wA = -0.4;
    } else if (M) {
      hot = M.ph === 'hit';
      const reach = 21;
      if (M.id === 'ub') {
        hF = [4, shY - 16]; wA = -Math.PI / 2; orbK = 1.4;          // staff skyward, phoenix rise
      } else if (M.id === 'db') {
        const k = M.ph === 'wind' ? M.wk : 1;
        hF = [lerp(10, 4, k), shY - 4 - k * 12]; wA = -Math.PI / 2; orbK = 1.5;
      } else if (M.id === 'sb') {
        // retreating flare-step: she casts back over the shoulder she's fleeing
        const k = M.ph === 'wind' ? M.wk : M.ph === 'rec' ? 1 - M.rk : 1;
        hF = [lerp(12, -2, k), shY + lerp(10, 0, k)]; wA = lerp(-0.6, -2.6, k); orbK = 1.3;
      } else {
        hF = [Math.cos(M.swing) * reach, shY + 2 + Math.sin(M.swing) * reach];
        wA = M.swing; orbK = M.ph === 'hit' ? 1.5 : 1.1;
      }
    } else if (A.airborne) {
      hF = [12, shY + 5 - A.rise * 4]; wA = -0.85 + A.fall * 0.4;
    } else if (A.runAmt > 0.05) {
      hF = [11, shY + 10]; wA = -0.55;
    } else {
      // idle: staff held upright beside her, the orb pulsing at the head
      const regrip = A.fidget > 0.86 ? Math.sin((A.fidget - 0.86) / 0.14 * Math.PI) : 0;
      hF = [13 + sway * 0.4, shY + 13 - regrip * 1.5]; wA = -1.32 + regrip * 0.05;
    }
    puffSleeve(ctx, shF[0] + 1, shF[1] + 1, 5.2, C, C.primary);
    const handF = clothArm(ctx, shF[0], shF[1], hF[0], hF[1], -1, C, { fill: C.primary, w: 5.2 });
    ctx.save();
    ctx.translate(handF[0], handF[1]);
    ctx.rotate(wA);
    staff(ctx, C, t, orbK, hot);
    ctx.restore();
    casterHand(ctx, handF[0], handF[1], 3.6, wA, C, { fill: C.primary, accent: C.accent });

    // ── fire FX (one signature beat per special; floaty, no hit-stop) ────
    if (M && M.ph === 'hit') {
      if (M.id === 'db') {
        // GEYSER TRAP / cataclysm — expanding ring of flame at the cast height
        const k = M.hk;
        glowOn(ctx, C.glow, 18);
        ink(ctx, C.accent, 5 * (1 - k) + 1.5);
        ctx.globalAlpha *= 0.95 - k * 0.5;
        ctx.beginPath();
        ctx.ellipse(0, -28, 18 + k * 62, 10 + k * 34, 0, 0, TAU);
        ctx.stroke();
        glowOff(ctx);
        ctx.globalAlpha = 1;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + t * 1.1;
          flame(ctx, Math.cos(a) * (16 + k * 50), -28 + Math.sin(a) * (9 + k * 26), 5.5, C.accent, '#fff0d8', t, i);
        }
      } else if (M.id === 'ub') {
        // PHOENIX SPIRAL — flames corkscrew up around her as she rises
        for (let i = 0; i < 4; i++) {
          const a = t * 9 + i * (TAU / 4);
          const ry = -30 + Math.sin(a) * 9 - M.hk * 14 - i * 5;
          flame(ctx, Math.cos(a) * 17, ry, 6, C.accent, '#fff0d8', t, i);
        }
      } else if (M.id === 'sb') {
        // FLARE STEP — a fire wall blooms where she just stood (to her +x rear)
        const k = M.hk;
        ctx.save();
        ctx.globalAlpha *= 0.9 - k * 0.4;
        for (let i = 0; i < 4; i++) {
          const fx = 14 + i * 8;
          flame(ctx, fx, -6 - i * 1.5, 6 - i * 0.7 + k * 3, C.accent, '#fff0d8', t, i);
        }
        ctx.restore();
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

// A slim cloth leg (stocking + slipper) hidden under the dress. dir bends the knee.
function drawClothLeg(ctx, hx, hy, foot, bend, C, fill) {
  const { jx, jy, ex, ey } = ikSolve(hx, hy, foot[0], foot[1] - 2, LEG_T, LEG_S, bend);
  stroke2(ctx, c => { c.moveTo(hx, hy); c.lineTo(jx, jy); c.lineTo(ex, ey); }, 4.6, shade(fill, 0.78), C.ink);
  stroke2(ctx, c => { c.moveTo(hx + 0.8, hy); c.lineTo(jx + 0.8, jy); c.lineTo(ex + 0.6, ey); }, 2.4, fill, null, 0);
  slipper(ctx, foot[0], foot[1], C, fill);
}
