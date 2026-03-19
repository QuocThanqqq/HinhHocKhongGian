export class InputJudge {
  constructor(config) {
    this.config = config;
  }

  judge(diffMs) {
    const absolute = Math.abs(diffMs);
    if (absolute <= this.config.hitWindows.perfect) {
      return "Perfect";
    }
    if (absolute <= this.config.hitWindows.good) {
      return "Good";
    }
    return "Miss";
  }

  handleTap(songTimeMs, noteSystem) {
    const noteAttempt = noteSystem.consumeClosest(songTimeMs);
    if (!noteAttempt) {
      return {
        result: "Miss",
        diffMs: null
      };
    }

    return {
      result: this.judge(noteAttempt.diffMs),
      diffMs: noteAttempt.diffMs
    };
  }
}
