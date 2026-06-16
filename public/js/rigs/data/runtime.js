// ─────────────────────────────────────────────────────────────────────────────
// DATA-DRIVEN RIG RUNTIME — the "importable character" engine.
//
// Every built-in legend (aegis/volt/…) is a hand-written draw() function. This
// file is the opposite: ONE generic interpreter that takes a pure-data "rig
// spec" (anatomy + skin + weapon + projectile — see RIG_FORMAT.md) and produces
// a fully animated fighter. All the *performance* lives here and is shared:
// breathing idle, weight-shift, run cycle, jumps, ledge hang, every tilt /
// aerial / special swing, hit reactions, dizzy, cloth secondary motion. The
// spec only describes what the character LOOKS like; this drives how it MOVES,
// so any imported design animates the same as the built-ins for free.
//
// Coordinate convention (same as every rig): feet at (0,0), +x = facing
// direction, y negative = up. drawFighter() has already flipped/scaled us.
// ─────────────────────────────────────────────────────────────────────────────

import { NB_CHARGE } from '/shared/constants.js';
import {
  TAU, lerp, clamp01, easeOut, shade, palette, paint, ink, disc, poly, stroke2,
  ikSolve, platedSeg, jointCap, glowOn, glowOff,
  chain, chainLocal, ribbon, swingTrail, chargeOrb, dizzyStars, face,
} from '../common.js';

// Resolve a color "token" from a spec: a palette key (primary/secondary/accent/
// glow/trail/ink/priD/priL/secD/secL/accD) or a literal #hex. Falls back safely.
function col(C, token, fallback) {
  if (!token) return fallback;
  if (typeof token === 'string' && token[0] === '#') return token;
  return C[token] ?? fallback;
}

// ── skin primitives ──────────────────────────────────────────────────────────

// A two-bone limb (shoulder/hip → joint → end). Returns the IK solution so the
// caller can place a hand/foot at {ex,ey}. style 'stick' = inked stroke (+ an
// optional bright core); style 'plated' = forged armor segments (aegis-class).
function drawLimb(ctx, sx, sy, tx, ty, l1, l2, dir, w, fill, C, spec, core) {
  const s = ikSolve(sx, sy, tx, ty, l1, l2, dir);
  if (spec.limb.style === 'plated') {
    platedSeg(ctx, sx, sy, s.jx, s.jy, w * 1.85, C, { fill, light: spec.light ?? -1 });
    platedSeg(ctx, s.jx, s.jy, s.ex, s.ey, w * 1.6, C, { fill, light: spec.light ?? -1 });
    jointCap(ctx, s.jx, s.jy, w * 0.95, C, { fill });
  } else {
    const path = (c) => { c.moveTo(sx, sy); c.lineTo(s.jx, s.jy); c.lineTo(s.ex, s.ey); };
    stroke2(ctx, path, w, fill, C.ink);
    if (core) stroke2(ctx, path, Math.max(1, w * 0.34), col(C, core, fill), null, 0);
    const jr = spec.limb.joints ?? 0;
    if (jr > 0) disc(ctx, s.jx, s.jy, jr, fill, C.ink, 1.4);
  }
  return s;
}

function drawHand(ctx, x, y, r, fill, C) {
  if (r > 0) disc(ctx, x, y, r, fill, C.ink, 1.6);
}

// Foot/boot at a contact point. The limb frame already faces +x, so a 'shoe'
// wedge simply points forward. 'dot' is a rounded heel; 'none' draws nothing.
function drawFoot(ctx, x, y, fill, C, spec) {
  const kind = spec.limb.foot ?? 'shoe';
  if (kind === 'none') return;
  if (kind === 'dot') { disc(ctx, x, y, (spec.limb.leg ?? 8) * 0.5, fill, C.ink, 1.6); return; }
  ctx.save();
  ctx.translate(x, y);
  poly(ctx, [[-6, -3.5], [6, -3.5], [11, 1], [11, 4], [-7, 4], [-8, 0]]);
  paint(ctx, fill, C.ink, 2);
  ink(ctx, shade(fill, 1.35), 1.2);
  ctx.beginPath(); ctx.moveTo(-5, -2.6); ctx.lineTo(7, -2.6); ctx.stroke();
  ctx.restore();
}

