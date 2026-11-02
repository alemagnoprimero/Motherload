// Fact-check sims for the improvement plan. Read-only use of the game modules.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  Campaign,
  createCampaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import { createW01, createW02 } from "/home/user/Motherload/src/campaign/world.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/critique-facts/facts-results.json";
const dt = 1 / 60;
const SURFACE = -0.36;
const r2 = (x: number) => Math.round(x * 100) / 100;
const results: Record<string, unknown> = {};

function holdDown(seed: number, startEnergy?: number) {
  const g = new Campaign(createCampaign(seed));
  if (startEnergy !== undefined) g.state.vehicle.energy = startEnergy;
  let t = 0;
  let firstOre: number | undefined;
  let warn25: number | undefined;
  const max = g.maxEnergy;
  while (g.state.vehicle.energy > 0 && t < 200) {
    g.tick(dt, { down: true });
    t += dt;
    if (firstOre === undefined && g.cargo.length) firstOre = t;
    if (warn25 === undefined && g.state.vehicle.energy / max <= 0.25) warn25 = t;
  }
  return {
    seed,
    depth: g.depth,
    time: r2(t),
    firstOre: firstOre && r2(firstOre),
    warn25: warn25 && r2(warn25),
    cargo: g.cargo.length,
    cargoValueCR: g.cargoValue / 10,
    credits: g.state.credits / 10,
    game: g,
  };
}

it("hold-Down dive, fresh rig (6 L) and 10 L start", () => {
  const six = [] as any[];
  const ten = [] as any[];
  for (let seed = 1; seed <= 40; seed++) {
    const a = holdDown(seed);
    const preview = a.game.recoveryPreview;
    a.game.recover();
    six.push({
      ...a,
      game: undefined,
      recoveryCostCR: preview.cost / 10,
      creditsAfterRecoveryCR: a.game.state.credits / 10,
      cargoAfterRecovery: a.game.cargo.length,
    });
    const b = holdDown(seed, 10);
    ten.push({ ...b, game: undefined });
  }
  const summarize = (rows: any[]) => ({
    depths: [...new Set(rows.map((r) => r.depth))],
    times: [Math.min(...rows.map((r) => r.time)), Math.max(...rows.map((r) => r.time))],
    firstOre: [...new Set(rows.map((r) => r.firstOre))],
    warn25: [...new Set(rows.map((r) => r.warn25))],
    cargo: [...new Set(rows.map((r) => r.cargo))],
    cargoValueCR: [...new Set(rows.map((r) => r.cargoValueCR))],
    recoveryCostCR: [...new Set(rows.map((r) => r.recoveryCostCR))],
    creditsAfterRecoveryCR: [...new Set(rows.map((r) => r.creditsAfterRecoveryCR))],
    cargoAfterRecovery: [...new Set(rows.map((r) => r.cargoAfterRecovery))],
  });
  results.holdDown6 = summarize(six);
  results.holdDown10 = summarize(ten);
});

it("latest safe turnaround on the hold-Down dive (6 L)", () => {
  // Dive with Down; at time T switch to Up (committed cut finishes first).
  // Find the latest T that still reaches the surface with energy > 0.
  const attempt = (T: number) => {
    const g = new Campaign(createCampaign(7));
    let t = 0;
    while (t < T && g.state.vehicle.energy > 0) {
      g.tick(dt, { down: true });
      t += dt;
    }
    let u = 0;
    while (g.state.vehicle.energy > 0 && g.state.vehicle.y > SURFACE + 1e-3 && u < 60) {
      g.tick(dt, { up: true });
      u += dt;
    }
    return { ok: g.state.vehicle.energy > 0 && g.state.vehicle.y <= SURFACE + 1e-3, depthAtTurn: 0 };
  };
  let last = 0;
  for (let T = 1; T <= 20; T += 0.05) if (attempt(T).ok) last = T;
  const warn = holdDown(7).warn25;
  results.turnaround = { lastSafeTurnSeconds: r2(last), warn25Seconds: warn, gap: r2(last - (warn ?? 0)) };
});

