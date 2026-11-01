import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../src/campaign/model";
import { W01 } from "../src/campaign/config";
import { W02 } from "../src/campaign/frontier";
import { campaignMission } from "../src/campaign/missions";
import { campaignPois, campaignSignal } from "../src/campaign/poi";

function comet() {
  const game = new Campaign(createCampaign(42));
  game.state.progress.beacon = true;
  game.state.progress.bankedOre = 3;
  game.state.progress.completed = [1, 2, 3];
  game.state.progress.unlockedWorlds = ["W01", "W02", "W03"];
  game.state.progress.departed = true;
  for (const item of game.world.missions) item.status = "banked";
  game.state.vehicle.x = W01.dockX;
  game.state.vehicle.y = -W01.bodyHalfY;
  expect(game.travel("W02")).toBe(true);
  return game;
}
function secondStage() {
  const game = comet();
  for (const mission of game.world.missions)
    if (mission.id.startsWith("W02-SAMPLE-")) mission.status = "banked";
  game.world.completed = [1];
  return game;
}
const task = (game: Campaign, id: string) =>
  campaignMission(game).tasks.find((item) => item.id === id)!;
const crystals = (game: Campaign) =>
  game.world.packages.filter(
    (item) => item.itemId === "W02-O3" && item.tags.includes("cryosample"),
  );

