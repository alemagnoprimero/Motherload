import type { CampaignControls } from "./types";

export type PilotAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "mobility"
  | "primary"
  | "secondary"
  | "interact"
  | "map"
  | "pause";
export const ACTION_LABELS: Record<PilotAction, string> = {
  left: "Steer left",
  right: "Steer right",
  up: "Thrust upward",
  down: "Drill downward",
  mobility: "Mobility attachment",
  primary: "Primary utility",
  secondary: "Secondary utility",
  interact: "Interact",
  map: "Star map",
  pause: "Pause menu",
};
const DEFAULT_KEYS: Record<PilotAction, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  up: ["ArrowUp", "w"],
  down: ["ArrowDown", "s"],
  mobility: [" "],
  primary: ["q"],
  secondary: ["r"],
  interact: ["e", "Enter"],
  map: ["Tab"],
  pause: ["Escape", "p"],
};
export interface PilotPreferences {
  keys: Record<PilotAction, string[]>;
  drillToggle: boolean;
  braceToggle: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  showDirectionButtons: boolean;
  effects: number;
  ambience: number;
  music: number;
}
const KEY = "motherload.campaign.preferences.v1";
export function loadPilotPreferences(): PilotPreferences {
  const defaults: PilotPreferences = {
    keys: structuredClone(DEFAULT_KEYS),
    drillToggle: false,
    braceToggle: false,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    highContrast: false,
    largeText: false,
    showDirectionButtons: false,
    effects: 0.5,
    ambience: 0.3,
    music: 0.15,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return defaults;
    for (const k of [
      "drillToggle",
      "braceToggle",
      "reducedMotion",
      "highContrast",
      "largeText",
      "showDirectionButtons",
    ] as const)
      if (typeof raw[k] === "boolean") defaults[k] = raw[k];
    for (const k of ["effects", "ambience", "music"] as const)
      if (typeof raw[k] === "number" && Number.isFinite(raw[k]))
        defaults[k] = Math.max(0, Math.min(1, raw[k]));
    if (raw.keys)
      for (const action of Object.keys(DEFAULT_KEYS) as PilotAction[])
        if (
          Array.isArray(raw.keys[action]) &&
          raw.keys[action].length &&
          raw.keys[action].every(
            (key: unknown) => typeof key === "string" && key.length <= 30,
          )
        )
          defaults.keys[action] = raw.keys[action];
  } catch {
    /* Preferences never block an expedition. */
  }
  return defaults;
}
export function savePilotPreferences(preferences: PilotPreferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* The current settings remain usable. */
  }
}
export function keyLabel(key: string) {
  return (
    (
      {
        " ": "Space",
        ArrowLeft: "←",
        ArrowRight: "→",
        ArrowUp: "↑",
        ArrowDown: "↓",
      } as Record<string, string>
    )[key] || (key.length === 1 ? key.toUpperCase() : key)
  );
}
function editableTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, select, textarea, [contenteditable]:not([contenteditable="false"])',
      ),
    )
  );
}
function gameplayTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !editableTarget(target) &&
    (target === document.body ||
      target === document.documentElement ||
      Boolean(target.closest("#campaign-game"))) &&
    !target.closest("button, a, summary")
  );
}
export class CampaignInput {
  private held = new Map<string, PilotAction>();
  private latched = new Map<PilotAction, string>();
  private gamepadButtons = new Set<number>();
  private remapping?: PilotAction;
  onRemapped?: (message: string) => void;
  constructor(
    public preferences: PilotPreferences,
    private callbacks: {
      blocked: () => boolean;
      interact: () => void;
      map: () => void;
      pause: () => void;
      unlockAudio: () => void;
    },
  ) {
    window.addEventListener("keydown", (event) => {
      // Browser shortcuts and IME composition never become pilot commands,
      // including while the user is choosing a replacement key binding.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        this.clearKeyboard();
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (this.remapping) {
        if (editableTarget(event.target) && key !== "Escape") return;
        event.preventDefault();
        if (key === "Escape") {
          this.remapping = undefined;
          this.onRemapped?.("Remapping cancelled.");
          return;
        }
        const action = this.remapping;
        const other = (
          Object.keys(this.preferences.keys) as PilotAction[]
        ).find(
          (candidate) =>
            candidate !== action &&
            this.preferences.keys[candidate].includes(key),
        );
        if (other) {
          this.onRemapped?.(
            keyLabel(key) +
              " is assigned to " +
              ACTION_LABELS[other] +
              ". Choose another key.",
          );
          return;
        }
        this.preferences.keys[action] = [key];
        this.remapping = undefined;
        savePilotPreferences(this.preferences);
        this.onRemapped?.(
          ACTION_LABELS[action] + " is now " + keyLabel(key) + ".",
        );
        return;
      }
      const action = (Object.keys(this.preferences.keys) as PilotAction[]).find(
        (candidate) => this.preferences.keys[candidate].includes(key),
      );
      if (!action) return;
      const gameplay = gameplayTarget(event.target);
      if (action === "pause") {
        // Escape keeps its dialog-close behavior; focused toolbar buttons do
        // not turn ordinary letter keys into gameplay shortcuts.
        if (!gameplay && !(key === "Escape" && this.callbacks.blocked()))
          return;
        if (!event.repeat) {
          event.preventDefault();
          this.callbacks.pause();
        }
        return;
      }
      if (!gameplay) {
        this.clearKeyboard();
        return;
      }
      if (this.callbacks.blocked()) return;
      event.preventDefault();
      this.callbacks.unlockAudio();
      if (action === "interact" || action === "map") {
        if (!event.repeat) this.callbacks[action]();
        return;
      }
      if (!event.repeat) this.press("key:" + key, action);
    });
    window.addEventListener("keyup", (event) =>
      this.held.delete(
        "key:" + (event.key.length === 1 ? event.key.toLowerCase() : event.key),
      ),
    );
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("focusin", (event) => {
      if (!gameplayTarget(event.target)) this.clearKeyboard();
    });
    document
      .querySelectorAll<HTMLButtonElement>("[data-dir]")
      .forEach((button) => {
        button.onpointerdown = (event) => {
          if (event.button !== 0 || this.callbacks.blocked()) return;
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          this.callbacks.unlockAudio();
          this.press(
            "touch:" + event.pointerId,
            button.dataset.dir as PilotAction,
          );
          button.classList.add("held");
        };
        button.onpointerup =
          button.onpointercancel =
          button.onlostpointercapture =
            (event) => {
              this.held.delete("touch:" + event.pointerId);
              if (
                ![...this.held.values()].includes(
                  button.dataset.dir as PilotAction,
                )
              )
                button.classList.remove("held");
            };
      });
  }
  private press(source: string, action: PilotAction) {
    if (
      (action === "down" && this.preferences.drillToggle) ||
      (action === "mobility" && this.preferences.braceToggle)
    ) {
      if (this.latched.has(action)) this.latched.delete(action);
      else this.latched.set(action, source);
    } else this.held.set(source, action);
  }
  private clearKeyboard() {
    for (const source of this.held.keys())
      if (source.startsWith("key:")) this.held.delete(source);
    for (const [action, source] of this.latched)
      if (source.startsWith("key:")) this.latched.delete(action);
  }
  remap(action: PilotAction) {
    this.clear();
    this.remapping = action;
    this.onRemapped?.(
      "Press a new key for " + ACTION_LABELS[action] + ". Escape cancels.",
    );
  }
  clear() {
    this.held.clear();
    this.latched.clear();
    document
      .querySelectorAll("[data-dir]")
      .forEach((button) => button.classList.remove("held"));
  }
  /** Menu commands keep polling while the simulation itself is paused. */
  pollCommands() {
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected);
    if (!pad) {
      this.gamepadButtons.clear();
      return;
    }
    for (const [index, action] of [
      [4, "interact"],
      [5, "map"],
      [9, "pause"],
    ] as const) {
      const pressed = Boolean(pad.buttons[index]?.pressed);
      if (
        pressed &&
        !this.gamepadButtons.has(index) &&
        (action === "pause" || !this.callbacks.blocked())
      )
        this.callbacks[action]();
      if (pressed) this.gamepadButtons.add(index);
      else this.gamepadButtons.delete(index);
    }
  }
  getControls(): CampaignControls {
    if (this.callbacks.blocked()) return {};
    if (!gameplayTarget(document.activeElement)) this.clearKeyboard();
    const controls: CampaignControls = {};
    for (const action of [...this.held.values(), ...this.latched.keys()])
      if (
        action in DEFAULT_KEYS &&
        !["interact", "map", "pause"].includes(action)
      )
        controls[action as keyof CampaignControls] = true;
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected);
    if (pad) {
      controls.left ||= pad.axes[0] < -0.25 || pad.buttons[14]?.pressed;
      controls.right ||= pad.axes[0] > 0.25 || pad.buttons[15]?.pressed;
      controls.up ||=
        pad.axes[1] < -0.25 ||
        pad.buttons[12]?.pressed ||
        pad.buttons[0]?.pressed;
      controls.down ||= pad.axes[1] > 0.25 || pad.buttons[13]?.pressed;
      controls.mobility ||= pad.buttons[2]?.pressed;
      controls.primary ||= pad.buttons[1]?.pressed;
      controls.secondary ||= pad.buttons[3]?.pressed;
    }
    return controls;
  }
}
