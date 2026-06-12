// Game.js

import { Player } from "./Player.js";
import { Stage } from "./Stage.js";
import { Effects, Projectile } from "./effects.js";
import { CHARACTERS } from "./characters.js";

export class Game {
  constructor(characterId) {
    this.def = CHARACTERS[characterId] || CHARACTERS.bastion;
    this.shake = 0;

    this.initScene();
    this.initStage();
    this.initLights();
    this.effects = new Effects(this.scene);
    this.projectiles = [];
    this.initPlayer();
    this.initControls();
    this.initSocket();
    this.initHud();

    // ?training spawns a punching bag that takes real knockback
    if (location.search.includes("training")) {
      this.dummy = new Player(3, 5, -1.5, CHARACTERS.korga);
      this.scene.add(this.dummy.group);
    }
  }

  start() {
    this.clock = new THREE.Clock();
    this.animate();
  }

  initSocket() {
    this.socket = io();
    this.otherPlayers = {};

    this.socket.on("gameStateUpdate", (gameState) => {
      this.updateGameState(gameState);
    });

    this.socket.on("hitReceived", (hit) => {
      if (this.player.receiveHit(hit, this.effects)) this.addShake(0.1);
    });

    this.socket.on("effect", (e) => this.spawnRemoteEffect(e));
  }

  updateGameState(gameState) {
    // The local player is simulated locally; remote players are rendered
    // from the states their own clients publish.
    for (const socketId in gameState) {
      if (socketId === this.socket.id) continue;
      const state = gameState[socketId];
      if (!state.character) continue; // still on the select screen

      let other = this.otherPlayers[socketId];
      if (!other) {
        const def = CHARACTERS[state.character];
        if (!def) continue;
        other = new Player(state.position.x, state.position.y, state.position.z, def);
        this.otherPlayers[socketId] = other;
        this.scene.add(other.group);
      }
      other.netState = state;
    }

    for (const socketId in this.otherPlayers) {
      if (!gameState[socketId]) {
        this.scene.remove(this.otherPlayers[socketId].group);
        delete this.otherPlayers[socketId];
      }
    }
  }

