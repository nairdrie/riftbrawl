// AEGIS — The Bastion, as a data rig. A plated colossus: small helm sunk between
// broad shoulders, deep breastplate, heavy cape, two-handed warhammer. Colors +
// moveset live in characters.js; special FX (quake, rune pillar) render in the
// renderer/sim, so they survive the conversion.
export const aegisSpec = {
  format: 'riftrig/1', id: 'aegis', light: -1,
  depth: 0.62, idleSettle: 4,
  idlePose: { leadFoot: 9, rearFoot: -13, rearLift: 1.5, handX: 17, handY: 19, wrist: 1.05,
    backHandX: 11, backHandY: 21, leanAdd: 0.04, shoulderAngle: 0 },
  skel: { hipY: -42, shoulderY: -74, headY: -89, headR: 9, neck: 4, shoulderX: 13, hipW: 9,
    thigh: 23, shin: 22, upper: 18, fore: 17, stance: 14 },
  limb: { style: 'plated', arm: 13, leg: 16, color: 'primary', joints: 0, hand: 6.4, foot: 'shoe' },
  torso: { shape: 'plate', width: 11, color: 'primary' },
  head: { shape: 'helm', color: 'primary', face: true, faceScale: 0.7, eyeColor: 'glow' },
  cloth: [{ anchor: 'shoulder', x: -12, n: 6, seg: 13, w0: 30, w1: 38, color: 'secondary', windX: 28, grav: 160, damp: 0.88 }],
  weapon: { type: 'hammer', length: 74, width: 8, color: 'primary', guard: 'accent', edge: 'glow', idle: 'rest', idleTwoHand: true },
  images: {},
};
