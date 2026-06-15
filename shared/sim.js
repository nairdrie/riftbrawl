// ─────────────────────────────────────────────────────────────────────────────
// SMASH — deterministic simulation core.
// Runs authoritatively on the server at 60Hz and speculatively on the client
// (prediction + reconciliation). Pure function of (state, inputs).
// ─────────────────────────────────────────────────────────────────────────────

import {
  STAGE, BTN, ACT, PHASE, STOCKS, COUNTDOWN_TICKS,
  RESPAWN_FREEZE, RESPAWN_INVULN, RESPAWN_PLATFORM_TICKS,
  SHIELD_MAX, SHIELD_DRAIN, SHIELD_REGEN, SHIELDBREAK_TICKS,
  LEDGE, DASH, CROUCH_KB, BODY_PUSH, TEETER_SPEED, NB_CHARGE, PASSIVE,
  SMASH_CHARGE, GRAB, THROWS, ROLL,
} from './constants.js';
import { CHARACTERS } from './characters.js';

const JUMPSQUAT_TICKS = 3;
const SHORT_HOP = 0.62;
const AERIAL_DRIFT_IN_ATTACK = 0.75;   // drift multiplier while in an aerial
const KB_DECAY = 0.984;                // horizontal launch decay in hitstun

// ── construction ────────────────────────────────────────────────────────────

export function createPlayer(uid, charId, idx) {
  return {
    uid, charId, idx,
    x: STAGE.spawnX[idx] ?? 0, y: 0, vx: 0, vy: 0,
    facing: (STAGE.spawnX[idx] ?? 0) <= 0 ? 1 : -1,
    percent: 0, stocks: STOCKS,
    grounded: true, jumpsLeft: airJumps(CHARACTERS[charId]),
    act: ACT.FREE, actFrame: 0, moveId: '',
    hitMask: 0, stun: 0, hitlag: 0,
    shield: SHIELD_MAX, invuln: 0,
    respawnTimer: 0, platTimer: 0,
    exhausted: false, fastFalling: false,
    prevB: 0, prevX: 0,
    dashTimer: 0, ledgeTimer: 0, regrabTimer: 0,
    rollDir: 0,                     // shield-roll direction (+1 right / -1 left)
    charge: 0,
    stacks: 0,                      // volt: static charge
    burnTicks: 0, burnTimer: 0,     // ember: damage over time on the victim
    floatT: PASSIVE.FLOAT_TICKS,    // nova: hover budget
    zx: 0, zy: 0,                   // volt: locked zip direction
    grabbing: -1, grabbedBy: -1,    // grab relationship (idx of the other party)
    grabTimer: 0, grabMash: 0, pummelCd: 0,
    lastIn: { b: 0, x: 0, y: 0 },
  };
}

function airJumps(char) { return char?.airJumps ?? 1; }

