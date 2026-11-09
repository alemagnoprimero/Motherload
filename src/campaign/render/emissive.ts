import type Phaser from "phaser";
import { RIG_EMISSIVE_DEPTH } from "./rig-layers";
import { ZONE_MANIFESTS, type WorldId } from "./zones";

/*
 * Audit T13b, `-emissive` siblings at runtime (assets/campaign/kit/
 * emissive.mjs authors them; the kit README has the whole convention).
 *
 * A frame `<base>-emissive` is the same size as `<base>` and holds only its
 * lit parts, lit, on transparent; the base draws those parts unlit. The build
 * packs the sibling on its base's page at every density. After the scene
 * draws a base frame it draws the sibling, if the page has one:
 *
 * - from its own pool, with the ADD blend (WebGL ONE, DST_ALPHA over the
 *   opaque frame; Canvas "lighter"), so pooled base sprites, which never
 *   reset their blend mode, are never touched;
 * - with the base's texture page, position, origin, scale, flip, rotation,
 *   alpha and mask, read after the frame's last change (pixel snapping in
 *   image(), then the callers' masks);
 * - above the darkness (the light map, depth 17): scenery and props in one
 *   band at 17.6, just above T1-lite's ADD core (17.5) so both share one ADD
 *   run; every rig layer's sibling (18–23.6) in one band at 23.9, above every
 *   rig layer and below the effects (24), so the rig's lit parts make one ADD
 *   run and add over whatever rig layer lies under them (art item A13,
 *   render/rig-layers.ts);
 * - only when its base was drawn this frame, so a cell the base may not show
 *   shows no light either. Static: nothing here varies with time.
 */

/** Scenery and prop emissives: above the light map (17) and T1-lite (17.5). */
export const SCENERY_EMISSIVE_DEPTH = 17.6;
/** Every rig emissive: above every rig layer, below the effects (24). */
export { RIG_EMISSIVE_DEPTH };
/** A sibling of a base above the rig band sits this far above its base. */
export const EMISSIVE_OFFSET = 0.05;
/** The rig's first layer (thrust); every base below it is scenery. */
const RIG_BAND = 18;

/** The depth of a sibling whose base is drawn at `depth`. */
export function emissiveDepth(depth: number) {
  if (depth < RIG_BAND) return SCENERY_EMISSIVE_DEPTH;
  if (depth < RIG_EMISSIVE_DEPTH) return RIG_EMISSIVE_DEPTH;
  return depth + EMISSIVE_OFFSET;
}

const siblings = (world: WorldId): ReadonlyMap<string, string> =>
  new Map(
    Object.keys(ZONE_MANIFESTS[world].frames)
      .filter((name) => name.endsWith("-emissive"))
      .map((name) => [name.slice(0, -"-emissive".length), name]),
  );
const SIBLINGS: Readonly<Record<WorldId, ReadonlyMap<string, string>>> = {
  W01: siblings("W01"),
  W02: siblings("W02"),
};

/** The `-emissive` sibling of `frame` in `world`'s manifest, if it has one. */
export function emissiveSibling(world: WorldId, frame: string) {
  return SIBLINGS[world].get(frame);
}

/**
 * The screen box of a sprite's drawn (trimmed) quad, as Phaser's WebGL
 * batcher places it (MultiPipeline.batchSprite): the frame's trimmed rect
 * about the display origin, mirrored for flipX, scaled and rotated about the
 * sprite's position. [left, top, right, bottom] in CSS px.
 */
export function spriteBounds(
  sprite: Pick<
    Phaser.GameObjects.Image,
    | "x"
    | "y"
    | "originX"
    | "originY"
    | "scaleX"
    | "scaleY"
    | "rotation"
    | "flipX"
  > & {
    frame: Pick<
      Phaser.Textures.Frame,
      "x" | "y" | "cutWidth" | "cutHeight" | "realWidth" | "realHeight"
    > & { customPivot?: boolean };
  },
): [number, number, number, number] {
  const { frame } = sprite;
  const originX = sprite.originX * frame.realWidth,
    originY = sprite.originY * frame.realHeight;
  let x = frame.x - originX;
  const y = frame.y - originY;
  if (sprite.flipX && !frame.customPivot) x += 2 * originX - frame.realWidth;
  const sx = sprite.scaleX * (sprite.flipX ? -1 : 1),
    sy = sprite.scaleY,
    cos = Math.cos(sprite.rotation),
    sin = Math.sin(sprite.rotation);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [u, v] of [
    [x, y],
    [x + frame.cutWidth, y],
    [x, y + frame.cutHeight],
    [x + frame.cutWidth, y + frame.cutHeight],
  ] as const) {
    const px = sprite.x + u * sx * cos - v * sy * sin,
      py = sprite.y + u * sx * sin + v * sy * cos;
    left = Math.min(left, px);
    top = Math.min(top, py);
    right = Math.max(right, px);
    bottom = Math.max(bottom, py);
  }
  return [left, top, right, bottom];
}

