import { describe, expect, it } from "vitest";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import { W01 } from "../src/campaign/config";
import { createW01V1 } from "../src/campaign/world";
import { campaignPois, campaignSignal } from "../src/campaign/poi";

function stageTwo() {
  const campaign = new Campaign(createCampaign(42));
  campaign.state.progress.beacon = true;
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
    const before = JSON.stringify(campaign.state);
    const signal = campaignSignal(campaign)!;
    expect(signal.targetId).toBe("W01-BEACON");
    expect(signal.poi).toMatchObject({
      x: W01.spawnX,
      y: W01.beaconRow + 0.5,
      known: false,
      visible: false,
      buried: true,
      depthMeters: 100,
    });
    expect(signal.direction).toBe("down");
    expect(signal.distanceMeters).toBe(99);
    expect(signal.band).toBe("distant");
    expect(campaignPois(campaign)).toHaveLength(6);
    for (let n = 0; n < 10; n++) {
      campaignSignal(campaign);
      campaignPois(campaign);
    }
    expect(JSON.stringify(campaign.state)).toBe(before);
  });

  it("preserves legacy proximity bands and leaves surveying to the actual simulator", () => {
    const campaign = new Campaign(createCampaign(12));
    campaign.state.worlds.W01 = createW01V1(12);
    const targetY = W01.beaconRow + 0.5;
    campaign.state.vehicle.y = targetY - 8;
    expect(campaignSignal(campaign)?.band).toBe("near");
    campaign.state.vehicle.y = targetY - 3;
    expect(campaignSignal(campaign)?.band).toBe("close");
    campaign.state.vehicle.y = targetY - 1.15;
    expect(campaignSignal(campaign)?.band).toBe("close");
    campaign.state.vehicle.y = targetY - 1.14;
    expect(campaignSignal(campaign)?.band).toBe("at");
    expect(campaign.state.progress.beacon).toBe(false);
    clearShaft(campaign, 10);
    campaign.tick(1 / 60, {});
    expect(campaign.state.progress.beacon).toBe(true);
    expect(campaignSignal(campaign)).toBeUndefined();
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

  it("switches surveyed ore hauls to banking and advances only after construction payment", () => {
    const campaign = new Campaign(createCampaign(14));
    campaign.state.progress.beacon = true;
    for (const item of campaign.world.packages.slice(0, 3))
      item.status = "carried";
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
