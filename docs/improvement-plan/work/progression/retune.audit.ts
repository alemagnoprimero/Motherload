// PROG-P3/P4/P8 experiments: retuned fees + drill-gated plate, shaft-brace feet, W02 commons at bulk 1.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, PLANS, type Policy } from "./sim.ts";
import { createW01Steep } from "./world-variant-steep.ts";
import { createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { W01_MILESTONES } from "/home/user/Motherload/src/campaign/config.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
const SEEDS = [1, 8, 15, 22, 29, 36];
const base: Omit<Policy, "name" | "plan" | "missionMode"> = { reserveFraction: 0.25, reserveMin: 1, volatileSuccess: 0.85, dockOverhead: 20, precision: true, moveOverhead: 0 };
const novice: Omit<Policy, "name" | "plan" | "missionMode"> = { reserveFraction: 0.35, reserveMin: 1, volatileSuccess: 0.5, dockOverhead: 40, precision: true, moveOverhead: 0.35 };
const fees = W01_MILESTONES as unknown as { fee: number }[];
const ORIGINAL = fees.map((m) => m.fee);

it("W01 durations: steep placement + plate gate + retuned fees", () => {
  const out: unknown[] = [];
  for (const [label, feeSet] of [
    ["P1+P3 gate, current fees 200/300/500", ORIGINAL],
    ["P1+P3 gate, retuned fees 250/900/1600", [2500, 9000, 16000]],
  ] as const)
    for (const [pname, pol] of [
      ["skilled-balanced", { ...base, name: "b", missionMode: "balanced" as const, plan: PLANS.gateAware }],
      ["novice-completionist", { ...novice, name: "n", missionMode: "completionist" as const, plan: PLANS.cheap }],
      ["rusher (buys only the gating drill)", { ...base, name: "r", missionMode: "balanced" as const, plan: { W01: ["drill"], W02: [] } }],
    ] as const)
      for (const seed of SEEDS) {
        fees.forEach((m, i) => (m.fee = feeSet[i]!));
        Sim.plateGate = { rows: [30, 31], minDrillRank: 1 };
        const s = createCampaign(seed);
        s.worlds.W01 = createW01Steep(seed);
        const sim = new Sim(pol as Policy, seed, s);
        const ok = sim.runWorld(4 * 3600);
        const ev = (what: string) => sim.events.find((e) => e.what === what)?.t;
        const gains = [0, ...sim.events.filter((e) => e.what.startsWith("buy") || /^M\d$/.test(e.what)).map((e) => e.t)];
        out.push({ label, policy: pname, seed, ok, end: +sim.t.toFixed(1), M1: ev("M1"), M2: ev("M2"), M3: ev("M3"), maxGap: Math.max(...gains.slice(1).map((t, i) => t - gains[i]!)), hw: Object.values(sim.s.hardware).join("") });
      }
  fees.forEach((m, i) => (m.fee = ORIGINAL[i]!));
  Sim.plateGate = null;
  writeFileSync(OUT + "/retune-campaign.json", JSON.stringify(out));
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
const mine: Policy = { ...base, name: "mine-only", missionMode: "fixed", plan: { W01: [], W02: [] } };

it("feet as shaft brace: marginal income on the steep W01", () => {
  const out: unknown[] = [];
  for (const brace of [false, true])
    for (const seed of SEEDS) {
      Sim.brace = brace;
      const s = createCampaign(seed);
      s.worlds.W01 = createW01Steep(seed);
      s.progress.beacon = true;
      s.progress.bankedOre = 3;
      s.progress.completed = [1, 2];
      s.credits = 100000;
      Object.assign(s.hardware, { drill: 1, energy: 1, cargo: 1, engine: 0, hull: 0 });
      s.ownedGear.push("W01-R2");
      s.equipped.mobility = "W01-R2";
      s.vehicle.energy = 16;
      const sim = new Sim(mine, seed, s);
      out.push({ brace, seed, incomePerMin: mineFor(sim, 15 * 60) });
    }
  Sim.brace = false;
  writeFileSync(OUT + "/retune-brace.json", JSON.stringify(out));
});

it("W02 arrival: commons at bulk 1", () => {
  const out: unknown[] = [];
  for (const bulk1 of [false, true])
    for (const seed of SEEDS) {
      const s = createCampaign(seed);
      s.progress.beacon = true;
      s.progress.bankedOre = 3;
      s.progress.completed = [1, 2, 3];
      for (const m of s.worlds.W01!.missions) m.status = "banked";
      s.progress.unlockedWorlds = ["W01", "W02", "W03"];
      s.progress.departed = true;
      s.credits = 100000;
      Object.assign(s.hardware, { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 });
      s.vehicle.energy = 16;
      const sim = new Sim(mine, seed, s);
      sim.travelToComet();
      sim.game.world.completed = [1];
      for (const m of sim.game.world.missions) if (m.id.startsWith("W02-SAMPLE")) m.status = "banked";
      if (bulk1) for (const p of sim.game.world.packages) if (p.itemId === "W02-O1" || p.itemId === "W02-O2") p.bulk = 1;
      out.push({ bulk1, seed, incomePerMin: mineFor(sim, 15 * 60) });
    }
  writeFileSync(OUT + "/retune-w02bulk.json", JSON.stringify(out));
});
