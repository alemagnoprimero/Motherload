import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CampaignInput,
  mergePilotControls,
  loadPilotPreferences,
  type PilotPreferences,
} from "../src/campaign/input";

class TestElement {
  constructor(
    public tagName: string,
    public id = "",
    private parent?: TestElement,
    private editable = false,
  ) {}

  closest(selector: string): TestElement | null {
    const matches =
      selector === "#campaign-game"
        ? this.id === "campaign-game"
        : selector === "button, a, summary"
          ? ["BUTTON", "A", "SUMMARY"].includes(this.tagName)
          : ["INPUT", "SELECT", "TEXTAREA"].includes(this.tagName) ||
            this.editable;
    return matches ? this : this.parent?.closest(selector) || null;
  }
}

class DirectionButton extends TestElement {
  dataset = { dir: "left" };
  private classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  onpointerdown?: (event: PointerEvent) => void;
  onpointerup?: (event: PointerEvent) => void;
  onpointercancel?: (event: PointerEvent) => void;
  onlostpointercapture?: (event: PointerEvent) => void;
  setPointerCapture() {}
}

function inputHarness(overrides: Partial<PilotPreferences> = {}) {
  const windowEvents = new Map<string, ((event: unknown) => void)[]>();
  const documentEvents = new Map<string, ((event: unknown) => void)[]>();
  const body = new TestElement("BODY");
  const game = new TestElement("DIV", "campaign-game", body);
  const canvas = new TestElement("CANVAS", "", game);
  const toolbar = new TestElement("BUTTON", "campaign-menu-toggle", body);
  const field = new TestElement("INPUT", "", body);
  const editable = new TestElement("DIV", "", game, true);
  const direction = new DirectionButton("BUTTON", "", body);
  const document = {
    body,
    documentElement: new TestElement("HTML"),
    activeElement: body,
    querySelectorAll: () => [direction],
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      documentEvents.set(name, [...(documentEvents.get(name) || []), handler]);
    },
  };
  let pads: Gamepad[] = [];
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("window", {
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      windowEvents.set(name, [...(windowEvents.get(name) || []), handler]);
    },
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { getGamepads: () => pads });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const preferences = { ...loadPilotPreferences(), ...overrides };
  let blocked = false;
  const callbacks = {
    blocked: () => blocked,
    interact: vi.fn(),
    map: vi.fn(),
    pause: vi.fn(),
    unlockAudio: vi.fn(),
    menu: vi.fn(),
    releaseKeyboard: vi.fn(),
  };
  const input = new CampaignInput(preferences, callbacks);
  const key = (
    name: string,
    modifiers: Partial<KeyboardEvent> = {},
    kind = "keydown",
  ) => {
    const event = {
      key: name,
      target: document.activeElement,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      repeat: false,
      preventDefault: vi.fn(),
      ...modifiers,
    };
    for (const handler of windowEvents.get(kind) || []) handler(event);
    return event;
  };
  const focus = (element: TestElement) => {
    document.activeElement = element;
    for (const handler of documentEvents.get("focusin") || [])
      handler({ target: element });
  };
  const pointer = {
    button: 0,
    pointerId: 4,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent;
  return {
    input,
    preferences,
    callbacks,
    key,
    focus,
    body,
    game,
    canvas,
    toolbar,
    field,
    editable,
    direction,
    pointer,
    block: () => (blocked = true),
    unblock: () => (blocked = false),
    pad: (pressed: number[], axes = [0, 0]) => {
      pads = [
        {
          connected: true,
          axes,
          buttons: Array.from({ length: 16 }, (_, index) => ({
            pressed: pressed.includes(index),
          })),
        } as unknown as Gamepad,
      ];
    },
  };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("campaign keyboard ownership", () => {
  it("does not let held Enter activate the newly focused dock control", () => {
    const h = inputHarness();
    h.callbacks.interact.mockImplementation(() => {
      h.block();
      h.focus(h.toolbar);
    });
    h.key("Enter");
    expect(h.callbacks.interact).toHaveBeenCalledOnce();
    expect(
      h.key("Enter", { repeat: true }).preventDefault,
    ).toHaveBeenCalledOnce();
    expect(h.key(" ", { repeat: true }).preventDefault).toHaveBeenCalledOnce();
    expect(h.callbacks.interact).toHaveBeenCalledOnce();
    // A fresh intentional press remains a native focused-button action.
    h.key("Enter", {}, "keyup");
    expect(h.key("Enter").preventDefault).not.toHaveBeenCalled();
  });
  it("leaves browser shortcuts and composition alone instead of piloting or pausing", () => {
    const h = inputHarness();
    for (const [key, modifiers] of [
      ["s", { ctrlKey: true }],
      ["p", { ctrlKey: true }],
      ["ArrowDown", { metaKey: true }],
      ["e", { altKey: true }],
      ["Tab", { altKey: true }],
      ["s", { isComposing: true }],
    ] as const) {
      expect(h.key(key, modifiers).preventDefault).not.toHaveBeenCalled();
      expect(h.input.getControls()).toEqual({});
    }
    expect(h.callbacks.pause).not.toHaveBeenCalled();
    expect(h.callbacks.interact).not.toHaveBeenCalled();
    expect(h.callbacks.map).not.toHaveBeenCalled();
  });

  it("accepts normal gameplay keys and releases them even after focus or modifiers change", () => {
    const h = inputHarness();
    h.focus(h.canvas);
    expect(h.key("s").preventDefault).toHaveBeenCalledOnce();
    expect(h.input.getControls()).toEqual({ down: true });
    h.key("s", { ctrlKey: true }, "keyup");
    expect(h.input.getControls()).toEqual({});
    h.focus(h.game);
    h.key("w");
    expect(h.input.getControls()).toEqual({ up: true });
    h.key("p");
    expect(h.callbacks.pause).toHaveBeenCalledOnce();
  });

  it("does not capture movement, interaction or pause letters from toolbar and editable focus", () => {
    const h = inputHarness();
    for (const target of [h.toolbar, h.field, h.editable]) {
      h.focus(target);
      for (const key of ["s", "p", "e", "Tab", " "])
        expect(h.key(key).preventDefault).not.toHaveBeenCalled();
      expect(h.input.getControls()).toEqual({});
    }
    expect(h.callbacks.pause).not.toHaveBeenCalled();
    expect(h.callbacks.interact).not.toHaveBeenCalled();
    expect(h.callbacks.map).not.toHaveBeenCalled();
    h.block();
    expect(h.key("Escape").preventDefault).toHaveBeenCalledOnce();
    expect(h.callbacks.pause).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "clears keyboard input on toolbar focus without clearing a touch control (drill toggle %s)",
    (drillToggle) => {
      const h = inputHarness({ drillToggle });
      h.key("s");
      expect(h.input.getControls().down).toBe(true);
      h.direction.onpointerdown!(h.pointer);
      h.focus(h.toolbar);
      expect(h.input.getControls()).toEqual({ left: true });
      expect(h.callbacks.releaseKeyboard).toHaveBeenCalledOnce();
      h.focus(h.field);
      expect(h.callbacks.releaseKeyboard).toHaveBeenCalledOnce();
      h.focus(h.game);
      expect(h.input.getControls()).toEqual({ left: true });
      h.direction.onpointerup!(h.pointer);
      expect(h.input.getControls()).toEqual({});
    },
  );

  it("preserves a touch-origin toggle when focus changes and clears it on explicit reset", () => {
    const h = inputHarness({ drillToggle: true });
    h.direction.dataset.dir = "down";
    h.direction.onpointerdown!(h.pointer);
    h.direction.onpointerup!(h.pointer);
    h.focus(h.toolbar);
    expect(h.input.getControls()).toEqual({ down: true });
    h.input.clear();
    expect(h.input.getControls()).toEqual({});
  });

  it("does not bind browser modifier combinations while intentionally remapping", () => {
    const h = inputHarness();
    h.focus(h.toolbar);
    h.input.remap("down");
    expect(h.key("s", { ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(h.preferences.keys.down).toEqual(["ArrowDown", "s"]);
    h.focus(h.field);
    expect(h.key("x").preventDefault).not.toHaveBeenCalled();
    h.focus(h.toolbar);
    expect(h.key("x").preventDefault).toHaveBeenCalledOnce();
    expect(h.preferences.keys.down).toEqual(["x", "s"]);
    expect(h.input.getControls()).toEqual({});
  });
});

describe("campaign controller menus", () => {
  it("preserves the primary key when replacing a secondary binding and can reset both", () => {
    const h = inputHarness();
    h.input.remap("down", 1);
    h.key("x");
    expect(h.preferences.keys.down).toEqual(["ArrowDown", "x"]);
    h.input.resetBindings();
    expect(h.preferences.keys.down).toEqual(["ArrowDown", "s"]);
  });
  it("remaps unused controller buttons, rejects duplicates, and keeps keyboard axis authority", () => {
    const h = inputHarness();
    h.input.remapGamepad("mobility");
    h.pad([0]);
    h.input.pollCommands();
    expect(h.preferences.gamepad.mobility).toBe(2);
    h.pad([]);
    h.input.pollCommands();
    // T8: L2 (6) is Scan's by default, so take a free button.
    h.pad([7]);
    h.input.pollCommands();
    expect(h.preferences.gamepad.mobility).toBe(7);
    h.pad([], [0.5, 0]);
    expect(h.input.getControls().throttleX).toBeCloseTo(
      0.35 + (0.25 / 0.75) * 0.65,
    );
    h.key("d");
    expect(h.input.getControls().throttleX).toBe(1);
    expect(
      mergePilotControls({ right: true }, { left: true, throttleX: 0.35 }),
    ).toMatchObject({ right: true, left: false, throttleX: 1 });
    expect(mergePilotControls({}, { up: true, throttleY: 0.35 })).toMatchObject(
      { up: true, throttleY: 0.35 },
    );
  });
  it("consumes a held controller button when another input opens a menu before polling", () => {
    const h = inputHarness();
    h.pad([0]);
    h.input.clear();
    h.block();
    h.input.pollCommands();
    expect(h.callbacks.menu).not.toHaveBeenCalled();
    h.pad([]);
    h.input.pollCommands();
    h.pad([0]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenCalledOnce();
    expect(h.callbacks.menu).toHaveBeenCalledWith("activate");
  });
  it("routes D-pad, A and B to menus once per press with a 300 ms command guard", () => {
    const h = inputHarness();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    h.block();
    h.pad([13]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenLastCalledWith("next");
    now = 1000;
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenCalledOnce();
    h.pad([]);
    h.input.pollCommands();
    h.pad([12]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenLastCalledWith("previous");
    now = 1100;
    h.pad([]);
    h.input.pollCommands();
    h.pad([0]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenCalledTimes(2);
    now = 1500;
    h.pad([]);
    h.input.pollCommands();
    h.pad([0]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenLastCalledWith("activate");
    now = 1900;
    h.pad([]);
    h.input.pollCommands();
    h.pad([1]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenLastCalledWith("back");
    expect(h.input.getControls()).toEqual({});
    expect(h.callbacks.interact).not.toHaveBeenCalled();
  });

  it("does not turn held thrust into a menu click or held menu controls into flight", () => {
    const h = inputHarness();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    h.pad([0, 4]);
    h.callbacks.interact.mockImplementation(() => {
      h.block();
      h.input.clear();
    });
    h.input.pollCommands();
    expect(h.callbacks.interact).toHaveBeenCalledOnce();
    now = 500;
    h.input.pollCommands();
    expect(h.callbacks.menu).not.toHaveBeenCalled();
    h.pad([]);
    h.input.pollCommands();
    h.pad([13], [0, 1]);
    h.input.pollCommands();
    expect(h.callbacks.menu).toHaveBeenLastCalledWith("next");
    h.input.clear();
    h.unblock();
    expect(h.input.getControls().down).toBe(false);
    h.pad([]);
    h.input.pollCommands();
    h.pad([13]);
    h.input.pollCommands();
    expect(h.input.getControls().down).toBe(true);
  });
});

describe("T8: Scan shows the labels on demand", () => {
  it("is held by Shift or F, is never a campaign control, and stops while play is blocked", () => {
    const h = inputHarness();
    h.focus(h.game);
    expect(h.input.scanActive()).toBe(false);
    expect(h.key("Shift").preventDefault).toHaveBeenCalledOnce();
    expect(h.input.scanActive()).toBe(true);
    expect(h.input.getControls()).toEqual({});
    h.key("Shift", {}, "keyup");
    expect(h.input.scanActive()).toBe(false);
    h.key("f");
    h.key("s");
    expect(h.input.scanActive()).toBe(true);
    expect(h.input.getControls()).toEqual({ down: true });
    h.block();
    expect(h.input.scanActive()).toBe(false);
    h.unblock();
    h.key("f", {}, "keyup");
    expect(h.input.scanActive()).toBe(false);
    // Shift with a letter still steers: the letter keeps its own action.
    h.key("Shift");
    h.key("A", { shiftKey: true } as Partial<KeyboardEvent>);
    expect(h.input.getControls()).toEqual({ down: true, left: true });
    expect(h.input.scanActive()).toBe(true);
  });

  it("latches with the toggle preference, from a key, the tray button or L2", () => {
    const h = inputHarness({ scanToggle: true });
    h.focus(h.game);
    h.key("f");
    h.key("f", {}, "keyup");
    expect(h.input.scanActive()).toBe(true);
    h.key("f");
    expect(h.input.scanActive()).toBe(false);
    h.direction.dataset.dir = "scan";
    h.direction.onpointerdown!(h.pointer);
    h.direction.onpointerup!(h.pointer);
    expect(h.input.scanActive()).toBe(true);
    h.direction.onpointerdown!(h.pointer);
    h.direction.onpointerup!(h.pointer);
    expect(h.input.scanActive()).toBe(false);
    h.pad([6]);
    h.input.pollCommands();
    expect(h.input.scanActive()).toBe(true);
    h.input.pollCommands();
    expect(h.input.scanActive()).toBe(true);
    h.pad([]);
    h.input.pollCommands();
    h.pad([6]);
    h.input.pollCommands();
    expect(h.input.scanActive()).toBe(false);
  });

  it("is held by L2 or the tray button without the toggle", () => {
    const h = inputHarness();
    h.pad([6]);
    expect(h.input.scanActive()).toBe(true);
    // A connected pad reports every axis as false; none may be true.
    expect(Object.values(h.input.getControls()).some(Boolean)).toBe(false);
    h.pad([]);
    expect(h.input.scanActive()).toBe(false);
    h.direction.dataset.dir = "scan";
    h.direction.onpointerdown!(h.pointer);
    expect(h.input.scanActive()).toBe(true);
    expect(Object.values(h.input.getControls()).some(Boolean)).toBe(false);
    h.direction.onpointerup!(h.pointer);
    expect(h.input.scanActive()).toBe(false);
  });

  it("leaves keys and buttons a saved layout already uses to their actions", () => {
    const stored = {
      keys: { interact: ["f"], map: ["Shift"] },
      gamepad: { map: 6 },
    };
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(stored),
      setItem: vi.fn(),
    });
    const preferences = loadPilotPreferences();
    expect(preferences.keys.interact).toEqual(["f"]);
    expect(preferences.keys.scan).toEqual([]);
    expect(preferences.gamepad.map).toBe(6);
    expect(preferences.gamepad.scan).toBe(7);
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ keys: { down: ["x"] } }),
      setItem: vi.fn(),
    });
    expect(loadPilotPreferences().keys.scan).toEqual(["Shift", "f"]);
    expect(loadPilotPreferences().gamepad.scan).toBe(6);
  });
});
