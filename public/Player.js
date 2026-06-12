// Player.js

export class Player {

    static RESPAWN_THRESHOLD = -30;


    constructor(x, y, z, socket, characterFile = 'assets/kaykit/Knight.glb') {
        this.moveSpeed = 0.1;
        this.gravity = -0.01;
        this.canJump = false;
        this.jumpCount = 0;
        this.facing = 1;
        this.initialPosition = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3();
        this.socket = socket;

        this.group = this.generateBodyGroup();
        this.loadCharacter(characterFile);

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

    loadCharacter(characterFile) {
        const loader = new THREE.GLTFLoader();
        loader.load(characterFile, (gltf) => {
            this.model = gltf.scene;
            // The GLB ships every weapon variant rigged to the hands;
            // show only this character's loadout.
            const PROP_RE = /Sword|Shield|Axe|Mug|Spellbook|Wand|Staff|Crossbow|Knife|Throwable/i;
            const loadout = ['1H_Sword', 'Badge_Shield'];
            this.model.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.frustumCulled = false;
                }
                if (PROP_RE.test(o.name)) o.visible = loadout.includes(o.name);
            });
            this.group.add(this.model);

            this.mixer = new THREE.AnimationMixer(this.model);
            this.actions = {};
            for (const clip of gltf.animations) {
                this.actions[clip.name] = this.mixer.clipAction(clip);
            }
            this.playClip('Idle');
        });
    }

    playClip(name, fade = 0.18, timeScale = 1) {
        if (!this.actions || !this.actions[name] || this.currentClip === name) {
            return;
        }
        const next = this.actions[name];
        next.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).play();
        if (this.currentClip) {
            this.actions[this.currentClip].crossFadeTo(next, fade, false);
        }
        this.currentClip = name;
    }


    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
    }

    getPosition() {
        return this.group.position;
    }

    updateVelocity(keysPressed) {
        if (keysPressed.ArrowLeft || keysPressed.KeyA) {
            this.velocity.x = -this.moveSpeed;
        } else if (keysPressed.ArrowRight || keysPressed.KeyD) {
            this.velocity.x = this.moveSpeed;
        } else {
            this.velocity.x = 0;
        }
        if (keysPressed.Space && keysPressed.spaceJustPressed) {
            if (this.canJump || (this.jumpCount < 2 && !this.canJump)) {
                this.velocity.y = 0.3;
                this.jumpCount++;
                if (this.jumpCount === 2) {
                    this.canJump = false;
                }
            }
            keysPressed.spaceJustPressed = false;
        }
        this.velocity.y += this.gravity;
    }

    updatePosition() {
        this.group.position.x += this.velocity.x;
        this.group.position.y += this.velocity.y;
    }

    updateRotation(camera) {
        // broken
        // Update player rotation based on velocity and camera position
        if (this.velocity.x !== 0) {
            const angleToCamera = Math.atan2(camera.position.z - this.group.position.z, camera.position.x - this.group.position.x);
            const direction = this.velocity.x > 0 ? 1 : -1;
            const rotationFactor = 0.75; // Adjust this value between 0 and 1 to control how much the player should face the camera
            this.group.rotation.y = angleToCamera * rotationFactor + Math.PI / 2 * direction;
        }
    }

    updateAnimation(dt) {
        if (this.velocity.x > 0) {
            this.facing = 1;
        } else if (this.velocity.x < 0) {
            this.facing = -1;
        }

        // Face the direction of travel, slightly angled toward the camera
        const targetYaw = this.facing * (Math.PI / 2 - 0.35);
        this.group.rotation.y += (targetYaw - this.group.rotation.y) * Math.min(dt * 10, 1);

        const airborne = !this.canJump && Math.abs(this.velocity.y) > 0.001;
        if (airborne) {
            this.playClip(this.velocity.y > 0 ? 'Jump_Start' : 'Jump_Idle', 0.12);
        } else if (this.velocity.x !== 0) {
            this.playClip('Running_A');
        } else {
            this.playClip('Idle');
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

        // Check if the player is on the ground and moving downward
        if (this.isColliding(this.group, stage.mesh) && this.velocity.y <= 0) {
            // Adjust player's position based on the player's height
            const playerHeight = playerBoundingBox.max.y - playerBoundingBox.min.y;
            this.setPosition(this.group.position.x, groundTop - playerHeight / 2, this.group.position.z);
            this.velocity.y = 0;
            if (this.jumpCount < 2) {
                this.canJump = true;
            }
            this.jumpCount = 0;
        } else {
            this.canJump = false;
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
        camera.position.x += (cameraTarget.x - camera.position.x) * 0.01;
    }

    updateFromGameState(gameState) {
        // Position comes from the server; rotation stays local so the
        // character keeps facing its direction of travel.
        this.group.position.set(gameState.position.x, gameState.position.y, gameState.position.z);
    }

    animate(keysPressed, stage, camera, dt = 0.016) {
        this.updateVelocity(keysPressed);
        this.updatePosition();
        this.updateAnimation(dt);
        this.handleCollision(stage);
        this.handleRespawn();
        this.moveCamera(camera);
    }
}