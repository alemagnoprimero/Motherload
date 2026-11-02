import type { PilotPreferences } from "./input";
import type { CampaignEvent } from "./events";
import { CampaignAudioGraph, type AudioCue } from "./audio-graph";
export interface AudioWorldState {
  worldId: string;
  depth: number;
  danger: "ok" | "plan" | "turn" | "stranded";
  material?: "soil" | "ice" | "stone" | "plate";
}
/** Event-driven feedback; graph is also used by the offline mix checks. */
export class CampaignAudio {
  private context?: AudioContext;
  private graph?: CampaignAudioGraph;
  private musicTimer = 0;
  private musicStep = 0;
  private alarmTimer = 0;
  private state: AudioWorldState = { worldId: "W01", depth: 0, danger: "ok" };
  constructor(private preferences: PilotPreferences) {}
  get muted() {
    return this.preferences.sound === false;
  }
  set muted(value: boolean) {
    this.preferences.sound = !value;
  }
  get running() {
    return this.context?.state === "running";
  }
  get voiceCount() {
    return this.graph?.voiceCount ?? 0;
  }
  /** Construct and resume synchronously before the first await in the click handler. */
  async unlock() {
    if (this.muted) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.graph = new CampaignAudioGraph(this.context, this.preferences);
    }
    const resumed =
      this.context.state === "suspended" ? this.context.resume() : undefined;
    this.settings();
    await resumed;
  }
  settings() {
    this.graph?.settings(this.preferences);
  }
  setState(state: Partial<AudioWorldState>) {
    this.state = { ...this.state, ...state };
    this.graph?.atmosphere(this.state.worldId, this.state.depth);
  }
  event(kind: AudioCue) {
    this.graph?.cue(kind);
  }
  handleEvent(event: CampaignEvent) {
    this.setState({
      worldId: event.worldId,
      depth: Math.max(0, (event.y + 1) * 10),
    });
    switch (event.type) {
      case "interaction":
        this.graph?.cue(event.action);
        break;
      case "cut":
        this.state.material = event.material;
        this.graph?.cue(
          "cut",
          event.material === "ice" ? 3 : event.material === "soil" ? 2 : 1,
        );
        break;
      case "pickup":
        this.graph?.cue("pickup", event.relic ? 4 : event.tier);
        this.haptic(15, 0.15);
        break;
      case "landing":
        this.graph?.cue("landing", 1, event.speed);
        if (event.speed > 4) this.haptic(35, 0.3);
        break;
      case "damage":
        this.graph?.cue("damage");
        this.haptic(40, 0.6);
        break;
      case "volatile":
        this.graph?.cue(event.phase === "ruptured" ? "rupture" : "volatile");
        this.haptic(25, 0.2);
        break;
      case "shelf":
      case "pressure":
        this.graph?.cue(event.phase === "warning" ? "shelf" : "damage");
        break;
      case "sale":
        this.graph?.cue("sale");
        break;
      case "install":
        this.graph?.cue("purchase");
        break;
      case "construction":
        this.graph?.cue("build");
        this.haptic(50, 0.3);
        break;
      case "travel":
        this.graph?.cue("travel");
        break;
      case "reserve":
        this.graph?.cue("reserve");
        break;
      case "discovery":
      case "mission":
        this.graph?.cue("discovery");
        break;
      case "disabled":
        this.graph?.cue("powerdown");
        break;
    }
  }
  private haptic(duration: number, magnitude: number) {
    if (!this.preferences.haptics || typeof navigator === "undefined") return;
    if (navigator.vibrate && matchMedia("(pointer: coarse)").matches)
      navigator.vibrate(duration);
    for (const pad of navigator.getGamepads?.() ?? []) {
      const actuator =
        pad &&
        (
          pad as Gamepad & {
            vibrationActuator?: {
              playEffect: (kind: string, options: object) => Promise<unknown>;
            };
          }
        ).vibrationActuator;
      if (actuator)
        void actuator
          .playEffect("dual-rumble", {
            duration,
            startDelay: 0,
            strongMagnitude: magnitude,
            weakMagnitude: magnitude / 2,
          })
          .catch(() => {});
    }
  }
  update(dt: number, paused: boolean, drilling: boolean, thrusting: boolean) {
    if (!this.graph) return;
    this.graph.machine({
      paused,
      drilling,
      thrusting,
      material: this.state.material,
    });
    if (paused || this.muted) return;
    const danger = this.state.danger !== "ok",
      interval =
        this.state.danger === "stranded"
          ? 1
          : this.state.danger === "turn"
            ? 2
            : 4;
    if (danger && this.preferences.alarm) {
      this.alarmTimer += dt;
      if (this.alarmTimer >= interval) {
        this.alarmTimer = 0;
        this.graph.cue("warning");
      }
    } else this.alarmTimer = 0;
    this.musicTimer += dt;
    if (this.musicTimer >= (danger ? 1.8 : 2.8)) {
      this.musicTimer = 0;
      this.graph.musicBeat(
        this.musicStep++,
        this.state.worldId,
        this.state.depth,
        danger,
      );
    }
  }
  dispose() {
    this.graph?.dispose();
    void this.context?.close();
  }
}
