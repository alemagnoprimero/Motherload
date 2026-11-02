import { describe, expect, it } from "vitest";
import {
  createW01,
  createW02,
  createW01V1,
  createW02V1,
} from "../src/campaign/world";
import { measureWorld } from "../src/campaign/world-metrics";

describe("versioned staged world generation", () => {
  it("retains generator v1 independently of current balance data", async () => {
    const checks: Record<string, string> = {};
    for (const seed of [0, 739, 0xffffffff]) {
      for (const [id, legacy, current] of [
        ["W01", createW01V1, createW01],
        ["W02", createW02V1, createW02],
      ] as const) {
        const world = legacy(seed);
        expect(current(seed, 1)).toEqual(world);
        expect(
          world.packages.every((item) => item.balanceVersion === "0.1"),
        ).toBe(true);
        checks[`${id}:${seed}`] = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(JSON.stringify(world)),
            ),
          ),
        )
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
    }
    expect(checks).toEqual({
      "W01:0":
        "160257e461eed63f62979c8f2955dd582673675ab0ce2d1dfc26d4ea64d38ae3",
      "W02:0":
        "734fe76f70d8c836f4921788fa5b0942f9597ae510530c48be1ab73228275d54",
      "W01:739":
        "2df3a42ee1d8f8eb1985a66fa3c1e38a9e635e19ed0d809cb392e625d49becca",
      "W02:739":
        "f48ab175338113d7f2ecf19f1ff7c0959f04b644dc01336fd05d0771b4125b6c",
      "W01:4294967295":
        "96219546412ce1929470dab2b8879ee5e5accec31eb923bb7adcecf61f10f6d3",
      "W02:4294967295":
        "d8ea97d065c1936c1bc233fb8afc98e756a1e53c0b385b0fadf3d2488bf43337",
    });
  });

  it("keeps every plate closed and all world/content contracts over 200 seeds", () => {
    let deepValue = 0,
      shallowValue = 0;
    const totals = {
      W01: { caves: 0, relics: 0, minFeatures: 99, maxGap: 0 },
      W02: { caves: 0, relics: 0, minFeatures: 99, maxGap: 0 },
    };
    for (let seed = 0; seed < 200; seed++) {
      for (const id of ["W01", "W02"] as const) {
        const world = id === "W01" ? createW01(seed) : createW02(seed);
        const metrics = measureWorld(world);
        const total = totals[id];
        expect(world.generatorVersion).toBe(2);
        expect(world.balanceVersion).toBe(id === "W01" ? "0.2" : "0.3");
        expect(metrics.ordinaryCount).toBe(id === "W01" ? 400 : 600);
        expect(metrics.ordinaryValue).toBe(id === "W01" ? 190000 : 630000);
        expect(
          metrics.routeFeatureBands,
          `${id} seed ${seed} route`,
        ).toBeGreaterThanOrEqual(id === "W01" ? 7 : 12);
        expect(metrics.longestOreGap).toBeLessThanOrEqual(60);
        expect(
          metrics.signatures.every((band) => band.present),
          `${id} seed ${seed} signatures`,
        ).toBe(true);
        expect(world.sites!.length).toBeGreaterThanOrEqual(
          id === "W01" ? 4 : 6,
        );
        expect(world.fieldLogs).toHaveLength(8);
        expect(
          world.sites!.filter((site) => site.kind === "cache"),
        ).toHaveLength(1);
        expect(
          world.sites!.filter((site) => site.kind === "cache")[0]!.tool,
        ).toBe(id === "W01" ? "W02-R1" : "W02-R3");
        expect(
          world.fieldLogs!.every((log) => !log.read && log.text.length > 50),
        ).toBe(true);
        expect(world.pressureSeams!.length).toBeGreaterThan(0);
        for (const seam of world.pressureSeams!) {
          expect(seam.y).toBeGreaterThanOrEqual(id === "W01" ? 45 : 75);
          expect(
            Math.abs(seam.x - (id === "W01" ? 20.5 : 24.5)),
          ).toBeGreaterThan(1);
          expect(
            world.missions.some(
              (mission) => mission.x === seam.x && mission.y === seam.y,
            ),
          ).toBe(false);
        }
        const relics = world.packages.filter((item) =>
          item.tags.includes("relic"),
        );
        expect(relics).toHaveLength(1);
        expect(relics[0]!.y).toBeGreaterThan((world.rows * 2) / 3);
        expect(relics[0]!.relicId).toBe(`${id}-J1`);
        expect(
          world.sites!.every(
            (site) =>
              site.x > 0 &&
              site.x < world.width &&
              site.y > 0 &&
              site.y < world.rows,
          ),
        ).toBe(true);
        if (metrics.largestCave >= 40) total.caves++;
        if (metrics.relicVisibleFromRoute) total.relics++;
        total.minFeatures = Math.min(
          total.minFeatures,
          metrics.routeFeatureBands,
        );
        total.maxGap = Math.max(total.maxGap, metrics.longestOreGap);
        if (id === "W01") {
          for (const row of [30, 31])
            expect(
              world.tiles.slice(row * world.width, (row + 1) * world.width),
            ).toEqual(Array(world.width).fill(4));
          expect(
            world.shelves.every((shelf) => shelf.y < 28 || shelf.y > 32),
          ).toBe(true);
          deepValue += metrics.depthValue[5]!.valuePerCell;
          shallowValue += metrics.depthValue[1]!.valuePerCell;
        } else {
          expect(
            world.packages
              .filter((item) => ["W02-O1", "W02-O2"].includes(item.itemId))
              .every((item) => item.bulk === 1),
          ).toBe(true);
        }
      }
    }
    expect(deepValue / shallowValue).toBeGreaterThanOrEqual(2);
    expect(totals.W01.caves).toBeGreaterThanOrEqual(180);
    expect(totals.W01.relics).toBeGreaterThanOrEqual(120);
    expect(totals.W02.relics).toBeGreaterThanOrEqual(120);
    console.info(
      "WORLD_METRICS",
      JSON.stringify({ ...totals, deepRewardRatio: deepValue / shallowValue }),
    );
  }, 30000);

  it("varies hazard geography with the seed without moving hazards onto the route", () => {
    expect(createW02(19).hazards).not.toEqual(createW02(20).hazards);
    expect(createW01(19).shelves).not.toEqual(createW01(20).shelves);
    expect(createW01(19).pressureSeams).not.toEqual(
      createW01(20).pressureSeams,
    );
  });
});
