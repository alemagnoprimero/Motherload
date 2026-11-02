import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLANS, Sim } from "./sim";

const enabled = Boolean(process.env.PACING_MODE);
const nightly = process.env.PACING_MODE === "nightly";
const count = Number(process.env.PACING_SEEDS || (nightly ? 100 : 2));
const worlds = process.env.PACING_WORLDS || (nightly ? "W01,W02" : "W01");
const output = resolve(process.env.PACING_ARTIFACTS || "artifacts/pacing");
const base = {
  reserveFraction: 0.25,
  reserveMin: 1,
  volatileSuccess: 0.85,
  dockOverhead: 20,
  precision: true,
  moveOverhead: 0,
};
const baselinePolicies = [
  {
    ...base,
    name: "rusher",
    missionMode: "balanced",
    plan: { W01: [], W02: [] },
  },
  {
    ...base,
    name: "skilled",
    missionMode: "balanced",
    plan: PLANS.smart,
  },
  {
    ...base,
    name: "novice",
    missionMode: "completionist",
    plan: PLANS.cheap,
    reserveFraction: 0.35,
    volatileSuccess: 0.5,
    dockOverhead: 40,
    moveOverhead: 0.35,
  },
];

const guidedPolicies = baselinePolicies
  .filter((policy) => policy.name !== "rusher")
  .map((policy) => ({
    ...policy,
    name: "guided-" + policy.name,
    serviceFirst: true,
    contracts: true,
    recoveryOnStall: true,
    directMissionShaft: true,
  }));
const policySet = process.env.PACING_POLICY_SET || "all";
const candidatePolicies =
  policySet === "guided"
    ? guidedPolicies
    : policySet === "baseline"
      ? baselinePolicies
      : [...baselinePolicies, ...guidedPolicies];

const selectedPolicies = (process.env.PACING_POLICIES || "all").split(",");
const policies = selectedPolicies.includes("all")
  ? candidatePolicies
  : candidatePolicies.filter((policy) =>
      selectedPolicies.includes(policy.name),
    );
if (!policies.length)
  throw new Error("PACING_POLICIES selected no declared policy");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function gaps(sim, world, end, start = 0) {
  const moments = sim.events
    .filter(
      (event) =>
        event.world === world && /^(buy |M\d|contract )/.test(event.what),
    )
    .map((event) => event.t);
  const times = [start, ...moments, end];
  return times.slice(1).map((time, index) => time - times[index]);
}

