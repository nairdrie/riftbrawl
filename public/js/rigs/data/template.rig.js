// ─────────────────────────────────────────────────────────────────────────────
// RIG SPEC TEMPLATE — copy this file to <yourchar>.rig.js and fill it in.
//
// This is PURE DATA (every value is JSON-serialisable, so a rig can ship as a
// .json file and be imported at runtime). The shared engine in runtime.js turns
// it into a fully animated fighter — you describe how the character LOOKS; the
// engine handles how it MOVES (idle/run/jump/attacks/specials/cloth) for free.
//
// Workflow:
//   1. Open /dev/rig.html — the RIG MAP. It shows the rest skeleton with every
//      socket + proportion labelled, on a measured grid. Draw your design over
//      that grid (or hand the screenshot to Claude and say "rig this").
//   2. Translate your drawing into the fields below (proportions, limb/torso/
//      head look, weapon, projectile). Tweak numbers, reload /dev/rig.html.
//   3. Register it (see RIG_FORMAT.md → "Adding a character"): add stats +
//      moveset to shared/characters.js, add to CHARACTER_LIST, and wire the rig
//      in public/js/fighters.js with buildDataRig(yourSpec).
//
// Units: feet at (0,0), +x = facing direction, y negative = up. Keep the head
// near y ≈ 2·hipY and the body height ≈ the character's hurtR so hits land true.
// Every field has a sane default — a spec with only `colors` (in characters.js)
// and an empty {} here still draws a valid figure.
// ─────────────────────────────────────────────────────────────────────────────

export const templateSpec = {
  format: 'riftrig/1',
  id: 'CHANGEME',           // must match the key you add to CHARACTERS

  light: -1,                // key-light side for plated parts: -1 lit on +x edge

  // ── side-view stance — author these in /dev/tuner.html, then paste here ───
  // This is a profile fighter, not a figure facing the camera. `depth` scales
  // the frontal hip/shoulder width (1 = front-on, ~0.55 = a confident 3/4).
  depth: 0.55,
  idleSettle: 3,            // how far the hips sink into an athletic guard
  idlePose: {               // the resting stance + weapon hold (local units, +x = front)
    leadFoot: 8, rearFoot: -11, rearLift: 1.5,
    handX: 24, handY: 5, wrist: -0.5,
    backHandX: 3, backHandY: 13, leanAdd: 0,
  },

  // ── skeleton: the proportions the engine poses every frame ────────────────
  skel: {
    hipY: -42,              // pelvis height above the feet
    shoulderY: -72,         // shoulder line
    headY: -88,             // head center
    headR: 11,              // head radius
    neck: 5,                // neck stub length (shoulder → head)
    shoulderX: 9,           // half shoulder width (arm roots)
    hipW: 7,                // half hip width (leg roots)
    thigh: 22, shin: 22,    // leg bone lengths (two-bone IK)
    upper: 18, fore: 17,    // arm bone lengths
    stance: 12,             // half distance between the feet at rest
  },

  // ── limbs ──────────────────────────────────────────────────────────────────
  limb: {
    style: 'stick',         // 'stick' (inked strokes) | 'plated' (forged armor)
    arm: 7,                 // arm stroke width
    leg: 8,                 // leg stroke width
    color: 'primary',       // palette key (primary/secondary/accent/glow/trail) or #hex
    coreColor: null,        // optional brighter core stripe down the limb, or null
    joints: 2.6,            // knee/elbow dot radius (0 = none)
    hand: 4.2,              // hand radius
    foot: 'shoe',           // 'shoe' | 'dot' | 'none'
  },

  // ── body + head ──────────────────────────────────────────────────────────
  torso: {
    shape: 'spine',         // 'spine' (tapered trunk) | 'capsule' | 'plate'
    width: 9,
    color: 'secondary',
  },
  head: {
    shape: 'disc',          // 'disc' | 'helm'
    color: 'primary',
    outline: true,
    face: true,             // draw eyes (idle/attack/pain/dizzy expressions)
    faceScale: 0.82,
    eyeColor: null,         // override eye color, or null = ink
  },

  // ── cloth (optional secondary motion) — capes, scarves, sashes ────────────
  // Each entry is a verlet ribbon hanging from a socket. Leave [] for none.
  cloth: [
    // { anchor: 'neck', x: -2, n: 5, seg: 11, w0: 8, w1: 3,
    //   color: 'accent', windX: 30, grav: 200, damp: 0.87 },
  ],

  // ── weapon held in the front hand ─────────────────────────────────────────
  weapon: {
    type: 'sword',          // 'sword' | 'staff' | 'none'
    length: 56,             // reach from the grip
    grip: 9,                // handle behind the grip point
    width: 6,               // blade base width
    color: '#cdd8ec',       // blade fill
    guard: 'accent',        // crossguard + pommel color
    edge: 'glow',           // lit edge / glow color
    twoHand: false,         // both hands on the weapon during swings
    idle: 'rest',           // standing carry: 'rest' | 'shoulder' | 'down'
  },

  // ── projectile look for neutral-B shots (optional) ────────────────────────
  // omit to use the engine's default energy bolt (tinted by your colors).
  projectile: { shape: 'slash' },   // 'slash' (crescent) — extend in runtime.js
};
