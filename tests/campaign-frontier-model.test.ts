import { describe, expect, it } from "vitest";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import { W02, W02_EFFECTS, W02_HAZARDS } from "../src/campaign/frontier";
import type { CampaignControls, CampaignPackage } from "../src/campaign/types";

const step = 1 / 60;
function advance(
  game: Campaign,
  seconds: number,
  controls: CampaignControls = {},
) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += step)
    game.tick(Math.min(step, seconds - elapsed), controls);
}
function until(
  game: Campaign,
  predicate: () => boolean,
  controls: CampaignControls,
  limit = 20,
) {
  for (let elapsed = 0; elapsed < limit && !predicate(); elapsed += step)
    game.tick(step, controls);
  expect(
    predicate(),
    game.message + " " + JSON.stringify(game.state.vehicle),
  ).toBe(true);
}
/** Financial fixture isolates W02 mechanics from the already-tested W01 opening. */
function comet(seed = 61) {
  const game = new Campaign(createCampaign(seed));
  game.state.progress.beacon = true;
  game.state.progress.bankedOre = 3;
  game.state.progress.completed = [1, 2, 3];
  game.state.progress.unlockedWorlds = ["W01", "W02", "W03"];
  game.state.vehicle.x = 5.5;
  for (const mission of game.world.missions) mission.status = "banked";
  expect(game.depart()).toBe(true);
  expect(game.travel("W02")).toBe(true);
  game.state.credits = 200000;
  game.state.vehicle.energy = game.maxEnergy;
  return game;
}
function park(game: Campaign) {
  game.state.vehicle.x = 5.5;
  game.state.vehicle.y = -0.36;
  game.velocityX = game.velocityY = 0;
}
function prepareCut(game: Campaign, item: CampaignPackage) {
  const row = Math.floor(item.y),
    column = Math.floor(item.x);
  for (let y = row - 2; y < row; y++)
    for (let x = column - 1; x <= column + 1; x++) {
      const cx = ((x % game.world.width) + game.world.width) % game.world.width;
      game.world.tiles[y * game.world.width + cx] = 0;
      for (const other of game.world.packages)
        if (
          other.status === "deposit" &&
          Math.floor(other.x) === cx &&
          Math.floor(other.y) === y
        )
          other.status = "exposed";
    }
  game.world.tiles[row * game.world.width + column] = 1;
  game.state.vehicle.x = item.x;
  game.state.vehicle.y = row - 0.36;
  game.state.vehicle.energy = game.maxEnergy;
  game.velocityX = game.velocityY = 0;
  game.refreshVisibility();
}
function volatile(game: Campaign) {
  return game.world.packages.find(
    (item) => item.tags.includes("volatile") && item.status === "deposit",
  )!;
}
function bankSamples(game: Campaign) {
  park(game);
  for (const mission of game.world.missions)
    if (mission.id.startsWith("W02-SAMPLE-")) mission.status = "carried";
  expect(game.bank()).toBe(true);
  expect(game.payMilestone()).toBe(true);
}