export function createGameState(playerSpecs) {
  // playerSpecs: [{uid, charId}]
  return {
    frame: 0,
    phase: PHASE.COUNTDOWN,
    phaseTimer: COUNTDOWN_TICKS,
    winner: -1,
    players: playerSpecs.map((s, i) => createPlayer(s.uid, s.charId, i)),
    projectiles: [],
    nextProjId: 1,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function pickGroundedMove(inp) {
  if (inp.y < -0.4) return 'utilt';
  if (inp.y > 0.4) return 'dtilt';
  if (Math.abs(inp.x) > 0.4) return 'ftilt';
  return 'jab';
}

function pickAerialMove(inp, facing) {
  if (inp.y < -0.4) return 'uair';
  if (inp.y > 0.4) return 'dair';
  if (inp.x * facing > 0.4) return 'fair';
  if (inp.x * facing < -0.4) return 'bair';
  return 'nair';
}

function pickSpecial(inp) {
  if (inp.y < -0.4) return 'ub';
  if (inp.y > 0.4) return 'db';
  if (Math.abs(inp.x) > 0.4) return 'sb';
  return 'nb';
}

function startMove(p, moveId) {
  p.act = ACT.ATTACK;
  p.actFrame = 0;
  p.moveId = moveId;
  p.hitMask = 0;
}

function knockback(percent, weight, bkb, kbg) {
  return bkb + (percent / 100) * kbg * (200 / (100 + weight));
}

export function isCrouching(p) {
  return p.grounded && p.act === ACT.FREE && p.lastIn.y > 0.5;
}

export function isSpecialMove(moveId) {
  return moveId === 'nb' || moveId === 'sb' || moveId === 'ub' || moveId === 'db';
}

// directional grounded tilts double as chargeable smash attacks
export function isSmashMove(moveId) {
  return moveId === 'ftilt' || moveId === 'utilt' || moveId === 'dtilt';
}

// clear any grab relationship p is part of, freeing both parties
function releaseGrab(state, p, stunVictim = false) {
  if (p.grabbing >= 0) {
    const v = state.players[p.grabbing];
    if (v && v.grabbedBy === p.idx) {
      v.grabbedBy = -1;
      if (v.act === ACT.GRABBED) {
        v.act = ACT.FREE; v.actFrame = 0; v.moveId = '';
        v.stun = stunVictim ? GRAB.releaseStun : 0;
      }
    }
    p.grabbing = -1;
  }
  if (p.grabbedBy >= 0) {
    const h = state.players[p.grabbedBy];
    if (h && h.grabbing === p.idx) {
      h.grabbing = -1;
      if (h.act === ACT.GRAB) { h.act = ACT.FREE; h.actFrame = 0; h.moveId = ''; }
    }
    p.grabbedBy = -1;
  }
}

function moveTotal(char, moveId) {
  return isSpecialMove(moveId) ? char.specials[moveId].total : char.moves[moveId].total;
}

// ── signature-mechanic helpers ──────────────────────────────────────────────

// super armor: knockback below the threshold doesn't flinch (damage still lands)
function armorThreshold(p, char) {
  if (p.act !== ACT.ATTACK || !p.moveId) return 0;
  const d = isSpecialMove(p.moveId) ? char.specials[p.moveId] : char.moves[p.moveId];
  const a = d?.armor;
  if (!a) return 0;
  return p.actFrame >= a.from && p.actFrame <= a.to ? a.thresh : 0;
}

function counterActive(p, char) {
  if (p.act !== ACT.ATTACK || p.moveId !== 'db') return false;
  const sp = char.specials.db;
  return sp.type === 'counter' && p.actFrame >= sp.from && p.actFrame <= sp.to;
}

function reflectActive(p, char) {
  if (p.act !== ACT.ATTACK || p.moveId !== 'db') return false;
  const rf = char.specials.db.reflect;
  return !!rf && p.actFrame >= rf.from && p.actFrame <= rf.to;
}

// fire-and-forget: spawn a lingering fire patch on the floor
function spawnPatch(state, owner, charId, x, spec) {
  state.projectiles.push({
    id: state.nextProjId++, owner, charId, kind: 'patch',
    x: Math.max(-STAGE.halfWidth + 20, Math.min(STAGE.halfWidth - 20, x)),
    y: STAGE.floorY - 10, vx: 0, vy: 0, grav: 0,
    r: spec.r, dmg: spec.dmg, angle: spec.angle, bkb: spec.bkb, kbg: spec.kbg,
    life: spec.life, cd: 0, slot: 0, aux: spec.cd,
  });
}

// Active world-space hitboxes for a player this frame (empty if none).
export function getActiveHitboxes(p, char) {
  if (p.act !== ACT.ATTACK || p.hitlag > 0) return [];
  const f = p.actFrame;
  const out = [];
  if (isSpecialMove(p.moveId)) {
    const sp = char.specials[p.moveId];
    // body-hitbox special types only; everything else hits via other systems
    const bodyHit = sp.type === 'dash' || sp.type === 'recovery' || sp.type === 'burst' ||
                    sp.type === 'zip' || sp.type === 'pull';
    let from = sp.from, to = sp.to;
    if (sp.type === 'pull') from = sp.to - 2;            // detonation only
    if (bodyHit && !sp.ghost && sp.dmg > 0 && f >= from && f <= to) {
      out.push({
        x: p.x + (sp.dx ?? 0) * p.facing, y: p.y - 40 * char.scale + (sp.dy ?? 0),
        r: sp.r, dmg: sp.dmg, angle: sp.angle, bkb: sp.bkb, kbg: sp.kbg, hl: sp.hl,
      });
    }
  } else {
    // charged smash attacks scale damage + knockback with held charge
    const t = isSmashMove(p.moveId) ? Math.min(1, p.charge / SMASH_CHARGE.max) : 0;
    const dm = 1 + t * SMASH_CHARGE.dmg, km = 1 + t * SMASH_CHARGE.kb;
    for (const hbx of char.moves[p.moveId].hitboxes) {
      if (f >= hbx.from && f <= hbx.to) {
        out.push({
          x: p.x + hbx.dx * p.facing, y: p.y - 40 * char.scale + hbx.dy,
          r: hbx.r * (1 + t * 0.12), dmg: hbx.dmg * dm,
          angle: hbx.angle, bkb: hbx.bkb * km, kbg: hbx.kbg * km, hl: hbx.hl,
        });
      }
    }
  }
  return out;
}

function applyHit(target, tChar, hit, dirX, events, state, attacker, aChar) {
  let dmg = hit.dmg;

  // VOLT passive: static stacks — the 5th hit discharges into a paralyzing zap
  let discharge = false;
  if (aChar?.passive === 'stacks' && attacker) {
    if (attacker.stacks >= PASSIVE.STACKS_MAX) {
      discharge = true;
      attacker.stacks = 0;
      dmg += PASSIVE.STACK_BONUS;
    } else {
      attacker.stacks++;
    }
  }
  // EMBER passive: hits set the victim burning (DoT, refreshes on hit)
  if (aChar?.passive === 'burn') {
    target.burnTicks = PASSIVE.BURN_TICKS;
    target.burnTimer = PASSIVE.BURN_INTERVAL;
  }

  target.percent = Math.min(999, target.percent + dmg);
  let kb = knockback(target.percent, tChar.weight, hit.bkb, hit.kbg);
  if (isCrouching(target)) kb *= CROUCH_KB;   // crouch cancel

  // AEGIS passive: rune armor — weak hits don't flinch him out of his swing
  const armor = armorThreshold(target, tChar);
  if (armor && kb < armor && !discharge) {
    target.hitlag = Math.min(8, Math.floor(dmg * 0.3) + 1);
    events.push({ type: 'armor', x: target.x, y: target.y - 40, victim: target.idx });
    events.push({ type: 'hit', x: target.x, y: target.y - 40, dmg, kb: 0, victim: target.idx });
    return;
  }

  if (discharge) {
    // paralyze: damage + long stun, zero launch — a true combo extender
    target.vx = dirX * 1.2;
    target.vy = 0;
    target.stun = PASSIVE.STACK_STUN;
    events.push({ type: 'discharge', x: target.x, y: target.y - 40, victim: target.idx });
  } else {
    const rad = (hit.angle * Math.PI) / 180;
    target.vx = Math.cos(rad) * kb * dirX;
    target.vy = -Math.sin(rad) * kb;
    target.stun = Math.floor(kb * 2.0 + dmg * 0.4);
  }
  // hit-stop: heavy moves (hit.hl > 1) freeze longer so they land with weight
  const hl = hit.hl ?? 1;
  target.hitlag = Math.min(hl > 1 ? 22 : 14, Math.round((Math.floor(dmg * 0.45) + 2) * hl));
  if (target.grabbing >= 0) releaseGrab(state, target);   // knocked out of a grab
  target.act = ACT.HITSTUN;
  target.actFrame = 0;
  target.moveId = '';
  target.fastFalling = false;
  target.charge = 0;
  if (target.vy < 0 && target.grounded) { target.grounded = false; target.y -= 2; }
  events.push({ type: 'hit', x: target.x, y: target.y - 40, dmg, kb, victim: target.idx });
}

function applyShieldHit(target, hit, dirX, events) {
  target.shield -= hit.dmg * 1.1;
  target.vx = dirX * Math.min(9, hit.dmg * 0.7);
  if (target.shield <= 0) {
    target.shield = 0;
    target.act = ACT.SHIELDBREAK;
    target.actFrame = 0;
    target.stun = SHIELDBREAK_TICKS;
    events.push({ type: 'shieldbreak', x: target.x, y: target.y - 40, victim: target.idx });
  } else {
    target.act = ACT.SHIELDSTUN;
    target.actFrame = 0;
    target.stun = Math.floor(2 + hit.dmg * 1.2);
    events.push({ type: 'shieldhit', x: target.x, y: target.y - 40, dmg: hit.dmg, victim: target.idx });
  }
}

// ── per-player update ───────────────────────────────────────────────────────

function updatePlayer(p, inp, char, state, events) {
  const pressed = inp.b & ~p.prevB;
  const onPlat = p.act === ACT.RESPAWN;

  if (p.invuln > 0) p.invuln--;
  if (p.act !== ACT.SHIELD) p.shield = Math.min(SHIELD_MAX, p.shield + SHIELD_REGEN);

  // burning ticks away regardless of state (cleared on death)
  if (p.burnTicks > 0 && p.act !== ACT.DEAD && p.act !== ACT.RESPAWN) {
    if (--p.burnTimer <= 0) {
      p.burnTicks--;
      p.burnTimer = PASSIVE.BURN_INTERVAL;
      p.percent = Math.min(999, p.percent + PASSIVE.BURN_DMG);
      events.push({ type: 'burn', x: p.x, y: p.y - 40, victim: p.idx });
    }
  }

  // hitlag: completely frozen (juice + smash authenticity)
  if (p.hitlag > 0) { p.hitlag--; p.prevB = inp.b; return; }

  switch (p.act) {
    case ACT.DEAD: {
      p.respawnTimer--;
      if (p.respawnTimer <= 0 && p.stocks > 0) {
        p.x = 0; p.y = STAGE.respawnY; p.vx = 0; p.vy = 0;
        p.percent = 0; p.facing = 1;
        p.act = ACT.RESPAWN; p.actFrame = 0;
        p.platTimer = RESPAWN_PLATFORM_TICKS;
        p.invuln = RESPAWN_INVULN;
        p.jumpsLeft = airJumps(char); p.exhausted = false; p.fastFalling = false;
        p.floatT = PASSIVE.FLOAT_TICKS;
        p.stacks = 0; p.burnTicks = 0; p.burnTimer = 0;
        p.grounded = false; p.shield = SHIELD_MAX;
      }
      p.prevB = inp.b;
      return;
    }
    case ACT.RESPAWN: {
      p.platTimer--;
      const wantsOut = pressed || Math.abs(inp.x) > 0.3 || Math.abs(inp.y) > 0.3;
      if (p.platTimer <= 0 || wantsOut) {
        p.act = ACT.FREE; p.actFrame = 0;
      }
      p.prevB = inp.b;
      if (p.act === ACT.RESPAWN) return; // still hovering — no physics
      break;
    }
    case ACT.LEDGE: {
      p.ledgeTimer--;
      const towardStage = p.x < 0 ? 1 : -1;     // stage is at the center
      const inpToward = inp.x * towardStage;
      if (pressed & BTN.JUMP) {
        // ledge jump — big, keeps remaining invulnerability
        p.act = ACT.FREE; p.actFrame = 0;
        p.vy = -char.jumpVel * 1.12;
        p.vx = towardStage * 2.5;
        p.regrabTimer = LEDGE.regrabDelay;
        events.push({ type: 'djump', x: p.x, y: p.y, who: p.idx });
      } else if (pressed & BTN.ATTACK) {
        // getup attack
        p.x = towardStage > 0 ? -(STAGE.halfWidth - 34) : (STAGE.halfWidth - 34);
        p.y = STAGE.floorY; p.vx = 0; p.vy = 0;
        p.grounded = true;
        p.invuln = Math.max(p.invuln, 22);
        startMove(p, 'ftilt');
      } else if (inpToward > 0.5 || inp.y < -0.5) {
        // climb up
        p.x = towardStage > 0 ? -(STAGE.halfWidth - 30) : (STAGE.halfWidth - 30);
        p.y = STAGE.floorY; p.vx = 0; p.vy = 0;
        p.grounded = true;
        p.invuln = Math.max(p.invuln, 18);
        p.act = ACT.FREE; p.actFrame = 0;
      } else if (inpToward < -0.5 || inp.y > 0.5 || p.ledgeTimer <= 0) {
        // drop
        p.act = ACT.FREE; p.actFrame = 0;
        p.vy = 1;
        p.invuln = 0;
        p.regrabTimer = LEDGE.regrabDelay;
      }
      break;
    }
    case ACT.JUMPSQUAT: {
      p.actFrame++;
      if (p.actFrame >= JUMPSQUAT_TICKS) {
        const full = (inp.b & BTN.JUMP) !== 0;
        p.vy = -char.jumpVel * (full ? 1 : SHORT_HOP);
        p.grounded = false;
        p.jumpsLeft = airJumps(char);
        p.act = ACT.FREE; p.actFrame = 0;
        events.push({ type: 'jump', x: p.x, y: p.y, who: p.idx });
      }
      break;
    }
    case ACT.ATTACK: {
      p.actFrame++;
      const f = p.actFrame;
      if (isSpecialMove(p.moveId)) {
        const sp = char.specials[p.moveId];
        const chargeable = sp.type === 'projectile' || sp.type === 'quake' || sp.type === 'boom';
        if (chargeable && f === sp.fire &&
            (inp.b & BTN.SPECIAL) && p.charge < NB_CHARGE.max) {
          // holding special: charge instead of firing
          p.actFrame = sp.fire - 1;
          p.charge++;
        } else if (chargeable && f === sp.fire) {
          const t = p.charge / NB_CHARGE.max;
          const pr = {
            id: state.nextProjId++, owner: p.idx, charId: p.charId, kind: 'shot',
            x: p.x + p.facing * 46 * char.scale, y: p.y - 42 * char.scale,
            vx: sp.speed * (1 + NB_CHARGE.speed * t) * p.facing, vy: sp.vy0 ?? 0, grav: sp.grav ?? 0,
            r: sp.r * (1 + NB_CHARGE.size * t),
            dmg: sp.dmg * (1 + NB_CHARGE.dmg * t),
            angle: sp.angle,
            bkb: sp.bkb * (1 + NB_CHARGE.kb * t),
            kbg: sp.kbg * (1 + NB_CHARGE.kb * t),
            life: sp.life, cd: 0, slot: 0, aux: 0,
          };
          if (sp.type === 'quake') {
            // ground quake: a carrier wave that rolls outward erupting in
            // growing "bang" shockwaves — bigger & deadlier the further it
            // travels, and the whole thing scales with how long it charged.
            pr.kind = 'quake';
            pr.y = STAGE.floorY - 12;
            pr.vy = 0;
            pr.grav = p.grounded ? 0 : 0.6;          // airborne cast drops to the floor
            if (!p.grounded) pr.y = p.y - 20;
            pr.aux = pr.x;                            // remember the origin
            pr.slot = 0;                             // erupt on the first grounded tick
          } else if (sp.type === 'boom') {
            // boomerang: decelerates, then returns to its owner
            pr.kind = 'boom';
            pr.aux = sp.decel;
          }
          state.projectiles.push(pr);
          events.push({ type: 'shoot', x: p.x, y: p.y - 42, who: p.idx, charge: t });
          p.charge = 0;
        } else if (sp.type === 'orbit' && f === sp.fire) {
          // NOVA: spawn an orbiting shard (max 3); at 3, launch the oldest
          const mine = state.projectiles.filter(q => q.kind === 'orbit' && q.owner === p.idx);
          if (mine.length < 3) {
            const used = mine.map(q => q.slot);
            let slot = 0;
            while (used.includes(slot)) slot++;
            state.projectiles.push({
              id: state.nextProjId++, owner: p.idx, charId: p.charId, kind: 'orbit',
              x: p.x, y: p.y - 44 * char.scale, vx: 0, vy: 0, grav: 0,
              r: sp.r, dmg: sp.dmg, angle: sp.angle, bkb: sp.bkb, kbg: sp.kbg,
              life: 9999, cd: 0, slot, aux: 0,
            });
            events.push({ type: 'shard', x: p.x, y: p.y - 44, who: p.idx });
          } else {
            let oldest = mine[0];
            for (const q of mine) if (q.id < oldest.id) oldest = q;
            oldest.kind = 'shot';
            oldest.vx = sp.launchSpeed * p.facing;
            oldest.vy = 0;
            oldest.dmg = sp.launchDmg;
            oldest.bkb = sp.launchBkb;
            oldest.kbg = sp.launchKbg;
            oldest.life = sp.launchLife;
            events.push({ type: 'shoot', x: oldest.x, y: oldest.y, who: p.idx, charge: 0 });
          }
        } else if (sp.type === 'teleport' && f === sp.warp) {
          // VOLT: vanish and reappear ahead — zap everyone along the path
          const x0 = p.x;
          const x1 = Math.max(-STAGE.blastX + 120, Math.min(STAGE.blastX - 120, p.x + sp.dist * p.facing));
          p.x = x1;
          p.vy = Math.min(p.vy, 0);
          p.invuln = Math.max(p.invuln, sp.iframes);
          for (const tgt of state.players) {
            if (tgt.idx === p.idx || (p.hitMask & (1 << tgt.idx))) continue;
            if (tgt.invuln > 0 || tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN) continue;
            const lo = Math.min(x0, x1) - 20, hi = Math.max(x0, x1) + 20;
            if (tgt.x > lo && tgt.x < hi && Math.abs((tgt.y - 40) - (p.y - 40)) < 70) {
              p.hitMask |= 1 << tgt.idx;
              const tChar = CHARACTERS[tgt.charId];
              const dirX = Math.sign(x1 - x0) || p.facing;
              if (tgt.act === ACT.SHIELD && tgt.grounded) applyShieldHit(tgt, sp, dirX, events);
              else applyHit(tgt, tChar, sp, dirX, events, state, p, char);
            }
          }
          events.push({ type: 'teleport', x: x0, y: p.y - 40, x2: x1, who: p.idx });
        } else if (sp.type === 'zip') {
          // VOLT: angle-able zip — locks the held direction at startup
          if (f === sp.from) {
            let zx = inp.x, zy = inp.y;
            const m = Math.hypot(zx, zy);
            if (m < 0.3) { zx = 0; zy = -1; }
            else { zx /= m; zy /= m; }
            p.zx = zx; p.zy = zy;
            p.exhausted = true;
            if (zy < -0.1) p.grounded = false;
            events.push({ type: 'recover', x: p.x, y: p.y, who: p.idx });
          }
          if (f >= sp.from && f <= sp.to) {
            p.vx = p.zx * sp.speed;
            p.vy = p.zy * sp.speed;
          } else if (f === sp.to + 1) {
            p.vx *= 0.4; p.vy *= 0.4;
          }
        } else if (sp.type === 'hopback') {
          // EMBER: retreating hop that leaves a fire wall where she stood
          if (f === sp.from) {
            spawnPatch(state, p.idx, p.charId, p.x + p.facing * 6, sp.patch);
            p.vy = -sp.hop;
            p.grounded = false;
            events.push({ type: 'shoot', x: p.x, y: p.y - 20, who: p.idx, charge: 0 });
          }
          if (f >= sp.from && f <= sp.to) p.vx = -sp.speed * p.facing;
        } else if (sp.type === 'trap' && f === sp.plant) {
          // EMBER: plant a geyser glyph (one at a time — replanting moves it)
          for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const q = state.projectiles[i];
            if (q.kind === 'trap' && q.owner === p.idx) state.projectiles.splice(i, 1);
          }
          state.projectiles.push({
            id: state.nextProjId++, owner: p.idx, charId: p.charId, kind: 'trap',
            x: Math.max(-STAGE.halfWidth + 24, Math.min(STAGE.halfWidth - 24, p.x + p.facing * 36)),
            y: STAGE.floorY - 10, vx: 0, vy: 0, grav: 0,
            r: sp.r, dmg: sp.dmg, angle: sp.angle, bkb: sp.bkb, kbg: sp.kbg,
            life: sp.life, cd: 20, slot: 0, aux: 0,       // cd: arm delay
          });
          events.push({ type: 'plant', x: p.x + p.facing * 36, y: STAGE.floorY - 10, who: p.idx });
        } else if (sp.type === 'pull' && f >= sp.from && f <= sp.to) {
          // NOVA: black hole — drag enemies toward her before the detonation
          for (const tgt of state.players) {
            if (tgt.idx === p.idx) continue;
            if (tgt.invuln > 0 || tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN) continue;
            const dx = p.x - tgt.x, dy = (p.y - 40) - (tgt.y - 40);
            const d = Math.hypot(dx, dy);
            if (d > sp.pullR || d < 6) continue;
            const k = sp.pullAccel * (1 - d / sp.pullR * 0.5);
            tgt.vx += (dx / d) * k;
            if (!tgt.grounded) tgt.vy += (dy / d) * k * 0.8;
          }
        } else if (sp.type === 'dash' && f >= sp.from && f <= sp.to) {
          p.vx = sp.speed * p.facing;
          p.vy = Math.min(p.vy, 0.5);
          if (sp.ghost) p.invuln = Math.max(p.invuln, 2);   // intangible pass-through
        } else if (sp.type === 'recovery') {
          if (f === sp.from) {
            p.vy = sp.vy;
            p.exhausted = true;
            p.grounded = false;
            events.push({ type: 'recover', x: p.x, y: p.y, who: p.idx });
          } else if (f > sp.from && f <= sp.to) {
            p.vx += inp.x * (sp.drift * 0.18);
            p.vx = Math.max(-sp.drift, Math.min(sp.drift, p.vx));
          }
        }
      } else {
        const firstFrom = char.moves[p.moveId].hitboxes[0]?.from ?? 99;
        if (p.grounded && isSmashMove(p.moveId) && f === firstFrom &&
            (inp.b & BTN.ATTACK) && p.charge < SMASH_CHARGE.max) {
          // hold ATTACK at the wind-up to charge the smash (auto-swings at max)
          p.actFrame = firstFrom - 1;
          p.charge++;
        } else if (!p.grounded) {
          // aerial drift while attacking
          p.vx += inp.x * char.airAccel * AERIAL_DRIFT_IN_ATTACK;
          const cap = char.airSpeed;
          if (Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * Math.max(cap, Math.abs(p.vx) * 0.98);
          if (inp.y > 0.55 && p.vy > 0 && !p.fastFalling) {
            p.fastFalling = true;
            p.vy = Math.max(p.vy, char.fastFall * 0.92);
            events.push({ type: 'ffall', x: p.x, y: p.y, who: p.idx });
          }
        }
      }
      if (f >= moveTotal(char, p.moveId)) {
        p.act = ACT.FREE; p.actFrame = 0; p.moveId = ''; p.charge = 0;
      }
      break;
    }
    case ACT.GRAB: {
      p.actFrame++;
      p.vx *= 0.7;     // grabbing roots you in place
      if (p.grabbing < 0) {
        // ── reaching: look for a catch during the active window ──
        const f = p.actFrame;
        if (f >= GRAB.reachFrom && f <= GRAB.reachTo) {
          for (const tgt of state.players) {
            if (tgt.idx === p.idx) continue;
            if (tgt.invuln > 0 || !tgt.grounded) continue;
            if (tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN ||
                tgt.act === ACT.GRABBED || tgt.act === ACT.HITSTUN) continue;
            const dx = (tgt.x - p.x) * p.facing;          // + = in front
            if (dx > -12 && dx < GRAB.range && Math.abs(tgt.y - p.y) < GRAB.vert) {
              p.grabbing = tgt.idx;
              p.grabTimer = GRAB.holdMax;
              p.pummelCd = 0; p.actFrame = 0;
              tgt.act = ACT.GRABBED; tgt.actFrame = 0; tgt.moveId = '';
              tgt.grabbedBy = p.idx; tgt.grabMash = 0;
              tgt.vx = 0; tgt.vy = 0; tgt.stun = 0; tgt.charge = 0;
              tgt.facing = -p.facing;
              events.push({ type: 'grab', x: tgt.x, y: tgt.y - 40, who: p.idx, victim: tgt.idx });
              break;
            }
          }
        }
        if (p.grabbing < 0 && p.actFrame >= GRAB.total) {
          p.act = ACT.FREE; p.actFrame = 0; p.moveId = '';      // whiffed
        }
      } else {
        // ── holding: pin the victim, allow pummel / throw, auto-break on timer ──
        const v = state.players[p.grabbing];
        if (!v || v.grabbedBy !== p.idx || v.act !== ACT.GRABBED) {
          releaseGrab(state, p);
          p.act = ACT.FREE; p.actFrame = 0; p.moveId = '';
        } else {
          v.x = p.x + p.facing * GRAB.hold;
          v.y = p.y; v.vx = 0; v.vy = 0; v.grounded = p.grounded;
          v.facing = -p.facing;
          if (p.pummelCd > 0) p.pummelCd--;
          if (p.grabTimer > 0) p.grabTimer--;
          let mv = '';
          if (p.actFrame >= 3) {
            if (inp.y < -0.5) mv = 'uthrow';
            else if (inp.y > 0.5) mv = 'dthrow';
            else if (inp.x * p.facing > 0.5) mv = 'fthrow';
            else if (inp.x * p.facing < -0.5) mv = 'bthrow';
          }
          if (mv) {
            const th = THROWS[mv];
            const dirX = th.back ? -p.facing : p.facing;
            v.grabbedBy = -1; p.grabbing = -1;
            v.act = ACT.FREE;                                   // applyHit re-launches
            const vChar = CHARACTERS[v.charId];
            applyHit(v, vChar, th, dirX, events, state, p, char);
            events.push({ type: 'throw', x: p.x, y: p.y - 40, who: p.idx, victim: v.idx, dir: mv });
            p.act = ACT.FREE; p.actFrame = 0; p.moveId = '';
            p.stun = GRAB.throwLag;
          } else if ((pressed & BTN.ATTACK) && p.pummelCd === 0) {
            v.percent = Math.min(999, v.percent + GRAB.pummelDmg);
            p.pummelCd = GRAB.pummelCd;
            events.push({ type: 'pummel', x: v.x, y: v.y - 40, who: p.idx, victim: v.idx });
          } else if (p.grabTimer <= 0) {
            releaseGrab(state, p, true);                        // hold expired
            p.act = ACT.FREE; p.actFrame = 0; p.moveId = '';
          }
        }
      }
      break;
    }
    case ACT.GRABBED: {
      const h = p.grabbedBy >= 0 ? state.players[p.grabbedBy] : null;
      if (!h || h.grabbing !== p.idx) {
        releaseGrab(state, p);
        p.act = ACT.FREE; p.actFrame = 0;
      } else {
        // mash buttons / wiggle the stick to break free sooner (harder at high %)
        if (pressed) p.grabMash += GRAB.mashPerInput;
        if (Math.abs(inp.x - p.prevX) > 0.6) p.grabMash += GRAB.mashWiggle;
        const escape = 70 + p.percent * 0.55;
        h.grabTimer -= 1 + Math.floor(p.grabMash / 12);
        if (p.grabMash >= escape) {
          releaseGrab(state, p, true);
          p.act = ACT.FREE; p.actFrame = 0;
        }
      }
      break;
    }
    case ACT.SHIELD: {
      p.shield -= SHIELD_DRAIN;
      p.vx *= 0.8;
      if (p.shield <= 0) {
        p.shield = 0; p.act = ACT.SHIELDBREAK; p.actFrame = 0; p.stun = SHIELDBREAK_TICKS;
        events.push({ type: 'shieldbreak', x: p.x, y: p.y - 40, victim: p.idx });
      } else if (pressed & BTN.GRAB) {
        // shield-grab
        p.act = ACT.GRAB; p.actFrame = 0; p.moveId = 'grab'; p.grabbing = -1;
        events.push({ type: 'grabtry', x: p.x, y: p.y - 40, who: p.idx });
      } else if (pressed & BTN.JUMP) {
        p.act = ACT.JUMPSQUAT; p.actFrame = 0;
      } else if (Math.abs(inp.x) > 0.5 && Math.abs(p.prevX) < 0.5) {
        // flick the stick aside while shielding → roll dodge that way
        p.act = ACT.ROLL; p.actFrame = 0;
        p.rollDir = inp.x > 0 ? 1 : -1;
        events.push({ type: 'roll', x: p.x, y: p.y - 40, who: p.idx, dir: p.rollDir });
      } else if (!(inp.b & BTN.SHIELD)) {
        p.act = ACT.FREE; p.actFrame = 0;
      }
      break;
    }
    case ACT.ROLL: {
      p.actFrame++;
      const f = p.actFrame;
      // intangible through the middle of the roll
      if (f >= ROLL.invFrom && f <= ROLL.invTo) p.invuln = Math.max(p.invuln, 1);
      // slide along the ground with a smooth ease-in-out displacement profile
      const ease = (u) => 0.5 - 0.5 * Math.cos(Math.min(1, u) * Math.PI);
      const dxStep = ROLL.dist * (ease(f / ROLL.ticks) - ease((f - 1) / ROLL.ticks));
      // never roll off the stage — stop at the lip like a Smash roll
      p.x = Math.max(-STAGE.halfWidth + 6, Math.min(STAGE.halfWidth - 6, p.x + p.rollDir * dxStep));
      p.vx = 0; p.vy = 0;
      if (f >= ROLL.ticks) {
        p.act = (inp.b & BTN.SHIELD) ? ACT.SHIELD : ACT.FREE;
        p.actFrame = 0;
      }
      break;
    }
    case ACT.SHIELDSTUN: {
      p.stun--;
      p.vx *= 0.86;
      if (p.stun <= 0) {
        p.act = (inp.b & BTN.SHIELD) ? ACT.SHIELD : ACT.FREE;
        p.actFrame = 0;
      }
      break;
    }
    case ACT.SHIELDBREAK: {
      p.stun--;
      p.vx *= 0.85;
      if (p.stun <= 0) {
        p.act = ACT.FREE; p.actFrame = 0; p.shield = SHIELD_MAX;
      }
      break;
    }
    case ACT.HITSTUN: {
      p.stun--;
      p.vx *= KB_DECAY;
      // light DI: nudge trajectory
      p.vx += inp.x * 0.05;
      if (p.stun <= 0) { p.act = ACT.FREE; p.actFrame = 0; }
      break;
    }
    case ACT.FREE: {
      if (p.grounded) {
        if (pressed & BTN.GRAB) {
          if (Math.abs(inp.x) > 0.4) p.facing = inp.x > 0 ? 1 : -1;
          p.act = ACT.GRAB; p.actFrame = 0; p.moveId = 'grab'; p.grabbing = -1;
          events.push({ type: 'grabtry', x: p.x, y: p.y - 40, who: p.idx });
        } else if ((pressed & BTN.SHIELD) || (inp.b & BTN.SHIELD)) {
          p.act = ACT.SHIELD; p.actFrame = 0;
        } else if (pressed & BTN.ATTACK) {
          if (Math.abs(inp.x) > 0.4) p.facing = inp.x > 0 ? 1 : -1;
          startMove(p, pickGroundedMove(inp));
        } else if (pressed & BTN.SPECIAL) {
          if (Math.abs(inp.x) > 0.4) p.facing = inp.x > 0 ? 1 : -1;
          startMove(p, pickSpecial(inp));
        } else if (pressed & BTN.JUMP) {
          p.act = ACT.JUMPSQUAT; p.actFrame = 0;
        } else if (inp.y > 0.5 && Math.abs(inp.x) < 0.3) {
          // crouch: hold position, brake hard
          p.vx *= 0.7;
        } else {
          // walk / run / dash — smashing the stick gives an initial dash burst
          const tapped = Math.abs(inp.x) >= DASH.tapHi && Math.abs(p.prevX) < DASH.tapLo;
          if (tapped) p.dashTimer = DASH.ticks;
          if (Math.abs(inp.x) > 0.15) {
            p.facing = inp.x > 0 ? 1 : -1;
            let target;
            if (p.dashTimer > 0 && Math.abs(inp.x) > 0.3) {
              target = Math.sign(inp.x) * char.runSpeed * DASH.mult;
            } else if (Math.abs(inp.x) >= DASH.tapHi) {
              target = inp.x * char.runSpeed;
            } else {
              target = inp.x * char.runSpeed * DASH.walkMult;
            }
            p.vx += (target - p.vx) * 0.28;
          } else {
            p.vx *= char.friction;
          }
        }
      } else {
        // airborne
        if (pressed & BTN.ATTACK) {
          startMove(p, pickAerialMove(inp, p.facing));
        } else if (pressed & BTN.SPECIAL) {
          const sp = pickSpecial(inp);
          if (sp !== 'ub' || !p.exhausted) {
            if (Math.abs(inp.x) > 0.4 && sp !== 'ub') p.facing = inp.x > 0 ? 1 : -1;
            startMove(p, sp);
          }
        } else if ((pressed & BTN.JUMP) && p.jumpsLeft > 0) {
          p.jumpsLeft--;
          p.vy = -char.djVel;
          p.fastFalling = false;
          events.push({ type: 'djump', x: p.x, y: p.y, who: p.idx });
        }
        // drift
        p.vx += inp.x * char.airAccel;
        const cap = char.airSpeed;
        if (Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * Math.max(cap, Math.abs(p.vx) * 0.97);
        // fast fall — snaps to speed instantly, like smash
        if (inp.y > 0.55 && p.vy > 0 && !p.fastFalling) {
          p.fastFalling = true;
          p.vy = Math.max(p.vy, char.fastFall * 0.92);
          events.push({ type: 'ffall', x: p.x, y: p.y, who: p.idx });
        }
        // NOVA: float — hold jump past the apex to hover (budgeted)
        if (char.float && (inp.b & BTN.JUMP) && !(pressed & BTN.JUMP) &&
            p.vy >= 0 && !p.fastFalling && p.floatT > 0) {
          p.vy = -char.gravity + 0.06;     // gravity nets out to a gentle sink
          p.floatT--;
        }
        // TIDE: surf — hold jump while falling to glide down slowly
        if (char.surf && (inp.b & BTN.JUMP) && !(pressed & BTN.JUMP) &&
            p.vy > 0 && !p.fastFalling) {
          p.vy = Math.min(p.vy, char.fallSpeed * PASSIVE.SURF_MULT - char.gravity);
        }
      }
      break;
    }
  }

  p.prevB = inp.b;
}

// ── physics & stage ─────────────────────────────────────────────────────────

function tryLedgeGrab(p, char, events) {
  if (p.grounded || p.regrabTimer > 0 || p.invuln > 0 && p.act === ACT.RESPAWN) return;
  const canGrab =
    (p.act === ACT.FREE && p.vy > -2) ||
    (p.act === ACT.ATTACK && p.moveId === 'ub' && p.actFrame > char.specials.ub.from + 3);
  if (!canGrab) return;
  for (const side of [-1, 1]) {                  // -1 = left ledge, +1 = right
    const edgeX = side * STAGE.halfWidth;
    const dx = (p.x - edgeX) * side;             // + = outward from the stage
    if (dx > -LEDGE.grabInner && dx < LEDGE.grabW &&
        p.y > LEDGE.grabTop && p.y < LEDGE.grabBottom) {
      p.act = ACT.LEDGE; p.actFrame = 0; p.moveId = '';
      p.x = edgeX + side * LEDGE.hangX;
      p.y = LEDGE.hangY;
      p.vx = 0; p.vy = 0;
      p.facing = -side;                          // face the stage
      p.invuln = Math.max(p.invuln, LEDGE.invuln);
      p.jumpsLeft = airJumps(char);              // the ledge refreshes you
      p.exhausted = false;
      p.floatT = PASSIVE.FLOAT_TICKS;
      p.fastFalling = false;
      p.ledgeTimer = LEDGE.maxHang;
      events.push({ type: 'ledge', x: p.x, y: p.y, who: p.idx });
      return;
    }
  }
}

// solid stage body: circle (player) vs rect (platform slab) push-out
function stageBodyCollide(p, char) {
  if (p.grounded || p.act === ACT.LEDGE || p.act === ACT.DEAD || p.act === ACT.RESPAWN) return;
  const r = 26 * char.scale;
  const cx = p.x, cy = p.y - 38 * char.scale;
  const hw = STAGE.halfWidth, top = STAGE.floorY, bot = STAGE.floorY + STAGE.thickness;
  const nx = Math.max(-hw, Math.min(hw, cx));
  const ny = Math.max(top, Math.min(bot, cy));
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 < 0.0001) {
    // center inside the slab — eject through the nearest side
    if (cx + hw < hw - cx) { p.x = -hw - r; p.vx = Math.min(p.vx, 0); }
    else { p.x = hw + r; p.vx = Math.max(p.vx, 0); }
    return;
  }
  const d = Math.sqrt(d2);
  const push = (r - d) / d;
  p.x += dx * push;
  p.y += dy * push;
  if (dy > 0.3) {
    // bonked the underside
    p.vy = Math.max(p.vy, 1.2);
  }
  if (dx * p.vx < 0 && Math.abs(dx) > Math.abs(dy)) p.vx *= 0.2;
}

// grounded fighters gently shove each other apart (walk-off pressure)
function bodyPush(players) {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (!a.grounded || !b.grounded) continue;
      if (a.act === ACT.DEAD || b.act === ACT.DEAD || a.act === ACT.RESPAWN || b.act === ACT.RESPAWN) continue;
      if (a.act === ACT.GRABBED || b.act === ACT.GRABBED || a.act === ACT.GRAB || b.act === ACT.GRAB) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) >= BODY_PUSH.range) continue;
      const overlap = BODY_PUSH.range - Math.abs(dx);
      const dir = dx === 0 ? (a.idx < b.idx ? -1 : 1) : Math.sign(dx);
      const push = Math.min(BODY_PUSH.speed, overlap * BODY_PUSH.resolve);
      a.x -= dir * push / 2;
      b.x += dir * push / 2;
    }
  }
}