// Torso: 'spine' = a tapered trunk (slightly wider at the shoulders) — the
// honest stick-figure body; 'capsule'/'plate' give bulkier silhouettes.
function drawTorso(ctx, hipX, hipY, shY, C, spec) {
  const t = spec.torso || {};
  const w = t.width ?? 9;
  const fill = col(C, t.color, C.secondary);
  const shape = t.shape || 'spine';
  if (shape === 'plate') {
    poly(ctx, [[-w * 2.4, shY - 2], [w * 2.4, shY - 2], [w * 1.5, hipY + 2], [-w * 1.5, hipY + 2]]);
    paint(ctx, fill, C.ink, 2.6);
    poly(ctx, [[-w * 2.1, shY + (hipY - shY) * 0.45], [w * 2.1, shY + (hipY - shY) * 0.45],
               [w * 1.5, hipY + 2], [-w * 1.5, hipY + 2]]);
    paint(ctx, shade(fill, 0.78), null);
  } else if (shape === 'capsule') {
    stroke2(ctx, c => { c.moveTo(hipX, hipY); c.lineTo(0, shY); }, w * 2.0, fill, C.ink);
  } else { // spine
    const topW = w * 0.66, botW = w * 0.46;
    poly(ctx, [[-topW, shY], [topW, shY], [hipX + botW, hipY + 1], [hipX - botW, hipY + 1]]);
    paint(ctx, fill, C.ink, 2.6);
    // a slim shaded back edge for a touch of volume
    poly(ctx, [[-topW, shY], [-topW + w * 0.5, shY], [hipX - botW + w * 0.4, hipY + 1], [hipX - botW, hipY + 1]]);
    paint(ctx, shade(fill, 0.8), null);
  }
  // pelvis cap so the legs root cleanly
  disc(ctx, hipX, hipY, w * 0.7, fill, C.ink, 1.8);
  // neck stub up to the head
  stroke2(ctx, c => { c.moveTo(0, shY); c.lineTo(0, shY - (spec.skel.neck ?? 4)); }, w * 0.55, fill, C.ink);
}

function drawHead(ctx, hx, hy, C, A, spec) {
  const h = spec.head || {};
  const r = spec.skel.headR;
  const fill = col(C, h.color, C.primary);
  if (h.shape === 'helm') {
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.05, Math.PI * 0.86, TAU + Math.PI * 0.14);
    ctx.lineTo(hx - r * 0.5, hy + r * 0.9); ctx.closePath();
    paint(ctx, fill, C.ink, 2.4);
  } else {
    disc(ctx, hx, hy, r, fill, h.outline === false ? null : C.ink, 2.4);
  }
  // soft underside shade for roundness
  ctx.save();
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.arc(hx - r * 0.35, hy + r * 0.55, r * 0.95, 0, TAU);
  ctx.fillStyle = shade(fill, 0.82); ctx.globalAlpha = 0.8; ctx.fill();
  ctx.restore();
  if (h.face !== false) {
    // bias the face toward the front edge so the head reads as a profile look
    const fopts = h.eyeColor ? { color: col(C, h.eyeColor) } : {};
    face(ctx, hx + r * (h.faceShift ?? 0.18), hy, r * (h.faceScale ?? 0.82), C, A, fopts);
  }
}

