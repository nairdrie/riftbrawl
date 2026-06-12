// ─────────────────────────────────────────────────────────────────────────────
// SMASH — character definitions. Pure data: stats, movesets, specials, looks.
//
// Move hitbox fields:
//   from/to : active frame window (inclusive, 0-indexed from move start)
//   dx/dy   : offset from player center (dx is flipped by facing)
//   r       : hitbox radius
//   dmg     : percent dealt
//   angle   : launch angle in degrees — 0 = horizontal away, 90 = straight up
//   bkb/kbg : base knockback / knockback growth
// ─────────────────────────────────────────────────────────────────────────────

function hb(from, to, dx, dy, r, dmg, angle, bkb, kbg) {
  return { from, to, dx, dy, r, dmg, angle, bkb, kbg };
}

export const CHARACTERS = {
  // ── AEGIS — The Bastion ─────────────────────────────────────────────────
  // Colossal vanguard in rune-forged plate. Slow, devastating, hard to kill.
  // Identity: the armored monument — trades hits through rune armor, punishes
  // with a counter stance, and forces jumps with a crawling ground quake.
  aegis: {
    id: 'aegis', name: 'AEGIS', title: 'The Bastion',
    desc: 'A rune-forged colossus from the Iron Court. His plate does not flinch, and his verdict answers every blow.',
    weight: 120, runSpeed: 4.3, airSpeed: 3.4, airAccel: 0.34,
    jumpVel: 14.6, djVel: 14.0, gravity: 0.66, fallSpeed: 11.5, fastFall: 17.5,
    friction: 0.82, scale: 1.18, hurtR: 42,
    colors: { primary: '#5b7fa6', secondary: '#2c3e58', accent: '#ffc857', glow: '#7fb2ff', trail: '#9cc4ff' },
    ui: { power: 10, speed: 3, recovery: 4, weightStat: 10 },
    moves: {
      jab:   { name: 'Gauntlet Strike', total: 26, hitboxes: [hb(7, 11, 52, -8, 30, 4.5, 70, 4.0, 3.0)] },
      ftilt: { name: 'Wardbreaker',     total: 38, armor: { from: 10, to: 20, thresh: 7 },
               hitboxes: [hb(13, 18, 64, -12, 38, 13, 32, 7.5, 15.5)] },
      utilt: { name: 'Skysplitter',     total: 40, armor: { from: 9, to: 21, thresh: 7 },
               hitboxes: [hb(12, 19, 8, -78, 42, 12, 88, 7.0, 14.5)] },
      dtilt: { name: 'Quake Sweep',     total: 36, armor: { from: 9, to: 19, thresh: 7 },
               hitboxes: [hb(12, 17, 58, 26, 36, 10, 30, 6.5, 12.0)] },
      nair:  { name: 'Iron Orbit',      total: 38, hitboxes: [hb(8, 24, 0, 0, 56, 11, 45, 6.0, 10.5)] },
      fair:  { name: 'Citadel Cleave',  total: 42, hitboxes: [hb(16, 21, 60, -6, 44, 15, 38, 8.0, 16.0)] },
      bair:  { name: 'Rampart Kick',    total: 36, hitboxes: [hb(12, 17, -58, -4, 40, 14, 33, 8.0, 15.0)] },
      uair:  { name: 'Halo Crusher',    total: 36, hitboxes: [hb(11, 17, 4, -64, 44, 12, 86, 7.0, 14.0)] },
      dair:  { name: 'Meteor Greave',   total: 44, hitboxes: [hb(17, 23, 0, 60, 40, 14, -78, 7.5, 13.5)] },
    },
    specials: {
      // ground-crawling shockwave — hugs the floor, dies at the edge
      nb: { name: 'Quake Line', type: 'quake', total: 46, fire: 20,
            speed: 7.5, r: 26, dmg: 11, angle: 80, bkb: 6.5, kbg: 10, life: 999 },
      // armored shoulder rush — weak hits don't stop him
      sb: { name: 'Bulwark Charge', type: 'dash', total: 46, from: 12, to: 30,
            armor: { from: 12, to: 30, thresh: 8 },
            speed: 11, dx: 34, dy: -4, r: 44, dmg: 13, angle: 36, bkb: 8, kbg: 13 },
      ub: { name: 'Ascendant Pillar', type: 'recovery', total: 56, from: 8, to: 26,
            vy: -17.5, drift: 2.6, dx: 0, dy: -30, r: 46, dmg: 12, angle: 84, bkb: 7.5, kbg: 11 },
      // counter stance — block a hit during the window, return it harder
      db: { name: 'Verdict Counter', type: 'counter', total: 52, from: 6, to: 32,
            mult: 1.3, minDmg: 8, angle: 42, bkb: 8, kbg: 13 },
    },
  },

  // ── VOLT — The Storm Dancer ─────────────────────────────────────────────
  // A lightning-bonded duelist. Blinding speed, featherweight, endless combos.
  // Identity: the combo battery — hits build static stacks that discharge
  // into a paralyzing burst; teleports instead of dashing; two air jumps.
  volt: {
    id: 'volt', name: 'VOLT', title: 'The Storm Dancer',
    desc: 'Struck by the Everstorm and never slowed down since. Every hit charges the storm — the fifth sets it loose.',
    weight: 80, runSpeed: 7.6, airSpeed: 5.6, airAccel: 0.62,
    jumpVel: 15.4, djVel: 14.6, gravity: 0.70, fallSpeed: 12.5, fastFall: 19.5,
    friction: 0.86, scale: 0.92, hurtR: 33,
    passive: 'stacks', airJumps: 2,
    colors: { primary: '#ffd23f', secondary: '#22304a', accent: '#3df2ff', glow: '#ffe97a', trail: '#7af7ff' },
    ui: { power: 4, speed: 10, recovery: 7, weightStat: 3 },
    moves: {
      jab:   { name: 'Spark Jab',      total: 14, hitboxes: [hb(3, 5, 44, -6, 24, 2.5, 72, 3.2, 2.2)] },
      ftilt: { name: 'Arc Lash',       total: 22, hitboxes: [hb(6, 9, 52, -8, 28, 8, 34, 5.0, 10.0)] },
      utilt: { name: 'Static Flip',    total: 24, hitboxes: [hb(5, 10, 2, -58, 32, 7, 88, 4.6, 9.5)] },
      dtilt: { name: 'Ground Current', total: 20, hitboxes: [hb(5, 8, 48, 24, 26, 6.5, 76, 4.2, 8.0)] },
      nair:  { name: 'Ion Wheel',      total: 26, hitboxes: [hb(4, 18, 0, 0, 42, 7.5, 46, 4.4, 8.0)] },
      fair:  { name: 'Tempest Cut',    total: 26, hitboxes: [hb(7, 11, 48, -4, 32, 9, 40, 5.2, 11.5)] },
      bair:  { name: 'Recoil Spark',   total: 24, hitboxes: [hb(6, 10, -46, -4, 30, 9.5, 35, 5.4, 12.0)] },
      uair:  { name: 'Sky Circuit',    total: 24, hitboxes: [hb(5, 10, 2, -50, 34, 8, 85, 4.8, 11.0)] },
      dair:  { name: 'Thunder Drop',   total: 30, hitboxes: [hb(9, 14, 0, 50, 30, 9, -75, 4.5, 9.5)] },
    },
    specials: {
      nb: { name: 'Bolt Caster', type: 'projectile', total: 26, fire: 9,
            speed: 16, vy0: 0, grav: 0, r: 13, dmg: 5.5, angle: 18, bkb: 3.4, kbg: 4.5, life: 46 },
      // true teleport — vanish, reappear ahead, zap anyone in the path
      sb: { name: 'Storm Blink', type: 'teleport', total: 30, warp: 10,
            dist: 195, iframes: 16, r: 36, dmg: 7, angle: 38, bkb: 5, kbg: 8 },
      // angle-able zip — travels in the held stick direction
      ub: { name: 'Sky Fracture', type: 'zip', total: 42, from: 6, to: 17,
            speed: 20, dx: 0, dy: -10, r: 30, dmg: 6, angle: 70, bkb: 4.5, kbg: 7 },
      db: { name: 'Overload Nova', type: 'burst', total: 40, from: 13, to: 18,
            r: 70, dmg: 10, angle: 70, bkb: 6, kbg: 11 },
    },
  },

  // ── EMBER — The Cinder Witch ────────────────────────────────────────────
  // Pyromancer exiled for burning the academy down. Controls space with fire.
  // Identity: the arsonist zoner — every hit burns over time; her orb leaves
  // fire patches, her glyph traps erupt, and she retreats behind fire walls.
  ember: {
    id: 'ember', name: 'EMBER', title: 'The Cinder Witch',
    desc: 'They expelled her for one little inferno. Her fire lingers — on the ground, and under your skin.',
    weight: 88, runSpeed: 5.1, airSpeed: 4.4, airAccel: 0.44,
    jumpVel: 14.8, djVel: 14.4, gravity: 0.56, fallSpeed: 10.0, fastFall: 16.0,
    friction: 0.84, scale: 1.0, hurtR: 35,
    passive: 'burn',
    colors: { primary: '#e84a3f', secondary: '#3c1d33', accent: '#ff9a3d', glow: '#ff6b4a', trail: '#ffb36b' },
    ui: { power: 7, speed: 5, recovery: 6, weightStat: 4 },
    moves: {
      jab:   { name: 'Cinder Flick',   total: 20, hitboxes: [hb(5, 8, 46, -8, 27, 3.5, 70, 3.6, 2.6)] },
      ftilt: { name: 'Flame Whip',     total: 30, hitboxes: [hb(10, 15, 62, -10, 34, 10.5, 35, 6.0, 12.5)] },
      utilt: { name: 'Pyre Bloom',     total: 32, hitboxes: [hb(9, 16, 4, -64, 38, 9.5, 87, 5.6, 12.0)] },
      dtilt: { name: 'Ash Sweep',      total: 26, hitboxes: [hb(8, 12, 52, 25, 30, 8, 74, 5.0, 10.0)] },
      nair:  { name: 'Halo of Coals',  total: 32, hitboxes: [hb(6, 22, 0, 0, 46, 9, 45, 5.2, 9.0)] },
      fair:  { name: 'Kindle Cross',   total: 32, hitboxes: [hb(11, 16, 52, -6, 36, 11.5, 39, 6.2, 13.5)] },
      bair:  { name: 'Backdraft',      total: 30, hitboxes: [hb(9, 13, -50, -6, 34, 11, 34, 6.2, 13.0)] },
      uair:  { name: 'Solar Crown',    total: 30, hitboxes: [hb(8, 14, 2, -56, 38, 10, 86, 5.6, 12.0)] },
      dair:  { name: 'Comet Heel',     total: 36, hitboxes: [hb(13, 18, 0, 54, 34, 11, -78, 5.8, 11.0)] },
    },
    specials: {
      // chargeable orb that leaves a burning patch where it lands
      nb: { name: 'Wildfire Orb', type: 'projectile', total: 38, fire: 15,
            speed: 9.5, vy0: -1.2, grav: 0.06, r: 20, dmg: 10, angle: 38, bkb: 5.5, kbg: 9, life: 80,
            patch: { life: 175, r: 32, dmg: 2.5, angle: 80, bkb: 2.6, kbg: 2, cd: 26 } },
      // retreating hop that leaves a fire wall where she stood
      sb: { name: 'Flare Step', type: 'hopback', total: 36, from: 6, to: 20,
            speed: 8.5, hop: 10.5,
            patch: { life: 110, r: 26, dmg: 3, angle: 82, bkb: 3.2, kbg: 3, cd: 24 } },
      ub: { name: 'Phoenix Spiral', type: 'recovery', total: 50, from: 6, to: 24,
            vy: -18.0, drift: 3.6, dx: 0, dy: -26, r: 38, dmg: 9, angle: 82, bkb: 6, kbg: 10 },
      // plant a glyph that erupts when an enemy steps on it (one at a time)
      db: { name: 'Geyser Trap', type: 'trap', total: 46, plant: 20,
            r: 46, dmg: 13, angle: 84, bkb: 8, kbg: 13, life: 600 },
    },
  },

  // ── TIDE — The Wave Duelist ─────────────────────────────────────────────
  // Fencer of the Drowned Order. Honest, balanced, deadly at every range.
  // Identity: the fencer with answers — boomerang lance, a dash that passes
  // through opponents, a guard that reflects projectiles, and a slow-fall surf.
  tide: {
    id: 'tide', name: 'TIDE', title: 'The Wave Duelist',
    desc: 'Last blade of the Drowned Order. Throw anything at him — the tide returns it with interest.',
    weight: 97, runSpeed: 6.1, airSpeed: 4.9, airAccel: 0.50,
    jumpVel: 15.2, djVel: 14.6, gravity: 0.62, fallSpeed: 11.0, fastFall: 17.5,
    friction: 0.85, scale: 1.0, hurtR: 35,
    surf: true,
    colors: { primary: '#2ec9b8', secondary: '#173a4d', accent: '#bff7ff', glow: '#54e0d0', trail: '#9ef2e8' },
    ui: { power: 6, speed: 7, recovery: 8, weightStat: 6 },
    moves: {
      jab:   { name: 'Riptide Poke',   total: 17, hitboxes: [hb(4, 6, 50, -7, 26, 3, 71, 3.4, 2.4)] },
      ftilt: { name: 'Crescent Cut',   total: 26, hitboxes: [hb(8, 12, 58, -9, 32, 9.5, 33, 5.6, 11.5)] },
      utilt: { name: 'Geyser Arc',     total: 27, hitboxes: [hb(7, 13, 3, -60, 35, 8.5, 88, 5.2, 11.0)] },
      dtilt: { name: 'Undertow',       total: 23, hitboxes: [hb(6, 10, 50, 24, 28, 7.5, 30, 4.8, 9.5)] },
      nair:  { name: 'Tidal Ring',     total: 29, hitboxes: [hb(5, 20, 0, 0, 44, 8, 46, 4.8, 8.5)] },
      fair:  { name: 'Breaker Slash',  total: 29, hitboxes: [hb(9, 13, 50, -5, 34, 10, 41, 5.6, 12.5)] },
      bair:  { name: 'Stern Lance',    total: 27, hitboxes: [hb(8, 12, -48, -5, 32, 10.5, 34, 5.8, 12.5)] },
      uair:  { name: 'Crest Flip',     total: 27, hitboxes: [hb(7, 12, 2, -52, 36, 9, 85, 5.2, 11.5)] },
      dair:  { name: 'Abyssal Point',  total: 33, hitboxes: [hb(11, 16, 0, 52, 32, 10, -80, 5.2, 10.5)] },
    },
    specials: {
      // boomerang lance — flies out, returns to his hand; hits both ways
      nb: { name: 'Pressure Lance', type: 'boom', total: 30, fire: 11,
            speed: 13, decel: 0.42, r: 15, dmg: 6.5, angle: 30, bkb: 4, kbg: 6, life: 240 },
      // ghost dash — passes through opponents, brief intangibility, no hitbox
      sb: { name: 'Current Step', type: 'dash', total: 33, from: 7, to: 21, ghost: true,
            speed: 15.5, dx: 24, dy: -2, r: 34, dmg: 0, angle: 41, bkb: 0, kbg: 0 },
      ub: { name: 'Maelstrom Rise', type: 'recovery', total: 46, from: 5, to: 22,
            vy: -19.0, drift: 4.2, dx: 0, dy: -25, r: 36, dmg: 8, angle: 81, bkb: 5.4, kbg: 9 },
      // spinning guard — hits close, reflects projectiles for most of the move
      db: { name: 'Whirlpool Guard', type: 'burst', total: 44, from: 14, to: 20,
            reflect: { from: 4, to: 36 },
            r: 76, dmg: 11, angle: 72, bkb: 6.5, kbg: 12 },
    },
  },

  // ── NOVA — The Void Sentinel ────────────────────────────────────────────
  // A star given armor and a grudge. Floaty drift, huge cosmic hits.
  // Identity: the gravity mage — shards orbit her as a moving shield, her
  // black hole pulls before it detonates, and she hovers when holding jump.
  nova: {
    id: 'nova', name: 'NOVA', title: 'The Void Sentinel',
    desc: 'Forged from the heart of a dying star. Gravity is a suggestion — for her. For you, it is a verdict.',
    weight: 105, runSpeed: 4.9, airSpeed: 5.2, airAccel: 0.40,
    jumpVel: 14.2, djVel: 14.8, gravity: 0.42, fallSpeed: 8.4, fastFall: 14.5,
    friction: 0.83, scale: 1.08, hurtR: 38,
    float: true,
    colors: { primary: '#9b6bff', secondary: '#241a45', accent: '#ff5fd2', glow: '#b78aff', trail: '#e0a8ff' },
    ui: { power: 8, speed: 4, recovery: 9, weightStat: 7 },
    moves: {
      jab:   { name: 'Pulse Tap',      total: 22, hitboxes: [hb(6, 9, 48, -8, 29, 4, 70, 3.8, 2.8)] },
      ftilt: { name: 'Event Horizon',  total: 33, hitboxes: [hb(11, 16, 60, -10, 37, 11.5, 34, 6.6, 13.5)] },
      utilt: { name: 'Zenith Flare',   total: 34, hitboxes: [hb(10, 17, 5, -68, 40, 10.5, 88, 6.2, 13.0)] },
      dtilt: { name: 'Singularity Low',total: 29, hitboxes: [hb(9, 13, 54, 25, 32, 9, 32, 5.6, 10.5)] },
      nair:  { name: 'Orbit Field',    total: 34, hitboxes: [hb(7, 24, 0, 0, 50, 9.5, 45, 5.6, 9.5)] },
      fair:  { name: 'Quasar Palm',    total: 35, hitboxes: [hb(12, 17, 54, -6, 40, 12.5, 40, 6.8, 14.5)] },
      bair:  { name: 'Dark Ellipse',   total: 32, hitboxes: [hb(10, 15, -52, -5, 38, 12, 34, 6.8, 14.0)] },
      uair:  { name: 'Corona Sweep',   total: 31, hitboxes: [hb(9, 15, 3, -60, 42, 11, 86, 6.2, 13.5)] },
      dair:  { name: 'Collapse Strike',total: 38, hitboxes: [hb(14, 20, 0, 56, 36, 12, -79, 6.4, 12.0)] },
    },
    specials: {
      // shards orbit her (up to 3) as a moving shield; at 3, pressing again
      // launches the oldest one forward
      nb: { name: 'Star Shard', type: 'orbit', total: 26, fire: 10,
            orbitR: 56, r: 13, dmg: 5, angle: 45, bkb: 4, kbg: 6.5,
            launchSpeed: 13.5, launchDmg: 9.5, launchBkb: 5.5, launchKbg: 9, launchLife: 70 },
      sb: { name: 'Gravity Slide', type: 'dash', total: 40, from: 10, to: 26,
            speed: 12, dx: 28, dy: -3, r: 40, dmg: 11, angle: 38, bkb: 6.4, kbg: 12 },
      ub: { name: 'Supernova Climb', type: 'recovery', total: 52, from: 6, to: 26,
            vy: -17.0, drift: 5.0, dx: 0, dy: -28, r: 42, dmg: 10, angle: 83, bkb: 6.4, kbg: 11 },
      // an actual black hole: pulls enemies in during the window, then detonates
      db: { name: 'Black Halo', type: 'pull', total: 56, from: 14, to: 30,
            pullR: 150, pullAccel: 1.05, dx: 0, dy: 0,
            r: 84, dmg: 13, angle: 76, bkb: 7.5, kbg: 14 },
    },
  },
};

export const CHARACTER_LIST = ['aegis', 'volt', 'ember', 'tide', 'nova'];
