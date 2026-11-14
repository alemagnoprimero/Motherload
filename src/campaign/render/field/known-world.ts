import type { CampaignWorld } from "../../types";
import { createWorld } from "../../world";
import { CODE, tileCode, type KnownWorldView } from "./field-data";

/**
 * T2's stand-in for F7's KnownWorldView (not on main yet): it reads a
 * world's tiles only where `discovered` is set. Undiscovered cells read as
 * CODE.unknown, so the field never sees hidden geology.
 *
 * Natural versus dug air (T4) comes from the pristine tiles rebuilt from the
 * seed and generator version, consulted only for known air cells: air in the
 * pristine world is natural, air the rig dug is not.
 */
export class DiscoveredWorldView implements KnownWorldView {
  readonly id: string;
  readonly width: number;
  readonly rows: number;
  constructor(
    private world: CampaignWorld,
    private pristine: ArrayLike<number> | undefined,
  ) {
    this.id = world.id;
    this.width = world.width;
    this.rows = world.rows;
  }
  code(x: number, y: number) {
    const i = y * this.width + x;
    return this.world.discovered[i] === 1
      ? tileCode(this.world.tiles[i] ?? 1)
      : CODE.unknown;
  }
  natural(x: number, y: number) {
    const i = y * this.width + x;
    if (this.world.discovered[i] !== 1 || this.world.tiles[i] !== 0)
      return false;
    // Without a pristine copy every known air cell counts as natural.
    return this.pristine ? this.pristine[i] === 0 : true;
  }
}

const pristineCache = new Map<string, number[] | null>();

/** The world's tiles as generated, or undefined if they cannot be rebuilt. */
export function pristineTiles(world: CampaignWorld) {
  const key = `${world.id}:${world.seed}:${world.generatorVersion ?? 1}`;
  if (!pristineCache.has(key)) {
    let tiles: number[] | null = null;
    try {
      if (world.id === "W01" || world.id === "W02") {
        const fresh = createWorld(
          world.id,
          world.seed,
          world.generatorVersion ?? 1,
        );
        if (fresh.width === world.width && fresh.rows === world.rows)
          tiles = fresh.tiles;
      }
    } catch {
      tiles = null;
    }
    pristineCache.set(key, tiles);
  }
  return pristineCache.get(key) ?? undefined;
}
