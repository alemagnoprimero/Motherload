import type Phaser from "phaser";

// Phaser's constants, kept as numbers so the unit tests can import the light
// modules without loading Phaser: Phaser.WEBGL, BlendModes.NORMAL and ADD.
const WEBGL = 2,
  NORMAL = 0,
  ADD = 1;

/**
 * A texture of light that adds to the frame, and the blend mode to draw it
 * with (T2's draw budget, audit §7).
 *
 * Phaser's ADD blend (ONE, DST_ALPHA) is a blend-mode change, which ends the
 * sprite batch before the light and again after it: two extra draw calls for
 * one sprite. On WebGL the texture therefore keeps the light in RGB with
 * alpha 0 and is uploaded as it is (not premultiplied), and the sprite uses
 * the NORMAL blend (ONE, ONE_MINUS_SRC_ALPHA): source + destination × (1 − 0),
 * the same sum ADD gives over an opaque frame, inside the batch. The field
 * renderer's quad costs one draw (field-renderer.ts); this gives it back.
 *
 * The Canvas renderer has no draw calls to save and composites with
 * "lighter", which needs opaque texels: there the texture is a canvas and
 * the blend is ADD, as before.
 *
 * `pixels` are opaque RGBA bytes whose RGB is the light to add.
 */
export function createAdditiveTexture(
  scene: Phaser.Scene,
  key: string,
  pixels: Uint8ClampedArray,
  size: number,
): Phaser.BlendModes {
  const webgl = scene.game.renderer.type === WEBGL;
  if (!scene.textures.exists(key)) {
    if (webgl) {
      const renderer = scene.game
          .renderer as Phaser.Renderer.WebGL.WebGLRenderer,
        gl = renderer.gl,
        bytes = new Uint8Array(pixels);
      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 0;
      // The wrapper keeps `bytes` and uploads them again after a context loss.
      const texture = renderer.createTexture2D(
        0,
        gl.LINEAR,
        gl.LINEAR,
        gl.CLAMP_TO_EDGE,
        gl.CLAMP_TO_EDGE,
        gl.RGBA,
        bytes as unknown as object,
        size,
        size,
        false,
        true,
        false,
      );
      scene.textures.addGLTexture(key, texture);
    } else {
      const texture = scene.textures.createCanvas(key, size, size)!;
      const data = texture.context.createImageData(size, size);
      data.data.set(pixels);
      texture.context.putImageData(data, 0, 0);
      texture.refresh();
    }
  }
  return webgl ? NORMAL : ADD;
}
