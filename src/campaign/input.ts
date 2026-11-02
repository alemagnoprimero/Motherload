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
export type MenuAction =
  "previous" | "next" | "left" | "right" | "activate" | "back";
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
export const DEFAULT_KEYS: Record<PilotAction, string[]> = {
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
  sound: boolean;
  alarm: boolean;
  haptics: boolean;
  shake: boolean;
  assists: boolean;
  uiScale: number;
  renderScale: number;
  coachStep: number;
  coachSkipped: boolean;
  gamepad: Record<PilotAction, number>;
}
export const DEFAULT_GAMEPAD: Record<PilotAction, number> = {
  left: 14,
  right: 15,
  up: 0,
  down: 13,
  mobility: 2,
  primary: 1,
  secondary: 3,
  interact: 4,
  map: 5,
  pause: 9,
};
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
    effects: 0.8,
    ambience: 0.5,
    music: 0.45,
    sound: true,
    alarm: true,
    haptics: true,
    shake: false,
    assists: true,
    uiScale: 1,
    renderScale: 2,
    coachStep: 0,
    coachSkipped: false,
    gamepad: { ...DEFAULT_GAMEPAD },
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
      "sound",
      "alarm",
      "haptics",
      "shake",
      "assists",
      "coachSkipped",
    ] as const)
      if (typeof raw[k] === "boolean") defaults[k] = raw[k];
    for (const k of ["effects", "ambience", "music"] as const)
      if (typeof raw[k] === "number" && Number.isFinite(raw[k]))
        defaults[k] = Math.max(0, Math.min(1, raw[k]));
    if ([1, 1.15, 1.3].includes(raw.uiScale)) defaults.uiScale = raw.uiScale;
    if ([1, 1.5, 2].includes(raw.renderScale))
      defaults.renderScale = raw.renderScale;
    if (
      Number.isInteger(raw.coachStep) &&
      raw.coachStep >= 0 &&
      raw.coachStep <= 12
    )
      defaults.coachStep = raw.coachStep;
    if (raw.gamepad && typeof raw.gamepad === "object")
      for (const action of Object.keys(DEFAULT_GAMEPAD) as PilotAction[]) {
        const value = raw.gamepad[action];
        if (Number.isInteger(value) && value >= 0 && value <= 16)
          defaults.gamepad[action] = value;
      }
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
  private suppressedGamepadButtons = new Set<number>();
  private gamepadAxesSuppressed = false;
  private lastCommandAt = -Infinity;
  private remapping?: PilotAction;
  private remappingSlot = 0;
  private gamepadRemapping?: PilotAction;
  onRemapped?: (message: string) => void;
  constructor(
    public preferences: PilotPreferences,
    private callbacks: {
      blocked: () => boolean;
      interact: () => void;
      map: () => void;
      pause: () => void;
      unlockAudio: () => void;
      menu?: (action: MenuAction) => void;
      releaseKeyboard?: () => void;
    },
  ) {
    window.addEventListener("keydown", (event) => {
      // Browser shortcuts and IME composition never become pilot commands,
      // including while the user is choosing a replacement key binding.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        this.clearKeyboard();
        this.callbacks.releaseKeyboard?.();
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (this.gamepadRemapping && key === "Escape") {
        event.preventDefault();
        this.gamepadRemapping = undefined;
        this.onRemapped?.("Controller remapping cancelled.");
        return;
      }
      // A held Interact/Enter must not activate the newly focused Undock
      // button. Space/Enter repeats on focused menu controls are inert too.
      if (
        event.repeat &&
        (key === "Enter" || key === " ") &&
        event.target instanceof Element &&
        event.target.closest("button, a, summary")
      ) {
        event.preventDefault();
        return;
      }
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
        const keys = [...this.preferences.keys[action]];
        keys[this.remappingSlot] = key;
        this.preferences.keys[action] = [...new Set(keys.filter(Boolean))];
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
          this.command(() => this.callbacks.pause());
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
        if (!event.repeat) this.command(() => this.callbacks[action]());
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
    let gameplayFocused = gameplayTarget(document.activeElement);
    document.addEventListener("focusin", (event) => {
      const focused = gameplayTarget(event.target);
      if (!focused) {
        this.clearKeyboard();
        if (gameplayFocused) this.callbacks.releaseKeyboard?.();
      }
      gameplayFocused = focused;
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
  private command(action: () => void) {
    const now = performance.now();
    if (now - this.lastCommandAt < 300) return;
    this.lastCommandAt = now;
    action();
  }
  private clearKeyboard() {
    for (const source of this.held.keys())
      if (source.startsWith("key:")) this.held.delete(source);
    for (const [action, source] of this.latched)
      if (source.startsWith("key:")) this.latched.delete(action);
  }
  remap(action: PilotAction, slot = 0) {
    this.clear();
    this.remapping = action;
    this.remappingSlot = Math.max(0, Math.min(1, slot));
    this.onRemapped?.(
      "Press a new key for " + ACTION_LABELS[action] + ". Escape cancels.",
    );
  }
  remapGamepad(action: PilotAction) {
    this.clear();
    this.gamepadRemapping = action;
    this.onRemapped?.(
      "Press a controller button for " + ACTION_LABELS[action] + ".",
    );
  }
  resetBindings() {
    this.clear();
    this.preferences.keys = structuredClone(DEFAULT_KEYS);
    this.preferences.gamepad = { ...DEFAULT_GAMEPAD };
    savePilotPreferences(this.preferences);
    this.onRemapped?.("Default controls restored.");
  }
  clear() {
    this.held.clear();
    this.latched.clear();
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected);
    if (pad) {
      pad.buttons.forEach((button, index) => {
        if (button.pressed) this.suppressedGamepadButtons.add(index);
      });
      this.gamepadAxesSuppressed ||= pad.axes.some(
        (value) => Math.abs(value) > 0.25,
      );
    }
    document
      .querySelectorAll("[data-dir]")
      .forEach((button) => button.classList.remove("held"));
  }
  /** Menu commands keep polling while the simulation itself is paused. */
  pollCommands() {
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected);
    if (!pad) {
      this.gamepadButtons.clear();
      this.suppressedGamepadButtons.clear();
      this.gamepadAxesSuppressed = false;
      return;
    }
    for (const index of this.suppressedGamepadButtons)
      if (!pad.buttons[index]?.pressed)
        this.suppressedGamepadButtons.delete(index);
    if (pad.axes.every((value) => Math.abs(value) <= 0.25))
      this.gamepadAxesSuppressed = false;
    const pressed = new Set(
      pad.buttons.flatMap((button, index) => (button.pressed ? [index] : [])),
    );
    const fresh = (index: number) =>
      pressed.has(index) &&
      !this.gamepadButtons.has(index) &&
      !this.suppressedGamepadButtons.has(index);
    if (this.gamepadRemapping) {
      const selected = [...pressed].find(fresh);
      if (selected !== undefined) {
        const other = (
          Object.keys(this.preferences.gamepad) as PilotAction[]
        ).find(
          (action) =>
            action !== this.gamepadRemapping &&
            this.preferences.gamepad[action] === selected,
        );
        if (other) {
          this.onRemapped?.(
            "That button is assigned to " +
              ACTION_LABELS[other] +
              ". Choose another button.",
          );
          this.gamepadButtons = pressed;
          return;
        }
        this.preferences.gamepad[this.gamepadRemapping] = selected;
        this.gamepadRemapping = undefined;
        savePilotPreferences(this.preferences);
        this.onRemapped?.("Controller binding updated.");
      }
      this.gamepadButtons = pressed;
      return;
    }
    // Record every button before callbacks can change the interface. Holding
    // thrust while docking cannot confirm a transaction on the next frame.
    const menu = this.callbacks.blocked() && this.callbacks.menu;
    const action = fresh(this.preferences.gamepad.pause)
      ? () => this.callbacks.pause()
      : menu && fresh(12)
        ? () => menu("previous")
        : menu && fresh(13)
          ? () => menu("next")
          : menu && fresh(14)
            ? () => menu("left")
            : menu && fresh(15)
              ? () => menu("right")
              : menu && fresh(0)
                ? () => menu("activate")
                : menu && fresh(1)
                  ? () => menu("back")
                  : !this.callbacks.blocked() &&
                      fresh(this.preferences.gamepad.interact)
                    ? () => this.callbacks.interact()
                    : !this.callbacks.blocked() &&
                        fresh(this.preferences.gamepad.map)
                      ? () => this.callbacks.map()
                      : undefined;
    this.gamepadButtons = pressed;
    if (action) this.command(action);
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
        controls[
          action as Exclude<keyof CampaignControls, "throttleX" | "throttleY">
        ] = true;
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected);
    if (pad) {
      const button = (index: number) =>
        Boolean(pad.buttons[index]?.pressed) &&
        !this.suppressedGamepadButtons.has(index);
      const axis = (index: number) =>
        this.gamepadAxesSuppressed ? 0 : (pad.axes[index] ?? 0);
      const binding = this.preferences.gamepad;
      const digitalX = Boolean(
        controls.left ||
        controls.right ||
        button(binding.left) ||
        button(binding.right),
      );
      const digitalY = Boolean(controls.up || button(12) || button(binding.up));
      controls.left ||= axis(0) < -0.25 || button(binding.left);
      controls.right ||= axis(0) > 0.25 || button(binding.right);
      controls.up ||= axis(1) < -0.25 || button(12) || button(binding.up);
      controls.down ||= axis(1) > 0.25 || button(binding.down);
      controls.mobility ||= button(binding.mobility);
      controls.primary ||= button(binding.primary);
      controls.secondary ||= button(binding.secondary);
      const throttle = (value: number) =>
        Math.max(
          0.35,
          Math.min(1, 0.35 + ((Math.abs(value) - 0.25) / 0.75) * 0.65),
        );
      if (controls.left || controls.right)
        controls.throttleX = digitalX ? 1 : throttle(axis(0));
      if (controls.up) controls.throttleY = digitalY ? 1 : throttle(axis(1));
    }
    return controls;
  }
}

/** Keep an active keyboard/controller axis authoritative over pointer gestures. */
export function mergePilotControls(
  digital: CampaignControls,
  pointer: CampaignControls,
): CampaignControls {
  const horizontal = digital.left || digital.right ? digital : pointer;
  const vertical = digital.up || digital.down ? digital : pointer;
  return {
    ...digital,
    left: Boolean(horizontal.left),
    right: Boolean(horizontal.right),
    up: Boolean(vertical.up),
    down: Boolean(vertical.down),
    mobility: Boolean(digital.mobility || pointer.mobility),
    primary: Boolean(digital.primary || pointer.primary),
    secondary: Boolean(digital.secondary || pointer.secondary),
    ...(horizontal.left || horizontal.right
      ? { throttleX: horizontal.throttleX ?? 1 }
      : {}),
    ...(vertical.up ? { throttleY: vertical.throttleY ?? 1 } : {}),
  };
}
