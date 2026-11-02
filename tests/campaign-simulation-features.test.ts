import { describe, expect, it } from "vitest";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import type { CampaignControls } from "../src/campaign/types";

const advance = (
  game: Campaign,
  seconds: number,
  controls: CampaignControls = {},
) => {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60)
    game.tick(Math.min(1 / 60, seconds - elapsed), controls);
};
const until = (
  game: Campaign,
  predicate: () => boolean,
  controls: CampaignControls = {},
  seconds = 10,
) => {
  for (let elapsed = 0; elapsed < seconds && !predicate(); elapsed += 1 / 60)
    game.tick(1 / 60, controls);
  expect(
    predicate(),
    `${game.message} ${JSON.stringify(game.state.vehicle)}`,
  ).toBe(true);
};
const park = (game: Campaign) => {
  game.state.vehicle.x = game.activeWorldDefinition.dockX;
  game.state.vehicle.y = -0.36;
  game.velocityX = game.velocityY = 0;
};

describe("typed extraction feedback and optional expedition goals", () => {
  it.each([-0.45, 0.45])(
    "centers an ascending rig under a narrow shaft from offset %s",
    (offset) => {
      const game = new Campaign(createCampaign(12));
      for (let row = 0; row <= 10; row++) {
        game.world.tiles[row * game.world.width + 20] = 0;
        if (row >= 8) {
          game.world.tiles[row * game.world.width + 19] = 0;
          game.world.tiles[row * game.world.width + 21] = 0;
        } else {
          game.world.tiles[row * game.world.width + 19] = 1;
          game.world.tiles[row * game.world.width + 21] = 1;
        }
      }
      game.state.vehicle.x = 20.5 + offset;
      game.state.vehicle.y = 9.5;
      until(game, () => game.state.vehicle.y < 6.5, { up: true }, 3);
      expect(game.state.vehicle.x).toBeCloseTo(20.5, 1);
      expect(game.state.stats.mined).toBe(0);
    },
  );

  it("emits exactly one material cut and pickup cue per actual extraction", () => {
    const game = new Campaign(createCampaign(12));
    until(game, () => game.state.stats.mined === 1, { down: true });
    const events = game.drainEvents();
    expect(
      events.filter(
        (event) => event.type === "interaction" && event.action === "cut-start",
      ),
    ).toHaveLength(1);
    expect(events.filter((event) => event.type === "cut")).toHaveLength(1);
    expect(events.find((event) => event.type === "cut")).toMatchObject({
      material: "soil",
      direction: "down",
    });
    expect(events.filter((event) => event.type === "pickup")).toHaveLength(
      game.cargo.length,
    );
    expect(game.drainEvents()).toEqual([]);
    game.tick(0);
    expect(game.drainEvents()).toEqual([]);
  });

  it("announces a blocked full hold once until capacity becomes available", () => {
    const game = new Campaign(createCampaign(12));
    for (const item of game.world.packages.slice(0, 7)) item.status = "carried";
    const waiting = game.world.packages[7]!;
    waiting.status = "exposed";
    waiting.x = game.state.vehicle.x;
    waiting.y = game.state.vehicle.y;
    advance(game, 0.5);
    expect(
      game
        .drainEvents()
        .filter(
          (event) =>
            event.type === "interaction" && event.action === "hold-full",
        ),
    ).toHaveLength(1);
    advance(game, 0.5);
    expect(
      game
        .drainEvents()
        .filter(
          (event) =>
            event.type === "interaction" && event.action === "hold-full",
        ),
    ).toHaveLength(0);
    expect(game.eject(game.cargo[0]!.id)).toBe(true);
    advance(game, 0.1);
    expect(
      game
        .drainEvents()
        .filter(
          (event) =>
            event.type === "interaction" && event.action === "hold-full",
        ),
    ).toHaveLength(1);
  });

  it("commits an exact sale receipt before presentation and never pays it twice", () => {
    const game = new Campaign(createCampaign(13));
    for (const item of game.world.packages.slice(0, 7)) item.status = "carried";
    const value = game.cargoValue;
    park(game);
    expect(game.bank()).toBe(true);
    expect(game.chapterSummary.bestHaul).toBe(value);
    const before = game.state.credits;
    const receipt = game.sell();
    expect(receipt).toMatchObject({
      total: value,
      creditsBefore: before,
      creditsAfter: before + value,
      packages: 7,
    });
    if (!receipt) throw new Error("Expected sale receipt");
    expect(receipt.lines.reduce((sum, line) => sum + line.value, 0)).toBe(
      value,
    );
    expect(receipt.lines.reduce((sum, line) => sum + line.count, 0)).toBe(7);
    expect(game.sell()).toBe(false);
    expect(game.state.credits).toBe(before + value);
    expect(
      game.drainEvents().filter((event) => event.type === "sale"),
    ).toHaveLength(1);
  });

  it("awards the three specified mastery goals and preserves a clean completion after later tows", () => {
    const game = new Campaign(createCampaign(13));
    game.state.progress.beacon = true;
    game.state.progress.bankedOre = 3;
    game.state.progress.completed = [1, 2];
    game.state.credits = 100000;
    for (const mission of game.world.missions) mission.status = "banked";
    game.state.progress.records!.W01!.elapsed = 1199;
    park(game);
    expect(game.payMilestone()).toBe(true);
    expect(game.chapterSummary.mastery).toBe(2);
    expect(game.chapterSummary.fastestM3).toBe(1199);
    const ordinary = game.world.packages.filter((item) =>
      item.tags.includes("ordinary"),
    );
    const target = ordinary.reduce((sum, item) => sum + item.value, 0) / 2;
    let banked = 0;
    for (const item of ordinary) {
      if (banked >= target) break;
      item.status = "banked";
      banked += item.value;
    }
    game.world.packages.find((item) => item.tags.includes("relic"))!.status =
      "banked";
    game.bank();
    expect(game.chapterSummary.mastery).toBe(3);
    expect(game.chapterSummary.oreBankedPercent).toBeGreaterThanOrEqual(50);
    expect(game.chapterSummary.relics).toBe(1);
    game.recover();
    expect(game.chapterSummary.recoveries).toBe(1);
    expect(game.chapterSummary.completion?.recoveries).toBe(0);
    expect(game.chapterSummary.mastery).toBe(3);
  });

  it("does not invent a perfect completion time for a migrated campaign", () => {
    const game = new Campaign(createCampaign(14));
    game.state.progress.completed = [1, 2, 3];
    game.state.progress.records = {};
    game.state.stats.recoveries = 4;
    park(game);
    game.bank();
    expect(game.chapterSummary.historyComplete).toBe(false);
    expect(game.chapterSummary.fastestM3).toBeNull();
    expect(game.chapterSummary.mastery).toBe(1);
    expect(game.postChapterObjectives.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(game.postChapterObjectives.map((goal) => goal.kind)),
    ).toEqual(new Set(["cache", "relic", "log"]));
  });

  it("tracks accepted delivery contracts and pays each reward once across reload", () => {
    const game = new Campaign(createCampaign(14));
    park(game);
    expect(game.acceptContract("W01-C1")).toBe(true);
    expect(game.acceptContract("W01-C1")).toBe(false);
    expect(game.acceptContract("W02-C1")).toBe(false);
    for (const item of game.world.packages
      .filter((item) => item.tags.includes("ordinary"))
      .slice(0, 12))
      item.status = "banked";
    expect(game.sell()).toBeTruthy();
    expect(
      game.contractViews.find((contract) => contract.id === "W01-C1"),
    ).toMatchObject({ progress: 12, completed: true, claimed: false });
    const restored = new Campaign(decodeCampaign(JSON.stringify(game.state)));
    const before = restored.state.credits;
    expect(restored.claimContract("W01-C1")).toBe(true);
    expect(restored.claimContract("W01-C1")).toBe(false);
    expect(restored.state.credits).toBe(before + 1200);
    expect(restored.chapterSummary.contracts).toBe(1);
  });

  it("keeps the reserve separate and automatically rescues depletion without a tow", () => {
    const game = new Campaign(createCampaign(15));
    game.state.ownedGear.push("W02-R1", "W02-R2");
    game.state.equipped.utilities = ["W02-R2"];
    game.state.vehicle.energy = 0;
    game.state.vehicle.reserve = 3;
    game.tick(1 / 60);
    expect(game.state.vehicle.energy).toBeGreaterThan(2.99);
    expect(game.state.vehicle.reserve).toBe(0);
    expect(game.state.stats.recoveries).toBe(0);
    expect(
      game.drainEvents().filter((event) => event.type === "reserve"),
    ).toMatchObject([{ amount: 3 }]);
    expect(game.useReserve()).toBe(false);
  });

  it("only spends the first tow when the main tank and equipped reserve cannot reach home", () => {
    const game = new Campaign(createCampaign(16));
    for (let row = 0; row < 40; row++)
      game.world.tiles[row * game.world.width + 20] = 0;
    game.state.vehicle.y = 39.64;
    game.state.vehicle.energy = 0.5;
    expect(game.returnReserve.state).toBe("stranded");
    expect(game.recoveryPreview.freeTow).toBe(true);
    game.state.equipped.utilities = ["W02-R2"];
    game.state.vehicle.reserve = 5;
    expect(game.recoveryPreview.freeTow).toBe(false);
  });

  it("requires a post-construction specialist tool for a cache and preserves one-time payment", () => {
    const game = new Campaign(createCampaign(17));
    const cache = game.world.sites!.find((site) => site.kind === "cache")!;
    cache.discovered = true;
    game.state.vehicle.x = cache.x;
    game.state.vehicle.y = cache.y;
    expect(game.openCache(cache.id)).toBe(false);
    game.state.progress.completed = [1, 2, 3];
    expect(game.openCache(cache.id)).toBe(false);
    game.state.ownedGear.push("W02-R1");
    game.state.equipped.drill = "W02-R1";
    const before = game.state.credits;
    expect(game.postChapterObjectives.map((site) => site.id)).toContain(
      cache.id,
    );
    expect(game.openCache(cache.id)).toBe(true);
    expect(game.state.credits).toBe(before + cache.reward!);
    expect(game.openCache(cache.id)).toBe(false);
    expect(game.postChapterObjectives.map((site) => site.id)).not.toContain(
      cache.id,
    );
    expect(game.state.progress.caches).toContain(cache.id);
  });

  it("only places claim waypoints on known terrain and removes identities exactly", () => {
    const game = new Campaign(createCampaign(18));
    expect(game.setWaypoint(20.5, 50.5, "Hidden")).toBe(false);
    game.world.discovered[50 * game.world.width + 20] = 1;
    expect(game.setWaypoint(20.5, 50.5, "Lower shaft")).toBe(true);
    expect(game.setWaypoint(20.5, 50.5, "Second marker")).toBe(true);
    const [first, second] = game.state.progress.waypoints!;
    expect(first!.id).not.toBe(second!.id);
    expect(game.removeWaypoint(first!.id)).toBe(true);
    expect(game.removeWaypoint(first!.id)).toBe(false);
    expect(game.state.progress.waypoints).toEqual([second]);
  });
});

