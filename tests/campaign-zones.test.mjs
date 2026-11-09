import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorld } from "../src/campaign/world";
import { WORLD_BANDS } from "../src/campaign/world-content";
import { poiArtwork } from "../src/campaign/render/poi-art";
import {
  BAND_ROWS,
  DENSITIES,
  HERO,
  PAGE_LIMIT,
  PLACEMENT,
  TERRAIN,
  UNUSED,
  ZONE_NAMES,
  bandsOf,
  densitiesOf,
  excludedReason,
  isHero,
  pageGroups,
  pageSet,
  zoneOf,
} from "../scripts/campaign-zones.mjs";

// Audit T13b: the zone classification behind the zone pages
// (scripts/campaign-zones.mjs) and the manifests the builds write from it.
const read = (path) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const worlds = {
  W01: read("assets/campaign/source/frames.json").frames,
  W02: read("assets/campaign/w02/frames.json").frames,
};
const manifests = {
  W01: read("assets/campaign/generated/w01-zones.json"),
  W02: read("assets/campaign/generated/w02-zones.json"),
};
const bandOf = (world, row) =>
  WORLD_BANDS[world].find((band) => row >= band.start && row <= band.end).id;

/** Where each underground frame is really drawn: "W01:C", … */
function placedBands(world, seed) {
  const generated = createWorld(world, seed);
  const placed = {};
  const add = (frame, y) =>
    (placed[frame] ??= new Set()).add(bandOf(world, Math.floor(y)));
  for (const site of generated.sites ?? []) add(`site-${site.kind}`, site.y);
  // POI scenery behind mission parts (poi.ts kinds by mission id).
  const kinds = {
    "W01-VALVE": "valve",
    "W01-ANTENNA": "antenna",
    "W01-Q": "core",
    "W02-Q": "catalyst",
  };
  for (const mission of generated.missions) {
    const kind = kinds[mission.id] ?? "sample";
    const { scenery } = poiArtwork({ kind, frame: "" });
    if (scenery) add(scenery, mission.y);
  }
  for (const pocket of generated.hazards?.coldPockets ?? []) {
    add("cold-pocket", pocket.y);
    add("cold-warning", pocket.y);
  }
  for (const vent of generated.hazards?.vents ?? []) add("ice-vent", vent.y);
  for (const seam of generated.pressureSeams ?? [])
    add("pressure-seam", seam.y);
  return placed;
}

