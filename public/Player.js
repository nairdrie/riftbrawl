// Player.js
import { LOOP_CLIPS } from './characters.js';

export class Player {

    static RESPAWN_THRESHOLD = -30;

    constructor(x, y, z, def, { isLocal = false } = {}) {
        this.def = def;
        this.isLocal = isLocal;

        this.moveSpeed = def.stats.moveSpeed;
        this.jumpVel = def.stats.jumpVel;
        this.gravity = -0.01;
        this.canJump = false;
        this.jumpCount = 0;
        this.facing = 1;

        // combat state
        this.damage = 0;
        this.hitstunT = 0;
        this.kbX = 0;
        this.blocking = false;
        this.ghostT = 0;       // smoke-bomb intangibility
        this.attack = null;    // { move, t, hits }
        this.wasAirborne = false;

        this.initialPosition = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3();

        this.group = this.generateBodyGroup();
        this.loadCharacter();

        this.setPosition(x, y, z);
    }

    generateBodyGroup() {
        const group = new THREE.Group();

        // Invisible placeholder keeps the bounding box stable for physics,
        // both before the model loads and through animation poses.
        const placeholder = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 1.7, 0.6),
            new THREE.MeshBasicMaterial()
        );
        placeholder.visible = false;
        placeholder.position.y = 0.85;
        group.add(placeholder);

        return group;
    }

    loadCharacter() {
        const loader = new THREE.GLTFLoader();
        loader.load(this.def.file, (gltf) => {
            this.model = gltf.scene;
            this.mats = [];
            // The GLB ships every weapon variant rigged to the hands;
            // show only this character's loadout.
            const PROP_RE = /Sword|Shield|Axe|Mug|Spellbook|Wand|Staff|Crossbow|Knife|Throwable/i;
            this.model.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.frustumCulled = false;
                    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                        if (!this.mats.includes(m)) this.mats.push(m);
                    }
                }
                if (PROP_RE.test(o.name)) o.visible = this.def.show.includes(o.name);
            });
            this.group.add(this.model);

            this.mixer = new THREE.AnimationMixer(this.model);
            this.actions = {};
            for (const clip of gltf.animations) {
                this.actions[clip.name] = this.mixer.clipAction(clip);
            }
            this.mixer.addEventListener('finished', (e) => {
                if (e.action === this.onceAction) this.onceAction = null;
            });
            this.playClip('Idle');
        });
    }

    playClip(name, fade = 0.18, timeScale = 1) {
        if (!this.actions || !this.actions[name] || this.currentClip === name) {
            return;
        }
        const next = this.actions[name];
        next.reset().setLoop(THREE.LoopRepeat, Infinity)
            .setEffectiveTimeScale(timeScale).setEffectiveWeight(1).play();
        const prev = this.onceAction || (this.currentClip && this.actions[this.currentClip]);
        if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
        this.currentClip = name;
        this.onceAction = null;
    }

    playOnce(name, { fade = 0.12, ts = 1 } = {}) {
        if (!this.actions || !this.actions[name]) {
            return;
        }
        const a = this.actions[name];
        a.reset().setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.setEffectiveTimeScale(ts).setEffectiveWeight(1).play();
        const prev = this.onceAction || (this.currentClip && this.actions[this.currentClip]);
        if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
        this.onceAction = a;
        this.currentClip = name;
    }

    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
    }

    getPosition() {
        return this.group.position;
    }

    get airborne() {
        return !this.canJump && Math.abs(this.velocity.y) > 0.001;
    }

    // ------------------------------------------------------------ input

    updateVelocity(keysPressed) {
        const locked = this.hitstunT > 0 || this.attack || this.blocking;

        if (!locked && (keysPressed.ArrowLeft || keysPressed.KeyA)) {
            this.velocity.x = -this.moveSpeed;
            this.facing = -1;
        } else if (!locked && (keysPressed.ArrowRight || keysPressed.KeyD)) {
            this.velocity.x = this.moveSpeed;
            this.facing = 1;
        } else {
            this.velocity.x = 0;
        }

        // Whirlwind carries its own momentum; Shield Bash lunges.
        if (this.attack) {
            if (this.attack.move.travel) this.velocity.x = this.facing * this.attack.move.travel;
            if (this.attack.move.lunge && this.inActiveWindow()) {
                this.velocity.x = this.facing * this.attack.move.lunge;
            }
        }

        if (!locked && keysPressed.Space && keysPressed.spaceJustPressed) {
            if (this.canJump || (this.jumpCount < 2 && !this.canJump)) {
                this.velocity.y = this.jumpVel;
                this.jumpCount++;
                if (this.jumpCount === 2) {
                    this.canJump = false;
                }
                this.playOnce('Jump_Start', { ts: 1.6 });
            }
            keysPressed.spaceJustPressed = false;
        }
        this.velocity.y += this.gravity * this.frameScale;
    }

    updateCombatInput(keysPressed, ctx) {
        if (this.hitstunT > 0) return;
        const special = this.def.moves.special;

        // Bastion's block: held, grounded, drops everything else.
        if (special.type === 'block') {
            this.blocking = !!keysPressed.KeyG && !this.attack && this.canJump;
        }

        if (keysPressed.fJustPressed) {
            keysPressed.fJustPressed = false;
            const move = this.blocking ? special.bash : this.def.moves.attack;
            if (this.blocking) this.blocking = false;
            this.startMove(move, ctx);
        }
        if (keysPressed.gJustPressed) {
            keysPressed.gJustPressed = false;
            if (special.type !== 'block') this.startMove(special, ctx);
        }
    }

    // ------------------------------------------------------------ combat

    startMove(move, ctx) {
        if (this.attack || this.hitstunT > 0) return;
        this.attack = { move, t: 0, hits: new Map(), boltFired: false, smoked: false };
        this.playOnce(move.clip, { ts: move.ts });
        if (ctx && move.type === 'smoke') {
            const throwable = this.model && this.model.getObjectByName('Throwable');
            if (throwable) throwable.visible = true;
        }
    }

    inActiveWindow() {
        const a = this.attack;
        return a && a.move.active && a.t >= a.move.active[0] && a.t <= a.move.active[1];
    }

    updateAttack(dt, ctx) {
        const a = this.attack;
        if (!a) return;
        a.t += dt;

        const move = a.move;
        const pos = this.group.position;

        if (move.type === 'melee' || move.type === 'whirlwind') {
            const live = move.type === 'whirlwind'
                ? a.t > 0.3 && a.t < move.dur - 0.15
                : this.inActiveWindow();
            if (live) {
                for (const target of ctx.targets) {
                    if (target === this || target.ghostT > 0) continue;
                    const last = a.hits.get(target);
                    if (last !== undefined && (!move.tick || a.t - last < move.tick)) continue;
                    const dx = (target.group.position.x - pos.x) * this.facing;
                    const dy = target.group.position.y - pos.y;
                    if (dx > -0.2 && dx < move.range && Math.abs(dy) < 1.6) {
                        a.hits.set(target, a.t);
                        ctx.onHit(target, this.computeHit(move, target), new THREE.Vector3(
                            pos.x + this.facing * move.range * 0.7, pos.y + 1.0, pos.z));
                    }
                }
            }
        }

        if (move.type === 'bolt' && !a.boltFired && a.t >= move.castAt) {
            a.boltFired = true;
            ctx.spawnBolt(this, move);
        }

        if (move.type === 'smoke' && !a.smoked && a.t >= move.at) {
            a.smoked = true;
            this.ghostT = move.ghost;
            const throwable = this.model && this.model.getObjectByName('Throwable');
            if (throwable) throwable.visible = false;
            ctx.effects.puff(new THREE.Vector3(pos.x, pos.y + 0.7, pos.z), 0x9aa1b9, 16, 1.6, 0.22, 0.9);
            ctx.emitEffect({ type: 'puff', x: pos.x, y: pos.y + 0.7, z: pos.z, color: 0x9aa1b9 });
        }

        if (a.t >= move.dur) this.attack = null;
    }

    computeHit(move, target) {
        let dmg = move.dmg;
        let backstab = false;
        if (move.backstab) {
            const side = Math.sign(target.group.position.x - this.group.position.x) || 1;
            if (target.facing === side) {
                dmg *= move.backstab;
                backstab = true;
            }
        }
        let kb = (move.baseKb + target.damage * move.kbGrowth) / target.def.stats.weight;
        if (this.def.rage) kb *= 1 + this.damage * this.def.rage;
        if (backstab) kb *= 1.3;
        const rad = (move.angle * Math.PI) / 180;
        const dir = Math.sign(target.group.position.x - this.group.position.x) || this.facing;
        return {
            damage: dmg,
            kbX: Math.cos(rad) * kb * dir,
            kbY: Math.sin(rad) * kb,
            backstab,
        };
    }

    receiveHit(hit, effects) {
        if (this.ghostT > 0) return false;

        if (this.blocking) {
            this.damage += hit.damage * 0.25;
            this.playOnce('Block_Hit', { ts: 1.3 });
            return true;
        }

        this.damage += hit.damage;
        this.kbX = hit.kbX;
        this.velocity.y = hit.kbY;
        this.canJump = false;
        const strength = Math.abs(hit.kbX) + hit.kbY;
        this.hitstunT = Math.min(0.12 + strength * 1.4, 0.8);
        this.attack = null;
        this.blocking = false;
        this.playOnce(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', { ts: 1.2 });
        if (effects) {
            const p = this.group.position;
            effects.puff(new THREE.Vector3(p.x, p.y + 1.0, p.z), hit.backstab ? 0xffe066 : 0xffffff, 8, 2.6, 0.07, 0.4);
        }
        return true;
    }

    // ------------------------------------------------------------ simulation

    updatePosition() {
        this.group.position.x += (this.velocity.x + this.kbX) * this.frameScale;
        this.group.position.y += this.velocity.y * this.frameScale;
        this.kbX *= Math.pow(this.canJump ? 0.86 : 0.95, this.frameScale);
        if (Math.abs(this.kbX) < 0.002) this.kbX = 0;
    }

    updateAnimation(dt) {
        // Face the direction of travel, slightly angled toward the camera
        const targetYaw = this.facing * (Math.PI / 2 - 0.35);
        this.group.rotation.y += (targetYaw - this.group.rotation.y) * Math.min(dt * 10, 1);

        // Locomotion only when nothing else is playing
        if (!this.onceAction) {
            if (this.blocking) {
                this.playClip('Blocking', 0.12);
            } else if (this.airborne) {
                this.playClip('Jump_Idle', 0.15);
            } else if (this.velocity.x !== 0) {
                this.playClip('Running_A', 0.18, this.def.stats.runTS);
            } else {
                this.playClip('Idle');
            }
        }

        // smoke-bomb ghosting
        if (this.mats) {
            const ghosted = this.ghostT > 0;
            if (ghosted !== this.matsGhosted) {
                this.matsGhosted = ghosted;
                for (const m of this.mats) {
                    m.transparent = true;
                    m.opacity = ghosted ? 0.25 : 1;
                }
            }
        }

        if (this.mixer) {
            this.mixer.update(dt);
        }
    }

    isColliding(box1, box2) {
        const box1Bounds = new THREE.Box3().setFromObject(box1);
        const box2Bounds = new THREE.Box3().setFromObject(box2);

        return box1Bounds.intersectsBox(box2Bounds);
    }

    respawn() {
        this.velocity.set(0, 0, 0);
        this.kbX = 0;
        this.damage = 0;
        this.hitstunT = 0;
        this.attack = null;
        this.ghostT = 0;
        this.setPosition(this.initialPosition.x, this.initialPosition.y, this.initialPosition.z);
    }

    getBoundingBox() {
        const boundingBox = new THREE.Box3();
        boundingBox.setFromObject(this.group);
        return boundingBox;
    }

    handleCollision(stage) {
        const playerBoundingBox = this.getBoundingBox();
        const groundTop =
            stage.mesh.position.y +
            stage.mesh.geometry.parameters.height / 2 +
            (playerBoundingBox.max.y - playerBoundingBox.min.y) / 2;

        const stageHalfWidth = stage.mesh.geometry.parameters.width / 2;
        const overStage = Math.abs(this.group.position.x - stage.mesh.position.x) < stageHalfWidth + 0.4;

        // Check if the player is on the ground and moving downward
        if (overStage && this.isColliding(this.group, stage.mesh) && this.velocity.y <= 0) {
            // Adjust player's position based on the player's height
            const playerHeight = playerBoundingBox.max.y - playerBoundingBox.min.y;
            this.setPosition(this.group.position.x, groundTop - playerHeight / 2, this.group.position.z);
            this.velocity.y = 0;
            if (this.jumpCount < 2) {
                this.canJump = true;
            }
            this.jumpCount = 0;
            if (this.wasAirborne) {
                this.playOnce('Jump_Land', { ts: 2.2 });
            }
            this.wasAirborne = false;
        } else {
            this.canJump = false;
            this.wasAirborne = this.airborne;
        }
    }

    handleRespawn() {
        if (this.getPosition().y < Player.RESPAWN_THRESHOLD) {
            this.respawn();
        }
    }

    moveCamera(camera) {
        const cameraTarget = new THREE.Vector3();
        cameraTarget.x = this.getPosition().x;
        camera.position.x += (cameraTarget.x - camera.position.x) * Math.min(0.01 * this.frameScale, 1);
    }

    // ------------------------------------------------------------ network

    getNetState() {
        return {
            character: this.def.id,
            position: { x: this.group.position.x, y: this.group.position.y, z: this.group.position.z },
            facing: this.facing,
            clip: this.currentClip || 'Idle',
            ghost: this.ghostT > 0,
            blocking: this.blocking,
            damage: this.damage,
        };
    }

    applyNetState(s, dt) {
        const p = this.group.position;
        p.x += (s.position.x - p.x) * 0.4;
        p.y += (s.position.y - p.y) * 0.4;
        p.z = s.position.z;
        this.facing = s.facing;
        this.blocking = s.blocking;
        this.damage = s.damage;
        this.ghostT = s.ghost ? 1 : 0;

        const targetYaw = this.facing * (Math.PI / 2 - 0.35);
        this.group.rotation.y += (targetYaw - this.group.rotation.y) * Math.min(dt * 10, 1);

        if (s.clip && s.clip !== this.lastNetClip) {
            this.lastNetClip = s.clip;
            if (LOOP_CLIPS.has(s.clip)) {
                this.playClip(s.clip, 0.18, s.clip === 'Running_A' ? this.def.stats.runTS : 1);
            } else {
                this.playOnce(s.clip);
            }
        }

        if (this.mats) {
            const ghosted = this.ghostT > 0;
            if (ghosted !== this.matsGhosted) {
                this.matsGhosted = ghosted;
                for (const m of this.mats) {
                    m.transparent = true;
                    m.opacity = ghosted ? 0.25 : 1;
                }
            }
        }

        if (this.mixer) this.mixer.update(dt);
    }

    animate(keysPressed, stage, camera, dt = 0.016, ctx = null) {
        // Speeds are tuned in per-frame-at-60fps units; scale by actual dt
        // so the game runs at the same speed on any refresh rate.
        this.frameScale = dt * 60;
        if (this.hitstunT > 0) this.hitstunT -= dt;
        if (this.ghostT > 0) this.ghostT -= dt;

        this.updateVelocity(keysPressed);
        if (ctx) {
            this.updateCombatInput(keysPressed, ctx);
            this.updateAttack(dt, ctx);
        }
        this.updatePosition();
        this.updateAnimation(dt);
        this.handleCollision(stage);
        this.handleRespawn();
        if (this.isLocal) this.moveCamera(camera);
    }
}
