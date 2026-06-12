// Synthesized SFX engine — every sound is generated with WebAudio, no assets.

let ctx = null;
let master = null;
let muted = localStorage.getItem('smash_muted') === '1';
let sfxVol = readVol('rb_sfx_vol', 0.55);

function readVol(key, def) {
  const v = parseFloat(localStorage.getItem(key));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
}

function applyMaster() {
  if (master) master.gain.value = muted ? 0 : sfxVol;
}

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : sfxVol;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

document.addEventListener('pointerdown', ensure, { once: true });
document.addEventListener('keydown', ensure, { once: true });
// gamepad input isn't a real user gesture, but resuming from inside the rAF
// poll that fires this event works in practice — see input.js.
document.addEventListener('pad:gesture', ensure, { once: true });

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('smash_muted', muted ? '1' : '0');
  applyMaster();
  document.dispatchEvent(new CustomEvent('audio:mute', { detail: { muted } }));
  return muted;
}
export function isMuted() { return muted; }

export function setSfxVolume(v) {
  sfxVol = Math.min(1, Math.max(0, v));
  localStorage.setItem('rb_sfx_vol', String(sfxVol));
  applyMaster();
}
export function getSfxVolume() { return sfxVol; }

function noiseBuffer(dur = 0.5) {
  const c = ensure();
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(g, t, a, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}

function tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, peak = 0.3, attack = 0.005, detune = 0 }) {
  if (muted) return;
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, attack, peak, dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.1);
}

function noise({ dur = 0.2, peak = 0.3, hp = 0, lp = 8000, attack = 0.004 }) {
  if (muted) return;
  const c = ensure();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.05);
  const g = c.createGain();
  let node = src;
  if (lp < 20000) {
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    node.connect(f); node = f;
  }
  if (hp > 0) {
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    node.connect(f); node = f;
  }
  env(g, t, attack, peak, dur);
  node.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.1);
}

