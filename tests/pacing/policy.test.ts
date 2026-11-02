import { describe, expect, it } from "vitest";
import { Sim, type Policy } from "./sim";

const baseline: Policy = {
  name: "calibration",
  reserveFraction: 0.35,
  reserveMin: 1,
  volatileSuccess: 0.5,
  missionMode: "completionist",
  plan: { W01: [], W02: [] },
  dockOverhead: 40,
  precision: true,
  moveOverhead: 0.35,
};

describe("declared planner policies", () => {
  it("preserves the spend-first comparator and services first only in the named guided variant", () => {
    for (const serviceFirst of [false, true]) {
      const sim = new Sim({ ...baseline, serviceFirst }, 274);
      sim.s.progress.completed = [1];
      sim.s.progress.beacon = true;
      sim.s.progress.bankedOre = 3;
      for (const mission of sim.game.world.missions)
        if (["W01-VALVE", "W01-ANTENNA"].includes(mission.id))
          mission.status = "banked";
      sim.s.credits = sim.game.currentMilestone!.fee;
      sim.s.vehicle.energy = 4;
      sim.service();
      expect(sim.game.completedMilestones.includes(2)).toBe(!serviceFirst);
      expect(sim.s.vehicle.energy).toBe(serviceFirst ? sim.game.maxEnergy : 4);
    }
  });

  it("keeps the brace gripping while traversing an open air cell", () => {
    const sim = new Sim(baseline, 288);
    sim.s.ownedGear.push("W01-R2");
    sim.s.equipped.mobility = "W01-R2";
    sim.c = 20;
    sim.r = 10;
    for (let row = 10; row < 15; row++)
      sim.game.world.tiles[row * sim.W + 21] = 0;
    sim.game.world.tiles[11 * sim.W + 20] = 0;
    sim.syncVehicle();
    expect(sim.step(21, 10)).toBe(true);
    expect(sim.r).toBe(10);
  });

  it("accepts and claims actual model contracts only for the declared contract policy", () => {
    const sim = new Sim({ ...baseline, contracts: true }, 8);
    sim.service();
    expect(sim.game.contractViews.every((contract) => contract.accepted)).toBe(
      true,
    );
    const contract = sim.s.progress.contracts![0];
    const def = sim.game.contractViews.find((view) => view.id === contract.id)!;
    contract.progress = def.target;
    contract.completed = true;
    const before = sim.s.credits;
    sim.service();
    expect(sim.s.credits - before).toBe(def.reward);
    expect(
      sim.events.some((event) => event.what === "contract " + contract.id),
    ).toBe(true);
  });
});
