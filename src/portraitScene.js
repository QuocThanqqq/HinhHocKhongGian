import * as THREE from "three";
import backgroundUrl from "../mnt/data/BG 2.png";
import catBodyUrl from "../mnt/data/C 4.png";
import catHeadUrl from "../mnt/data/C3 1.png";
import catLeftPawUrl from "../mnt/data/C1 2.png";
import catRightPawUrl from "../mnt/data/C2 2.png";
import hitZoneRingUrl from "../mnt/data/Group 1000002938.png";
import bowlFullUrl from "../mnt/data/B2 1.png";
import bowlSpilledUrl from "../mnt/data/B3 1.png";

const AUDIO_URL = "/audio/track_1.mp3";
const WORLD_HEIGHT = 100;
const SPRITE_PX_TO_WORLD = 0.046;
const CAT_PART_UNIT = 0.152;
const BPM = 120;
const SECONDS_PER_BEAT = 60 / BPM;
const PERFECT_WINDOW = 0.08;
const GOOD_WINDOW = 0.14;
const PERFECT_SCORE = 120;
const GOOD_SCORE = 80;
const PAYOFF_BONUS_SCORE = 420;
const FEEDBACK_SHOW_MS = 420;
const HIT_FLASH_DURATION = 0.18;
const MISS_FLASH_DURATION = 0.22;
const LEFT_PAW_SLAP_DURATION = 0.16;
const SHOT_TRANSITION_DELAY = 0.24;

const STATES = {
  PlayingShot: "PlayingShot",
  ComboReady: "ComboReady",
  ResolveBeat: "ResolveBeat",
  ShotTransition: "ShotTransition",
  Finished: "Finished"
};

const LAYOUT = {
  backgroundY: 0,
  catX: 0.8,
  catY: -13.8,
  targetX: 0,
  targetY: -19.2,
  hitZoneX: 0,
  hitZoneY: -39.6,
  hitZoneWidth: 17.2
};

const catLayout = {
  scale: 0.78,
  body: { x: 0, y: 0 },
  head: { x: -8, y: 48 },
  leftPaw: { x: -37, y: 0 },
  rightPaw: { x: -3, y: 0 }
};

const CAT_PIVOTS = {
  body: { x: 0.5, y: 0.5 },
  head: { x: 0.5, y: 0.12 },
  leftPaw: { x: 0.5, y: 0.9 },
  rightPaw: { x: 0.5, y: 0.9 }
};

function toCatUnits(value) {
  return value * CAT_PART_UNIT;
}

function createTextureLoader(onLoad) {
  const loader = new THREE.TextureLoader();

  return (url) => {
    const texture = loader.load(url, onLoad);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  };
}

function applySpriteTexture(sprite, texture, scale = 1) {
  const image = texture.image;
  if (!image) {
    return;
  }

  sprite.material.map = texture;
  sprite.material.needsUpdate = true;
  sprite.scale.set(
    image.width * SPRITE_PX_TO_WORLD * scale,
    image.height * SPRITE_PX_TO_WORLD * scale,
    1
  );
}

function createSprite(texture, scale = 1) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    })
  );
  applySpriteTexture(sprite, texture, scale);
  return sprite;
}

function setSpritePivot(sprite, pivot) {
  sprite.center.set(pivot.x, pivot.y);
}

function scaleSpriteToWidth(sprite, targetWidth) {
  if (!sprite.scale.x) {
    return;
  }

  sprite.scale.multiplyScalar(targetWidth / sprite.scale.x);
}

function createStateTarget(intact, broken) {
  const root = new THREE.Group();
  broken.visible = false;
  root.add(intact, broken);

  return {
    root,
    setBroken(isBroken) {
      intact.visible = !isBroken;
      broken.visible = isBroken;
    }
  };
}

function createBowlTarget(textures) {
  const intact = createSprite(textures.bowlFull, 1);
  const broken = createSprite(textures.bowlSpilled, 1);
  scaleSpriteToWidth(intact, 12.4);
  scaleSpriteToWidth(broken, 13.8);
  intact.position.z = 0.1;
  broken.position.z = 0.1;
  return createStateTarget(intact, broken);
}