describe("pressure seams", () => {
  function seamFixture(rank: number) {
    const game = new Campaign(createCampaign(19));
    game.world.tiles[20] = 0;
    game.world.tiles[game.world.width + 20] = 1;
    game.world.tiles[2 * game.world.width + 20] = 1;
    game.world.pressureSeams = [
      { id: "test-seam", x: 20.5, y: 1.5, warning: null, spent: false },
    ];
    game.state.vehicle.y = 0.64;
    game.state.hardware.hull = rank;
    game.state.vehicle.hull = game.maxHull;
    until(game, () => game.state.stats.mined === 1, { down: true });
    return game;
  }
  it("gives at least 1.2 seconds of visible warning and halves pressure damage at hull rank one", () => {
    for (const rank of [0, 1]) {
      const game = seamFixture(rank);
      const before = game.state.vehicle.hull;
      const warning = game
        .drainEvents()
        .find(
          (event) => event.type === "pressure" && event.phase === "warning",
        )!;
      advance(game, 1.1);
      expect(game.state.vehicle.hull).toBe(before);
      advance(game, 0.2);
      expect(before - game.state.vehicle.hull).toBe(4 / (rank + 1));
      const burst = game
        .drainEvents()
        .find((event) => event.type === "pressure" && event.phase === "burst")!;
      expect(burst.at - warning.at).toBeGreaterThanOrEqual(1.2 - 1e-7);
      advance(game, 2);
      expect(before - game.state.vehicle.hull).toBe(4 / (rank + 1));
    }
  });
  it("lets an alert pilot fly clear before the pressure burst", () => {
    const game = seamFixture(0);
    advance(game, 1.3, { up: true });
    expect(game.state.vehicle.hull).toBe(game.maxHull);
    expect(game.world.pressureSeams![0]!.spent).toBe(true);
  });

  it("retains a full visible warning when the cut finishes inside a long frame", () => {
    const game = new Campaign(createCampaign(20));
    game.world.tiles[20] = 0;
    game.world.tiles[game.world.width + 20] = 1;
    game.world.tiles[2 * game.world.width + 20] = 1;
    game.world.pressureSeams = [
      { id: "long-frame", x: 20.5, y: 1.5, warning: null, spent: false },
    ];
    game.state.vehicle.y = 0.64;
    until(game, () => game.drillProgress > 0.9, { down: true });
    game.tick(0.25, { down: true });
    const seam = game.world.pressureSeams[0]!;
    expect(seam.warning).toBe(1.2);
    const firstVisible = game.state.elapsed;
    const hull = game.state.vehicle.hull;
    advance(game, 1.19);
    expect(game.state.vehicle.hull).toBe(hull);
    advance(game, 0.03);
    expect(seam.spent).toBe(true);
    const burst = game
      .drainEvents()
      .find((event) => event.type === "pressure" && event.phase === "burst")!;
    expect(burst.at - firstVisible).toBeGreaterThanOrEqual(1.2 - 1e-7);
  });
});
