import type { PilotPreferences } from "./input";

/** Three local synthesizer buses; no downloaded sound or reference assets. */
export class CampaignAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private ambience?: GainNode;
  private music?: GainNode;
  private machine?: OscillatorNode;
  private machineGain?: GainNode;
  private ambienceGain?: GainNode;
  private musicTimer = 0;
  muted = true;
  constructor(private preferences: PilotPreferences) {}
  async unlock() {
    if (this.muted) return;
    if (!this.context) {
      const context = (this.context = new AudioContext());
      this.master = context.createGain();
      this.master.connect(context.destination);
      this.effects = context.createGain();
      this.effects.connect(this.master);
      this.ambience = context.createGain();
      this.ambience.connect(this.master);
      this.music = context.createGain();
      this.music.connect(this.master);
      this.machineGain = context.createGain();
      this.machineGain.connect(this.effects);
      this.machineGain.gain.value = 0;
      this.machine = context.createOscillator();
      this.machine.type = "triangle";
      this.machine.frequency.value = 55;
      this.machine.connect(this.machineGain);
      this.machine.start();
      this.ambienceGain = context.createGain();
      this.ambienceGain.gain.value = 0;
      this.ambienceGain.connect(this.ambience);
      for (const frequency of [43, 64.5]) {
        const tone = context.createOscillator();
        tone.type = "sine";
        tone.frequency.value = frequency;
        tone.connect(this.ambienceGain);
        tone.start();
      }
    }
    if (this.context.state === "suspended") await this.context.resume();
    this.settings();
  }
  settings() {
    if (!this.context) return;
    const t = this.context.currentTime;
    this.master!.gain.setTargetAtTime(this.muted ? 0 : 0.5, t, 0.03);
    this.effects!.gain.setTargetAtTime(this.preferences.effects, t, 0.03);
    this.ambience!.gain.setTargetAtTime(this.preferences.ambience, t, 0.03);
    this.music!.gain.setTargetAtTime(this.preferences.music, t, 0.03);
  }
  event(kind: "pickup" | "build" | "warning" | "purchase") {
    if (!this.context || this.muted) return;
    const base =
      kind === "warning"
        ? 180
        : kind === "build"
          ? 392
          : kind === "purchase"
            ? 330
            : 660;
    this.note(base, 0.08, this.effects!, 0.09);
    if (kind !== "warning")
      setTimeout(() => {
        if (this.context) this.note(base * 1.5, 0.1, this.effects!, 0.06);
      }, 85);
  }
  private note(
    frequency: number,
    duration: number,
    output: GainNode,
    volume: number,
  ) {
    const context = this.context!,
      tone = context.createOscillator(),
      gain = context.createGain(),
      now = context.currentTime;
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    tone.connect(gain);
    gain.connect(output);
    tone.start(now);
    tone.stop(now + duration + 0.02);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
    };
  }
  update(dt: number, paused: boolean, drilling: boolean, thrusting: boolean) {
    if (!this.context) return;
    const time = this.context.currentTime;
    this.machineGain!.gain.setTargetAtTime(
      paused || this.muted ? 0 : drilling ? 0.09 : thrusting ? 0.06 : 0.015,
      time,
      0.035,
    );
    this.machine!.frequency.setTargetAtTime(
      drilling ? 96 : thrusting ? 78 : 48,
      time,
      0.06,
    );
    this.ambienceGain!.gain.setTargetAtTime(
      paused || this.muted ? 0 : 0.028,
      time,
      0.1,
    );
    if (!paused && !this.muted && (this.musicTimer += dt) > 12) {
      this.musicTimer = 0;
      this.note(130.81, 2.2, this.music!, 0.035);
    }
  }
}
