// ─────────────────────────────────────────────────────────────────────────────
// Procedural fighter rendering. Every character is drawn as a stylized vector
// hero — distinct silhouette, weapon, palette and animation personality —
// driven directly by sim state (no sprite assets, crisp at any zoom).
// Convention: feet at (0,0), y negative = up, +x = facing direction.
// ─────────────────────────────────────────────────────────────────────────────

import { ACT, NB_CHARGE } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';

const TAU = Math.PI * 2;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeOut(t) { return 1 - (1 - t) * (1 - t) * (1 - t); }

// ── pose derivation from sim state ──────────────────────────────────────────

function computePose(p, char, t) {
  const pose = {
    crouch: 0,          // 0..1 squat
    lean: 0,            // torso lean radians (+ = forward)
    runPhase: 0,        // leg cycle
    runAmt: 0,          // 0..1 how much running
    airborne: !p.grounded,
    tumble: 0,          // hitstun spin radians
    swing: null,        // {angle, t} weapon swing
    windup: 0,          // 0..1 anticipation
    guard: p.act === ACT.SHIELD,
    stunned: p.act === ACT.SHIELDBREAK,
    breathe: Math.sin(t * 2.1 + p.idx * 1.7) * 0.5 + 0.5,
    fall: 0,
    rise: 0,
    hang: p.act === ACT.LEDGE,
  };

  if (p.grounded) {
    const sp = Math.abs(p.vx);
    pose.runAmt = clamp01(sp / char.runSpeed);
    pose.runPhase = (p.x * 0.045) || 0;       // distance-driven cycle = no foot sliding
    pose.lean = pose.runAmt * 0.22 * (p.vx * p.facing >= 0 ? 1 : -0.6);
    // crouch (holding down on the ground)
    if (p.act === ACT.FREE && (p.lastIn?.y ?? 0) > 0.5) pose.crouch = 0.6;
  } else {
    pose.rise = clamp01(-p.vy / 14);
    pose.fall = clamp01(p.vy / 12);
    pose.lean = 0.08 + pose.fall * 0.1;
  }
  if (pose.hang) {
    pose.airborne = true;
    pose.lean = -0.12;
    pose.fall = 0.3;
    pose.rise = 0;
  }

  switch (p.act) {
    case ACT.JUMPSQUAT:
      pose.crouch = 0.65;
      break;
    case ACT.SHIELD:
      pose.crouch = 0.3;
      break;
    case ACT.SHIELDSTUN:
      pose.crouch = 0.42;
      pose.lean = -0.18;
      break;
    case ACT.SHIELDBREAK:
      pose.lean = Math.sin(t * 9) * 0.16;
      pose.crouch = 0.15;
      break;
    case ACT.HITSTUN: {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 7) pose.tumble = t * (8 + speed * 0.35) * (p.facing > 0 ? 1 : -1);
      else pose.lean = -0.45;
      break;
    }
    case ACT.ATTACK: {
      const m = p.moveId;
      const isSpec = m === 'nb' || m === 'sb' || m === 'ub' || m === 'db';
      const data = isSpec ? char.specials[m] : char.moves[m];
      const total = data.total;
      const from = isSpec ? (data.fire ?? data.from ?? 6) : data.hitboxes[0].from;
      const to = isSpec ? (data.to ?? from + 4) : data.hitboxes[0].to;
      const f = p.actFrame;
      // target direction of the strike
      let dx = 50, dy = -10;
      if (!isSpec) { dx = data.hitboxes[0].dx; dy = data.hitboxes[0].dy; }
      else if (m === 'ub') { dx = 10; dy = -70; }
      else if (m === 'db') { dx = 0; dy = 10; }
      const aim = Math.atan2(dy, Math.abs(dx) < 8 && m !== 'db' ? 8 : dx);
      if (f < from) {
        pose.windup = clamp01(f / from);
        pose.swing = { angle: aim - 1.9, t: 0, aim };
        pose.lean = -0.12 * pose.windup;
      } else if (f <= to + 2) {
        const st = clamp01((f - from) / Math.max(1, to + 2 - from));
        pose.swing = { angle: lerp(aim - 1.9, aim + 0.7, easeOut(st)), t: st, aim };
        pose.lean = 0.2;
      } else {
        const rt = clamp01((f - to) / Math.max(1, total - to));
        pose.swing = { angle: lerp(aim + 0.7, 0.4, easeOut(rt)), t: 1, aim };
        pose.lean = lerp(0.2, 0, rt);
      }
      if (m === 'db') pose.crouch = f < from ? 0.5 * clamp01(f / from) : 0.2;
      if (m === 'dtilt') pose.crouch = 0.55;     // low attack stays low
      if (m === 'ub') pose.lean = -0.2;
      break;
    }
  }
  return pose;
}