// The held weapon, drawn from the grip (origin) outward along +x. Supported
// types keep the importer honest: 'sword' (default), 'staff', 'none'.
function drawWeapon(ctx, C, w, hot) {
  if (!w || w.type === 'none') return;
  const len = w.length ?? 56, gw = w.width ?? 6, grip = w.grip ?? 9;
  const blade = col(C, w.color, C.primary);
  const edge = col(C, w.edge, C.glow);
  const guard = col(C, w.guard, C.accent);
  if (w.type === 'staff') {
    stroke2(ctx, c => { c.moveTo(-grip, 0); c.lineTo(len, 0); }, gw * 0.6, blade, C.ink);
    glowOn(ctx, edge, hot ? 16 : 9);
    disc(ctx, len, 0, gw * 1.1, guard, C.ink, 2);
    disc(ctx, len, 0, gw * 0.5, '#ffffff', null);
    glowOff(ctx);
    return;
  }
  // sword — handle behind the grip, crossguard at the grip, tapered blade ahead
  stroke2(ctx, c => { c.moveTo(-grip, 0); c.lineTo(-1, 0); }, 4.2, C.secD, C.ink, 2.2);
  disc(ctx, -grip, 0, 2.6, guard, C.ink, 1.4);                       // pommel
  stroke2(ctx, c => { c.moveTo(0, -gw * 0.95); c.lineTo(0, gw * 0.95); }, 3.4, guard, C.ink, 2);  // crossguard
  glowOn(ctx, edge, hot ? 15 : 5);
  poly(ctx, [[2, -gw * 0.5], [len - 11, -gw * 0.34], [len, 0], [len - 11, gw * 0.34], [2, gw * 0.5]]);
  paint(ctx, blade, C.ink, 2.2);
  glowOff(ctx);
  ink(ctx, shade(blade, 1.4), 1.2);                                  // fuller
  ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(len - 10, 0); ctx.stroke();
  ink(ctx, edge, 1.3);                                               // lit edge
  ctx.beginPath(); ctx.moveTo(4, -gw * 0.42); ctx.lineTo(len - 12, -gw * 0.24); ctx.stroke();
}

// ── the interpreter ──────────────────────────────────────────────────────────
// buildDataRig(spec) → { draw(ctx,p,char,A,t), drawProjectile(ctx,pr,char,t) }
// matching the shape of the hand-written rigs so it drops straight into RIGS.

