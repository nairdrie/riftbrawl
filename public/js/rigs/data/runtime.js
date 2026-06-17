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

import { NB_CHARGE, ACT } from '/shared/constants.js';
import {
  TAU, lerp, clamp01, easeOut, easeOutBack, shade, palette, paint, ink, disc, poly, roundRect, stroke2,
  ikSolve, platedSeg, jointCap, glowOn, glowOff,
  chain, chainLocal, ribbon, swingTrail, chargeOrb, dizzyStars, face,
} from '../common.js';

// ── authored pose overrides (the designer writes these) ──────────────────────
// A "pose" is any subset of these fields (local units; +x leads). Attacks store
// keyframes per phase (wind/hit/rec); other states store one pose. Any field a
// character doesn't author falls back to the engine's procedural pose.
const POSE_FIELDS = ['handX', 'handY', 'wrist', 'backHandX', 'backHandY',
  'leadFootX', 'leadFootY', 'rearFootX', 'rearFootY', 'lean', 'lunge', 'shoulderAngle'];

function lerpPose(a, b, t) {
  const o = {};
  for (const f of POSE_FIELDS) {
    const av = a?.[f], bv = b?.[f];
    if (av == null && bv == null) continue;
    o[f] = av == null ? bv : bv == null ? av : av + (bv - av) * t;
  }
  const at = a?.twoHand, bt = b?.twoHand;
  if (at != null || bt != null) o.twoHand = t < 0.5 ? (at ?? bt) : (bt ?? at);
  // bend directions are discrete (±1) — snap, don't interpolate
  for (const f of ['elbowFront', 'elbowBack', 'kneeFront', 'kneeBack']) {
    const av = a?.[f], bv = b?.[f];
    if (av != null || bv != null) o[f] = t < 0.5 ? (av ?? bv) : (bv ?? av);
  }
  return o;
}

// which authored-pose key the current sim state maps to (non-attack states)
function stateKey(p, A) {
  if (A.hang) return 'ledge';
  if (p.act === ACT.SHIELDBREAK) return 'dizzy';
  if (p.act === ACT.SHIELD) return 'shield';
  if (p.act === ACT.SHIELDSTUN) return 'shieldStun';
  if (p.act === ACT.HITSTUN) return 'hitReel';
  if (p.act === ACT.GRAB) return 'grab';
  if (p.act === ACT.GRABBED) return 'grabbed';
  if (p.act === ACT.ROLL) return 'roll';
  if (p.act === ACT.JUMPSQUAT) return 'jumpsquat';
  if (A.airborne) return 'air';
  if (A.runAmt > 0.05) return 'run';
  if (A.crouch > 0.3) return 'crouch';
  return 'idle';
}

// crossfade key: each attack is its own key (so phase interpolation plays through
// untouched, but entering/leaving the move blends); otherwise the state key.
function poseKey(p, A, M) { return M ? 'm:' + M.id : stateKey(p, A); }


// Resolve a color "token" from a spec: a palette key (primary/secondary/accent/
// glow/trail/ink/priD/priL/secD/secL/accD) or a literal #hex. Falls back safely.
function col(C, token, fallback) {
  if (!token) return fallback;
  if (typeof token === 'string' && token[0] === '#') return token;
  return C[token] ?? fallback;
}

// ── image-skinned parts ──────────────────────────────────────────────────────
// A part can be drawn from an image instead of vectors (character design). The
// image follows the rigged bone, so it animates with the skeleton. `src` is a
// URL/path (loaded + cached) OR a live <img>/<canvas> (used directly — the
// tuner passes object URLs). All transforms are in the rig's local units.