function physics(p, char, events) {
  if (p.act === ACT.DEAD || p.act === ACT.RESPAWN || p.act === ACT.LEDGE ||
      p.act === ACT.GRABBED) return;
  if (p.hitlag > 0) return;

  if (!p.grounded) {
    const maxFall = p.fastFalling ? char.fastFall : char.fallSpeed;
    p.vy += char.gravity;
    if (p.vy > maxFall) p.vy = maxFall;
  } else if (p.act !== ACT.FREE && p.act !== ACT.ATTACK) {
    // grounded non-free states already damp vx in their handlers
  } else if (p.act === ACT.ATTACK && !isSpecialMove(p.moveId)) {
    p.vx *= 0.86; // grounded attacks brake
  }

  p.x += p.vx;
  p.y += p.vy;

  // stage floor (one-way from above)
  const onStageX = p.x > -STAGE.halfWidth && p.x < STAGE.halfWidth;
  if (!p.grounded && p.vy >= 0 && onStageX && p.y >= STAGE.floorY && p.y - p.vy <= STAGE.floorY + 1) {
    p.y = STAGE.floorY;
    p.vy = 0;
    p.grounded = true;
    p.fastFalling = false;
    p.jumpsLeft = airJumps(char);
    p.exhausted = false;
    p.floatT = PASSIVE.FLOAT_TICKS;
    if (p.act === ACT.HITSTUN && p.stun > 12) {
      // tech-less landing: bounce slightly & keep brief stun
      p.stun = Math.min(p.stun, 12);
    }
    if (p.act === ACT.ATTACK && !isSpecialMove(p.moveId) && 'nair fair bair uair dair'.includes(p.moveId)) {
      // landing cancels aerials with tiny lag
      p.act = ACT.FREE; p.actFrame = 0; p.moveId = '';
    }
    events.push({ type: 'land', x: p.x, y: p.y, who: p.idx });
  }
  // walked off the edge — but slow walking teeters and stops at the brink
  if (p.grounded && !onStageX) {
    if (p.act === ACT.FREE && p.dashTimer === 0 && Math.abs(p.vx) < TEETER_SPEED &&
        Math.abs(p.x) - STAGE.halfWidth < Math.abs(p.vx) + 0.5) {
      p.x = Math.sign(p.x) * STAGE.halfWidth;
      p.vx = 0;
    } else {
      p.grounded = false;
      if (p.jumpsLeft < 1) p.jumpsLeft = 1;
    }
  }
  if (p.grounded) p.y = STAGE.floorY;

  stageBodyCollide(p, char);
  tryLedgeGrab(p, char, events);
}