describe("zone pages (audit T13b)", () => {
  it("uses the game's band rows", () => {
    for (const world of ["W01", "W02"])
      expect(BAND_ROWS[world]).toEqual(
        Object.fromEntries(
          WORLD_BANDS[world].map((band) => [
            band.id.slice(-1),
            [band.start, band.end],
          ]),
        ),
      );
  });

  it("places shaft and cave frames where the generated worlds draw them", () => {
    const seen = {};
    for (const world of ["W01", "W02"])
      for (const seed of [1, 23, 4242, 90210, 0x5eed]) {
        for (const [frame, bands] of Object.entries(placedBands(world, seed))) {
          for (const band of bands)
            (seen[frame] ??= new Set()).add(`${world}:${band.slice(-1)}`);
          expect(PLACEMENT[frame], frame).toBeDefined();
        }
        // Generator v1 worlds (old saves) place no sites or hazards.
        const legacy = createWorld(world, seed, 1);
        expect(legacy.sites ?? []).toEqual([]);
        expect(legacy.hazards?.coldPockets ?? []).toEqual([]);
        expect(legacy.hazards?.vents ?? []).toEqual([]);
      }
    for (const [frame, spans] of Object.entries(PLACEMENT)) {
      if (frame === "test-raster") continue; // scene.ts TEST_RASTER, row 3
      expect([...(seen[frame] ?? [])].sort(), frame).toEqual(bandsOf(spans));
    }
    expect(bandsOf(PLACEMENT["test-raster"])).toEqual(["W01:A"]);
    // The decisions that follow from it.
    expect(zoneOf("site-wreck")).toBe("core"); // W01 B and C, W02 A and C
    expect(zoneOf("site-survey")).toBe("core");
    expect(zoneOf("cold-pocket")).toBe("core"); // W02 B and C
    expect(zoneOf("pressure-seam")).toBe("cave");
    expect(zoneOf("site-geode")).toBe("cave");
    expect(zoneOf("ice-vent")).toBe("cave");
    expect(zoneOf("test-raster")).toBe("shaft");
  });

  it("gives every frame the runtime draws exactly one zone", () => {
    for (const [world, frames] of Object.entries(worlds)) {
      const manifest = manifests[world];
      for (const frame of frames) {
        const reason = excludedReason(frame.name);
        const zone = zoneOf(frame.name);
        expect(reason === null, frame.name).toBe(zone !== null);
        if (zone) {
          expect(ZONE_NAMES).toContain(zone);
          expect(manifest.frames[frame.name]).toBe(zone);
        } else expect(manifest.excluded[reason]).toContain(frame.name);
        for (const density of DENSITIES) {
          const pages = manifest.pages.filter(
            (page) =>
              page.density === density && page.frames.includes(frame.name),
          );
          const needed = zone !== null && densitiesOf(frame).includes(density);
          expect(pages.length, `${world} ${frame.name} @${density}x`).toBe(
            needed ? 1 : 0,
          );
          if (needed) expect(pages[0].zone).toBe(zone);
        }
      }
    }
    expect(() => zoneOf("new-prop")).toThrow(/no zone/);
  });

  it("puts an -emissive sibling in its base's zone and on its base's page", () => {
    for (const frames of Object.values(worlds))
      for (const { name } of frames) {
        const sibling = `${name}-emissive`;
        expect(excludedReason(sibling)).toBe(excludedReason(name));
        if (excludedReason(name)) continue;
        expect(zoneOf(sibling)).toBe(zoneOf(name));
        expect(isHero(sibling)).toBe(isHero(name));
        expect(pageSet(sibling)).toBe(pageSet(name));
      }
    const beacon = worlds.W01.find((frame) => frame.name === "mission-beacon");
    const groups = pageGroups("W01", [
      ...worlds.W01,
      { ...beacon, name: "mission-beacon-emissive" },
    ]);
    for (const density of DENSITIES) {
      const owners = groups.filter(
        (group) =>
          group.density === density &&
          (group.frames.includes("mission-beacon") ||
            group.frames.includes("mission-beacon-emissive")),
      );
      expect(owners).toHaveLength(1);
      expect(owners[0].frames).toContain("mission-beacon-emissive");
    }
  });

  it("gives @4x pages to the rig, ore and hero props only", () => {
    for (const name of [
      "rig-body-0",
      "rig-cabin",
      "rig-drill-left-7",
      "rig-engine-2",
      "rig-drill-collar-down-2",
      "tool-thermal",
      "thrust-5",
      "ore-o4",
      "package-o1",
      "relic",
      "deposit-socket",
      "tier-mark-hc-3",
      "mission-beacon",
      "site-wreck",
      "dock-stage-2",
    ])
      expect(isHero(name), name).toBe(true);
    for (const name of [
      "mission-valve",
      "mission-sample",
      "crack-1",
      "sky-body",
      "refuge-stage-1",
      "relay-stage-2",
      "site-geode",
      "site-survey",
      "surface-salvage",
      "warning-shelf",
      "ui-mission",
      "cold-pocket",
      "ice-vent",
      "test-raster",
    ])
      expect(isHero(name), name).toBe(false);
    for (const [world, manifest] of Object.entries(manifests)) {
      const fourX = manifest.pages.filter((page) => page.density === 4);
      expect(fourX.length, world).toBeGreaterThan(0);
      for (const page of fourX)
        for (const name of page.frames)
          expect(HERO.test(name), name).toBe(true);
    }
    // A raster-source frame has no @4x master (D5).
    const raster = worlds.W01.find((frame) => frame.source === "raster");
    expect(densitiesOf(raster)).toEqual([2, 3]);
    expect(densitiesOf({ name: "ore-o1", source: "raster" })).toEqual([2, 3]);
  });

  it("drops terrain by exact name, so the W02 ice vent is drawn", () => {
    for (const name of [
      "soil-7",
      "soil-edge-15",
      "stone-3",
      "stone-edge-1",
      "bedrock-0",
      "bedrock-edge-15",
      "ice-0",
      "ice-edge-3",
      "frozen-rock-2",
      "frozen-rock-edge-0",
    ])
      expect(TERRAIN.test(name), name).toBe(true);
    expect(TERRAIN.test("ice-vent")).toBe(false);
    expect(excludedReason("ice-vent")).toBeNull();
    for (const density of [2, 3])
      expect(
        manifests.W02.pages.some(
          (page) =>
            page.zone === "cave" &&
            page.density === density &&
            page.frames.includes("ice-vent"),
        ),
      ).toBe(true);
    // The DOM HUD's icons stay off the pages; the field-log marker does not.
    expect(excludedReason("ui-warning")).toBe("dom");
    expect(excludedReason("icon-drill")).toBe("dom");
    expect(excludedReason("world-w02")).toBe("dom");
    expect(zoneOf("ui-mission")).toBe("core");
  });

  it("keeps every page within 2048 × 1024 under a world texture key", () => {
    for (const [world, manifest] of Object.entries(manifests)) {
      expect(manifest.pageLimit).toEqual(PAGE_LIMIT);
      expect(PAGE_LIMIT).toEqual({ width: 2048, height: 1024 });
      for (const page of manifest.pages) {
        const png = readFileSync(
          new URL(
            `../assets/campaign/generated/${page.image}`,
            import.meta.url,
          ),
        );
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
          page.width,
          page.height,
        ]);
        expect(page.width).toBeLessThanOrEqual(2048);
        expect(page.height).toBeLessThanOrEqual(1024);
        expect(page.bytes).toBe(page.width * page.height * 4);
        expect(page.key.startsWith(`campaign-${world.toLowerCase()}`)).toBe(
          true,
        );
        expect(page.key.endsWith("-wall")).toBe(false);
      }
      // One lander stage per page: only the current stage is resident.
      for (const page of manifest.pages.filter(
        (page) => page.stage !== undefined,
      ))
        expect(page.frames).toEqual([`dock-stage-${page.stage}`]);
    }
  });

  it("leaves out only frames the game never draws", () => {
    const scene = readFileSync(
      new URL("../src/campaign/scene.ts", import.meta.url),
      "utf8",
    );
    const types = readFileSync(
      new URL("../src/campaign/types.ts", import.meta.url),
      "utf8",
    );
    // If these draws change, revisit UNUSED in scripts/campaign-zones.mjs.
    expect(scene).toMatch(
      /if \(stage >= 1 && !icy\)\s+this\.image\(\s+`refuge-stage-\$\{Math\.min\(2, stage\)\}`/,
    );
    expect(scene).toMatch(
      /if \(stage >= 2 && !icy\)\s+this\.image\(\s+`relay-stage-\$\{Math\.min\(2, stage - 1\)\}`/,
    );
    expect(scene).toMatch(/`site-\$\{site\.kind\}`/);
    expect(types).toMatch(
      /kind: "wreck" \| "geode" \| "cache" \| "survey" \| "mission";/,
    );
    expect([...UNUSED].sort()).toEqual([
      "refuge-stage-0",
      "relay-stage-0",
      "site-antenna",
      "site-beacon",
    ]);
    // Every frame name the runtime code spells out is on a zone page.
    const names = new Set(
      Object.values(worlds).flatMap((frames) => frames.map((f) => f.name)),
    );
    const sources = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir));
        else if (entry.name.endsWith(".ts"))
          sources.push(readFileSync(new URL(entry.name, dir), "utf8"));
    };
    walk(new URL("../src/campaign/", import.meta.url));
    const spelled = new Set();
    for (const text of sources)
      for (const [, literal] of text.matchAll(/["'`]([a-z0-9-]+)["'`]/g))
        if (names.has(literal)) spelled.add(literal);
    expect(spelled.size).toBeGreaterThan(20);
    for (const name of spelled)
      expect(
        excludedReason(name),
        `${name} is drawn but off the pages`,
      ).toBeNull();
  });
});