const imgCache = new Map();
function resolveImg(src) {
  if (!src) return null;
  if (typeof src !== 'string') return (src.naturalWidth || src.width) ? src : null;
  let e = imgCache.get(src);
  if (!e) { e = new Image(); e.src = src; imgCache.set(src, e); }
  return (e.complete && e.naturalWidth) ? e : null;
}
// resolve a part's image config from the spec; null if absent or not yet loaded
function partImg(spec, name) {
  const conf = spec.images && spec.images[name];
  if (!conf || !conf.src) return null;
  const img = resolveImg(conf.src);
  if (!img) return null;
  return { img, scale: conf.scale ?? 1, ox: conf.ox ?? 0, oy: conf.oy ?? 0, rot: conf.rot ?? 0 };
}
// ── pose-handle capture (designer drag editing) ─────────────────────────────
// When a collector is registered, each draw records the screen positions of the
// end-effectors (hands/feet) and joints (elbows/knees) plus the local→device
// matrix, so the designer can hit-test handles and map drags back to pose fields.
let CAPTURE = null;
export function poseCapture(o) { CAPTURE = o; }
// Designer authoring flag. When true (drag-to-pose, paused), authored targets sit
// exactly where dragged so editing is WYSIWYG. When false (gameplay + the loop
// preview), authored targets for cyclic states (run) ride ON TOP of the procedural
// motion so the limb keeps animating instead of freezing at the authored pose.
let AUTHORING = false;
export function setAuthoring(v) { AUTHORING = !!v; }
function captureHandles(ctx, { fa, ba, fl, bl, shY, legsNone }) {
  const M = ctx.getTransform();
  const P = (x, y) => ({ x: M.a * x + M.c * y + M.e, y: M.b * x + M.d * y + M.f });
  CAPTURE.m = M; CAPTURE.shY = shY; CAPTURE.legsNone = legsNone;
  CAPTURE.pts = {
    hF: { ...P(fa.ex, fa.ey), role: 'hand', side: 'F' },
    hB: { ...P(ba.ex, ba.ey), role: 'hand', side: 'B' },
    eF: { ...P(fa.jx, fa.jy), role: 'elbow', side: 'F' },
    eB: { ...P(ba.jx, ba.jy), role: 'elbow', side: 'B' },
  };
  if (!legsNone && fl && bl) Object.assign(CAPTURE.pts, {
    ftF: { ...P(fl.ex, fl.ey), role: 'foot', side: 'F' },
    ftB: { ...P(bl.ex, bl.ey), role: 'foot', side: 'B' },
    kF: { ...P(fl.jx, fl.jy), role: 'knee', side: 'F' },
    kB: { ...P(bl.jx, bl.jy), role: 'knee', side: 'B' },
  });
}
// Isolated single-part vector + its image-space metrics, for the part painter
// (designer). Lets the painter size its canvas to the runtime's image convention
// — bone parts map image width→bone length (left edge = joint A, centerline =
// the bone); point parts map image width→a reference span (centered) — so a
// painted bitmap saved at scale 1 drops onto the rig aligned with the vector it
// replaces. `render(ctx)` draws the part in that local frame.
export function getPartDraw(spec, part, colors) {
  const C = palette(colors || spec.colors || { primary: '#cfd8ec', secondary: '#5a647e', accent: '#ffce3f', glow: '#9fd0ff', trail: '#d3e4ff' });
  const sk = spec.skel || {};
  const limbCol = col(C, spec.limb?.color, C.primary);
  const core = spec.limb?.coreColor || null;
  const armW = spec.limb?.arm ?? 7, legW = spec.limb?.leg ?? 8;
  const handR = spec.limb?.hand ?? 4.2, headR = sk.headR ?? 7;
  const bone = (len, w, fill) => ({ kind: 'bone', len, band: Math.max(w * 3.6, 22),
    render: (ctx) => segVector(ctx, 0, 0, len, 0, w, fill, C, core, spec) });
  const point = (ref, render) => ({ kind: 'point', ref, render });
  switch (part) {
    case 'upperArm': return bone(sk.upper ?? 18, armW, limbCol);
    case 'foreArm': return bone(sk.fore ?? 17, armW, limbCol);
    case 'thigh': return bone(sk.thigh ?? 22, legW, limbCol);
    case 'shin': return bone(sk.shin ?? 22, legW, limbCol);
    case 'hand': return point(handR * 3.2, (ctx) => drawHand(ctx, 0, 0, handR, limbCol, C));
    case 'foot': return point(28, (ctx) => drawFoot(ctx, 0, 0, limbCol, C, spec));
    case 'head': return point(headR * 2.3, (ctx) => drawHead(ctx, 0, 0, C, {}, { ...spec, head: { ...spec.head, face: false } }));
    case 'torso': {
      const len = Math.abs((sk.shoulderY ?? -40) - (sk.hipY ?? 0)) || 36;
      return { kind: 'bone', len, band: Math.max((spec.torso?.width ?? 9) * 5, 40),
        render: (ctx) => { ctx.save(); ctx.rotate(Math.PI / 2); drawTorso(ctx, 0, 0, -len, C, spec); ctx.restore(); } };
    }
    case 'weapon': {
      const w = spec.weapon || { type: 'none' }; const len = w.length ?? 56;
      return { kind: 'bone', len, band: Math.max((w.width ?? 6) * 6, 36),
        render: (ctx) => drawWeapon(ctx, C, w, 0) };
    }
  }
  return null;
}

