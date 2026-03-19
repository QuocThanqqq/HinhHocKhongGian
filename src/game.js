import * as THREE from "three";
import { CONFIG } from "./config.js";
import { BeatController } from "./beatController.js";
import { NoteSystem } from "./noteSystem.js";
import { InputJudge } from "./inputJudge.js";
import { ShotManager } from "./shotManager.js";
import { CatController } from "./catController.js";
import { ChaseController } from "./chaseController.js";
import { UIController } from "./uiController.js";

function rect(width, height, color) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.userData.baseColor = color;
  return mesh;
}

function circle(radius, color) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 28),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.userData.baseColor = color;
  return mesh;
}

export class Game {
  constructor({ canvas, startButton, introOverlay }) {
    this.canvas = canvas;
    this.startButton = startButton;
    this.introOverlay = introOverlay;
    this.config = CONFIG;
    this.score = 0;
    this.gameState = "Intro";
    this.animations = [];
    this.lastFrameTime = performance.now();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera();

    this.beatController = new BeatController(this.config);
    this.inputJudge = new InputJudge(this.config);
    this.shotManager = new ShotManager(this.config);
    this.chaseController = new ChaseController(this.config);
    this.catController = new CatController();

    this.ui = new UIController({
      score: document.getElementById("score-value"),
      progress: document.getElementById("progress-value"),
      state: document.getElementById("state-value"),
      feedback: document.getElementById("feedback-text"),
      comboReady: document.getElementById("combo-ready"),
      chaseShell: document.getElementById("chase-meter-shell"),
      chaseFill: document.getElementById("chase-meter-fill"),
      overlay: introOverlay
    });

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.backgroundRoot = new THREE.Group();
    this.targetRoot = new THREE.Group();
    this.ownerRoot = new THREE.Group();
    this.hitZoneGlow = rect(18, 6, 0xffc462);
    this.hitZoneGlow.material.transparent = true;
    this.hitZoneGlow.material.opacity = 0.18;
    this.hitZoneGlow.position.set(this.config.laneX, this.config.hitZoneY, 1);

    this.world.add(
      this.backgroundRoot,
      this.targetRoot,
      this.ownerRoot,
      this.hitZoneGlow,
      this.catController.group
    );
    this.noteSystem = new NoteSystem(this.config, this.world, () => this.handleMiss(true));

    this.buildRoom();
    this.bindEvents();
    this.registerCallbacks();
    this.resize();
    this.ui.setScore(this.score);
    this.ui.setProgress("Shot 1 / 5");
    this.ui.setState("Intro");
    this.ui.setChaseMeter(0.35);
  }

