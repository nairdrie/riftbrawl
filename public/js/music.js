// Streamed background music with crossfade transitions and a persisted volume.
// Two looping tracks: an "overture" for the front-end (menu / select / results)
// and a "match" track for live fights. Transitions crossfade so swaps don't jar.

import { isMuted } from './sfx.js';

const SRC = {
  overture: '/audio/overture.mp3',
  match: '/audio/match.mp3',
};

const FADE_MS = 700;       // crossfade length when switching tracks

let musicVol = readVol('rb_music_vol', 0.45);
let current = null;        // currently-desired track key
const els = {};            // key -> HTMLAudioElement
let gestureArmed = false;

function readVol(key, def) {
  const v = parseFloat(localStorage.getItem(key));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
}

function el(key) {
  if (!els[key]) {
    const a = new Audio(SRC[key]);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    a._fade = null;
    els[key] = a;
  }
  return els[key];
}

function targetVol() { return isMuted() ? 0 : musicVol; }

function tryPlay(a) {
  const p = a.play();
  if (p && p.catch) p.catch(() => armGesture());
}

function fade(a, to, ms) {
  if (a._fade) cancelAnimationFrame(a._fade);
  const from = a.volume;
  const start = performance.now();
  const step = (now) => {
    const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) { a._fade = requestAnimationFrame(step); }
    else { a._fade = null; if (to === 0) a.pause(); }
  };
  a._fade = requestAnimationFrame(step);
}

// Play the given track, crossfading out whatever was playing. Idempotent.
export function playMusic(key) {
  if (!SRC[key]) return;
  if (current === key) { applyVolume(); return; }
  const prev = current;
  current = key;
  if (prev && els[prev]) fade(els[prev], 0, FADE_MS);
  const a = el(key);
  tryPlay(a);
  fade(a, targetVol(), FADE_MS);
}

export function stopMusic() {
  const prev = current;
  current = null;
  if (prev && els[prev]) fade(els[prev], 0, FADE_MS);
}

export function setMusicVolume(v) {
  musicVol = Math.min(1, Math.max(0, v));
  localStorage.setItem('rb_music_vol', String(musicVol));
  applyVolume();
}
export function getMusicVolume() { return musicVol; }

// Snap the live track straight to its target volume (used by the slider and on
// mute changes — no fade, so dragging feels immediate).
function applyVolume() {
  if (!current) return;
  const a = els[current];
  if (!a) return;
  if (a._fade) { cancelAnimationFrame(a._fade); a._fade = null; }
  a.volume = targetVol();
  if (targetVol() > 0 && a.paused) tryPlay(a);
}

// Browsers block autoplay until the user interacts. If play() was rejected,
// retry once on the next pointer/key event, then settle to the right volume.
function armGesture() {
  if (gestureArmed) return;
  gestureArmed = true;
  const go = () => {
    gestureArmed = false;
    document.removeEventListener('pointerdown', go);
    document.removeEventListener('keydown', go);
    if (current) { const a = el(current); a.play().then(() => { a.volume = targetVol(); }).catch(() => {}); }
  };
  document.addEventListener('pointerdown', go, { once: true });
  document.addEventListener('keydown', go, { once: true });
}

// Mute is global (owned by sfx.js); re-apply when it toggles.
document.addEventListener('audio:mute', applyVolume);

// Controller-only players never trigger a pointer/key gesture, so retry the
// current track when input.js reports the first gamepad activity.
document.addEventListener('pad:gesture', () => {
  if (!current) return;
  const a = el(current);
  if (a.paused) a.play().then(() => { a.volume = targetVol(); }).catch(() => {});
});
