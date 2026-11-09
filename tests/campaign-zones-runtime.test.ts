import { afterEach, describe, expect, it, vi } from "vitest";
import bands from "../assets/campaign/generated/bands/manifest.json";
import w01Sky from "../assets/campaign/generated/w01-sky-runtime.png?inline";
import w01Far from "../assets/campaign/generated/w01-ridge-mid.png?inline";
import w01Near from "../assets/campaign/generated/w01-ridge-near.png?inline";
import w02Sky from "../assets/campaign/generated/w02-sky-runtime.png?inline";
import w02Far from "../assets/campaign/generated/w02-ridge-far.png?inline";
import w02Near from "../assets/campaign/generated/w02-ridge-near.png?inline";
import zonesSource from "../src/campaign/render/zones.ts?raw";
import artSource from "../src/campaign/render/art.ts?raw";
import sceneSource from "../src/campaign/scene.ts?raw";
import { campaignTileSize, retainedTerrainGrid } from "../src/campaign/layout";
import { renderDebugOptions } from "../src/campaign/view";
import {
  BACKGROUND_BYTES,
  BAND_BYTES,
  ZONE_MANIFESTS,
  ZONE_NAMES,
  d1Densities,
  devicePxPerTile,
  frameOwner,
  framePages,
  guardDensities,
  memoryBudget,
  pageBytes,
  pageDensity,
  planPages,
  rigZone,
  textureGroup,
  type PageDensities,
  type PlanInput,
  type WorldId,
} from "../src/campaign/render/zones";

// Audit T13b, the runtime half (src/campaign/render/zones.ts): D1's density
// rule, the resident page set per band, the owner atlas of a frame and the
// budget guard.
const MiB = 2 ** 20;
/** Device px per tile on a device: the backing ceiling is min(DPR, 2). */
const px = (width: number, height: number, dpr: number, tile?: number) =>
  devicePxPerTile(width, height, Math.min(dpr, 2), tile);
const keys = (pages: { key: string }[]) => pages.map((page) => page.key).sort();
const plan = (input: Partial<PlanInput> & { world: WorldId; band: number }) =>
  planPages({
    neighbours: true,
    w02: input.world === "W02",
    stage: 0,
    densities: d1Densities(130.9),
    ...input,
  });

afterEach(() => vi.unstubAllGlobals());

describe("D1: zone pages by device px per tile", () => {
  it.each([
    // [case, device px per tile, hero density, other pages]
    ["desktop 1440×900 @2", px(1440, 900, 2), 3, 3],
    ["desktop 1728×1117 @2", px(1728, 1117, 2), 4, 3],
    ["phone 393×851 @3 (backing 2)", px(393, 851, 3), 2, 2],
    ["tile 56 at backing 2 (D1 option B)", px(393, 851, 3, 56), 3, 3],
    ["coarse tablet 1366×1024 @2", px(1366, 1024, 2), 3, 3],
    ["desktop 1440×900 @1", px(1440, 900, 1), 2, 2],
    ["tile 82 at backing 2", px(1440, 900, 2, 82), 4, 3],
  ])("%s: %f px per tile", (_case, pxPerTile, hero, plain) => {
    expect(pageDensity(pxPerTile, true)).toBe(hero);
    expect(pageDensity(pxPerTile, false)).toBe(plain);
    const densities = d1Densities(pxPerTile);
    expect(densities.hero).toBe(hero);
    for (const zone of ZONE_NAMES) expect(densities.plain[zone]).toBe(plain);
  });
  it("reads today's tiles: 1440 @2 is 130.9 px, the phone 88", () => {
    expect(campaignTileSize(1440, 900)).toBeCloseTo(65.45, 2);
    expect(px(1440, 900, 2)).toBeCloseTo(130.9, 1);
    expect(px(393, 851, 3)).toBe(88);
    expect(px(1728, 1117, 2)).toBeCloseTo(157.1, 1);
  });
  it("steps at whole page tiles: 96 → @2x, 144 → @3x, 192 → @4x", () => {
    expect(pageDensity(96, true)).toBe(2);
    expect(pageDensity(96.5, true)).toBe(3);
    expect(pageDensity(144, true)).toBe(3);
    expect(pageDensity(144.5, true)).toBe(4);
    expect(pageDensity(400, true)).toBe(4);
    expect(pageDensity(400, false)).toBe(3);
    expect(pageDensity(20, false)).toBe(2);
  });
  it("never consults the pointer type", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("pointer type consulted");
    });
    expect(d1Densities(px(1366, 1024, 2)).hero).toBe(3);
    expect(plan({ world: "W01", band: 1 }).pages.length).toBeGreaterThan(0);
    for (const source of [zonesSource, artSource])
      expect(source).not.toMatch(/matchMedia|\(pointer/);
    expect(sceneSource).not.toMatch(/artQuality\s*=\s*matchMedia/);
  });
  it("takes ?tile= as a debug override next to ?backing=, and only then", () => {
    expect(renderDebugOptions("?tile=56").tile).toBe(56);
    expect(renderDebugOptions("?tile=82&backing=2")).toMatchObject({
      tile: 82,
      backingPin: 2,
    });
    for (const search of ["", "?tile=", "?tile=12", "?tile=900", "?tile=x"])
      expect(renderDebugOptions(search).tile).toBeUndefined();
  });
});

