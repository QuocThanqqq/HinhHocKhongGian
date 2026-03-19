import * as THREE from "three";

function createNoteMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff5b8 })
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.3, 3.9, 28),
    new THREE.MeshBasicMaterial({ color: 0xff7b5c, side: THREE.DoubleSide })
  );

  group.add(body);
  group.add(ring);
  return group;
}

export class NoteSystem {
  constructor(config, scene, onMiss) {
    this.config = config;
    this.scene = scene;
    this.onMiss = onMiss;
    this.mode = "shot";
    this.notes = [];
    this.generatedUntilBeat = -1;
    this.noteRoot = new THREE.Group();
    this.scene.add(this.noteRoot);
  }

  setMode(mode) {
    if (this.mode === mode) {
      return;
    }

    this.mode = mode;
    this.generatedUntilBeat = Math.floor(this.generatedUntilBeat);
  }

  update(songTimeMs, currentBeatFloat, isActive) {
    if (isActive) {
      this.generateNotes(songTimeMs, currentBeatFloat);
    }

    for (const note of this.notes) {
      if (!note.spawned && songTimeMs >= note.spawnTimeMs) {
        note.spawned = true;
        this.noteRoot.add(note.mesh);
      }

      if (!note.spawned || note.resolved) {
        continue;
      }

      const progress = THREE.MathUtils.clamp(
        (songTimeMs - note.spawnTimeMs) / this.config.noteTravelTimeMs,
        0,
        1.25
      );
      note.mesh.position.set(
        this.config.laneX,
        THREE.MathUtils.lerp(this.config.noteSpawnY, this.config.hitZoneY, progress),
        5
      );
      const squash = 1 + Math.max(0, progress - 0.75) * 0.35;
      note.mesh.scale.setScalar(squash);

      if (songTimeMs - note.timeMs > this.config.hitWindows.good) {
        this.resolveMiss(note);
      }
    }

    this.notes = this.notes.filter((note) => !note.remove);
  }

  generateNotes(songTimeMs, currentBeatFloat) {
    const beatDurationMs = 60000 / this.config.bpm;
    const leadBeats = this.config.noteSpawnAheadBeats;
    const horizonBeat = currentBeatFloat + leadBeats;

    while (this.generatedUntilBeat < horizonBeat) {
      const nextBeat = this.mode === "chase"
        ? this.generatedUntilBeat + this.config.chaseDifficulty.intervalBeats
        : Math.max(0, Math.floor(this.generatedUntilBeat + 1));
      this.generatedUntilBeat = nextBeat;

      const beatTimeMs = nextBeat * beatDurationMs;
      if (beatTimeMs < songTimeMs - 100) {
        continue;
      }

      this.notes.push({
        timeMs: beatTimeMs,
        spawnTimeMs: beatTimeMs - this.config.noteTravelTimeMs,
        mesh: createNoteMesh(),
        spawned: false,
        resolved: false,
        remove: false
      });
    }
  }

  resolveMiss(note) {
    if (note.resolved) {
      return;
    }
    note.resolved = true;
    note.remove = true;
    this.noteRoot.remove(note.mesh);
    this.onMiss?.(note);
  }

  consumeClosest(songTimeMs) {
    let bestNote = null;
    let bestDiff = Infinity;

    for (const note of this.notes) {
      if (!note.spawned || note.resolved) {
        continue;
      }

      const diff = Math.abs(songTimeMs - note.timeMs);
      if (diff <= this.config.hitWindows.good && diff < bestDiff) {
        bestDiff = diff;
        bestNote = note;
      }
    }

    if (!bestNote) {
      return null;
    }

    bestNote.resolved = true;
    bestNote.remove = true;
    this.noteRoot.remove(bestNote.mesh);

    return {
      diffMs: songTimeMs - bestNote.timeMs
    };
  }

  flashHit() {
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(6.8, 8.4, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd76e,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    glow.position.set(this.config.laneX, this.config.hitZoneY, 4);
    this.scene.add(glow);

    let life = 0;
    const dispose = () => {
      life += 1 / 60;
      glow.scale.setScalar(1 + life * 2.2);
      glow.material.opacity = Math.max(0, 0.9 - life * 2.8);
      if (life > 0.32) {
        this.scene.remove(glow);
        return true;
      }
      return false;
    };

    return dispose;
  }
}
