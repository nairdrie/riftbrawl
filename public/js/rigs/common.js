// ─────────────────────────────────────────────────────────────────────────────
// Rig toolkit shared by all fighter rigs: easing, color math, inked drawing
// primitives (everything gets an outline so nothing reads as "raw shapes"),
// two-bone IK limbs, verlet cloth chains for secondary motion, and the
// per-move performance derivation (anticipation → strike → follow-through).
// Convention: feet at (0,0), y negative = up, +x = facing direction.
// ─────────────────────────────────────────────────────────────────────────────

import { ACT } from '/shared/constants.js';

export const TAU = Math.PI * 2;

// ── math & easing ───────────────────────────────────────────────────────────

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeIn = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// snappy overshoot for strike frames
export const easeOutBack = (t) => {
  const c = 1.85;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ── color math ──────────────────────────────────────────────────────────────

const hexCache = new Map();
function parseHex(hex) {
  let c = hexCache.get(hex);
  if (!c) {
    c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    hexCache.set(hex, c);
  }
  return c;
}
const toHex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');

// f > 1 lightens, f < 1 darkens
export function shade(hex, f) {
  const [r, g, b] = parseHex(hex);
  if (f <= 1) return `#${toHex(r * f)}${toHex(g * f)}${toHex(b * f)}`;
  const k = f - 1;
  return `#${toHex(r + (255 - r) * k)}${toHex(g + (255 - g) * k)}${toHex(b + (255 - b) * k)}`;
}

export function mixc(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  return `#${toHex(lerp(A[0], B[0], t))}${toHex(lerp(A[1], B[1], t))}${toHex(lerp(A[2], B[2], t))}`;
}

// expanded palette derived from the character's color block
export function palette(c) {
  return {
    ...c,
    ink: mixc(shade(c.secondary, 0.32), '#0a0a14', 0.55),  // outline color
    priD: shade(c.primary, 0.74),                          // cel shadow tone
    priL: shade(c.primary, 1.35),                          // highlight tone
    secD: shade(c.secondary, 0.6),
    secL: shade(c.secondary, 1.45),
    accD: shade(c.accent, 0.66),
  };
}

// ── inked drawing primitives ────────────────────────────────────────────────

export function ink(ctx, color, lw = 2.6) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

// fill the current path and outline it
export function paint(ctx, fill, inkColor, lw = 2.6) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (inkColor) { ink(ctx, inkColor, lw); ctx.stroke(); }
}

export function disc(ctx, x, y, r, fill, inkColor, lw = 2.6) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  paint(ctx, fill, inkColor, lw);
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// a thick rounded line — the building block for limbs (ink underlay + fill)
export function stroke2(ctx, draw, w, color, inkColor, inkPad = 4.4) {
  if (inkColor) {
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = w + inkPad;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); draw(ctx); ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); draw(ctx); ctx.stroke();
}

// two-bone IK limb: shoulder/hip → joint → end, fixed segment lengths.
// dir: +1 / -1 picks which side the joint bends toward.
export function limbIK(ctx, x0, y0, x1, y1, l1, l2, dir, w, color, inkColor) {
  let dx = x1 - x0, dy = y1 - y0;
  let d = Math.hypot(dx, dy) || 0.0001;
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; x1 = x0 + dx; y1 = y0 + dy; d = maxD; }
  const minD = Math.abs(l1 - l2) * 1.001 + 0.01;
  if (d < minD) { const f = minD / d; dx *= f; dy *= f; x1 = x0 + dx; y1 = y0 + dy; d = minD; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  const jx = x0 + a * ux - dir * h * uy;
  const jy = y0 + a * uy + dir * h * ux;
  stroke2(ctx, (c) => { c.moveTo(x0, y0); c.lineTo(jx, jy); c.lineTo(x1, y1); }, w, color, inkColor);
  return [jx, jy];
}