  spawnRemoteEffect(e) {
    if (e.type === "bolt") {
      this.projectiles.push(new Projectile(this.scene, e));
    } else if (e.type === "puff") {
      this.effects.puff(new THREE.Vector3(e.x, e.y, e.z), e.color, 12, 1.6, 0.18, 0.8);
    }
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.y = 4;
    this.camera.position.z = 10;

    this.scene.background = new THREE.Color(0x12141f);
    this.scene.fog = new THREE.Fog(0x12141f, 18, 40);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initPlayer() {
    this.player = new Player(0, 5, -1.5, this.def, { isLocal: true });
    this.scene.add(this.player.group);
  }

  initStage() {
    this.stage = new Stage(0, -0.05, -1.5);
    this.scene.add(this.stage.mesh);
  }

  initLights() {
    this.scene.add(new THREE.HemisphereLight(0xbcc8ff, 0x33363f, 0.85));

    const keyLight = new THREE.DirectionalLight(0xfff1de, 1.0);
    keyLight.position.set(4, 9, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x5d7bff, 0.5);
    rimLight.position.set(-6, 4, -6);
    this.scene.add(rimLight);
  }

  initControls() {
    this.keysPressed = {
      ArrowLeft: false,
      ArrowRight: false,
      Space: false,
      KeyA: false,
      KeyD: false,
      KeyF: false,
      KeyG: false,
      spaceJustPressed: false,
      fJustPressed: false,
      gJustPressed: false,
    };

    document.addEventListener("keydown", (event) => {
      this.keysPressed[event.code] = true;
      if (event.repeat) return;
      if (event.code === "Space") this.keysPressed.spaceJustPressed = true;
      if (event.code === "KeyF") this.keysPressed.fJustPressed = true;
      if (event.code === "KeyG") this.keysPressed.gJustPressed = true;
    });

    document.addEventListener("keyup", (event) => {
      this.keysPressed[event.code] = false;
      if (event.code === "Space") this.keysPressed.spaceJustPressed = false;
    });
  }

  initHud() {
    this.hud = document.getElementById("hud");
  }

  updateHud() {
    if (!this.hud) return;
    const rows = [[this.def, this.player.damage]];
    if (this.dummy) rows.push([this.dummy.def, this.dummy.damage]);
    for (const [socketId, other] of Object.entries(this.otherPlayers)) {
      rows.push([other.def, other.damage]);
    }
    this.hud.innerHTML = rows.map(([def, dmg], i) => {
      const d = Math.round(dmg);
      const g = Math.max(0, 235 - d * 2.2);
      return `<div class="hudRow"><span class="hudName" style="color:${def.color}">${def.name}${i === 0 ? " (you)" : ""}</span>` +
             `<span class="hudPct" style="color:rgb(255,${g},${g})">${d}%</span></div>`;
    }).join("");
  }

  addShake(s) {
    this.shake = Math.max(this.shake, s);
  }

  combatContext() {
    const targets = Object.values(this.otherPlayers);
    if (this.dummy) targets.push(this.dummy);

    return {
      targets,
      effects: this.effects,
      onHit: (target, hit, impactPos) => {
        this.effects.puff(impactPos, hit.backstab ? 0xffe066 : 0xffe9a8, 6, 2.2, 0.06, 0.35);
        this.addShake(0.07);
        this.deliverHit(target, hit);
      },
      spawnBolt: (owner, move) => {
        const p = owner.group.position;
        const spawn = {
          type: "bolt",
          x: p.x + owner.facing * 0.6, y: p.y + 1.25, z: p.z,
          dir: owner.facing,
          move: { speed: move.speed, radius: move.radius, lifeS: move.lifeS },
          color: owner.def.color,
        };
        const bolt = new Projectile(this.scene, spawn);
        bolt.owner = owner;
        bolt.moveDef = move;
        this.projectiles.push(bolt);
        this.effects.puff(new THREE.Vector3(spawn.x, spawn.y, spawn.z), owner.def.color, 5, 1.2, 0.05, 0.3);
        this.socket.emit("effect", spawn);
      },
      emitEffect: (e) => this.socket.emit("effect", e),
    };
  }

  deliverHit(target, hit) {
    if (target === this.dummy) {
      target.receiveHit(hit, this.effects);
      return;
    }
    for (const [socketId, other] of Object.entries(this.otherPlayers)) {
      if (other === target) {
        this.socket.emit("attackHit", { targetId: socketId, hit });
        return;
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const ctx = this.combatContext();

    this.player.animate(this.keysPressed, this.stage, this.camera, dt, ctx);
    if (this.dummy) this.dummy.animate({}, this.stage, this.camera, dt);

    // remote players render the states their clients publish
    for (const socketId in this.otherPlayers) {
      const other = this.otherPlayers[socketId];
      if (other.netState) other.applyNetState(other.netState, dt);
    }

    // projectiles: only the owner's client deals damage
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(dt, proj.owner ? ctx.targets : [], (target, pos) => {
        const hit = proj.owner.computeHit(proj.moveDef, target);
        this.effects.puff(pos, 0xffe9a8, 8, 2.4, 0.07, 0.4);
        this.addShake(0.06);
        this.deliverHit(target, hit);
      });
      if (!proj.alive) this.projectiles.splice(i, 1);
    }

    this.effects.update(dt);
    this.updateHud();

    // publish our state
    this.socket.emit("playerAction", { state: this.player.getNetState() });

    this.shake = Math.max(0, this.shake - dt * 0.4);
    this.camera.position.y = 4 + (Math.random() - 0.5) * this.shake;
    this.camera.position.z = 10 + (Math.random() - 0.5) * this.shake * 0.5;

    this.renderer.render(this.scene, this.camera);
  }
}
