// ─────────────────────────────────────────────────────────────────────────────
// MatchClient: the netplay loop.
//   • local player → client-side prediction, replayed over server snapshots
//   • remote players & projectiles → interpolated snapshot buffer (~70ms)
//   • FX/SFX derived by observing the rendered view frame-to-frame
// ─────────────────────────────────────────────────────────────────────────────

import { step, deserializeState, cloneState } from '/shared/sim.js';
import { CHARACTERS } from '/shared/characters.js';
import { MS_PER_TICK, ACT, PHASE } from '/shared/constants.js';
import { net } from './net.js';
import { sampleInput, samplePauseEdge, rumble } from './input.js';
import { sfx } from './sfx.js';

const INTERP_DELAY = 70;   // ms behind server for remote interpolation
const lerp = (a, b, t) => a + (b - a) * t;

export class MatchClient {
  constructor({ renderer, players, myUid }) {
    this.renderer = renderer;
    this.meta = players;                       // [{uid, username, charId, idx, bot}]
    this.myIdx = players.findIndex(p => p.uid === myUid);
    this.pred = null;                          // predicted sim state
    this.pending = [];                         // unacked local inputs
    this.seq = 0;
    this.sentAt = new Map();                   // seq → timestamp (for rtt)
    this.rtt = 0;
    this.snaps = [];                           // [{at, state}]
    this.smooth = { x: 0, y: 0 };              // reconciliation error smoothing
    this.prevObs = null;                       // previous rendered view (for FX)
    this.lastCount = -1;
    this.running = false;
    this.acc = 0;
    this.lastT = 0;
    this.over = false;
    this.paused = false;
    this.pausedBy = '';
    this.resumeT = 0;          // local time the match resumes
    this.lastResumeCount = -1;
    this.pauseEl = document.getElementById('pause-menu');
    this.pauseByEl = document.getElementById('pause-by');
  }

  // Toggle the interactive (DOM) pause menu. Shown for a normal local/opponent
  // pause; hidden once a resume countdown starts (the canvas draws that) or the
  // match ends.
  syncPauseMenu() {
    if (!this.pauseEl) return;
    const show = this.paused && !this.resumeT && !this.over && this.running;
    this.pauseEl.classList.toggle('open', show);
    if (show && this.pauseByEl) this.pauseByEl.textContent = this.pausedBy ? `by ${this.pausedBy}` : '';
  }

  onPaused(msg) {
    this.paused = true;
    this.pausedBy = msg.reason === 'disconnected' ? `${msg.by} — connection lost` : msg.by;
    this.resumeT = 0;
    sfx.count();
  }

  onResuming(msg) {
    this.resumeT = performance.now() + (msg.inMs || 3200);
  }

  onResumed() {
    this.paused = false;
    this.pausedBy = '';
    this.resumeT = 0;
    this.lastResumeCount = -1;
    this.acc = 0;
    this.renderer.setAnnounce('GO!', '', 0.7, '#41d9ff');
    sfx.go();
  }

  init(snap) {
    this.pred = deserializeState(snap);
    this.snaps = [{ at: performance.now(), state: deserializeState(snap) }];
  }

  resync(msg) {
    this.pred = deserializeState(msg.s);
    this.snaps = [{ at: performance.now(), state: deserializeState(msg.s) }];
    this.pending = [];
    this.smooth.x = 0; this.smooth.y = 0;
    this.prevObs = null;
    this.acc = 0;
    this.over = this.pred.phase === PHASE.OVER;
    this.paused = !!msg.paused;
    if (this.paused) this.pausedBy = 'reconnected';
  }

  connectionLost() {
    this.paused = true;
    this.pausedBy = '— connection lost —';
    this.resumeT = 0;
  }

