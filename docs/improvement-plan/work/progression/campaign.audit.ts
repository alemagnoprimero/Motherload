// Full W01 -> W02 pacing runs for several bot policies across seeds.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, PLANS, type Policy } from "./sim.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7 + 1);

const base: Omit<Policy, "name" | "plan" | "missionMode"> = {
  reserveFraction: 0.25,
  reserveMin: 1,
  volatileSuccess: 0.85,
  dockOverhead: 20,
  precision: true,
  moveOverhead: 0,
};
const policies: Policy[] = [
  { ...base, name: "skilled-balanced (mission-first, smart buys)", missionMode: "balanced", plan: PLANS.smart },
  { ...base, name: "skilled-completionist (buys whole shop first)", missionMode: "completionist", plan: PLANS.smart },
  { ...base, name: "skilled-rusher (no W01 buys)", missionMode: "balanced", plan: { W01: [], W02: PLANS.smart.W02 } },
  {
    ...base,
    name: "novice-completionist (cheap-first buys, slow, cautious)",
    missionMode: "completionist",
    plan: PLANS.cheap,
    reserveFraction: 0.35,
    volatileSuccess: 0.5,
    dockOverhead: 40,
    moveOverhead: 0.35,
  },
];

it("campaign pacing runs", () => {
  const out: unknown[] = [];
  for (const policy of policies)
    for (const seed of SEEDS) {
      const sim = new Sim(policy, seed);
      const w1 = sim.runWorld(5 * 3600);
      const w1End = sim.t;
      const w1Credits = sim.s.credits / 10;
      const w1Hardware = { ...sim.s.hardware };
      const w1Gear = [...sim.s.ownedGear];
      const w1Trips = sim.trips.length;
      const w1Income = sim.s.stats.ordinaryIncome / 10;
      const ok = w1 && sim.travelToComet();
      const w2 = ok && sim.runWorld(8 * 3600);
      out.push({
        policy: policy.name,
        seed,
        w1,
        w2,
        w1End: +w1End.toFixed(1),
        w2End: +sim.t.toFixed(1),
        w1Credits,
        w1Hardware,
        w1Gear,
        w1Trips,
        w1Income,
        totalTrips: sim.trips.length,
        income: sim.s.stats.ordinaryIncome / 10,
        recoveries: sim.s.stats.recoveries,
        ruptured: sim.ruptured,
        preserved: sim.preserved,
        hullDamage: sim.hullDamage,
        credits: sim.s.credits / 10,
        hardware: { ...sim.s.hardware },
        gear: [...sim.s.ownedGear],
        firstUseful: sim.firstUseful,
        events: sim.events,
        trips: sim.trips,
      });
    }
  writeFileSync(OUT + "/campaign.json", JSON.stringify(out));
});
