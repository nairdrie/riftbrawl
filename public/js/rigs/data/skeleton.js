// ─────────────────────────────────────────────────────────────────────────────
// SKELETAL RIG ENGINE — the "studio" character system.
//
// A character is a generic BONE HIERARCHY (any topology: add/remove arms, legs,
// tails, joints), a set of SKINS (vector shapes or images) bound to bones, and
// ANIMATION CLIPS that pose the bones per state/move. This is how 2D studios rig
// (Spine / DragonBones / Live2D): FK joint rotations, skins parented to bones,
// keyframed clips. It replaces the fixed 2-arm/2-leg data rig.
//
// Convention: feet/ground at y=0, +x = facing, y negative = up. Angles in DEGREES,
// LOCAL to the parent bone (0 = along the parent's direction). A root bone has no
// parent and sits at an absolute (x,y) with an absolute angle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAU, lerp, shade, palette, paint, ink, disc, poly, stroke2, glowOn, glowOff, face,
} from '../common.js';

const DEG = Math.PI / 180;

function col(C, token, fallback) {
  if (!token) return fallback;
  if (typeof token === 'string' && token[0] === '#') return token;
  return C[token] ?? fallback;
}

// ── image cache (shared with images skins) ──────────────────────────────────
const imgCache = new Map();
function resolveImg(src) {
  if (!src) return null;
  if (typeof src !== 'string') return (src.naturalWidth || src.width) ? src : null;
  let e = imgCache.get(src);
  if (!e) { e = new Image(); e.src = src; imgCache.set(src, e); }
  return (e.complete && e.naturalWidth) ? e : null;
}

// ── forward kinematics: world transform for every bone ──────────────────────
// pose: optional { boneName: angleDeg } overriding each bone's rest `ang`.
// Returns map name → { x,y (start), ex,ey (end), wang (world rad), len }.
export function solveFK(bones, pose) {
  const map = {};
  for (const b of bones) {
    const local = (pose && b.name in pose ? pose[b.name] : (b.ang ?? 0)) * DEG;
    let x, y, wang;
    if (b.parent == null) { x = b.x ?? 0; y = b.y ?? 0; wang = local; }
    else {
      const p = map[b.parent] || { ex: 0, ey: 0, wang: 0 };
      x = p.ex; y = p.ey; wang = p.wang + local;
    }
    const len = b.len ?? 0;
    map[b.name] = { x, y, wang, len, ex: x + Math.cos(wang) * len, ey: y + Math.sin(wang) * len };
  }
  return map;
}

// ── skin drawing (each skin is parented to a bone) ──────────────────────────
function drawSkin(ctx, s, B, C, A) {
  const m = B[s.bone];
  if (!m) return;
  const fill = col(C, s.color, C.primary);
  const type = s.type || 'capsule';
  if (type === 'capsule') {
    const w = s.w ?? 7;
    stroke2(ctx, c => { c.moveTo(m.x, m.y); c.lineTo(m.ex, m.ey); }, w, fill, s.ink === false ? null : C.ink);
    if (s.core) stroke2(ctx, c => { c.moveTo(m.x, m.y); c.lineTo(m.ex, m.ey); }, Math.max(1, w * 0.34), col(C, s.core, fill), null, 0);
    if (s.joint) disc(ctx, m.x, m.y, s.joint, fill, C.ink, 1.4);
  } else if (type === 'disc') {
    const at = s.at === 'end' ? [m.ex, m.ey] : [m.x, m.y];
    disc(ctx, at[0] + (s.ox || 0), at[1] + (s.oy || 0), s.r ?? 10, fill, s.ink === false ? null : C.ink, 2.4);
    if (s.glow) { glowOn(ctx, col(C, s.glow, C.glow), 12); disc(ctx, at[0] + (s.ox || 0), at[1] + (s.oy || 0), (s.r ?? 10) * 0.4, '#ffffff', null); glowOff(ctx); }
    if (s.face) face(ctx, at[0] + (s.ox || 0) + (s.r ?? 10) * 0.18, at[1] + (s.oy || 0), (s.r ?? 10) * (s.faceScale ?? 0.82), C, A, {});
  } else if (type === 'poly') {
    // points are in the bone's local frame (x along the bone), scaled by len
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.wang);
    poly(ctx, (s.pts || []).map(([px, py]) => [px, py]));
    paint(ctx, fill, s.ink === false ? null : C.ink, s.lw ?? 2.4);
    ctx.restore();
  } else if (type === 'image') {
    const img = resolveImg(s.src); if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.wang + (s.rot || 0) * DEG);
    ctx.translate(s.ox || 0, s.oy || 0);
    const span = s.fit === 'len' ? (m.len || iw) : (s.size ?? (m.len || iw));
    const sc = (span / iw) * (s.scale ?? 1);
    ctx.scale(sc, sc);
    ctx.drawImage(img, s.center ? -iw / 2 : 0, -ih / 2);
    ctx.restore();
  }
}

// ── debug: draw the bones + joints (editor overlay) ─────────────────────────
export function drawBones(ctx, B, opts = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const name in B) {
    const m = B[name];
    ctx.strokeStyle = opts.color || '#6f8bc0'; ctx.lineWidth = opts.lw || 2;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.ex, m.ey); ctx.stroke();
    ctx.fillStyle = opts.joint || '#ffce3f';
    ctx.beginPath(); ctx.arc(m.x, m.y, opts.r || 2.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ── pose resolution from animation clips ────────────────────────────────────
// clips: { stateKey: { boneName: angleDeg, ... } } — one pose per state (v1);
// attacks will use { wind, hit, rec } interpolated by phase in Phase 2.

// ── build a rig from a skeletal spec ────────────────────────────────────────
// spec: { bones:[...], skins:[...], clips:{...} }. Returns the standard rig
// interface { draw, spec } so it drops into RIGS like any other rig.
export function buildSkeletonRig(spec) {
  const bones = spec.bones || [];
  // draw order: skins listed back-to-front (author orders them)
  return {
    spec,
    solve(pose) { return solveFK(bones, pose); },
    draw(ctx, p, char, A, t) {
      const C = palette(char.colors);
      const pose = resolveClipPose(spec, A, t, bones);
      const B = solveFK(bones, pose);
      for (const s of (spec.skins || [])) drawSkin(ctx, s, B, C, A);
      if (spec.showBones) drawBones(ctx, B);
    },
  };
}

// idle/clip pose for the current state (v1: idle clip + simple state map).
function resolveClipPose(spec, A, t, bones) {
  const clips = spec.clips || {};
  // breathing on the idle clip (subtle spine sway) keeps it alive
  const base = clips.idle || {};
  return base;   // (state→clip mapping + phase interpolation lands in Phase 2)
}
