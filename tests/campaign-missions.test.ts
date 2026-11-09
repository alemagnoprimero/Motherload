import { describe, expect, it } from "vitest";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import { campaignMission } from "../src/campaign/missions";
import { W01 } from "../src/campaign/config";

const task = (game: Campaign, id: string) =>
  campaignMission(game).tasks.find((item) => item.id === id)!;
function atDock(game: Campaign) {
  game.state.vehicle.x = W01.dockX;
  game.state.vehicle.y = -0.36;
}

describe("persistent stage mission guidance", () => {
  it("distinguishes carried ore from banked proof and earned credits from payment", () => {
    const game = new Campaign(createCampaign(42));
    // D14: M1 is "bank three ordinary packages"; there is no beacon task.
    expect(campaignMission(game).title).toBe("Prove the claim");
    expect(campaignMission(game).tasks.map((item) => item.id)).toEqual([
      "ore",
      "construction",
    ]);
    expect(campaignMission(game).next).toBe(
      "Mine marked seam A · 70 m → Bank ore",
    );
    expect(task(game, "construction").label).toContain("20/200 CR");
    for (const item of game.world.packages.slice(0, 3)) item.status = "carried";
    expect(task(game, "ore").status).toBe("carried");
    expect(task(game, "ore").label).toContain("0/3");
    // The marked seam still has room in the hold, so the guide keeps mining.
    expect(campaignMission(game).next).toContain("seam A");
    for (const item of game.world.packages.slice(0, 7)) item.status = "carried";
    expect(campaignMission(game).next).toBe("Return to lander → Bank ore");

    atDock(game);
    expect(game.bank()).toBe(true);
    expect(task(game, "ore").status).toBe("complete");
    expect(campaignMission(game).next).toContain("earn 180 CR more");
    game.state.credits = 2000;
    expect(task(game, "construction").status).toBe("ready");
    expect(campaignMission(game).step).toBe("01 / 03");
    expect(campaignMission(game).next).toBe("Lander → Fund construction");
    expect(game.payMilestone()).toBe(true);
    expect(campaignMission(game).step).toBe("02 / 03");
    expect(task(game, "construction").label).toContain("0/600 CR");
  });

  it("keeps mission objects actionable through collection, banking, recovery and reload", () => {
    const game = new Campaign(createCampaign(43));
    game.state.progress.bankedOre = 3;
    game.state.credits = 2000;
    atDock(game);
    expect(game.payMilestone()).toBe(true);
    expect(task(game, "W01-VALVE").label).toContain("250 m");
    expect(task(game, "W01-ANTENNA").label).toContain("400 m");
    expect(task(game, "W01-BEACON")).toEqual({
      id: "W01-BEACON",
      label: "Survey the wreck beacon · 460 m",
      status: "pending",
    });
    const valve = game.world.missions.find((item) => item.id === "W01-VALVE")!;
    valve.status = "carried";
    expect(task(game, valve.id).status).toBe("carried");
    expect(campaignMission(game).next).toContain("Bank mission cargo");
    game.recover();
    expect(task(game, valve.id).status).toBe("pending");
    valve.status = "carried";
    game.bank();
    expect(task(game, valve.id).status).toBe("complete");
    expect(campaignMission(game).next).toContain("antenna · 400 m");
    const reloaded = new Campaign(decodeCampaign(JSON.stringify(game.state)));
    expect(campaignMission(reloaded)).toEqual(campaignMission(game));
    expect(task(reloaded, "W01-ANTENNA").status).toBe("pending");
    // Both parts banked: the wreck survey is the remaining M2 proof.
    game.world.missions.find((item) => item.id === "W01-ANTENNA")!.status =
      "banked";
    expect(game.missionReady).toBe(false);
    expect(campaignMission(game).next).toBe("Survey the wreck beacon · 460 m");
    game.state.progress.beacon = true;
    expect(task(game, "W01-BEACON").label).toBe("Wreck beacon · surveyed");
    expect(task(game, "W01-BEACON").status).toBe("complete");
    expect(game.missionReady).toBe(true);
  });

  it("advances from restoring the core to a separate launch objective", () => {
    const game = new Campaign(createCampaign(44));
    game.state.progress.beacon = true;
    game.state.progress.bankedOre = 3;
    game.state.progress.completed = [1, 2];
    game.state.credits = 10000;
    for (const item of game.world.missions) item.status = "banked";
    atDock(game);
    expect(task(game, "W01-Q").status).toBe("complete");
    expect(task(game, "construction").label).toContain("1,000 CR ready");
    expect(campaignMission(game).step).toBe("03 / 03");
    expect(game.payMilestone()).toBe(true);
    expect(task(game, "launch").status).toBe("ready");
    expect(campaignMission(game).next).toBe("Lander → Launch");
    expect(game.depart()).toBe(true);
    expect(task(game, "launch").status).toBe("complete");
    expect(campaignMission(game).next).toContain("surveyor's compass");
  });
});