function checkBlast(p, state, events) {
  if (p.act === ACT.DEAD) return;
  const out = p.x < -STAGE.blastX || p.x > STAGE.blastX ||
              p.y > STAGE.blastBottom || p.y < STAGE.blastTop;
  if (!out) return;
  p.stocks--;
  const side = p.x < -STAGE.blastX ? 'left' : p.x > STAGE.blastX ? 'right' : (p.y < 0 ? 'top' : 'bottom');
  events.push({ type: 'ko', x: Math.max(-STAGE.blastX, Math.min(STAGE.blastX, p.x)), y: Math.max(STAGE.blastTop, Math.min(STAGE.blastBottom, p.y)), victim: p.idx, side, stocksLeft: p.stocks });
  releaseGrab(state, p);
  p.act = ACT.DEAD;
  p.actFrame = 0;
  p.respawnTimer = RESPAWN_FREEZE;
  p.vx = 0; p.vy = 0; p.stun = 0; p.hitlag = 0; p.moveId = '';
  p.stacks = 0; p.burnTicks = 0; p.burnTimer = 0;
  p.x = 0; p.y = -2000; // park offscreen
}

// ── main step ───────────────────────────────────────────────────────────────

// inputs: array indexed by player idx → {b, x, y} | undefined (reuse last)
export function step(state, inputs) {
  const events = [];
  state.frame++;

  if (state.phase === PHASE.COUNTDOWN) {
    state.phaseTimer--;
    if (state.phaseTimer <= 0) {
      state.phase = PHASE.PLAYING;
      events.push({ type: 'go' });
    }
    // still record inputs so prevB is sane at GO
    for (const p of state.players) {
      const inp = inputs[p.idx] ?? p.lastIn;
      p.lastIn = inp;
      p.prevB = inp.b;
    }
    return events;
  }

  if (state.phase === PHASE.OVER) return events;

  // 1. inputs + state machines
  for (const p of state.players) {
    const inp = inputs[p.idx] ?? p.lastIn;
    const prevX = p.lastIn.x;
    p.lastIn = inp;
    if (p.regrabTimer > 0) p.regrabTimer--;
    if (p.dashTimer > 0) p.dashTimer--;
    updatePlayer(p, inp, CHARACTERS[p.charId], state, events);
    p.prevX = inp.x;
  }

  // 2. melee hit resolution
  for (const atk of state.players) {
    const aChar = CHARACTERS[atk.charId];
    const hbs = getActiveHitboxes(atk, aChar);
    if (!hbs.length) continue;
    for (const tgt of state.players) {
      if (tgt.idx === atk.idx) continue;
      if (atk.hitMask & (1 << tgt.idx)) continue;
      if (tgt.invuln > 0 || tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN ||
          tgt.act === ACT.GRABBED) continue;
      const tChar = CHARACTERS[tgt.charId];
      const crouched = isCrouching(tgt);
      const cx = tgt.x, cy = tgt.y - (crouched ? 28 : 40) * tChar.scale;
      const hr = tChar.hurtR * (crouched ? 0.85 : 1);
      for (const h of hbs) {
        const dx = h.x - cx, dy = h.y - cy;
        if (dx * dx + dy * dy <= (h.r + hr) * (h.r + hr)) {
          atk.hitMask |= 1 << tgt.idx;
          const dirX = tgt.x === atk.x ? atk.facing : Math.sign(tgt.x - atk.x);
          if (counterActive(tgt, tChar)) {
            // AEGIS: Verdict Counter — negate the blow, return it harder
            const sp = tChar.specials.db;
            tgt.invuln = Math.max(tgt.invuln, 26);
            tgt.actFrame = Math.max(tgt.actFrame, sp.to + 1);   // stance spent
            const back = Math.sign(atk.x - tgt.x) || tgt.facing;
            tgt.facing = back;                                  // turn to face the attacker
            applyHit(atk, aChar,
              { dmg: Math.max(sp.minDmg, h.dmg * sp.mult), angle: sp.angle, bkb: sp.bkb, kbg: sp.kbg, hl: sp.hl },
              back, events, state, tgt, tChar);
            events.push({ type: 'counter', x: tgt.x, y: tgt.y - 40, who: tgt.idx });
          } else if (tgt.act === ACT.SHIELD && tgt.grounded) {
            applyShieldHit(tgt, h, dirX, events);
          } else {
            applyHit(tgt, tChar, h, dirX, events, state, atk, aChar);
            const ahl = h.hl ?? 1;
            atk.hitlag = Math.min(ahl > 1 ? 20 : 12, Math.round((Math.floor(h.dmg * 0.4) + 1) * ahl));
          }
          break;
        }
      }
    }
  }

  // 3. projectiles (kind-aware: shot, quake, boom, patch, trap, orbit)
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    const kind = pr.kind || 'shot';
    const owner = state.players[pr.owner];
    const oChar = owner ? CHARACTERS[owner.charId] : null;

    // ── movement per kind ──
    if (kind === 'orbit') {
      // shards circle their owner as a moving shield
      if (!owner || owner.act === ACT.DEAD) { state.projectiles.splice(i, 1); continue; }
      const a = state.frame * 0.085 + pr.slot * ((Math.PI * 2) / 3);
      pr.x = owner.x + Math.cos(a) * 56;
      pr.y = owner.y - 44 * oChar.scale + Math.sin(a) * 20;
    } else if (kind === 'boom') {
      // boomerang: decelerate going out, then chase the owner's hand
      if (pr.cd === 0) {
        pr.vx -= Math.sign(pr.vx) * pr.aux;
        if (Math.abs(pr.vx) < 0.6) pr.cd = 1;             // turn around
      } else if (owner && owner.act !== ACT.DEAD) {
        const hx = owner.x, hy = owner.y - 40;
        pr.vx += Math.sign(hx - pr.x) * 1.0;
        pr.vx = Math.max(-16, Math.min(16, pr.vx));
        pr.y += (hy - pr.y) * 0.1;
        if (Math.abs(hx - pr.x) < 30 && Math.abs(hy - pr.y) < 50) {
          state.projectiles.splice(i, 1);                  // caught!
          events.push({ type: 'catch', x: pr.x, y: pr.y, who: pr.owner });
          continue;
        }
      }
      pr.x += pr.vx;
    } else if (kind === 'patch' || kind === 'trap') {
      // stationary floor hazards
      if (pr.cd > 0) pr.cd--;
    } else {
      pr.vy += pr.grav;
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (kind === 'quake' && pr.y >= STAGE.floorY - 12 &&
          pr.x > -STAGE.halfWidth && pr.x < STAGE.halfWidth) {
        pr.y = STAGE.floorY - 12;                          // hug the floor
        pr.vy = 0; pr.grav = 0;
      }
      if (kind === 'quake' && pr.grav === 0 && pr.y >= STAGE.floorY - 16 &&
          pr.x > -STAGE.halfWidth && pr.x < STAGE.halfWidth) {
        // erupt periodically — each bang grows with distance from the origin
        if (pr.slot <= 0) {
          const d01 = Math.min(1, Math.abs(pr.x - pr.aux) / STAGE.halfWidth);
          const grow = 1 + d01 * 1.6;        // bigger & deadlier further away
          state.projectiles.push({
            id: state.nextProjId++, owner: pr.owner, charId: pr.charId, kind: 'shock',
            x: pr.x, y: STAGE.floorY - 6, vx: 0, vy: 0, grav: 0,
            r: pr.r * (0.55 + grow * 0.5), dmg: pr.dmg * grow, angle: 86,
            bkb: pr.bkb * grow, kbg: pr.kbg * grow,
            life: 14, cd: 0, slot: Math.round(d01 * 10), aux: pr.id,  // aux → carrier id
          });
          events.push({ type: 'quakestep', x: pr.x, y: STAGE.floorY, charId: pr.charId, power: d01 });
          pr.slot = 6;                       // ticks between bangs
        } else {
          pr.slot--;
        }
      }
    }
    if (kind !== 'orbit') pr.life--;
    let dead = pr.life <= 0;

    // ── environment death per kind ──
    if (!dead && kind === 'shot' &&
        pr.y > STAGE.floorY - 4 && pr.x > -STAGE.halfWidth && pr.x < STAGE.halfWidth) {
      dead = true;
      events.push({ type: 'projhit', x: pr.x, y: STAGE.floorY, charId: pr.charId });
      // EMBER: wildfire orb leaves a burning patch where it lands
      const patch = oChar?.specials?.nb?.patch;
      if (patch && pr.charId === 'ember') spawnPatch(state, pr.owner, pr.charId, pr.x, patch);
    }
    if (!dead && kind === 'quake' &&
        (pr.x < -STAGE.halfWidth || pr.x > STAGE.halfWidth) && pr.y >= STAGE.floorY - 14) {
      dead = true;                                          // crawled off the edge
      events.push({ type: 'projhit', x: pr.x, y: pr.y, charId: pr.charId });
    }
    if (!dead && kind !== 'patch' && kind !== 'trap' && kind !== 'orbit' &&
        (pr.x < -STAGE.blastX || pr.x > STAGE.blastX || pr.y > STAGE.blastBottom)) dead = true;

    // ── player interaction (the quake carrier itself never hits — its shocks do) ──
    if (!dead && kind !== 'quake') {
      // A quake erupts a fresh shock every few ticks along its path; without
      // this they'd all rake the same target. The shocks share one "already
      // hit" bitmask on their carrier (cd) so a single wave strikes each
      // opponent only once.
      const quakeCarrier = kind === 'shock'
        ? state.projectiles.find(q => q.kind === 'quake' && q.id === pr.aux)
        : null;
      for (const tgt of state.players) {
        if (tgt.idx === pr.owner) continue;
        if (tgt.invuln > 0 || tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN ||
            tgt.act === ACT.GRABBED) continue;
        const tChar = CHARACTERS[tgt.charId];
        const crouched = isCrouching(tgt);
        const cx = tgt.x, cy = tgt.y - (crouched ? 28 : 40) * tChar.scale;
        const thr = tChar.hurtR * (crouched ? 0.85 : 1);
        const dx = pr.x - cx, dy = pr.y - cy;
        if (dx * dx + dy * dy > (pr.r + thr) * (pr.r + thr)) continue;
        const dirX = pr.vx === 0 ? Math.sign(cx - pr.x) || 1 : Math.sign(pr.vx);

        // TIDE: Whirlpool Guard sends projectiles back at 1.2× power
        if ((kind === 'shot' || kind === 'boom') && reflectActive(tgt, tChar)) {
          pr.owner = tgt.idx;
          pr.charId = tgt.charId;
          pr.kind = 'shot';
          pr.vx = -dirX * Math.max(7, Math.abs(pr.vx) * 1.1);
          pr.vy = Math.min(pr.vy, 0);
          pr.grav = 0;
          pr.dmg *= 1.2;
          pr.life = Math.max(pr.life, 70);
          events.push({ type: 'reflect', x: pr.x, y: pr.y, who: tgt.idx });
          break;
        }
        // AEGIS: counter stance simply annuls projectiles
        if (counterActive(tgt, tChar)) {
          tgt.invuln = Math.max(tgt.invuln, 16);
          dead = true;
          events.push({ type: 'counter', x: tgt.x, y: tgt.y - 40, who: tgt.idx });
          break;
        }

        if (kind === 'patch') {
          if (pr.cd > 0) break;                             // re-hit cooldown
          if (tgt.act === ACT.SHIELD && tgt.grounded) applyShieldHit(tgt, pr, dirX, events);
          else applyHit(tgt, tChar, pr, dirX, events, state, owner, oChar);
          pr.cd = pr.aux;                                   // patches persist
          events.push({ type: 'projhit', x: pr.x, y: pr.y - 10, charId: pr.charId });
          break;
        }
        if (kind === 'trap') {
          if (pr.cd > 0) break;                             // still arming
          if (tgt.act === ACT.SHIELD && tgt.grounded) applyShieldHit(tgt, pr, dirX, events);
          else applyHit(tgt, tChar, pr, dirX, events, state, owner, oChar);
          events.push({ type: 'erupt', x: pr.x, y: pr.y, charId: pr.charId });
          dead = true;
          break;
        }
        if (quakeCarrier) {
          const bit = 1 << tgt.idx;
          if (quakeCarrier.cd & bit) continue;   // this wave already hit them
          quakeCarrier.cd |= bit;
        }
        if (tgt.act === ACT.SHIELD && tgt.grounded) applyShieldHit(tgt, pr, dirX, events);
        else applyHit(tgt, tChar, pr, dirX, events, state, owner, oChar);
        events.push({ type: 'projhit', x: pr.x, y: pr.y, charId: pr.charId });
        dead = true;
        break;
      }
    }
    if (dead) state.projectiles.splice(i, 1);
  }

  // 4. physics + blast zones + body push
  for (const p of state.players) {
    physics(p, CHARACTERS[p.charId], events);
  }
  bodyPush(state.players);
  for (const p of state.players) {
    checkBlast(p, state, events);
  }

  // 5. match end
  const alive = state.players.filter(p => p.stocks > 0);
  if (alive.length <= 1 && state.players.length > 1) {
    state.phase = PHASE.OVER;
    state.winner = alive.length ? alive[0].idx : -1;
    events.push({ type: 'gameover', winner: state.winner });
  }

  return events;
}