describe("the resident page set per band (D-d)", () => {
  it("boot in W01 (band A, at the dock): core, surface with stages 0 and 1, shaft", () => {
    const boot = plan({ world: "W01", band: 0, neighbours: false });
    expect(boot.window).toEqual(["A"]);
    expect(keys(boot.pages)).toEqual([
      "campaign-w01-core-3x-0",
      "campaign-w01-core-hero-3x-0",
      "campaign-w01-shaft-3x-0",
      "campaign-w01-surface-3x-0",
      "campaign-w01-surface-stage0-3x-0",
      "campaign-w01-surface-stage1-3x-0",
    ]);
    // The next lander stage streams ahead; the scene waits for the rest.
    expect(keys(boot.gate)).toEqual([
      "campaign-w01-core-3x-0",
      "campaign-w01-core-hero-3x-0",
      "campaign-w01-shaft-3x-0",
      "campaign-w01-surface-3x-0",
      "campaign-w01-surface-stage0-3x-0",
    ]);
    expect(boot.backgrounds && boot.backgroundsGate).toBe(true);
  });
  it("W01 row 18 (band B): A, B and C, waiting only for core and shaft", () => {
    const shaft = plan({ world: "W01", band: 1 });
    expect(shaft.window).toEqual(["A", "B", "C"]);
    expect(new Set(shaft.pages.map((page) => page.zone))).toEqual(
      new Set(["core", "surface", "shaft", "cave"]),
    );
    expect(new Set(shaft.gate.map((page) => page.zone))).toEqual(
      new Set(["core", "shaft"]),
    );
    expect(shaft.backgrounds).toBe(true);
    expect(shaft.backgroundsGate).toBe(false);
  });
  it("W01 row 43 (band C): no surface pages, sky or ridges", () => {
    const cave = plan({ world: "W01", band: 2 });
    expect(cave.window).toEqual(["B", "C", "D"]);
    expect(keys(cave.pages)).toEqual([
      "campaign-w01-cave-3x-0",
      "campaign-w01-core-3x-0",
      "campaign-w01-core-hero-3x-0",
      "campaign-w01-shaft-3x-0",
    ]);
    expect(new Set(cave.gate.map((page) => page.zone))).toEqual(
      new Set(["core", "cave"]),
    );
    expect(cave.backgrounds).toBe(false);
    const deep = plan({ world: "W01", band: 3 });
    expect(new Set(deep.pages.map((page) => page.zone))).toEqual(
      new Set(["core", "cave"]),
    );
  });
  it("W02 row 26 (band B): both cores, W02's surface, both cave atlases", () => {
    const frontier = plan({ world: "W02", band: 1, stage: 2 });
    expect(keys(frontier.pages)).toEqual([
      "campaign-w01-cave-3x-0",
      "campaign-w01-core-3x-0",
      "campaign-w01-core-hero-3x-0",
      "campaign-w02-cave-3x-0",
      "campaign-w02-core-3x-0",
      "campaign-w02-core-hero-3x-0",
      "campaign-w02-surface-3x-0",
      "campaign-w02-surface-stage2-3x-0",
      "campaign-w02-surface-stage3-3x-0",
    ]);
  });
  it("W01 with W02 hardware owned adds W02's core only", () => {
    const owned = plan({ world: "W01", band: 1, w02: true });
    const extra = owned.pages.filter((page) => page.key.includes("-w02-"));
    expect(keys(extra)).toEqual([
      "campaign-w02-core-3x-0",
      "campaign-w02-core-hero-3x-0",
    ]);
  });
  it("loads @4x for the hero set only, the rest from @3x", () => {
    const hero = plan({
      world: "W01",
      band: 0,
      neighbours: false,
      densities: d1Densities(px(1728, 1117, 2)),
    });
    for (const page of hero.pages) expect(page.density).toBe(page.hero ? 4 : 3);
    expect(keys(hero.pages)).toContain("campaign-w01-core-hero-4x-0");
    expect(keys(hero.pages)).toContain("campaign-w01-surface-stage0-4x-0");
  });
  it("covers every frame a world draws in each band, from its owner atlas", () => {
    for (const world of ["W01", "W02"] as const)
      for (let band = 0; band < 4; band++)
        for (const stage of [0, 3]) {
          const resident = new Set(
            // W02 owned: W01 draws W02's upgrades and tools from its core.
            plan({ world, band, stage, w02: true }).pages.flatMap((page) =>
              page.frames.map((frame) => `${page.key}:${frame}`),
            ),
          );
          for (const atlas of ["W01", "W02"] as const) {
            const manifest = ZONE_MANIFESTS[atlas];
            for (const [frame, zone] of Object.entries(manifest.frames)) {
              const info = manifest.zones[zone]!;
              const drawn =
                zone === "core" ||
                (info.worlds.includes(world) &&
                  info.bands.includes("ABCD"[band]!));
              if (!drawn) continue;
              // A world draws only the lander stage it has reached.
              const stageOf = frame.match(/^dock-stage-(\d)$/)?.[1];
              if (stageOf !== undefined && Number(stageOf) !== stage) continue;
              expect(
                framePages(atlas, frame).some((page) =>
                  resident.has(`${page.key}:${frame}`),
                ),
                `${world} band ${"ABCD"[band]}: ${atlas} ${frame}`,
              ).toBe(true);
            }
          }
        }
  });
});

