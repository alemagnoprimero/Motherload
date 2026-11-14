import { describe, expect, it } from "vitest";
import freshW01 from "../docs/art-audit/prototype/assets/fresh-w01.json";
import type { CampaignWorld } from "../src/campaign/types";
import { CODE } from "../src/campaign/render/field/field-data";
import { createKnownCaveView } from "../src/campaign/render/cave-known";
import {
  BACK_WALL_INSET,
  BACK_WALL_SOURCE,
  BackWallReveals,
  planBackWalls,
  safeCaveCell,
  type BackWallFragment,
  type CaveRect,
} from "../src/campaign/render/cave-back-walls";

function fixture() {
  const width = 40,
    rows = 60;
  const world = {
    id: "W01",
    seed: 171,
    width,
    rows,
    generatorVersion: 2,
    tiles: Array(width * rows).fill(1),
    discovered: Array(width * rows).fill(0),
    packages: [],
  } as unknown as CampaignWorld;
  const pristine = world.tiles.slice();
  for (let y = 38; y <= 42; y++)
    for (const x of [36, 37, 38, 39, 0, 1, 2, 3, 4]) {
      const i = y * width + x;
      world.discovered[i] = 1;
      world.tiles[i] = pristine[i] = 0;
    }
  return { world, pristine };
}
const viewport: CaveRect = { left: -4, top: 37, right: 5, bottom: 44 };
const cloneRounded = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "number" ? Number(item.toFixed(8)) : item,
    ),
  );

describe("known cave input boundary", () => {
  it("never reads unknown current/pristine contents or hidden deposit status", () => {
    const { world, pristine } = fixture();
    const guarded = (array: number[]) =>
      new Proxy(array, {
        get(target, property, receiver) {
          if (
            typeof property === "string" &&
            /^(0|[1-9]\d*)$/.test(property) &&
            world.discovered[Number(property)] !== 1
          )
            throw new Error(`hidden read at ${property}`);
          return Reflect.get(target, property, receiver);
        },
      });
    world.tiles = guarded(world.tiles);
    world.packages.push({
      x: 8,
      y: 40,
      get status() {
        throw new Error("hidden deposit status");
      },
    } as unknown as CampaignWorld["packages"][number]);
    const view = createKnownCaveView(world, { pristine: guarded(pristine) });
    expect(view.code(8, 40)).toBe(CODE.unknown);
    expect(view.natural(8, 40)).toBe(false);
    expect(view.deposit(8, 40)).toBe(false);
    expect(planBackWalls(view, viewport, viewport.left).length).toBeGreaterThan(
      0,
    );
  });

  it("copies only known facts and gates deposits while wrapping columns", () => {
    const { world, pristine } = fixture();
    world.packages.push({
      x: 39.5,
      y: 40.5,
      status: "deposit",
    } as CampaignWorld["packages"][number]);
    world.packages.push({
      x: 2.5,
      y: 40.5,
      status: "exposed",
    } as CampaignWorld["packages"][number]);
    const view = createKnownCaveView(world, { pristine });
    expect(view.deposit(-1, 40)).toBe(true);
    expect(view.deposit(2, 40)).toBe(false);
    expect(view.natural(40, 40)).toBe(true);
    expect(view.known(0, -1)).toBe(false);
    expect(view.natural(0, 60)).toBe(false);
    world.discovered.fill(0);
    world.tiles.fill(2);
    pristine.fill(2);
    expect(view.natural(0, 40)).toBe(true);
    expect(view.deposit(-1, 40)).toBe(true);
  });

  it("re-rolling every hidden cave and pristine cell leaves every fragment identical", () => {
    const { world, pristine } = fixture();
    const reference = planBackWalls(
      createKnownCaveView(world, { pristine }),
      viewport,
      -1.25,
    );
    expect(reference.length).toBeGreaterThan(0);
    for (let seed = 0; seed < 20; seed++) {
      const view = createKnownCaveView(world, {
        pristine,
        scrambleUnknown: seed,
      });
      expect(planBackWalls(view, viewport, -1.25)).toEqual(reference);
    }
  });
});

