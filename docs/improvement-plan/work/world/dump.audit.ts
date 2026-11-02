// Dumps generated worlds (tiles, packages, missions, shelves) for map rendering,
// plus a 200-seed air-frequency grid. Read-only with respect to the repository.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01, createW02 } from "/home/user/Motherload/src/campaign/world.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/world/out";

it("dump worlds", () => {
  const pick = (w: ReturnType<typeof createW01>) => ({
    id: w.id,
    seed: w.seed,
    width: w.width,
    rows: w.rows,
    tiles: w.tiles,
    packages: w.packages.map((p) => ({ itemId: p.itemId, x: p.x, y: p.y, tags: p.tags })),
    missions: w.missions,
    shelves: w.shelves,
  });
  const worlds = [
    ...[73021, 11, 12].map((s) => pick(createW01(s))),
    ...[73021, 11, 12].map((s) => pick(createW02(s))),
  ];
  const freq: Record<string, number[]> = {};
  for (const [id, make, cells] of [
    ["W01", createW01, 2400],
    ["W02", createW02, 4800],
  ] as const) {
    const f = new Array(cells).fill(0);
    for (let s = 1; s <= 200; s++) {
      const w = make(s);
      w.tiles.forEach((t, k) => {
        if (t === 0) f[k]++;
      });
    }
    freq[id] = f;
  }
  writeFileSync(`${OUT}/worlds-dump.json`, JSON.stringify({ worlds, freq }));
});