function createCupTarget() {
  const intact = new THREE.Group();
  const broken = new THREE.Group();

  const cupBody = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 2.5, 6.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9e3 })
  );
  const cupRim = new THREE.Mesh(
    new THREE.TorusGeometry(3.05, 0.22, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  cupRim.rotation.x = Math.PI / 2;
  cupRim.position.y = 3.35;
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.25, 10, 24, Math.PI * 1.6),
    new THREE.MeshBasicMaterial({ color: 0xffb9ca })
  );
  handle.position.set(3.2, 0.4, 0);
  handle.rotation.z = -0.35;
  intact.add(cupBody, cupRim, handle);

  const cupHalfA = cupBody.clone();
  cupHalfA.position.set(-1.2, -0.2, 0);
  cupHalfA.rotation.z = -0.28;
  const cupHalfB = cupBody.clone();
  cupHalfB.position.set(1.4, -0.5, 0);
  cupHalfB.rotation.z = 0.34;
  const spilledDrop = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xf8c1d1 })
  );
  spilledDrop.scale.set(1.8, 0.6, 1);
  spilledDrop.position.set(0, -3.5, 0);
  broken.add(cupHalfA, cupHalfB, spilledDrop);

  return createStateTarget(intact, broken);
}

function createPlantTarget() {
  const intact = new THREE.Group();
  const broken = new THREE.Group();

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.8, 5.6, 28),
    new THREE.MeshBasicMaterial({ color: 0xd08f66 })
  );
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(3.05, 24),
    new THREE.MeshBasicMaterial({ color: 0x5b3924 })
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 2.85;
  intact.add(pot, soil);

  const leafMaterial = new THREE.MeshBasicMaterial({ color: 0x63b75f });
  const leafOffsets = [
    [-1.2, 4.6, -0.5],
    [0, 5.8, 0],
    [1.3, 4.9, 0.5],
    [-0.6, 6.7, -0.2],
    [0.8, 6.4, 0.2]
  ];

  for (const [x, y, rotation] of leafOffsets) {
    const leaf = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 18),
      leafMaterial
    );
    leaf.scale.set(0.7, 1.4, 1);
    leaf.position.set(x, y, 0);
    leaf.rotation.z = rotation;
    intact.add(leaf);
  }

  const tippedPot = pot.clone();
  tippedPot.rotation.z = -0.48;
  tippedPot.position.set(-1.6, -0.6, 0);
  broken.add(tippedPot);

  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 20),
    new THREE.MeshBasicMaterial({ color: 0x5b3924 })
  );
  dirt.scale.set(1.8, 0.6, 1);
  dirt.position.set(1.2, -3.1, 0);
  broken.add(dirt);

  for (const [x, y, rotation] of leafOffsets.slice(0, 3)) {
    const leaf = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 18),
      leafMaterial
    );
    leaf.scale.set(0.7, 1.4, 1);
    leaf.position.set(x + 1.5, y - 5.7, 0);
    leaf.rotation.z = rotation + 0.8;
    broken.add(leaf);
  }

  return createStateTarget(intact, broken);
}

function createRadioTarget() {
  const intact = new THREE.Group();
  const broken = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 6.2, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xf7a15b })
  );
  const speakerLeft = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 22),
    new THREE.MeshBasicMaterial({ color: 0x7e4334 })
  );
  speakerLeft.position.set(-2.4, 0.1, 0.35);
  const speakerRight = speakerLeft.clone();
  speakerRight.position.x = 2.4;
  const dial = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.1, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xfff1c6 })
  );
  dial.position.set(0, 1.5, 0.35);
  const antenna = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 4.2, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xd7d8df })
  );
  antenna.position.set(3.6, 4.4, 0);
  antenna.rotation.z = -0.35;
  intact.add(body, speakerLeft, speakerRight, dial, antenna);

  const brokenBody = body.clone();
  brokenBody.rotation.z = -0.22;
  brokenBody.position.set(-0.5, -0.4, 0);
  broken.add(brokenBody);

  const crackA = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 4.8, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x6d2f26 })
  );
  crackA.position.set(-0.6, 0.2, 0.4);
  crackA.rotation.z = 0.55;
  const crackB = crackA.clone();
  crackB.position.set(1.1, -0.1, 0.4);
  crackB.rotation.z = -0.38;
  broken.add(crackA, crackB);

  return createStateTarget(intact, broken);
}