// ── limb helpers ────────────────────────────────────────────────────────────

function limb(ctx, x0, y0, x1, y1, bend, w, color) {
  // two-segment limb through a bent midpoint
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2 + Math.abs(bend) * 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
}

function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function glowOn(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function glowOff(ctx) { ctx.shadowBlur = 0; }

// ── weapons (drawn in hand-space: origin = hand, +x along swing angle) ──────

const WEAPONS = {
  aegis(ctx, c, s) { // war hammer
    ctx.save();
    ctx.strokeStyle = c.secondary; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6 * s, 0); ctx.lineTo(46 * s, 0); ctx.stroke();
    glowOn(ctx, c.accent, 14);
    ctx.fillStyle = c.accent;
    roundRect(ctx, 38 * s, -16 * s, 26 * s, 32 * s, 6 * s); ctx.fill();
    ctx.fillStyle = c.primary;
    roundRect(ctx, 44 * s, -11 * s, 14 * s, 22 * s, 4 * s); ctx.fill();
    glowOff(ctx);
    ctx.restore();
  },
  volt(ctx, c, s) { // lightning dagger
    ctx.save();
    glowOn(ctx, c.accent, 16);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 4.5 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(2 * s, 0); ctx.lineTo(20 * s, -5 * s); ctx.lineTo(30 * s, 3 * s); ctx.lineTo(48 * s, -3 * s);
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.moveTo(4 * s, 0); ctx.lineTo(20 * s, -4 * s); ctx.lineTo(30 * s, 2 * s); ctx.lineTo(46 * s, -2.5 * s);
    ctx.stroke();
    glowOff(ctx);
    ctx.restore();
  },
  ember(ctx, c, s) { // pyre staff
    ctx.save();
    ctx.strokeStyle = '#5a3a4a'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-18 * s, 6 * s); ctx.lineTo(44 * s, -4 * s); ctx.stroke();
    glowOn(ctx, c.glow, 20);
    disc(ctx, 50 * s, -5 * s, 9 * s, c.accent);
    disc(ctx, 50 * s, -5 * s, 5 * s, '#fff0d8');
    glowOff(ctx);
    ctx.restore();
  },
  tide(ctx, c, s) { // trident rapier
    ctx.save();
    glowOn(ctx, c.glow, 12);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3.6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(52 * s, 0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40 * s, -8 * s); ctx.lineTo(54 * s, 0); ctx.lineTo(40 * s, 8 * s);
    ctx.stroke();
    ctx.strokeStyle = c.primary; ctx.lineWidth = 5 * s;
    ctx.beginPath(); ctx.arc(6 * s, 0, 7 * s, -1.9, 1.9); ctx.stroke();
    glowOff(ctx);
    ctx.restore();
  },
  nova(ctx, c, s) { // void orb
    ctx.save();
    glowOn(ctx, c.glow, 22);
    disc(ctx, 30 * s, 0, 11 * s, c.secondary);
    disc(ctx, 30 * s, 0, 8 * s, c.accent);
    disc(ctx, 30 * s, 0, 4 * s, '#fff');
    ctx.strokeStyle = c.primary; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.ellipse(30 * s, 0, 16 * s, 5 * s, 0.5, 0, TAU); ctx.stroke();
    glowOff(ctx);
    ctx.restore();
  },
};

