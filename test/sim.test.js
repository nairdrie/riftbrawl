// Sim mechanics tests: ledge grab, stage body collision, dash, crouch cancel,
// body push. Pure sim — no server. Run: node test/sim.test.js

import { createGameState, step } from '../shared/sim.js';
import { ACT, BTN, STAGE, PHASE, LEDGE, NB_CHARGE, PASSIVE, ROLL } from '../shared/constants.js';

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

// ── 8. fast fall snaps instantly ─────────────────────────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  p.grounded = false; p.y = -200; p.vy = 1;
  const before = p.vy;
  step(s, [{ b: 0, x: 0, y: 1 }, idle]);
  check('fast fall snaps to full speed in one tick', p.vy > 12 && p.fastFalling,
    `vy ${before} → ${p.vy.toFixed(1)}`);
}

// ── 9. attack while crouched gives the low attack ───────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  // settle into a crouch, then press attack while still holding down
  for (let i = 0; i < 5; i++) step(s, [{ b: 0, x: 0, y: 1 }, idle]);
  step(s, [{ b: BTN.ATTACK, x: 0, y: 1 }, idle]);
  check('crouch + attack comes out as the low attack (dtilt)',
    p.act === ACT.ATTACK && p.moveId === 'dtilt', `act=${p.act} move=${p.moveId}`);
}

