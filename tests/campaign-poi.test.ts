import { describe, expect, it } from "vitest";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import { W01 } from "../src/campaign/config";
import { createW01V1 } from "../src/campaign/world";
import {
  campaignPois,
  campaignSignal,
  objectiveDistance,
} from "../src/campaign/poi";

/** The start of M2 under D14: the claim is proven, the wreck not yet surveyed. */
function stageTwo() {
  const campaign = new Campaign(createCampaign(42));
  campaign.state.progress.beacon = false;
  campaign.state.progress.bankedOre = 3;
  campaign.state.progress.completed = [1];
  campaign.state.hardware.energy = 1;
  return campaign;
}
function dock(campaign: Campaign) {
  campaign.state.vehicle.x = W01.dockX;
  campaign.state.vehicle.y = -W01.bodyHalfY;
  campaign.velocityX = campaign.velocityY = 0;
}
function clearShaft(campaign: Campaign, through: number) {
  for (let row = 0; row <= through; row++)
    campaign.world.tiles[row * W01.width + 20] = 0;
  for (const item of campaign.world.packages)
    if (item.status === "deposit" && campaign.tile(item.x, item.y) === 0)
      item.status = "exposed";
  campaign.refreshVisibility();
}

describe("mission landmarks and proximity guidance", () => {
  it("stands the one wreck beacon on the SITE-4 gallery floor beside the wreck in every generator-2 world", () => {
    const column = Math.floor(W01.beaconX),
      row = W01.beaconRow;
    for (let seed = 0; seed < 100; seed++) {
      const world = createCampaign(seed).worlds.W01!;
      const tile = (x: number, y: number) => world.tiles[y * world.width + x];
      const site = world.sites!.find((item) => item.id === "W01-SITE-4")!;
      expect(site).toMatchObject({ kind: "wreck", x: 15.5, y: 43.5 });
      // A three-cell flat floor (row 46) with headroom above the beacon.
      for (const x of [column - 1, column, column + 1]) {
        expect(tile(x, row), `seed ${seed} air at ${x},${row}`).toBe(0);
        expect(
          tile(x, row + 1),
          `seed ${seed} floor at ${x},${row + 1}`,
        ).not.toBe(0);
      }
      expect(tile(column, row - 1), `seed ${seed} headroom`).toBe(0);
      expect(tile(column, row - 2), `seed ${seed} headroom`).toBe(0);
      // Beside the 2.6-tile wreck, never under it, and never a hazard cell.
      expect(Math.abs(W01.beaconX - site.x)).toBe(2);
      for (const shelf of world.shelves)
        expect(
          Math.hypot(shelf.x - W01.beaconX, shelf.y - (row + 0.5)),
        ).toBeGreaterThan(2.5);
    }
  });
  it("guides toward a distant buried mission before asking for a local cut", () => {
    const campaign = stageTwo();
    const valve = campaign.world.missions.find(
      (item) => item.id === "W01-VALVE",
    )!;
    const distant = campaignSignal(campaign)!;
    expect(distant.targetId).toBe(valve.id);
    expect(distant.action).toBe(`Descend to 250 m (${distant.arrow})`);
    campaign.state.vehicle.x = valve.x;
    campaign.state.vehicle.y = valve.y - 4;
    expect(campaignSignal(campaign)?.action).toBe("Excavate the marked debris");
  });
  it("broadcasts the current wreck signal without revealing terrain or hidden ore", () => {
    const campaign = new Campaign(createCampaign(11));
    // M1 guides the marked seam; the wreck beacon is M2 proof (D14).
    expect(campaignSignal(campaign)?.targetId).toBe("W01-SEAM-A");
    campaign.state.progress.bankedOre = 3;
    campaign.state.progress.completed = [1];
    for (const mission of campaign.world.missions)
      if (mission.id !== "W01-Q") mission.status = "banked";
    const before = JSON.stringify(campaign.state);
    const signal = campaignSignal(campaign)!;
    expect(signal.targetId).toBe("W01-BEACON");
    expect(signal.poi).toMatchObject({
      x: W01.beaconX,
      y: W01.beaconRow + 0.5,
      known: false,
      visible: false,
      buried: false,
      depthMeters: 460,
    });
    expect(signal.direction).toBe("down");
    expect(signal.distanceMeters).toBe(460);
    expect(signal.band).toBe("distant");
    expect(signal.action).toBe("Descend to 460 m (↓)");
    expect(campaignPois(campaign)).toHaveLength(6);
    for (let n = 0; n < 10; n++) {
      campaignSignal(campaign);
      campaignPois(campaign);
    }
    expect(JSON.stringify(campaign.state)).toBe(before);
  });

  it("preserves legacy proximity bands and leaves surveying to the actual simulator", () => {
    const campaign = stageTwo();
    // A generator-1 claim has no gallery: the same cell is dug like a part.
    campaign.state.worlds.W01 = createW01V1(12);
    for (const mission of campaign.world.missions)
      if (mission.id !== "W01-Q") mission.status = "banked";
    const targetY = W01.beaconRow + 0.5;
    campaign.state.vehicle.x = W01.beaconX;
    campaign.state.vehicle.y = targetY - 8;
    expect(campaignSignal(campaign)?.targetId).toBe("W01-BEACON");
    expect(campaignSignal(campaign)?.band).toBe("near");
    campaign.state.vehicle.y = targetY - 3;
    expect(campaignSignal(campaign)?.band).toBe("close");
    // 45.5 − 1.15 rounds just inside the radius in binary; stay a hair out.
    campaign.state.vehicle.y = targetY - 1.1501;
    expect(campaignSignal(campaign)?.band).toBe("close");
    campaign.state.vehicle.y = targetY - 1.14;
    expect(campaignSignal(campaign)?.band).toBe("at");
    expect(campaign.state.progress.beacon).toBe(false);
    for (let row = W01.beaconRow - 2; row <= W01.beaconRow; row++)
      campaign.world.tiles[row * W01.width + Math.floor(W01.beaconX)] = 0;
    campaign.refreshVisibility();
    // Before the claim is proven the beacon does not answer (M1 has no survey).
    campaign.state.progress.completed = [];
    campaign.tick(1 / 60, {});
    expect(campaign.state.progress.beacon).toBe(false);
    campaign.state.progress.completed = [1];
    campaign.state.vehicle.y = targetY - 1.14;
    campaign.tick(1 / 60, {});
    expect(campaign.state.progress.beacon).toBe(true);
    expect(campaign.missionReady).toBe(true);
    expect(campaign.message).toContain("fund construction");
    expect(campaignSignal(campaign)).toMatchObject({
      targetId: "W01-LANDER",
      returning: true,
    });
    expect(campaignPois(campaign)[0]?.status).toBe("surveyed");
  });

  it("keeps announcement identity stable while moving within one signal band", () => {
    const campaign = new Campaign(createCampaign(13));
    campaign.state.vehicle.y = 4;
    const before = campaignSignal(campaign)!;
    campaign.state.vehicle.y = 4.2;
    const after = campaignSignal(campaign)!;
    expect(before.distanceMeters).not.toBe(after.distanceMeters);
    expect(before.alertKey).toBe(after.alertKey);
    campaign.state.vehicle.y = 7;
    expect(campaignSignal(campaign)?.alertKey).not.toBe(before.alertKey);
  });

  it("switches a full seam-A haul to banking and advances only after construction payment", () => {
    const campaign = new Campaign(createCampaign(14));
    const seamA = campaign.world.packages.filter((item) =>
      /^W01:deposit:[0-6]:20$/.test(item.id),
    );
    expect(seamA).toHaveLength(7);
    for (const item of seamA.slice(0, 3)) item.status = "carried";
    // Three packages are the proof, but the coach fills the hold from seam A.
    expect(campaignSignal(campaign)?.targetId).toBe("W01-SEAM-A");
    for (const item of seamA) item.status = "carried";
    expect(campaignSignal(campaign)).toMatchObject({
      targetId: "W01-LANDER",
      returning: true,
    });
    dock(campaign);
    expect(campaignSignal(campaign)?.action).toBe("Dock and bank your ore");
    expect(campaign.bank()).toBe(true);
    expect(campaignSignal(campaign)?.action).toContain("fund construction");
    campaign.state.credits = 2000;
    expect(campaignSignal(campaign)?.targetId).toBe("W01-LANDER");
    expect(campaign.payMilestone()).toBe(true);
    expect(campaignSignal(campaign)?.targetId).toBe("W01-SEAM-B");
  });

  it("surveys the nearby wreck before carrying the antenna home, never from the valve", () => {
    const campaign = stageTwo();
    const valve = campaign.world.missions.find(
      (item) => item.id === "W01-VALVE",
    )!;
    const antenna = campaign.world.missions.find(
      (item) => item.id === "W01-ANTENNA",
    )!;
    // The valve room is 210 m above the gallery: bank it first.
    valve.status = "carried";
    campaign.state.vehicle.x = valve.x;
    campaign.state.vehicle.y = valve.y + 0.14;
    expect(campaignSignal(campaign)).toMatchObject({
      targetId: "W01-LANDER",
      returning: true,
    });
    valve.status = "banked";
    // The antenna room is about 70 m from the beacon: survey on the same dive.
    antenna.status = "carried";
    campaign.state.vehicle.x = antenna.x;
    campaign.state.vehicle.y = antenna.y + 0.14;
    expect(campaignSignal(campaign)).toMatchObject({
      targetId: "W01-BEACON",
      returning: false,
      band: "near",
    });
    campaign.state.progress.beacon = true;
    expect(campaignSignal(campaign)).toMatchObject({
      targetId: "W01-LANDER",
      returning: true,
    });
  });

  it("finds the nearest current part using actual positions and the shorter wrap bearing", () => {
    const campaign = stageTwo();
    const valve = campaign.world.missions.find(
      (item) => item.id === "W01-VALVE",
    )!;
    const antenna = campaign.world.missions.find(
      (item) => item.id === "W01-ANTENNA",
    )!;
    valve.x = 1.1;
    antenna.x = 30.5;
    antenna.y = valve.y;
    campaign.state.vehicle.x = 39.6;
    campaign.state.vehicle.y = valve.y;
    const signal = campaignSignal(campaign)!;
    expect(signal.targetId).toBe(valve.id);
    expect(signal.poi.x).toBe(1.1);
    expect(signal.dx).toBeCloseTo(1.5);
    expect(signal.direction).toBe("right");
    expect(signal.distanceMeters).toBe(15);
    expect(signal.band).toBe("close");
    valve.x = 39.5;
    campaign.state.vehicle.x = 0.5;
    expect(campaignSignal(campaign)?.direction).toBe("left");
  });

  it("guides excavation, then actual collection, without changing mission ownership itself", () => {
    const campaign = stageTwo();
    const valve = campaign.world.missions.find(
      (item) => item.id === "W01-VALVE",
    )!;
    campaign.state.vehicle.x = valve.x;
    campaign.state.vehicle.y = valve.y - 2;
    expect(campaignSignal(campaign)?.action).toBe("Excavate the marked debris");
    expect(valve.status).toBe("source");
    clearShaft(campaign, W01.valveRow);
    expect(campaignSignal(campaign)?.action).toBe(
      "Approach to recover the mission part",
    );
    expect(valve.status).toBe("source");
    campaign.state.vehicle.y = valve.y - 0.86;
    campaign.tick(1 / 60, {});
    expect(valve.status).toBe("carried");
    expect(campaignSignal(campaign)?.targetId).toBe("W01-LANDER");
    expect(campaignSignal(campaign)?.action).toContain("bank mission cargo");
    expect(
      campaignPois(campaign).find((poi) => poi.id === valve.id)?.status,
    ).toBe("carried");
  });

  it("does not claim docking while hovering; a carried part returns to its source on recovery", () => {
    const campaign = stageTwo();
    const valve = campaign.world.missions.find(
      (item) => item.id === "W01-VALVE",
    )!;
    valve.status = "carried";
    campaign.state.vehicle.x = W01.dockX;
    campaign.state.vehicle.y = -1.2;
    expect(campaign.atDock).toBe(false);
    expect(campaignSignal(campaign)?.band).toBe("close");
    expect(campaignSignal(campaign)?.action).toBe(
      "Land in the illuminated bay to dock",
    );
    campaign.recover();
    expect(valve.status).toBe("source");
    expect(campaignSignal(campaign)?.targetId).toBe(valve.id);
    const reloaded = new Campaign(
      decodeCampaign(JSON.stringify(campaign.state)),
    );
    expect(campaignSignal(reloaded)).toEqual(campaignSignal(campaign));
  });

  it("stops targeting a banked part and retains its landmark after reload", () => {
    const campaign = stageTwo();
    const valve = campaign.world.missions.find(
      (item) => item.id === "W01-VALVE",
    )!;
    const antenna = campaign.world.missions.find(
      (item) => item.id === "W01-ANTENNA",
    )!;
    valve.status = "carried";
    dock(campaign);
    expect(campaign.bank()).toBe(true);
    expect(campaignSignal(campaign)?.targetId).toBe(antenna.id);
    expect(
      campaignPois(campaign).find((poi) => poi.id === valve.id)?.status,
    ).toBe("banked");
    const reloaded = new Campaign(
      decodeCampaign(JSON.stringify(campaign.state)),
    );
    expect(campaignSignal(reloaded)).toEqual(campaignSignal(campaign));
  });

  it("guides the navigation core and a separate launch, then silences completed objectives", () => {
    const campaign = stageTwo();
    campaign.state.progress.completed = [1, 2];
    for (const mission of campaign.world.missions)
      if (mission.id !== "W01-Q") mission.status = "banked";
    expect(campaignSignal(campaign)?.targetId).toBe("W01-Q");
    expect(campaignSignal(campaign)?.depthMeters).toBe(600);
    const core = campaign.world.missions.find((item) => item.id === "W01-Q")!;
    core.status = "carried";
    expect(campaignSignal(campaign)?.targetId).toBe("W01-LANDER");
    dock(campaign);
    campaign.bank();
    campaign.state.credits = 10000;
    expect(campaign.payMilestone()).toBe(true);
    expect(campaignSignal(campaign)?.action).toBe("Dock and launch");
    expect(campaign.depart()).toBe(true);
    expect(campaignSignal(campaign)?.kind).toBe("relic");
  });
});

describe("H1: the objective pill's distance", () => {
  it("gives metres and the bearing's arrow, or here at the target", () => {
    expect(
      objectiveDistance({ direction: "down", distanceMeters: 39, arrow: "↓" }),
    ).toEqual({ text: "39 m ↓", label: "39 metres, down" });
    expect(
      objectiveDistance({
        direction: "up-right",
        distanceMeters: 152,
        arrow: "↗",
      }),
    ).toEqual({ text: "152 m ↗", label: "152 metres, up and right" });
    expect(
      objectiveDistance({ direction: "here", distanceMeters: 0, arrow: "◉" }),
    ).toEqual({ text: "here", label: "At the target" });
  });
});
