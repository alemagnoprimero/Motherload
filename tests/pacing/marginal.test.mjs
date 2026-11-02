import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCampaign } from "../../src/campaign/model";
import { HARDWARE_LEVELS } from "../../src/campaign/config";
import { Sim } from "./sim";

const enabled = process.env.PACING_CAPABILITIES === "1";
const count = Number(process.env.PACING_CAP_SEEDS || 8);
const worlds = process.env.PACING_CAP_WORLDS || "W01,W02";
const selected = process.env.PACING_CAP_LOADOUTS?.split(",");
const output = resolve(
  process.env.PACING_CAP_ARTIFACTS || "artifacts/pacing/marginal",
);
const reportInputs = process.env.PACING_CAP_REPORT_INPUTS?.split(",");
const baseline = JSON.parse(
  readFileSync(new URL("./v01-baseline.json", import.meta.url), "utf8"),
);
const policy = {
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
const rankOne = { drill: 1, energy: 1, cargo: 1, hull: 1, engine: 1 };
const rankTwo = { drill: 2, energy: 2, cargo: 2, hull: 2, engine: 2 };
const loadouts = {
  W01: [
    ["base", {}, []],
    ["drill1", { drill: 1 }, []],
    ["energy1", { energy: 1 }, []],
    ["cargo1", { cargo: 1 }, []],
    ["engine1", { engine: 1 }, []],
    ["hull1", { hull: 1 }, []],
    ["rack", {}, ["W01-R3"]],
    ["rank1", rankOne, []],
    ["rank1-brace", rankOne, ["W01-R2"]],
    ["rank1-rack", rankOne, ["W01-R2", "W01-R3"]],
  ],
  W02: [
    ["arrival", rankOne, []],
    ["thermal", rankOne, ["W02-R1"]],
    ["cargo2", { ...rankOne, cargo: 2 }, []],
    ["energy2", { ...rankOne, energy: 2 }, []],
    ["drill2", { ...rankOne, drill: 2 }, []],
    ["engine2", { ...rankOne, engine: 2 }, []],
    ["hull2", { ...rankOne, hull: 2 }, []],
    ["rank2", rankTwo, []],
    ["rank2-small-bay", { ...rankTwo, cargo: 1 }, []],
    ["rank2-thermal", rankTwo, ["W02-R1"]],
    ["rank2-reserve", rankTwo, ["W02-R1", "W02-R2"]],
    ["rank2-chamber", rankTwo, ["W02-R1", "W02-R2", "W02-R3"]],
  ],
};

function setup(seed, world, hardware, gear) {
  const state = createCampaign(seed);
  state.progress.beacon = true;
  state.progress.bankedOre = 3;
  state.progress.completed = world === "W02" ? [1, 2, 3] : [1, 2];
  state.progress.departed = world === "W02";
  state.progress.unlockedWorlds =
    world === "W02" ? ["W01", "W02", "W03"] : ["W01"];
  for (const mission of state.worlds.W01.missions) mission.status = "banked";
  state.credits = 100000;
  const sim = new Sim(policy, seed, state);
  if (world === "W02") {
    if (!sim.travelToComet()) throw new Error("Comet fixture travel failed");
    sim.game.world.completed = [1, 2];
    for (const mission of sim.game.world.missions) mission.status = "banked";
  }
  Object.assign(sim.s.hardware, hardware);
  for (const id of gear) {
    if (!sim.s.ownedGear.includes(id)) sim.s.ownedGear.push(id);
    if (id === "W01-R2") sim.s.equipped.mobility = id;
    else if (id === "W01-R3" || id === "W02-R3") sim.s.equipped.processor = id;
    else if (id === "W02-R1") sim.s.equipped.drill = id;
    else if (id === "W02-R2") sim.s.equipped.utilities.push(id);
  }
  sim.s.vehicle.energy = HARDWARE_LEVELS.energy[sim.s.hardware.energy];
  sim.s.vehicle.hull = HARDWARE_LEVELS.hull[sim.s.hardware.hull];
  return sim;
}

function measure(sim) {
  const start = sim.t;
  const income = sim.s.stats.ordinaryIncome;
  const credits = sim.s.credits;
  let trips = 0;
  while (sim.t - start < 900 && trips < 400) {
    sim.trip("mine");
    sim.game.bank();
    sim.game.sell();
    sim.game.refuel();
    sim.game.repair();
    trips++;
  }
  const minutes = (sim.t - start) / 60;
  return {
    minutes,
    trips,
    incomePerMinute: (sim.s.stats.ordinaryIncome - income) / 10 / minutes,
    netPerMinute: (sim.s.credits - credits) / 10 / minutes,
    pickupCadenceMinutes2to15:
      sim.pickups.filter(
        (item) => item.t >= start + 120 && item.t < start + 900,
      ).length / 13,
    recoveries: sim.s.stats.recoveries,
    hullDamage: sim.hullDamage,
  };
}

describe.skipIf(!enabled)("fixed-loadout marginal income", () => {
  it(
    "retains paired-seed results and checks income floors, rack value and comet arrival",
    () => {
      if (!Number.isInteger(count) || count < 1 || count > 100)
        throw new Error("PACING_CAP_SEEDS must be 1–100");
      expect(policy, "Cadence comparison must use the frozen policy").toEqual(
        baseline.policy,
      );
      mkdirSync(output, { recursive: true });
      const rows = [];
      if (reportInputs) {
        // Re-analyse saved cohorts without repeating expensive simulations.
        // Later files explicitly replace matching world/loadout/seed rows.
        const bySeed = new Map();
        for (const file of reportInputs) {
          const saved = JSON.parse(readFileSync(file, "utf8"));
          for (const row of saved)
            bySeed.set(`${row.world}:${row.name}:${row.seed}`, row);
        }
        rows.push(...bySeed.values());
        writeFileSync(
          resolve(output, "runs.json"),
          JSON.stringify(rows, null, 2),
        );
      }
      for (const world of reportInputs ? [] : ["W01", "W02"]) {
        if (!worlds.includes(world)) continue;
        for (const [name, hardware, gear] of loadouts[world]) {
          if (selected && !selected.includes(`${world}:${name}`)) continue;
          for (let index = 0; index < count; index++) {
            const seed = index * 7 + 2;
            rows.push({
              world,
              name,
              seed,
              ...measure(setup(seed, world, hardware, gear)),
            });
            writeFileSync(
              resolve(output, "runs.json"),
              JSON.stringify(rows, null, 2),
            );
          }
          console.log(JSON.stringify({ world, name, seeds: count }));
        }
      }
      const means = {};
      for (const row of rows) {
        const key = `${row.world}:${row.name}`;
        const cohort = rows.filter(
          (item) => `${item.world}:${item.name}` === key,
        );
        means[key] = {
          seeds: cohort.length,
          incomePerMinute:
            cohort.reduce((sum, item) => sum + item.incomePerMinute, 0) /
            cohort.length,
          pickupCadenceMinutes2to15:
            cohort.reduce(
              (sum, item) => sum + item.pickupCadenceMinutes2to15,
              0,
            ) / cohort.length,
        };
      }
      const failures = [];
      const checks = [];
      const floor = (key, target) => {
        if (!means[key]) return;
        const actual = means[key].incomePerMinute;
        checks.push({
          kind: "income",
          cohort: key,
          actual,
          minimum: target,
          passed: actual >= target,
        });
        if (actual < target)
          failures.push(
            `${key}: ${actual.toFixed(2)} CR/min < ${target.toFixed(2)}`,
          );
      };
      floor("W01:base", 368.4 * 0.6);
      floor("W01:rank1", 368.4);
      if (means["W01:base"]) {
        floor("W01:rack", means["W01:base"].incomePerMinute * 1.08);
        floor("W01:cargo1", means["W01:base"].incomePerMinute * 1.08);
      }
      if (means["W01:rank1"])
        floor("W02:arrival", means["W01:rank1"].incomePerMinute * 1.25);
      if (means["W02:arrival"])
        floor("W02:cargo2", means["W02:arrival"].incomePerMinute * 1.08);
      if (means["W01:rank1-brace"])
        floor(
          "W01:rank1-rack",
          means["W01:rank1-brace"].incomePerMinute * 1.08,
        );
      if (means["W02:rank2-small-bay"])
        floor("W02:rank2", means["W02:rank2-small-bay"].incomePerMinute * 1.08);
      const cadence = {};
      for (const key of Object.keys(baseline.means)) {
        const pairs = rows
          .filter((row) => `${row.world}:${row.name}` === key)
          .map((current) => ({
            current,
            original: baseline.rows.find(
              (old) =>
                old.world === current.world &&
                old.name === current.name &&
                old.seed === current.seed,
            ),
          }))
          .filter((pair) => pair.original);
        if (!pairs.length) continue;
        const current =
          pairs.reduce(
            (sum, pair) => sum + pair.current.pickupCadenceMinutes2to15,
            0,
          ) / pairs.length;
        const original =
          pairs.reduce(
            (sum, pair) => sum + pair.original.pickupCadenceMinutes2to15,
            0,
          ) / pairs.length;
        cadence[key] = {
          pairedSeeds: pairs.map((pair) => pair.current.seed),
          current,
          original,
          minimum: original * 0.8,
          retained: current / original,
          passed: current >= original * 0.8,
        };
        if (!cadence[key].passed)
          failures.push(
            `${key}: ${current.toFixed(3)} pickups/min < ${(original * 0.8).toFixed(3)} paired v0.1 floor`,
          );
      }
      const report = {
        seeds: count,
        assumptions:
          "Fifteen-minute fixed-loadout mining policies with calibrated abstract movement, 20-second dock visits and no purchases; not human pacing. Whole-route hover and navigation remain planner abstractions. Only checks whose cohorts are present run.",
        policy,
        reportInputs: reportInputs ?? null,
        baseline: {
          file: "tests/pacing/v01-baseline.json",
          sourceGitSHA: baseline.sourceGitSHA,
          archivedSimSHA256: baseline.archivedSimSHA256,
          window: baseline.window,
        },
        means,
        checks,
        cadence,
        failures,
        nativeCapabilities: {
          drill1:
            "The fused plate requires drill rank one (world/model tests).",
          energy1:
            "A new 450 m plate expedition returns safely (campaign-upgrade-capabilities).",
          engine1:
            "A full hold climbs 59 rows at least 15% faster (campaign-progression-model).",
          hull1:
            "Pressure damage and repair cost are halved (campaign-simulation-features).",
          brace:
            "An airborne wall deposit can be cut without a ledge (campaign-progression-model).",
          drill2:
            "Native comet hard-rock cuts take at least 25% less time and energy than rank one (campaign-upgrade-capabilities).",
          energy2:
            "A final 1000 m comet descent beyond the existing 450 m shaft returns safely.",
          engine2: "A loaded 990 m ascent is at least 15% faster.",
          hull2: "Four timed vent contacts remain survivable.",
          reserve: "Depletion at 400 m becomes a safe native return.",
          thermal:
            "Native thermal cuts take approximately 55% of the bare cut time.",
          chamber:
            "Preserved ordinary volatile cargo gains 30% value once, without duplicate processing.",
        },
      };
      writeFileSync(
        resolve(output, "summary.json"),
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report));
      expect(failures, "See artifacts/pacing/marginal/summary.json").toEqual(
        [],
      );
    },
    60 * 60 * 1000,
  );
});