// ── serialization (compact arrays for the wire) ─────────────────────────────

const P_FIELDS = [
  'x', 'y', 'vx', 'vy', 'facing', 'percent', 'stocks', 'jumpsLeft',
  'act', 'actFrame', 'hitMask', 'stun', 'hitlag', 'shield', 'invuln',
  'respawnTimer', 'platTimer', 'prevB', 'prevX', 'dashTimer',
  'ledgeTimer', 'regrabTimer', 'rollDir', 'charge',
  'stacks', 'burnTicks', 'burnTimer', 'floatT', 'zx', 'zy',
  'grabbing', 'grabbedBy', 'grabTimer', 'grabMash', 'pummelCd',
];

export function serializeState(state) {
  return {
    f: state.frame, ph: state.phase, pt: state.phaseTimer, w: state.winner,
    np: state.nextProjId,
    pl: state.players.map(p => [
      p.uid, p.charId, p.moveId,
      p.grounded ? 1 : 0, p.exhausted ? 1 : 0, p.fastFalling ? 1 : 0,
      p.lastIn.b, p.lastIn.x, p.lastIn.y,
      ...P_FIELDS.map(k => p[k]),
    ]),
    pr: state.projectiles.map(pr => [
      pr.id, pr.owner, pr.charId, pr.x, pr.y, pr.vx, pr.vy, pr.grav,
      pr.r, pr.dmg, pr.angle, pr.bkb, pr.kbg, pr.life,
      pr.kind || 'shot', pr.cd || 0, pr.slot || 0, pr.aux || 0,
    ]),
  };
}

export function deserializeState(s) {
  return {
    frame: s.f, phase: s.ph, phaseTimer: s.pt, winner: s.w, nextProjId: s.np,
    players: s.pl.map((a, idx) => {
      const p = {
        uid: a[0], charId: a[1], moveId: a[2], idx,
        grounded: !!a[3], exhausted: !!a[4], fastFalling: !!a[5],
        lastIn: { b: a[6], x: a[7], y: a[8] },
      };
      P_FIELDS.forEach((k, i) => { p[k] = a[9 + i]; });
      return p;
    }),
    projectiles: s.pr.map(a => ({
      id: a[0], owner: a[1], charId: a[2], x: a[3], y: a[4], vx: a[5], vy: a[6],
      grav: a[7], r: a[8], dmg: a[9], angle: a[10], bkb: a[11], kbg: a[12], life: a[13],
      kind: a[14] ?? 'shot', cd: a[15] ?? 0, slot: a[16] ?? 0, aux: a[17] ?? 0,
    })),
  };
}

export function cloneState(state) {
  return deserializeState(serializeState(state));
}
