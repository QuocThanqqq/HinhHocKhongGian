export class BeatController {
  constructor(config) {
    this.bpm = config.bpm;
    this.beatDurationMs = 60000 / this.bpm;
    this.startTimeMs = 0;
    this.started = false;
    this.lastBeatIndex = -1;
    this.beatListeners = new Set();
    this.audioContext = null;
    this.nextClickBeat = 0;
  }

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.startTimeMs = performance.now();
    this.lastBeatIndex = -1;
    this.nextClickBeat = 0;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
    }
  }

  onBeat(callback) {
    this.beatListeners.add(callback);
    return () => this.beatListeners.delete(callback);
  }

  getSongTimeMs(now = performance.now()) {
    if (!this.started) {
      return 0;
    }
    return now - this.startTimeMs;
  }

  getCurrentBeatFloat(now = performance.now()) {
    return this.getSongTimeMs(now) / this.beatDurationMs;
  }

  getCurrentBeatIndex(now = performance.now()) {
    return Math.floor(this.getCurrentBeatFloat(now));
  }

  getBeatTimeMs(beatIndex) {
    return beatIndex * this.beatDurationMs;
  }

  update(now = performance.now()) {
    if (!this.started) {
      return;
    }

    const beatIndex = this.getCurrentBeatIndex(now);
    if (beatIndex > this.lastBeatIndex) {
      for (let index = this.lastBeatIndex + 1; index <= beatIndex; index += 1) {
        this.beatListeners.forEach((listener) => listener(index, this.getBeatTimeMs(index)));
      }
      this.lastBeatIndex = beatIndex;
    }

    this.scheduleClicks(now);
  }

  scheduleClicks(now) {
    if (!this.audioContext) {
      return;
    }

    const currentSongTime = this.getSongTimeMs(now);
    const lookAheadMs = 180;

    while (this.getBeatTimeMs(this.nextClickBeat) < currentSongTime + lookAheadMs) {
      this.scheduleBeatClick(this.nextClickBeat);
      this.nextClickBeat += 1;
    }
  }

  scheduleBeatClick(beatIndex) {
    if (!this.audioContext) {
      return;
    }

    const audioTime =
      this.audioContext.currentTime +
      Math.max(0, (this.getBeatTimeMs(beatIndex) - this.getSongTimeMs()) / 1000);
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const accent = beatIndex % 2 === 0;

    oscillator.type = accent ? "square" : "triangle";
    oscillator.frequency.value = accent ? 820 : 640;
    gain.gain.setValueAtTime(0.0001, audioTime);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.05 : 0.03, audioTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioTime + 0.1);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(audioTime);
    oscillator.stop(audioTime + 0.11);
  }
}
