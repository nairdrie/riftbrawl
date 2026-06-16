// VOLT — The Storm Dancer, as a data rig. Tiny, wiry, electric: thin stick limbs
// with a glowing accent core, a bolt-scarf, glowing eyes, a short storm dagger.
// Lightning FX render via the renderer/sim.
export const voltSpec = {
  format: 'riftrig/1', id: 'volt', light: -1,
  depth: 0.5, idleSettle: 3,
  idlePose: { leadFoot: 7, rearFoot: -9, rearLift: 2, handX: 14, handY: 18, wrist: 2.4,
    backHandX: 5, backHandY: 14, leanAdd: 0.05, shoulderAngle: -0.1 },
  skel: { hipY: -38, shoulderY: -64, headY: -80, headR: 10, neck: 3, shoulderX: 8, hipW: 6,
    thigh: 16, shin: 15.5, upper: 13, fore: 12, stance: 10 },
  limb: { style: 'stick', arm: 5.5, leg: 6.5, color: 'primary', coreColor: 'accent', joints: 2.2, hand: 3.6, foot: 'shoe' },
  torso: { shape: 'spine', width: 8, color: 'secondary' },
  head: { shape: 'disc', color: 'primary', face: true, faceScale: 0.85, eyeColor: 'accent' },
  cloth: [{ anchor: 'neck', x: -3, n: 5, seg: 8, w0: 8, w1: 2, color: 'accent', windX: 52, grav: 90, damp: 0.85 }],
  weapon: { type: 'dagger', length: 28, width: 5, color: 'accent', guard: 'secondary', edge: 'glow', idle: 'rest' },
  images: {},
};
