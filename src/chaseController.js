export class ChaseController {
  constructor(config) {
    this.config = config;
    this.active = false;
    this.startTimeMs = 0;
    this.escapeMeter = 0.35;
    this.failed = false;
    this.completed = false;
  }

  start(songTimeMs) {
    this.active = true;
    this.startTimeMs = songTimeMs;
    this.escapeMeter = 0.35;
    this.failed = false;
    this.completed = false;
  }

  onHit(result) {
    if (!this.active) {
      return;
    }

    const gain = result === "Perfect"
      ? this.config.chaseDifficulty.perfectGain
      : this.config.chaseDifficulty.goodGain;
    this.escapeMeter = Math.min(1, this.escapeMeter + gain);
  }

  onMiss() {
    if (!this.active) {
      return;
    }
    this.escapeMeter = Math.max(0, this.escapeMeter - this.config.chaseDifficulty.missPenalty);
  }

  update(songTimeMs, deltaSeconds) {
    if (!this.active || this.failed || this.completed) {
      return;
    }

    this.escapeMeter = Math.max(
      0,
      this.escapeMeter - this.config.chaseDifficulty.meterDrainPerSecond * deltaSeconds
    );

    if (this.escapeMeter <= 0) {
      this.failed = true;
      this.active = false;
      return;
    }

    if (songTimeMs - this.startTimeMs >= this.config.chaseDurationMs) {
      this.completed = true;
      this.active = false;
    }
  }
}
