// Evaluate PROG-P1 (depth-stratified W01 ore) and PROG-P2 (drill-gated plate stratum) in the same harness.
import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, PLANS, type Policy } from "./sim.ts";
import { createW01Stratified } from "./world-variant.ts";
import { createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import type { HardwareKey } from "/home/user/Motherload/src/campaign/types.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";

it("variant generator keeps the pinned mix, budget floors and mission cells (100 seeds)", () => {
  const bands: Record<number, { cells: number; deposits: number; value: number }> = {};
  for (let seed = 1; seed <= 100; seed++) {
    const w = createW01Stratified(seed);
    const ordinary = w.packages.filter((p) => p.tags.includes("ordinary"));
    expect(ordinary.length).toBe(400);
    const count = (id: string) => ordinary.filter((p) => p.itemId === id).length;
    expect([count("W01-O1"), count("W01-O2"), count("W01-O3"), count("W01-O4")]).toEqual([240, 120, 36, 4]);
    expect(ordinary.reduce((t, p) => t + p.value, 0)).toBeGreaterThanOrEqual(W01.minOrdinary);
    for (const { start, end, fraction } of [
      { start: 0, end: 10, fraction: 0.25 },
      { start: 10, end: 40, fraction: 0.35 },
      { start: 40, end: 60, fraction: 0.4 },
    ])
      expect(ordinary.filter((p) => p.y >= start && p.y < end).reduce((t, p) => t + p.value, 0)).toBeGreaterThanOrEqual(W01.budget * fraction);
    for (const m of w.missions) expect(w.packages.some((p) => Math.floor(p.x) === Math.floor(m.x) && Math.floor(p.y) === Math.floor(m.y))).toBe(false);
    for (let r = 0; r < 60; r++) {
      const b = (bands[Math.floor(r / 10)] ??= { cells: 0, deposits: 0, value: 0 });
      b.cells += 40;
    }
    for (const p of ordinary) {
      const b = bands[Math.floor(Math.floor(p.y) / 10)]!;
      b.deposits++;
      b.value += p.value / 10;
    }
  }
  writeFileSync(OUT + "/variant-worldstats.json", JSON.stringify(Object.entries(bands).map(([k, b]) => ({ band: `${+k * 100}-${+k * 100 + 100} m`, densityPct: +((100 * b.deposits) / b.cells).toFixed(1), meanValue: +(b.value / b.deposits).toFixed(1), valuePerCell: +(b.value / b.cells).toFixed(2) })), null, 1));
});

const SEEDS = [1, 8, 15, 22, 29, 36];
function stratState(seed: number) {
  const s = createCampaign(seed);
  s.worlds.W01 = createW01Stratified(seed);
  return s;
}
const base: Omit<Policy, "name" | "plan" | "missionMode"> = { reserveFraction: 0.25, reserveMin: 1, volatileSuccess: 0.85, dockOverhead: 20, precision: true, moveOverhead: 0 };
const novice: Omit<Policy, "name" | "plan" | "missionMode"> = { reserveFraction: 0.35, reserveMin: 1, volatileSuccess: 0.5, dockOverhead: 40, precision: true, moveOverhead: 0.35 };

it("campaign W01 durations under variants", () => {
  const out: unknown[] = [];
  const variants = [
    { label: "current", gate: null, strat: false },
    { label: "P1 stratified", gate: null, strat: true },
    { label: "P1 + P2 plate gate (rows 30-31 need drill rank 1)", gate: { rows: [30, 31] as [number, number], minDrillRank: 1 }, strat: true },
  ];
  for (const v of variants)
    for (const [pname, pol] of [
      ["skilled-balanced", { ...base, name: "skilled-balanced", missionMode: "balanced" as const, plan: PLANS.gateAware }],
      ["skilled-completionist", { ...base, name: "skilled-completionist", missionMode: "completionist" as const, plan: PLANS.smart }],
      ["novice-completionist", { ...novice, name: "novice-completionist", missionMode: "completionist" as const, plan: PLANS.cheap }],
      ["skilled-rusher(no buys unless gated)", { ...base, name: "rusher", missionMode: "balanced" as const, plan: { W01: v.gate ? ["drill"] : [], W02: [] } }],
    ] as const)
      for (const seed of SEEDS) {
        Sim.plateGate = v.gate;
        const sim = new Sim(pol as Policy, seed, v.strat ? stratState(seed) : createCampaign(seed));
        const ok = sim.runWorld(4 * 3600);
        const ev = (what: string) => sim.events.find((e) => e.what === what)?.t;
        out.push({ variant: v.label, policy: pname, seed, ok, end: +sim.t.toFixed(1), M1: ev("M1"), M2: ev("M2"), M3: ev("M3"), income: sim.s.stats.ordinaryIncome / 10, trips: sim.trips.length, hw: Object.values(sim.s.hardware).join(""), maxDepthMedian: [...sim.trips.map((t) => t.maxDepth)].sort((a, b) => a - b)[Math.floor(sim.trips.length / 2)] });
      }
  Sim.plateGate = null;
  writeFileSync(OUT + "/variant-campaign.json", JSON.stringify(out));
});

function mineFor(sim: Sim, seconds: number) {
  const g = sim.game;
  const start = sim.t,
    startIncome = sim.s.stats.ordinaryIncome;
  let trips = 0;
  while (sim.t - start < seconds && trips < 400) {
    sim.trip("mine");
    g.bank();
    g.sell();
    g.refuel();
    g.repair();
    trips++;
  }
  return +((sim.s.stats.ordinaryIncome - startIncome) / 10 / ((sim.t - start) / 60)).toFixed(1);
}
it("marginal income under P1", () => {
  const out: unknown[] = [];
  const pol: Policy = { ...base, name: "mine-only", missionMode: "fixed", plan: { W01: [], W02: [] } };
  const loadouts: [string, Partial<Record<HardwareKey, number>>][] = [
    ["base", {}],
    ["+drill1", { drill: 1 }],
    ["+energy1", { energy: 1 }],
    ["+cargo1", { cargo: 1 }],
    ["+engine1", { engine: 1 }],
    ["all rank 1", { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 }],
  ];
  for (const strat of [false, true])
    for (const [label, hw] of loadouts)
      for (const seed of SEEDS) {
        const s = strat ? stratState(seed) : createCampaign(seed);
        s.progress.beacon = true;
        s.progress.bankedOre = 3;
        s.progress.completed = [1, 2];
        s.credits = 100000;
        Object.assign(s.hardware, hw);
        s.vehicle.energy = [10, 16][s.hardware.energy]!;
        const sim = new Sim(pol, seed, s);
        out.push({ strat, label, seed, incomePerMin: mineFor(sim, 15 * 60), maxDepthMedian: [...sim.trips.map((t) => t.maxDepth)].sort((a, b) => a - b)[Math.floor(sim.trips.length / 2)] });
      }
  writeFileSync(OUT + "/variant-marginal.json", JSON.stringify(out));
});
