// NOVA — The Void Sentinel, as a data rig. No legs: the lower body trails into a
// luminous stardust tail (legs:'none'). Plated bust, hooded void helm with a
// star-eye. She fights with the void orb + orbiting shards, which are projectiles
// in the sim — so no held weapon here; those FX render via the renderer.
export const novaSpec = {
  format: 'riftrig/1', id: 'nova', light: -1,
  depth: 0.55, idleSettle: 0,
  legs: 'none',
  tail: { n: 6, seg: 12, w0: 20, w1: 3, color: 'secondary', glow: 'glow', tipColor: 'accent', grav: 40, windX: 14, damp: 0.92 },
  idlePose: { leadFoot: 0, rearFoot: 0, rearLift: 0, handX: 16, handY: 8, wrist: -0.2,
    backHandX: -6, backHandY: 12, leanAdd: 0, shoulderAngle: 0 },
  skel: { hipY: -44, shoulderY: -70, headY: -86, headR: 11, neck: 4, shoulderX: 11, hipW: 7,
    thigh: 1, shin: 1, upper: 15, fore: 14, stance: 6 },
  limb: { style: 'plated', arm: 8, leg: 8, color: 'primary', joints: 0, hand: 5, foot: 'none' },
  torso: { shape: 'plate', width: 11, color: 'primary' },
  head: { shape: 'helm', color: 'primary', face: true, faceScale: 0.75, eyeColor: 'accent' },
  cloth: [],
  weapon: { type: 'none' },
  images: {},
};