describe.skipIf(!enabled)("campaign pacing policies", () => {
  it(
    "records all seeds and enforces completion, purchase and chapter guardrails",
    () => {
      if (!Number.isInteger(count) || count < 1 || count > 1000)
        throw new Error("PACING_SEEDS must be an integer between 1 and 1000");
      mkdirSync(output, { recursive: true });
      const rows = [];
      const failures = [];
      const started = Date.now();
      for (const policy of policies)
        for (let i = 0; i < count; i++) {
          const seed = i * 7 + 1;
          const sim = new Sim(policy, seed);
          const completedW01 = sim.runWorld(
            policy.name === "rusher" ? 3600 : 3 * 3600,
          );
          const endW01 = sim.t;
          const w01 = {
            complete: completedW01,
            minutes: endW01 / 60,
            worstGap: Math.max(...gaps(sim, "W01", endW01)) / 60,
            ordinaryIncomeTotalCR: sim.s.stats.ordinaryIncome / 10,
            ordinaryIncomeCRPerMinute:
              sim.s.stats.ordinaryIncome / 10 / (endW01 / 60),
            hardware: { ...sim.s.hardware },
            trips: sim.trips.length,
          };
          let w02;
          if (worlds.includes("W02") && completedW01 && sim.travelToComet()) {
            const start = sim.t;
            const income = sim.s.stats.ordinaryIncome;
            const completed = sim.runWorld(4 * 3600);
            w02 = {
              complete: completed,
              minutes: (sim.t - start) / 60,
              worstGap: Math.max(...gaps(sim, "W02", sim.t, start)) / 60,
              ordinaryIncomeTotalCR: (sim.s.stats.ordinaryIncome - income) / 10,
              ordinaryIncomeCRPerMinute:
                (sim.s.stats.ordinaryIncome - income) /
                10 /
                ((sim.t - start) / 60),
            };
          }
          if (policy.name === "rusher" && completedW01)
            failures.push(`Seed ${seed}: a no-purchase policy completed W01`);
          if (policy.name !== "rusher" && !completedW01)
            failures.push(`Seed ${seed}: ${policy.name} did not complete W01`);
          if (w02 && !w02.complete)
            failures.push(`Seed ${seed}: ${policy.name} did not complete W02`);
          const pickups = sim.pickups.filter(
            (pickup) =>
              pickup.world === "W01" && pickup.t >= 120 && pickup.t < 900,
          ).length;
          rows.push({
            policy: policy.name,
            seed,
            w01,
            w02,
            firstUsefulSeconds: sim.firstUseful ?? null,
            recoveries: sim.s.stats.recoveries,
            ruptures: sim.ruptured,
            preserved: sim.preserved,
            pickupCadenceMinutes2to15: pickups / 13,
            events: sim.events,
            trips: sim.trips,
          });
          // Persist incrementally so a timeout still leaves its preceding evidence.
          writeFileSync(
            resolve(output, "runs.json"),
            JSON.stringify(rows, null, 2),
          );
        }
      const summaries = policies.map((policy) => {
        const runs = rows.filter((row) => row.policy === policy.name);
        return {
          policy: policy.name,
          count: runs.length,
          w01Minutes: median(runs.map((run) => run.w01.minutes)),
          w01WorstGapMedian: median(runs.map((run) => run.w01.worstGap)),
          w01WorstGapMax: Math.max(...runs.map((run) => run.w01.worstGap)),
          w02Minutes: runs.some((run) => run.w02)
            ? median(
                runs.filter((run) => run.w02).map((run) => run.w02.minutes),
              )
            : null,
          w02WorstGapMedian: runs.some((run) => run.w02)
            ? median(
                runs.filter((run) => run.w02).map((run) => run.w02.worstGap),
              )
            : null,
        };
      });
      for (const summary of summaries) {
        if (summary.policy === "rusher") continue;
        const [min, max] = summary.policy.endsWith("skilled")
          ? [10, 18]
          : [40, 50];
        if (summary.w01Minutes < min || summary.w01Minutes > max)
          failures.push(
            `${summary.policy} W01 median ${summary.w01Minutes.toFixed(2)} min is outside ${min}–${max}`,
          );
        if (summary.w01WorstGapMedian > 8)
          failures.push(
            `${summary.policy} W01 median worst gap ${summary.w01WorstGapMedian.toFixed(2)} min exceeds 8`,
          );
        if (
          summary.policy.endsWith("novice") &&
          summary.w02Minutes !== null &&
          (summary.w02Minutes < 60 || summary.w02Minutes > 90)
        )
          failures.push(
            `${summary.policy} W02 median ${summary.w02Minutes.toFixed(2)} min is outside 60–90`,
          );
        if (summary.w02WorstGapMedian !== null && summary.w02WorstGapMedian > 8)
          failures.push(`${summary.policy} W02 median worst gap exceeds 8 min`);
      }
      const report = {
        mode: process.env.PACING_MODE,
        wallSeconds: (Date.now() - started) / 1000,
        seedCount: count,
        policySet,
        policyDefinitions: policies,
        assumptions:
          "Abstract motion and declared policy overhead; not human or physical-device validation.",
        summaries,
        failures,
      };
      writeFileSync(
        resolve(output, "summary.json"),
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report));
      expect(
        failures,
        "Pacing guardrails; see artifacts/pacing/summary.json",
      ).toEqual([]);
    },
    nightly
      ? (selectedPolicies.includes("all") ? 160 : 80) * 60 * 1000
      : 120000,
  );
});