// per-part width/length multipliers (apply to vector AND image; default 1). Stored
// in spec.images[name] so a part can be scaled even with no image assigned.
function pscale(spec, name) {
  const c = spec.images && spec.images[name];
  return { w: (c && c.wScale) || 1, len: (c && c.lenScale) || 1 };
}
// scale a part's whole draw about a pivot (used for the non-chained parts —
// torso/head/hand/foot — so width/length work the same for vector and image).
function withScale(ctx, cx, cy, sx, sy, fn) {
  if (sx === 1 && sy === 1) { fn(); return; }
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy); ctx.translate(-cx, -cy); fn(); ctx.restore();
}
const imgDim = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];
// draw a part image stretched ALONG a bone A→B (its left edge anchors at A).
// `wScale` thickens/thins it across the bone (length follows the bone itself).
function boneImage(ctx, ax, ay, bx, by, P, far, wScale = 1) {
  const [iw, ih] = imgDim(P.img);
  const ang = Math.atan2(by - ay, bx - ax);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  ctx.save();
  if (far) ctx.globalAlpha *= 0.82;
  ctx.translate(ax, ay);
  ctx.rotate(ang + P.rot);
  ctx.translate(P.ox, P.oy);
  const s = (len / iw) * P.scale;
  ctx.scale(s, s * wScale);
  ctx.drawImage(P.img, 0, -ih / 2);
  ctx.restore();
}
// draw a part image CENTERED on a point, sized to a reference span
function pointImage(ctx, x, y, P, ref, ang, far) {
  const [iw, ih] = imgDim(P.img);
  ctx.save();
  if (far) ctx.globalAlpha *= 0.82;
  ctx.translate(x, y);
  ctx.rotate((ang || 0) + P.rot);
  ctx.translate(P.ox, P.oy);
  const s = (ref / iw) * P.scale;
  ctx.scale(s, s);
  ctx.drawImage(P.img, -iw / 2, -ih / 2);
  ctx.restore();
}

// ── skin primitives ──────────────────────────────────────────────────────────

