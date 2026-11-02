/** Shared production/offline graph: every loop and cue uses the same mix. */
export interface AudioMix {
  sound: boolean;
  effects: number;
  ambience: number;
  music: number;
}
export type AudioCue =
  | "cut"
  | "pickup"
  | "landing"
  | "damage"
  | "warning"
  | "build"
  | "purchase"
  | "sale"
  | "volatile"
  | "rupture"
  | "shelf"
  | "powerdown"
  | "travel"
  | "discovery"
  | "reserve"
  | "cut-start"
  | "footing"
  | "hold-full";
export interface MachineSound {
  paused: boolean;
  drilling: boolean;
  thrusting: boolean;
  material?: "soil" | "ice" | "stone" | "plate";
}
interface Voice {
  source: OscillatorNode;
  gain: GainNode;
  ends: number;
}
export const DEFAULT_AUDIO_MIX: AudioMix = {
  sound: true,
  effects: 0.8,
  ambience: 0.5,
  music: 0.45,
};
export const AUDIO_VOICE_LIMIT = 12;
export class CampaignAudioGraph {
  readonly master: GainNode;
  readonly effects: GainNode;
  readonly ambience: GainNode;
  readonly music: GainNode;
  readonly compressor: DynamicsCompressorNode;
  private tones: OscillatorNode[] = [];
  private machineGains: GainNode[] = [];
  private ambientGains: GainNode[] = [];
  private noiseSource: AudioBufferSourceNode;
  private noiseGain: GainNode;
  private voices: Voice[] = [];
  private lastCue = new Map<string, number>();
  private mix: AudioMix;
  private duckUntil = 0;
  private disposed = false;
  constructor(
    readonly context: BaseAudioContext,
    mix: AudioMix = DEFAULT_AUDIO_MIX,
  ) {
    this.mix = { ...mix };
    this.master = context.createGain();
    this.effects = context.createGain();
    this.ambience = context.createGain();
    this.music = context.createGain();
    this.compressor = context.createDynamicsCompressor();
    Object.assign(this.compressor.threshold, { value: -14 });
    this.compressor.ratio.value = 6;
    this.compressor.knee.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    const highPass = context.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 80;
    highPass.Q.value = 0.7;
    this.effects.connect(highPass);
    highPass.connect(this.master);
    this.ambience.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(context.destination);
    for (const frequency of [180, 540, 1080]) {
      const tone = context.createOscillator(),
        gain = context.createGain();
      tone.frequency.value = frequency;
      gain.gain.value = 0;
      tone.connect(gain);
      gain.connect(this.effects);
      tone.start();
      this.tones.push(tone);
      this.machineGains.push(gain);
    }
    const noise = context.createBuffer(
        1,
        context.sampleRate,
        context.sampleRate,
      ),
      samples = noise.getChannelData(0);
    let seed = 0x19b3a05;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = (seed / 0x100000000) * 2 - 1;
    }
    this.noiseSource = context.createBufferSource();
    this.noiseSource.buffer = noise;
    this.noiseSource.loop = true;
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    this.noiseSource.connect(filter);
    filter.connect(this.noiseGain);
    this.noiseGain.connect(this.effects);
    this.noiseSource.start();
    for (const frequency of [98, 147]) {
      const tone = context.createOscillator(),
        gain = context.createGain();
      tone.frequency.value = frequency;
      gain.gain.value = 0;
      tone.connect(gain);
      gain.connect(this.ambience);
      tone.start();
      this.tones.push(tone);
      this.ambientGains.push(gain);
    }
    this.settings(mix, 0);
  }
  /** Six persistent sources leave six voices for music and transient effects. */
  get voiceCount() {
    return (
      6 + this.voices.filter((v) => v.ends > this.context.currentTime).length
    );
  }
  settings(mix: AudioMix, ramp = 0.03) {
    this.mix = { ...mix };
    const now = this.context.currentTime;
    const set = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(now);
      if (ramp) param.setTargetAtTime(value, now, ramp);
      else param.setValueAtTime(value, now);
    };
    set(this.master.gain, mix.sound ? 0.9 : 0);
    set(this.effects.gain, mix.effects);
    const duck = now < this.duckUntil ? 0.5 : 1;
    set(this.ambience.gain, mix.ambience * duck);
    set(this.music.gain, mix.music * duck);
  }
  machine(state: MachineSound) {
    const now = this.context.currentTime,
      live = !state.paused && this.mix.sound;
    const amplitudes = state.drilling
      ? [0.045, 0.1, 0.065]
      : state.thrusting
        ? [0.045, 0.045, 0.018]
        : [0.012, 0.007, 0.003];
    const multiplier =
      state.material === "ice"
        ? 1.3
        : state.material === "stone"
          ? 0.8
          : state.material === "plate"
            ? 0.66
            : 1;
    for (let i = 0; i < 3; i++) {
      this.machineGains[i].gain.setTargetAtTime(
        live ? amplitudes[i] * 0.5 : 0,
        now,
        0.035,
      );
      this.tones[i].frequency.setTargetAtTime(
        (state.drilling
          ? [180, 540, 1080]
          : state.thrusting
            ? [125, 375, 750]
            : [90, 270, 540])[i] * multiplier,
        now,
        0.045,
      );
    }
    this.noiseGain.gain.setTargetAtTime(
      live ? (state.drilling ? 0.0175 : state.thrusting ? 0.025 : 0) : 0,
      now,
      0.035,
    );
    this.ambientGains.forEach((g) =>
      g.gain.setTargetAtTime(live ? 0.0225 : 0, now, 0.12),
    );
    if (this.duckUntil && now >= this.duckUntil) {
      this.duckUntil = 0;
      this.settings(this.mix, 0.4);
    }
  }
  atmosphere(world: string, depth: number) {
    const now = this.context.currentTime,
      root = world === "W02" ? 110 : 98,
      descent = 1 - Math.min(0.2, depth / 4000);
    this.tones[3].frequency.setTargetAtTime(root * descent, now, 0.5);
    this.tones[4].frequency.setTargetAtTime(root * 1.5 * descent, now, 0.5);
  }
  private note(
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    output = this.effects,
    shape: OscillatorType = "sine",
    endFrequency?: number,
  ) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    this.voices = this.voices.filter((v) => v.ends > now);
    while (this.voices.length >= AUDIO_VOICE_LIMIT - 6) {
      const old = this.voices.shift()!;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(0, now);
      old.source.stop(now);
    }
    const source = this.context.createOscillator(),
      gain = this.context.createGain(),
      start = now + delay;
    source.type = shape;
    source.frequency.setValueAtTime(frequency, start);
    if (endFrequency)
      source.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + duration,
      );
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      volume * (output === this.effects ? 0.65 : 1),
      start + Math.min(0.012, duration / 4),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain);
    gain.connect(output);
    const voice = { source, gain, ends: start + duration + 0.01 };
    this.voices.push(voice);
    source.start(start);
    source.stop(voice.ends);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices = this.voices.filter((v) => v !== voice);
    };
  }
  private duck() {
    this.duckUntil = this.context.currentTime + 0.8;
    this.settings(this.mix, 0.05);
  }
  cue(kind: AudioCue, tier = 1, strength = 1) {
    if (!this.mix.sound || this.disposed) return;
    const now = this.context.currentTime;
    if (now - (this.lastCue.get(kind) ?? -Infinity) < 0.06) return;
    this.lastCue.set(kind, now);
    const note = (
      f: number,
      d: number,
      v: number,
      delay = 0,
      shape: OscillatorType = "sine",
      end?: number,
    ) =>
      this.note(
        f,
        d,
        v *
          (kind === "cut"
            ? 3.5
            : kind === "pickup" || kind === "warning"
              ? 1.7
              : 1),
        delay,
        this.effects,
        shape,
        end,
      );
    switch (kind) {
      case "cut-start":
        note(340, 0.06, 0.2, 0, "triangle", 220);
        break;
      case "footing":
        note(190, 0.08, 0.24, 0, "triangle");
        break;
      case "hold-full":
        note(392, 0.14, 0.32, 0, "triangle");
        note(261.63, 0.2, 0.3, 0.16);
        break;
      case "cut":
        note(230 + tier * 75, 0.12, 0.26, 0, "triangle", 105);
        note(1700, 0.06, 0.12);
        break;
      case "pickup": {
        const f = [523.25, 659.25, 783.99, 1046.5][
          Math.max(0, Math.min(3, tier - 1))
        ];
        note(f, 0.12, 0.3);
        note(f * 1.5, 0.18, 0.25, 0.08);
        if (tier >= 4) note(f * 2, 0.28, 0.16, 0.12);
        break;
      }
      case "landing":
        note(70, 0.14, Math.min(0.4, strength * 0.12), 0, "sine", 45);
        note(2000, 0.06, Math.min(0.18, strength * 0.04));
        break;
      case "damage":
      case "rupture":
        this.duck();
        note(460, 0.25, 0.3, 0, "triangle", 110);
        note(1630, 0.1, 0.15);
        break;
      case "warning":
        this.duck();
        note(660, 0.16, 0.22);
        note(440, 0.18, 0.2, 0.2);
        break;
      case "build":
      case "travel":
        this.duck();
        [261.63, 329.63, 392, 523.25].forEach((f, i) =>
          note(f, 0.4, 0.24, i * 0.12),
        );
        break;
      case "purchase":
        note(196, 0.09, 0.24, 0, "triangle");
        note(784, 0.24, 0.24, 0.1);
        break;
      case "sale":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          note(f, 0.18, 0.22, i * 0.09),
        );
        break;
      case "volatile":
        note(1174.66, 0.45, 0.26);
        note(1762, 0.25, 0.12);
        break;
      case "shelf":
        note(150, 0.3, 0.24, 0, "triangle", 90);
        note(620, 0.09, 0.16, 0.15);
        break;
      case "powerdown":
        note(192, 0.7, 0.24, 0, "triangle", 32);
        note(1200, 0.04, 0.1, 0.6);
        break;
      case "discovery":
      case "reserve":
        note(440, 0.24, 0.24);
        note(880, 0.3, 0.2, 0.15);
        break;
    }
  }
  musicBeat(step: number, world: string, depth: number, danger: boolean) {
    if (!this.mix.sound || this.mix.music === 0) return;
    const sequence = danger
      ? [0, 7, 3, 7, 0, 7, 2, 7]
      : world === "W02"
        ? [0, 7, 10, 14, 7, 3, 10, 5]
        : [0, 7, 12, 7, 3, 10, 7, 5];
    const root = world === "W02" ? 146.83 : depth > 300 ? 110 : 130.81,
      f = root * 2 ** (sequence[step % sequence.length] / 12);
    this.note(f, 1.7, 0.22, 0, this.music);
    if (step % 4 === 0) this.note(root / 2, 2.4, 0.12, 0, this.music);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tones.forEach((t) => t.stop());
    this.noiseSource.stop();
    this.voices.forEach((v) => v.source.stop());
    this.voices = [];
    this.master.disconnect();
  }
}
export function createCampaignAudioGraph(
  context: BaseAudioContext,
  mix: AudioMix = DEFAULT_AUDIO_MIX,
) {
  return new CampaignAudioGraph(context, mix);
}
