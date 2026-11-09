import { describe, expect, it } from "vitest";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import {
  campaignSignal,
  openingRoute,
  openingSeamPending,
} from "../src/campaign/poi";
import { campaignMission } from "../src/campaign/missions";
import { createW01V1 } from "../src/campaign/world";
import type { CampaignControls } from "../src/campaign/types";

/** The start of M2 under D14: the claim is proven, the wreck not yet surveyed. */
function stageTwo(game: Campaign) {
  game.state.progress.beacon = false;
  game.state.progress.bankedOre = 7;
  game.state.progress.completed = [1];
}
const dt = 1 / 60;

/** Uses only the current signal, surface collision and visible vehicle motion. */
function followSignal(game: Campaign, stop: () => boolean, seconds = 45) {
  for (let frame = 0; frame < seconds / dt && !stop(); frame++) {
    const signal = campaignSignal(game);
    expect(signal, game.message).toBeDefined();
    const vehicle = game.state.vehicle;
    let controls: CampaignControls = {};
    if (signal!.returning) {
      if (vehicle.y > -0.36) controls = { up: true };
      else if (!game.atDock) {
        const desired = Math.max(-5, Math.min(5, signal!.dx * 5));
        const steer = desired - game.velocityX;
        controls = { left: steer < -0.1, right: steer > 0.1 };
      }
    } else if (Math.abs(signal!.dx) > 0.08 || Math.abs(game.velocityX) > 0.4) {
      const desired = Math.max(-5, Math.min(5, signal!.dx * 5));
      const steer = desired - game.velocityX;
      controls = { left: steer < -0.1, right: steer > 0.1 };
    } else controls = { down: true };
    game.tick(dt, controls);
    expect(game.state.vehicle.energy, game.message).toBeGreaterThan(0);
  }
  expect(
    stop(),
    `${game.message}; ${JSON.stringify(game.state.vehicle)}; ${JSON.stringify(campaignSignal(game))}`,
  ).toBe(true);
}