// A two-bone limb (shoulder/hip → joint → end). Returns the IK solution so the
// caller can place a hand/foot at {ex,ey}. style 'stick' = inked stroke (+ an
// optional bright core); style 'plated' = forged armor segments (aegis-class).
function drawLimb(ctx, sx, sy, tx, ty, l1, l2, dir, w1, w2, fill, C, spec, core, imgs) {
  const s = ikSolve(sx, sy, tx, ty, l1, l2, dir);
  // image-skinned segments (per part); falls back to vectors where no image.
  // imgs.w1/w2 thicken each image segment across its bone.
  if (imgs && (imgs.s1 || imgs.s2)) {
    if (imgs.s1) boneImage(ctx, sx, sy, s.jx, s.jy, imgs.s1, imgs.far, imgs.w1 ?? 1);
    else segVector(ctx, sx, sy, s.jx, s.jy, w1, fill, C, core, spec);
    if (imgs.s2) boneImage(ctx, s.jx, s.jy, s.ex, s.ey, imgs.s2, imgs.far, imgs.w2 ?? 1);
    else segVector(ctx, s.jx, s.jy, s.ex, s.ey, w2, fill, C, core, spec);
    return s;
  }
  if (spec.limb.style === 'plated') {
    platedSeg(ctx, sx, sy, s.jx, s.jy, w1 * 1.85, C, { fill, light: spec.light ?? -1 });
    platedSeg(ctx, s.jx, s.jy, s.ex, s.ey, w2 * 1.6, C, { fill, light: spec.light ?? -1 });
    jointCap(ctx, s.jx, s.jy, Math.min(w1, w2) * 0.95, C, { fill });
  } else {
    segVector(ctx, sx, sy, s.jx, s.jy, w1, fill, C, core, spec);
    segVector(ctx, s.jx, s.jy, s.ex, s.ey, w2, fill, C, core, spec);
    const jr = spec.limb.joints ?? 0;
    if (jr > 0) disc(ctx, s.jx, s.jy, jr, fill, C.ink, 1.4);
  }
  return s;
}

