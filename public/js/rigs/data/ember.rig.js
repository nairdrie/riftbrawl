// EMBER — The Cinder Witch, as a data rig. A caster silhouette: wide bell-dress
// torso, a robe that trails, a peaked hat (helm), a pyre staff. Built from the
// vector kit; her fire patches/orbs render via the renderer/sim. Feet hidden
// under the dress.
export const emberSpec = {
  format: 'riftrig/1', id: 'ember', light: -1,
  depth: 0.55, idleSettle: 2,
  idlePose: { leadFoot: 6, rearFoot: -9, rearLift: 1, handX: 20, handY: 2, wrist: -1.3,
    backHandX: 8, backHandY: 16, leanAdd: 0.02, shoulderAngle: 0 },
  skel: { hipY: -40, shoulderY: -68, headY: -86, headR: 10, neck: 4, shoulderX: 9, hipW: 8,
    thigh: 15, shin: 15, upper: 13, fore: 12, stance: 11 },
  limb: { style: 'stick', arm: 7, leg: 7, color: 'secondary', joints: 0, hand: 4, foot: 'none' },
  torso: { shape: 'plate', width: 11, color: 'primary' },
  head: { shape: 'helm', color: 'secondary', face: true, faceScale: 0.78, eyeColor: 'accent' },
  cloth: [{ anchor: 'shoulder', x: -10, n: 6, seg: 12, w0: 24, w1: 30, color: 'primary', windX: 20, grav: 120, damp: 0.9 }],
  weapon: { type: 'staff', length: 58, width: 5, color: 'secondary', guard: 'accent', edge: 'glow', idle: 'rest' },
  images: {},
};
