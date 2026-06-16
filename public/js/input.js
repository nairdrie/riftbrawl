// Input: keyboard + Gamepad API → {b, x, y} smash-style frame input.
// Keyboard: WASD/arrows move, J/Z attack, K/X special, Space/L jump, Shift/; shield
// Gamepad (standard layout): stick/dpad move, A attack, B special, X/Y jump, bumpers/triggers shield

import { BTN, quant } from '/shared/constants.js';

const keys = new Set();
let gamepadIndex = -1;
let gamepadName = '';

const KEYMAP = {
  attack: ['KeyJ', 'KeyZ'],
  special: ['KeyK', 'KeyX'],
  jump: ['Space', 'KeyC'],
  shield: ['ShiftLeft', 'ShiftRight', 'Semicolon', 'KeyV'],
  grab: ['KeyL', 'KeyG'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  // don't scroll the page with game keys
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (!isTyping()) e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName === 'INPUT') {
    // only text-entry fields swallow game keys — range/checkbox/file/etc. don't,
    // so dragging a slider in the designer never blocks the controls
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'number', 'search', 'email', 'password', 'url', 'tel'].includes(t);
  }
  return false;
}

window.addEventListener('gamepadconnected', (e) => {
  gamepadIndex = e.gamepad.index;
  gamepadName = e.gamepad.id;
  document.dispatchEvent(new CustomEvent('pad', { detail: { connected: true, name: gamepadName } }));
});
window.addEventListener('gamepaddisconnected', (e) => {
  if (e.gamepad.index === gamepadIndex) {
    gamepadIndex = -1;
    document.dispatchEvent(new CustomEvent('pad', { detail: { connected: false } }));
  }
});

function anyKey(list) { return list.some(c => keys.has(c)); }

// Browsers don't treat gamepad input as a user gesture, so audio never unlocks
// for a controller-only player. We poll the pad every frame anyway, so the first
// non-neutral reading is our cue: fire a synthetic gesture event (dispatched
// synchronously, still inside the rAF poll) that the audio modules listen for.
let padGestureFired = false;
function notePadGesture(gp) {
  if (padGestureFired || !gp) return;
  const active = gp.buttons.some(b => b.pressed) || gp.axes.some(a => Math.abs(a) > 0.5);
  if (active) {
    padGestureFired = true;
    document.dispatchEvent(new CustomEvent('pad:gesture'));
  }
}

const DEADZONE = 0.24;
function dz(v) { return Math.abs(v) < DEADZONE ? 0 : (Math.abs(v) - DEADZONE) / (1 - DEADZONE) * Math.sign(v); }

export function padConnected() { return gamepadIndex >= 0; }
export function padName() { return gamepadName; }

// Some pads (Nintendo-layout, certain 8BitDo/driver combos) report the face
// buttons swapped relative to the standard mapping. Persisted user toggle.
let swapAB = localStorage.getItem('smash_swap_ab') === '1';
export function getSwapAB() { return swapAB; }
export function setSwapAB(v) {
  swapAB = !!v;
  localStorage.setItem('smash_swap_ab', swapAB ? '1' : '0');
}
function faceBtn(gp, i) {
  // i: 0 = "confirm/attack" face button, 1 = "back/special"
  const idx = swapAB ? (i === 0 ? 1 : i === 1 ? 0 : i) : i;
  return !!gp.buttons[idx]?.pressed;
}

// controller haptics — fire and forget
export function rumble(strong = 0.6, weak = 0.4, ms = 120) {
  const gp = gamepadIndex >= 0 ? navigator.getGamepads()[gamepadIndex] : null;
  const act = gp?.vibrationActuator;
  if (!act?.playEffect) return;
  act.playEffect('dual-rumble', {
    duration: ms,
    strongMagnitude: Math.min(1, Math.max(0, strong)),
    weakMagnitude: Math.min(1, Math.max(0, weak)),
  }).catch(() => {});
}