export function glowOn(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
export function glowOff(ctx) { ctx.shadowBlur = 0; }

// ── per-player animation store (client-side only — pure presentation) ───────

const animStore = new Map();

export function getAnimState(key, t) {
  let st = animStore.get(key);
  if (!st) {
    st = { lastT: t, dt: 1 / 60, chains: new Map(), landK: 0, prevGrounded: true, prevVy: 0 };
    animStore.set(key, st);
    if (animStore.size > 64) animStore.delete(animStore.keys().next().value);
  }
  let dt = t - st.lastT;
  if (dt <= 0 || dt > 0.25) dt = 1 / 60;
  st.dt = dt;
  st.lastT = t;
  return st;
}

// verlet chain in WORLD space (so cloth trails naturally when moving/turning).
// anchor (ax, ay) is world-space; returns points in world space.
export function chain(st, name, n, segLen, ax, ay, opts = {}) {
  const grav = opts.grav ?? 220;          // px/s² downward
  const damp = opts.damp ?? 0.86;
  const windX = opts.windX ?? 0;
  const windY = opts.windY ?? 0;
  // rest direction ≈ where gravity + wind push the chain (instant settle on spawn)
  const rm = Math.hypot(windX, grav) || 1;
  const rdx = (windX / rm) * segLen, rdy = (grav / rm) * segLen;
  let pts = st.chains.get(name);
  if (!pts || pts.length !== n) {
    pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: ax + rdx * i, y: ay + rdy * i, px: ax + rdx * i, py: ay + rdy * i });
    st.chains.set(name, pts);
  }
  const dt = Math.min(st.dt, 1 / 30);
  const dt2 = dt * dt;
  // if the anchor teleported (respawn / first frame), snap the whole chain
  if (Math.hypot(pts[0].x - ax, pts[0].y - ay) > 220) {
    for (let i = 0; i < n; i++) {
      pts[i].x = pts[i].px = ax + rdx * i; pts[i].y = pts[i].py = ay + rdy * i;
    }
  }
  pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    const vx = (p.x - p.px) * damp + windX * dt2 * 60;
    const vy = (p.y - p.py) * damp + (grav + windY) * dt2 * 60;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy;
  }
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const diff = (d - segLen) / d;
      if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
      else {
        b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
        a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
      }
    }
    pts[0].x = ax; pts[0].y = ay;
  }
  return pts;
}

// convert world-space chain points into the rig's local (flipped, scaled) frame
export function chainLocal(pts, p, s) {
  const inv = 1 / s;
  return pts.map(pt => [(pt.x - p.x) * p.facing * inv, (pt.y - p.y) * inv]);
}

// tapered ribbon through points — capes, sashes, tails
export function ribbon(ctx, pts, w0, w1, fill, inkColor, lw = 2.4) {
  if (pts.length < 2) return;
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [px, py] = pts[Math.max(0, i - 1)];
    const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
    let tx = nx - px, ty = ny - py;
    const d = Math.hypot(tx, ty) || 0.0001;
    tx /= d; ty /= d;
    const w = lerp(w0, w1, i / (pts.length - 1)) / 2;
    L.push([x - ty * w, y + tx * w]);
    R.push([x + ty * w, y - tx * w]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  paint(ctx, fill, inkColor, lw);
}

// ── shared animation derivation ─────────────────────────────────────────────

// Reads sim state once and produces everything a rig needs to pose itself.
export function deriveAnim(p, char, t) {
  const key = p.uid != null ? `p:${p.uid}` : `portrait:${p.charId}`;
  const st = getAnimState(key, t);

  // landing squash — detect grounded rising edge
  if (p.grounded && !st.prevGrounded) st.landK = Math.min(1, 0.45 + Math.abs(st.prevVy) * 0.045);
  st.prevGrounded = p.grounded;
  st.prevVy = p.vy;
  st.landK = Math.max(0, st.landK - st.dt * 5.2);

  const A = {
    st, key, t,
    s: char.scale,
    facing: p.facing,
    vx: p.vx, vy: p.vy,
    grounded: p.grounded,
    airborne: !p.grounded,
    hang: p.act === ACT.LEDGE,
    guard: p.act === ACT.SHIELD,
    guardStun: p.act === ACT.SHIELDSTUN,
    dizzy: p.act === ACT.SHIELDBREAK,
    hit: p.act === ACT.HITSTUN,
    respawn: p.act === ACT.RESPAWN,
    crouch: 0,
    lean: 0,
    runAmt: 0, runPhase: 0,
    rise: 0, fall: 0,
    tumble: 0, reel: 0,
    squash: 1,
    breathe: Math.sin(t * 2.1 + (p.idx ?? 0) * 1.7) * 0.5 + 0.5,
    blink: ((t * 0.27 + (p.idx ?? 0) * 0.41) % 1) < 0.045,
    fidget: ((t * 0.16 + (p.idx ?? 0) * 0.53) % 1),       // 0..1 slow cycle for idle flourishes
    move: null,
    jitter: { x: 0, y: 0 },
  };

  if (p.hitlag > 0) {
    A.jitter.x = (Math.random() - 0.5) * 2.4;
    A.jitter.y = (Math.random() - 0.5) * 1.6;
  }

  if (p.grounded) {
    const sp = Math.abs(p.vx);
    A.runAmt = clamp01(sp / char.runSpeed);
    A.runPhase = (p.x * 0.05) || 0;          // distance-driven = no foot sliding
    A.lean = A.runAmt * 0.2 * (p.vx * p.facing >= 0 ? 1 : -0.55);
    if (p.act === ACT.FREE && (p.lastIn?.y ?? 0) > 0.5) A.crouch = 0.62;
  } else {
    A.rise = clamp01(-p.vy / 14);
    A.fall = clamp01(p.vy / 12);
    A.lean = 0.06 + A.fall * 0.1;
    if (p.fastFalling) A.fall = 1;
  }

  // squash & stretch
  if (st.landK > 0) A.squash = 1 - st.landK * 0.22;
  else if (!p.grounded && p.vy < -7) A.squash = 1 + clamp01((-p.vy - 7) / 14) * 0.10;

  switch (p.act) {
    case ACT.JUMPSQUAT:
      A.crouch = 0.7;
      A.squash = 0.86;
      break;
    case ACT.SHIELD:
      A.crouch = 0.32;
      break;
    case ACT.SHIELDSTUN:
      A.crouch = 0.45;
      A.lean = -0.2;
      break;
    case ACT.SHIELDBREAK:
      A.lean = Math.sin(t * 8.5) * 0.17;
      A.crouch = 0.18;
      break;
    case ACT.HITSTUN: {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 7) A.tumble = t * (8 + speed * 0.35) * (p.facing > 0 ? 1 : -1);
      else A.reel = 1;
      break;
    }
    case ACT.LEDGE:
      A.airborne = true;
      A.lean = -0.1;
      break;
    case ACT.ATTACK:
      A.move = deriveMove(p, char);
      break;
  }
  return A;
}

