// ─────────────────────────────────────────────────────────────────────────────
// SMASH — shared constants (deterministic sim runs on server AND client)
// Coordinate system: y is DOWN (canvas-aligned). Floor top surface at y = 0.
// ─────────────────────────────────────────────────────────────────────────────

export const TICK_RATE = 60;            // simulation Hz
export const SNAP_EVERY = 2;            // server broadcasts every N ticks (30Hz)
export const MS_PER_TICK = 1000 / TICK_RATE;

export const STAGE = {
  halfWidth: 560,                       // platform surface x ∈ [-560, 560]
  floorY: 0,
  thickness: 64,
  blastX: 1500,
  blastTop: -1300,
  blastBottom: 920,
  spawnX: [-340, 340, -130, 130],       // spawn slots by player index
  respawnY: -420,                       // floating respawn platform height
};

export const STOCKS = 3;
export const COUNTDOWN_TICKS = 190;     // 3.. 2.. 1.. GO!
export const RESPAWN_FREEZE = 50;       // ticks dead before respawn
export const RESPAWN_INVULN = 120;      // ticks of spawn invincibility
export const RESPAWN_PLATFORM_TICKS = 90;

// Input button bitmask
export const BTN = {
  ATTACK: 1,
  SPECIAL: 2,
  JUMP: 4,
  SHIELD: 8,
  GRAB: 16,
};

// Player action states
export const ACT = {
  FREE: 0,          // idle / run / airborne, fully actionable
  JUMPSQUAT: 1,
  ATTACK: 2,        // committed to a move (grounded or aerial)
  SHIELD: 3,
  SHIELDSTUN: 4,
  HITSTUN: 5,       // launched
  SHIELDBREAK: 6,
  DEAD: 7,          // waiting to respawn
  RESPAWN: 8,       // standing on revival platform
  LEDGE: 9,         // hanging from the stage edge
  GRAB: 10,         // reaching for / holding a grabbed opponent
  GRABBED: 11,      // being held by an opponent
};

// Ledge mechanics
export const LEDGE = {
  invuln: 48,        // invincibility ticks on grab
  maxHang: 300,      // auto-drop after this many ticks
  regrabDelay: 32,   // ticks before the ledge can be grabbed again
  grabW: 44,         // horizontal reach of the grab box beyond the edge
  grabInner: 8,      // reach inside the edge
  grabTop: -8,       // grab box vertical range (feet y)
  grabBottom: 88,
  hangX: 16,         // hang offset outward from the edge
  hangY: 72,         // feet below stage top while hanging (puts the gripping
                     //   hand at the lip instead of floating above it)
};

export const DASH = {
  ticks: 14,         // initial dash burst duration
  mult: 1.4,         // dash speed multiplier over run speed
  walkMult: 0.55,    // walk speed (partial stick tilt)
  tapHi: 0.75,       // stick must reach this…
  tapLo: 0.35,       // …from below this in one tick = smash input
};

export const CROUCH_KB = 0.82;  // crouch-cancel knockback multiplier

// neutral-B charge: hold special to charge, release to fire (auto at max)
export const NB_CHARGE = {
  max: 66,        // ticks to full charge (~1.1s)
  dmg: 1.3,       // +130% damage at full charge
  speed: 0.45,    // +45% projectile speed
  size: 0.8,      // +80% radius
  kb: 0.7,        // +70% base knockback / growth
};

// smash-attack charge: hold ATTACK on a directional tilt (f/u/d) to charge a
// smash, release (or hit max) to swing with scaled damage + knockback.
export const SMASH_CHARGE = {
  max: 60,        // ticks to full charge (~1s)
  dmg: 1.1,       // +110% damage at full charge
  kb: 0.95,       // +95% base knockback / growth
};

// grab / pummel / throw — Smash-style: grab beats shield, mash to escape
export const GRAB = {
  reachFrom: 5, reachTo: 10, total: 30,   // whiff timing (punishable on miss)
  range: 58,        // grab reach in front (px)
  vert: 64,         // vertical catch tolerance
  hold: 18,         // px the held victim sits in front of the grabber
  holdMax: 130,     // ticks before the hold auto-breaks
  pummelDmg: 2.2, pummelCd: 16,
  mashPerInput: 5,  // escape progress per fresh victim input
  mashWiggle: 2,    // escape progress per big stick flick
  releaseStun: 16,  // victim's stun when they break free / are dropped
  throwLag: 8,      // grabber recovery after a throw
};
// universal throws (scaled like any other hit by victim weight/percent)
export const THROWS = {
  fthrow: { dmg: 8,  angle: 42,  bkb: 7,   kbg: 6.0 },
  bthrow: { dmg: 9,  angle: 42,  bkb: 8,   kbg: 6.5, back: true },
  uthrow: { dmg: 7,  angle: 88,  bkb: 7,   kbg: 7.0 },
  dthrow: { dmg: 6,  angle: 65,  bkb: 5,   kbg: 4.5 },
};

export const BODY_PUSH = {
  range: 34,         // horizontal distance under which grounded bodies push
  resolve: 0.5,      // fraction of the overlap resolved per tick
  speed: 3.5,        // max push per tick (split between the two)
};

export const TEETER_SPEED = 2.4;  // walking slower than this stops at the edge

// character passives & signature-mechanic tuning
export const PASSIVE = {
  STACKS_MAX: 5,        // volt: hits to charge a discharge
  STACK_BONUS: 4,       // bonus damage on discharge
  STACK_STUN: 26,       // paralyze ticks (no knockback) on discharge
  BURN_TICKS: 3,        // ember: damage-over-time tick count
  BURN_INTERVAL: 30,    // ticks between burn ticks
  BURN_DMG: 1,          // percent per burn tick
  FLOAT_TICKS: 55,      // nova: hover budget (hold jump in the air)
  SURF_MULT: 0.42,      // tide: fall-speed multiplier while holding jump
};

export const SHIELD_MAX = 60;
export const SHIELD_DRAIN = 0.22;       // per tick while held
export const SHIELD_REGEN = 0.10;       // per tick while not shielding
export const SHIELDBREAK_TICKS = 200;

export const HURT_RADIUS = 36;          // hurtbox circle radius (scaled per char)

export const PHASE = {
  COUNTDOWN: 0,
  PLAYING: 1,
  OVER: 2,
};

// Quantize analog stick so client/server agree exactly
export function quant(v) {
  return Math.round(Math.max(-1, Math.min(1, v)) * 32) / 32;
}
