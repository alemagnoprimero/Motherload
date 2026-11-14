import type Phaser from "phaser";
import { createAdditiveTexture } from "./additive-texture";

/*
 * T1-lite: an interim soft ground light on the surface (docs/ART_QUALITY_AUDIT.md
 * §5.3, T1; director's note from the A4 review).
 *
 * The light map (lighting.ts, depth 17) darkens cells by whether the rig can
 * see them, so on the surface every visible cell gets the same full light and
 * the lit ground under the rig is a flat row with square edges. This is one
 * additive radial sprite on the ground line at the rig, drawn above the
 * darkness and below the rig (depth 17.4), that falls off smoothly to zero
 * over `GROUND_LIGHT.radius` tiles along the ground and `depth` tiles into it, so a gradient runs across the cell edges.
 *
 * - Position only: it depends on the rig's screen position, the ground line and
 *   the rig's depth, never on world tiles, known or hidden. It lights rock the
 *   player cannot see exactly as much as rock they can, and by a few levels.
 * - Static: nothing varies with time, so nothing goes on the scene clock, the
 *   frozen test clock changes nothing, and reduced motion is unaffected.
 * - Surface only: clipped to the ground (rows ≥ 0, never the sky), and faded
 *   out as the rig goes below ground, so underground frames are unchanged.
 * - The light map, its cutout and every asset are unchanged.
 *
 * T1 absorbs this: its light composite takes over the surface, and this file
 * and its touch points in scene.ts (each marked T1-lite) are deleted.
 */

/** Phaser texture key of the light. */
export const T1_LITE_GROUND_LIGHT_TEXTURE = "campaign-t1-lite-ground-light";
/**
 * The light's additive amount: peak × colour × (1 − (r/radius)²)², in sRGB
 * levels added to the frame; r in tiles from the rig on the ground line. The
 * fall-off is smooth (zero value and slope at `radius`), so it has no rim.
 */
export const GROUND_LIGHT = {
  peak: 30,
  colour: [1, 0.86, 0.6] as const,
  radius: 3,
  /** Depth below the ground line at which it ends: the lit ground is 2 rows. */
  depth: 2.2,
} as const;
/** Rig depth (tiles below the surface) where the light starts and ends fading. */
export const GROUND_LIGHT_FADE = { from: 0.25, to: 1.5 } as const;
/** Texels across the texture, which spans 2 × radius tiles. */
const TEXTURE_SIZE = 128;

/** Additive sRGB levels at `r` tiles from the rig, before the depth fade. */
export function groundLightAdd(r: number): [number, number, number] {
  const { peak, colour, radius } = GROUND_LIGHT;
  const level = peak * Math.max(0, 1 - (r / radius) ** 2) ** 2;
  return [level * colour[0], level * colour[1], level * colour[2]];
}

/** 1 with the rig at or above the surface, 0 below `GROUND_LIGHT_FADE.to`. */
export function groundLightStrength(rigY: number): number {
  const { from, to } = GROUND_LIGHT_FADE;
  const t = Math.min(1, Math.max(0, (to - rigY) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * The light's RGBA bytes: opaque, so the additive amount is the RGB itself
 * on both renderers (as for the headlamp core; additive-texture.ts). Levels
 * are 8-bit, so the dither is left to the sprite's bilinear filtering.
 */
export function groundLightPixels(size = TEXTURE_SIZE) {
  const { radius } = GROUND_LIGHT;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r =
        (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)) *
        radius;
      const add = groundLightAdd(r),
        offset = (y * size + x) * 4;
      pixels[offset] = Math.round(add[0]);
      pixels[offset + 1] = Math.round(add[1]);
      pixels[offset + 2] = Math.round(add[2]);
      pixels[offset + 3] = 255;
    }
  return pixels;
}

/** T1-lite: the additive ground light under the rig on the surface. */
export class T1LiteGroundLight {
  private image: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene) {
    // T2: inside the sprite batch on WebGL (additive-texture.ts).
    const blend = createAdditiveTexture(
      scene,
      T1_LITE_GROUND_LIGHT_TEXTURE,
      groundLightPixels(),
      TEXTURE_SIZE,
    );
    this.image = scene.add
      .image(0, 0, T1_LITE_GROUND_LIGHT_TEXTURE)
      .setBlendMode(blend)
      .setDepth(17.4)
      .setCrop(0, TEXTURE_SIZE / 2, TEXTURE_SIZE, TEXTURE_SIZE / 2)
      .setVisible(false);
  }
  /**
   * `px` is the rig's screen x, `surfaceY` the ground line's screen y (world
   * y 0), `rigY` the rig's world y in tiles and `tile` the tile size in CSS px.
   * Only the half below the ground line is drawn.
   */
  render(px: number, surfaceY: number, rigY: number, tile: number) {
    const strength = groundLightStrength(rigY);
    if (strength <= 0) {
      this.image.setVisible(false);
      return;
    }
    this.image
      .setPosition(px, surfaceY)
      .setDisplaySize(
        2 * GROUND_LIGHT.radius * tile,
        2 * GROUND_LIGHT.depth * tile,
      )
      .setAlpha(strength)
      .setVisible(true);
  }
  destroy() {
    this.image.destroy();
    this.scene.textures.remove(T1_LITE_GROUND_LIGHT_TEXTURE);
  }
}