function createVaseTarget() {
  const intact = new THREE.Group();
  const broken = new THREE.Group();

  const vase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 3.6, 8.2, 28),
    new THREE.MeshBasicMaterial({ color: 0x8bd1f3 })
  );
  vase.scale.set(1, 1, 0.7);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.8, 2.1, 24),
    new THREE.MeshBasicMaterial({ color: 0xc7ecff })
  );
  neck.position.y = 4.8;
  intact.add(vase, neck);

  const shardA = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.6, 4.2, 12),
    new THREE.MeshBasicMaterial({ color: 0x8bd1f3 })
  );
  shardA.position.set(-1.6, -1.2, 0);
  shardA.rotation.z = -0.48;
  const shardB = shardA.clone();
  shardB.position.set(1.7, -1.4, 0);
  shardB.rotation.z = 0.56;
  const shardC = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.2, 2.2, 10),
    new THREE.MeshBasicMaterial({ color: 0xc7ecff })
  );
  shardC.position.set(0.1, -2.8, 0);
  shardC.rotation.z = 0.15;
  broken.add(shardA, shardB, shardC);

  return createStateTarget(intact, broken);
}

const SHOTS = [
  { id: "bowl", label: "Bowl", createTarget: (textures) => createBowlTarget(textures) },
  { id: "cup", label: "Cup", createTarget: () => createCupTarget() },
  { id: "plant", label: "Plant", createTarget: () => createPlantTarget() },
  { id: "radio", label: "Radio", createTarget: () => createRadioTarget() },
  { id: "vase", label: "Vase", createTarget: () => createVaseTarget() }
];

export class PortraitScene {
  constructor({ canvas, scoreElement, feedbackElement, onRoundComplete }) {
    this.canvas = canvas;
    this.scoreElement = scoreElement;
    this.feedbackElement = feedbackElement;
    this.onRoundComplete = onRoundComplete;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera();
    this.clock = new THREE.Clock();
    this.audio = new Audio(AUDIO_URL);
    this.audio.preload = "auto";

    const loadTexture = createTextureLoader(() => this.refreshLayout());
    this.textures = {
      background: loadTexture(backgroundUrl),
      catBody: loadTexture(catBodyUrl),
      catHead: loadTexture(catHeadUrl),
      catLeftPaw: loadTexture(catLeftPawUrl),
      catRightPaw: loadTexture(catRightPawUrl),
      hitZoneRing: loadTexture(hitZoneRingUrl),
      bowlFull: loadTexture(bowlFullUrl),
      bowlSpilled: loadTexture(bowlSpilledUrl)
    };

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.score = 0;
    this.isPlaying = false;
    this.gameState = STATES.PlayingShot;
    this.currentShotIndex = 0;
    this.currentShotTarget = null;
    this.streak = 0;
    this.comboReady = false;
    this.resolveBeatPending = false;
    this.resolveBeatIndex = -1;
    this.lastBeatIndex = -1;
    this.lastSuccessfulBeatIndex = -1;
    this.feedbackTimeout = 0;
    this.hitFlashTimer = 0;
    this.missFlashTimer = 0;
    this.leftPawTimer = 0;
    this.leftPawStrength = 1;
    this.transitionTimer = 0;

    this.buildScene();
    this.bindEvents();
    this.resize();
    this.renderScore();
    this.clearFeedback();
  }

