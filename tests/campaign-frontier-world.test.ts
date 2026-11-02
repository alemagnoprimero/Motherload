import { describe, expect, it } from "vitest";
import source from "../design/v0.1/motherload-balance-v01.json";
import overlay from "../design/v0.3/balance-overlay.json";
import { W02, W02_GEAR, W02_ORES } from "../src/campaign/frontier";
import { createW02 } from "../src/campaign/world";

describe("Ice comet definitions and generation", () => {
  it("keeps W02 contracts aligned with the versioned design overlay", () => {
    const definition = source.worlds.find((world) => world.id === "W02")!;
    expect([W02.width, W02.rows, 1]).toEqual(definition.size);
    expect(W02.depth).toBe(definition.depth);
    expect(W02.budget).toBe(
      definition.budget.budget * 10 -
        definition.prices[1]! * 10 +
        overlay.worlds.W02.gear["W02-R2"].price * 10,
    );
    expect(W02.minOrdinary).toBe(W02.budget * 3);
    expect(W02_GEAR.map((gear) => gear.price)).toEqual(
      definition.prices.map((price, index) =>
        index === 1 ? overlay.worlds.W02.gear["W02-R2"].price * 10 : price * 10,
      ),
    );
    expect(
      W02_ORES.map(({ value, weight, bulk, mass }) => [
        value,
        weight,
        bulk,
        mass,
      ]),
    ).toEqual(
      definition.ores.map(({ value, weight, bulk, mass }, index) => [
        value * 10,
        weight,
        overlay.worlds.W02.ore_bulk[index] ?? bulk,
        mass,
      ]),
    );
  });

  it("reproduces the same instance from a seed and varies ordinary geography", () => {
    expect(createW02(193)).toEqual(createW02(193));
    expect(createW02(193).tiles).not.toEqual(createW02(194).tiles);
    expect(createW02(193).packages).not.toEqual(createW02(194).packages);
  });

  it("provides budget, entry income and an unexcavated tool-free mission route across 100 seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const world = createW02(seed);
      const ordinary = world.packages.filter((item) =>
        item.tags.includes("ordinary"),
      );
      const sum = ordinary.reduce((value, item) => value + item.value, 0);
      expect(sum, `seed ${seed} post-carving budget`).toBeGreaterThanOrEqual(
        W02.minOrdinary,
      );
      const entry = ordinary.filter(
        (item) => item.y < 10 && [24.5, 25.5].includes(item.x),
      );
      expect(entry).toHaveLength(20);
      expect(entry.reduce((value, item) => value + item.value, 0)).toBe(18400);
      expect(entry.every((item) => !item.tags.includes("volatile"))).toBe(true);
      expect(
        entry.reduce((value, item) => value + item.value, 0) -
          W02_GEAR[0]!.price,
      ).toBeGreaterThanOrEqual(2000);

      // Flood the cells that a stock drill can actually remove; avoid counting
      // hard rock as proof that a mandatory corridor is usable at entry rank.
      const reachable = new Set<number>();
      const queue = [Math.floor(W02.spawnX)];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor]!;
        if (reachable.has(index) || world.tiles[index] === 2) continue;
        reachable.add(index);
        const column = index % world.width;
        const row = Math.floor(index / world.width);
        for (const [x, y] of [
          [column - 1, row],
          [column + 1, row],
          [column, row - 1],
          [column, row + 1],
        ]) {
          if (y! < 0 || y! >= world.rows) continue;
          const next =
            y! * world.width +
            (((x! % world.width) + world.width) % world.width);
          if (!reachable.has(next) && world.tiles[next] !== 2) queue.push(next);
        }
      }
      for (const mission of world.missions) {
        const index =
          Math.floor(mission.y) * world.width + Math.floor(mission.x);
        expect(
          world.tiles[index],
          `seed ${seed}: ${mission.id} remains buried`,
        ).toBe(1);
        expect(
          reachable.has(index),
          `seed ${seed}: ${mission.id} reachable`,
        ).toBe(true);
      }
      for (let row = 0; row < W02.rows; row++)
        expect(world.tiles[row * W02.width + 24]).toBe(1);
    }
  });

  // This checks 60,000 deposit records, not a frame-time budget. Allow shared
  // CI hosts enough time without reducing seed or assertion coverage.
  it("retains exact ordinary rarity, deeper rewards, unique identities and valid source cells across 100 seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const world = createW02(seed);
      expect(world.tiles).toHaveLength(48 * 100);
      expect(world.discovered).toEqual(Array(48 * 100).fill(0));
      const ordinary = world.packages.filter((item) =>
        item.tags.includes("ordinary"),
      );
      for (const ore of W02_ORES)
        expect(
          ordinary.filter((item) => item.itemId === ore.id).length /
            ordinary.length,
        ).toBe(ore.weight / 100);
      expect(
        ordinary
          .filter((item) => item.itemId === "W02-O4")
          .every((item) => item.y >= 64.5),
      ).toBe(true);
      expect(
        ordinary
          .filter((item) => item.itemId === "W02-O3")
          .every((item) => item.y >= 24.5),
      ).toBe(true);
      const identities = [...world.packages, ...world.missions].map(
        (item) => item.id,
      );
      expect(new Set(identities).size).toBe(identities.length);
      const cells = [...world.packages, ...world.missions].map(
        (item) => Math.floor(item.y) * world.width + Math.floor(item.x),
      );
      expect(new Set(cells).size).toBe(cells.length);
      for (const item of world.packages) {
        expect(item.x).toBeGreaterThan(0);
        expect(item.x).toBeLessThan(48);
        expect(item.y).toBeGreaterThan(0);
        expect(item.y).toBeLessThan(100);
        expect(
          world.tiles[Math.floor(item.y) * world.width + Math.floor(item.x)],
        ).not.toBe(0);
        expect(item.origin).toBe("W02");
        expect(item.status).toBe("deposit");
        expect(item.processedBy).toEqual([]);
      }
    }
  }, 15000);

  it("guarantees mission samples, a safe volatile tutorial and surplus deep proof sources", () => {
    for (let seed = 0; seed < 100; seed++) {
      const world = createW02(seed);
      const samples = world.missions.filter((item) =>
        item.id.startsWith("W02-SAMPLE-"),
      );
      expect(samples).toHaveLength(5);
      expect(samples.map((item) => item.y)).toEqual(Array(5).fill(14.5));
      expect(world.missions.find((item) => item.id === "W02-Q")).toMatchObject({
        x: 24.5,
        y: 99.5,
        status: "source",
      });
      const tutorial = world.packages.find(
        (item) => item.id === "W02:deposit:24:24",
      )!;
      expect(tutorial.tags).toContain("volatile");
      expect(tutorial.tags).not.toContain("cryosample");
      const proof = world.packages.filter((item) =>
        item.tags.includes("cryosample"),
      );
      expect(proof.length).toBeGreaterThan(8);
      expect(
        proof.filter(
          (item) =>
            [44.5, 45.5].includes(item.y) && item.x >= 22.5 && item.x <= 25.5,
        ),
      ).toHaveLength(8);
      expect(
        proof.every(
          (item) =>
            item.itemId === "W02-O3" && item.y >= 44.5 && item.value === 3000,
        ),
      ).toBe(true);
      for (const hazard of [
        ...world.hazards!.coldPockets,
        ...world.hazards!.vents,
      ]) {
        expect(hazard.x < 20 || hazard.x > 29).toBe(true);
        expect(
          world.tiles[
            Math.floor(hazard.y) * world.width + Math.floor(hazard.x)
          ],
        ).toBe(0);
      }
    }
  });
});
