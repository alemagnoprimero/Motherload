import { describe, expect, it } from "vitest";
import balanceSource from "../design/v0.1/motherload-balance-v01.json?raw";
import {
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  WORLD_CATALOG,
  W01_GEAR,
  W01_MILESTONES,
  isWorldUnlocked,
} from "../src/campaign/config";

const balance = JSON.parse(balanceSource);

describe("versioned campaign configuration", () => {
  it("pins the design pack's prices and capabilities", () => {
    expect(HARDWARE_LEVELS.energy[1]).toBe(16);
    expect(HARDWARE_LEVELS.engine[1]).toBe(185);
    expect(HARDWARE_PRICES.hull[1]).toBe(4500);
    expect(HARDWARE_PRICES.drill[1]).toBe(7500);
    for (const [key, levels] of Object.entries(HARDWARE_LEVELS)) {
      const index = ["drill", "energy", "cargo", "hull", "engine"].indexOf(key);
      expect(levels).toEqual(
        balance.core.map((rank: number[]) => rank[2 + index]),
      );
    }
  });

  it("models either-parent progression without requiring both branches", () => {
    expect(isWorldUnlocked("W01", [])).toBe(true);
    expect(isWorldUnlocked("W04", [])).toBe(false);
    expect(isWorldUnlocked("W04", ["W02"])).toBe(true);
    expect(isWorldUnlocked("W04", ["W03"])).toBe(true);
    expect(isWorldUnlocked("W08", ["W09"])).toBe(true);
    expect(isWorldUnlocked("W15", ["W14"])).toBe(true);
    expect(isWorldUnlocked("missing", ["W01"])).toBe(false);
    expect(
      WORLD_CATALOG.filter((world) => world.implemented).map(
        (world) => world.id,
      ),
    ).toEqual(["W01", "W02"]);
  });

  it("matches W01 unlock prerequisites and construction fees", () => {
    expect(W01_GEAR.map((gear) => [gear.milestone, gear.requires])).toEqual([
      [0, null],
      [1, "W01-R1"],
      [2, "W01-R2"],
    ]);
    expect(W01_MILESTONES.map((milestone) => milestone.fee)).toEqual([
      2000, 3000, 5000,
    ]);
    expect(W01_MILESTONES[1].requiredMissionIds).toEqual([
      "W01-VALVE",
      "W01-ANTENNA",
    ]);
    expect(W01_MILESTONES[2].requiredMissionIds).toEqual(["W01-Q"]);
  });
});