  buildScene() {
    this.backgroundSprite = createSprite(this.textures.background);
    this.backgroundSprite.position.set(0, LAYOUT.backgroundY, -20);
    this.world.add(this.backgroundSprite);

    this.catRoot = new THREE.Group();
    this.catRoot.position.set(LAYOUT.catX, LAYOUT.catY, 4);
    this.catRoot.scale.set(catLayout.scale, catLayout.scale, 1);
    this.world.add(this.catRoot);

    this.bodySprite = createSprite(this.textures.catBody, 1);
    this.headSprite = createSprite(this.textures.catHead, 1);
    this.leftPawSprite = createSprite(this.textures.catLeftPaw, 1);
    this.rightPawSprite = createSprite(this.textures.catRightPaw, 1);

    setSpritePivot(this.bodySprite, CAT_PIVOTS.body);
    setSpritePivot(this.headSprite, CAT_PIVOTS.head);
    setSpritePivot(this.leftPawSprite, CAT_PIVOTS.leftPaw);
    setSpritePivot(this.rightPawSprite, CAT_PIVOTS.rightPaw);

    this.bodySprite.position.set(toCatUnits(catLayout.body.x), toCatUnits(catLayout.body.y), 0);
    this.headSprite.position.set(toCatUnits(catLayout.head.x), toCatUnits(catLayout.head.y), 3);
    this.leftPawSprite.position.set(toCatUnits(catLayout.leftPaw.x), toCatUnits(catLayout.leftPaw.y), 2);
    this.rightPawSprite.position.set(toCatUnits(catLayout.rightPaw.x), toCatUnits(catLayout.rightPaw.y), 2);

    this.catRoot.add(this.bodySprite, this.headSprite, this.leftPawSprite, this.rightPawSprite);

    console.log("notes file controller", "src/portraitScene.js");
    console.log("cat rendering file", "src/portraitScene.js");
    console.log("catLayout", catLayout);

    this.targetRoot = new THREE.Group();
    this.targetRoot.position.set(LAYOUT.targetX, LAYOUT.targetY, 7);
    this.world.add(this.targetRoot);

    this.hitZoneSprite = createSprite(this.textures.hitZoneRing, 1);
    this.hitZoneSprite.position.set(LAYOUT.hitZoneX, LAYOUT.hitZoneY, 3);
    this.world.add(this.hitZoneSprite);

    this.hitZoneGlow = new THREE.Mesh(
      new THREE.RingGeometry(6.7, 8.2, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffdf87,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide
      })
    );
    this.hitZoneGlow.position.set(LAYOUT.hitZoneX, LAYOUT.hitZoneY, 2);
    this.world.add(this.hitZoneGlow);