// ── head dressing per character ─────────────────────────────────────────────

const HEADS = {
  aegis(ctx, c, s, r) {
    // full helm with plume
    ctx.fillStyle = c.primary;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.12, Math.PI * 0.95, Math.PI * 2.06); ctx.fill();
    ctx.fillStyle = c.secondary;
    roundRect(ctx, -r * 1.05, -r * 0.25, r * 2.1, r * 0.95, r * 0.3); ctx.fill();
    glowOn(ctx, c.glow, 8);
    ctx.fillStyle = c.glow;
    roundRect(ctx, r * 0.05, -r * 0.1, r * 0.85, r * 0.32, r * 0.16); ctx.fill();  // visor slit
    glowOff(ctx);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3.4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 1.0); ctx.quadraticCurveTo(-r * 1.7, -r * 1.7, -r * 2.4, -r * 0.9); ctx.stroke(); // plume
  },
  volt(ctx, c, s, r) {
    ctx.fillStyle = '#ffe7c2';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // spiked energy hair
    glowOn(ctx, c.accent, 10);
    ctx.fillStyle = c.primary;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.1);
    ctx.lineTo(-r * 1.6, -r * 0.9);
    ctx.lineTo(-r * 0.6, -r * 0.85);
    ctx.lineTo(-r * 0.9, -r * 1.8);
    ctx.lineTo(-r * 0.1, -r * 1.05);
    ctx.lineTo(r * 0.4, -r * 1.7);
    ctx.lineTo(r * 0.7, -r * 0.75);
    ctx.lineTo(r, -r * 0.2);
    ctx.closePath(); ctx.fill();
    glowOff(ctx);
    ctx.fillStyle = c.secondary; // visor band
    roundRect(ctx, r * 0.0, -r * 0.25, r * 1.0, r * 0.42, r * 0.2); ctx.fill();
    glowOn(ctx, c.accent, 8);
    ctx.fillStyle = c.accent;
    roundRect(ctx, r * 0.12, -r * 0.14, r * 0.76, r * 0.2, r * 0.1); ctx.fill();
    glowOff(ctx);
  },
  ember(ctx, c, s, r) {
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // witch hat
    glowOn(ctx, c.glow, 6);
    ctx.fillStyle = c.secondary;
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, -r * 0.72, r * 1.55, r * 0.42, -0.08, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, -r * 0.8);
    ctx.quadraticCurveTo(-r * 0.3, -r * 3.1, -r * 1.9, -r * 2.6);
    ctx.quadraticCurveTo(-r * 0.9, -r * 2.4, r * 0.62, -r * 0.95);
    ctx.closePath(); ctx.fill();
    glowOff(ctx);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2.6 * s;
    ctx.beginPath(); ctx.moveTo(-r * 0.72, -r * 0.86); ctx.lineTo(r * 0.5, -r * 0.95); ctx.stroke();
    // eye
    ctx.fillStyle = c.primary;
    disc(ctx, r * 0.42, -r * 0.05, r * 0.14, c.primary);
  },
  tide(ctx, c, s, r) {
    ctx.fillStyle = '#d9f0ea';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // fin crest helm
    glowOn(ctx, c.glow, 8);
    ctx.fillStyle = c.primary;
    ctx.beginPath(); ctx.arc(0, -r * 0.12, r * 1.06, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 1.0);
    ctx.quadraticCurveTo(-r * 0.1, -r * 2.2, -r * 1.3, -r * 1.7);
    ctx.quadraticCurveTo(-r * 1.0, -r * 1.0, -r * 0.95, -r * 0.5);
    ctx.closePath(); ctx.fill();
    glowOff(ctx);
    ctx.fillStyle = c.secondary;
    roundRect(ctx, r * 0.05, -r * 0.2, r * 0.85, r * 0.34, r * 0.17); ctx.fill();
    glowOn(ctx, c.accent, 6);
    ctx.fillStyle = c.accent;
    roundRect(ctx, r * 0.15, -r * 0.12, r * 0.6, r * 0.16, r * 0.08); ctx.fill();
    glowOff(ctx);
  },
  nova(ctx, c, s, r) {
    // armored void helm, glowing star eye
    ctx.fillStyle = c.secondary;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, TAU); ctx.fill();
    ctx.fillStyle = c.primary;
    ctx.beginPath(); ctx.arc(0, -r * 0.18, r * 1.05, Math.PI * 0.92, Math.PI * 2.08); ctx.fill();
    glowOn(ctx, c.accent, 14);
    disc(ctx, r * 0.35, -r * 0.02, r * 0.22, c.accent);
    disc(ctx, r * 0.35, -r * 0.02, r * 0.1, '#fff');
    glowOff(ctx);
    // halo shards
    glowOn(ctx, c.glow, 10);
    ctx.strokeStyle = c.glow; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = -2.2 + i * 0.55;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5 - r * 0.4);
      ctx.lineTo(Math.cos(a) * r * 2.0, Math.sin(a) * r * 2.0 - r * 0.4);
      ctx.stroke();
    }
    glowOff(ctx);
  },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── main fighter draw ───────────────────────────────────────────────────────

