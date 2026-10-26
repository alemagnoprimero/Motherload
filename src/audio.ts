import { capacity, maxFuel, type Mine } from "./model";

export type GameSound =
  "pickup" | "damage" | "sell" | "service" | "upgrade" | "warning";

type LoopKind = "drill" | "thrust" | "drive";
interface MotorLoop {
  kind: LoopKind;
  output: GainNode;
  carrier: OscillatorNode;
  filter: BiquadFilterNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

/** Original synthesized effects. No audio files or extracted game sounds. */
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private uiMaster?: GainNode;
  private noise?: AudioBuffer;
  private motor?: MotorLoop;
  private active = new Set<AudioScheduledSourceNode>();
  private muted = false;
  private paused = false;
  private backgrounded = false;
  private volume = 0.28;
  private disposed = false;
  private observedMine?: Mine;
  private previous = { mined: 0, cargo: 0, hull: 0, lowFuel: false };
  private silenceForBackground = () => {
    this.paused = true;
    this.backgrounded = true;
    this.applyVolume();
    this.stopMotor();
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // A sound can already have ended while the window was losing focus.
      }
    }
  };
  private onFocus = () => {
    if (!document.hidden) {
      this.backgrounded = false;
      this.applyVolume();
    }
  };
  private onVisibilityChange = () => {
    if (document.hidden) this.silenceForBackground();
    else if (document.hasFocus()) this.onFocus();
  };

  constructor() {
    if (typeof window !== "undefined") {
      // requestAnimationFrame may stop before the next update on a phone.
      window.addEventListener("blur", this.silenceForBackground);
      window.addEventListener("focus", this.onFocus);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  /** Call from a pointer/keyboard gesture; unsupported/blocked audio stays silent. */
  async unlock(): Promise<void> {
    if (this.disposed || typeof window === "undefined") return;
    try {
      if (document.hidden) return;
      this.backgrounded = false;
      if (!this.context) {
        const Audio =
          window.AudioContext ||
          (
            window as Window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio({ latencyHint: "interactive" });
        this.master = this.context.createGain();
        this.master.gain.value = this.muted || this.paused ? 0 : this.volume;
        this.master.connect(this.context.destination);
        // Base purchases pause the simulation, but their feedback belongs to
        // the interface. This bus stays audible while world sounds are paused.
        this.uiMaster = this.context.createGain();
        this.uiMaster.gain.value = this.muted ? 0 : this.volume;
        this.uiMaster.connect(this.context.destination);
        // A repeatable, newly generated noise bed avoids fetching any assets.
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate,
          this.context.sampleRate,
        );
        const data = this.noise.getChannelData(0);
        let seed = 43179;
        for (let i = 0; i < data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[i] = (seed / 4294967296) * 2 - 1;
        }
      }
      this.applyVolume();
      if (this.context.state !== "running") await this.context.resume();
    } catch {
      // Audio permissions and device interruptions must never interrupt a run.
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
    if (muted) this.stopMotor();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(
      0,
      Math.min(1, Number.isFinite(volume) ? volume : 0),
    );
    this.applyVolume();
    if (this.volume === 0) this.stopMotor();
  }

  private applyVolume(): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(
      this.muted || this.paused || this.backgrounded ? 0 : this.volume,
      now,
      0.015,
    );
    if (this.uiMaster) {
      this.uiMaster.gain.cancelScheduledValues(now);
      this.uiMaster.gain.setTargetAtTime(
        this.muted || this.backgrounded ? 0 : this.volume,
        now,
        0.015,
      );
    }
  }

  update(mine: Mine, paused: boolean): void {
    if (this.paused !== paused) {
      this.paused = paused;
      this.applyVolume();
    }
    const state = mine.state;
    const lowFuel = state.fuel <= maxFuel(state) * 0.2;
    if (this.observedMine === mine && !paused) {
      if (
        state.mined > this.previous.mined &&
        state.inventory.length > this.previous.cargo
      )
        this.play("pickup");
      if (state.hull < this.previous.hull - 1e-6) this.play("damage");
      if (
        (!this.previous.lowFuel && lowFuel) ||
        (this.previous.cargo < capacity(state) &&
          state.inventory.length >= capacity(state))
      )
        this.play("warning");
    }
    this.observedMine = mine;
    this.previous = {
      mined: state.mined,
      cargo: state.inventory.length,
      hull: state.hull,
      lowFuel,
    };

    if (
      paused ||
      this.backgrounded ||
      state.fuel <= 0 ||
      state.hull <= 0 ||
      this.muted ||
      this.volume === 0 ||
      this.context?.state !== "running"
    ) {
      this.stopMotor();
      return;
    }
    const kind =
      mine.progress > 0
        ? "drill"
        : mine.thrusting
          ? "thrust"
          : (mine.grounded || mine.docked) && Math.abs(mine.velocityX) > 0.15
            ? "drive"
            : undefined;
    if (!kind) {
      this.stopMotor();
      return;
    }
    if (this.motor?.kind !== kind) {
      this.stopMotor();
      this.startMotor(kind);
    }
    if (this.motor && this.context) {
      const now = this.context.currentTime;
      const pitch =
        kind === "drill"
          ? 74 + Math.sin(mine.progress * 35) * 5
          : kind === "thrust"
            ? 60 + Math.abs(mine.velocityY) * 3
            : 38 + Math.abs(mine.velocityX) * 5;
      this.motor.carrier.frequency.setTargetAtTime(pitch, now, 0.06);
    }
  }

  play(sound: GameSound): void {
    const isInterface =
      sound === "sell" || sound === "service" || sound === "upgrade";
    if (
      this.disposed ||
      this.muted ||
      this.backgrounded ||
      (this.paused && !isInterface) ||
      this.volume === 0 ||
      !this.context ||
      this.context.state !== "running"
    )
      return;
    switch (sound) {
      case "pickup":
        this.tone(880, 990, 0.09, 0, "sine", 0.1);
        this.tone(1174, 1320, 0.1, 0.065, "sine", 0.08);
        break;
      case "sell":
        [660, 880, 1320].forEach((hz, i) =>
          this.tone(hz, hz, 0.12, i * 0.065, "sine", 0.1, "ui"),
        );
        break;
      case "service":
        this.tone(330, 440, 0.14, 0, "triangle", 0.1, "ui");
        this.tone(440, 550, 0.14, 0.1, "sine", 0.08, "ui");
        break;
      case "upgrade":
        [392, 523, 784, 1047].forEach((hz, i) =>
          this.tone(hz, hz * 1.01, 0.18, i * 0.09, "triangle", 0.1, "ui"),
        );
        break;
      case "damage":
        this.tone(155, 42, 0.19, 0, "sawtooth", 0.07);
        this.tone(64, 34, 0.23, 0, "sine", 0.14);
        break;
      case "warning":
        this.tone(350, 300, 0.13, 0, "triangle", 0.12);
        this.tone(350, 300, 0.13, 0.2, "triangle", 0.12);
        break;
    }
  }

  private tone(
    frequency: number,
    endFrequency: number,
    duration: number,
    delay: number,
    type: OscillatorType,
    level: number,
    bus: "world" | "ui" = "world",
  ): void {
    const context = this.context;
    const destination = bus === "ui" ? this.uiMaster : this.master;
    if (!context || !destination) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const begin = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, begin);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      begin + duration,
    );
    envelope.gain.setValueAtTime(0, begin);
    envelope.gain.linearRampToValueAtTime(level, begin + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, begin + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    this.active.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.active.delete(oscillator);
    };
    oscillator.start(begin);
    oscillator.stop(begin + duration + 0.01);
  }

  private startMotor(kind: LoopKind): void {
    const context = this.context;
    if (!context || !this.master || !this.noise) return;
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    const noise = context.createBufferSource();
    const noiseLevel = context.createGain();
    const carrier = context.createOscillator();
    const carrierLevel = context.createGain();
    noise.buffer = this.noise;
    noise.loop = true;
    filter.type = kind === "drill" ? "bandpass" : "lowpass";
    filter.frequency.value = kind === "drill" ? 700 : 440;
    filter.Q.value = 0.8;
    noiseLevel.gain.value = kind === "drill" ? 0.1 : 0.06;
    carrier.type = kind === "drill" ? "sawtooth" : "triangle";
    carrier.frequency.value = kind === "drill" ? 74 : 60;
    carrierLevel.gain.value = kind === "drive" ? 0.014 : 0.022;
    output.gain.value = 0;
    output.gain.setTargetAtTime(
      kind === "drive" ? 0.45 : 1,
      context.currentTime,
      0.035,
    );
    noise.connect(filter);
    filter.connect(noiseLevel);
    noiseLevel.connect(output);
    carrier.connect(carrierLevel);
    carrierLevel.connect(output);
    output.connect(this.master);
    const sources = [noise, carrier];
    const nodes = [noise, carrier, filter, noiseLevel, carrierLevel, output];
    let remaining = sources.length;
    for (const source of sources) {
      this.active.add(source);
      source.onended = () => {
        this.active.delete(source);
        remaining--;
        if (remaining === 0) nodes.forEach((node) => node.disconnect());
      };
      source.start();
    }
    this.motor = { kind, output, carrier, filter, sources, nodes };
  }

  private stopMotor(): void {
    const motor = this.motor;
    if (!motor || !this.context) return;
    this.motor = undefined;
    const now = this.context.currentTime;
    motor.output.gain.cancelScheduledValues(now);
    motor.output.gain.setTargetAtTime(0, now, 0.01);
    for (const source of motor.sources) {
      try {
        source.stop(now + 0.05);
      } catch {
        // A device interruption can end a source before the UI sees it.
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", this.silenceForBackground);
      window.removeEventListener("focus", this.onFocus);
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.stopMotor();
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // Already-ended sources are safe to discard.
      }
      source.disconnect();
    }
    this.active.clear();
    this.master?.disconnect();
    this.uiMaster?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.master = undefined;
    this.uiMaster = undefined;
    this.noise = undefined;
  }
}