describe("Frontier mission and POI guidance", () => {
  it("tracks comet sources after Frontier departure without mutating discovery", () => {
    const game = comet();
    const before = JSON.stringify(game.state);
    expect(campaignMission(game).title).toBe("Sample the thermal seam");
    expect(task(game, "samples").label).toContain("0/5 banked");
    expect(campaignMission(game).next).toContain("150 m");
    const signal = campaignSignal(game)!;
    expect(signal.kind).toBe("sample");
    expect(signal.targetId).toMatch(/^W02-SAMPLE-/);
    expect(signal.poi.depthMeters).toBe(150);
    expect(signal.poi.known).toBe(false);
    expect(
      campaignPois(game).filter((poi) => poi.kind === "sample"),
    ).toHaveLength(5);
    expect(campaignPois(game).some((poi) => poi.id.startsWith("W01"))).toBe(
      false,
    );
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it("distinguishes collected samples, banked proof and actual construction", () => {
    const game = comet();
    const samples = game.world.missions.filter((item) =>
      item.id.startsWith("W02-SAMPLE-"),
    );
    samples[0]!.status = samples[1]!.status = "carried";
    expect(task(game, "samples").status).toBe("carried");
    expect(task(game, "samples").label).toContain("2 onboard");
    expect(campaignSignal(game)?.kind).toBe("sample");
    expect(campaignMission(game).next).toContain("3 more Helion samples");
    expect(game.bank()).toBe(true);
    expect(task(game, "samples").label).toContain("2/5 banked");
    expect(campaignSignal(game)?.kind).toBe("sample");
    game.state.credits = 10000;
    expect(game.payMilestone()).toBe(false);
    for (const sample of samples.slice(2)) sample.status = "carried";
    expect(campaignSignal(game)?.targetId).toBe("W02-LANDER");
    expect(campaignSignal(game)?.action).toContain("bank Helion samples");
    expect(campaignMission(game).next).toContain("Bank Helion samples");
    game.bank();
    expect(task(game, "samples").status).toBe("complete");
    expect(campaignMission(game).step).toBe("01 / 03");
    expect(campaignSignal(game)?.action).toContain("fund construction");
    expect(game.payMilestone()).toBe(true);
    expect(campaignMission(game).step).toBe("02 / 03");
    expect(task(game, "construction").label).toContain("600 CR");
    expect(game.state.progress.completed).toEqual([1, 2, 3]);
  });

  it("counts banked and sold intact proof without counting the tutorial crystal", () => {
    const game = secondStage();
    const crystal = crystals(game)[0]!;
    crystal.status = "carried";
    crystal.tags.push("intact");
    const tutorial = game.world.packages.find(
      (item) => item.itemId === "W02-O3" && !item.tags.includes("cryosample"),
    )!;
    tutorial.status = "carried";
    tutorial.tags.push("intact");
    expect(task(game, "intact").label).toContain("1 onboard");
    expect(campaignSignal(game)?.kind).toBe("cryo");
    expect(campaignMission(game).next).toContain("2 more crystals");
    expect(game.bank()).toBe(true);
    expect(task(game, "intact").label).toContain("1/3 banked");
    expect(campaignSignal(game)?.kind).toBe("cryo");
    expect(game.sell()).toBe(true);
    expect(task(game, "intact").label).toContain("1/3 banked");
    expect(game.missionReady).toBe(false);
  });

  it("continues crystal collection until enough proof is onboard or another crystal cannot fit", () => {
    const game = secondStage();
    const sources = crystals(game);
    for (const crystal of sources.slice(0, 2)) {
      crystal.status = "carried";
      crystal.tags.push("intact");
    }
    expect(campaignSignal(game)?.kind).toBe("cryo");
    expect(campaignMission(game).next).toContain("1 more crystal");
    const ordinary = game.world.packages.find(
      (item) => item.itemId === "W02-O1",
    )!;
    ordinary.status = "carried";
    expect(game.cargoBulk).toBe(6);
    expect(campaignSignal(game)?.targetId).toBe("W02-LANDER");
    expect(campaignMission(game).next).toContain("Bank intact cryosilicate");
    game.bank();
    expect(campaignSignal(game)?.kind).toBe("cryo");
    sources[2]!.status = "carried";
    sources[2]!.tags.push("intact");
    expect(game.cargoBulk).toBe(2);
    expect(campaignSignal(game)?.targetId).toBe("W02-LANDER");
    expect(campaignMission(game).next).toContain("Bank intact cryosilicate");

    const full = secondStage();
    for (const item of full.world.packages
      .filter((item) => item.itemId === "W02-O1")
      .slice(0, 3))
      item.status = "carried";
    expect(full.cargoBulk).toBe(6);
    expect(campaignSignal(full)?.targetId).toBe("W02-LANDER");
    expect(campaignSignal(full)?.action).toContain("make room");
    expect(campaignMission(full).next).toContain("make room");
  });

  it("guides toward an actual surviving deep crystal across the 48-cell seam", () => {
    const game = secondStage();
    const sources = crystals(game);
    for (const item of sources) item.status = "lost";
    const fallback = sources.find(
      (item) => Math.floor(item.y) > W02.cryoRow + 1,
    )!;
    fallback.status = "deposit";
    fallback.x = 0.7;
    fallback.y = 50.5;
    game.state.vehicle.x = 47.7;
    game.state.vehicle.y = 50.5;
    const signal = campaignSignal(game)!;
    expect(signal.targetId).toBe(fallback.id);
    expect(signal.kind).toBe("cryo");
    expect(signal.direction).toBe("right");
    expect(signal.distanceMeters).toBe(10);
    expect(signal.dx).toBeCloseTo(1);
    expect(
      campaignPois(game).filter((poi) => poi.kind === "cryo"),
    ).toHaveLength(1);
  });

  it("prioritizes release instructions while the volatile window is pending", () => {
    const game = secondStage();
    const crystal = crystals(game)[0]!;
    crystal.status = "exposed";
    game.world.tiles[
      Math.floor(crystal.y) * W02.width + Math.floor(crystal.x)
    ] = 0;
    game.world.volatile = {
      packageIds: [crystal.id],
      remaining: 0.6,
      spent: 0.2,
      precision: false,
    };
    expect(campaignMission(game).next).toContain("Release drilling now");
    expect(campaignSignal(game)?.action).toContain("Release drilling now");
    const before = JSON.stringify(game.state);
    campaignMission(game);
    campaignSignal(game);
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it("shows catalyst banking, the Planetary certificate and a real return route", () => {
    const game = secondStage();
    for (const crystal of crystals(game).slice(0, 3)) {
      crystal.status = "banked";
      crystal.tags.push("intact");
    }
    game.state.credits = 20000;
    expect(game.payMilestone()).toBe(true);
    expect(campaignSignal(game)?.targetId).toBe("W02-Q");
    expect(campaignSignal(game)?.depthMeters).toBe(1000);
    const catalyst = game.world.missions.find((item) => item.id === "W02-Q")!;
    catalyst.status = "carried";
    expect(task(game, "W02-Q").status).toBe("carried");
    expect(campaignSignal(game)?.targetId).toBe("W02-LANDER");
    game.bank();
    expect(game.payMilestone()).toBe(true);
    expect(
      campaignMission(game).tasks.some(
        (item) => item.label === "Planetary certificate earned",
      ),
    ).toBe(true);
    expect(campaignMission(game).next).toContain("Return to Broken asteroid");
    expect(campaignSignal(game)?.action).toContain("travel");
    expect(campaignSignal(game)?.action).not.toContain("launch");
    expect(game.state.progress.unlockedWorlds).toContain("W04");
  });

  it("recovery retargets returned samples instead of retaining a phantom carried objective", () => {
    const game = comet();
    const sample = game.world.missions.find(
      (item) => item.id === "W02-SAMPLE-1",
    )!;
    sample.status = "carried";
    expect(campaignSignal(game)?.kind).toBe("sample");
    expect(campaignSignal(game)?.targetId).not.toBe(sample.id);
    game.recover();
    expect(sample.status).toBe("source");
    expect(task(game, "samples").status).toBe("pending");
    expect(campaignSignal(game)?.kind).toBe("sample");
    expect(campaignSignal(game)?.targetId).toBe(sample.id);
  });
});