// ── 10. chargeable neutral special ───────────────────────────────────────────
{
  // uncharged tap
  const s1 = freshState();
  step(s1, [{ b: BTN.SPECIAL, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 30; i++) step(s1, [idle, idle]);
  const plain = s1.projectiles[0];
  check('tapping special fires an uncharged shot', !!plain);

  // hold to charge, then release
  const s2 = freshState();
  const p2 = s2.players[0];
  const hold = { b: BTN.SPECIAL, x: 0, y: 0 };
  step(s2, [hold, idle]);
  for (let i = 0; i < 45; i++) step(s2, [hold, idle]);
  check('holding special charges instead of firing', p2.charge > 30 && s2.projectiles.length === 0,
    `charge=${p2.charge} projs=${s2.projectiles.length}`);
  for (let i = 0; i < 10; i++) step(s2, [idle, idle]);
  const charged = s2.projectiles[0];
  check('release fires a bigger, harder shot', !!charged && charged.dmg > plain.dmg * 1.3 && charged.r > plain.r,
    `dmg ${plain?.dmg} → ${charged?.dmg?.toFixed(1)}`);

  // hold forever → auto-fire at max
  const s3 = freshState();
  for (let i = 0; i < NB_CHARGE.max + 30; i++) step(s3, [hold, idle]);
  check('full charge auto-fires', s3.projectiles.length === 1 || s3.players[0].charge === 0,
    `projs=${s3.projectiles.length} charge=${s3.players[0].charge}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature mechanics
// ─────────────────────────────────────────────────────────────────────────────

function duel(charA, charB) {
  const s = createGameState([{ uid: 'a', charId: charA }, { uid: 'b', charId: charB }]);
  s.phase = PHASE.PLAYING;
  return s;
}

// ── 11. AEGIS: Verdict Counter negates and retaliates ───────────────────────
{
  const s = duel('aegis', 'tide');
  const a = s.players[0], t = s.players[1];
  a.x = 0; t.x = -60; t.facing = 1;
  // aegis enters counter stance
  a.act = ACT.ATTACK; a.moveId = 'db'; a.actFrame = 7;
  // tide swings ftilt into him
  step(s, [idle, { b: BTN.ATTACK, x: 1, y: 0 }]);
  for (let i = 0; i < 25 && t.act !== ACT.HITSTUN; i++) step(s, [idle, idle]);
  check('counter negates the hit (no damage taken)', a.percent === 0, `aegis%=${a.percent}`);
  check('counter retaliates (attacker launched)', t.act === ACT.HITSTUN && t.percent > 0,
    `t.act=${t.act} t%=${t.percent}`);
}

// ── 12. AEGIS: rune armor shrugs off weak hits mid-swing ────────────────────
{
  const s = duel('aegis', 'volt');
  const a = s.players[0], v = s.players[1];
  a.x = 0; a.facing = -1; v.x = -55; v.facing = 1;
  a.act = ACT.ATTACK; a.moveId = 'ftilt'; a.actFrame = 11;     // inside armor window
  v.act = ACT.ATTACK; v.moveId = 'jab'; v.actFrame = 3;        // weak hit incoming
  step(s, [idle, idle]);
  check('armored swing takes damage but does not flinch',
    a.percent > 0 && a.act === ACT.ATTACK, `a%=${a.percent} act=${a.act}`);
}

// ── 13. AEGIS: quake line crawls the floor and dies at the edge ─────────────
{
  const s = duel('aegis', 'tide');
  s.players[1].x = 400; s.players[1].invuln = 9999;
  s.players[0].x = 300; s.players[0].facing = 1;
  step(s, [{ b: BTN.SPECIAL, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 25 && !s.projectiles.length; i++) step(s, [idle, idle]);
  const q = s.projectiles[0];
  check('quake line spawns hugging the floor', !!q && q.kind === 'quake' && q.y > STAGE.floorY - 20,
    `kind=${q?.kind} y=${q?.y}`);
  for (let i = 0; i < 120 && s.projectiles.length; i++) step(s, [idle, idle]);
  check('quake line dies at the stage edge', s.projectiles.length === 0,
    `projs=${s.projectiles.length} x=${q?.x?.toFixed(0)}`);
}

// ── 14. VOLT: static stacks discharge into a paralyzing zap ─────────────────
{
  const s = duel('volt', 'aegis');
  const v = s.players[0], t = s.players[1];
  let paralyzed = false;
  for (let hit = 0; hit < PASSIVE.STACKS_MAX + 1; hit++) {
    // reset positions and let volt jab the target
    v.x = -50; v.facing = 1; v.act = ACT.FREE; v.actFrame = 0; v.moveId = ''; v.hitlag = 0;
    t.x = 0; t.act = ACT.FREE; t.stun = 0; t.hitlag = 0; t.vx = 0; t.vy = 0; t.grounded = true; t.y = 0;
    step(s, [{ b: BTN.ATTACK, x: 0, y: 0 }, idle]);
    for (let i = 0; i < 30 && t.act !== ACT.HITSTUN; i++) step(s, [idle, idle]);
    if (t.act === ACT.HITSTUN && Math.abs(t.vy) < 0.01 && t.stun === PASSIVE.STACK_STUN) paralyzed = true;
    for (let i = 0; i < 30; i++) step(s, [idle, idle]);   // let moves finish
  }
  check('5 stacks then discharge: paralyzing hit with no launch', paralyzed && v.stacks === 0,
    `stacks=${v.stacks} paralyzed=${paralyzed}`);
}

// ── 15. VOLT: storm blink teleports and has two air jumps ───────────────────
{
  const s = duel('volt', 'aegis');
  const v = s.players[0];
  s.players[1].x = 400;
  v.x = -100; v.facing = 1;
  const x0 = v.x;
  step(s, [{ b: BTN.SPECIAL, x: 1, y: 0 }, idle]);
  for (let i = 0; i < 12; i++) step(s, [idle, idle]);
  check('storm blink teleports forward', v.x - x0 > 150, `dx=${(v.x - x0).toFixed(0)}`);

  // air jumps: volt should get two
  const s2 = duel('volt', 'aegis');
  const v2 = s2.players[0];
  v2.grounded = false; v2.y = -300; v2.vy = 5; v2.jumpsLeft = 2;
  step(s2, [{ b: BTN.JUMP, x: 0, y: 0 }, idle]);
  const firstJump = v2.vy < -10;
  for (let i = 0; i < 5; i++) step(s2, [idle, idle]);
  step(s2, [{ b: BTN.JUMP, x: 0, y: 0 }, idle]);
  check('volt gets a second air jump', firstJump && v2.vy < -10 && v2.jumpsLeft === 0,
    `vy=${v2.vy.toFixed(1)} left=${v2.jumpsLeft}`);
}

// ── 16. EMBER: hits burn over time ───────────────────────────────────────────
{
  const s = duel('ember', 'aegis');
  const e = s.players[0], t = s.players[1];
  e.x = -50; e.facing = 1; t.x = 0;
  step(s, [{ b: BTN.ATTACK, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 30 && t.act !== ACT.HITSTUN; i++) step(s, [idle, idle]);
  const afterHit = t.percent;
  check('ember hit applies burn', t.burnTicks === PASSIVE.BURN_TICKS, `ticks=${t.burnTicks}`);
  for (let i = 0; i < PASSIVE.BURN_INTERVAL * PASSIVE.BURN_TICKS + 10; i++) step(s, [idle, idle]);
  check('burn ticks away over time', t.percent >= afterHit + PASSIVE.BURN_TICKS * PASSIVE.BURN_DMG - 0.01,
    `${afterHit} → ${t.percent}`);
}

// ── 17. EMBER: wildfire orb leaves a fire patch where it lands ───────────────
{
  const s = duel('ember', 'aegis');
  s.players[1].x = 400; s.players[1].invuln = 9999;
  s.players[0].x = -200; s.players[0].facing = 1;
  step(s, [{ b: BTN.SPECIAL, x: 0, y: 0 }, idle]);
  let patch = null;
  for (let i = 0; i < 130 && !patch; i++) {
    step(s, [idle, idle]);
    patch = s.projectiles.find(p => p.kind === 'patch');
  }
  check('orb landing spawns a lingering fire patch', !!patch && patch.y > STAGE.floorY - 16,
    `patch=${!!patch}`);
}

// ── 18. EMBER: geyser trap erupts underfoot ──────────────────────────────────
{
  const s = duel('ember', 'volt');
  const e = s.players[0], v = s.players[1];
  e.x = -100; e.facing = 1; v.x = 300;
  step(s, [{ b: BTN.SPECIAL, x: 0, y: 1 }, idle]);            // plant
  for (let i = 0; i < 50; i++) step(s, [idle, idle]);
  const trap = s.projectiles.find(p => p.kind === 'trap');
  check('geyser trap is planted and armed', !!trap, `projs=${s.projectiles.map(p => p.kind)}`);
  // walk the victim onto it
  v.x = trap.x + 100; v.facing = -1;
  for (let i = 0; i < 90 && v.act !== ACT.HITSTUN; i++) step(s, [idle, { b: 0, x: -0.5, y: 0 }]);
  check('trap erupts when stepped on', v.act === ACT.HITSTUN && !s.projectiles.find(p => p.kind === 'trap'),
    `act=${v.act}`);
}

// ── 19. TIDE: boomerang returns; whirlpool guard reflects ────────────────────
{
  const s = duel('tide', 'aegis');
  s.players[1].x = 450; s.players[1].invuln = 9999;
  s.players[0].x = -200; s.players[0].facing = 1;
  step(s, [{ b: BTN.SPECIAL, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 20 && !s.projectiles.length; i++) step(s, [idle, idle]);
  const lance = s.projectiles[0];
  check('pressure lance flies out as a boomerang', !!lance && lance.kind === 'boom', `kind=${lance?.kind}`);
  let caught = false;
  for (let i = 0; i < 200; i++) {
    step(s, [idle, idle]);
    if (!s.projectiles.length) { caught = true; break; }
  }
  check('boomerang returns and is caught', caught, `projs=${s.projectiles.length}`);

  // reflect: enemy shot flies into tide's whirlpool guard
  const s2 = duel('tide', 'volt');
  const td = s2.players[0];
  td.x = 0; td.act = ACT.ATTACK; td.moveId = 'db'; td.actFrame = 6;
  s2.projectiles.push({
    id: 99, owner: 1, charId: 'volt', kind: 'shot', x: -120, y: -40, vx: 12, vy: 0, grav: 0,
    r: 13, dmg: 5.5, angle: 18, bkb: 3.4, kbg: 4.5, life: 60, cd: 0, slot: 0, aux: 0,
  });
  s2.nextProjId = 100;
  for (let i = 0; i < 14; i++) {
    step(s2, [idle, idle]);
    td.act = ACT.ATTACK; td.moveId = 'db'; td.actFrame = Math.min(td.actFrame, 30); // hold the guard
  }
  const refl = s2.projectiles.find(p => p.id === 99);
  check('whirlpool guard reflects the projectile back', !!refl && refl.owner === 0 && refl.vx < 0,
    `owner=${refl?.owner} vx=${refl?.vx?.toFixed(1)}`);
  check('tide took no damage from the reflected shot', td.percent === 0, `%=${td.percent}`);
}

// ── 20. NOVA: orbit shards, black-hole pull, float ───────────────────────────
{
  const s = duel('nova', 'aegis');
  const n = s.players[0];
  s.players[1].x = 450; s.players[1].invuln = 9999;
  n.x = -200;
  const press = { b: BTN.SPECIAL, x: 0, y: 0 };
  for (let k = 0; k < 3; k++) {
    step(s, [press, idle]);
    for (let i = 0; i < 30; i++) step(s, [idle, idle]);
  }
  check('three star shards orbit nova', s.projectiles.filter(p => p.kind === 'orbit').length === 3,
    `kinds=${s.projectiles.map(p => p.kind)}`);
  step(s, [press, idle]);
  for (let i = 0; i < 14; i++) step(s, [idle, idle]);
  check('fourth press launches a shard', s.projectiles.filter(p => p.kind === 'orbit').length === 2 &&
    s.projectiles.some(p => p.kind === 'shot' && Math.abs(p.vx) > 5),
    `kinds=${s.projectiles.map(p => p.kind)}`);

  // black hole pull
  const s2 = duel('nova', 'volt');
  const n2 = s2.players[0], v2 = s2.players[1];
  n2.x = 0; v2.x = 120;
  const d0 = Math.abs(v2.x - n2.x);
  step(s2, [{ b: BTN.SPECIAL, x: 0, y: 1 }, idle]);
  for (let i = 0; i < 26; i++) step(s2, [idle, idle]);
  check('black halo pulls the enemy closer', Math.abs(v2.x - n2.x) < d0 - 20,
    `${d0} → ${Math.abs(v2.x - n2.x).toFixed(0)}`);

  // float: holding jump after the apex slows the fall dramatically
  function fallDist(charId, hold) {
    const st = duel(charId, 'aegis');
    const p = st.players[0];
    p.grounded = false; p.y = -600; p.vy = 2; p.floatT = PASSIVE.FLOAT_TICKS;
    const y0 = p.y;
    for (let i = 0; i < 40; i++) step(st, [{ b: hold ? BTN.JUMP : 0, x: 0, y: 0 }, idle]);
    return p.y - y0;
  }
  check('nova floats while holding jump', fallDist('nova', true) < fallDist('nova', false) * 0.35,
    `held=${fallDist('nova', true).toFixed(0)} free=${fallDist('nova', false).toFixed(0)}`);
  check('tide surfs (slow fall) while holding jump', fallDist('tide', true) < fallDist('tide', false) * 0.75,
    `held=${fallDist('tide', true).toFixed(0)} free=${fallDist('tide', false).toFixed(0)}`);
}

// ── 21. TIDE: current step passes through without hitting ───────────────────
{
  const s = duel('tide', 'aegis');
  const td = s.players[0], a = s.players[1];
  td.x = -80; td.facing = 1; a.x = 0;
  step(s, [{ b: BTN.SPECIAL, x: 1, y: 0 }, idle]);
  for (let i = 0; i < 35; i++) step(s, [idle, idle]);
  check('current step deals no damage (crossup tool)', a.percent === 0 && a.act === ACT.FREE,
    `a%=${a.percent}`);
  check('tide ends up past the opponent', td.x > a.x - 20, `tide.x=${td.x.toFixed(0)} a.x=${a.x.toFixed(0)}`);
}

// ── 22. grab → throw ─────────────────────────────────────────────────────────
{
  const s = freshState();
  const a = s.players[0], t = s.players[1];
  a.x = 0; a.facing = 1; t.x = 42; t.grounded = true;
  step(s, [{ b: BTN.GRAB, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 12 && t.act !== ACT.GRABBED; i++) step(s, [idle, idle]);
  check('grab catches a nearby grounded opponent',
    t.act === ACT.GRABBED && a.act === ACT.GRAB && a.grabbing === 1,
    `t.act=${t.act} a.act=${a.act} grabbing=${a.grabbing}`);
  for (let i = 0; i < 4; i++) step(s, [idle, idle]);        // settle the hold
  step(s, [{ b: 0, x: 1, y: 0 }, idle]);                    // forward throw
  check('forward throw launches the victim',
    t.act === ACT.HITSTUN && t.percent > 0 && a.grabbing === -1 && t.grabbedBy === -1,
    `t.act=${t.act} t%=${t.percent}`);
}

// ── 23. grab whiffs into nothing (punishable) ────────────────────────────────
{
  const s = freshState();
  const a = s.players[0], t = s.players[1];
  a.x = 0; a.facing = 1; t.x = 400;            // far away — nothing to grab
  step(s, [{ b: BTN.GRAB, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 40 && a.act === ACT.GRAB; i++) step(s, [idle, idle]);
  check('whiffed grab recovers back to neutral', a.act === ACT.FREE && a.grabbing === -1,
    `a.act=${a.act}`);
}

// ── 23b. pummel damages, and mashing breaks the grab ─────────────────────────
{
  const s = freshState();
  const a = s.players[0], t = s.players[1];
  a.x = 0; a.facing = 1; t.x = 42; t.grounded = true;
  step(s, [{ b: BTN.GRAB, x: 0, y: 0 }, idle]);
  for (let i = 0; i < 12 && t.act !== ACT.GRABBED; i++) step(s, [idle, idle]);
  const before = t.percent;
  // pummel a couple of times (alternate press so edges register)
  for (let i = 0; i < 6; i++) step(s, [{ b: i % 2 ? BTN.ATTACK : 0, x: 0, y: 0 }, idle]);
  check('pummel adds damage to the held victim', t.percent > before, `${before} → ${t.percent}`);
  // victim mashes buttons + wiggles to escape
  let freed = false;
  for (let i = 0; i < 60; i++) {
    const vin = { b: i % 2 ? BTN.JUMP : 0, x: i % 2 ? 1 : -1, y: 0 };
    step(s, [idle, vin]);
    if (t.act !== ACT.GRABBED) { freed = true; break; }
  }
  check('mashing breaks free of the grab', freed && a.grabbing === -1 && t.grabbedBy === -1,
    `t.act=${t.act} grabbing=${a.grabbing}`);
}

// ── 24. charged smash attack hits harder than a tap ──────────────────────────
{
  function ftiltDamage(charge) {
    const s = freshState();
    const a = s.players[0], t = s.players[1];
    a.x = -40; a.facing = 1; t.x = 20; t.percent = 0; t.grounded = true;
    if (charge) {
      const hold = { b: BTN.ATTACK, x: 1, y: 0 };
      for (let i = 0; i < NB_CHARGE.max + 30; i++) step(s, [hold, idle]);
    } else {
      step(s, [{ b: BTN.ATTACK, x: 1, y: 0 }, idle]);
      for (let i = 0; i < 40; i++) step(s, [idle, idle]);
    }
    return t.percent;
  }
  const tap = ftiltDamage(false);
  const charged = ftiltDamage(true);
  check('holding ATTACK charges a smash that hits much harder',
    tap > 0 && charged > tap * 1.5, `tap=${tap} charged=${charged.toFixed(1)}`);
}

// ── 25. roll dodge out of shield ─────────────────────────────────────────────
{
  const s = freshState();
  const p = s.players[0];
  p.x = 0; p.grounded = true;
  const shield = { b: BTN.SHIELD, x: 0, y: 0 };
  const rollRight = { b: BTN.SHIELD, x: 1, y: 0 };
  step(s, [shield, idle]);
  check('holding shield from neutral guards', p.act === ACT.SHIELD, `act=${p.act}`);
  const x0 = p.x;
  step(s, [rollRight, idle]);                 // flick the stick → roll
  check('flicking the stick while shielding starts a roll', p.act === ACT.ROLL, `act=${p.act}`);

  let invFrames = 0;
  for (let i = 0; i < ROLL.ticks + 4 && p.act === ACT.ROLL; i++) {
    step(s, [rollRight, idle]);
    if (p.act === ACT.ROLL && p.invuln > 0) invFrames++;
  }
  check('roll grants intangibility frames', invFrames >= 8, `invFrames=${invFrames}`);
  check('roll carries the fighter sideways', p.x > x0 + 60, `x ${x0} → ${p.x.toFixed(0)}`);
  check('roll ends back in shield while it is held', p.act === ACT.SHIELD, `act=${p.act}`);

  // a roll at the lip should stop on stage, not self-destruct off the edge
  const s2 = freshState();
  const e = s2.players[0];
  e.x = STAGE.halfWidth - 40; e.grounded = true;
  step(s2, [shield, idle]);
  step(s2, [rollRight, idle]);
  for (let i = 0; i < ROLL.ticks + 4; i++) step(s2, [rollRight, idle]);
  check('rolling toward the ledge stops on the stage', e.grounded && Math.abs(e.x) < STAGE.halfWidth,
    `x=${e.x.toFixed(0)} grounded=${e.grounded}`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
