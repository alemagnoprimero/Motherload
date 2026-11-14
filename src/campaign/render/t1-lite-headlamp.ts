import type Phaser from "phaser";
import { createAdditiveTexture } from "./additive-texture";

/*
 * T1-lite: an interim headlamp core (docs/ART_QUALITY_AUDIT.md §5.3, T1).
 *
 * F4 deleted the cream normal-blend lamp. T1's GPU light stack replaces it,
 * but T1 waits on T2, so this is T1's first component on its own: one additive
 * radial sprite at the rig's headlamp lens, drawn above the darkness (the
 * light map, depth 17) and below the rig (depth 18 and up), where T1's light
 * composite will sit in the §5.3 layer stack.
 *
 * - Static: no term varies with time, so there is nothing to put on the scene
 *   clock, and nothing flickers or shimmers.
 * - No occlusion: the sprite lights whatever is around the lens, rock or air.
 * - The light map and its cutout are unchanged (lighting.ts).
 * - Sized so the F3 harness's headlamp probe (0.35 tile along the
 *   prototype's lamp axis, scripts/art_metrics.py) reads L* ≥ 70 with b*
 *   between +15 and +30 in the 60 m shaft and the SITE-4 cavern (§9.2).
 *
 * T1 absorbs this: its ADD light texture takes over the headlamp, and this
 * file and its touch points in scene.ts (each marked T1-lite) are deleted.
 */

/** Phaser texture key of the core. */
export const T1_LITE_HEADLAMP_TEXTURE = "campaign-t1-lite-headlamp";
/**
 * The lens in rig-cabin.svg is at (100.2, 44.5) of the 128-unit frame
 * (HEADLAMP_LENS in assets/campaign/source/w01-rig.mjs, art item A13): 36.2
 * units ahead of the centre and 19.5 above it, as fractions of the frame's
 * size. The rig draws that frame 64/48 tile square around its centre, so this
 * is (0.377, −0.203) tile on a right-facing rig, mirrored when it faces left.
 */
export const T1_LITE_HEADLAMP_LENS = { x: 36.2 / 128, y: -19.5 / 128 } as const;
/**
 * The core's additive light: peak × colour × exp(−(r/σ)²), in sRGB levels
 * added to the frame, faded to 0 at `radius` by (1 − (r/radius)²)². Distances
 * are in tiles. At the harness probe (r ≈ 0.40 from the A13 lens) it adds
 * about (160, 141, 93); by 1 tile it is down to a fourteenth of that, and it
 * ends at 1.8 tiles. The colour is near the board's lamp patch (#e2ca98). A
 * tight core keeps the lift off the cave air that the F4 checks average: T1's
 * cone and pool light the rest.
 */
export const T1_LITE_HEADLAMP_CORE = {
  peak: 260,
  colour: [1, 0.88, 0.58] as const,
  sigma: 0.65,
  radius: 1.8,
} as const;
/** Texels across the texture, which spans 2 × radius tiles. */
const TEXTURE_SIZE = 128;

/** Additive sRGB levels of the core at `r` tiles from the lens. */
export function t1LiteHeadlampAdd(r: number): [number, number, number] {
  const { peak, colour, sigma, radius } = T1_LITE_HEADLAMP_CORE;
  const fade = Math.max(0, 1 - (r / radius) ** 2) ** 2;
  const level = peak * Math.exp(-((r / sigma) ** 2)) * fade;
  return [level * colour[0], level * colour[1], level * colour[2]];
}

/**
 * The light's RGBA bytes: opaque, so the additive amount is the RGB itself
 * on both renderers (additive-texture.ts: Canvas composites them with
 * "lighter"; WebGL adds the same RGB inside the sprite batch), black outside
 * the radius. Red clamps at 255 within about 0.1 tile of the lens, under the
 * cabin.
 */
export function t1LiteHeadlampPixels(size = TEXTURE_SIZE) {
  const { radius } = T1_LITE_HEADLAMP_CORE;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r =
        (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)) *
        radius;
      const add = t1LiteHeadlampAdd(r),
        offset = (y * size + x) * 4;
      pixels[offset] = Math.round(add[0]);
      pixels[offset + 1] = Math.round(add[1]);
      pixels[offset + 2] = Math.round(add[2]);
      pixels[offset + 3] = 255;
    }
  return pixels;
}

/** T1-lite: the additive headlamp core that follows the rig's cabin sprite. */
export class T1LiteHeadlamp {
  private image: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene) {
    // T2: inside the sprite batch on WebGL (additive-texture.ts).
    const blend = createAdditiveTexture(
      scene,
      T1_LITE_HEADLAMP_TEXTURE,
      t1LiteHeadlampPixels(),
      TEXTURE_SIZE,
    );
    this.image = scene.add
      .image(0, 0, T1_LITE_HEADLAMP_TEXTURE)
      .setBlendMode(blend)
      .setDepth(17.5)
      .setVisible(false);
  }
  /**
   * Places the core on the lens of the cabin sprite as drawn this frame (its
   * position, flip, rotation and squash), or hides it when no cabin was
   * drawn. `tile` is the view's tile size in CSS px.
   */
  render(cabin: Phaser.GameObjects.Image | undefined, tile: number) {
    if (!cabin) {
      this.image.setVisible(false);
      return;
    }
    const x =
        (cabin.flipX ? -1 : 1) * T1_LITE_HEADLAMP_LENS.x * cabin.displayWidth,
      y = T1_LITE_HEADLAMP_LENS.y * cabin.displayHeight,
      cos = Math.cos(cabin.rotation),
      sin = Math.sin(cabin.rotation);
    const size = 2 * T1_LITE_HEADLAMP_CORE.radius * tile;
    this.image
      .setPosition(cabin.x + x * cos - y * sin, cabin.y + x * sin + y * cos)
      .setDisplaySize(size, size)
      .setVisible(true);
  }
  destroy() {
    this.image.destroy();
    this.scene.textures.remove(T1_LITE_HEADLAMP_TEXTURE);
  }
}
