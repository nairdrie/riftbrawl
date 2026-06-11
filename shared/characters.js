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
  aegis: {
    id: 'aegis', name: 'AEGIS', title: 'The Bastion',
    desc: 'A rune-forged colossus from the Iron Court. Every swing carries the weight of a falling citadel.',
    weight: 120, runSpeed: 4.3, airSpeed: 3.4, airAccel: 0.34,
    jumpVel: 14.6, djVel: 14.0, gravity: 0.66, fallSpeed: 11.5, fastFall: 17.5,
    friction: 0.82, scale: 1.18, hurtR: 42,
    colors: { primary: '#5b7fa6', secondary: '#2c3e58', accent: '#ffc857', glow: '#7fb2ff', trail: '#9cc4ff' },
    ui: { power: 10, speed: 3, recovery: 4, weightStat: 10 },
    moves: {
      jab:   { name: 'Gauntlet Strike', total: 26, hitboxes: [hb(7, 11, 52, -8, 30, 4.5, 70, 4.0, 3.0)] },
      ftilt: { name: 'Wardbreaker',     total: 38, hitboxes: [hb(13, 18, 64, -12, 38, 13, 32, 7.5, 15.5)] },
      utilt: { name: 'Skysplitter',     total: 40, hitboxes: [hb(12, 19, 8, -78, 42, 12, 88, 7.0, 14.5)] },
      dtilt: { name: 'Quake Sweep',     total: 36, hitboxes: [hb(12, 17, 58, 26, 36, 10, 30, 6.5, 12.0)] },
      nair:  { name: 'Iron Orbit',      total: 38, hitboxes: [hb(8, 24, 0, 0, 56, 11, 45, 6.0, 10.5)] },
      fair:  { name: 'Citadel Cleave',  total: 42, hitboxes: [hb(16, 21, 60, -6, 44, 15, 38, 8.0, 16.0)] },
      bair:  { name: 'Rampart Kick',    total: 36, hitboxes: [hb(12, 17, -58, -4, 40, 14, 33, 8.0, 15.0)] },
      uair:  { name: 'Halo Crusher',    total: 36, hitboxes: [hb(11, 17, 4, -64, 44, 12, 86, 7.0, 14.0)] },
      dair:  { name: 'Meteor Greave',   total: 44, hitboxes: [hb(17, 23, 0, 60, 40, 14, -78, 7.5, 13.5)] },
    },
    specials: {
      nb: { name: 'Rune Hammer', type: 'projectile', total: 44, fire: 18,
            speed: 8.5, vy0: -5.0, grav: 0.34, r: 22, dmg: 12, angle: 42, bkb: 7, kbg: 11, life: 90 },
      sb: { name: 'Bulwark Charge', type: 'dash', total: 46, from: 12, to: 30,
            speed: 11, dx: 34, dy: -4, r: 44, dmg: 13, angle: 36, bkb: 8, kbg: 13 },
      ub: { name: 'Ascendant Pillar', type: 'recovery', total: 56, from: 8, to: 26,
            vy: -17.5, drift: 2.6, dx: 0, dy: -30, r: 46, dmg: 12, angle: 84, bkb: 7.5, kbg: 11 },
      db: { name: 'Seismic Verdict', type: 'burst', total: 58, from: 22, to: 28,
            r: 95, dmg: 17, angle: 78, bkb: 9.5, kbg: 17 },
    },
  },

  // ── VOLT — The Storm Dancer ─────────────────────────────────────────────
  // A lightning-bonded duelist. Blinding speed, featherweight, endless combos.
  volt: {
    id: 'volt', name: 'VOLT', title: 'The Storm Dancer',
    desc: 'Struck by the Everstorm and never slowed down since. Hits like rain — constant, everywhere, electric.',
    weight: 80, runSpeed: 7.6, airSpeed: 5.6, airAccel: 0.62,
    jumpVel: 15.4, djVel: 14.6, gravity: 0.70, fallSpeed: 12.5, fastFall: 19.5,
    friction: 0.86, scale: 0.92, hurtR: 33,
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
      sb: { name: 'Storm Blink', type: 'dash', total: 30, from: 6, to: 19,
            speed: 17, dx: 22, dy: -2, r: 32, dmg: 8, angle: 42, bkb: 5, kbg: 9 },
      ub: { name: 'Sky Fracture', type: 'recovery', total: 44, from: 5, to: 20,
            vy: -19.5, drift: 4.6, dx: 0, dy: -24, r: 34, dmg: 7, angle: 80, bkb: 5, kbg: 8 },
      db: { name: 'Overload Nova', type: 'burst', total: 40, from: 13, to: 18,
            r: 70, dmg: 10, angle: 70, bkb: 6, kbg: 11 },
    },
  },

  // ── EMBER — The Cinder Witch ────────────────────────────────────────────
  // Pyromancer exiled for burning the academy down. Controls space with fire.
  ember: {
    id: 'ember', name: 'EMBER', title: 'The Cinder Witch',
    desc: 'They expelled her for one little inferno. Now the arena is her classroom, and the lesson is fire.',
    weight: 88, runSpeed: 5.1, airSpeed: 4.4, airAccel: 0.44,
    jumpVel: 14.8, djVel: 14.4, gravity: 0.56, fallSpeed: 10.0, fastFall: 16.0,
    friction: 0.84, scale: 1.0, hurtR: 35,
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
      nb: { name: 'Wildfire Orb', type: 'projectile', total: 38, fire: 15,
            speed: 9.5, vy0: -1.2, grav: 0.06, r: 20, dmg: 10, angle: 38, bkb: 5.5, kbg: 9, life: 80 },
      sb: { name: 'Flare Rush', type: 'dash', total: 38, from: 9, to: 24,
            speed: 13, dx: 26, dy: -2, r: 36, dmg: 10, angle: 40, bkb: 6, kbg: 11 },
      ub: { name: 'Phoenix Spiral', type: 'recovery', total: 50, from: 6, to: 24,
            vy: -18.0, drift: 3.6, dx: 0, dy: -26, r: 38, dmg: 9, angle: 82, bkb: 6, kbg: 10 },
      db: { name: 'Cataclysm Ring', type: 'burst', total: 50, from: 18, to: 24,
            r: 85, dmg: 13, angle: 74, bkb: 7.5, kbg: 14 },
    },
  },

  // ── TIDE — The Wave Duelist ─────────────────────────────────────────────
  // Fencer of the Drowned Order. Honest, balanced, deadly at every range.
  tide: {
    id: 'tide', name: 'TIDE', title: 'The Wave Duelist',
    desc: 'Last blade of the Drowned Order. Fights like water: patient, fluid, and impossible to hold back.',
    weight: 97, runSpeed: 6.1, airSpeed: 4.9, airAccel: 0.50,
    jumpVel: 15.2, djVel: 14.6, gravity: 0.62, fallSpeed: 11.0, fastFall: 17.5,
    friction: 0.85, scale: 1.0, hurtR: 35,
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
      nb: { name: 'Pressure Lance', type: 'projectile', total: 30, fire: 11,
            speed: 12.5, vy0: 0, grav: 0, r: 15, dmg: 7, angle: 24, bkb: 4.2, kbg: 6.5, life: 60 },
      sb: { name: 'Current Step', type: 'dash', total: 33, from: 7, to: 21,
            speed: 14.5, dx: 24, dy: -2, r: 34, dmg: 9, angle: 41, bkb: 5.4, kbg: 10 },
      ub: { name: 'Maelstrom Rise', type: 'recovery', total: 46, from: 5, to: 22,
            vy: -19.0, drift: 4.2, dx: 0, dy: -25, r: 36, dmg: 8, angle: 81, bkb: 5.4, kbg: 9 },
      db: { name: 'Whirlpool Guard', type: 'burst', total: 44, from: 14, to: 20,
            r: 76, dmg: 11, angle: 72, bkb: 6.5, kbg: 12 },
    },
  },

  // ── NOVA — The Void Sentinel ────────────────────────────────────────────
  // A star given armor and a grudge. Floaty drift, huge cosmic hits.
  nova: {
    id: 'nova', name: 'NOVA', title: 'The Void Sentinel',
    desc: 'Forged from the heart of a dying star. Gravity is a suggestion; the void always collects its due.',
    weight: 105, runSpeed: 4.9, airSpeed: 5.2, airAccel: 0.40,
    jumpVel: 14.2, djVel: 14.8, gravity: 0.42, fallSpeed: 8.4, fastFall: 14.5,
    friction: 0.83, scale: 1.08, hurtR: 38,
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
      nb: { name: 'Star Shard', type: 'projectile', total: 36, fire: 14,
            speed: 7.5, vy0: -0.6, grav: 0.02, r: 18, dmg: 9, angle: 45, bkb: 5, kbg: 8.5, life: 110 },
      sb: { name: 'Gravity Slide', type: 'dash', total: 40, from: 10, to: 26,
            speed: 12, dx: 28, dy: -3, r: 40, dmg: 11, angle: 38, bkb: 6.4, kbg: 12 },
      ub: { name: 'Supernova Climb', type: 'recovery', total: 52, from: 6, to: 26,
            vy: -17.0, drift: 5.0, dx: 0, dy: -28, r: 42, dmg: 10, angle: 83, bkb: 6.4, kbg: 11 },
      db: { name: 'Black Halo', type: 'burst', total: 52, from: 19, to: 26,
            r: 90, dmg: 14, angle: 76, bkb: 8, kbg: 15 },
    },
  },
};

export const CHARACTER_LIST = ['aegis', 'volt', 'ember', 'tide', 'nova'];
