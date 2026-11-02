// Critique (player lens): does "depth pays" have to make the shallow first hour poorer?
// Compares, on the audit's own pacing harness (copied sim.ts, real Campaign model):
//   current  = createW01 (today)
//   steep    = the plan's A1 prototype (createW01Steep: moves value deeper, thins 0-200 m)
//   additive = today's world + extra deep deposits below 300 m (shallow untouched)
// Measures value per cell by band, mine-only income (base and all rank 1) and
// W01 campaign pacing with the A3 plate gate under pinned and moderately raised fees.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, PLANS, type Policy } from "./sim.ts";
import { createW01Steep } from "./world-variant-steep.ts";
import { createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { createW01 } from "/home/user/Motherload/src/campaign/world.ts";
import { BALANCE_VERSION, W01, W01_ORES, W01_MILESTONES } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignWorld, HardwareKey } from "/home/user/Motherload/src/campaign/types.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/critique-player";
const SEEDS = [1, 8, 15, 22, 29, 36];

// Extra deep deposits per 100 m band (rows 30-39, 40-49, 50-59): [Bronzium, Silverium, Goldium]
const EXTRA: Record<number, [number, number, number]> = { 3: [8, 6, 2], 4: [8, 8, 4], 5: [12, 12, 6] };
export function createW01Additive(seed: number): CampaignWorld {
  const world = createW01(seed);
  let state = (seed * 2654435761 + 97) >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const width = world.width;
  const occupied = new Set(world.packages.map((p) => Math.floor(p.y) * width + Math.floor(p.x)));
  for (const m of world.missions) occupied.add(Math.floor(m.y) * width + Math.floor(m.x));
  for (const s of world.shelves) occupied.add(Math.floor(s.y) * width + Math.floor(s.x));
  for (const [bandText, counts] of Object.entries(EXTRA)) {
    const band = Number(bandText);
    const cells: number[] = [];
    for (let row = band * 10; row < band * 10 + 10 && row < world.rows - 1; row++)
      for (let column = 0; column < width; column++) {
        const index = row * width + column;
        if (world.tiles[index] !== 0 && !occupied.has(index)) cells.push(index);
      }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }
    counts.forEach((count, k) => {
      const ore = W01_ORES[k + 1]!;
      for (let n = 0; n < count; n++) {
        const index = cells.pop()!;
        occupied.add(index);
        const column = index % width, row = Math.floor(index / width);
        world.packages.push({
          id: `W01:deposit:${row}:${column}`, itemId: ore.id, name: ore.name, origin: "W01",
          balanceVersion: BALANCE_VERSION, value: ore.value, bulk: ore.bulk, mass: ore.mass,
          tags: [...ore.tags], x: column + 0.5, y: row + 0.5, status: "deposit", processedBy: [],
        });
      }
    });
  }
  return world;
}

const VARIANTS: Record<string, (seed: number) => CampaignWorld> = {
  current: createW01,
  steep: createW01Steep,
  additive: createW01Additive,
};

it("value per cell by 100 m band (50 seeds)", () => {
  const out: Record<string, unknown> = {};
  for (const [name, make] of Object.entries(VARIANTS)) {
    const bands = Array.from({ length: 6 }, () => ({ value: 0, cells: 0 }));
    let total = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const w = make(seed);
      for (let b = 0; b < 6; b++) bands[b]!.cells += 400;
      for (const p of w.packages) {
        if (!p.tags.includes("ordinary")) continue;
        bands[Math.min(5, Math.floor(Math.floor(p.y) / 10))]!.value += p.value / 10;
        total += p.value / 10;
      }
    }
    out[name] = {
      valuePerCell: bands.map((b) => +(b.value / b.cells).toFixed(2)),
      meanWorldValue: Math.round(total / 50),
    };
  }
  writeFileSync(OUT + "/additive-worldstats.json", JSON.stringify(out, null, 1));
});

const base: Omit<Policy, "name" | "plan" | "missionMode"> = { reserveFraction: 0.25, reserveMin: 1, volatileSuccess: 0.85, dockOverhead: 20, precision: true, moveOverhead: 0 };
const novice: Omit<Policy, "name" | "plan" | "missionMode"> = { reserveFraction: 0.35, reserveMin: 1, volatileSuccess: 0.5, dockOverhead: 40, precision: true, moveOverhead: 0.35 };

