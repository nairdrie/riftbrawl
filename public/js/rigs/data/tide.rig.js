// TIDE — The Wave Duelist, as a data rig. A lean fencer: tall plated limbs, a
// fin-crest helm, a flowing water-sash, a slim rapier. Bladed shoulder stance.
// Closest of the legends to the REED base.
export const tideSpec = {
  format: 'riftrig/1', id: 'tide', light: -1,
  depth: 0.5, idleSettle: 3,
  idlePose: { leadFoot: 9, rearFoot: -12, rearLift: 2, handX: 25, handY: 2, wrist: -0.4,
    backHandX: 2, backHandY: 10, leanAdd: 0.03, shoulderAngle: 0.14 },
  skel: { hipY: -44, shoulderY: -75, headY: -91, headR: 9.5, neck: 5, shoulderX: 9, hipW: 7,
    thigh: 21, shin: 20, upper: 15, fore: 13, stance: 12 },
  limb: { style: 'plated', arm: 8, leg: 9, color: 'primary', joints: 0, hand: 4.5, foot: 'shoe' },
  torso: { shape: 'spine', width: 9, color: 'secondary' },
  head: { shape: 'helm', color: 'primary', face: true, faceScale: 0.8, eyeColor: 'glow' },
  cloth: [{ anchor: 'hip', x: -6, n: 5, seg: 10, w0: 10, w1: 3, color: 'accent', windX: 40, grav: 140, damp: 0.86 }],
  weapon: { type: 'sword', length: 60, width: 4, color: 'trail', guard: 'primary', edge: 'glow', idle: 'rest' },
  images: {},
};
