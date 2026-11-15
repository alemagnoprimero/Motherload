import type Phaser from "phaser";
import type { CampaignWorld } from "../types";
import type { CampaignView } from "../view";
import { createKnownCaveView } from "./cave-known";
import {
  BackWallReveals,
  planBackWalls,
  BACK_WALL_SOURCE,
  type BackWallFragment,
  type CaveClock,
} from "./cave-back-walls";
import { trimmedSourceCrop } from "./cave-crop";
import {
  DressingTransitions,
  planDressing,
  type DressingOptions,
  type FadedDressing,
} from "./dressing";
import dressingCatalog from "../../../assets/campaign/generated/w01-dressing.json";

export interface CaveLayerOptions {
  scrambleUnknown?: number | null;
  backWalls?: boolean;
  dressing?: boolean;
}
export interface CaveLayerSnapshot {
  enabled: { backWalls: boolean; dressing: boolean };
  input: { scrambleUnknown: number | null; unknownCells: number };
  backWalls: BackWallFragment[];
  dressing: FadedDressing[];
  dressingStats: {
    limit: number;
    exposedCeilings: number;
    decoratedCeilings: number;
  };
}

type CaveImage = (
  frame: string,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  alpha: number,
  flip?: boolean,
) => Phaser.GameObjects.Image | undefined;
type CaveGeometry = Pick<
  CampaignView,
  "tile" | "scrollX" | "scrollY" | "width" | "height" | "dpr"
>;

/** Known-only cave layers share the scene's normal sprite and emissive pools. */
export class CaveLayers {
  private reveals = new BackWallReveals();
  private transitions = new DressingTransitions();
  private scramble: number | undefined;
  private enabled = { backWalls: true, dressing: true };
  private snapshot: CaveLayerSnapshot = {
    enabled: { backWalls: true, dressing: true },
    input: { scrambleUnknown: null, unknownCells: 0 },
    backWalls: [],
    dressing: [],
    dressingStats: { limit: 0, exposedCeilings: 0, decoratedCeilings: 0 },
  };

  reset() {
    this.reveals.reset();
    this.transitions.reset();
  }

  debug(options?: CaveLayerOptions): CaveLayerSnapshot {
    if (options?.scrambleUnknown !== undefined)
      this.scramble = options.scrambleUnknown ?? undefined;
    if (options?.backWalls !== undefined)
      this.enabled.backWalls = options.backWalls;
    if (options?.dressing !== undefined)
      this.enabled.dressing = options.dressing;
    return structuredClone(this.snapshot);
  }

  render(
    world: CampaignWorld,
    geometry: CaveGeometry,
    clock: CaveClock & Omit<DressingOptions, "gutter">,
    draw: CaveImage,
  ) {
    const view = createKnownCaveView(world, {
      scrambleUnknown: this.scramble,
    });
    const { tile, scrollX: cx, scrollY: cy, width, height } = geometry;
    const viewport = {
      left: cx / tile,
      top: cy / tile,
      right: (cx + width) / tile,
      bottom: (cy + height) / tile,
    };
    this.reveals.update(view, {
      seconds: clock.seconds,
      frozen: clock.frozen,
      reducedMotion: clock.reducedMotion,
    });
    this.snapshot = {
      enabled: { ...this.enabled },
      input: {
        scrambleUnknown: this.scramble ?? null,
        unknownCells: world.discovered.reduce(
          (count, known) => count + Number(known !== 1),
          0,
        ),
      },
      backWalls: [],
      dressing: [],
      dressingStats: { limit: 0, exposedCeilings: 0, decoratedCeilings: 0 },
    };
    if (this.enabled.backWalls)
      for (const fragment of planBackWalls(
        view,
        viewport,
        cx / tile,
        this.reveals,
        clock.seconds,
      )) {
        const box = fragment.image;
        const x = ((box.left + box.right) / 2) * tile - cx;
        const y = ((box.top + box.bottom) / 2) * tile - cy;
        const w = (box.right - box.left) * tile;
        const h = (box.bottom - box.top) * tile;
        const image = draw(
          fragment.frame,
          x,
          y,
          w,
          h,
          fragment.depth,
          fragment.alpha,
        );
        if (!image) continue;
        const crop = trimmedSourceCrop(
          image.frame,
          fragment.crop,
          BACK_WALL_SOURCE,
        );
        if (!crop) {
          image.setVisible(false);
          continue;
        }
        // Exact shared transforms keep neighbouring cropped quads aligned;
        // ordinary props retain image()'s device-pixel snapping.
        image
          .setPosition(x, y)
          .setScale(w / image.frame.realWidth, h / image.frame.realHeight)
          .setCrop(crop.x, crop.y, crop.width, crop.height);
        this.snapshot.backWalls.push(fragment);
      }
    const plan = planDressing(
      view,
      viewport,
      {
        quality: clock.quality,
        canvas: clock.canvas,
        highContrast: clock.highContrast,
        gutter: 2 / (tile * geometry.dpr),
      },
      dressingCatalog,
    );
    this.snapshot.dressingStats = {
      limit: plan.limit,
      exposedCeilings: plan.exposedCeilings,
      decoratedCeilings: plan.decoratedCeilings,
    };
    if (this.enabled.dressing) {
      const placements = this.transitions.update(
        view,
        plan,
        viewport,
        clock.seconds,
        {
          frozen: clock.frozen,
          reducedMotion: clock.reducedMotion,
        },
      );
      for (const [ordinal, placement] of placements.entries()) {
        // Distinct depths preserve seeded overlap order when shared pooled
        // sprites previously held other frames (the A13 layer-order rule).
        const depth = placement.depth + ordinal * 0.0001;
        if (
          draw(
            placement.frame,
            placement.x * tile - cx,
            placement.y * tile - cy,
            placement.width * tile,
            placement.height * tile,
            depth,
            placement.alpha,
            placement.flipX,
          )
        )
          this.snapshot.dressing.push({ ...placement, depth });
      }
    } else this.transitions.reset();
  }
}
