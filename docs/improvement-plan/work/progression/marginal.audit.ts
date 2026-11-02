// Marginal value of each purchase: mine-only income rate with a fixed loadout.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, type Policy } from "./sim.ts";
import { createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import type { CampaignState, HardwareKey } from "/home/user/Motherload/src/campaign/types.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
const SEEDS = [2, 9, 16, 23, 30, 37, 44, 51];
const policy: Policy = {
  name: "mine-only",
  reserveFraction: 0.25,
  reserveMin: 1,
  volatileSuccess: 0.85,
  missionMode: "fixed",
  plan: { W01: [], W02: [] },
  dockOverhead: 20,
  precision: true,
  moveOverhead: 0,
};

function mineFor(sim: Sim, seconds: number) {
  const g = sim.game;
  const start = sim.t;
  const startIncome = sim.s.stats.ordinaryIncome;
  const startCredits = sim.s.credits;
  let trips = 0;
  const hauls: number[] = [];
  while (sim.t - start < seconds && trips < 400) {
    sim.trip("mine");
    hauls.push(sim.trips.at(-1)!.haul);
    g.bank();
    g.sell();
    g.refuel();
    g.repair();
    trips++;
  }
  const minutes = (sim.t - start) / 60;
  return {
    minutes: +minutes.toFixed(2),
    trips,
    incomePerMin: +((sim.s.stats.ordinaryIncome - startIncome) / 10 / minutes).toFixed(1),
    netPerMin: +((sim.s.credits - startCredits) / 10 / minutes).toFixed(1),
    meanHaul: +(hauls.reduce((a, b) => a + b, 0) / Math.max(1, hauls.length)).toFixed(1),
    recoveries: sim.s.stats.recoveries,
  };
}

function w01State(seed: number, hw: Partial<Record<HardwareKey, number>>, gear: string[]) {
  const s = createCampaign(seed);
  s.progress.beacon = true;
  s.progress.bankedOre = 3;
  s.progress.completed = [1, 2];
  s.credits = 100000;
  Object.assign(s.hardware, hw);
  for (const id of gear) {
    if (!s.ownedGear.includes(id)) s.ownedGear.push(id);
    if (id === "W01-R2") s.equipped.mobility = id;
    if (id === "W01-R3") s.equipped.processor = id;
  }
  s.vehicle.energy = [10, 16, 25][s.hardware.energy]!;
  s.vehicle.hull = [10, 18, 30][s.hardware.hull]!;
  return s;
}

const W01_LOADOUTS: [string, Partial<Record<HardwareKey, number>>, string[]][] = [
  ["base (rank 0)", {}, []],
  ["+drill1 (750)", { drill: 1 }, []],
  ["+energy1 (650)", { energy: 1 }, []],
  ["+cargo1 (700)", { cargo: 1 }, []],
  ["+engine1 (500)", { engine: 1 }, []],
  ["+hull1 (450)", { hull: 1 }, []],
  ["+rack R3 (900, needs R2 400)", {}, ["W01-R2", "W01-R3"]],
  ["all rank 1 (3050)", { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 }, []],
  ["all rank 1 + R2 + R3 (4350)", { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 }, ["W01-R2", "W01-R3"]],
];

it("W01 marginal income rates", () => {
  const out: unknown[] = [];
  for (const [label, hw, gear] of W01_LOADOUTS)
    for (const seed of SEEDS) {
      const sim = new Sim(policy, seed, w01State(seed, hw, gear));
      out.push({ world: "W01", label, seed, ...mineFor(sim, 15 * 60) });
    }
  writeFileSync(OUT + "/marginal-w01.json", JSON.stringify(out));
});

function w02State(seed: number, hw: Partial<Record<HardwareKey, number>>, gear: string[]) {
  // W01 complete with all rank-1 hardware; then travel and apply the loadout
  const s: CampaignState = w01State(seed, { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 }, []);
  s.progress.completed = [1, 2, 3];
  for (const m of s.worlds.W01!.missions) m.status = "banked";
  s.progress.unlockedWorlds = ["W01", "W02", "W03"];
  s.progress.departed = true;
  return { s, hw, gear };
}

const W02_LOADOUTS: [string, Partial<Record<HardwareKey, number>>, string[]][] = [
  ["rank 1 (arrival)", {}, []],
  ["+thermal auger (1200)", {}, ["W02-R1"]],
  ["+cargo2 (2400)", { cargo: 2 }, []],
  ["+energy2 (1800)", { energy: 2 }, []],
  ["+drill2 (2200)", { drill: 2 }, []],
  ["+engine2 (1600)", { engine: 2 }, []],
  ["+hull2 (1200)", { hull: 2 }, []],
  ["all rank 2 (9200)", { drill: 2, energy: 2, cargo: 2, engine: 2, hull: 2 }, []],
  ["all rank 2 + auger (10400)", { drill: 2, energy: 2, cargo: 2, engine: 2, hull: 2 }, ["W02-R1"]],
  ["all rank 2 + auger + condenser (12600)", { drill: 2, energy: 2, cargo: 2, engine: 2, hull: 2 }, ["W02-R1", "W02-R2"]],
  ["all rank 2 + auger + condenser + chamber (16600)", { drill: 2, energy: 2, cargo: 2, engine: 2, hull: 2 }, ["W02-R1", "W02-R2", "W02-R3"]],
];

it("W02 marginal income rates", () => {
  const out: unknown[] = [];
  for (const [label, hw, gear] of W02_LOADOUTS)
    for (const seed of SEEDS) {
      const { s } = w02State(seed, hw, gear);
      const sim = new Sim(policy, seed, s);
      sim.s.vehicle.x = 5.5;
      sim.travelToComet();
      // apply loadout after arrival
      Object.assign(sim.s.hardware, { drill: 1, energy: 1, cargo: 1, engine: 1, hull: 1 }, hw);
      for (const id of gear) {
        if (!sim.s.ownedGear.includes(id)) sim.s.ownedGear.push(id);
        if (id === "W02-R1") sim.s.equipped.drill = id;
        if (id === "W02-R2") sim.s.equipped.utilities.push(id);
        if (id === "W02-R3") sim.s.equipped.processor = id;
      }
      sim.game.world.completed = [1];
      for (const m of sim.game.world.missions) if (m.id.startsWith("W02-SAMPLE")) m.status = "banked";
      sim.s.vehicle.energy = sim.game.maxEnergy;
      sim.s.vehicle.hull = sim.game.maxHull;
      out.push({ world: "W02", label, seed, ...mineFor(sim, 15 * 60) });
    }
  writeFileSync(OUT + "/marginal-w02.json", JSON.stringify(out));
});
