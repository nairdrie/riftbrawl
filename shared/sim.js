// ─────────────────────────────────────────────────────────────────────────────
// SMASH — deterministic simulation core.
// Runs authoritatively on the server at 60Hz and speculatively on the client
// (prediction + reconciliation). Pure function of (state, inputs).
// ─────────────────────────────────────────────────────────────────────────────

import {
  STAGE, BTN, ACT, PHASE, STOCKS, COUNTDOWN_TICKS,
  RESPAWN_FREEZE, RESPAWN_INVULN, RESPAWN_PLATFORM_TICKS,
  SHIELD_MAX, SHIELD_DRAIN, SHIELD_REGEN, SHIELDBREAK_TICKS,
  LEDGE, DASH, CROUCH_KB, BODY_PUSH, TEETER_SPEED, NB_CHARGE,
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
    grounded: true, jumpsLeft: 1,
    act: ACT.FREE, actFrame: 0, moveId: '',
    hitMask: 0, stun: 0, hitlag: 0,
    shield: SHIELD_MAX, invuln: 0,
    respawnTimer: 0, platTimer: 0,
    exhausted: false, fastFalling: false,
    prevB: 0, prevX: 0,
    dashTimer: 0, ledgeTimer: 0, regrabTimer: 0,
    charge: 0,
    lastIn: { b: 0, x: 0, y: 0 },
  };
}

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

function moveTotal(char, moveId) {
  return isSpecialMove(moveId) ? char.specials[moveId].total : char.moves[moveId].total;
}

// Active world-space hitboxes for a player this frame (empty if none).
export function getActiveHitboxes(p, char) {
  if (p.act !== ACT.ATTACK || p.hitlag > 0) return [];
  const f = p.actFrame;
  const out = [];
  if (isSpecialMove(p.moveId)) {
    const sp = char.specials[p.moveId];
    if (sp.type !== 'projectile' && f >= sp.from && f <= sp.to) {
      out.push({
        x: p.x + (sp.dx ?? 0) * p.facing, y: p.y - 40 * char.scale + (sp.dy ?? 0),
        r: sp.r, dmg: sp.dmg, angle: sp.angle, bkb: sp.bkb, kbg: sp.kbg,
      });
    }
  } else {
    for (const hbx of char.moves[p.moveId].hitboxes) {
      if (f >= hbx.from && f <= hbx.to) {
        out.push({
          x: p.x + hbx.dx * p.facing, y: p.y - 40 * char.scale + hbx.dy,
          r: hbx.r, dmg: hbx.dmg, angle: hbx.angle, bkb: hbx.bkb, kbg: hbx.kbg,
        });
      }
    }
  }
  return out;
}