/**
 * The cells a screen box touches, for a view whose cell (column, row) spans
 * [column·tile − cx, (column + 1)·tile − cx) (and likewise rows with cy).
 */
export function cellsUnder(
  [left, top, right, bottom]: readonly [number, number, number, number],
  cx: number,
  cy: number,
  tile: number,
) {
  const cells: [number, number][] = [];
  const firstColumn = Math.floor((left + cx) / tile),
    lastColumn = Math.ceil((right + cx) / tile) - 1,
    firstRow = Math.floor((top + cy) / tile),
    lastRow = Math.ceil((bottom + cy) / tile) - 1;
  for (let row = firstRow; row <= Math.max(firstRow, lastRow); row++)
    for (
      let column = firstColumn;
      column <= Math.max(firstColumn, lastColumn);
      column++
    )
      cells.push([column, row]);
  return cells;
}

interface Queued {
  base: Phaser.GameObjects.Image;
  frame: string;
  depth: number;
}

/**
 * The ADD pass: queue() after a base frame is drawn, draw() once the frame's
 * last sprite is, begin() when the next frame starts.
 */
export class EmissivePass {
  /** The ADD sprites. Never shared with the scene's base pool. */
  readonly pool: Phaser.GameObjects.Image[] = [];
  /** The base each pooled sprite copied this frame. */
  readonly bases: (Phaser.GameObjects.Image | undefined)[] = [];
  private queued: Queued[] = [];
  private used = 0;
  /**
   * `create` makes one pooled sprite (the scene adds an Image). `enabled`
   * false (`?debug=no-emissive`) draws the bases alone, for comparisons.
   */
  constructor(
    private create: () => Phaser.GameObjects.Image,
    readonly enabled = true,
  ) {}
  /** A new frame: last frame's siblings are hidden until drawn again. */
  begin() {
    for (const sprite of this.pool) sprite.setVisible(false);
    this.bases.fill(undefined);
    this.queued.length = 0;
    this.used = 0;
  }
  /**
   * After `base` has drawn `frame` of `world`'s atlas: queues the frame's
   * sibling when its page holds one. Returns the sibling's name, or
   * undefined.
   */
  queue(
    base: Phaser.GameObjects.Image,
    world: WorldId,
    frame: string,
    depth: number,
  ) {
    if (!this.enabled) return undefined;
    const sibling = emissiveSibling(world, frame);
    if (!sibling || !base.texture.has(sibling)) return undefined;
    this.queued.push({ base, frame: sibling, depth });
    return sibling;
  }
  /**
   * Draws the queued siblings from their bases' final state. A masked base
   * passes its mask on, unless `maskNeeded` says the sibling's drawn box lies
   * where the mask passes everything anyway (then the sibling joins the ADD
   * run without a stencil pass). Returns how many were drawn.
   */
  draw(maskNeeded?: (sprite: Phaser.GameObjects.Image) => boolean) {
    for (const { base, frame, depth } of this.queued) {
      if (!base.visible) continue;
      const index = this.used++;
      let sprite = this.pool[index];
      if (!sprite) {
        sprite = this.create();
        this.pool.push(sprite);
      }
      this.bases[index] = base;
      sprite
        .setTexture(base.texture.key, frame)
        // After setTexture: a frame with its own pivot resets the origin.
        .setOrigin(base.originX, base.originY)
        // The build keeps the sibling's source size equal to its base's, so
        // the same scale gives the same display size and registration.
        .setScale(base.scaleX, base.scaleY)
        .setPosition(base.x, base.y)
        .setRotation(base.rotation)
        .setFlipX(base.flipX)
        .setAlpha(base.alpha)
        .setDepth(emissiveDepth(depth))
        .setBlendMode("ADD")
        .setVisible(true);
      const mask = base.mask;
      if (mask && (!maskNeeded || maskNeeded(sprite))) sprite.setMask(mask);
      else sprite.clearMask();
    }
    return this.used;
  }
  /** How many siblings were drawn this frame. */
  get count() {
    return this.used;
  }
  /** The siblings drawn this frame, with the base each copied. */
  drawn() {
    return this.pool.slice(0, this.used).map((sprite, index) => ({
      sprite,
      base: this.bases[index]!,
    }));
  }
}