    this.hitZoneFlash = new THREE.Mesh(
      new THREE.RingGeometry(5.7, 7.9, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      })
    );
    this.hitZoneFlash.position.set(LAYOUT.hitZoneX, LAYOUT.hitZoneY, 4);
    this.world.add(this.hitZoneFlash);

    this.refreshLayout();
    this.mountShot(0);
  }

  refreshLayout() {
    if (this.backgroundSprite) {
      applySpriteTexture(this.backgroundSprite, this.textures.background, 1);
      this.updateBackgroundScale();
    }

    if (this.bodySprite) {
      applySpriteTexture(this.bodySprite, this.textures.catBody, 1);
      setSpritePivot(this.bodySprite, CAT_PIVOTS.body);
    }

    if (this.headSprite) {
      applySpriteTexture(this.headSprite, this.textures.catHead, 1);
      setSpritePivot(this.headSprite, CAT_PIVOTS.head);
    }

    if (this.leftPawSprite) {
      applySpriteTexture(this.leftPawSprite, this.textures.catLeftPaw, 1);
      setSpritePivot(this.leftPawSprite, CAT_PIVOTS.leftPaw);
    }

    if (this.rightPawSprite) {
      applySpriteTexture(this.rightPawSprite, this.textures.catRightPaw, 1);
      setSpritePivot(this.rightPawSprite, CAT_PIVOTS.rightPaw);
    }

    if (this.hitZoneSprite) {
      applySpriteTexture(this.hitZoneSprite, this.textures.hitZoneRing, 1);
      scaleSpriteToWidth(this.hitZoneSprite, LAYOUT.hitZoneWidth);
    }
  }

  mountShot(index) {
    this.targetRoot.clear();
    this.currentShotIndex = index;
    const shot = SHOTS[index];
    this.currentShotTarget = shot.createTarget(this.textures);
    this.targetRoot.add(this.currentShotTarget.root);
    this.currentShotTarget.setBroken(false);
    this.gameState = STATES.PlayingShot;
    this.streak = 0;
    this.comboReady = false;
    this.resolveBeatPending = false;
    this.resolveBeatIndex = -1;
    this.lastSuccessfulBeatIndex = -1;
  }

  updateBackgroundScale() {
    if (!this.backgroundSprite || !this.textures.background.image) {
      return;
    }

    const image = this.textures.background.image;
    const aspect = image.width / image.height;
    const worldWidth = this.camera.right - this.camera.left;
    const worldHeight = this.camera.top - this.camera.bottom;

    let width = worldHeight * aspect;
    let height = worldHeight;

    if (width < worldWidth) {
      width = worldWidth;
      height = worldWidth / aspect;
    }

    this.backgroundSprite.scale.set(width, height, 1);
  }

  bindEvents() {
    this.handleResize = () => this.resize();
    this.handlePointerDown = () => this.handleTap();
    this.handleKeyDown = (event) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        this.handleTap();
      }
    };
    this.handleAudioEnded = () => {
      this.isPlaying = false;
      this.finishRound();
    };

    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("keydown", this.handleKeyDown);
    this.audio.addEventListener("ended", this.handleAudioEnded);
  }

  mount() {
    this.clock.start();
    this.loop();
  }

  async startGameplay() {
    this.resetGameplay();
    try {
      await this.audio.play();
      this.isPlaying = true;
    } catch (error) {
      console.error("audio play failed", error);
    }
  }

  resetGameplay() {
    this.isPlaying = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.lastBeatIndex = -1;
    this.score = 0;
    this.hitFlashTimer = 0;
    this.missFlashTimer = 0;
    this.leftPawTimer = 0;
    this.leftPawStrength = 1;
    this.transitionTimer = 0;
    this.renderScore();
    this.clearFeedback();
    this.hitZoneFlash.material.opacity = 0;
    this.hitZoneGlow.material.opacity = 0.16;
    this.hitZoneGlow.material.color.set(0xffdf87);
    this.leftPawSprite.position.set(toCatUnits(catLayout.leftPaw.x), toCatUnits(catLayout.leftPaw.y), 2);
    this.leftPawSprite.rotation.z = 0;
    this.mountShot(0);
  }

  finishRound() {
    this.gameState = STATES.Finished;
    this.onRoundComplete?.({ score: this.score });
  }

  getDebugSnapshot(currentTime, beatIndex) {
    return {
      audioCurrentTime: Number(currentTime.toFixed(3)),
      beatIndex,
      beatInBar: beatIndex % 2,
      streak: this.streak,
      comboReady: this.comboReady,
      currentShotIndex: this.currentShotIndex,
      resolveBeatPending: this.resolveBeatPending
    };
  }

  handleBeatChange(beatIndex, currentTime) {
    const previousBeatIndex = beatIndex - 1;

    if (
      previousBeatIndex >= 0 &&
      this.gameState !== STATES.ComboReady &&
      this.gameState !== STATES.ResolveBeat &&
      this.gameState !== STATES.ShotTransition &&
      this.lastSuccessfulBeatIndex !== previousBeatIndex &&
      this.streak > 0
    ) {
      this.registerMiss();
    }

    if (this.resolveBeatPending && beatIndex >= this.resolveBeatIndex) {
      this.triggerResolveBeat();
    }

    console.log("beat tick", this.getDebugSnapshot(currentTime, beatIndex));
  }

  updateBeatController() {
    if (!this.isPlaying || this.gameState === STATES.Finished) {
      return;
    }

    const currentTime = this.audio.currentTime;
    const beatIndex = Math.floor(currentTime / SECONDS_PER_BEAT);

    if (beatIndex !== this.lastBeatIndex) {
      this.lastBeatIndex = beatIndex;
      this.handleBeatChange(beatIndex, currentTime);
    }
  }

  handleTap() {
    if (!this.isPlaying) {
      return;
    }

    if (
      this.gameState === STATES.ResolveBeat ||
      this.gameState === STATES.ShotTransition ||
      this.gameState === STATES.Finished
    ) {
      return;
    }

    const currentTime = this.audio.currentTime;
    const floorBeatIndex = Math.floor(currentTime / SECONDS_PER_BEAT);
    const nextBeatIndex = floorBeatIndex + 1;
    const floorBeatTime = floorBeatIndex * SECONDS_PER_BEAT;
    const nextBeatTime = nextBeatIndex * SECONDS_PER_BEAT;
    const floorOffset = Math.abs(currentTime - floorBeatTime);
    const nextOffset = Math.abs(currentTime - nextBeatTime);

    let targetBeatIndex = floorBeatIndex;
    let targetBeatTime = floorBeatTime;
    let offset = floorOffset;

    if (nextOffset < floorOffset) {
      targetBeatIndex = nextBeatIndex;
      targetBeatTime = nextBeatTime;
      offset = nextOffset;
    }

    console.log("tap timing", {
      audioCurrentTime: Number(currentTime.toFixed(3)),
      beatIndex: targetBeatIndex,
      beatInBar: targetBeatIndex % 2,
      offset: Number(offset.toFixed(3)),
      streak: this.streak,
      comboReady: this.comboReady,
      currentShotIndex: this.currentShotIndex,
      resolveBeatPending: this.resolveBeatPending
    });

    if (targetBeatIndex === this.lastSuccessfulBeatIndex) {
      return;
    }

    if (offset <= PERFECT_WINDOW) {
      this.registerCorrectTap("Perfect", PERFECT_SCORE, targetBeatIndex);
      return;
    }

    if (offset <= GOOD_WINDOW) {
      this.registerCorrectTap("Good", GOOD_SCORE, targetBeatIndex);
      return;
    }

    this.registerMiss();
  }

  registerCorrectTap(label, scoreValue, beatIndex) {
    if (this.comboReady) {
      return;
    }

    this.lastSuccessfulBeatIndex = beatIndex;
    this.streak += 1;
    this.score += scoreValue;
    this.renderScore();
    this.triggerLeftPawSlap(1);
    this.triggerHitFlash(false);

    if (this.streak >= 4) {
      this.comboReady = true;
      this.resolveBeatPending = true;
      this.resolveBeatIndex = beatIndex + 1;
      this.gameState = STATES.ComboReady;
      this.showFeedback("READY", "perfect");
      return;
    }

    this.gameState = STATES.PlayingShot;
    this.showFeedback(`${label} ${this.streak}/4`, label.toLowerCase());
  }

  registerMiss() {
    this.streak = 0;
    this.comboReady = false;
    this.resolveBeatPending = false;
    this.resolveBeatIndex = -1;
    this.gameState = STATES.PlayingShot;
    this.showFeedback("Miss", "miss");
    this.triggerHitFlash(true);
  }

  triggerResolveBeat() {
    this.resolveBeatPending = false;
    this.comboReady = false;
    this.gameState = STATES.ResolveBeat;
    this.currentShotTarget?.setBroken(true);
    this.score += PAYOFF_BONUS_SCORE;
    this.renderScore();
    this.triggerHitFlash(false);
    this.triggerLeftPawSlap(1.45);
    this.showFeedback(`${SHOTS[this.currentShotIndex].label} +${PAYOFF_BONUS_SCORE}`, "good");
    this.transitionTimer = SHOT_TRANSITION_DELAY;
  }

  updateShotTransition(deltaSeconds) {
    if (this.gameState !== STATES.ResolveBeat && this.gameState !== STATES.ShotTransition) {
      return;
    }

    this.gameState = STATES.ShotTransition;
    this.transitionTimer = Math.max(0, this.transitionTimer - deltaSeconds);
    this.targetRoot.scale.setScalar(1 + Math.sin(this.transitionTimer * 24) * 0.03);

    if (this.transitionTimer > 0) {
      return;
    }

    this.targetRoot.scale.setScalar(1);
    const nextShotIndex = this.currentShotIndex + 1;

    if (nextShotIndex >= SHOTS.length) {
      this.finishRound();
      return;
    }

    this.mountShot(nextShotIndex);
  }

  triggerHitFlash(isMiss) {
    if (isMiss) {
      this.missFlashTimer = MISS_FLASH_DURATION;
      this.hitFlashTimer = 0;
      return;
    }

    this.hitFlashTimer = HIT_FLASH_DURATION;
    this.missFlashTimer = 0;
  }

  triggerLeftPawSlap(strength = 1) {
    this.leftPawTimer = LEFT_PAW_SLAP_DURATION;
    this.leftPawStrength = strength;
  }

  updateLeftPaw(deltaSeconds) {
    if (this.leftPawTimer <= 0) {
      this.leftPawSprite.position.set(toCatUnits(catLayout.leftPaw.x), toCatUnits(catLayout.leftPaw.y), 2);
      this.leftPawSprite.rotation.z = 0;
      return;
    }

    this.leftPawTimer = Math.max(0, this.leftPawTimer - deltaSeconds);
    const progress = 1 - this.leftPawTimer / LEFT_PAW_SLAP_DURATION;
    const snap = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
    this.leftPawSprite.position.set(
      toCatUnits(catLayout.leftPaw.x) + snap * 1.6 * this.leftPawStrength,
      toCatUnits(catLayout.leftPaw.y) - snap * 2.4 * this.leftPawStrength,
      2
    );
    this.leftPawSprite.rotation.z = -snap * 0.22 * this.leftPawStrength;
  }

  updateFeedback() {
    if (this.feedbackTimeout && performance.now() >= this.feedbackTimeout) {
      this.feedbackTimeout = 0;
      this.clearFeedback();
    }
  }

  updateHitZoneFlash(deltaSeconds) {
    const idlePulse = this.comboReady
      ? 0.24 + Math.sin(this.clock.elapsedTime * 5.4) * 0.06
      : 0.14 + Math.sin(this.clock.elapsedTime * 2.2) * 0.02;

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaSeconds);
      const progress = 1 - this.hitFlashTimer / HIT_FLASH_DURATION;
      this.hitZoneFlash.material.color.set(0xfff3c1);
      this.hitZoneFlash.material.opacity = 0.82 * (1 - progress);
      this.hitZoneFlash.scale.setScalar(1 + progress * 0.18);
      this.hitZoneGlow.material.color.set(0xffdf87);
      this.hitZoneGlow.material.opacity = 0.32 + (1 - progress) * 0.24;
      return;
    }

    if (this.missFlashTimer > 0) {
      this.missFlashTimer = Math.max(0, this.missFlashTimer - deltaSeconds);
      const progress = 1 - this.missFlashTimer / MISS_FLASH_DURATION;
      this.hitZoneFlash.material.color.set(0xff7f8f);
      this.hitZoneFlash.material.opacity = 0.68 * (1 - progress);
      this.hitZoneFlash.scale.setScalar(1 + progress * 0.12);
      this.hitZoneGlow.material.color.set(0xff7f8f);
      this.hitZoneGlow.material.opacity = 0.2 + (1 - progress) * 0.16;
      return;
    }

    this.hitZoneFlash.material.opacity = 0;
    this.hitZoneFlash.scale.setScalar(1);
    this.hitZoneGlow.material.color.set(this.comboReady ? 0xfff2ad : 0xffdf87);
    this.hitZoneGlow.material.opacity = idlePulse;
  }

  renderScore() {
    if (this.scoreElement) {
      this.scoreElement.textContent = String(this.score).padStart(6, "0");
    }
  }

  showFeedback(text, tone = "neutral") {
    if (!this.feedbackElement) {
      return;
    }

    this.feedbackElement.textContent = text;
    this.feedbackElement.classList.remove("hidden", "perfect", "good", "miss");
    if (tone !== "neutral") {
      this.feedbackElement.classList.add(tone);
    }
    this.feedbackTimeout = performance.now() + FEEDBACK_SHOW_MS;
  }

  clearFeedback() {
    if (!this.feedbackElement) {
      return;
    }

    this.feedbackElement.classList.add("hidden");
    this.feedbackElement.classList.remove("perfect", "good", "miss");
    this.feedbackElement.textContent = "";
  }

  update(deltaSeconds) {
    if (this.isPlaying) {
      this.updateBeatController();
      this.updateShotTransition(deltaSeconds);
    }

    this.headSprite.position.y = toCatUnits(catLayout.head.y);
    this.updateLeftPaw(deltaSeconds);
    this.updateHitZoneFlash(deltaSeconds);
    this.updateFeedback();
    this.renderer.render(this.scene, this.camera);
  }

  loop() {
    const deltaSeconds = Math.min(0.05, this.clock.getDelta());
    this.update(deltaSeconds);
    requestAnimationFrame(() => this.loop());
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    if (!width || !height) {
      return;
    }

    this.renderer.setSize(width, height, false);

    const aspect = width / height;
    const worldWidth = WORLD_HEIGHT * aspect;

    this.camera.left = -worldWidth / 2;
    this.camera.right = worldWidth / 2;
    this.camera.top = WORLD_HEIGHT / 2;
    this.camera.bottom = -WORLD_HEIGHT / 2;
    this.camera.near = -100;
    this.camera.far = 100;
    this.camera.position.set(0, 0, 10);
    this.camera.updateProjectionMatrix();

    this.updateBackgroundScale();
  }
}
