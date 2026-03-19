import { SHOTS } from "./data/shots.js";

export class ShotManager {
  constructor(config) {
    this.config = config;
    this.shots = SHOTS;
    this.index = 0;
    this.comboHits = 0;
    this.comboReady = false;
    this.resolveBeat = null;
    this.state = "Intro";
    this.transitionAtMs = null;
    this.onComboReady = null;
    this.onPayoff = null;
    this.onShotChanged = null;
  }

  start() {
    this.index = 0;
    this.comboHits = 0;
    this.comboReady = false;
    this.resolveBeat = null;
    this.state = "Shot_Playing";
    this.transitionAtMs = null;
    this.onShotChanged?.(this.getCurrentShot());
  }

  getCurrentShot() {
    return this.shots[this.index] ?? null;
  }

  getProgressText() {
    return this.index < this.shots.length
      ? `Shot ${this.index + 1} / ${this.shots.length}`
      : "Chase";
  }

  handleHit(currentBeatIndex) {
    if (this.state !== "Shot_Playing") {
      return { comboReady: false };
    }

    this.comboHits += 1;
    if (this.comboHits >= this.config.requiredHitsForCombo) {
      this.comboHits = this.config.requiredHitsForCombo;
      this.comboReady = true;
      this.resolveBeat = currentBeatIndex + this.config.resolveDelayBeats;
      this.state = "Shot_ComboReady";
      this.onComboReady?.(this.getCurrentShot());
      return { comboReady: true };
    }

    return { comboReady: false };
  }

  handleMiss() {
    const wasComboReady = this.state === "Shot_ComboReady";
    if (this.state === "Shot_Playing" || wasComboReady) {
      this.comboHits = 0;
      this.comboReady = false;
      this.resolveBeat = null;
      this.state = "Shot_Playing";
    }
    return { canceledComboReady: wasComboReady };
  }

  update(songTimeMs) {
    if (this.state === "Shot_Resolve" && this.transitionAtMs !== null && songTimeMs >= this.transitionAtMs) {
      this.advanceShot();
    }
  }

  onBeat(beatIndex, beatTimeMs) {
    if (this.state === "Shot_ComboReady" && beatIndex >= this.resolveBeat) {
      this.state = "Shot_Resolve";
      this.comboReady = false;
      this.transitionAtMs = beatTimeMs + this.config.resolveAnimationMs;
      this.onPayoff?.(this.getCurrentShot());
      return { resolved: true };
    }

    return { resolved: false };
  }

  advanceShot() {
    this.comboHits = 0;
    this.resolveBeat = null;
    this.transitionAtMs = null;
    this.index += 1;

    if (this.index >= this.shots.length) {
      this.state = "Chase";
      return;
    }

    this.state = "Shot_Transition";
    this.onShotChanged?.(this.getCurrentShot());
    this.state = "Shot_Playing";
  }
}