function applyHit(target, tChar, hit, dirX, events, state) {
  target.percent = Math.min(999, target.percent + hit.dmg);
  let kb = knockback(target.percent, tChar.weight, hit.bkb, hit.kbg);
  if (isCrouching(target)) kb *= CROUCH_KB;   // crouch cancel
  const rad = (hit.angle * Math.PI) / 180;
  target.vx = Math.cos(rad) * kb * dirX;
  target.vy = -Math.sin(rad) * kb;
  target.stun = Math.floor(kb * 2.0 + hit.dmg * 0.4);
  target.hitlag = Math.min(14, Math.floor(hit.dmg * 0.45) + 2);
  target.act = ACT.HITSTUN;
  target.actFrame = 0;
  target.moveId = '';
  target.fastFalling = false;
  target.charge = 0;
  if (target.vy < 0 && target.grounded) { target.grounded = false; target.y -= 2; }
  events.push({ type: 'hit', x: target.x, y: target.y - 40, dmg: hit.dmg, kb, victim: target.idx });
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
        p.jumpsLeft = 1; p.exhausted = false; p.fastFalling = false;
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
        p.jumpsLeft = 1;
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
        if (sp.type === 'projectile' && f === sp.fire &&
            (inp.b & BTN.SPECIAL) && p.charge < NB_CHARGE.max) {
          // holding special: charge instead of firing
          p.actFrame = sp.fire - 1;
          p.charge++;
        } else if (sp.type === 'projectile' && f === sp.fire) {
          const t = p.charge / NB_CHARGE.max;
          state.projectiles.push({
            id: state.nextProjId++, owner: p.idx, charId: p.charId,
            x: p.x + p.facing * 46 * char.scale, y: p.y - 42 * char.scale,
            vx: sp.speed * (1 + NB_CHARGE.speed * t) * p.facing, vy: sp.vy0, grav: sp.grav,
            r: sp.r * (1 + NB_CHARGE.size * t),
            dmg: sp.dmg * (1 + NB_CHARGE.dmg * t),
            angle: sp.angle,
            bkb: sp.bkb * (1 + NB_CHARGE.kb * t),
            kbg: sp.kbg * (1 + NB_CHARGE.kb * t),
            life: sp.life,
          });
          events.push({ type: 'shoot', x: p.x, y: p.y - 42, who: p.idx, charge: t });
          p.charge = 0;
        } else if (sp.type === 'dash' && f >= sp.from && f <= sp.to) {
          p.vx = sp.speed * p.facing;
          p.vy = Math.min(p.vy, 0.5);
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
      if (f >= moveTotal(char, p.moveId)) {
        p.act = ACT.FREE; p.actFrame = 0; p.moveId = '';
      }
      break;
    }
    case ACT.SHIELD: {
      p.shield -= SHIELD_DRAIN;
      p.vx *= 0.8;
      if (p.shield <= 0) {
        p.shield = 0; p.act = ACT.SHIELDBREAK; p.actFrame = 0; p.stun = SHIELDBREAK_TICKS;
        events.push({ type: 'shieldbreak', x: p.x, y: p.y - 40, victim: p.idx });
      } else if (pressed & BTN.JUMP) {
        p.act = ACT.JUMPSQUAT; p.actFrame = 0;
      } else if (!(inp.b & BTN.SHIELD)) {
        p.act = ACT.FREE; p.actFrame = 0;
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
        if ((pressed & BTN.SHIELD) || (inp.b & BTN.SHIELD)) {
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
      p.jumpsLeft = 1;                           // the ledge refreshes you
      p.exhausted = false;
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
  if (p.act === ACT.DEAD || p.act === ACT.RESPAWN || p.act === ACT.LEDGE) return;
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
    p.jumpsLeft = 1;
    p.exhausted = false;
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
  p.act = ACT.DEAD;
  p.actFrame = 0;
  p.respawnTimer = RESPAWN_FREEZE;
  p.vx = 0; p.vy = 0; p.stun = 0; p.hitlag = 0; p.moveId = '';
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
      if (tgt.invuln > 0 || tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN) continue;
      const tChar = CHARACTERS[tgt.charId];
      const crouched = isCrouching(tgt);
      const cx = tgt.x, cy = tgt.y - (crouched ? 28 : 40) * tChar.scale;
      const hr = tChar.hurtR * (crouched ? 0.85 : 1);
      for (const h of hbs) {
        const dx = h.x - cx, dy = h.y - cy;
        if (dx * dx + dy * dy <= (h.r + hr) * (h.r + hr)) {
          atk.hitMask |= 1 << tgt.idx;
          const dirX = tgt.x === atk.x ? atk.facing : Math.sign(tgt.x - atk.x);
          if (tgt.act === ACT.SHIELD && tgt.grounded) {
            applyShieldHit(tgt, h, dirX, events);
          } else {
            applyHit(tgt, tChar, h, dirX, events, state);
            atk.hitlag = Math.min(12, Math.floor(h.dmg * 0.4) + 1);
          }
          break;
        }
      }
    }
  }

  // 3. projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.vy += pr.grav;
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.life--;
    let dead = pr.life <= 0;
    // stage collision
    if (!dead && pr.y > STAGE.floorY - 4 && pr.x > -STAGE.halfWidth && pr.x < STAGE.halfWidth) {
      dead = true;
      events.push({ type: 'projhit', x: pr.x, y: STAGE.floorY, charId: pr.charId });
    }
    if (!dead && (pr.x < -STAGE.blastX || pr.x > STAGE.blastX || pr.y > STAGE.blastBottom)) dead = true;
    if (!dead) {
      for (const tgt of state.players) {
        if (tgt.idx === pr.owner) continue;
        if (tgt.invuln > 0 || tgt.act === ACT.DEAD || tgt.act === ACT.RESPAWN) continue;
        const tChar = CHARACTERS[tgt.charId];
        const crouched = isCrouching(tgt);
        const cx = tgt.x, cy = tgt.y - (crouched ? 28 : 40) * tChar.scale;
        const thr = tChar.hurtR * (crouched ? 0.85 : 1);
        const dx = pr.x - cx, dy = pr.y - cy;
        if (dx * dx + dy * dy <= (pr.r + thr) * (pr.r + thr)) {
          const dirX = pr.vx === 0 ? 1 : Math.sign(pr.vx);
          if (tgt.act === ACT.SHIELD && tgt.grounded) applyShieldHit(tgt, pr, dirX, events);
          else applyHit(tgt, tChar, pr, dirX, events, state);
          events.push({ type: 'projhit', x: pr.x, y: pr.y, charId: pr.charId });
          dead = true;
          break;
        }
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
  'ledgeTimer', 'regrabTimer', 'charge',
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
    })),
  };
}

export function cloneState(state) {
  return deserializeState(serializeState(state));
}