function mineFor(sim: Sim, seconds: number) {
  const g = sim.game;
  const start = sim.t, startIncome = sim.s.stats.ordinaryIncome;
  let trips = 0;
  while (sim.t - start < seconds && trips < 400) {
    sim.trip("mine"); g.bank(); g.sell(); g.refuel(); g.repair(); trips++;
  }
  return +((sim.s.stats.ordinaryIncome - startIncome) / 10 / ((sim.t - start) / 60)).toFixed(1);
}

it("mine-only income, 15 min x 6 seeds", () => {
  const out: unknown[] = [];
  const pol: Policy = { ...base, name: "mine-only", missionMode: "fixed", plan: { W01: [], W02: [] } };
  const loadouts: [string, Partial<Record<HardwareKey, number>>][] = [
    ["base", {}],
    ["+energy1", { energy: 1 }],
    ["+drill1", { drill: 1 }],
    ["all rank 1", { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 }],
  ];
  for (const [name, make] of Object.entries(VARIANTS))
    for (const [label, hw] of loadouts)
      for (const seed of SEEDS) {
        const s = createCampaign(seed);
        s.worlds.W01 = make(seed);
        s.progress.beacon = true; s.progress.bankedOre = 3; s.progress.completed = [1, 2]; s.credits = 100000;
        Object.assign(s.hardware, hw);
        s.vehicle.energy = [10, 16][s.hardware.energy]!;
        const sim = new Sim(pol, seed, s);
        const income = mineFor(sim, 15 * 60);
        const depths = sim.trips.map((t) => t.maxDepth).sort((a, b) => a - b);
        out.push({ variant: name, label, seed, incomePerMin: income, medianTripDepth: depths[Math.floor(depths.length / 2)] });
      }
  writeFileSync(OUT + "/additive-marginal.json", JSON.stringify(out));
}, 1800000);

it("W01 campaign pacing with the plate gate", () => {
  const fees = W01_MILESTONES as unknown as { fee: number }[];
  const ORIGINAL = fees.map((m) => m.fee);
  const out: unknown[] = [];
  for (const [variant, make] of [["steep", createW01Steep], ["additive", createW01Additive]] as const)
    for (const [feeLabel, feeSet] of [["pinned 200/300/500", ORIGINAL], ["moderate 200/600/1000", [2000, 6000, 10000]], ["plan 200/900/1600", [2000, 9000, 16000]]] as const)
      for (const [pname, pol] of [
        ["skilled-balanced", { ...base, name: "b", missionMode: "balanced" as const, plan: PLANS.gateAware }],
        ["novice-completionist", { ...novice, name: "n", missionMode: "completionist" as const, plan: PLANS.cheap }],
      ] as const)
        for (const seed of SEEDS) {
          fees.forEach((m, i) => (m.fee = feeSet[i]!));
          Sim.plateGate = { rows: [30, 31], minDrillRank: 1 };
          const s = createCampaign(seed);
          s.worlds.W01 = make(seed);
          const sim = new Sim(pol as Policy, seed, s);
          const ok = sim.runWorld(4 * 3600);
          const ev = (what: string) => sim.events.find((e) => e.what === what)?.t;
          const gains = [0, ...sim.events.filter((e) => e.what.startsWith("buy") || /^M\d$/.test(e.what)).map((e) => e.t)];
          const income15 = (() => {
            // ordinary income banked during minutes 2-15 is not tracked per time by Sim; use credits events as proxy
            const e15 = sim.events.filter((e) => e.t <= 900);
            return e15.length ? e15[e15.length - 1]!.credits : null;
          })();
          out.push({ variant, fees: feeLabel, policy: pname, seed, ok, M1: ev("M1"), M2: ev("M2"), M3: ev("M3"), maxGap: Math.max(...gains.slice(1).map((t, i) => t - gains[i]!)), hw: Object.values(sim.s.hardware).join(""), creditsAt15min: income15 });
        }
  fees.forEach((m, i) => (m.fee = ORIGINAL[i]!));
  Sim.plateGate = null;
  writeFileSync(OUT + "/additive-campaign.json", JSON.stringify(out));
}, 3600000);
