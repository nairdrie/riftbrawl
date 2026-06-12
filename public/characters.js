// characters.js — the roster. Each kit is defined by verbs: a unique attack,
// a unique special, and stats that lean into the role. See docs/CHARACTER_DESIGN.md.
//
// Move fields:
//   clip/ts        animation clip and playback speed
//   dur            seconds until the character can act again
//   type           melee | bolt | whirlwind | smoke | block
//   active         [from, to] seconds — when a melee hitbox is live
//   range          melee reach in world units (in front of the character)
//   dmg            percent added per hit
//   baseKb/kbGrowth knockback = (baseKb + targetDamage * kbGrowth) / targetWeight
//   angle          launch angle in degrees

export const CHARACTERS = {
  bastion: {
    id: 'bastion',
    name: 'Bastion',
    role: 'The Bulwark',
    color: '#7aa2ff',
    file: 'assets/kaykit/Knight.glb',
    show: ['1H_Sword', 'Badge_Shield'],
    stats: { moveSpeed: 0.085, jumpVel: 0.26, weight: 1.25, runTS: 0.95 },
    moves: {
      attack: {
        name: 'Sword Slice', clip: '1H_Melee_Attack_Slice_Diagonal', ts: 1.25, dur: 0.75,
        type: 'melee', active: [0.25, 0.55], range: 1.5,
        dmg: 9, baseKb: 0.16, kbGrowth: 0.0022, angle: 38,
      },
      special: {
        name: 'Block / Shield Bash', type: 'block',
        bash: {
          name: 'Shield Bash', clip: 'Block_Attack', ts: 1.1, dur: 0.6,
          type: 'melee', active: [0.18, 0.45], range: 1.3, lunge: 0.05,
          dmg: 7, baseKb: 0.22, kbGrowth: 0.0018, angle: 30,
        },
      },
    },
    blurb: ['Hold special to block: no flinch, no knockback', 'Attack while blocking = Shield Bash'],
  },

  korga: {
    id: 'korga',
    name: 'Korga',
    role: 'The Avalanche',
    color: '#ff8a5c',
    file: 'assets/kaykit/Barbarian.glb',
    show: ['2H_Axe'],
    stats: { moveSpeed: 0.095, jumpVel: 0.28, weight: 1.15, runTS: 1.05 },
    rage: 0.004, // her knockback scales with her own damage taken
    moves: {
      attack: {
        name: 'Overhead Chop', clip: '2H_Melee_Attack_Chop', ts: 1.0, dur: 1.0,
        type: 'melee', active: [0.42, 0.72], range: 1.7,
        dmg: 14, baseKb: 0.2, kbGrowth: 0.003, angle: 42,
      },
      special: {
        name: 'Whirlwind', clip: '2H_Melee_Attack_Spinning', ts: 1.0, dur: 1.55,
        type: 'whirlwind', range: 1.5, tick: 0.22, travel: 0.045,
        dmg: 5, baseKb: 0.1, kbGrowth: 0.0012, angle: 30,
      },
    },
    blurb: ['Rage: damage taken powers up her knockback', 'Whirlwind travels forward, hitting repeatedly'],
  },

  elara: {
    id: 'elara',
    name: 'Elara',
    role: 'The Tempest',
    color: '#9b8cff',
    file: 'assets/kaykit/Mage.glb',
    show: ['2H_Staff'],
    stats: { moveSpeed: 0.09, jumpVel: 0.28, weight: 0.9, runTS: 1.0 },
    moves: {
      attack: {
        name: 'Arcane Bolt', clip: 'Spellcast_Shoot', ts: 1.3, dur: 0.7,
        type: 'bolt', castAt: 0.38, speed: 9, radius: 0.14, lifeS: 1.2,
        dmg: 6, baseKb: 0.12, kbGrowth: 0.0015, angle: 25,
      },
      special: {
        name: 'Tempest Blast', clip: 'Spellcast_Long', ts: 1.15, dur: 1.5,
        type: 'bolt', castAt: 1.0, speed: 7, radius: 0.3, lifeS: 1.8,
        dmg: 13, baseKb: 0.24, kbGrowth: 0.0028, angle: 40,
      },
    },
    blurb: ['Arcane Bolt pokes from across the stage', 'Tempest Blast: slow wind-up, huge launcher'],
  },

  whisper: {
    id: 'whisper',
    name: 'Whisper',
    role: 'The Phantom Blade',
    color: '#8be28b',
    file: 'assets/kaykit/Rogue_Hooded.glb',
    show: ['Knife', 'Knife_Offhand'],
    stats: { moveSpeed: 0.13, jumpVel: 0.32, weight: 0.8, runTS: 1.25 },
    moves: {
      attack: {
        name: 'Dagger Flurry', clip: 'Dualwield_Melee_Attack_Slice', ts: 1.45, dur: 0.45,
        type: 'melee', active: [0.12, 0.32], range: 1.1, backstab: 2,
        dmg: 5, baseKb: 0.08, kbGrowth: 0.0012, angle: 20,
      },
      special: {
        name: 'Smoke Bomb', clip: 'Throw', ts: 1.25, dur: 0.8,
        type: 'smoke', at: 0.4, ghost: 1.1,
      },
    },
    blurb: ['Fastest, with backstabs that hit double', 'Smoke Bomb: untouchable for a second'],
  },
};

// Clips that loop; everything else plays once and returns to locomotion.
export const LOOP_CLIPS = new Set(['Idle', 'Running_A', 'Jump_Idle', 'Blocking']);