// a single limb segment as vectors (used when only one of a limb's two segments
// has an image assigned)
function segVector(ctx, ax, ay, bx, by, w, fill, C, core, spec) {
  if (spec.limb.style === 'plated') {
    platedSeg(ctx, ax, ay, bx, by, w * 1.7, C, { fill, light: spec.light ?? -1 });
    return;
  }
  const path = (c) => { c.moveTo(ax, ay); c.lineTo(bx, by); };
  stroke2(ctx, path, w, fill, C.ink);
  if (core) stroke2(ctx, path, Math.max(1, w * 0.34), col(C, core, fill), null, 0);
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

// The held weapon, drawn from the grip (origin) outward along +x. Types:
// 'sword' (default), 'dagger', 'staff', 'hammer', 'none'. A weapon may instead
// carry an image (`src`), drawn grip-anchored along +x.
function drawWeapon(ctx, C, w, hot) {
  if (!w || w.type === 'none') return;
  if (w.src) {                       // image weapon
    const img = resolveImg(w.src); if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    ctx.save(); ctx.rotate((w.rot || 0)); ctx.translate(w.ox || 0, w.oy || 0);
    const s = ((w.length ?? 56) / iw) * (w.scale ?? 1); ctx.scale(s, s);
    ctx.drawImage(img, w.grip ? -w.grip / s : 0, -ih / 2); ctx.restore(); return;
  }
  const len = w.length ?? (w.type === 'dagger' ? 26 : 56), gw = w.width ?? 6, grip = w.grip ?? 9;
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
  if (w.type === 'hammer') {
    // long banded haft + a heavy rune-forged head near the far end
    const hx = len * 0.86;
    stroke2(ctx, c => { c.moveTo(-grip, 0); c.lineTo(hx, 0); }, gw * 0.7, shade(blade, 0.8), C.ink);
    ink(ctx, guard, 1.8);
    for (let i = 0; i < 3; i++) { const bx = lerp(-grip + 6, hx - 6, i / 2); ctx.beginPath(); ctx.moveTo(bx, -gw * 0.5); ctx.lineTo(bx, gw * 0.5); ctx.stroke(); }
    disc(ctx, -grip, 0, gw * 0.5, guard, C.ink, 1.4);                 // pommel
    glowOn(ctx, edge, hot ? 16 : 7);
    roundRect(ctx, hx - gw * 0.6, -gw * 2.2, gw * 3.0, gw * 4.4, gw * 0.7);  // head block
    paint(ctx, blade, C.ink, 2.6);
    glowOff(ctx);
    roundRect(ctx, hx - gw * 0.6, gw * 0.2, gw * 3.0, gw * 2.0, gw * 0.5); paint(ctx, shade(blade, 0.74), null);
    ink(ctx, edge, 1.6); ctx.beginPath(); ctx.moveTo(hx - gw * 0.4, -gw * 2.0); ctx.lineTo(hx + gw * 2.2, -gw * 2.0); ctx.stroke();
    return;
  }
  // sword / dagger — handle behind the grip, crossguard, tapered blade ahead
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

// A floaty tail in place of legs (NOVA-class). A verlet chain from the hip so it
// trails as the body drifts; tapered ribbon with a glowing tip.
function drawTail(ctx, p, char, st, spec, hipX, hipY, C) {
  const T = spec.tail || {};
  const ax = p.x + hipX * p.facing * char.scale, ay = p.y + hipY * char.scale;
  const pts = chainLocal(
    chain(st, 'tail', T.n ?? 5, (T.seg ?? 12) * char.scale, ax, ay,
          { damp: T.damp ?? 0.9, grav: T.grav ?? 60, windX: -p.facing * (T.windX ?? 16) }),
    p, char.scale);
  ribbon(ctx, pts, T.w0 ?? 16, T.w1 ?? 3, col(C, T.color, C.secondary), C.ink, 2.4);
  const tip = pts[pts.length - 1];
  glowOn(ctx, col(C, T.glow, C.glow), 12);
  disc(ctx, tip[0], tip[1], (T.w1 ?? 3) + 1.5, col(C, T.tipColor, C.glow), null);
  glowOff(ctx);
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

      // ── transition crossfade ───────────────────────────────────────────────
      // The pose for each state is computed below; when the STATE changes (idle→
      // run, move start/end, crouch, hit…) we crossfade the whole pose vector from
      // the last displayed pose to the new one over `blendTime` so nothing pops.
      // Within a state the key is constant → passthrough, so cycles play normally.
      const PB = A.st;
      const pkey = poseKey(p, A, M);
      if (PB._pk !== pkey) { PB._psrc = PB._pdisp || null; PB._pt = PB._psrc ? 0 : 1; PB._pk = pkey; }
      else PB._pt = Math.min(1, (PB._pt ?? 1) + (PB.dt || 1 / 60) / (spec.blendTime ?? 0.085));
      const _bl = !!PB._psrc && PB._pt < 1, _bt = _bl ? easeOut(PB._pt) : 1;
      const mixN = (k, v) => _bl ? PB._psrc[k] + (v - PB._psrc[k]) * _bt : v;       // scalar
      const mixV = (k, v) => _bl ? [PB._psrc[k][0] + (v[0] - PB._psrc[k][0]) * _bt, PB._psrc[k][1] + (v[1] - PB._psrc[k][1]) * _bt] : v;  // [x,y]
      const mixD = (k, v) => _bl && _bt < 0.5 ? PB._psrc[k] : v;                    // discrete (hold to midpoint)
      const st = A.st;
      const landK = st?.landK ?? 0;

      const W = spec.weapon || { type: 'none' };
      const legsNone = spec.legs === 'none';
      // weapons: an explicit array (advanced) or the single `weapon` — mirrored
      // to the back hand when `dualWield` is set.
      const weapons = spec.weapons || (W.type !== 'none' || W.src
        ? (spec.dualWield ? [{ hand: 'front', ...W }, { hand: 'back', ...W }] : [{ hand: 'front', ...W }])
        : []);

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
      const depth = spec.depth ?? 0.55;
      const hipW = (sk.hipW ?? 7) * depth;
      const shoulderXd = (sk.shoulderX ?? 9) * depth;
      // idle sinks into an athletic guard: hips drop a touch so the knees bend
      const idleSettle = idle ? (spec.idleSettle ?? 3) : 0;
      // IDLE POSE — authored data (tune live in /dev/tuner.html, then bake into
      // spec.idlePose). All values are local units; the front hand/foot lead +x.
      const IP = {
        leadFoot: 8, rearFoot: -11, rearLift: 1.5,   // foot placement (staggered)
        handX: 24, handY: 5, wrist: -0.5,            // sword hand + blade angle
        backHandX: 3, backHandY: 13, leanAdd: 0,     // off hand + forward lean
        shoulderAngle: 0,                            // roll of the shoulder line (bladed stance)
        ...(spec.idlePose || {}),
      };
      let hipY = sk.hipY + crouchDrop + idleSettle + stepBob * 0.5;
      let shY = sk.shoulderY + crouchDrop * 1.05 + idleSettle + breathY + stepBob;
      let headY = sk.headY + crouchDrop * 1.1 + idleSettle + breathY * 1.2 + stepBob;
      hipY = mixN('hipY', hipY); shY = mixN('shY', shY); headY = mixN('headY', headY);  // crossfade vertical
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

      // ── authored pose override for this frame (null = fully procedural) ──────
      let OVR = null;
      if (spec.poses) {
        if (M) {
          const P = spec.poses[M.id];
          if (P) {
            const g = { handX: IP.handX, handY: IP.handY, wrist: IP.wrist,
              backHandX: IP.backHandX, backHandY: IP.backHandY, shoulderAngle: IP.shoulderAngle, lean: 0, lunge: 0 };
            if (M.ph === 'wind') OVR = lerpPose(g, P.wind ?? P.hit ?? g, M.wk);
            // hit must START where wind ENDED (P.wind ?? P.hit ?? g) — otherwise,
            // when only `hit` is authored, the hit phase snaps back to neutral and
            // re-swings, giving a double "down→up→down→up" jab.
            else if (M.ph === 'hit') OVR = lerpPose(P.wind ?? P.hit ?? g, P.hit ?? P.wind ?? g, easeOutBack(M.hk));
            else OVR = lerpPose(P.hit ?? P.wind ?? g, P.rec ?? g, M.rk);
          }
        } else {
          const k = stateKey(p, A);
          if (k !== 'idle') OVR = spec.poses[k] ?? null;
        }
      }
      if (OVR) { if (OVR.lean != null) lean = OVR.lean; if (OVR.lunge != null) lunge = OVR.lunge; }
      lean = mixN('lean', lean); lunge = mixN('lunge', lunge);          // crossfade body tilt/shift

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
      if (OVR) {
        // authored feet ride on top of the run cycle during play (so the stride
        // keeps going), but pin exactly when authoring so drag stays WYSIWYG
        const cyc = (!AUTHORING && A.runAmt > 0.05 && !A.airborne);
        const c1x = cyc ? f1[0] : 0, c1y = cyc ? f1[1] : 0, c2x = cyc ? f2[0] : 0, c2y = cyc ? f2[1] : 0;
        if (OVR.leadFootX != null) f1 = [OVR.leadFootX + c1x, (OVR.leadFootY ?? 0) + c1y];
        if (OVR.rearFootX != null) f2 = [OVR.rearFootX + c2x, (OVR.rearFootY ?? 0) + c2y];
        if (OVR.kneeFront != null) bend1 = OVR.kneeFront;
        if (OVR.kneeBack != null) bend2 = OVR.kneeBack;
      }
      if (idle) { if (IP.kneeFront != null) bend1 = IP.kneeFront; if (IP.kneeBack != null) bend2 = IP.kneeBack; }

      // ── hand targets + wrist angle ───────────────────────────────────────────
      // far shoulder rides a touch higher (foreshortening) for the 3/4 read
      const farLift = (1 - depth) * 3.5;
      let shF = [shoulderXd, shY + 3], shB = [-shoulderXd, shY + 2 - farLift];
      // shoulder angle: roll the shoulder line about the neck base so the lead
      // shoulder leads into the guard. From the authored pose, else idle's value.
      let shAng = OVR?.shoulderAngle != null ? OVR.shoulderAngle : (idle ? IP.shoulderAngle : 0);
      shAng = mixN('shAng', shAng);
      if (shAng) {
        const ca = Math.cos(shAng), sa = Math.sin(shAng);
        const roll = ([x, y]) => { const dy = y - shY; return [x * ca - dy * sa, shY + x * sa + dy * ca]; };
        shF = roll(shF); shB = roll(shB);
      }
      let hF, hB, wA = 0.9, twoHand = !!W.twoHand, hot = false;
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
        armBendF = 1;                              // elbow drops down/back, not up
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
      if (OVR && OVR.handX != null) {
        hF = [OVR.handX, shY + (OVR.handY ?? 0)];
        if (OVR.wrist != null) wA = OVR.wrist;
        if (OVR.twoHand != null) twoHand = OVR.twoHand;
      }
      if (OVR && OVR.backHandX != null) hB = [OVR.backHandX, shY + (OVR.backHandY ?? 0)];
      if (twoHand && !hB) hB = [hF[0] * 0.5 - 3, hF[1] * 0.5 + shY * 0.5 + 6];
      if (!hB) hB = [-(sk.shoulderX ?? 9) * 1.5, shY + 12];          // resting counter-hand
      // pose-authored elbow bend directions (click-to-flip in the designer)
      if (OVR) { if (OVR.elbowFront != null) armBendF = OVR.elbowFront; if (OVR.elbowBack != null) armBendB = OVR.elbowBack; }
      if (idle) { if (IP.elbowFront != null) armBendF = IP.elbowFront; if (IP.elbowBack != null) armBendB = IP.elbowBack; }

      // crossfade the limb targets + bends, then remember this frame's pose as the
      // source for the next transition's blend.
      f1 = mixV('f1', f1); f2 = mixV('f2', f2); hF = mixV('hF', hF); hB = mixV('hB', hB); wA = mixN('wA', wA);
      armBendF = mixD('armBendF', armBendF); armBendB = mixD('armBendB', armBendB);
      bend1 = mixD('bend1', bend1); bend2 = mixD('bend2', bend2);
      PB._pdisp = { hipY, shY, headY, shAng, lean, lunge, wA, armBendF, armBendB, bend1, bend2,
        f1: [f1[0], f1[1]], f2: [f2[0], f2[1]], hF: [hF[0], hF[1]], hB: [hB[0], hB[1]] };

      // ── per-part images (character design): null where no image is assigned ──
      const IMG = {
        thigh: partImg(spec, 'thigh'), shin: partImg(spec, 'shin'),
        upperArm: partImg(spec, 'upperArm'), foreArm: partImg(spec, 'foreArm'),
        torso: partImg(spec, 'torso'), head: partImg(spec, 'head'),
        hand: partImg(spec, 'hand'), foot: partImg(spec, 'foot'),
        weapon: partImg(spec, 'weapon'),
      };
      // per-part width(w)/length(len) multipliers — apply to vector AND image
      const Pth = pscale(spec, 'thigh'), Psh = pscale(spec, 'shin');
      const Pup = pscale(spec, 'upperArm'), Pfo = pscale(spec, 'foreArm');
      const Pto = pscale(spec, 'torso'), Phe = pscale(spec, 'head');
      const Pha = pscale(spec, 'hand'), Pft = pscale(spec, 'foot');
      const legImg = (f) => (IMG.thigh || IMG.shin) ? { s1: IMG.thigh, s2: IMG.shin, far: f, w1: Pth.w, w2: Psh.w } : null;
      const armImg = (f) => (IMG.upperArm || IMG.foreArm) ? { s1: IMG.upperArm, s2: IMG.foreArm, far: f, w1: Pup.w, w2: Pfo.w } : null;
      const foot = (x, y, fill, far) => withScale(ctx, x, y, Pft.w, Pft.len, () => IMG.foot ? pointImage(ctx, x, y, IMG.foot, 24, 0, far) : drawFoot(ctx, x, y, fill, C, spec));
      const hand = (x, y, fill, far) => withScale(ctx, x, y, Pha.w, Pha.len, () => IMG.hand ? pointImage(ctx, x, y, IMG.hand, handR * 3.2, 0, far) : drawHand(ctx, x, y, handR, fill, C));

      // ── draw order: back limbs/tail → torso → head → front limbs + weapons ──
      let fl = null, bl = null;
      if (legsNone) drawTail(ctx, p, char, st, spec, hipX, hipY, C);
      else {
        bl = drawLimb(ctx, hipX - hipW, hipY - farLift, f2[0], f2[1] - 3,
                            sk.thigh * Pth.len, sk.shin * Psh.len, bend2, legW * Pth.w, legW * Psh.w, backCol, C, spec, core, legImg(true));
        foot(bl.ex, bl.ey, backCol, true);
      }
      const ba = drawLimb(ctx, shB[0], shB[1], hB[0], hB[1], sk.upper * Pup.len, sk.fore * Pfo.len, armBendB, armW * Pup.w, armW * Pfo.w, backCol, C, spec, core, armImg(true));
      const Pwp = pscale(spec, 'weapon');
      const wAB = Math.atan2(ba.ey - ba.jy, ba.ex - ba.jx);     // back forearm direction
      for (const wp of weapons) if (wp.hand === 'back') {
        ctx.save(); ctx.translate(ba.ex, ba.ey); ctx.rotate(wAB + (wp.angle || 0)); ctx.scale(Pwp.len, Pwp.w); drawWeapon(ctx, C, wp, hot); ctx.restore();
      }
      hand(ba.ex, ba.ey, backCol, true);

      withScale(ctx, 0, hipY, Pto.w, Pto.len, () => {
        if (IMG.torso) boneImage(ctx, hipX, hipY, 0, shY, IMG.torso, false);
        else drawTorso(ctx, hipX, hipY, shY, C, spec);
      });
      withScale(ctx, lean * 4, headY, Phe.w, Phe.len, () => {
        if (IMG.head) pointImage(ctx, lean * 4, headY, IMG.head, headR * 2.3, 0, false);
        else drawHead(ctx, lean * 4, headY, C, A, spec);
      });

      if (!legsNone) {
        fl = drawLimb(ctx, hipX + hipW, hipY, f1[0], f1[1] - 3,
                            sk.thigh * Pth.len, sk.shin * Psh.len, bend1, legW * Pth.w, legW * Psh.w, limbCol, C, spec, core, legImg(false));
        foot(fl.ex, fl.ey, limbCol, false);
      }

      const fa = drawLimb(ctx, shF[0], shF[1], hF[0], hF[1], sk.upper * Pup.len, sk.fore * Pfo.len, armBendF, armW * Pup.w, armW * Pfo.w, limbCol, C, spec, core, armImg(false));
      if (CAPTURE) captureHandles(ctx, { fa, ba, fl, bl, shY, legsNone });
      for (const wp of weapons) if (wp.hand !== 'back') {
        ctx.save(); ctx.translate(fa.ex, fa.ey); ctx.rotate(wA + (wp.angle || 0)); ctx.scale(Pwp.len, Pwp.w); drawWeapon(ctx, C, wp, hot); ctx.restore();
      }
      if (IMG.weapon) {            // image-skinned weapon part (front hand, legacy)
        ctx.save(); ctx.translate(fa.ex, fa.ey); ctx.rotate(wA);
        const P = IMG.weapon, [iw, ih] = imgDim(P.img);
        ctx.translate(P.ox, P.oy); ctx.rotate(P.rot);
        const s = ((W.length ?? 56) / iw) * P.scale; ctx.scale(s, s); ctx.drawImage(P.img, 0, -ih / 2);
        ctx.restore();
      }
      hand(fa.ex, fa.ey, limbCol, false);

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
