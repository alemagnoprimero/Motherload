import type { CampaignWorld } from "../types";
import { CODE } from "./field/field-data";
import { DiscoveredWorldView, pristineTiles } from "./field/known-world";

/** A detached, known-only snapshot. No renderer receives the world arrays. */
export interface KnownCaveView {
  readonly id: string;
  readonly seed: number;
  readonly width: number;
  readonly rows: number;
  code(x: number, y: number): number;
  known(x: number, y: number): boolean;
  natural(x: number, y: number): boolean;
  deposit(x: number, y: number): boolean;
}

export interface CaveInputOptions {
  /** An authoring/test pristine copy; still read only for known air. */
  pristine?: ArrayLike<number>;
  /** Re-roll hidden inputs for the render harness, never the simulation. */
  scrambleUnknown?: number;
}

const wrap = (x: number, width: number) => ((x % width) + width) % width;
function hiddenValue(index: number, seed: number) {
  let n = Math.imul(index + 1, 0x45d9f3b) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) % 3;
}

/**
 * A virtual array: the harness can change every hidden current/pristine
 * cell, including cells next to the rig, without changing discovery,
 * collision or import validation. Correctly gated readers never consult
 * one of the replacement values. It does not copy hidden source contents.
 */
function scrambledHidden(
  source: ArrayLike<number>,
  discovered: ArrayLike<number>,
  seed: number,
): ArrayLike<number> {
  return new Proxy({ length: source.length } as ArrayLike<number>, {
    get(target, property) {
      if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) {
        const index = Number(property);
        return discovered[index] === 1
          ? source[index]
          : hiddenValue(index, seed);
      }
      return Reflect.get(target, property);
    },
  });
}

/**
 * The boundary between gameplay and cave rendering. Every current/pristine
 * read follows T2's DiscoveredWorldView known-cell gate. Packages are gated
 * before even their status is read. The result owns copies of known facts,
 * so later world mutations cannot leak through an old render snapshot.
 */
export function createKnownCaveView(
  world: CampaignWorld,
  options: CaveInputOptions = {},
): KnownCaveView {
  const { width, rows } = world;
  const original = options.pristine ?? pristineTiles(world);
  const scramble = options.scrambleUnknown;
  const tiles =
    scramble === undefined
      ? world.tiles
      : scrambledHidden(world.tiles, world.discovered, scramble);
  const pristine =
    original && scramble !== undefined
      ? scrambledHidden(original, world.discovered, scramble ^ 0x6a09e667)
      : original;
  // DiscoveredWorldView needs only these fields. It never receives the
  // packages, sites, hazards, or other unfiltered world data.
  const source = new DiscoveredWorldView(
    {
      id: world.id,
      width,
      rows,
      discovered: world.discovered,
      tiles,
    } as CampaignWorld,
    pristine,
  );
  const codes = new Uint8Array(width * rows).fill(CODE.unknown);
  const naturals = new Uint8Array(width * rows);
  const deposits = new Uint8Array(width * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      codes[index] = source.code(x, y);
      // A world that cannot be rebuilt has no proven natural air. Do not
      // decorate dug cells merely because T2's visual fallback calls them
      // natural when its pristine copy is unavailable.
      if (codes[index] === CODE.air && pristine)
        naturals[index] = Number(source.natural(x, y));
    }
  const indexOf = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    const row = Math.floor(y);
    return row < 0 || row >= rows
      ? -1
      : row * width + wrap(Math.floor(x), width);
  };
  for (const item of world.packages) {
    const index = indexOf(item.x, item.y);
    if (index < 0 || codes[index] === CODE.unknown) continue;
    if (item.status === "deposit") deposits[index] = 1;
  }
  return Object.freeze({
    id: world.id,
    seed: world.seed,
    width,
    rows,
    code: (x: number, y: number) => codes[indexOf(x, y)] ?? CODE.unknown,
    known: (x: number, y: number) =>
      (codes[indexOf(x, y)] ?? CODE.unknown) !== CODE.unknown,
    natural: (x: number, y: number) => naturals[indexOf(x, y)] === 1,
    deposit: (x: number, y: number) => deposits[indexOf(x, y)] === 1,
  });
}
