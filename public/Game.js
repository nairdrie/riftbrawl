// Game.js

import { Player } from "./Player.js";
import { Stage } from "./Stage.js";

export class Game {
  constructor() {
    this.initSocket()
    this.initScene();
    this.initPlayer();
    this.initStage();
    this.initLights();
    this.initControls();

    document.addEventListener("DOMContentLoaded", () => {
      document
        .getElementById("startButton")
        .addEventListener("click", () => {
          document.getElementById("startMenu").style.display = "none";
          this.animate();
        });
    });
  }

  initSocket() {
    this.socket = io("http://localhost:3000");
  
    // Store other players in a dictionary
    this.otherPlayers = {};
  
    // Listen for updates from the server
    this.socket.on('gameStateUpdate', (gameState) => {
      // Update the game state based on the server's data
      this.updateGameState(gameState);
    });
  }

  updateGameState(gameState) {
    // The local player is simulated locally; applying the server echo here
    // would teleport it back to the server's stale position every frame.
    // (Server reconciliation can come back once GameState simulates properly.)

    // Loop through other players in the game state
    for (const socketId in gameState) {
      if (socketId === this.socket.id) {
        // Skip the main player
        continue;
      }
  
      let otherPlayer = this.otherPlayers[socketId];
  
      // If the other player doesn't exist, create and add it to the scene
      if (!otherPlayer) {
        otherPlayer = new Player(0, 5, -1.5);
        this.otherPlayers[socketId] = otherPlayer;
        this.scene.add(otherPlayer.group);
      }
  
      // Update other player from game state
      otherPlayer.updateFromGameState(gameState[socketId]);
    }
  
    // Remove disconnected players
    for (const socketId in this.otherPlayers) {
      if (!gameState[socketId]) {
        this.scene.remove(this.otherPlayers[socketId].group);
        delete this.otherPlayers[socketId];
      }
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
  }

  initPlayer() {
    this.player = new Player(0, 5, -1.5);
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
      spaceJustPressed: false,
    };

    document.addEventListener("keydown", (event) => {
      this.keysPressed[event.code] = true;
      if (event.code === "Space") {
        this.keysPressed.spaceJustPressed = true;
      }
    });

    document.addEventListener("keyup", (event) => {
      this.keysPressed[event.code] = false;
      if (event.code === "Space") {
        this.keysPressed.spaceJustPressed = false;
      }
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (!this.clock) this.clock = new THREE.Clock();
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Emit player actions to the server
    this.socket.emit('playerAction', {
      keysPressed: this.keysPressed
    });

    this.player.animate(this.keysPressed, this.stage, this.camera, dt);

    // Keep other players' animations running
    for (const socketId in this.otherPlayers) {
      const other = this.otherPlayers[socketId];
      if (other.mixer) other.mixer.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }
}