describe("safe back-wall fragments", () => {
  it("never draws unknown, dug, unsupported-world or out-of-band air", () => {
    const { world, pristine } = fixture();
    pristine[40 * world.width + 2] = 1; // dug, rather than natural air
    const view = createKnownCaveView(world, { pristine });
    expect(safeCaveCell(view, 2, 40)).toEqual([]);
    expect(safeCaveCell(view, 8, 40)).toEqual([]);
    expect(planBackWalls({ ...view, id: "W02" }, viewport, 0)).toEqual([]);
    const fragments = planBackWalls(view, viewport, -2.75);
    for (const { bounds } of fragments) {
      const x = (bounds.left + bounds.right) / 2,
        y = (bounds.top + bounds.bottom) / 2;
      expect(view.natural(x, y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(30);
      expect(y).toBeLessThan(48);
    }
  });

  it("keeps the 0.30-tile clearance at diagonal corners as well as faces", () => {
    const { world, pristine } = fixture();
    world.discovered[39 * world.width + 1] = 0; // hidden north-east corner of (0,40)
    const view = createKnownCaveView(world, { pristine });
    const regions = safeCaveCell(view, 0, 40);
    expect(regions.length).toBeGreaterThan(1);
    for (const region of regions)
      for (const x of [
        region.left + 1e-7,
        (region.left + region.right) / 2,
        region.right - 1e-7,
      ])
        for (const y of [
          region.top + 1e-7,
          (region.top + region.bottom) / 2,
          region.bottom - 1e-7,
        ]) {
          const distance = Math.max(
            Math.max(1 - x, x - 2, 0),
            Math.max(39 - y, y - 40, 0),
          );
          expect(distance).toBeGreaterThanOrEqual(BACK_WALL_INSET - 1e-6);
        }
  });

  it("crops at horizontal and vertical atlas repeats without crossing source edges", () => {
    const { world, pristine } = fixture();
    const fragments = planBackWalls(
      createKnownCaveView(world, { pristine }),
      viewport,
      0.137,
    );
    for (const fragment of fragments) {
      const { crop, image, bounds } = fragment;
      expect(crop.x).toBeGreaterThanOrEqual(-1e-8);
      expect(crop.y).toBeGreaterThanOrEqual(-1e-8);
      expect(crop.x + crop.width).toBeLessThanOrEqual(
        BACK_WALL_SOURCE.width + 1e-8,
      );
      expect(crop.y + crop.height).toBeLessThanOrEqual(
        BACK_WALL_SOURCE.height + 1e-8,
      );
      expect(crop.width).toBeGreaterThan(0);
      expect(crop.height).toBeGreaterThan(0);
      expect(image.left + (crop.x / BACK_WALL_SOURCE.width) * 10).toBeCloseTo(
        bounds.left,
        9,
      );
      expect(image.top + (crop.y / BACK_WALL_SOURCE.height) * 4).toBeCloseTo(
        bounds.top,
        9,
      );
      expect((crop.width / BACK_WALL_SOURCE.width) * 10).toBeCloseTo(
        bounds.right - bounds.left,
        9,
      );
    }
  });

  it("returns exactly the same screen fragments after a camera lap around the world", () => {
    const { world, pristine } = fixture();
    const view = createKnownCaveView(world, { pristine });
    const first = planBackWalls(view, viewport, viewport.left);
    const second = planBackWalls(
      view,
      { ...viewport, left: viewport.left + 40, right: viewport.right + 40 },
      viewport.left + 40,
    );
    const relative = (fragments: BackWallFragment[], shift: number) =>
      fragments.map((fragment) => ({
        ...fragment,
        bounds: {
          ...fragment.bounds,
          left: fragment.bounds.left - shift,
          right: fragment.bounds.right - shift,
        },
        image: {
          ...fragment.image,
          left: fragment.image.left - shift,
          right: fragment.image.right - shift,
        },
      }));
    expect(cloneRounded(relative(second, 40))).toEqual(
      cloneRounded(relative(first, 0)),
    );
  });

  it("anchors imagery to world rows and moves each layer by its constant parallax", () => {
    const { world, pristine } = fixture();
    const view = createKnownCaveView(world, { pristine });
    const first = planBackWalls(view, viewport, 0),
      second = planBackWalls(view, viewport, 1);
    for (const [layer, shift] of [
      [0, 0.75],
      [1, 0.5],
    ]) {
      const find = (fragments: BackWallFragment[]) =>
        fragments.find(
          (f) =>
            f.layer === layer &&
            f.bounds.left < 2.5 &&
            f.bounds.right > 2.5 &&
            f.bounds.top < 40.5 &&
            f.bounds.bottom > 40.5,
        )!;
      const a = find(first),
        b = find(second);
      expect(b.image.left - a.image.left).toBeCloseTo(shift!, 9);
      expect(b.image.top).toBe(a.image.top);
    }
  });

  it("shares source edges at vertical joins and repeats after eight world rows", () => {
    const { world, pristine } = fixture();
    for (let y = 30; y <= 47; y++)
      for (let x = 0; x < world.width; x++) {
        const i = y * world.width + x;
        world.discovered[i] = 1;
        world.tiles[i] = pristine[i] = 0;
      }
    const view = createKnownCaveView(world, { pristine });
    const plan = planBackWalls(
      view,
      { left: 0, right: 2, top: 31, bottom: 47 },
      0,
    );
    const sourceAt = (y: number) => {
      const fragment = plan.find(
        ({ layer, bounds }) =>
          layer === 0 &&
          bounds.left < 0.5 &&
          bounds.right > 0.5 &&
          bounds.top < y &&
          bounds.bottom > y,
      )!;
      const local = ((y - fragment.image.top) / 4) * BACK_WALL_SOURCE.height;
      return fragment.flipY ? BACK_WALL_SOURCE.height - local : local;
    };
    for (const seam of [32, 36, 40, 44])
      expect(sourceAt(seam - 1e-6)).toBeCloseTo(sourceAt(seam + 1e-6), 7);
    expect(sourceAt(32.75)).toBe(sourceAt(40.75));
    expect(sourceAt(32.75) + sourceAt(36.75)).toBe(BACK_WALL_SOURCE.height);
    for (const { crop, flipY } of plan) {
      const sourceY = flipY
        ? BACK_WALL_SOURCE.height - crop.y - crop.height
        : crop.y;
      expect(sourceY).toBeGreaterThanOrEqual(-1e-8);
      expect(sourceY + crop.height).toBeLessThanOrEqual(
        BACK_WALL_SOURCE.height + 1e-8,
      );
    }
  });
});

describe("back-wall reveal clock", () => {
  it("keeps the SITE-4 phone reveal below one 1024-quad batch with room for props", () => {
    const saved = structuredClone(freshW01);
    const world = saved.state.worlds.W01 as CampaignWorld;
    const site = world.sites!.find((item) => item.id === "W01-SITE-4")!;
    const x = site.x - 2,
      y = site.y + 1;
    const pristine = world.tiles.slice();
    const cells: number[] = [];
    world.discovered.fill(0);
    for (let row = Math.floor(y - 6); row < world.rows; row++)
      for (
        let column = Math.floor(x - 6);
        column <= Math.ceil(x + 6);
        column++
      ) {
        if (Math.hypot(column + 0.5 - x, row + 0.5 - y) > 6) continue;
        const index =
          row * world.width +
          (((column % world.width) + world.width) % world.width);
        cells.push(index);
        // An alternating old/new pattern exercises many simultaneous margin fades.
        world.discovered[index] = (row + column) % 2 === 0 ? 1 : 0;
      }
    const state = new BackWallReveals();
    state.update(createKnownCaveView(world, { pristine }), {
      seconds: 1,
      frozen: false,
      reducedMotion: false,
    });
    for (const index of cells) world.discovered[index] = 1;
    const view = createKnownCaveView(world, { pristine });
    state.update(view, { seconds: 2, frozen: false, reducedMotion: false });
    const phone = {
      left: x - 393 / 88,
      right: x + 393 / 88,
      top: 45.64 - 851 / 88,
      bottom: 45.64 + 851 / 88,
    };
    const counts = Array.from(
      { length: 40 },
      (_, n) => planBackWalls(view, phone, x + n / 4, state, 2.15).length,
    );
    expect(Math.max(...counts)).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBeLessThan(512);
  });

  it("fades newly exposed margins without darkening the old cell interior", () => {
    const { world, pristine } = fixture();
    const state = new BackWallReveals();
    state.update(createKnownCaveView(world, { pristine }), {
      seconds: 1,
      frozen: false,
      reducedMotion: false,
    });
    const index = 40 * world.width + 5;
    world.tiles[index] = pristine[index] = 0;
    world.discovered[index] = 1;
    const view = createKnownCaveView(world, { pristine });
    state.update(view, { seconds: 2, frozen: false, reducedMotion: false });
    const at = (seconds: number, x: number) =>
      planBackWalls(view, viewport, 0, state, seconds).find(
        ({ layer, bounds }) =>
          layer === 0 &&
          bounds.left < x &&
          bounds.right > x &&
          bounds.top < 40.5 &&
          bounds.bottom > 40.5,
      );
    expect(at(2, 4.5)?.alpha).toBe(1);
    expect(at(2, 4.85)).toBeUndefined();
    expect(at(2.15, 4.5)?.alpha).toBe(1);
    expect(at(2.15, 4.85)?.alpha).toBeCloseTo(0.5);
    expect(at(2.31, 4.85)?.alpha).toBe(1);
    // Temporary splits disappear after the transition: no parked cost.
    expect(planBackWalls(view, viewport, 0, state, 3)).toEqual(
      planBackWalls(view, viewport, 0),
    );
  });

  it("fades new known air over 300 ms and leaves parked plans unchanged", () => {
    const { world, pristine } = fixture();
    const state = new BackWallReveals();
    let view = createKnownCaveView(world, { pristine });
    state.update(view, { seconds: 1, frozen: false, reducedMotion: false });
    expect(state.alpha(view, 0, 40, 1)).toBe(1);
    const index = 40 * world.width + 5;
    world.tiles[index] = pristine[index] = 0;
    world.discovered[index] = 1;
    view = createKnownCaveView(world, { pristine });
    state.update(view, { seconds: 2, frozen: false, reducedMotion: false });
    expect(state.alpha(view, 5, 40, 2)).toBe(0);
    expect(state.alpha(view, 5, 40, 2.15)).toBeCloseTo(0.5);
    expect(state.alpha(view, 5, 40, 2.3)).toBeCloseTo(1);
    const first = planBackWalls(view, viewport, 0, state, 3);
    state.update(view, { seconds: 4, frozen: false, reducedMotion: false });
    expect(planBackWalls(view, viewport, 0, state, 4)).toEqual(first);
  });

  it("snaps when frozen, reduced motion is on, or the scene clock resets", () => {
    for (const mode of ["frozen", "reduced", "reset"]) {
      const { world, pristine } = fixture();
      const state = new BackWallReveals();
      state.update(createKnownCaveView(world, { pristine }), {
        seconds: 10,
        frozen: false,
        reducedMotion: false,
      });
      const index = 40 * world.width + 5;
      world.tiles[index] = pristine[index] = 0;
      world.discovered[index] = 1;
      const view = createKnownCaveView(world, { pristine });
      state.update(view, {
        seconds: mode === "reset" ? 0 : 11,
        frozen: mode === "frozen",
        reducedMotion: mode === "reduced",
      });
      expect(state.alpha(view, 5, 40, mode === "reset" ? 0 : 11)).toBe(1);
    }
  });
});