// move performance: phases + current swing angle + lunge
function deriveMove(p, char) {
  const m = p.moveId;
  const isSpec = m === 'nb' || m === 'sb' || m === 'ub' || m === 'db';
  const data = isSpec ? char.specials[m] : char.moves[m];
  if (!data) return null;
  const total = data.total;
  const from = isSpec ? (data.fire ?? data.from ?? 6) : data.hitboxes[0].from;
  const to = isSpec ? (data.to ?? from + 4) : data.hitboxes[0].to;
  const f = p.actFrame;

  // strike direction
  let dx = 50, dy = -10;
  if (!isSpec) { dx = data.hitboxes[0].dx; dy = data.hitboxes[0].dy; }
  else if (m === 'ub') { dx = 10; dy = -70; }
  else if (m === 'db') { dx = 26; dy = 16; }
  else if (m === 'nb') { dx = 54; dy = -8; }
  else if (m === 'sb') { dx = 56; dy = -4; }
  const aim = Math.atan2(dy, Math.abs(dx) < 8 && m !== 'db' ? 8 : dx);

  const M = {
    id: m, isSpec, data, f, from, to, total, aim,
    ph: 'wind', wk: 0, hk: 0, rk: 0, k: 0,      // phase + eased progress per phase
    swing: aim - 2.1, lunge: 0,
  };

  const restA = 0.45;
  if (f < from) {
    M.ph = 'wind';
    M.wk = easeOut(clamp01(f / Math.max(1, from)));
    M.k = M.wk;
    M.swing = lerp(restA, aim - 2.1, M.wk);
  } else if (f <= to + 2) {
    M.ph = 'hit';
    M.hk = clamp01((f - from) / Math.max(1, to + 2 - from));
    M.wk = 1;
    M.k = M.hk;
    M.swing = lerp(aim - 2.1, aim + 0.75, easeOutBack(M.hk));
    M.lunge = easeOut(M.hk);
  } else {
    M.ph = 'rec';
    M.rk = easeOut(clamp01((f - to - 2) / Math.max(1, total - to - 2)));
    M.wk = 1; M.hk = 1;
    M.k = M.rk;
    M.swing = lerp(aim + 0.75, restA, M.rk);
    M.lunge = 1 - M.rk;
  }
  return M;
}

// ── shared FX ───────────────────────────────────────────────────────────────

// tapered swing-trail wedge between two angles around a pivot
export function swingTrail(ctx, cx, cy, r0, r1, a0, a1, color, alpha = 0.7) {
  if (Math.abs(a1 - a0) < 0.05) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  glowOn(ctx, color, 18);
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, color + '00');
  g.addColorStop(0.72, color + 'bb');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, Math.min(a0, a1), Math.max(a0, a1));
  ctx.arc(cx, cy, r0, Math.max(a0, a1), Math.min(a0, a1), true);
  ctx.closePath();
  ctx.fill();
  glowOff(ctx);
  ctx.restore();
}

