// ─────────────────────────────────────────────────────────────────────────────
// Renderer: cinematic camera, the Aether Spire stage (final-destination style),
// particle system, HUD, announcements. Pure presentation — reads sim state.
// ─────────────────────────────────────────────────────────────────────────────

import { STAGE, ACT, PHASE } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { drawFighter, drawPortrait, drawStar } from './fighters.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: -160, zoom: 0.8 };
    this.shakeT = 0;
    this.shakePow = 0;
    this.particles = [];
    this.announce = null;        // {text, sub, t, dur, color}
    this.hudPercent = [];        // animated displayed percents
    this.hudKick = [];           // percent-change kick scale
    this.t = 0;
    this.portraits = new Map();  // charId → offscreen canvas
    this.stars = this.makeStars();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.dpr = dpr;
  }

  makeStars() {
    const stars = [];
    let seed = 1337;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 220; i++) {
      stars.push({
        x: rnd() * 4000 - 2000, y: rnd() * 2400 - 1700,
        z: 0.15 + rnd() * 0.6,                       // parallax depth
        r: 0.6 + rnd() * 1.8, tw: rnd() * TAU,
      });
    }
    return stars;
  }

  portrait(charId) {
    if (!this.portraits.has(charId)) {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 96;
      drawPortrait(c, charId, 1.2);
      this.portraits.set(charId, c);
    }
    return this.portraits.get(charId);
  }

  shake(power) {
    this.shakePow = Math.min(26, Math.max(this.shakePow, power));
    this.shakeT = 0.32;
  }

  setAnnounce(text, sub = '', dur = 1.1, color = '#ffffff') {
    this.announce = { text, sub, t: 0, dur, color };
  }

  // ── particles ─────────────────────────────────────────────────────────────

  spawn(p) {
    if (this.particles.length > 700) this.particles.shift();
    this.particles.push({ grav: 0, rot: 0, vr: 0, ...p, age: 0 });
  }

  hitSpark(x, y, power, color) {
    const n = Math.min(26, 6 + power * 1.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (2 + Math.random() * 7) * (1 + power * 0.12);
      this.spawn({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25 + Math.random() * 0.3, size: 2 + Math.random() * 3, color });
    }
    this.spawn({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.32, size: 8 + power * 4, color: '#ffffff' });
    this.spawn({ type: 'flash', x, y, vx: 0, vy: 0, life: 0.12, size: 16 + power * 3, color });
  }

  koBlast(x, y, color) {
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * TAU;
      const sp = 4 + Math.random() * 16;
      this.spawn({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.6, size: 2.5 + Math.random() * 4, color: Math.random() < 0.5 ? color : '#ffffff' });
    }
    for (let i = 0; i < 3; i++) {
      this.spawn({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.5 + i * 0.16, size: 30 + i * 24, color });
    }
    this.spawn({ type: 'flash', x, y, vx: 0, vy: 0, life: 0.25, size: 120, color: '#ffffff' });
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU;
      this.spawn({ type: 'star', x, y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9 - 3, grav: 14, life: 0.9, size: 6 + Math.random() * 8, color: '#ffe97a', rot: Math.random() * TAU, vr: 6 });
    }
  }

  dust(x, y, dir = 0) {
    for (let i = 0; i < 6; i++) {
      this.spawn({ type: 'dot', x: x + (Math.random() - 0.5) * 20, y, vx: dir * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, vy: -Math.random() * 1.6, life: 0.35 + Math.random() * 0.2, size: 3 + Math.random() * 3, color: '#8fa3c8' });
    }
  }

  trailPuff(x, y, color) {
    this.spawn({ type: 'dot', x, y, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), life: 0.3, size: 4 + Math.random() * 4, color });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.rot += (p.vr || 0) * dt;
    }
  }

  // ── camera ────────────────────────────────────────────────────────────────

  updateCamera(players, dt) {
    const alive = players.filter(p => p.act !== ACT.DEAD);
    if (!alive.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of alive) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y - 80); maxY = Math.max(maxY, p.y);
    }
    const padX = 320, padY = 240;
    minX -= padX; maxX += padX; minY -= padY; maxY += padY + 60;
    minY = Math.min(minY, -380);
    maxY = Math.max(maxY, 130);
    const w = this.canvas.width, h = this.canvas.height;
    const targetZoom = clamp(Math.min(w / (maxX - minX), h / (maxY - minY)), h / 1900, h / 950);
    const tx = clamp((minX + maxX) / 2, -460, 460);
    const ty = clamp((minY + maxY) / 2, -560, 60);
    const k = 1 - Math.pow(0.0018, dt);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, k * 0.8);
  }

  applyCamera(ctx) {
    const w = this.canvas.width, h = this.canvas.height;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      const a = this.shakeT / 0.32;
      sx = (Math.random() - 0.5) * this.shakePow * a * this.dpr;
      sy = (Math.random() - 0.5) * this.shakePow * a * this.dpr;
    }
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);
  }

  // ── background & stage ────────────────────────────────────────────────────

  drawBackground(ctx) {
    const w = this.canvas.width, h = this.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.45, '#0c1026');
    g.addColorStop(0.8, '#161236');
    g.addColorStop(1, '#1d1030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // nebulae (parallax with camera)
    const par = (z) => ({
      x: w / 2 - (this.cam.x * z * this.cam.zoom * 0.5),
      y: h / 2 - (this.cam.y * z * this.cam.zoom * 0.5),
    });
    const nebulas = [
      { dx: -w * 0.3, dy: -h * 0.22, r: w * 0.42, c0: '#3b2a7a', z: 0.12 },
      { dx: w * 0.34, dy: -h * 0.3, r: w * 0.36, c0: '#173a5e', z: 0.16 },
      { dx: w * 0.05, dy: h * 0.3, r: w * 0.5, c0: '#43164e', z: 0.1 },
    ];
    for (const n of nebulas) {
      const o = par(n.z);
      const ng = ctx.createRadialGradient(o.x + n.dx, o.y + n.dy, 10, o.x + n.dx, o.y + n.dy, n.r);
      ng.addColorStop(0, n.c0 + '66');
      ng.addColorStop(1, n.c0 + '00');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, w, h);
    }

    // distant ringed planet
    const po = par(0.2);
    const px = po.x + w * 0.30, py = po.y - h * 0.26;
    const pr = Math.min(w, h) * 0.085;
    const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.2, px, py, pr);
    pg.addColorStop(0, '#7a6bd8');
    pg.addColorStop(1, '#241c52');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8d7fe066';
    ctx.lineWidth = pr * 0.13;
    ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, TAU); ctx.stroke();

    // stars
    for (const s of this.stars) {
      const o = par(s.z);
      const x = ((o.x + s.x) % (w + 100) + w + 100) % (w + 100) - 50;
      const y = ((o.y + s.y) % (h + 100) + h + 100) % (h + 100) - 50;
      const tw = 0.55 + 0.45 * Math.sin(this.t * (1 + s.z * 2.4) + s.tw);
      ctx.globalAlpha = tw * (0.35 + s.z * 0.8);
      ctx.fillStyle = '#cfe2ff';
      ctx.beginPath(); ctx.arc(x, y, s.r * this.dpr, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawStage(ctx) {
    const hw = STAGE.halfWidth, th = STAGE.thickness;
    const t = this.t;

    // under-glow
    const ug = ctx.createRadialGradient(0, th + 60, 30, 0, th + 60, 560);
    ug.addColorStop(0, '#5a48ff2e');
    ug.addColorStop(1, '#5a48ff00');
    ctx.fillStyle = ug;
    ctx.fillRect(-700, -80, 1400, 800);

    // floating crystal shards beneath
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const fx = -hw * 0.85 + (i / 6) * hw * 1.7;
      const fy = th + 80 + Math.sin(t * 0.7 + i * 1.8) * 14 + (i % 3) * 36;
      const sz = 13 + (i % 3) * 9;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(Math.sin(t * 0.4 + i) * 0.2 + i);
      ctx.fillStyle = i % 2 ? '#3b3470' : '#2a4470';
      ctx.shadowColor = '#7f9dff'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.6, 0); ctx.lineTo(0, sz * 1.3); ctx.lineTo(-sz * 0.6, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // platform body
    const bodyG = ctx.createLinearGradient(0, 0, 0, th + 90);
    bodyG.addColorStop(0, '#272b45');
    bodyG.addColorStop(0.12, '#171a30');
    bodyG.addColorStop(1, '#0a0c1a');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.lineTo(hw, 0);
    ctx.lineTo(hw - 36, th);
    ctx.quadraticCurveTo(hw * 0.5, th + 26, 0, th + 30);
    ctx.quadraticCurveTo(-hw * 0.5, th + 26, -(hw - 36), th);
    ctx.closePath();
    ctx.fill();

    // keel point
    ctx.fillStyle = '#0d0f20';
    ctx.beginPath();
    ctx.moveTo(-150, th + 24);
    ctx.lineTo(0, th + 105 + Math.sin(t * 0.8) * 4);
    ctx.lineTo(150, th + 24);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#6e5bff'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#6e5bff';
    ctx.beginPath(); ctx.arc(0, th + 108 + Math.sin(t * 0.8) * 4, 7, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // top surface sheen
    const topG = ctx.createLinearGradient(-hw, 0, hw, 0);
    topG.addColorStop(0, '#39406644');
    topG.addColorStop(0.5, '#4a528a66');
    topG.addColorStop(1, '#39406644');
    ctx.fillStyle = topG;
    ctx.fillRect(-hw, 0, hw * 2, 7);

    // glowing rim — animated spectrum sweep
    const rimG = ctx.createLinearGradient(-hw, 0, hw, 0);
    const ph = ((t * 0.12) % 1 + 1) % 1;
    const rimStops = [[0, '#41d9ff'], [0.5, '#8a5cff'], [1, '#41d9ff']];
    for (const [o, c] of rimStops) rimG.addColorStop(Math.min(0.9999, ((o + ph) % 1 + 1) % 1), c);
    rimG.addColorStop(0, ph < 0.5 ? '#41d9ff' : '#8a5cff');
    ctx.shadowColor = '#6f8dff'; ctx.shadowBlur = 16;
    ctx.fillStyle = rimG;
    ctx.fillRect(-hw, -2.5, hw * 2, 4);
    ctx.shadowBlur = 0;

    // rune dashes on the face
    ctx.save();
    ctx.globalAlpha = 0.65;
    for (let i = 0; i < 13; i++) {
      const rx = -hw + 60 + i * ((hw * 2 - 120) / 12);
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + i * 0.9));
      ctx.globalAlpha = 0.25 + pulse * 0.5;
      ctx.fillStyle = i % 2 ? '#41d9ff' : '#8a5cff';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
      ctx.fillRect(rx - 9, 22, 18, 3.5);
    }
    ctx.restore();
  }

  // ── particles render ──────────────────────────────────────────────────────

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k;
      switch (p.type) {
        case 'spark':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * k;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
          ctx.stroke();
          break;
        case 'dot':
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill();
          break;
        case 'ring': {
          const r = p.size + (p.age / p.life) * p.size * 3.2;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3.2 * k + 0.6;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          break;
        }
        case 'flash': {
          const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size);
          g.addColorStop(0, p.color + 'ee');
          g.addColorStop(1, p.color + '00');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          break;
        }
        case 'star':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawStar(ctx, 0, 0, p.size * (0.5 + k * 0.5), p.color);
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  percentColor(pc) {
    if (pc < 35) return '#ffffff';
    if (pc < 70) return '#ffe16b';
    if (pc < 110) return '#ff9d45';
    if (pc < 150) return '#ff5d3a';
    return '#ff2d55';
  }

  drawHUD(ctx, players, meta, myIdx) {
    const w = this.canvas.width, h = this.canvas.height;
    const d = this.dpr;
    const n = players.length;
    const cw = 240 * d;
    const totalW = n * cw + (n - 1) * 28 * d;
    let x0 = w / 2 - totalW / 2;
    const y0 = h - 118 * d;

    for (let i = 0; i < n; i++) {
      const p = players[i];
      const m = meta[i] || {};
      const char = CHARACTERS[p.charId];
      const x = x0 + i * (cw + 28 * d);

      // animated percent
      if (this.hudPercent[i] === undefined) this.hudPercent[i] = p.percent;
      if (p.percent > this.hudPercent[i] + 0.01) this.hudKick[i] = 1;
      this.hudPercent[i] = lerp(this.hudPercent[i], p.percent, 0.25);
      this.hudKick[i] = Math.max(0, (this.hudKick[i] || 0) - 0.06);

      // glass panel
      ctx.save();
      ctx.globalAlpha = 0.88;
      const pg = ctx.createLinearGradient(x, y0, x, y0 + 92 * d);
      pg.addColorStop(0, '#10142cdd');
      pg.addColorStop(1, '#0a0d1ddd');
      ctx.fillStyle = pg;
      rr(ctx, x, y0, cw, 92 * d, 16 * d); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 * d;
      ctx.strokeStyle = i === myIdx ? char.colors.accent + 'cc' : '#ffffff22';
      rr(ctx, x, y0, cw, 92 * d, 16 * d); ctx.stroke();

      // portrait disc
      const pcv = this.portrait(p.charId);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + 46 * d, y0 + 46 * d, 34 * d, 0, TAU);
      ctx.clip();
      ctx.drawImage(pcv, x + 12 * d, y0 + 12 * d, 68 * d, 68 * d);
      ctx.restore();
      ctx.strokeStyle = char.colors.glow;
      ctx.lineWidth = 2.4 * d;
      ctx.beginPath(); ctx.arc(x + 46 * d, y0 + 46 * d, 34 * d, 0, TAU); ctx.stroke();

      // name
      ctx.fillStyle = '#aeb9d8';
      ctx.font = `600 ${13 * d}px Rajdhani, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText((m.username || char.name).toUpperCase().slice(0, 14), x + 92 * d, y0 + 26 * d);

      // percent
      const pc = Math.round(this.hudPercent[i]);
      const kick = 1 + (this.hudKick[i] || 0) * 0.35;
      ctx.save();
      ctx.translate(x + 92 * d, y0 + 66 * d);
      ctx.scale(kick, kick);
      ctx.font = `800 ${40 * d}px Rajdhani, system-ui, sans-serif`;
      ctx.fillStyle = this.percentColor(pc);
      ctx.shadowColor = this.percentColor(pc);
      ctx.shadowBlur = (this.hudKick[i] || 0) * 22 * d;
      ctx.fillText(`${pc}`, 0, 0);
      const pw = ctx.measureText(`${pc}`).width;
      ctx.font = `700 ${22 * d}px Rajdhani, system-ui, sans-serif`;
      ctx.fillText('%', pw + 2 * d, 0);
      ctx.restore();

      // stocks
      for (let s = 0; s < 3; s++) {
        const sx = x + cw - 30 * d - s * 22 * d;
        const sy = y0 + 24 * d;
        if (s < p.stocks) {
          ctx.shadowColor = char.colors.glow; ctx.shadowBlur = 8 * d;
          ctx.fillStyle = char.colors.accent;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#2a3052';
        }
        ctx.beginPath(); ctx.arc(sx, sy, 7 * d, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }

  // off-screen player indicator bubble (smash-style magnifier)
  drawOffscreenBubbles(ctx, players) {
    const w = this.canvas.width, h = this.canvas.height;
    const d = this.dpr;
    for (const p of players) {
      if (p.act === ACT.DEAD) continue;
      // world → screen
      const sx = (p.x - this.cam.x) * this.cam.zoom + w / 2;
      const sy = (p.y - 40 - this.cam.y) * this.cam.zoom + h / 2;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const char = CHARACTERS[p.charId];
      const bx = clamp(sx, 56 * d, w - 56 * d);
      const by = clamp(sy, 56 * d, h - 170 * d);
      // how close to a blast zone (0..1)
      const danger = Math.max(
        Math.abs(p.x) / STAGE.blastX,
        p.y > 0 ? p.y / STAGE.blastBottom : -p.y / -STAGE.blastTop,
      );
      const critical = danger > 0.72;
      const pulse = critical ? 0.5 + 0.5 * Math.abs(Math.sin(this.t * 9)) : 0;
      ctx.save();
      ctx.fillStyle = '#0d1126dd';
      ctx.strokeStyle = critical ? `rgba(255, 70, 50, ${0.6 + pulse * 0.4})` : char.colors.glow;
      ctx.lineWidth = (2.5 + pulse * 2.5) * d;
      const br = (34 + pulse * 4) * d;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.clip();
      const pcv = this.portrait(p.charId);
      ctx.drawImage(pcv, bx - 30 * d, by - 30 * d, 60 * d, 60 * d);
      ctx.restore();
      // pct chip
      ctx.fillStyle = this.percentColor(p.percent);
      ctx.font = `800 ${15 * d}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(p.percent)}%`, bx, by + 52 * d);
      // arrow
      const ang = Math.atan2(sy - by, sx - bx);
      ctx.save();
      ctx.translate(bx + Math.cos(ang) * 42 * d, by + Math.sin(ang) * 42 * d);
      ctx.rotate(ang);
      ctx.fillStyle = char.colors.accent;
      ctx.beginPath(); ctx.moveTo(8 * d, 0); ctx.lineTo(-5 * d, -6 * d); ctx.lineTo(-5 * d, 6 * d);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  drawPauseOverlay(by, resuming) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const d = this.dpr;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 5, 14, 0.55)';
    ctx.fillRect(0, 0, w, h);
    if (!resuming) {
      ctx.textAlign = 'center';
      ctx.font = `800 ${88 * d}px Rajdhani, system-ui, sans-serif`;
      ctx.shadowColor = '#41d9ff'; ctx.shadowBlur = 34 * d;
      ctx.fillStyle = '#e8edff';
      ctx.fillText('PAUSED', w / 2, h * 0.42);
      ctx.shadowBlur = 0;
      ctx.font = `600 ${22 * d}px Rajdhani, system-ui, sans-serif`;
      ctx.fillStyle = '#8d99c2';
      ctx.fillText(`by ${by || 'a fighter'}`, w / 2, h * 0.42 + 44 * d);
      const blink = Math.floor(this.t * 1.6) % 2 === 0;
      if (blink) {
        ctx.font = `600 ${17 * d}px Rajdhani, system-ui, sans-serif`;
        ctx.fillStyle = '#aeb9d8';
        ctx.fillText('START / ESC to resume', w / 2, h * 0.42 + 84 * d);
      }
    }
    ctx.restore();
    // announcements (the 3‑2‑1 resume count) should render above the dim
    this.drawAnnounce(ctx);
  }

  drawAnnounce(ctx) {
    if (!this.announce) return;
    const a = this.announce;
    const w = this.canvas.width, h = this.canvas.height;
    const d = this.dpr;
    const k = a.t / a.dur;
    if (k >= 1) { this.announce = null; return; }
    const popIn = Math.min(1, a.t / 0.14);
    const scale = 0.6 + 0.4 * (1 - Math.pow(1 - popIn, 3)) + k * 0.12;
    const alpha = k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1;
    ctx.save();
    ctx.translate(w / 2, h * 0.36);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `800 ${110 * d}px Rajdhani, system-ui, sans-serif`;
    ctx.shadowColor = a.color; ctx.shadowBlur = 42 * d;
    ctx.lineWidth = 10 * d;
    ctx.strokeStyle = '#0a0c18';
    ctx.strokeText(a.text, 0, 0);
    ctx.fillStyle = a.color;
    ctx.fillText(a.text, 0, 0);
    if (a.sub) {
      ctx.font = `600 ${30 * d}px Rajdhani, system-ui, sans-serif`;
      ctx.shadowBlur = 12 * d;
      ctx.fillStyle = '#dfe7ff';
      ctx.fillText(a.sub, 0, 52 * d);
    }
    ctx.restore();
  }

  // ── frame ─────────────────────────────────────────────────────────────────

  render(dt, view) {
    // view: {players (render states), projectiles, meta, myIdx, phase, phaseTimer}
    this.t += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakePow = 0;
    if (this.announce) this.announce.t += dt;
    this.updateParticles(dt);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground(ctx);

    this.updateCamera(view.players, dt);
    ctx.save();
    this.applyCamera(ctx);

    this.drawStage(ctx);

    // respawn platform
    for (const p of view.players) {
      if (p.act === ACT.RESPAWN) {
        const char = CHARACTERS[p.charId];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.shadowColor = char.colors.glow; ctx.shadowBlur = 18;
        ctx.fillStyle = char.colors.glow + '66';
        ctx.beginPath(); ctx.ellipse(0, 6, 64, 12, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = char.colors.accent;
        ctx.beginPath(); ctx.ellipse(0, 4, 52, 7, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // projectiles
    for (const pr of view.projectiles) {
      const char = CHARACTERS[pr.charId];
      const c = char.colors;
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(Math.atan2(pr.vy, pr.vx));
      ctx.shadowColor = c.glow; ctx.shadowBlur = 18;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, pr.r * 1.4);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, c.accent);
      g.addColorStop(1, c.glow + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, pr.r * 1.4, 0, TAU); ctx.fill();
      // tail
      ctx.globalAlpha = 0.6;
      const tg = ctx.createLinearGradient(0, 0, -pr.r * 4.5, 0);
      tg.addColorStop(0, c.accent + 'cc');
      tg.addColorStop(1, c.accent + '00');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(0, -pr.r * 0.7); ctx.lineTo(-pr.r * 4.5, 0); ctx.lineTo(0, pr.r * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (Math.random() < 0.4) this.trailPuff(pr.x - pr.vx, pr.y - pr.vy, c.trail);
    }

    // fighters (draw dead ones not at all)
    for (const p of view.players) {
      if (p.act === ACT.DEAD) continue;
      const char = CHARACTERS[p.charId];
      ctx.save();
      ctx.translate(p.x, p.y);
      // motion trail puffs at speed
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 9 && Math.random() < 0.55) this.trailPuff(p.x, p.y - 40, char.colors.trail);
      // soft ground shadow
      const distToFloor = Math.max(0, -p.y + 0);
      if (p.x > -STAGE.halfWidth && p.x < STAGE.halfWidth && p.y <= 4) {
        ctx.save();
        ctx.translate(0, -p.y);
        const shAlpha = clamp(1 - distToFloor / 420, 0, 0.42);
        ctx.fillStyle = `rgba(0,0,0,${shAlpha})`;
        ctx.beginPath(); ctx.ellipse(0, 2, 34 * char.scale * (1 - distToFloor / 900), 7, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      drawFighter(ctx, p, this.t);
      ctx.restore();
    }

    this.drawParticles(ctx);
    ctx.restore();

    // screen-space layers
    this.drawOffscreenBubbles(ctx, view.players);
    this.drawHUD(ctx, view.players, view.meta, view.myIdx);
    this.drawAnnounce(ctx);

    // subtle vignette
    const w = this.canvas.width, h = this.canvas.height;
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.95);
    v.addColorStop(0, '#00000000');
    v.addColorStop(1, '#00000055');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
