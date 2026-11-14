import { describe, expect, it } from "vitest";
import catalog from "../assets/campaign/generated/w01-dressing.json";
import freshW01 from "../docs/art-audit/prototype/assets/fresh-w01.json";
import {
  createKnownCaveView,
  type KnownCaveView,
} from "../src/campaign/render/cave-known";
import {
  DressingTransitions,
  dressingFootprintKnown,
  dressingNearDeposit,
  planDressing,
  type DressingOptions,
  type DressingPlacement,
  type DressingViewport,
} from "../src/campaign/render/dressing";
import type { CampaignWorld } from "../src/campaign/types";
import { createWorld } from "../src/campaign/world";

const options: DressingOptions = { gutter: 2 / 96 };
const viewport = { left: 6, top: 33, right: 24, bottom: 42 };
const motion = { frozen: false, reducedMotion: false };
const stopped = { frozen: true, reducedMotion: false };
const plan = (view: KnownCaveView, area = viewport, settings = options) =>
  planDressing(view, area, settings, catalog);
const wrap = (x: number, width: number) => ((x % width) + width) % width;

/** Throws if any content query bypasses discovery, rather than returning fog. */
function chamber(seed = 7, width = 40) {
  const rows = 60;
  const known = new Set<number>();
  const air = new Set<number>();
  const dug = new Set<number>();
  const deposits = new Set<number>();
  const index = (x: number, y: number) => y * width + wrap(x, width);
  for (let y = 32; y <= 43; y++)
    for (let x = 0; x < width; x++) {
      known.add(index(x, y));
      if (y >= 35 && y <= 40) air.add(index(x, y));
    }
  const assertKnown = (x: number, y: number) => {
    if (y < 0 || y >= rows || !known.has(index(x, y)))
      throw new Error(`Hidden content read at ${x},${y}`);
  };
  const view: KnownCaveView = {
    id: "W01",
    seed,
    width,
    rows,
    known: (x, y) => y >= 0 && y < rows && known.has(index(x, y)),
    code: (x, y) => {
      assertKnown(x, y);
      return air.has(index(x, y)) ? 0 : 2;
    },
    natural: (x, y) => {
      assertKnown(x, y);
      return air.has(index(x, y)) && !dug.has(index(x, y));
    },
    deposit: (x, y) => {
      assertKnown(x, y);
      return deposits.has(index(x, y));
    },
  };
  return { view, known, air, dug, deposits, index };
}

function occupied(p: DressingPlacement, gutter = 0) {
  const cells: [number, number][] = [];
  for (
    let y = Math.floor(p.y - p.height / 2 - gutter);
    y < Math.ceil(p.y + p.height / 2 + gutter);
    y++
  )
    for (
      let x = Math.floor(p.x - p.width / 2 - gutter);
      x < Math.ceil(p.x + p.width / 2 + gutter);
      x++
    )
      cells.push([x, y]);
  return cells;
}

function site4() {
  const world = structuredClone(
    freshW01.state.worlds.W01,
  ) as unknown as CampaignWorld;
  const site = world.sites!.find((entry) => entry.id === "W01-SITE-4")!;
  const x = site.x - 2,
    y = site.y + 1;
  for (let row = Math.max(0, Math.floor(y - 6)); row < world.rows; row++)
    for (let c = Math.floor(x - 6); c <= Math.ceil(x + 6); c++)
      if (Math.hypot(c + 0.5 - x, row + 0.5 - y) <= 6)
        world.discovered[row * world.width + wrap(c, world.width)] = 1;
  return world;
}