// jagged lightning bolt between two points
export function bolt(ctx, x0, y0, x1, y1, seed, color, w = 2.6, glowColor) {
  const segs = 5;
  glowOn(ctx, glowColor ?? color, 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    const ox = Math.sin(seed * 37 + i * 9.7) * 7 * (1 - Math.abs(k - 0.5));
    const oy = Math.cos(seed * 51 + i * 7.3) * 7 * (1 - Math.abs(k - 0.5));
    ctx.lineTo(lerp(x0, x1, k) + ox - oy * 0.4, lerp(y0, y1, k) + oy);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
  glowOff(ctx);
}

// little flame teardrop, pointing up by default
export function flame(ctx, x, y, r, c0, c1, t, seed = 0) {
  const fl = 1 + Math.sin(t * 11 + seed * 5.1) * 0.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, fl);
  glowOn(ctx, c0, 12);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.7);
  ctx.quadraticCurveTo(r, -r * 0.7, r * 0.62, r * 0.3);
  ctx.quadraticCurveTo(0, r, -r * 0.62, r * 0.3);
  ctx.quadraticCurveTo(-r, -r * 0.7, 0, -r * 1.7);
  ctx.fillStyle = c0;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.quadraticCurveTo(r * 0.5, -r * 0.25, r * 0.3, r * 0.25);
  ctx.quadraticCurveTo(0, r * 0.6, -r * 0.3, r * 0.25);
  ctx.quadraticCurveTo(-r * 0.5, -r * 0.25, 0, -r * 0.9);
  ctx.fillStyle = c1;
  ctx.fill();
  glowOff(ctx);
  ctx.restore();
}

export function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// dizzy stars circling a point (shieldbreak)
export function dizzyStars(ctx, x, y, t) {
  glowOn(ctx, '#ffe97a', 10);
  for (let i = 0; i < 3; i++) {
    const a = t * 4 + i * (TAU / 3);
    drawStar(ctx, x + Math.cos(a) * 20, y + Math.sin(a) * 6, 4.6, '#ffe97a');
  }
  glowOff(ctx);
}

// neutral-B charge orb at the rig's muzzle point
export function chargeOrb(ctx, x, y, charge, max, C, t) {
  if (charge <= 0) return;
  const k = Math.min(1, charge / max);
  const r = (5 + k * 15) * (k >= 1 ? 1 + Math.sin(t * 22) * 0.1 : 1);
  glowOn(ctx, C.glow, 16 + k * 22);
  disc(ctx, x, y, r, C.accent, null);
  disc(ctx, x, y, r * 0.55, '#ffffff', null);
  glowOff(ctx);
  const n = Math.floor(k * 4);
  for (let i = 0; i < n; i++) {
    const a = t * 11 + (i / Math.max(1, n)) * TAU;
    disc(ctx, x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8, 2.1, C.trail, null);
  }
}

// ── faces ────────────────────────────────────────────────────────────────────
// One call covers eyes for every emotional state; rigs choose placement/size.
// mood: 'idle' | 'attack' | 'pain' | 'dizzy'

export function face(ctx, x, y, r, C, A, opts = {}) {
  const mood = A.dizzy ? 'dizzy' : (A.hit || A.guardStun) ? 'pain' : (A.move ? 'attack' : 'idle');
  const eyeCol = opts.color ?? C.ink;
  const dx = opts.spread ?? r * 0.52;
  const ey = y - r * 0.08;
  ctx.save();
  if (mood === 'pain') {
    ink(ctx, eyeCol, r * 0.16);
    for (const sx of [x - dx * 0.4, x + dx]) {
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.16, ey - r * 0.16); ctx.lineTo(sx + r * 0.16, ey + r * 0.16);
      ctx.moveTo(sx + r * 0.16, ey - r * 0.16); ctx.lineTo(sx - r * 0.16, ey + r * 0.16);
      ctx.stroke();
    }
  } else if (mood === 'dizzy') {
    ink(ctx, eyeCol, r * 0.13);
    for (const sx of [x - dx * 0.4, x + dx]) {
      ctx.beginPath();
      ctx.arc(sx, ey, r * 0.17, A.t * 7, A.t * 7 + 4.6);
      ctx.stroke();
    }
  } else if (A.blink && mood === 'idle') {
    ink(ctx, eyeCol, r * 0.13);
    for (const sx of [x - dx * 0.4, x + dx]) {
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.15, ey); ctx.lineTo(sx + r * 0.15, ey);
      ctx.stroke();
    }
  } else {
    const squint = mood === 'attack' ? 0.55 : 1;
    for (const sx of [x - dx * 0.4, x + dx]) {
      ctx.beginPath();
      ctx.ellipse(sx, ey, r * 0.13, r * 0.2 * squint, 0, 0, TAU);
      ctx.fillStyle = eyeCol;
      ctx.fill();
    }
    if (mood === 'attack') {       // determined brows
      ink(ctx, eyeCol, r * 0.11);
      for (const [sx, sg] of [[x - dx * 0.4, -1], [x + dx, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx - r * 0.18, ey - r * 0.3 + (sg > 0 ? -r * 0.06 : 0));
        ctx.lineTo(sx + r * 0.18, ey - r * 0.3 + (sg > 0 ? r * 0.06 : -r * 0.06) * 0.5);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
