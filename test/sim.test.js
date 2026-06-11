// Sim mechanics tests: ledge grab, stage body collision, dash, crouch cancel,
// body push. Pure sim — no server. Run: node test/sim.test.js

import { createGameState, step } from '../shared/sim.js';
import { ACT, BTN, STAGE, PHASE, LEDGE } from '../shared/constants.js';

let failures = 0;
function check(name, cond, info = '') {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}${cond ? '' : ` — ${info}`}`);
  if (!cond) failures++;
}

function freshState() {
  const s = createGameState([{ uid: 'a', charId: 'tide' }, { uid: 'b', charId: 'tide' }]);
  s.phase = PHASE.PLAYING; // skip countdown
  return s;
}
const idle = { b: 0, x: 0, y: 0 };

// ── 1. ledge grab ────────────────────────────────────────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  // falling just outside the left edge
  p.x = -STAGE.halfWidth - 20; p.y = 30; p.vy = 3; p.grounded = false;
  for (let i = 0; i < 30 && p.act !== ACT.LEDGE; i++) step(s, [idle, idle]);
  check('falling near the edge snaps to the ledge', p.act === ACT.LEDGE, `act=${p.act}`);
  check('ledge grab grants invulnerability', p.invuln > 30, `invuln=${p.invuln}`);
  check('ledge grab restores the double jump', p.jumpsLeft === 1 && !p.exhausted);

  // climb up by holding toward the stage
  for (let i = 0; i < 10 && !p.grounded; i++) step(s, [{ b: 0, x: 1, y: 0 }, idle]);
  check('holding toward the stage climbs up', p.grounded && p.act === ACT.FREE && Math.abs(p.x) < STAGE.halfWidth,
    `grounded=${p.grounded} x=${p.x.toFixed(0)}`);
}

// ── 2. ledge jump and drop ───────────────────────────────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  p.x = STAGE.halfWidth + 20; p.y = 30; p.vy = 3; p.grounded = false;
  for (let i = 0; i < 30 && p.act !== ACT.LEDGE; i++) step(s, [idle, idle]);
  check('right ledge also grabs', p.act === ACT.LEDGE);
  check('hanging faces the stage', p.facing === -1, `facing=${p.facing}`);
  step(s, [{ b: BTN.JUMP, x: 0, y: 0 }, idle]);
  check('jump from ledge launches upward', p.act === ACT.FREE && p.vy < -10, `vy=${p.vy.toFixed(1)}`);
  check('cannot regrab immediately', p.regrabTimer > 0);
}

// ── 3. up-B sweetspots the ledge ─────────────────────────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  p.x = -STAGE.halfWidth - 30; p.y = 200; p.grounded = false; p.vy = 5;
  // input up-B once, then hold neutral
  step(s, [{ b: BTN.SPECIAL, x: 0, y: -1 }, idle]);
  let grabbed = false;
  for (let i = 0; i < 70; i++) {
    step(s, [idle, idle]);
    if (p.act === ACT.LEDGE) { grabbed = true; break; }
  }
  check('up-B recovery snaps to the ledge', grabbed, `act=${p.act} y=${p.y.toFixed(0)}`);
}

// ── 4. solid stage body ──────────────────────────────────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  // launched upward from below the center of the stage
  p.x = 0; p.y = 300; p.grounded = false; p.vy = -24; p.act = ACT.HITSTUN; p.stun = 60;
  let crossed = false;
  for (let i = 0; i < 60; i++) {
    step(s, [idle, idle]);
    const cy = p.y - 38;
    if (cy > STAGE.floorY + 4 && cy < STAGE.floorY + STAGE.thickness - 4 &&
        Math.abs(p.x) < STAGE.halfWidth - 4) crossed = true;
    if (p.grounded) break;
  }
  check('cannot fly up through the stage from below', !crossed && !p.grounded,
    `crossed=${crossed} grounded=${p.grounded}`);
}

// ── 5. dash vs walk ──────────────────────────────────────────────────────────
{
  // walk: ease the stick to half tilt
  const s1 = freshState();
  const w = s1.players[0];
  for (let i = 0; i < 30; i++) step(s1, [{ b: 0, x: 0.3, y: 0 }, idle]);
  const walkSpeed = Math.abs(w.vx);

  // dash: smash the stick to full instantly
  const s2 = freshState();
  const d = s2.players[0];
  for (let i = 0; i < 8; i++) step(s2, [{ b: 0, x: 1, y: 0 }, idle]);
  const dashSpeed = Math.abs(d.vx);

  check('smashing the stick dashes much faster than walking', dashSpeed > walkSpeed * 2,
    `dash=${dashSpeed.toFixed(1)} walk=${walkSpeed.toFixed(1)}`);
  check('dash burst exceeds base run speed', dashSpeed > 6.1, `dash=${dashSpeed.toFixed(1)}`);
}

// ── 6. crouch cancel ─────────────────────────────────────────────────────────
{
  function hitStun(crouching) {
    const s = freshState();
    const a = s.players[0], t = s.players[1];
    a.x = -60; t.x = 0; t.percent = 80;
    const tIn = crouching ? { b: 0, x: 0, y: 1 } : idle;
    // prime crouch state (lastIn) then attack
    step(s, [idle, tIn]);
    step(s, [{ b: BTN.ATTACK, x: 1, y: 0 }, tIn]);
    for (let i = 0; i < 40; i++) {
      step(s, [{ b: 0, x: 0, y: 0 }, tIn]);
      if (t.act === ACT.HITSTUN) return t.stun;
    }
    return -1;
  }
  const normal = hitStun(false);
  const crouched = hitStun(true);
  check('crouching reduces knockback (crouch cancel)', normal > 0 && crouched > 0 && crouched < normal,
    `normal=${normal} crouched=${crouched}`);
}

// ── 7. body push (walk a statue off the stage) ───────────────────────────────
{
  const s = freshState();
  const a = s.players[0], t = s.players[1];
  a.x = STAGE.halfWidth - 80; t.x = STAGE.halfWidth - 50;
  let fell = false;
  for (let i = 0; i < 600; i++) {
    step(s, [{ b: 0, x: 0.5, y: 0 }, idle]);
    if (!t.grounded || t.act === ACT.LEDGE) { fell = true; break; }
  }
  check('walking into a standing player pushes them off the edge', fell,
    `t.x=${t.x.toFixed(0)} grounded=${t.grounded}`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