describe("T5 known natural cave dressing", () => {
  it("places only on known natural faces and never queries unknown contents", () => {
    const { view, known, dug, index } = chamber();
    known.delete(index(8, 35));
    known.delete(index(11, 34));
    dug.add(index(14, 35));
    const result = plan(view);
    expect(result.placements.length).toBeGreaterThan(10);
    for (const p of result.placements) {
      expect(view.natural(p.cellX, p.cellY)).toBe(true);
      expect(dressingFootprintKnown(view, p, options.gutter)).toBe(true);
      expect(
        occupied(p, options.gutter).every(([x, y]) => view.known(x, y)),
      ).toBe(true);
    }
    expect(
      result.placements.some((p) => p.cellX === 14 && p.cellY === 35),
    ).toBe(false);
  });

  it("has byte-identical placement after re-rolling all hidden caves and deposits", () => {
    const world = site4();
    const pristine = createWorld(
      "W01",
      world.seed,
      world.generatorVersion,
    ).tiles;
    const before = plan(createKnownCaveView(world, { pristine }), {
      left: 4,
      top: 37,
      right: 23,
      bottom: 49,
    });
    for (let seed = 0; seed < 8; seed++) {
      const changed = structuredClone(world);
      const caves = pristine.slice();
      for (let i = 0; i < changed.tiles.length; i++) {
        if (changed.discovered[i] === 1) continue;
        changed.tiles[i] = ((i * 31 + seed) % 5) as 0 | 1 | 2 | 3 | 4;
        caves[i] = ((i + seed) % 2) as 0 | 1;
      }
      for (const item of changed.packages) {
        if (changed.discovered[item.y * changed.width + item.x] === 1) continue;
        item.status = "deposit";
      }
      const after = plan(
        createKnownCaveView(changed, {
          pristine: caves,
          scrambleUnknown: seed,
        }),
        { left: 4, top: 37, right: 23, bottom: 49 },
      );
      expect(after).toEqual(before);
    }
  });

  it("decorates at least eight of ten exposed SITE-4 ceilings on both viewport sizes", () => {
    const world = site4();
    const view = createKnownCaveView(world);
    for (const area of [
      { left: 4, top: 37, right: 23, bottom: 49 },
      { left: 10, top: 36, right: 17, bottom: 49 },
    ]) {
      const result = plan(view, area);
      expect(result.exposedCeilings).toBeGreaterThan(0);
      expect(
        result.decoratedCeilings / result.exposedCeilings,
      ).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("keeps the same frames, identity and contact points when the camera changes", () => {
    const { view } = chamber();
    const small = plan(view, { left: 9, top: 33, right: 17, bottom: 42 });
    const larger = plan(view);
    const map = new Map(larger.placements.map((p) => [p.id, p]));
    const shared = small.placements.filter((p) => map.has(p.id));
    expect(shared.length).toBeGreaterThan(5);
    for (const p of shared) expect(p).toEqual(map.get(p.id));
  });

  it("canonicalizes the horizontal seam, including ore exclusion across it", () => {
    const { view, deposits, index } = chamber();
    const a = plan(view, { left: -3, top: 33, right: 4, bottom: 42 });
    const b = plan(view, { left: 37, top: 33, right: 44, bottom: 42 });
    expect(a.placements.length).toBeGreaterThan(0);
    expect(b.placements).toEqual(
      a.placements.map((p) => ({ ...p, x: p.x + 40 })),
    );
    deposits.add(index(39, 41));
    const p = a.placements.find((p) => p.cellX === 0 && p.face === "floor")!;
    expect(p).toBeDefined();
    expect(dressingNearDeposit(view, p)).toBe(true);
  });

  it("holds the high, medium and Canvas screen caps with deterministic selection", () => {
    const { view } = chamber(7, 160);
    const area = { left: 0, top: 33, right: 140, bottom: 42 };
    for (const settings of [
      { ...options, quality: "high" as const },
      { ...options, quality: "medium" as const },
      { ...options, canvas: true },
    ]) {
      const result = plan(view, area, settings);
      expect(result.placements.length).toBe(result.limit);
      expect(plan(view, area, settings)).toEqual(result);
    }
    expect(plan(view, area).limit).toBe(40);
    expect(plan(view, area, { ...options, quality: "medium" }).limit).toBe(30);
    expect(plan(view, area, { ...options, canvas: true }).limit).toBe(20);
  });

  it("rejects crystals near known deposits around every occupied cell, not just the anchor", () => {
    const { view, deposits, index } = chamber(2);
    const before = plan(view);
    const crystal = before.placements.find((p) => p.family === "crystal")!;
    expect(crystal).toBeDefined();
    const cells = occupied(crystal);
    const [edgeX, edgeY] = cells[cells.length - 1]!;
    deposits.add(index(edgeX + 1, edgeY + 1));
    expect(plan(view).placements.some((p) => p.id === crystal.id)).toBe(false);
    for (const p of plan(view).placements.filter((p) => p.family === "crystal"))
      expect(dressingNearDeposit(view, p)).toBe(false);
  });

  it("places floors at the authored outline baseline and roof roots within 0.28 tile", () => {
    const { view } = chamber();
    const result = plan(view);
    expect(result.placements.some((p) => p.face === "floor")).toBe(true);
    for (const p of result.placements) {
      const source = catalog.frames.find((f) => f.name === p.frame)!;
      const scale = p.width / (source.logicalWidth / 48);
      if (p.face === "floor")
        expect(
          p.y - p.height / 2 + (source.baseline! / 96) * scale,
        ).toBeCloseTo(p.cellY + 1, 12);
      if (p.face === "ceiling")
        expect(p.cellY - (p.y - p.height / 2 + (4 / 96) * scale)).toBeCloseTo(
          0.28,
          12,
        );
      if (p.family === "boulder") expect(p.depth).toBeLessThan(18);
    }
  });

  it("never uses cave-zone pages in A/B or another world, and swaps only crystal HC frames", () => {
    const { view } = chamber(2);
    expect(plan({ ...view, id: "W02" }).placements).toEqual([]);
    expect(
      plan(view, { left: 0, top: 0, right: 40, bottom: 29 }).placements,
    ).toEqual([]);
    const normal = plan(view).placements;
    const highContrast = plan(view, viewport, {
      ...options,
      highContrast: true,
    }).placements;
    expect(normal.some((p) => p.family === "crystal")).toBe(true);
    expect(
      highContrast.map((p) => ({
        ...p,
        id: p.id.replace("-hc", ""),
        frame: p.frame.replace("-hc", ""),
      })),
    ).toEqual(normal);
  });
});

describe("T5 scene-clock fades", () => {
  it("switches the high-contrast crystal value immediately without a second prop", () => {
    const { view } = chamber(2);
    const transitions = new DressingTransitions();
    const initial = plan(view);
    transitions.update(view, initial, viewport, 0, stopped);
    const hc = plan(view, viewport, { ...options, highContrast: true });
    const out = transitions.update(view, hc, viewport, 1, motion);
    expect(out).toHaveLength(initial.placements.length);
    expect(
      out
        .filter((p) => p.family === "crystal")
        .every((p) => p.frame.endsWith("-hc") && p.alpha === 1),
    ).toBe(true);
  });

  it("fades newly revealed dressing and ore-displaced crystals over 300 ms", () => {
    const { view, deposits, index } = chamber(2);
    const transitions = new DressingTransitions();
    const initial = plan(view);
    const crystal = initial.placements.find((p) => p.family === "crystal")!;
    expect(transitions.update(view, initial, viewport, 10, motion)).toEqual([]);
    expect(
      transitions
        .update(view, initial, viewport, 10.15, motion)
        .every((p) => Math.abs(p.alpha - 0.5) < 1e-9),
    ).toBe(true);
    expect(
      transitions
        .update(view, initial, viewport, 10.3, motion)
        .every((p) => p.alpha === 1),
    ).toBe(true);
    deposits.add(index(crystal.cellX, crystal.cellY + 1));
    const next = plan(view);
    expect(
      transitions
        .update(view, next, viewport, 11, motion)
        .find((p) => p.id === crystal.id)?.alpha,
    ).toBe(1);
    expect(
      transitions
        .update(view, next, viewport, 11.15, motion)
        .find((p) => p.id === crystal.id)?.alpha,
    ).toBeCloseTo(0.5, 9);
    expect(
      transitions
        .update(view, next, viewport, 11.3, motion)
        .some((p) => p.id === crystal.id),
    ).toBe(false);
  });

  it("immediately suppresses a fog-touching source, including its filter gutter", () => {
    const { view, known, index } = chamber();
    const transitions = new DressingTransitions();
    const initial = plan(view);
    const p = initial.placements[0]!;
    transitions.update(view, initial, viewport, 0, stopped);
    const [x, y] = occupied(p, options.gutter)[0]!;
    known.delete(index(x, y));
    const out = transitions.update(view, plan(view), viewport, 1, motion);
    expect(out.some((entry) => entry.id === p.id)).toBe(false);
    expect(
      out.every((entry) => dressingFootprintKnown(view, entry, options.gutter)),
    ).toBe(true);
  });

  it("snaps under frozen or reduced-motion clocks, and repeats a settled frame exactly", () => {
    const { view } = chamber();
    for (const settings of [stopped, { frozen: false, reducedMotion: true }]) {
      const transitions = new DressingTransitions();
      const initial = plan(view);
      const first = transitions.update(view, initial, viewport, 0, settings);
      expect(first).toHaveLength(initial.placements.length);
      expect(first.every((p) => p.alpha === 1)).toBe(true);
      expect(transitions.update(view, initial, viewport, 0, settings)).toEqual(
        first,
      );
      expect(
        transitions.update(
          view,
          { ...initial, placements: [] },
          viewport,
          1,
          settings,
        ),
      ).toEqual([]);
    }
  });

  it("never exceeds the cap while outgoing fades overlap new reveals", () => {
    const { view } = chamber();
    const transitions = new DressingTransitions();
    const initial = plan(view, viewport, { ...options, canvas: true });
    transitions.update(view, initial, viewport, 0, stopped);
    const replacement = {
      ...initial,
      placements: initial.placements.map((p) => ({
        ...p,
        id: `${p.id}:revealed`,
      })),
    };
    for (const now of [1, 1.1, 1.2, 1.3, 1.4, 1.6])
      expect(
        transitions.update(view, replacement, viewport, now, motion).length,
      ).toBeLessThanOrEqual(20);
    expect(
      transitions
        .update(view, replacement, viewport, 2, motion)
        .map((p) => p.id),
    ).toEqual(replacement.placements.map((p) => p.id));
  });

  it("keeps a source settled when the camera wraps to its other world copy", () => {
    const { view } = chamber();
    const transitions = new DressingTransitions();
    const before: DressingViewport = {
      left: -3,
      top: 33,
      right: 4,
      bottom: 42,
    };
    const after: DressingViewport = {
      left: 37,
      top: 33,
      right: 44,
      bottom: 42,
    };
    const a = transitions.update(view, plan(view, before), before, 0, stopped);
    const b = transitions.update(view, plan(view, after), after, 1, motion);
    expect(b).toEqual(a.map((p) => ({ ...p, x: p.x + 40 })));
  });
});
