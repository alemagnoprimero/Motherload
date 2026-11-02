import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { W01_MILESTONES } from "../../src/campaign/config";
import { PLANS, Sim } from "./sim";

const enabled = process.env.PACING_SWEEP === "1";
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2
    ? sorted[Math.floor(n / 2)]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};

it.skipIf(!enabled)(
  "measures candidate fees without changing production data or policy overhead",
  () => {
    const seedCount = Number(process.env.PACING_SEEDS || 5);
    const fees = (process.env.PACING_FEES || "1000,1100,1200,1250")
      .split(",")
      .map(Number);
    const original = W01_MILESTONES[2].fee;
    const results = [];
    mkdirSync("artifacts/pacing", { recursive: true });
    try {
      for (const fee of fees) {
        W01_MILESTONES[2].fee = fee * 10;
        const runs = [];
        for (const novice of [false, true])
          for (let n = 0; n < seedCount; n++) {
            const seed = n * 7 + 1;
            const policy = {
              name: novice ? "novice" : "skilled",
              missionMode: novice ? "completionist" : "balanced",
              plan: novice ? PLANS.cheap : PLANS.smart,
              reserveFraction: novice ? 0.35 : 0.25,
              reserveMin: 1,
              volatileSuccess: novice ? 0.5 : 0.85,
              dockOverhead: novice ? 40 : 20,
              precision: true,
              moveOverhead: novice ? 0.35 : 0,
            };
            const sim = new Sim(policy, seed);
            const complete = sim.runWorld(3 * 3600);
            const moments = [
              0,
              ...sim.events
                .filter((event) => /^(buy |M\d)/.test(event.what))
                .map((event) => event.t),
              sim.t,
            ];
            const worstGap =
              Math.max(...moments.slice(1).map((t, i) => t - moments[i])) / 60;
            runs.push({
              policy: policy.name,
              seed,
              complete,
              minutes: sim.t / 60,
              worstGap,
              deposits: sim.game.world.packages.filter((item) =>
                item.tags.includes("ordinary"),
              ).length,
            });
          }
        const summary = ["skilled", "novice"].map((policy) => {
          const selected = runs.filter((run) => run.policy === policy);
          return {
            policy,
            minutes: median(selected.map((run) => run.minutes)),
            medianWorstGap: median(selected.map((run) => run.worstGap)),
            maxWorstGap: Math.max(...selected.map((run) => run.worstGap)),
            completed: selected.filter((run) => run.complete).length,
          };
        });
        results.push({ fee, seedCount, summary, runs });
        writeFileSync(
          "artifacts/pacing/fee-sweep.json",
          JSON.stringify(results, null, 2),
        );
        console.log(JSON.stringify({ fee, seedCount, summary }));
      }
    } finally {
      W01_MILESTONES[2].fee = original;
    }
  },
  30 * 60 * 1000,
);
