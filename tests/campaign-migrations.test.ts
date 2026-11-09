import { describe, expect, it } from "vitest";
import w01Source from "./fixtures/improvement-w01.json?raw";
import w02Source from "./fixtures/improvement-w02.json?raw";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import { developmentBalanceVersion } from "../src/campaign/versions";
import { hardwareName, itemName } from "../src/campaign/names";
import { CampaignStore } from "../src/campaign/persistence";

const oldState = (source = w01Source) => JSON.parse(source).state;

describe("schema 3 and versioned balance migration", () => {
  it("exports a legacy state canonically without changing the original object", () => {
    const original = oldState();
    const bytes = JSON.stringify(original);
    const store = new CampaignStore({
      read: async () => ({ current: null, backup: null }),
      listArchives: async () => [],
      commit: async () => {},
    });
    try {
      const exported = store.export(original);
      expect(exported).not.toMatch(/Ironium|Bronzium|Silverium|Goldium/);
      expect(JSON.parse(exported).state.schema).toBe(3);
      expect(store.inspectImport(exported).worlds.W01!.tiles).toEqual(
        original.worlds.W01.tiles,
      );
      expect(JSON.stringify(original)).toBe(bytes);
    } finally {
      store.close();
    }
  });
  it.each([w01Source, w02Source])(
    "preserves every old cell, package value and bulk while updating display identity",
    (source) => {
      const before = oldState(source);
      const after = decodeCampaign(JSON.stringify(before));
      expect(after.schema).toBe(3);
      expect(after.balanceVersion).toBe("0.3");
      for (const [id, world] of Object.entries(after.worlds)) {
        const original = before.worlds[id];
        expect(world.generatorVersion).toBe(1);
        expect(world.balanceVersion).toBe("0.1");
        expect(world.tiles).toEqual(original.tiles);
        expect(world.discovered).toEqual(original.discovered);
        expect(
          world.packages.map(({ id, value, bulk, status }) => ({
            id,
            value,
            bulk,
            status,
          })),
        ).toEqual(
          original.packages.map(
            ({
              id,
              value,
              bulk,
              status,
            }: {
              id: string;
              value: number;
              bulk: number;
              status: string;
            }) => ({ id, value, bulk, status }),
          ),
        );
        expect(world.pressureSeams).toEqual([]);
      }
      expect(after.progress.contracts).toEqual([]);
      expect(after.progress.waypoints).toEqual([]);
      expect(after.progress.records).toEqual({});
      expect(after.vehicle.reserve).toBe(0);
      expect(JSON.stringify(after)).not.toMatch(
        /Ironium|Bronzium|Silverium|Goldium/,
      );
      expect(decodeCampaign(JSON.stringify(after))).toEqual(after);
    },
  );

  it("lets an original schema-1 claim travel to a new generator-2 comet", () => {
    const legacy = oldState();
    legacy.schema = 1;
    legacy.progress.beacon = true;
    legacy.progress.bankedOre = 3;
    legacy.progress.completed = [1, 2, 3];
    legacy.progress.unlockedWorlds = ["W01", "W02", "W03"];
    for (const mission of legacy.worlds.W01.missions) mission.status = "banked";
    legacy.vehicle.x = 5.5;
    legacy.vehicle.y = -0.36;
    const campaign = new Campaign(decodeCampaign(JSON.stringify(legacy)));
    expect(campaign.depart()).toBe(true);
    expect(campaign.travel("W02")).toBe(true);
    expect(campaign.state.worlds.W01!.tiles).toEqual(legacy.worlds.W01.tiles);
    expect(campaign.world.generatorVersion).toBe(2);
    expect(campaign.world.balanceVersion).toBe("0.3");
    expect(
      campaign.world.packages.find((item) => item.itemId === "W02-O1")!.bulk,
    ).toBe(1);
    expect(decodeCampaign(JSON.stringify(campaign.state)).currentWorld).toBe(
      "W02",
    );
  });

  it("defaults additive fields in schema 3 without resetting existing conditions", () => {
    const source = createCampaign(117);
    source.vehicle.energy = 3.7;
    delete source.vehicle.reserve;
    delete source.progress.contracts;
    delete source.progress.records;
    delete source.progress.volatileTraining;
    const restored = decodeCampaign(JSON.stringify(source));
    expect(restored.vehicle.energy).toBe(3.7);
    expect(restored.progress.volatileTraining).toBe(0);
    expect(restored.worlds.W01!.tiles).toEqual(source.worlds.W01!.tiles);
  });

  it("restores the third training window after its persisted counter advances", () => {
    const state = createCampaign(731);
    state.progress.beacon = true;
    state.progress.bankedOre = 3;
    state.progress.completed = [1, 2, 3];
    state.progress.unlockedWorlds = ["W01", "W02", "W03"];
    for (const mission of state.worlds.W01!.missions) mission.status = "banked";
    state.vehicle.x = 5.5;
    const campaign = new Campaign(state);
    expect(campaign.depart()).toBe(true);
    expect(campaign.travel("W02")).toBe(true);
    const item = campaign.world.packages.find((entry) =>
      entry.tags.includes("volatile"),
    )!;
    item.status = "exposed";
    campaign.world.tiles[
      Math.floor(item.y) * campaign.world.width + Math.floor(item.x)
    ] = 0;
    state.progress.volatileTraining = 3;
    campaign.world.volatile = {
      packageIds: [item.id],
      remaining: 1.4,
      duration: 1.5,
      spent: 0.7,
      precision: false,
    };
    expect(decodeCampaign(JSON.stringify(state)).worlds.W02!.volatile).toEqual(
      campaign.world.volatile,
    );
    state.progress.volatileTraining = 4;
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(/Volatile/);
  });

  it("round-trips new world ledgers and rejects records that reference absent content", () => {
    const state = createCampaign(731);
    const world = state.worlds.W01!;
    const cache = world.sites!.find((site) => site.kind === "cache")!;
    cache.opened = true;
    state.progress.caches = [cache.id];
    state.progress.contracts = [
      {
        id: "W01-C2",
        worldId: "W01",
        progress: 450,
        completed: false,
        claimed: false,
      },
    ];
    state.progress.records = {
      W01: {
        historyComplete: true,
        bestHaul: 3800,
        elapsed: 143.5,
        ordinaryIncome: 3800,
        mined: 35,
        recoveries: 0,
        deepest: 450,
        contracts: 0,
        mastery: 0,
      },
    };
    state.progress.waypoints = [
      { id: "shaft", worldId: "W01", x: 20.5, y: 4.5, label: "Return shaft" },
    ];
    expect(decodeCampaign(JSON.stringify(state))).toEqual(state);
    state.progress.caches.push("missing-cache");
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(/cache proof/);
    state.progress.caches.pop();
    state.progress.contracts![0]!.id = "unknown-contract";
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(
      /contract proof/,
    );
  });

  it("preserves incomplete legacy record counters without inventing completion history", () => {
    const state = oldState();
    state.progress.records = {
      W01: {
        elapsed: 83.5,
        ordinaryIncome: 3800,
        mined: 12,
        recoveries: 1,
        deepest: 190,
        contracts: 0,
        mastery: 0,
      },
    };
    const restored = decodeCampaign(JSON.stringify(state));
    expect(restored.progress.records!.W01).toEqual({
      ...state.progress.records.W01,
      historyComplete: false,
      bestHaul: 0,
    });
    expect(restored.progress.records!.W01!.completion).toBeUndefined();
    expect(decodeCampaign(JSON.stringify(restored))).toEqual(restored);
  });

  it("requires valid completion history and paid construction proof", () => {
    const state = createCampaign(731);
    const record = state.progress.records!.W01!;
    record.completion = { elapsed: 120, recoveries: 0 };
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(
      /completion proof/,
    );
    record.completion.elapsed = -1;
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(
      /chapter records/,
    );
    record.completion = { elapsed: 120, recoveries: 0.5 };
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(
      /chapter records/,
    );
    delete record.completion;
    record.bestHaul = -1;
    expect(() => decodeCampaign(JSON.stringify(state))).toThrow(
      /chapter records/,
    );
  });

  it.each([
    (state: any) => {
      state.schema = 99;
    },
    (state: any) => {
      state.balanceVersion = "0.9";
    },
    (state: any) => {
      state.worlds.W01.generatorVersion = 99;
    },
    (state: any) => {
      state.worlds.W01.balanceVersion = "0.9";
    },
    (state: any) => {
      state.worlds.W01.packages[0].balanceVersion = "0.9";
    },
    (state: any) => {
      state.progress.volatileTraining = -1;
    },
    (state: any) => {
      state.progress.contracts = [
        {
          id: "bad",
          worldId: "W01",
          progress: 0,
          completed: false,
          claimed: true,
        },
      ];
    },
    (state: any) => {
      state.progress.records = { W01: { mastery: 99 } };
    },
    (state: any) => {
      state.vehicle.reserve = 5.1;
    },
    (state: any) => {
      state.worlds.W01.pressureSeams = [
        { id: "bad", x: 2, y: 50, warning: 1.3, spent: false },
      ];
    },
    (state: any) => {
      state.progress.waypoints = [
        { id: "bad", worldId: "W01", x: 41, y: 0, label: "Bad" },
      ];
    },
  ])("rejects malformed or unsupported new fields before import", (mutate) => {
    const source = createCampaign(117);
    mutate(source);
    expect(() => decodeCampaign(JSON.stringify(source))).toThrow();
  });

  it("moves the retired 95 m survey out of M1 and keeps proof for started stages (D14)", () => {
    // A save in M1 that surveyed the old route beacon: M1 no longer asks for a
    // survey and the old beacon is gone, so the flag drops and M2 will ask for
    // the wreck. Its banked ore still proves the claim.
    for (const source of [oldState(), createCampaign(118)]) {
      source.progress.beacon = true;
      source.progress.bankedOre = 4;
      const midStageOne = decodeCampaign(JSON.stringify(source));
      expect(midStageOne.progress.beacon).toBe(false);
      const game = new Campaign(midStageOne);
      expect(game.currentMilestone?.id).toBe(1);
      expect(game.missionReady).toBe(true);
      expect(decodeCampaign(JSON.stringify(midStageOne))).toEqual(midStageOne);
    }
    // A pending old survey in M1 changes nothing but the proof M1 needs.
    const pending = createCampaign(119);
    pending.progress.bankedOre = 2;
    const restored = new Campaign(decodeCampaign(JSON.stringify(pending)));
    expect(restored.state.progress.beacon).toBe(false);
    expect(restored.missionReady).toBe(false);
    // A save past M1 keeps its survey: M2 does not ask again.
    const stageTwo = oldState();
    stageTwo.progress.beacon = true;
    stageTwo.progress.bankedOre = 3;
    stageTwo.progress.completed = [1];
    for (const mission of stageTwo.worlds.W01.missions)
      if (mission.id !== "W01-Q") mission.status = "banked";
    const kept = new Campaign(decodeCampaign(JSON.stringify(stageTwo)));
    expect(kept.state.progress.beacon).toBe(true);
    expect(kept.currentMilestone?.id).toBe(2);
    expect(kept.missionReady).toBe(true);
  });

  it("rejects stage proof that the D14 rules cannot produce", () => {
    const stageTwo = createCampaign(120);
    stageTwo.progress.bankedOre = 2;
    stageTwo.progress.completed = [1];
    expect(() => decodeCampaign(JSON.stringify(stageTwo))).toThrow(
      /first milestone lacks its banked proof/,
    );
    const stageThree = createCampaign(121);
    stageThree.progress.bankedOre = 3;
    stageThree.progress.completed = [1, 2];
    for (const mission of stageThree.worlds.W01!.missions)
      if (mission.id !== "W01-Q") mission.status = "banked";
    expect(() => decodeCampaign(JSON.stringify(stageThree))).toThrow(
      /second milestone lacks its wreck survey/,
    );
    stageThree.progress.beacon = true;
    expect(decodeCampaign(JSON.stringify(stageThree)).progress.beacon).toBe(
      true,
    );
  });

  it("applies each world's tile range rather than the current global generator", () => {
    const legacy = oldState();
    legacy.worlds.W01.tiles[0] = 4;
    expect(() => decodeCampaign(JSON.stringify(legacy))).toThrow(/terrain/);
    const current = createCampaign(117);
    expect(current.worlds.W01!.tiles.includes(4)).toBe(true);
    expect(decodeCampaign(JSON.stringify(current)).worlds.W01!.tiles).toEqual(
      current.worlds.W01!.tiles,
    );
  });

  it("keeps balance overrides out of production and resolves rank-specific names", () => {
    expect(developmentBalanceVersion("0.1", false)).toBe("0.3");
    expect(developmentBalanceVersion("0.1", true)).toBe("0.1");
    expect(developmentBalanceVersion("0.9", true)).toBe("0.3");
    expect(itemName("W01-O1")).toBe("Slag iron");
    expect(hardwareName("drill", 1)).toBe("Plate cutter");
    expect(hardwareName("drill", 2)).not.toBe(hardwareName("drill", 1));
  });
});