export const sfx = {
  click()      { tone({ type: 'triangle', f0: 700, f1: 980, dur: 0.06, peak: 0.18 }); },
  hover()      { tone({ type: 'sine', f0: 460, f1: 520, dur: 0.04, peak: 0.08 }); },
  error()      { tone({ type: 'square', f0: 220, f1: 140, dur: 0.18, peak: 0.12 }); },
  ok()         { tone({ type: 'triangle', f0: 620, f1: 920, dur: 0.12, peak: 0.16 }); tone({ type: 'triangle', f0: 920, f1: 1240, dur: 0.14, peak: 0.12 }); },
  select()     { tone({ type: 'sawtooth', f0: 300, f1: 600, dur: 0.12, peak: 0.14 }); noise({ dur: 0.08, peak: 0.06, hp: 3000 }); },
  ready()      { tone({ type: 'sawtooth', f0: 392, f1: 392, dur: 0.1, peak: 0.14 }); setTimeout(() => tone({ type: 'sawtooth', f0: 588, f1: 588, dur: 0.22, peak: 0.16 }), 90); },

  jump()       { noise({ dur: 0.1, peak: 0.07, hp: 1200 }); tone({ type: 'sine', f0: 240, f1: 480, dur: 0.1, peak: 0.08 }); },
  djump()      { tone({ type: 'sine', f0: 320, f1: 640, dur: 0.12, peak: 0.1 }); noise({ dur: 0.1, peak: 0.06, hp: 1600 }); },
  land()       { noise({ dur: 0.07, peak: 0.08, lp: 900 }); },
  whiff()      { noise({ dur: 0.09, peak: 0.07, hp: 2200 }); },
  shoot()      { tone({ type: 'square', f0: 880, f1: 320, dur: 0.12, peak: 0.1 }); noise({ dur: 0.06, peak: 0.05, hp: 2500 }); },
  chargeTick(t = 0) { tone({ type: 'sine', f0: 300 + t * 500, f1: 340 + t * 520, dur: 0.07, peak: 0.09 }); },
  chargeFull() { tone({ type: 'triangle', f0: 880, f1: 1180, dur: 0.18, peak: 0.16 }); },

  // grab / pummel / throw
  grab()       { noise({ dur: 0.1, peak: 0.1, hp: 1800, lp: 6000 }); tone({ type: 'square', f0: 320, f1: 200, dur: 0.08, peak: 0.08 }); },
  grabCatch()  { tone({ type: 'square', f0: 240, f1: 150, dur: 0.1, peak: 0.16 }); noise({ dur: 0.09, peak: 0.12, lp: 1500 }); },
  pummel()     { noise({ dur: 0.06, peak: 0.12, lp: 1800 }); tone({ type: 'square', f0: 200, f1: 120, dur: 0.07, peak: 0.12 }); },
  throw()      { noise({ dur: 0.14, peak: 0.14, hp: 1400 }); tone({ type: 'sawtooth', f0: 420, f1: 110, dur: 0.18, peak: 0.16 }); },

  // aegis quake eruption — deep ground "bang", bigger when further/charged
  quake(power = 0.5) {
    const p = Math.min(1, power);
    noise({ dur: 0.22 + p * 0.18, peak: 0.2 + p * 0.22, lp: 520 + p * 260 });
    tone({ type: 'sine', f0: 110 - p * 30, f1: 30, dur: 0.34 + p * 0.2, peak: 0.26 + p * 0.16 });
    tone({ type: 'square', f0: 70, f1: 24, dur: 0.4, peak: 0.14 + p * 0.1 });
  },

  // special-move polish
  counter()    { tone({ type: 'square', f0: 1400, f1: 500, dur: 0.16, peak: 0.22 }); tone({ type: 'triangle', f0: 700, f1: 1500, dur: 0.18, peak: 0.14 }); },
  reflect()    { tone({ type: 'sine', f0: 1700, f1: 900, dur: 0.14, peak: 0.16 }); noise({ dur: 0.06, peak: 0.06, hp: 4000 }); },

  hit(power = 5) {
    const p = Math.min(1, power / 16);
    noise({ dur: 0.1 + p * 0.16, peak: 0.22 + p * 0.3, lp: 2200 - p * 800 });
    tone({ type: 'square', f0: 180 + p * 120, f1: 60, dur: 0.12 + p * 0.18, peak: 0.2 + p * 0.2 });
    if (p > 0.5) tone({ type: 'sawtooth', f0: 90, f1: 38, dur: 0.3, peak: 0.22 });
  },
  shieldHit()  { tone({ type: 'sine', f0: 520, f1: 360, dur: 0.12, peak: 0.16 }); noise({ dur: 0.08, peak: 0.08, lp: 1400 }); },
  shieldBreak(){ tone({ type: 'square', f0: 700, f1: 90, dur: 0.5, peak: 0.3 }); noise({ dur: 0.45, peak: 0.3, lp: 3500 }); },

  ko() {
    noise({ dur: 0.7, peak: 0.5, lp: 5000 });
    tone({ type: 'sawtooth', f0: 240, f1: 30, dur: 0.7, peak: 0.4 });
    tone({ type: 'square', f0: 120, f1: 24, dur: 0.9, peak: 0.3 });
  },
  blastZone() {
    tone({ type: 'sine', f0: 1400, f1: 200, dur: 0.5, peak: 0.25 });
    noise({ dur: 0.5, peak: 0.25, hp: 800 });
  },

  count()      { tone({ type: 'square', f0: 440, f1: 440, dur: 0.12, peak: 0.18 }); },
  go()         { tone({ type: 'square', f0: 660, f1: 660, dur: 0.4, peak: 0.24 }); tone({ type: 'square', f0: 880, f1: 880, dur: 0.4, peak: 0.18, detune: 8 }); },
  gameEnd()    {
    [392, 494, 588, 784].forEach((f, i) =>
      setTimeout(() => tone({ type: 'triangle', f0: f, f1: f, dur: 0.3, peak: 0.2 }), i * 110));
  },
  invite()     { [620, 830].forEach((f, i) => setTimeout(() => tone({ type: 'sine', f0: f, f1: f, dur: 0.16, peak: 0.16 }), i * 130)); },
};
