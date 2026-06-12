// effects.js — short-lived visual effects (impact puffs, rings, projectiles).

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
  }

  add(e) {
    this.live.push(e);
    this.scene.add(e.obj);
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.t += dt;
      e.update(clamp(e.t / e.life, 0, 1), dt);
      if (e.t >= e.life) {
        this.scene.remove(e.obj);
        e.obj.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        this.live.splice(i, 1);
      }
    }
  }

  ring(pos, color = 0xcfd4e0, maxScale = 3) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 36), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + 0.03, pos.z);
    this.add({ obj: mesh, t: 0, life: 0.45, update(p) {
      const s = lerp(0.5, maxScale, easeOutCubic(p));
      mesh.scale.set(s, s, s);
      m.opacity = 0.7 * (1 - p);
    } });
  }

  puff(pos, color, n = 9, speed = 2.2, size = 0.09, life = 0.55) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(size * (0.6 + Math.random() * 0.9), 10, 8), m);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const v = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th))
        .multiplyScalar(speed * (0.5 + Math.random() * 0.9));
      v.y = Math.abs(v.y) * 0.7 + 0.4;
      group.add(s);
      parts.push({ s, v, m });
    }
    this.add({ obj: group, t: 0, life, update(p, dt) {
      for (const part of parts) {
        part.v.y -= 4 * dt;
        part.s.position.addScaledVector(part.v, dt);
        part.s.scale.setScalar(Math.max(1 - p, 0.01));
        part.m.opacity = 0.9 * (1 - p);
      }
    } });
  }
}

// A bolt projectile. The owner's client runs collision (`targets` non-empty);
// everyone else renders it as a pure visual.
export class Projectile {
  constructor(scene, { x, y, z = 0, dir, move, color }) {
    this.scene = scene;
    this.dir = dir;
    this.move = move;
    this.alive = true;
    this.t = 0;
    const c = new THREE.Color(color);
    this.mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(move.radius, 16, 12), this.mat);
    this.mesh.position.set(x, y, z);
    this.light = new THREE.PointLight(c, 1.0, 4);
    this.mesh.add(this.light);
    scene.add(this.mesh);
  }

  update(dt, targets, onHit) {
    if (!this.alive) return;
    this.t += dt;
    this.mesh.position.x += this.dir * this.move.speed * dt;
    this.mesh.scale.setScalar(1 + Math.sin(this.t * 30) * 0.08);

    for (const target of targets) {
      if (target.ghostT > 0) continue;
      const tp = target.group.position;
      if (Math.abs(tp.x - this.mesh.position.x) < 0.55 + this.move.radius &&
          Math.abs(tp.y + 0.9 - this.mesh.position.y) < 1.0) {
        onHit(target, this.mesh.position.clone());
        this.destroy();
        return;
      }
    }
    if (this.t > this.move.lifeS) this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