describe("the owner atlas of a frame, from the manifests", () => {
  it.each([
    ["rig-body-0", "W02", "W01"],
    ["rig-cabin", "W02", "W01"],
    ["cold-pocket", "W02", "W01"],
    ["surface-salvage", "W02", "W01"],
    ["site-geode", "W02", "W01"],
    ["pressure-seam", "W02", "W01"],
    ["dock-stage-0", "W02", "W02"],
    ["dock-stage-0", "W01", "W01"],
    ["ice-vent", "W02", "W02"],
    ["ore-o1", "W02", "W02"],
    ["ore-o1", "W01", "W01"],
    ["rig-engine-2", "W01", "W02"],
    ["rig-drill-collar-down-2", "W01", "W02"],
    ["tool-thermal", "W01", "W02"],
    ["rig-engine-1", "W02", "W01"],
  ] as const)("%s in %s draws from %s", (frame, current, owner) => {
    expect(frameOwner(frame, current === "W02")).toBe(owner);
    expect(framePages(owner, frame).length).toBeGreaterThan(0);
  });
  it("keeps terrain, DOM icons and unused frames off the pages", () => {
    for (const frame of ["soil-0", "ice-edge-3", "icon-drill", "site-beacon"])
      expect(framePages(frameOwner(frame, false), frame)).toEqual([]);
  });
});

