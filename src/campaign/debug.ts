import type { BackingBudgetState } from "./view";

/** The light map as last drawn: alpha is darkness, RGB is always (5, 9, 13). */
export interface LightTextureSnapshot {
  /** Phaser texture key. */
  key: string;
  /** Texture size in light pixels: CSS size × scale, rounded up. */
  width: number;
  height: number;
  /** Light pixels per CSS pixel. */
  scale: number;
  /** Blur radius of the per-cell darkness, in light pixels. */
  blur: number;
  /** Light-pixel rows above the world (sky), cropped from the display. */
  cropTop: number;
  visible: boolean;
  /** PNG data URL of the whole texture, alpha kept. */
  dataURL: string;
}

/**
 * Test and harness hooks on `window.__campaignDebug` (audit F3). The scene
 * installs them in create() and removes them on shutdown, so a page that has
 * reported `data-campaign-art` already has them, before Start.
 */
export interface CampaignDebug {
  /** The light map. Async, so a GPU light pass can read back later. */
  lightTexture(): Promise<LightTextureSnapshot>;
  /**
   * Shows or hides every annotation (as `?overlays=0` does); returns the
   * state. Canvas annotations change on the next rendered frame.
   */
  overlays(visible?: boolean): boolean;
  /**
   * The scene clock drives the looping animation: the alarm border, rig
   * frames, glints, bobbing and pulses. `freeze` holds it at `seconds` (by
   * default where it is) until `resume`. Gameplay keeps its own clock, and
   * the one-shot effects (landing squash, hit outline, install and
   * construction pulses) keep running on frame or wall time.
   */
  sceneClock: {
    freeze(seconds?: number): number;
    resume(): number;
    read(): { elapsed: number; frozen: boolean };
  };
  /** The camera fade that follows an import, travel or long jump (180 ms in). */
  fade(): {
    running: boolean;
    complete: boolean;
    direction: "in" | "out";
    progress: number;
  };
  /** F1's backing policy: level, next raise, wait and back-off (the pin, when pinned). */
  backing(): BackingBudgetState;
}

declare global {
  interface Window {
    __campaignDebug?: CampaignDebug;
  }
}
