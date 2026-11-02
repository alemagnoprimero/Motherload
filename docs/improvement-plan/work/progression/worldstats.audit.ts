// Static economy of generated worlds: ore value/density by depth, relics, totals.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01, createW02 } from "/home/user/Motherload/src/campaign/world.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";

function stats(make: (seed: number) => ReturnType<typeof createW01>, bandRows: number, seeds: number) {
  const bands: Record<string, { cells: number; deposits: number; value: number; byItem: Record<string, number>; rock: number; open: number }> = {};
  let totals = { deposits: 0, ordinaryValue: 0, relics: 0, relicValue: 0, worlds: 0, relicRows: [] as number[], noRelic: 0 };
  for (let seed = 0; seed < seeds; seed++) {
    const w = make(seed * 101 + 7);
    totals.worlds++;
    let relics = 0;
    for (let r = 0; r < w.rows; r++) {
      const band = `${Math.floor(r / bandRows) * bandRows * 10}-${(Math.floor(r / bandRows) + 1) * bandRows * 10} m`;
      const b = (bands[band] ??= { cells: 0, deposits: 0, value: 0, byItem: {}, rock: 0, open: 0 });
      for (let c = 0; c < w.width; c++) {
        b.cells++;
        const t = w.tiles[r * w.width + c]!;
        if (t === 2) b.rock++;
        if (t === 0) b.open++;
      }
    }
    for (const p of w.packages) {
      const r = Math.floor(p.y);
      const band = `${Math.floor(r / bandRows) * bandRows * 10}-${(Math.floor(r / bandRows) + 1) * bandRows * 10} m`;
      const b = bands[band]!;
      if (p.tags.includes("relic")) {
        relics++;
        totals.relics++;
        totals.relicValue += p.value / 10;
        totals.relicRows.push(r);
        continue;
      }
      b.deposits++;
      b.value += p.value / 10;
      b.byItem[p.name] = (b.byItem[p.name] ?? 0) + 1;
      totals.deposits++;
      totals.ordinaryValue += p.value / 10;
    }
    if (!relics) totals.noRelic++;
  }
  const table = Object.entries(bands).map(([band, b]) => ({
    band,
    densityPct: +((100 * b.deposits) / b.cells).toFixed(2),
    meanValue: +(b.value / Math.max(1, b.deposits)).toFixed(1),
    valuePerCell: +(b.value / b.cells).toFixed(2),
    rockPct: +((100 * b.rock) / b.cells).toFixed(1),
    openPct: +((100 * b.open) / b.cells).toFixed(1),
    mix: Object.fromEntries(Object.entries(b.byItem).map(([k, v]) => [k, +((100 * v) / b.deposits).toFixed(1)])),
  }));
  return {
    perWorld: {
      deposits: totals.deposits / totals.worlds,
      ordinaryValue: totals.ordinaryValue / totals.worlds,
      relicsMean: totals.relics / totals.worlds,
      relicValueMean: totals.relicValue / totals.worlds,
      noRelicPct: (100 * totals.noRelic) / totals.worlds,
    },
    table,
  };
}

it("world economy tables", () => {
  writeFileSync(
    OUT + "/worldstats.json",
    JSON.stringify({ W01: stats(createW01, 10, 50), W02: stats(createW02 as typeof createW01, 10, 50) }, null, 1),
  );
});