// pause toggle: Escape / P on keyboard, Start on a controller (edge-detected)
let prevPauseHeld = false;
export function samplePauseEdge() {
  const gp = gamepadIndex >= 0 ? navigator.getGamepads()[gamepadIndex] : null;
  const held = keys.has('Escape') || keys.has('KeyP') || !!gp?.buttons[9]?.pressed;
  const edge = held && !prevPauseHeld;
  prevPauseHeld = held;
  return edge;
}

// menu navigation edge-detect for gamepad
let prevPadB = 0;
export function samplePadMenu() {
  const out = { confirm: false, back: false, left: false, right: false, up: false, down: false };
  const gp = gamepadIndex >= 0 ? navigator.getGamepads()[gamepadIndex] : null;
  if (!gp) { prevPadB = 0; return out; }
  notePadGesture(gp);
  let b = 0;
  if (faceBtn(gp, 0)) b |= 1;
  if (faceBtn(gp, 1)) b |= 2;
  const x = dz(gp.axes[0] || 0), y = dz(gp.axes[1] || 0);
  if (x < -0.5 || gp.buttons[14]?.pressed) b |= 4;
  if (x > 0.5 || gp.buttons[15]?.pressed) b |= 8;
  if (y < -0.5 || gp.buttons[12]?.pressed) b |= 16;
  if (y > 0.5 || gp.buttons[13]?.pressed) b |= 32;
  const pressed = b & ~prevPadB;
  prevPadB = b;
  out.confirm = !!(pressed & 1);
  out.back = !!(pressed & 2);
  out.left = !!(pressed & 4);
  out.right = !!(pressed & 8);
  out.up = !!(pressed & 16);
  out.down = !!(pressed & 32);
  return out;
}

// Sample current frame input → {b, x, y}
export function sampleInput() {
  let b = 0, x = 0, y = 0;

  if (!isTyping()) {
    if (anyKey(KEYMAP.attack)) b |= BTN.ATTACK;
    if (anyKey(KEYMAP.special)) b |= BTN.SPECIAL;
    if (anyKey(KEYMAP.jump)) b |= BTN.JUMP;
    if (anyKey(KEYMAP.shield)) b |= BTN.SHIELD;
    if (anyKey(KEYMAP.grab)) b |= BTN.GRAB;
    if (anyKey(KEYMAP.left)) x -= 1;
    if (anyKey(KEYMAP.right)) x += 1;
    if (anyKey(KEYMAP.up)) y -= 1;
    if (anyKey(KEYMAP.down)) y += 1;
  }

  const gp = gamepadIndex >= 0 ? navigator.getGamepads()[gamepadIndex] : null;
  if (gp) {
    notePadGesture(gp);
    const ax = dz(gp.axes[0] || 0);
    const ay = dz(gp.axes[1] || 0);
    if (Math.abs(ax) > Math.abs(x)) x = ax;
    if (Math.abs(ay) > Math.abs(y)) y = ay;
    if (gp.buttons[12]?.pressed) y = -1;
    if (gp.buttons[13]?.pressed) y = 1;
    if (gp.buttons[14]?.pressed) x = -1;
    if (gp.buttons[15]?.pressed) x = 1;
    if (faceBtn(gp, 0)) b |= BTN.ATTACK;                                  // bottom face button
    if (faceBtn(gp, 1)) b |= BTN.SPECIAL;                                 // right face button
    if (gp.buttons[2]?.pressed || gp.buttons[3]?.pressed) b |= BTN.JUMP;  // X, Y
    if (gp.buttons[4]?.pressed || gp.buttons[5]?.pressed ||
        gp.buttons[6]?.pressed || gp.buttons[7]?.pressed) b |= BTN.SHIELD;
    // dedicated grab on the right stick click, if the pad has it
    if (gp.buttons[10]?.pressed) b |= BTN.GRAB;
  }

  // shield + attack together = grab (classic Smash shortcut; works on kb & pad)
  if ((b & BTN.SHIELD) && (b & BTN.ATTACK)) { b |= BTN.GRAB; b &= ~BTN.ATTACK; }

  return { b, x: quant(Math.max(-1, Math.min(1, x))), y: quant(Math.max(-1, Math.min(1, y))) };
}