describe("first-sortie route and continuing chapter guidance", () => {
  it("fills the hold from marked seam A, then turns home without a 95 m survey", () => {
    const game = new Campaign(createCampaign(10));
    expect(openingSeamPending(game)).toBe(true);
    expect(campaignSignal(game)?.targetId).toBe("W01-SEAM-A");
    expect(campaignSignal(game)?.action).toContain("seam A");
    expect(campaignMission(game).next).toContain("seam A");
    followSignal(game, () => game.cargoBulk === 1);
    // One package is not the turn-home cue: the marked seam still has room.
    expect(campaignSignal(game)?.targetId).toBe("W01-SEAM-A");
    followSignal(game, () => game.cargoBulk === 7);
    expect(game.depth).toBe(70);
    expect(openingSeamPending(game)).toBe(false);
    expect(campaignSignal(game)).toMatchObject({
      targetId: "W01-LANDER",
      returning: true,
    });
    expect(game.state.progress.beacon).toBe(false);
    followSignal(game, () => game.atDock);
    game.bank();
    expect(game.state.progress.bankedOre).toBe(7);
    expect(game.missionReady).toBe(true);
    expect(campaignSignal(game)?.targetId).toBe("W01-LANDER");
    expect(campaignMission(game).next).toContain("Sell ore");
    game.sell();
    expect(campaignMission(game).next).toContain("Fund construction");
    expect(game.payMilestone()).toBe(true);
    expect(game.state.progress.beacon).toBe(false);
  });

  it("follows the actual tracker through two native trips and buys the tank with a minor-impact reserve", () => {
    const times: number[] = [];
    for (const seed of [4, 10, 999]) {
      const game = new Campaign(createCampaign(seed));
      followSignal(game, () => game.cargoBulk === 7);
      expect(game.state.progress.beacon).toBe(false);
      expect(game.state.stats.largestDepth).toBe(70);
      expect(game.cargoValue).toBe(3800);
      // A local optional ceiling fixture exercises the real warning, collapse
      // and damage path. No vehicle teleport or direct hull edit is used. The
      // rig rests in row 6 after seam A, so the shelf hangs two rows above it.
      game.world.tiles[4 * game.world.width + 20] = 1;
      game.world.shelves.push({
        id: "opening-incident",
        x: 20.5,
        y: 4.5,
        warning: null,
        collapsed: false,
      });
      for (let frame = 0; frame < 126; frame++) game.tick(dt, {});
      expect(game.state.vehicle.hull).toBe(7);
      followSignal(game, () => game.atDock);
      game.bank();
      game.sell();
      expect(game.payMilestone()).toBe(true);
      game.refuel();
      game.repair();
      expect(campaignSignal(game)?.targetId).toBe("W01-SEAM-B");
      expect(campaignSignal(game)?.poi).toMatchObject({ x: 21.5, y: 6.5 });
      expect(campaignMission(game).next).toContain("seam B");
      // Leaving the dock requires a real frame; the target supplies the direction.
      game.tick(dt, { right: true });
      followSignal(game, () => game.cargoBulk === 7);
      expect(campaignSignal(game)?.targetId).toBe("W01-LANDER");
      followSignal(game, () => game.atDock);
      game.bank();
      game.sell();
      expect(campaignSignal(game)?.action).toContain("expedition tank");
      expect(game.buyHardware("energy")).toBe(true);
      expect(game.state.credits).toBeGreaterThanOrEqual(250);
      expect(game.state.stats.ordinaryIncome).toBe(8600);
      expect(game.state.stats.recoveries).toBe(0);
      expect(campaignSignal(game)?.targetId).toBe("W01-VALVE");
      times.push(game.state.elapsed);
    }
    console.info("TRACKER_OPENING_SECONDS", JSON.stringify(times));
    expect(Math.max(...times)).toBeLessThanOrEqual(35);
  });

  it("never rewrites older worlds, consumed seams or existing stage progress to teach the opening again", () => {
    const game = new Campaign(createCampaign(20));
    stageTwo(game);
    const before = JSON.stringify(game.state);
    expect(openingRoute(game)?.phase).toBe("seam");
    campaignSignal(game);
    campaignMission(game);
    expect(JSON.stringify(game.state)).toBe(before);
    expect(openingRoute(new Campaign(decodeCampaign(before)))).toEqual(
      openingRoute(game),
    );
    game.world.missions[0]!.status = "carried";
    expect(openingRoute(game)).toBeUndefined();
    expect(campaignSignal(game)?.targetId).toBe("W01-LANDER");
    game.world.missions[0]!.status = "source";
    game.state.hardware.engine = 1;
    expect(openingRoute(game)).toBeUndefined();
    game.state.hardware.engine = 0;
    game.state.worlds.W01 = createW01V1(20);
    expect(openingRoute(game)).toBeUndefined();
    expect(campaignSignal(game)?.targetId).toBe("W01-VALVE");
    game.state.worlds.W01 = createCampaign(20).worlds.W01!;
    for (const item of game.world.packages)
      if (/^W01:deposit:[0-6]:21$/.test(item.id)) item.status = "sold";
    expect(openingRoute(game)).toBeUndefined();
    expect(campaignSignal(game)?.targetId).toBe("W01-VALVE");
  });

  it("turns the locator home for a real reserve warning without changing mission proof", () => {
    const game = new Campaign(createCampaign(22));
    stageTwo(game);
    game.state.hardware.energy = 1;
    game.state.vehicle.y = 18.5;
    game.state.vehicle.energy = game.returnReserve.estimate + 0.5;
    expect(game.returnReserve.state).toBe("turn");
    const before = JSON.stringify(game.state);
    expect(campaignSignal(game)).toMatchObject({
      targetId: "W01-LANDER",
      returning: true,
    });
    expect(campaignSignal(game)?.action).toContain("Turn back");
    expect(JSON.stringify(game.state)).toBe(before);
    game.state.vehicle.energy = game.returnReserve.estimate - 0.1;
    expect(campaignSignal(game)?.action).toContain("Cannot reach home");
    game.state.vehicle.energy = game.maxEnergy;
    expect(campaignSignal(game)?.targetId).toBe("W01-VALVE");
  });

  it("keeps launch first, then guides optional cache salvage when its specialist tool is equipped", () => {
    const game = new Campaign(createCampaign(21));
    stageTwo(game);
    game.state.progress.beacon = true;
    game.state.progress.completed = [1, 2, 3];
    const cache = game.world.sites!.find((site) => site.kind === "cache")!;
    expect(campaignSignal(game)?.targetId).toBe("W01-LANDER");
    expect(campaignMission(game).next).toContain("Launch");
    game.state.progress.departed = true;
    expect(campaignMission(game).next).toContain("surveyor's compass");
    expect(campaignSignal(game)?.kind).toBe("relic");
    game.state.ownedGear.push("W02-R1");
    game.state.equipped.drill = "W02-R1";
    const before = JSON.stringify(game.state);
    expect(campaignSignal(game)?.targetId).toBe(cache.id);
    expect(campaignSignal(game)?.kind).toBe("cache");
    expect(campaignMission(game).next).toContain(cache.name.toLowerCase());
    expect(JSON.stringify(game.state)).toBe(before);
    cache.opened = true;
    expect(campaignSignal(game)?.kind).toBe("relic");
    const relic = game.world.packages.find((item) =>
      item.tags.includes("relic"),
    )!;
    relic.status = "carried";
    expect(campaignSignal(game)?.targetId).toBe("W01-LANDER");
    expect(campaignSignal(game)?.action).toContain("bank the relic");
    relic.status = "banked";
    const log = campaignSignal(game)!;
    expect(log.kind).toBe("log");
    expect(campaignMission(game).next).toContain("Read");
    game.world.fieldLogs!.find((entry) => entry.id === log.targetId)!.read =
      true;
    expect(campaignSignal(game)?.targetId).not.toBe(log.targetId);
    for (const entry of game.world.fieldLogs!) entry.read = true;
    expect(campaignSignal(game)).toBeUndefined();
  });
});