  start() {
    this.running = true;
    this.lastT = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      // schedule next frame FIRST so a bad frame can never kill the loop
      requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(100, now - this.lastT));
      this.lastT = now;
      this.acc += dt;
      let n = 0;
      while (this.acc >= MS_PER_TICK && n++ < 6) {
        this.tick();
        this.acc -= MS_PER_TICK;
      }
      if (n >= 6) this.acc = 0;
      try {
        this.frame(dt / 1000, now);
      } catch (e) {
        console.error('render frame failed:', e);
      }
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; this.pauseEl?.classList.remove('open'); }

  tick() {
    if (!this.pred || this.over) return;
    if (samplePauseEdge()) {
      if (!this.paused) net.send({ t: 'pause' });
      else if (!this.resumeT) net.send({ t: 'unpause' });
    }
    if (this.paused) return;   // frozen — no inputs, no prediction
    const inp = sampleInput();
    this.seq++;
    net.send({ t: 'input', seq: this.seq, b: inp.b, x: inp.x, y: inp.y });
    this.sentAt.set(this.seq, performance.now());
    if (this.sentAt.size > 240) {
      const old = this.seq - 240;
      for (const k of this.sentAt.keys()) if (k < old) this.sentAt.delete(k);
    }
    this.pending.push({ seq: this.seq, inp });
    if (this.pending.length > 180) this.pending.shift();
    const inputs = [];
    if (this.myIdx >= 0) inputs[this.myIdx] = inp;
    step(this.pred, inputs);
  }

  onSnap(msg) {
    if (!this.pred) return;
    const auth = deserializeState(msg.s);
    const now = performance.now();
    this.snaps.push({ at: now, state: auth });
    while (this.snaps.length > 30) this.snaps.shift();

    if (this.sentAt.has(msg.ack)) {
      const r = now - this.sentAt.get(msg.ack);
      this.rtt = this.rtt ? lerp(this.rtt, r, 0.15) : r;
    }

    // reconcile: rebase prediction on authoritative state, replay unacked inputs
    const me = this.myIdx >= 0 ? this.pred.players[this.myIdx] : null;
    const oldX = me?.x ?? 0, oldY = me?.y ?? 0;

    this.pending = this.pending.filter(p => p.seq > msg.ack);
    const re = cloneState(auth);
    for (const p of this.pending) {
      const inputs = [];
      if (this.myIdx >= 0) inputs[this.myIdx] = p.inp;
      step(re, inputs);
    }
    this.pred = re;

    if (me && this.myIdx >= 0) {
      const nMe = this.pred.players[this.myIdx];
      const ex = oldX - nMe.x, ey = oldY - nMe.y;
      // fold small errors into a decaying visual offset; snap on big ones
      if (Math.abs(ex) < 90 && Math.abs(ey) < 90) {
        this.smooth.x = Math.max(-90, Math.min(90, this.smooth.x + ex));
        this.smooth.y = Math.max(-90, Math.min(90, this.smooth.y + ey));
      } else {
        this.smooth.x = 0; this.smooth.y = 0;
      }
    }

    for (const e of msg.ev || []) {
      if (e.type === 'go') { this.renderer.setAnnounce('GO!', '', 0.8, '#41d9ff'); sfx.go(); }
    }
  }

  // build the composited render view
  buildView(now) {
    const renderT = now - INTERP_DELAY;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].at <= renderT && this.snaps[i + 1].at >= renderT) {
        a = this.snaps[i]; b = this.snaps[i + 1];
        break;
      }
    }
    const span = Math.max(1, b.at - a.at);
    const k = Math.max(0, Math.min(1, (renderT - a.at) / span));

    const players = this.pred.players.map((pp, idx) => {
      if (idx === this.myIdx) {
        const v = { ...pp };
        v.x += this.smooth.x;
        v.y += this.smooth.y;
        return v;
      }
      const pa = a.state.players[idx], pb = b.state.players[idx];
      if (!pa || !pb) return pp;
      const v = { ...pb };
      if (pa.act !== ACT.DEAD && pb.act !== ACT.DEAD) {
        v.x = lerp(pa.x, pb.x, k);
        v.y = lerp(pa.y, pb.y, k);
      }
      return v;
    });

    const projectiles = [];
    for (const pr of this.pred.projectiles) {
      if (pr.owner === this.myIdx) projectiles.push(pr);
    }
    for (const pr of b.state.projectiles) {
      if (pr.owner === this.myIdx) continue;
      const prev = a.state.projectiles.find(q => q.id === pr.id);
      const v = { ...pr };
      if (prev) { v.x = lerp(prev.x, pr.x, k); v.y = lerp(prev.y, pr.y, k); }
      projectiles.push(v);
    }

    return {
      players, projectiles,
      meta: this.meta, myIdx: this.myIdx,
      phase: this.pred.phase, phaseTimer: this.pred.phaseTimer,
    };
  }

  // FX from observing view transitions
  observe(view) {
    const prev = this.prevObs;
    this.prevObs = {
      players: view.players.map(p => ({
        x: p.x, y: p.y, percent: p.percent, stocks: p.stocks,
        grounded: p.grounded, act: p.act, vy: p.vy, shield: p.shield, moveId: p.moveId,
        fastFalling: p.fastFalling, charge: p.charge, stacks: p.stacks,
      })),
      phase: view.phase,
    };
    if (!prev) return;

    // countdown announcements
    if (view.phase === PHASE.COUNTDOWN) {
      const num = Math.ceil(view.phaseTimer / 60);
      if (num !== this.lastCount && num >= 1 && num <= 3) {
        this.lastCount = num;
        this.renderer.setAnnounce(`${num}`, '', 0.7, '#ffffff');
        sfx.count();
      }
    }

    for (let i = 0; i < view.players.length; i++) {
      const p = view.players[i], q = prev.players[i];
      if (!q) continue;
      const char = CHARACTERS[p.charId];

      // damage taken
      if (p.percent > q.percent + 0.01 && p.act !== ACT.DEAD) {
        const dmg = p.percent - q.percent;
        if (p.act === ACT.GRABBED) {
          // being pummelled while held — lighter feedback than a launching hit
          this.renderer.hitSpark(p.x, p.y - 44, dmg * 0.6, char.colors.accent);
          sfx.pummel();
          if (i === this.myIdx) rumble(0.4, 0.5, 90);
        } else {
          this.renderer.hitSpark(p.x, p.y - 40, dmg, char.colors.accent);
          sfx.hit(dmg);
          this.renderer.shake(Math.min(22, 3 + dmg * 1.4));
          if (i === this.myIdx) rumble(Math.min(1, 0.3 + dmg * 0.06), 0.5, 90 + dmg * 14);
          else rumble(0.12, 0.3, 60);   // you landed the hit
        }
      }
      // shield chip
      if (p.shield < q.shield - 1.5 && p.act !== ACT.SHIELD) { /* drained out */ }
      else if (p.shield < q.shield - 2.5) { sfx.shieldHit(); }
      if (p.act === ACT.SHIELDBREAK && q.act !== ACT.SHIELDBREAK) sfx.shieldBreak();

      // KO
      if (p.stocks < q.stocks) {
        this.renderer.koBlast(q.x, Math.min(q.y - 40, 80), char.colors.glow);
        this.renderer.shake(26);
        sfx.ko();
        if (i === this.myIdx) rumble(1, 1, 550);
        else rumble(0.5, 0.7, 250);
        if (p.stocks > 0) {
          this.renderer.setAnnounce(i === this.myIdx ? 'OUCH!' : 'KO!', '', 0.7,
            i === this.myIdx ? '#ff5d3a' : '#ffe16b');
        }
      }

      // landing
      if (p.grounded && !q.grounded && p.act !== ACT.DEAD) {
        this.renderer.dust(p.x, p.y);
        sfx.land();
      }
      // leaving ground upward = jump
      if (!p.grounded && q.grounded && p.vy < -6) sfx.jump();
      // double jump: airborne and vy went sharply negative
      if (!p.grounded && !q.grounded && p.vy < -10 && q.vy > -2 && p.act === ACT.FREE) {
        sfx.djump();
        this.renderer.spawn({ type: 'ring', x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, size: 18, color: char.colors.trail });
      }
      // neutral-B / smash-attack charge feedback (both use p.charge)
      const ch = p.charge || 0, qch = q.charge || 0;
      const smashCharge = p.moveId === 'ftilt' || p.moveId === 'utilt' || p.moveId === 'dtilt';
      if (ch > qch) {
        const cmax = smashCharge ? 60 : 66;
        if (ch % 14 === 0) sfx.chargeTick(Math.min(1, ch / cmax));
        if (ch === cmax) { sfx.chargeFull(); if (i === this.myIdx) rumble(0.25, 0.4, 100); }
      }
      // fast fall kick
      if (p.fastFalling && !q.fastFalling) {
        sfx.whiff();
        for (let s = 0; s < 4; s++) {
          this.renderer.spawn({
            type: 'spark', x: p.x - 14 + s * 9, y: p.y - 70 - Math.random() * 20,
            vx: 0, vy: -7 - Math.random() * 3, life: 0.22, size: 2.2, color: '#cfe2ff',
          });
        }
      }
      // attack start whoosh
      if (p.act === ACT.ATTACK && q.act !== ACT.ATTACK) {
        if (p.moveId === 'nb') { /* shoot sfx on projectile spawn below */ }
        else sfx.whiff();
      }
      // VOLT: static stack gained / discharged
      const st = p.stacks || 0, qst = q.stacks || 0;
      if (st > qst) {
        sfx.chargeTick(st / 5);
        this.renderer.spawn({ type: 'spark', x: p.x, y: p.y - 70, vx: (Math.random() - 0.5) * 4, vy: -4, life: 0.3, size: 2.5, color: char.colors.accent });
      } else if (qst >= 5 && st === 0) {
        // discharge!
        this.renderer.hitSpark(p.x, p.y - 40, 12, char.colors.accent);
        sfx.chargeFull();
      }
      // teleport streak (position discontinuity during storm blink)
      if (p.act === ACT.ATTACK && p.moveId === 'sb' && Math.abs(p.x - q.x) > 110) {
        for (let k = 0; k < 10; k++) {
          const lx = lerp(q.x, p.x, k / 9);
          this.renderer.spawn({ type: 'spark', x: lx, y: p.y - 40 + (Math.random() - 0.5) * 18, vx: 0, vy: 0, life: 0.28, size: 3, color: char.colors.accent });
        }
        sfx.whiff();
      }
      // grab / pummel / throw
      if (p.act === ACT.GRAB && q.act !== ACT.GRAB) sfx.grab();
      if (p.act === ACT.GRABBED && q.act !== ACT.GRABBED) {
        sfx.grabCatch();
        this.renderer.spawn({ type: 'flash', x: p.x, y: p.y - 40, vx: 0, vy: 0, life: 0.16, size: 30, color: char.colors.glow });
        this.renderer.shake(6);
        if (i === this.myIdx) rumble(0.5, 0.6, 140);
      }
      if (q.act === ACT.GRABBED && p.act === ACT.HITSTUN) {
        sfx.throw();
        if (i === this.myIdx) rumble(0.6, 0.5, 150);
      }
    }

    // AEGIS quake eruptions — "bang bang bang" rolling across the stage
    if (!this._shockIds) this._shockIds = new Set();
    const liveShocks = new Set();
    for (const pr of view.projectiles) {
      if ((pr.kind || 'shot') !== 'shock') continue;
      liveShocks.add(pr.id);
      if (this._shockIds.has(pr.id)) continue;
      const power = Math.min(1, (pr.slot || 0) / 10);
      sfx.quake(0.4 + power * 0.6);
      this.renderer.shake(8 + power * 15);
      this.renderer.dust(pr.x - 18, 0, -1);
      this.renderer.dust(pr.x + 18, 0, 1);
      if (this.myIdx >= 0) rumble(0.25 + power * 0.4, 0.5, 110);
    }
    this._shockIds = liveShocks;

    // reflected projectile ping (owner flipped between frames)
    if (!this._projOwners) this._projOwners = new Map();
    const owners = new Map();
    for (const pr of view.projectiles) {
      owners.set(pr.id, pr.owner);
      const prev = this._projOwners.get(pr.id);
      if (prev !== undefined && prev !== pr.owner) {
        sfx.reflect();
        this.renderer.spawn({ type: 'ring', x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.3, size: 16, color: '#bff7ff' });
      }
    }
    this._projOwners = owners;

    // projectile spawn sound (count grew) — quake shocks have their own sound
    const projN = this.pred.projectiles.reduce((n, pr) => n + ((pr.kind || 'shot') !== 'shock' ? 1 : 0), 0);
    if (projN > (this._lastProjCount || 0)) sfx.shoot();
    this._lastProjCount = projN;

    // game end
    if (view.phase === PHASE.OVER && prev.phase !== PHASE.OVER) {
      this.over = true;
      this.renderer.setAnnounce('GAME!', '', 2.2, '#ffe16b');
      sfx.gameEnd();
    }
  }

  frame(dt, now) {
    if (!this.pred) return;
    // resume countdown announcements
    if (this.paused && this.resumeT) {
      const left = Math.ceil((this.resumeT - now) / 1000);
      if (left >= 1 && left <= 3 && left !== this.lastResumeCount) {
        this.lastResumeCount = left;
        this.renderer.setAnnounce(`${left}`, 'resuming', 0.8, '#ffffff');
        sfx.count();
      }
    }
    // decay reconciliation smoothing
    const decay = Math.pow(0.0008, dt);
    this.smooth.x *= decay;
    this.smooth.y *= decay;

    const view = this.buildView(now);
    if (!this.paused) this.observe(view);
    this.renderer.render(dt, view);
    // canvas overlay covers the resume countdown; the DOM menu (toggled below)
    // owns the interactive PAUSED screen.
    if (this.paused && this.resumeT) this.renderer.drawPauseOverlay();
    this.syncPauseMenu();

    // connection chip
    const ctx = this.renderer.ctx;
    const d = this.renderer.dpr;
    if (this.rtt) {
      ctx.font = `600 ${12 * d}px Rajdhani, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = this.rtt < 80 ? '#56e39f99' : this.rtt < 150 ? '#ffe16b99' : '#ff5d3a99';
      ctx.fillText(`${Math.round(this.rtt)} ms`, this.renderer.canvas.width - 14 * d, 22 * d);
    }
  }
}
