// ─────────────────────────────────────────────────────────────────────────────
// REED — "The Blank Slate". The reference DATA RIG: a clean, fully-rigged stick
// fencer described as pure data (no draw code lives here). The shared runtime in
// runtime.js animates this spec across every state — idle, run, jump, all tilts/
// aerials/specials, ledge, dizzy — exactly like a built-in legend.
//
// This file is also the working example for RIG_FORMAT.md: copy template.rig.js,
// fill in your design's proportions + parts, register it, done. Every field
// below is plain JSON-able data so a rig can ship as a .json import.
//
// Units: feet at (0,0), +x = facing direction, y negative = up. Keep the head
// near y ≈ -(2·|hipY|) and the body height ≈ the hurtbox so hits land true.
// ─────────────────────────────────────────────────────────────────────────────

export const reedSpec = {
  format: 'riftrig/1',
  id: 'reed',

  // which side the key light favors on plated parts (-1 = front edge lit)
  light: -1,

  // ── side-view stance (authored in /dev/tuner.html, then pasted here) ───────
  // depth: 1 = full front-on width, 0 = razor profile. idlePose units are local
  // (front hand/foot lead +x). Tweak live in the tuner; these are the baked nums.
  depth: 0.55,
  idleSettle: 3,
  idlePose: {
    leadFoot: 8, rearFoot: -11, rearLift: 1.5,    // staggered feet
    handX: 24, handY: 5, wrist: -0.5,             // sword hand + blade angle
    backHandX: 3, backHandY: 13, leanAdd: 0,      // off hand + forward lean
  },

  // ── skeleton: proportions the runtime poses every frame ───────────────────
  skel: {
    hipY: -42,        // pelvis height above the feet
    shoulderY: -72,   // shoulder line
    headY: -88,       // head center
    headR: 11,        // head radius
    neck: 5,          // neck stub length
    shoulderX: 9,     // half shoulder width (arm roots sit here)
    hipW: 7,          // half hip width (leg roots)
    thigh: 22, shin: 22,   // leg bone lengths (two-bone IK)
    upper: 18, fore: 17,   // arm bone lengths
    stance: 12,       // half distance between the feet at rest
  },

  // ── limbs: the "stick" look — inked strokes with rounded joints ───────────
  limb: {
    style: 'stick',   // 'stick' | 'plated'
    arm: 7,           // arm stroke width
    leg: 8,           // leg stroke width
    color: 'primary', // chalk-white limbs read bright on the dark arena
    coreColor: null,  // optional brighter core stripe
    joints: 2.6,      // knee/elbow dot radius (0 = none)
    hand: 4.2,        // hand radius
    foot: 'shoe',     // 'shoe' | 'dot' | 'none'
  },

  // ── body + head ───────────────────────────────────────────────────────────
  torso: { shape: 'spine', width: 9, color: 'secondary' },
  head:  { shape: 'disc', color: 'primary', face: true, faceScale: 0.82 },

  // ── no cloth on the blank slate (it's the canvas) ─────────────────────────
  cloth: [],

  // ── weapon held in the front hand ─────────────────────────────────────────
  weapon: {
    type: 'sword',
    length: 56,        // blade length from the grip
    grip: 9,           // handle behind the grip point
    width: 6,          // blade base width
    color: '#cdd8ec',  // steel
    guard: 'accent',   // gold crossguard + pommel
    edge: 'glow',      // lit edge / glow color
    twoHand: false,
    idle: 'rest',      // low-ready carry when standing
  },

  // ── projectile look for the neutral-B "Blade Beam" ────────────────────────
  projectile: { shape: 'slash' },
};