export function buildDataRig(spec) {
  const sk = spec.skel;

  return {
    spec,

    draw(ctx, p, char, A, t) {
      const C = palette(char.colors);
      const M = A.move;
      const st = A.st;
      const landK = st?.landK ?? 0;

      // Dev pose-tuner hook: /dev/tuner.html sets globalThis.__RIG_TUNE__[id] to
      // live slider values so the real engine renders WYSIWYG while you dial a
      // pose in. Never set in production → all reads fall back to spec/defaults.
      const tune = (typeof globalThis !== 'undefined' && globalThis.__RIG_TUNE__
                    && globalThis.__RIG_TUNE__[spec.id]) || null;
      const W = tune?.weapon
        ? { ...(spec.weapon || { type: 'none' }), ...tune.weapon }
        : (spec.weapon || { type: 'none' });

      const limbCol = col(C, spec.limb?.color, C.primary);
      const backCol = shade(limbCol, 0.74);
      const armW = spec.limb?.arm ?? 7;
      const legW = spec.limb?.leg ?? 8;
      const handR = spec.limb?.hand ?? 4.2;
      const core = spec.limb?.coreColor || null;

      // ── pose scalars ───────────────────────────────────────────────────────
      const idle = A.grounded && !M && !A.guard && !A.dizzy && !A.reel &&
                   A.runAmt < 0.05 && A.crouch < 0.2;
      const sway = idle ? Math.sin(t * 0.9 + (p.idx ?? 0)) : 0;
      const crouchDrop = A.crouch * 15 + landK * 8;
      const breathY = A.breathe * 1.4;
      const stepBob = A.grounded ? Math.abs(Math.sin(A.runPhase)) * 4.5 * A.runAmt : 0;

      const hipX = sway * 2.0;
      // DEPTH: this is a side-view fighter, not a figure facing the camera, so
      // the near/far limbs are separated mostly in depth, not screen width.
      // `depth` scales the frontal hip/shoulder width (1 = full front-on, 0 =
      // razor profile); ~0.55 reads as a confident 3/4 stance.
      const depth = tune?.depth ?? spec.depth ?? 0.55;
      const hipW = (sk.hipW ?? 7) * depth;
      const shoulderXd = (sk.shoulderX ?? 9) * depth;
      // idle sinks into an athletic guard: hips drop a touch so the knees bend
      const idleSettle = idle ? (tune?.settle ?? spec.idleSettle ?? 3) : 0;
      // IDLE POSE — authored data (tune live in /dev/tuner.html, then bake into
      // spec.idlePose). All values are local units; the front hand/foot lead +x.
      const IP = {
        leadFoot: 8, rearFoot: -11, rearLift: 1.5,   // foot placement (staggered)
        handX: 24, handY: 5, wrist: -0.5,            // sword hand + blade angle
        backHandX: 3, backHandY: 13, leanAdd: 0,     // off hand + forward lean
        shoulderAngle: 0,                            // roll of the shoulder line (bladed stance)
        ...(spec.idlePose || {}), ...(tune?.idlePose || {}),
      };
      const hipY = sk.hipY + crouchDrop + idleSettle + stepBob * 0.5;
      const shY = sk.shoulderY + crouchDrop * 1.05 + idleSettle + breathY + stepBob;
      const headY = sk.headY + crouchDrop * 1.1 + idleSettle + breathY * 1.2 + stepBob;
      const headR = sk.headR;

      // lean (shoulders) + lunge (step-in), per state
      let lean = A.lean - sway * 0.05;
      let lunge = 0;
      if (M) {
        lunge = M.lunge * 6;
        if (M.ph === 'wind') lean -= 0.14 * M.wk;
        else if (M.ph === 'hit') lean += 0.22;
        else lean += 0.22 * (1 - M.rk);
        if (M.id === 'sb') { lean = M.ph === 'hit' ? 0.5 : lean + 0.3 * M.wk; lunge = M.ph === 'hit' ? 11 : lunge; }
        if (M.id === 'ub') lean = M.ph === 'wind' ? 0.14 : -0.18;
        if (M.id === 'db') lean = Math.sin(t * 22) * 0.05;              // spin: near-upright
        if (M.id === 'utilt') lean = M.ph === 'hit' ? -0.1 : lean;
      }
      if (idle) lean += IP.leanAdd;
      if (A.reel) lean = -0.5;
      if (A.hang) lean = -0.1;

      // ── cloth anchors (world → verlet → local) ───────────────────────────────
      const clothPts = [];
      const cloth = spec.cloth || [];
      for (let i = 0; i < cloth.length; i++) {
        const cl = cloth[i];
        const ax = cl.x ?? -2, ayKey = cl.anchor ?? 'shoulder';
        const ay = ayKey === 'head' ? headY - headR : ayKey === 'hip' ? hipY : shY;
        const wx = p.x + (ax + hipX) * p.facing * char.scale;
        const wy = p.y + ay * char.scale;
        clothPts.push(chainLocal(
          chain(st, `cloth${i}`, cl.n ?? 5, (cl.seg ?? 11) * char.scale, wx, wy,
                { damp: cl.damp ?? 0.87, grav: cl.grav ?? 200, windX: -p.facing * (cl.windX ?? 30) }),
          p, char.scale,
        ));
      }

      ctx.save();
      ctx.translate(lunge + hipX, 0);
      ctx.rotate(lean * 0.5);

      // cloth furthest back
      for (let i = 0; i < cloth.length; i++) {
        const cl = cloth[i];
        ribbon(ctx, clothPts[i], cl.w0 ?? 8, cl.w1 ?? 3, col(C, cl.color, C.secondary), C.ink, 2.4);
      }

      // ── foot targets ─────────────────────────────────────────────────────────
      const stance = sk.stance ?? 12;
      let f1 = [stance + sway * 1.2, 0], f2 = [-stance + sway * 1.2, 0];
      // knees bend FORWARD (toward facing) by default — a side-view convention,
      // not the camera-facing splay the rig started with. Run overrides per step.
      let bend1 = -1, bend2 = -1;
      if (A.airborne && !A.hang) {
        f1 = [10 + A.rise * 5, -13 - A.rise * 7];
        f2 = [-12, -3 + A.fall * 3];
        if (M && M.id === 'dair') { f1 = [6, 4]; f2 = [-8, -11]; }
      } else if (A.hang) {
        f1 = [3, -7]; f2 = [-8, -2];
      } else if (A.runAmt > 0.05) {
        const ph = A.runPhase, k = A.runAmt;
        f1 = [Math.sin(ph) * 22 * k, -Math.max(0, Math.cos(ph)) * 10 * k];
        f2 = [Math.sin(ph + Math.PI) * 22 * k, -Math.max(0, Math.cos(ph + Math.PI)) * 10 * k];
      } else if (M && M.ph !== 'wind') {
        f1 = [stance + 8, 0]; f2 = [-stance - 4, 0];
      } else if (idle) {
        // compact, overlapping side-on stance from authored IP data: a modest
        // stagger (the near leg sits mostly in front of the far one), both knees
        // forward; NOT a wide front-on A-frame
        f1 = [IP.leadFoot - sway * 0.8, 0];            // lead foot — knee bends over it
        f2 = [IP.rearFoot - sway * 1.2, -IP.rearLift]; // rear foot — back, heel lifted
        bend1 = -1; bend2 = -1;
      }
      if (A.crouch > 0.3) { f1[0] += 4; f2[0] -= 4; }

      // ── hand targets + wrist angle ───────────────────────────────────────────
      // far shoulder rides a touch higher (foreshortening) for the 3/4 read
      const farLift = (1 - depth) * 3.5;
      let shF = [shoulderXd, shY + 3], shB = [-shoulderXd, shY + 2 - farLift];
      // shoulder angle: roll the shoulder line about the neck base so the lead
      // shoulder leads forward/up into the guard (idle only; arms follow).
      if (idle && IP.shoulderAngle) {
        const ca = Math.cos(IP.shoulderAngle), sa = Math.sin(IP.shoulderAngle);
        const roll = ([x, y]) => { const dy = y - shY; return [x * ca - dy * sa, shY + x * sa + dy * ca]; };
        shF = roll(shF); shB = roll(shB);
      }
      let hF, hB, wA = 0.9, twoHand = !!W.twoHand, hot = false, weaponOut = W.type !== 'none';
      // elbow bend directions (pose-aware, not camera-facing constants): +1 drops
      // the elbow down, -1 lifts it. Defaults suit the swings; idle overrides.
      let armBendF = -1, armBendB = 1;
      const reach = 26;

      if (A.hang) {
        hF = [14, shY - 30 + Math.sin(t * 2.2) * 1.5]; hB = [-2, shY + 14]; wA = 1.5; twoHand = false;
      } else if (A.guard) {
        hF = [18, shY + 12]; hB = [11, shY + 15]; wA = Math.PI / 2 - 0.1; twoHand = false;
      } else if (A.dizzy) {
        hF = [15 + Math.sin(t * 8) * 3, shY + 20]; hB = [-15, shY + 20]; wA = 1.4; twoHand = false;
      } else if (A.reel) {
        hF = [17, shY - 8]; hB = [-17, shY - 6]; wA = 0.9; twoHand = false;
      } else if (M) {
        hot = M.ph === 'hit';
        if (M.id === 'jab') {
          const ext = M.ph === 'hit' ? 1 : M.ph === 'wind' ? M.wk * 0.3 : 1 - M.rk;
          hF = [lerp(14, 40, easeOut(ext)), shY + lerp(7, 2, ext)];
          wA = lerp(0.4, -0.05, ext); twoHand = false;
        } else if (M.id === 'sb') {
          const k = M.ph === 'wind' ? M.wk : M.ph === 'rec' ? 1 - M.rk : 1;
          hF = [lerp(13, 36, k), shY + lerp(8, 1, k)]; wA = lerp(0.5, -0.06, k); twoHand = false;
        } else if (M.id === 'ub') {
          const up = M.ph === 'wind' ? M.wk : 1;
          hF = [lerp(12, 6, up), shY + lerp(14, -24, up)];
          wA = lerp(0.4, -Math.PI / 2 + 0.06, up); twoHand = false;
        } else if (M.id === 'db') {
          const a = lerp(-2.4, 3.8, M.ph === 'wind' ? M.wk * 0.18 : M.ph === 'hit' ? 0.18 + M.hk * 0.78 : 1);
          hF = [Math.cos(a) * reach, shY + Math.sin(a) * reach]; wA = a + 0.42; twoHand = false;
        } else if (M.id === 'nb') {
          const k = M.ph === 'wind' ? M.wk : M.ph === 'hit' ? 1 : 1 - M.rk;
          const a = lerp(-2.2, -0.1, k);
          hF = [Math.cos(a) * reach, shY + Math.sin(a) * reach]; wA = a + 0.3; twoHand = false;
        } else {
          const a = M.swing;
          hF = [Math.cos(a) * reach, shY + 3 + Math.sin(a) * reach]; wA = a + 0.15;
        }
      } else if (A.airborne) {
        hF = [14, shY + 7 - A.rise * 4]; hB = [-13, shY + 10]; wA = -0.6 + A.fall * 0.5; twoHand = false;
      } else if (A.runAmt > 0.05) {
        hF = [11, shY + 8]; hB = [-9 - Math.sin(A.runPhase) * 5 * A.runAmt, shY + 14]; wA = -2.35; twoHand = false;
      } else {
        // idle: a side-on guard from authored IP data. lead hand up + out front
        // with the blade angled forward (folded arm drops the elbow into guard);
        // rear hand tucks to the ribs as a counterbalance, breathing with sway.
        const bob = sway * 0.8;
        const carry = W.idle === 'shoulder' ? { hF: [5, shY - 3 + bob], wA: -1.2 }
                    : W.idle === 'down' ? { hF: [16, shY + 22 + bob], wA: 1.2 }
                    : { hF: [IP.handX, shY + IP.handY + bob], wA: IP.wrist };   // 'rest' = guard
        hF = carry.hF; wA = carry.wA;
        if (W.idle !== 'shoulder') armBendF = 1;                      // elbow drops into the guard
        hB = [IP.backHandX, shY + IP.backHandY + bob * 0.6];          // rear hand tucked to the body
        twoHand = !!W.idleTwoHand;
      }
      if (twoHand && !hB) hB = [hF[0] * 0.5 - 3, hF[1] * 0.5 + shY * 0.5 + 6];
      if (!hB) hB = [-(sk.shoulderX ?? 9) * 1.5, shY + 12];          // resting counter-hand

      // ── draw order: back limbs → torso → head → front limbs + weapon → FX ────
      const bl = drawLimb(ctx, hipX - hipW, hipY - farLift, f2[0], f2[1] - 3,
                          sk.thigh, sk.shin, bend2, legW, backCol, C, spec, core);
      drawFoot(ctx, bl.ex, bl.ey, backCol, C, spec);
      const ba = drawLimb(ctx, shB[0], shB[1], hB[0], hB[1], sk.upper, sk.fore, armBendB, armW, backCol, C, spec, core);
      drawHand(ctx, ba.ex, ba.ey, handR, backCol, C);

      drawTorso(ctx, hipX, hipY, shY, C, spec);
      drawHead(ctx, lean * 4, headY, C, A, spec);

      const fl = drawLimb(ctx, hipX + hipW, hipY, f1[0], f1[1] - 3,
                          sk.thigh, sk.shin, bend1, legW, limbCol, C, spec, core);
      drawFoot(ctx, fl.ex, fl.ey, limbCol, C, spec);

      const fa = drawLimb(ctx, shF[0], shF[1], hF[0], hF[1], sk.upper, sk.fore, armBendF, armW, limbCol, C, spec, core);
      if (weaponOut) {
        ctx.save();
        ctx.translate(fa.ex, fa.ey);
        ctx.rotate(wA);
        drawWeapon(ctx, C, W, hot);
        ctx.restore();
      }
      drawHand(ctx, fa.ex, fa.ey, handR, limbCol, C);

      // ── move FX (signature beats) ────────────────────────────────────────────
      if (M && M.ph === 'hit') {
        if (M.id !== 'jab' && M.id !== 'nb' && M.id !== 'sb') {
          swingTrail(ctx, 0, shY + 3, 24, 70, M.aim - 1.8 + M.hk * 0.6, M.swing + 0.3, C.trail, 0.8);
        }
        if (M.id === 'sb') {                                          // lunge speed wedge
          ctx.save(); ctx.globalAlpha *= 0.5; glowOn(ctx, C.glow, 12);
          poly(ctx, [[-40, shY - 12], [-10, shY + 2], [-40, shY + 16]]);
          paint(ctx, C.trail + '88', null); glowOff(ctx); ctx.restore();
        } else if (M.id === 'ub') {                                   // rising edge streak
          ctx.save(); glowOn(ctx, C.glow, 16);
          ink(ctx, C.accent, 2.6);
          ctx.globalAlpha *= 0.8;
          ctx.beginPath(); ctx.moveTo(2, shY + 12); ctx.lineTo(-2, shY - 60 - M.hk * 30); ctx.stroke();
          glowOff(ctx); ctx.restore();
        } else if (M.id === 'db') {                                   // riposte spin ring
          ctx.save(); glowOn(ctx, C.glow, 14);
          ink(ctx, C.accent + 'cc', 3);
          ctx.beginPath(); ctx.arc(0, shY + 2, reach + 6, t * 26, t * 26 + 4.2); ctx.stroke();
          glowOff(ctx); ctx.restore();
        }
      }
      // neutral-B charge held at the blade tip
      if (p.moveId === 'nb' && (p.charge || 0) > 0) {
        const cx = fa.ex + Math.cos(wA) * (W.length ?? 56) * 0.9;
        const cy = fa.ey + Math.sin(wA) * (W.length ?? 56) * 0.9;
        chargeOrb(ctx, cx, cy, p.charge, NB_CHARGE.max, C, t);
      }
      if (A.dizzy) dizzyStars(ctx, lean * 4, headY - headR * 1.9, t);

      ctx.restore();
    },

    // Optional projectile look — renderer.js calls this for this character's
    // shots; returning false hands back to the renderer's built-in visuals.
    drawProjectile(ctx, pr, char, t) {
      const pj = spec.projectile;
      if (!pj || pr.kind !== 'shot') return false;
      const C = palette(char.colors);
      if (pj.shape === 'slash') {
        // a crescent energy slash that spins as it flies
        const dir = Math.sign(pr.vx) || 1;
        ctx.save();
        ctx.scale(dir, 1);
        ctx.rotate(Math.sin(t * 20 + pr.id) * 0.12);
        glowOn(ctx, C.glow, 18);
        ink(ctx, C.accent, pr.r * 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, pr.r * 1.25, -1.1, 1.1);
        ctx.stroke();
        ink(ctx, '#ffffff', pr.r * 0.2);
        ctx.beginPath();
        ctx.arc(0, 0, pr.r * 1.25, -0.8, 0.8);
        ctx.stroke();
        glowOff(ctx);
        ctx.restore();
        return true;
      }
      return false;
    },
  };
}