describe("Ice comet extraction and persistent Frontier progression", () => {
  it("gates travel, banks carried identities and retains both claims and global hardware", () => {
    const unopened = new Campaign(createCampaign(55));
    expect(unopened.travel("W02")).toBe(false);
    const game = comet(55);
    const packageAtComet = game.world.packages[0]!;
    packageAtComet.status = "carried";
    game.world.climate = { coldRemaining: 2, ventCooldown: 1, warning: null };
    const cometTerrain = [...game.world.tiles];
    expect(game.buyHardware("cargo")).toBe(true);
    expect(game.buyHardware("cargo")).toBe(true);
    expect(game.hardwareCap).toBe(2);
    expect(game.travelPreview("W01")).toMatchObject({
      allowed: true,
      cargoCount: 1,
    });
    expect(game.travel("W01")).toBe(true);
    expect(packageAtComet.status).toBe("banked");
    advance(game, 1);
    expect(game.state.worlds.W02!.climate?.coldRemaining).toBe(2);
    expect(game.state.hardware.cargo).toBe(2);
    expect(game.travel("W02")).toBe(true);
    expect(game.world.tiles).toEqual(cometTerrain);
    expect(
      game.world.packages.find((item) => item.id === packageAtComet.id)?.status,
    ).toBe("banked");
    expect(game.travel("W03")).toBe(false);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("uses the active 48-cell seam rather than wrapping at the old asteroid width", () => {
    const game = comet();
    game.state.vehicle.x = 47.8;
    advance(game, 0.5, { right: true });
    expect(game.state.vehicle.x).toBeLessThan(3);
    expect(game.state.vehicle.x).toBeGreaterThan(0);
  });

  it("preserves an actual volatile cut on release, including after reloading its paused window", () => {
    const game = comet();
    const item = volatile(game);
    prepareCut(game, item);
    until(game, () => Boolean(game.volatileWindow), { down: true });
    expect(item.status).toBe("exposed");
    expect(game.cargo.some((candidate) => candidate.id === item.id)).toBe(
      false,
    );
    const remaining = game.volatileWindow!.remaining;
    advance(game, 0.3, { down: true });
    const reloaded = new Campaign(decodeCampaign(JSON.stringify(game.state)));
    expect(reloaded.volatileWindow?.remaining).toBeCloseTo(remaining - 0.3, 5);
    expect(reloaded.releaseVolatile()).toBe(true);
    expect(reloaded.releaseVolatile()).toBe(false);
    const preserved = reloaded.world.packages.find(
      (candidate) => candidate.id === item.id,
    )!;
    expect(preserved.tags).toContain("intact");
    expect(preserved.status).toBe("carried");
    expect(preserved.value).toBe(item.value);
  });

  it("preserves a completed crystal when the pilot takes off diagonally", () => {
    const game = comet();
    const item = volatile(game);
    prepareCut(game, item);
    until(game, () => Boolean(game.volatileWindow), { down: true });
    const previousY = game.state.vehicle.y;
    advance(game, 0.1, { up: true, right: true });
    expect(game.volatileWindow).toBeUndefined();
    expect(item.tags).toContain("intact");
    expect(item.status).toBe("carried");
    expect(game.state.vehicle.y).toBeLessThan(previousY);
  });

  it("ruptures a package when drilling continues beyond the release window", () => {
    const game = comet();
    const item = volatile(game);
    prepareCut(game, item);
    until(game, () => Boolean(game.volatileWindow), { down: true });
    advance(game, 0.76, { down: true });
    expect(item.status).toBe("lost");
    expect(item.tags).toContain("ruptured");
    expect(game.volatileWindow).toBeUndefined();
    expect(game.releaseVolatile()).toBe(false);
    expect(game.bankedIntact).toBe(0);
  });

  it("makes thermal ice cuts faster and refunds only a bounded share of actual drilling spend", () => {
    const bare = comet(71);
    const heated = comet(71);
    expect(heated.buyGear("W02-R1")).toBe(true);
    bankSamples(heated);
    expect(heated.buyGear("W02-R2")).toBe(true);
    const plainItem = volatile(bare),
      warmItem = volatile(heated);
    prepareCut(bare, plainItem);
    prepareCut(heated, warmItem);
    let bareTime = 0,
      heatedTime = 0;
    while (!bare.volatileWindow && bareTime < 10) {
      bare.tick(step, { down: true });
      bareTime += step;
    }
    while (!heated.volatileWindow && heatedTime < 10) {
      heated.tick(step, { down: true });
      heatedTime += step;
    }
    expect(heatedTime / bareTime).toBeCloseTo(
      W02_EFFECTS.thermal.iceCutMultiplier,
      1,
    );
    const pending = heated.volatileWindow!;
    const energy = heated.state.vehicle.energy;
    expect(pending.spent).toBeGreaterThan(0);
    expect(heated.releaseVolatile()).toBe(true);
    expect(heated.state.vehicle.energy - energy).toBeCloseTo(
      pending.spent * 0.2,
      8,
    );
    expect(heated.state.vehicle.energy).toBeLessThan(heated.maxEnergy);
    expect(heated.releaseVolatile()).toBe(false);
  });

  it("requires earned sample and intact proofs before purchases, construction and Planetary unlock", () => {
    const game = comet();
    expect(game.buyGear("W02-R2")).toBe(false);
    expect(game.payMilestone()).toBe(false);
    expect(game.buyGear("W02-R1")).toBe(true);
    bankSamples(game);
    expect(game.completedMilestones).toEqual([1]);
    expect(game.buyGear("W02-R2")).toBe(true);
    expect(game.buyGear("W02-R3")).toBe(false);
    const proofs = game.world.packages
      .filter((item) => item.tags.includes("cryosample"))
      .slice(0, 3);
    for (const item of proofs) {
      prepareCut(game, item);
      until(game, () => Boolean(game.volatileWindow), { down: true });
      game.tick(step, {});
      expect(item.tags).toContain("intact");
      park(game);
      expect(game.bank()).toBe(true);
      expect(game.sell()).toBe(true);
    }
    expect(game.bankedIntact).toBe(3);
    expect(game.payMilestone()).toBe(true);
    expect(game.buyGear("W02-R3")).toBe(true);
    const catalyst = game.world.missions.find((item) => item.id === "W02-Q")!;
    catalyst.status = "carried";
    expect(game.payMilestone()).toBe(false);
    expect(game.bank()).toBe(true);
    expect(game.payMilestone()).toBe(true);
    expect(game.completedMilestones).toEqual([1, 2, 3]);
    expect(game.state.progress.completed).toEqual([1, 2, 3]);
    expect(game.state.progress.unlockedWorlds).toContain("W04");
    const money = game.state.credits;
    expect(game.payMilestone()).toBe(false);
    expect(game.state.credits).toBe(money);
    expect(game.travel("W04")).toBe(false);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("applies precision value once, retaining identity through ejection and recollection", () => {
    const game = comet();
    game.world.completed = [1, 2];
    game.state.ownedGear.push("W02-R1", "W02-R2", "W02-R3");
    game.state.equipped.processor = "W02-R3";
    const item = volatile(game);
    const original = item.value;
    prepareCut(game, item);
    until(game, () => Boolean(game.volatileWindow), {
      down: true,
      primary: true,
    });
    expect(game.volatileWindow?.precision).toBe(true);
    expect(game.releaseVolatile()).toBe(true);
    expect(item.value).toBe(Math.round(original * 1.3));
    expect(item.processedBy).toEqual(["W02-R3"]);
    expect(game.eject(item.id)).toBe(true);
    game.state.vehicle.x = item.x;
    game.state.vehicle.y = item.y;
    game.tick(step);
    expect(item.status).toBe("carried");
    expect(item.value).toBe(Math.round(original * 1.3));
    expect(item.processedBy).toEqual(["W02-R3"]);
  });

  it("warns before cold, freezes timers without simulation and rate-limits vent impacts", () => {
    const game = comet();
    const cold = W02_HAZARDS.coldPockets[0];
    game.state.vehicle.x = cold.x;
    game.state.vehicle.y = cold.y;
    game.tick(step);
    expect(game.coldStatus!.warning).toBeGreaterThan(1.48);
    expect(game.coldStatus!.warning).toBeLessThanOrEqual(1.5);
    expect(game.coldStatus?.coldRemaining).toBe(0);
    // Stationary bracketing isolates the warning timer from gravity/route choice.
    for (let index = 0; index < 91; index++) {
      game.state.vehicle.x = cold.x;
      game.state.vehicle.y = cold.y;
      game.velocityX = game.velocityY = 0;
      game.tick(step);
    }
    expect(game.coldStatus!.coldRemaining).toBeGreaterThan(3.9);
    const before = structuredClone(game.coldStatus);
    game.tick(0);
    expect(game.coldStatus).toEqual(before);
    const vent = W02_HAZARDS.vents[0];
    game.state.vehicle.x = vent.x;
    game.state.vehicle.y = vent.y;
    game.state.vehicle.hull = 10;
    game.velocityX = game.velocityY = 0;
    game.tick(step);
    expect(game.state.vehicle.hull).toBe(4);
    advance(game, 0.5);
    expect(game.state.vehicle.hull).toBe(4);
    expect(game.coldStatus!.ventCooldown).toBeGreaterThan(2.4);
  });

  it("physically drills to the catalyst and flies out with attainable rank-2 hardware", () => {
    const game = comet(87);
    for (const key of ["drill", "energy", "cargo", "hull", "engine"] as const) {
      expect(game.buyHardware(key)).toBe(true);
      expect(game.buyHardware(key)).toBe(true);
    }
    expect(game.buyGear("W02-R1")).toBe(true);
    bankSamples(game);
    expect(game.buyGear("W02-R2")).toBe(true);
    game.state.vehicle.x = W02.spawnX;
    for (let elapsed = 0; elapsed < 180 && game.depth < 1000; elapsed += step) {
      if (game.volatileWindow) expect(game.releaseVolatile()).toBe(true);
      game.tick(step, { down: true });
    }
    if (game.volatileWindow) game.releaseVolatile();
    expect(game.depth, game.message).toBe(1000);
    expect(
      game.world.missions.find((mission) => mission.id === "W02-Q")?.status,
    ).toBe("carried");
    until(game, () => game.state.vehicle.y <= -0.36, { up: true }, 60);
    expect(game.state.vehicle.energy).toBeGreaterThan(0);
    expect(game.state.stats.recoveries).toBe(0);
    expect(game.state.stats.largestDepth).toBe(1000);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("rejects forged cross-world cargo, unsupported timers and unearned rank-2 blueprints", () => {
    const game = comet();
    const corrupt = structuredClone(game.state);
    corrupt.worlds.W01!.packages[0]!.status = "carried";
    expect(() => decodeCampaign(JSON.stringify(corrupt))).toThrow(/inactive/);
    corrupt.worlds.W01!.packages[0]!.status = "deposit";
    corrupt.worlds.W02!.climate!.ventCooldown = 300;
    expect(() => decodeCampaign(JSON.stringify(corrupt))).toThrow(/timers/);
    const fresh = createCampaign();
    fresh.hardware.drill = 2;
    expect(() => decodeCampaign(JSON.stringify(fresh))).toThrow(/hardware/);
  });
});