it("relic counts across seeds", () => {
  const count = (fn: (s: number) => any, seeds: number[]) => {
    const hist = [0, 0, 0];
    for (const s of seeds) {
      const w = fn(s);
      hist[w.packages.filter((p: any) => p.tags.includes("relic")).length]!++;
    }
    return { n: seeds.length, none: hist[0], one: hist[1], two: hist[2], noneShare: r2(hist[0]! / seeds.length) };
  };
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // Random 32-bit seeds from a fixed generator
  let s = 123456789;
  const rnd = () => (s = (Math.imul(s ^ (s >>> 15), 2246822507) + 3266489909) >>> 0);
  const random = Array.from({ length: 2000 }, () => rnd());
  results.relics = {
    W01_1_50: count(createW01, range(1, 50)),
    W01_1_200: count(createW01, range(1, 200)),
    W01_0_199: count(createW01, range(0, 199)),
    W01_1_2000: count(createW01, range(1, 2000)),
    W01_random2000: count(createW01, random),
    // campaign seeds: createCampaign(seed) passes seed directly to createW01; W02 uses seed ^ 0x02c0ffee
    W02_1_200: count((x) => createW02((x ^ 0x02c0ffee) >>> 0), range(1, 200)),
    W02_1_2000: count((x) => createW02((x ^ 0x02c0ffee) >>> 0), range(1, 2000)),
  };
});

it("W01 value per cell by 100 m band (50 seeds)", () => {
  const bands = Array.from({ length: 6 }, () => ({ value: 0, cells: 0, deposits: 0 }));
  const totals: number[] = [];
  const counts: string[] = [];
  for (let seed = 1; seed <= 50; seed++) {
    const w = createW01(seed);
    for (let row = 0; row < w.rows; row++) bands[Math.floor(row / 10)]!.cells += w.width;
    let total = 0;
    const byType: Record<string, number> = {};
    for (const p of w.packages) {
      if (!p.tags.includes("ordinary")) continue;
      const band = bands[Math.floor(Math.floor(p.y) / 10)]!;
      band.value += p.value / 10;
      band.deposits++;
      total += p.value / 10;
      byType[p.itemId] = (byType[p.itemId] ?? 0) + 1;
    }
    totals.push(total);
    counts.push(JSON.stringify(byType));
  }
  results.valuePerCell = bands.map((b, i) => ({
    band: `${i * 100}-${(i + 1) * 100} m`,
    valuePerCell: r2(b.value / b.cells),
    density: r2(b.deposits / b.cells),
    meanValue: r2(b.value / b.deposits),
  }));
  results.totalOrdinaryCR = [Math.min(...totals), Math.max(...totals)];
  results.typeCounts = [...new Set(counts)];
  results.cutTimeRatioRow59 = r2(1 + 59 / 80);
});

it("fall damage with engine rank 0/1/2 in W01", () => {
  const rows: any[] = [];
  for (const engine of [0, 1, 2])
    for (const drop of [10, 14, 15, 16, 17, 20, 30]) {
      const g = new Campaign(createCampaign(3));
      g.state.hardware.engine = engine;
      // open a shaft in column 20 from row 0 to drop-1; rig stands at surface over it
      for (let row = 0; row < drop; row++) g.world.tiles[row * W01.width + 20] = 0;
      g.state.vehicle = { x: 20.5, y: SURFACE + 0.02, energy: 10, hull: 10 };
      let t = 0;
      let vmax = 0;
      while (t < 10) {
        g.tick(dt, {});
        vmax = Math.max(vmax, g.velocityY);
        t += dt;
        if (g.grounded && Math.abs(g.velocityY) < 1e-6 && t > 0.5) break;
      }
      rows.push({ engine, drop, hull: r2(g.state.vehicle.hull), vmax: r2(vmax), message: g.message });
    }
  results.fallDamage = rows;
});

it("depth readout for plate rows 30-31 and mission rows", () => {
  const g = new Campaign(createCampaign(5));
  const readings: Record<string, number> = {};
  for (const row of [9, 24, 29, 30, 31, 32, 39, 59]) {
    g.state.vehicle.y = row + 1 - 0.36; // standing on the floor of row `row` cell (bottom of cell)
    readings[`row${row}-bottom`] = g.depth;
    g.state.vehicle.y = row + 0.5;
    readings[`row${row}-centre`] = g.depth;
  }
  results.depthReadout = readings;
});

it("write", () => {
  writeFileSync(OUT, JSON.stringify(results, null, 1));
});
