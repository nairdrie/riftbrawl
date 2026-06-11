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
  blastX: 1150,
  blastTop: -950,
  blastBottom: 720,
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