describe("the T13b budget guard", () => {
  const input = { world: "W01" as const, band: 0, neighbours: false };
  const planner = (densities: PageDensities) => plan({ ...input, densities });
  it("leaves D1 alone when the pages fit", () => {
    const base = d1Densities(112);
    const result = guardDensities(base, 20 * MiB, 10 * MiB, planner);
    expect(result.stepped).toEqual([]);
    expect(result.densities).toEqual(base);
  });
  it("steps non-hero zones to @2x, biggest saving first, until they fit", () => {
    const base = d1Densities(112);
    const atlas = pageBytes(planner(base).pages);
    // Over by a little: one step (the surface rest page, the largest) fits.
    const result = guardDensities(
      base,
      20 * MiB,
      20 * MiB - atlas + 1,
      planner,
    );
    expect(result.stepped).toEqual(["surface"]);
    expect(result.densities.hero).toBe(3);
    expect(result.densities.plain.surface).toBe(2);
    expect(result.densities.plain.core).toBe(3);
    expect(result.projected).toBeLessThanOrEqual(20 * MiB);
    for (const page of result.plan.pages)
      if (page.hero) expect(page.density).toBe(3);
  });
  it("stops at @2x everywhere when nothing fits, keeping hero pages", () => {
    const result = guardDensities(
      d1Densities(112),
      20 * MiB,
      30 * MiB,
      planner,
    );
    expect(new Set(result.stepped)).toEqual(
      new Set(["surface", "core", "shaft"]),
    );
    for (const page of result.plan.pages)
      expect(page.density).toBe(page.hero ? 3 : 2);
    expect(result.projected).toBeGreaterThan(20 * MiB);
  });
  it("takes each form's §7 budget from the render tier", () => {
    expect(memoryBudget("high", true)).toBe(64 * MiB);
    expect(memoryBudget("high", false)).toBe(64 * MiB);
    expect(memoryBudget("medium", true)).toBe(20 * MiB);
    expect(memoryBudget("medium", false)).toBe(40 * MiB);
    expect(memoryBudget("low", true)).toBe(20 * MiB);
  });
  it("projects band pages, backgrounds and the terrain as they load", () => {
    const page = (material: string) =>
      bands.pages.find(
        (entry) =>
          entry.band === "W01-A" &&
          entry.material === material &&
          entry.file.endsWith("-2x.png"),
      )!;
    expect(BAND_BYTES).toBe(
      (page("soil").width * page("soil").height +
        page("rock").width * page("rock").height +
        384 * 384) *
        4,
    );
    /** Decoded bytes of a PNG, from its IHDR (an inlined data URL). */
    const size = (url: string) => {
      const png = Uint8Array.from(atob(url.split(",")[1]!), (c) =>
        c.charCodeAt(0),
      );
      const view = new DataView(png.buffer);
      return view.getUint32(16) * view.getUint32(20) * 4;
    };
    for (const layers of [
      [w01Sky, w01Far, w01Near],
      [w02Sky, w02Far, w02Near],
    ])
      expect(layers.reduce((sum, url) => sum + size(url), 0)).toBe(
        BACKGROUND_BYTES,
      );
    // The retained terrain as render-memory measures it today.
    const phone = retainedTerrainGrid(393, 851, 44, 2, true);
    expect([phone.pixelWidth, phone.pixelHeight]).toEqual([870, 1508]);
    const desktop = retainedTerrainGrid(1440, 900, 1440 / 22, 2, false);
    expect([desktop.pixelWidth, desktop.pixelHeight]).toEqual([2744, 1862]);
  });
});

describe("the F1 readout's texture groups", () => {
  it.each([
    ["campaign-w01-core-hero-3x-0", "atlas"],
    ["campaign-w02-surface-stage1-2x-0", "atlas"],
    ["band-W01-c-wall", "bands"],
    ["campaign-sky", "bg"],
    ["frontier-ridge-near", "bg"],
    ["campaign-retained-terrain", "layers"],
    ["campaign-light-map", "layers"],
    ["campaign-t1-lite-headlamp", "layers"],
    ["campaign-sky-gradient", "other"],
    ["campaign-fx-glint-gold", "other"],
    ["__DEFAULT", "other"],
  ])("%s → %s", (key, group) => expect(textureGroup(key)).toBe(group));
  it("names the rig's zone", () => {
    expect(rigZone(0, -0.36)).toBe("surface");
    expect(rigZone(0, 5)).toBe("shaft");
    expect(rigZone(1, 18)).toBe("shaft");
    expect(rigZone(2, 43)).toBe("cave");
    expect(rigZone(3, 55)).toBe("cave");
  });
});