// p: sim player, t: seconds for ambient anim, opts: {flash, ghost}
export function drawFighter(ctx, p, t, opts = {}) {
  const char = CHARACTERS[p.charId];
  const c = char.colors;
  const s = char.scale;
  const pose = computePose(p, char, t);

  ctx.save();
  if (opts.ghost) ctx.globalAlpha = 0.45;
  // invulnerability shimmer
  if (p.invuln > 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha *= 0.45;

  ctx.scale(p.facing, 1);

  if (pose.tumble) {
    ctx.translate(0, -40 * s);
    ctx.rotate(pose.tumble);
    ctx.translate(0, 40 * s);
  }

  const crouchDrop = pose.crouch * 14 * s;
  const hipY = -34 * s + crouchDrop;
  const shoulderY = -60 * s + crouchDrop * 1.15;
  const headY = -76 * s + crouchDrop * 1.2;
  const headR = 12.5 * s;

  // ambient aura
  const aura = ctx.createRadialGradient(0, -40 * s, 6, 0, -40 * s, 70 * s);
  aura.addColorStop(0, c.glow + '30');
  aura.addColorStop(1, c.glow + '00');
  ctx.fillStyle = aura;
  ctx.fillRect(-70 * s, -110 * s, 140 * s, 140 * s);

  ctx.rotate(pose.lean * 0.4);

  // ── legs
  const legW = 7.5 * s * (char.weight > 110 ? 1.35 : 1);
  let f1x, f1y, f2x, f2y, bend1, bend2;
  if (pose.airborne && !pose.tumble) {
    f1x = 8 * s + pose.rise * 6 * s; f1y = -10 * s - pose.rise * 8 * s;
    f2x = -10 * s; f2y = -2 * s - pose.fall * -2 * s;
    bend1 = -8 * s; bend2 = 10 * s;
  } else {
    const ph = pose.runPhase;
    const swing = pose.runAmt;
    f1x = Math.sin(ph) * 18 * s * swing; f1y = -Math.max(0, Math.cos(ph)) * 7 * s * swing;
    f2x = Math.sin(ph + Math.PI) * 18 * s * swing; f2y = -Math.max(0, Math.cos(ph + Math.PI)) * 7 * s * swing;
    bend1 = 6 * s + swing * 4 * s; bend2 = 6 * s - swing * 2 * s;
    if (!swing) { f1x = 7 * s; f2x = -7 * s; f1y = f2y = 0; }
  }
  limb(ctx, 4 * s, hipY, f2x, f2y, bend2, legW, c.secondary);
  limb(ctx, -4 * s, hipY, f1x, f1y, bend1, legW, c.primary);
  // boots
  disc(ctx, f1x, f1y - 2 * s, 4.4 * s, c.accent);

  // ── torso
  const grad = ctx.createLinearGradient(0, shoulderY, 0, hipY);
  grad.addColorStop(0, c.primary);
  grad.addColorStop(1, c.secondary);
  ctx.fillStyle = grad;
  const torsoW = (char.weight > 110 ? 19 : char.weight < 85 ? 12 : 15) * s;
  ctx.beginPath();
  ctx.moveTo(-torsoW * 0.8, hipY + 4 * s);
  ctx.quadraticCurveTo(-torsoW * 1.15, (hipY + shoulderY) / 2, -torsoW, shoulderY);
  ctx.lineTo(torsoW, shoulderY);
  ctx.quadraticCurveTo(torsoW * 1.15, (hipY + shoulderY) / 2, torsoW * 0.8, hipY + 4 * s);
  ctx.closePath();
  ctx.fill();
  // chest core light
  glowOn(ctx, c.accent, 9);
  disc(ctx, 3 * s, shoulderY + 9 * s, 3.6 * s, c.accent);
  glowOff(ctx);

  // ── back arm (behind torso visually — drawn after torso but darker)
  const shx = 0, shy = shoulderY + 2 * s;
  let bArmX = -14 * s, bArmY = shy + 16 * s;
  if (pose.guard) { bArmX = 12 * s; bArmY = shy + 8 * s; }
  if (pose.hang) { bArmX = 4 * s; bArmY = shy - 22 * s; }
  limb(ctx, -5 * s, shy, bArmX, bArmY, -5 * s, 6 * s * (char.weight > 110 ? 1.3 : 1), c.secondary);

  // ── head
  ctx.save();
  ctx.translate(Math.sin(pose.breathe * TAU) * 0.6 * s + pose.lean * 6 * s, headY - pose.breathe * 1.4 * s);
  HEADS[p.charId]?.(ctx, c, s, headR);
  ctx.restore();

  // ── front arm + weapon
  let handX, handY, weaponAngle;
  if (pose.hang) {
    // gripping the ledge overhead, body dangling
    handX = 14 * s; handY = shy - 26 * s + Math.sin(t * 2.4) * 1.5 * s;
    weaponAngle = -1.4;
  } else if (pose.swing) {
    const a = pose.swing.angle;
    handX = Math.cos(a) * 22 * s;
    handY = shy + Math.sin(a) * 22 * s;
    weaponAngle = a;
  } else if (pose.guard) {
    handX = 16 * s; handY = shy + 10 * s; weaponAngle = -0.5;
  } else if (pose.airborne) {
    handX = 14 * s; handY = shy + 6 * s - pose.rise * 6 * s; weaponAngle = -0.6 + pose.fall * 0.5;
  } else {
    handX = 12 * s + Math.sin(pose.runPhase + Math.PI) * 10 * s * pose.runAmt;
    handY = shy + 14 * s;
    weaponAngle = 0.5 - pose.runAmt * 0.3 + Math.sin(pose.breathe * TAU) * 0.04;
  }
  limb(ctx, 5 * s, shy, handX, handY, 4 * s, 6.2 * s * (char.weight > 110 ? 1.3 : 1), c.primary);
  disc(ctx, handX, handY, 4 * s, c.accent);

  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(weaponAngle);
  WEAPONS[p.charId]?.(ctx, c, s);
  ctx.restore();

  // ── swing slash arc during active frames
  if (pose.swing && pose.swing.t > 0 && pose.swing.t < 1) {
    const a0 = pose.swing.aim - 1.6, a1 = pose.swing.angle + 0.25;
    glowOn(ctx, c.trail, 24);
    const arcG = ctx.createRadialGradient(0, shy, 20 * s, 0, shy, 64 * s);
    arcG.addColorStop(0, c.trail + '00');
    arcG.addColorStop(0.75, c.trail + 'aa');
    arcG.addColorStop(1, c.trail + '00');
    ctx.fillStyle = arcG;
    ctx.beginPath();
    ctx.arc(0, shy, 64 * s, a0, a1);
    ctx.arc(0, shy, 26 * s, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    glowOff(ctx);
  }

  // ── neutral-B charge orb
  if (p.moveId === 'nb' && (p.charge || 0) > 0) {
    const t = Math.min(1, p.charge / NB_CHARGE.max);
    const orbR = (5 + t * 16) * s * (t >= 1 ? 1 + Math.sin(p.charge * 0.9) * 0.12 : 1);
    glowOn(ctx, c.glow, 18 + t * 22);
    disc(ctx, handX + 14 * s, handY, orbR, c.accent);
    disc(ctx, handX + 14 * s, handY, orbR * 0.55, '#ffffff');
    glowOff(ctx);
    // orbiting motes as it charges
    const n = Math.floor(t * 4);
    for (let i = 0; i < n; i++) {
      const a = p.charge * 0.18 + (i / Math.max(1, n)) * TAU;
      disc(ctx, handX + 14 * s + Math.cos(a) * orbR * 1.8, handY + Math.sin(a) * orbR * 1.8,
        2.2 * s, c.trail);
    }
  }

  // ── windup charge sparkle
  if (pose.windup > 0.3) {
    glowOn(ctx, c.accent, 16);
    ctx.globalAlpha *= 0.85;
    disc(ctx, handX, handY, (2 + pose.windup * 5) * s, c.accent);
    glowOff(ctx);
  }

  // stun stars
  if (pose.stunned) {
    glowOn(ctx, '#ffe97a', 10);
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + i * (TAU / 3);
      drawStar(ctx, Math.cos(a) * 22 * s, headY - 18 * s + Math.sin(a) * 7 * s, 5 * s, '#ffe97a');
    }
    glowOff(ctx);
  }

  ctx.restore();

  // ── shield bubble (drawn unrotated, world-aligned)
  if (p.act === ACT.SHIELD) {
    const shieldT = p.shield / 60;
    const r = (46 + shieldT * 18) * s;
    ctx.save();
    const g = ctx.createRadialGradient(0, -40 * s, r * 0.3, 0, -40 * s, r);
    g.addColorStop(0, c.glow + '14');
    g.addColorStop(0.8, c.glow + '52');
    g.addColorStop(1, c.glow + 'aa');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -40 * s, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = c.glow + 'dd';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
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

// ── portrait rendering (char select cards, HUD chips) ───────────────────────

export function drawPortrait(canvas, charId, t = 0, hover = 0) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const char = CHARACTERS[charId];
  const c = char.colors;
  ctx.clearRect(0, 0, w, h);

  // backdrop
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, c.secondary);
  bg.addColorStop(1, '#0a0c18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const halo = ctx.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, w * 0.7);
  halo.addColorStop(0, c.glow + (hover ? '55' : '33'));
  halo.addColorStop(1, c.glow + '00');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // fighter in idle pose, feet near bottom
  const fake = {
    charId, idx: 0, facing: 1, grounded: true, vx: 0, vy: 0,
    act: ACT.FREE, actFrame: 0, moveId: '', invuln: 0, shield: 60,
    x: 0, y: 0,
  };
  ctx.save();
  ctx.translate(w / 2 - 6, h * 0.94);
  const sc = (h / 130) * (1 + hover * 0.04);
  ctx.scale(sc, sc);
  drawFighter(ctx, fake, t);
  ctx.restore();
}