  mount() {
    this.loop();
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.startButton.addEventListener("click", () => this.start());
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        if (this.gameState === "Intro") {
          this.start();
          return;
        }
        this.handleInput();
      }
    });

    const tap = () => {
      if (this.gameState === "Intro") {
        this.start();
        return;
      }
      this.handleInput();
    };

    this.canvas.addEventListener("pointerdown", tap);
    this.introOverlay.addEventListener("pointerdown", (event) => {
      if (event.target === this.introOverlay) {
        tap();
      }
    });
  }

  registerCallbacks() {
    this.beatController.onBeat((beatIndex, beatTimeMs) => {
      if (this.gameState.startsWith("Shot")) {
        const resolve = this.shotManager.onBeat(beatIndex, beatTimeMs);
        if (resolve.resolved) {
          this.score += this.config.scoring.payoff;
          this.ui.setScore(this.score);
          this.ui.showFeedback("Break!", "combo");
          this.playTargetPayoff();
        }
      }
    });

    this.shotManager.onComboReady = () => {
      this.gameState = "Shot_ComboReady";
      this.catController.onComboReady();
      this.ui.setComboReady(true);
      this.ui.showFeedback("Ready", "combo");
      this.setTargetWarning(true);
    };

    this.shotManager.onPayoff = () => {
      this.gameState = "Shot_Resolve";
      this.ui.setComboReady(false);
      this.setTargetBrokenState(true);
      this.setTargetWarning(false);
    };

    this.shotManager.onShotChanged = (shot) => {
      this.gameState = "Shot_Playing";
      this.noteSystem.setMode("shot");
      this.drawTargetForShot(shot);
      this.ui.setProgress(this.shotManager.getProgressText());
      this.ui.setState(this.gameState);
      this.ui.showFeedback(shot.label, "neutral");
    };
  }

  async start() {
    if (this.gameState !== "Intro") {
      return;
    }

    await this.beatController.start();
    this.score = 0;
    this.ui.setScore(this.score);
    this.ui.hideOverlay();
    this.shotManager.start();
    this.drawTargetForShot(this.shotManager.getCurrentShot());
    this.gameState = "Shot_Playing";
    this.ui.setState(this.gameState);
    this.ui.showFeedback("Start!", "neutral");
  }

  handleInput() {
    if (!["Shot_Playing", "Shot_ComboReady", "Chase"].includes(this.gameState)) {
      return;
    }

    const songTimeMs = this.beatController.getSongTimeMs();
    const result = this.inputJudge.handleTap(songTimeMs, this.noteSystem);

    if (result.result === "Miss") {
      this.handleMiss(false);
      return;
    }

    this.handleHit(result.result);
  }

  handleHit(result) {
    this.animations.push(this.noteSystem.flashHit());
    this.catController.onHit(result);
    this.hitZoneGlow.material.opacity = 0.58;

    const points = result === "Perfect" ? this.config.scoring.perfect : this.config.scoring.good;
    this.score += points;
    this.ui.setScore(this.score);
    this.ui.showFeedback(result, result.toLowerCase());

    if (this.gameState === "Chase") {
      this.chaseController.onHit(result);
      return;
    }

    const currentBeatIndex = this.beatController.getCurrentBeatIndex();
    const comboState = this.shotManager.handleHit(currentBeatIndex);
    if (!comboState.comboReady) {
      this.gameState = "Shot_Playing";
    }
  }

  handleMiss(fromFallingNote) {
    if (!["Shot_Playing", "Shot_ComboReady", "Chase"].includes(this.gameState)) {
      return;
    }

    if (this.gameState === "Chase") {
      this.chaseController.onMiss();
    } else {
      const missState = this.shotManager.handleMiss();
      if (missState.canceledComboReady) {
        this.ui.setComboReady(false);
        this.setTargetWarning(false);
      }
    }

    if (!fromFallingNote || this.gameState === "Chase" || this.gameState === "Shot_Playing") {
      this.ui.showFeedback("Miss", "miss");
    }
  }

  enterChase() {
    const songTimeMs = this.beatController.getSongTimeMs();
    this.gameState = "Chase";
    this.noteSystem.setMode("chase");
    this.chaseController.start(songTimeMs);
    this.ui.setProgress("Final Chase");
    this.ui.setState("Chase");
    this.ui.setChaseVisible(true);
    this.ui.showFeedback("Run!", "miss");
    this.spawnOwner();
  }

  finishGame(success) {
    this.gameState = "Result";
    if (success) {
      this.score += this.config.scoring.chaseSurviveBonus;
      this.ui.setScore(this.score);
      this.ui.showFeedback("Cleared", "perfect");
    } else {
      this.ui.showFeedback("Caught", "miss");
    }
    this.ui.setState("Result");
    this.ui.setComboReady(false);
    this.ui.setChaseVisible(false);
  }

  update(deltaSeconds) {
    const now = performance.now();
    this.beatController.update(now);
    const songTimeMs = this.beatController.getSongTimeMs(now);
    const currentBeatFloat = this.beatController.getCurrentBeatFloat(now);
    const activeStates = ["Shot_Playing", "Shot_ComboReady", "Shot_Resolve", "Chase"];

    if (activeStates.includes(this.gameState)) {
      this.noteSystem.update(songTimeMs, currentBeatFloat, true);
    }

    this.shotManager.update(songTimeMs);
    if (this.gameState === "Shot_Resolve" && this.shotManager.state === "Chase") {
      this.enterChase();
    } else if (this.shotManager.state.startsWith("Shot")) {
      this.gameState = this.shotManager.state;
    }

    this.catController.update(deltaSeconds);
    this.updateAnimations();
    this.updateOwner(deltaSeconds);

    if (this.gameState === "Chase") {
      this.chaseController.update(songTimeMs, deltaSeconds);
      this.ui.setChaseMeter(this.chaseController.escapeMeter);
      if (this.chaseController.completed) {
        this.finishGame(true);
      } else if (this.chaseController.failed) {
        this.finishGame(false);
      }
    }

    this.ui.setState(this.gameState);
    this.hitZoneGlow.material.opacity = Math.max(
      0.18,
      this.hitZoneGlow.material.opacity - deltaSeconds * 1.7
    );
    this.renderer.render(this.scene, this.camera);
  }

  loop() {
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.update(deltaSeconds);
    requestAnimationFrame(() => this.loop());
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);

    const aspect = width / Math.max(height, 1);
    const worldHeight = this.config.portraitWorldHeight;
    const worldWidth = worldHeight * aspect;

    this.camera.left = -worldWidth / 2;
    this.camera.right = worldWidth / 2;
    this.camera.top = worldHeight / 2;
    this.camera.bottom = -worldHeight / 2;
    this.camera.near = -100;
    this.camera.far = 100;
    this.camera.position.set(0, 0, 10);
    this.camera.updateProjectionMatrix();
  }

  buildRoom() {
    const wall = rect(90, 76, 0x8fa8bb);
    wall.position.set(0, 10, -15);

    const floor = rect(90, 32, 0x816550);
    floor.position.set(0, -34, -14);

    const rug = rect(50, 14, 0xd9b16d);
    rug.position.set(0, -32, -13);

    const windowFrame = rect(22, 20, 0xdbe9f3);
    windowFrame.position.set(-10, 18, -10);
    const sky = rect(18, 16, 0x9fd5ff);
    sky.position.set(-10, 18, -9);

    const sofa = rect(28, 14, 0x58718c);
    sofa.position.set(-18, -5, -9);
    const sofaBase = rect(34, 7, 0x3e5368);
    sofaBase.position.set(-18, -13, -9);

    const table = rect(16, 8, 0xb98962);
    table.position.set(14, -16, -7);

    const shelf = rect(14, 22, 0x6d5443);
    shelf.position.set(27, 8, -8);

    const scratchPost = rect(7, 20, 0xb58a5e);
    scratchPost.position.set(-34, -10, -7);

    const lamp = rect(6, 18, 0xe6d4a7);
    lamp.position.set(33, 6, -9);

    this.backgroundRoot.add(
      wall,
      floor,
      rug,
      windowFrame,
      sky,
      sofa,
      sofaBase,
      table,
      shelf,
      scratchPost,
      lamp
    );
  }

  drawTargetForShot(shot) {
    this.targetRoot.clear();
    this.ownerRoot.clear();

    const baseX = 10;
    const baseY = -6;
    let pieces = [];

    if (shot.object === "bowl") {
      const bowl = rect(14, 5, 0xf0c98e);
      bowl.position.set(baseX, baseY, 3);
      const food = rect(10, 2.2, 0x9a6132);
      food.position.set(baseX, baseY + 2.1, 4);
      const debris = circle(1.3, 0xc98b49);
      debris.position.set(baseX + 7, baseY - 5, 4);
      debris.visible = false;
      pieces = [bowl, food, debris];
      this.targetPieces = { intact: [bowl, food], broken: [debris] };
    } else if (shot.object === "cup") {
      const cup = rect(8, 12, 0x9ce7ff);
      cup.position.set(baseX, baseY, 3);
      const spill = rect(15, 4, 0x70cdf4);
      spill.position.set(baseX + 4, baseY - 8, 3);
      spill.rotation.z = 0.18;
      spill.visible = false;
      pieces = [cup, spill];
      this.targetPieces = { intact: [cup], broken: [spill] };
    } else if (shot.object === "plant") {
      const pot = rect(10, 8, 0xbd7b4f);
      pot.position.set(baseX, baseY - 4, 3);
      const leaves = rect(14, 12, 0x5faa57);
      leaves.position.set(baseX, baseY + 5, 4);
      const dirt = rect(16, 4, 0x5d402d);
      dirt.position.set(baseX + 5, baseY - 10, 3);
      dirt.visible = false;
      pieces = [pot, leaves, dirt];
      this.targetPieces = { intact: [pot, leaves], broken: [dirt] };
    } else if (shot.object === "radio") {
      const radio = rect(16, 12, 0x434d58);
      radio.position.set(baseX, baseY, 3);
      const speakerLeft = circle(2.2, 0x1f2328);
      speakerLeft.position.set(baseX - 4, baseY, 4);
      const speakerRight = circle(2.2, 0x1f2328);
      speakerRight.position.set(baseX + 4, baseY, 4);
      const fallen = rect(18, 8, 0x434d58);
      fallen.position.set(baseX + 5, baseY - 8, 3);
      fallen.rotation.z = -0.4;
      fallen.visible = false;
      pieces = [radio, speakerLeft, speakerRight, fallen];
      this.targetPieces = { intact: [radio, speakerLeft, speakerRight], broken: [fallen] };
    } else if (shot.object === "vase") {
      const vase = rect(8, 18, 0xf3c7d7);
      vase.position.set(baseX, baseY, 3);
      const shards = rect(16, 5, 0xf4dde6);
      shards.position.set(baseX + 2, baseY - 10, 3);
      shards.visible = false;
      pieces = [vase, shards];
      this.targetPieces = { intact: [vase], broken: [shards] };
    }

    for (const piece of pieces) {
      this.targetRoot.add(piece);
    }
    this.setTargetBrokenState(false);
    this.setTargetWarning(false);
  }

  setTargetWarning(active) {
    this.targetRoot.children.forEach((child) => {
      child.material.color.set(active ? 0xffd365 : child.userData.baseColor);
    });
  }

  setTargetBrokenState(broken) {
    if (!this.targetPieces) {
      return;
    }

    for (const mesh of this.targetPieces.intact) {
      mesh.visible = !broken;
    }
    for (const mesh of this.targetPieces.broken) {
      mesh.visible = broken;
    }
  }

  playTargetPayoff() {
    const target = this.targetRoot;
    let elapsed = 0;
    this.animations.push(() => {
      elapsed += 1 / 60;
      target.position.y = -Math.sin(Math.min(elapsed * 7, Math.PI)) * 4;
      target.rotation.z = Math.sin(elapsed * 9) * 0.15;
      if (elapsed > 0.35) {
        target.position.y = 0;
        target.rotation.z = 0;
        return true;
      }
      return false;
    });
  }

  spawnOwner() {
    this.ownerRoot.clear();
    const body = rect(16, 34, 0x15161c);
    const head = circle(5.5, 0x15161c);
    body.position.set(48, -8, 8);
    head.position.set(48, 13, 8);
    this.ownerRoot.add(body, head);
  }

  updateOwner(deltaSeconds) {
    if (this.gameState !== "Chase" || this.ownerRoot.children.length === 0) {
      return;
    }

    this.ownerRoot.children.forEach((child) => {
      child.position.x = Math.max(26, child.position.x - deltaSeconds * 12);
    });
  }

  updateAnimations() {
    this.animations = this.animations.filter((tick) => !tick());
  }
}
