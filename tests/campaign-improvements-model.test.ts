import { createW01V1 } from "../src/campaign/world-v1";
import { describe, expect, it } from "vitest";
import { W01 } from "../src/campaign/config";
import {
  Campaign,
  createCampaign,
  decodeCampaign,
  wrapCampaignX,
} from "../src/campaign/model";
import type { CampaignControls } from "../src/campaign/types";

function advance(
  game: Campaign,
  seconds: number,
  controls: CampaignControls = {},
) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 1 / 120)
    game.tick(Math.min(1 / 120, seconds - elapsed), controls);
}

describe("first-expedition recovery", () => {
  it("starts full and gives the first disabled tow without taking the opening haul, over 40 seeds", () => {
    for (let seed = 0; seed < 40; seed++) {
      const game = new Campaign(createCampaign(seed));
      expect(game.state.vehicle.energy).toBe(game.maxEnergy);
      for (
        let elapsed = 0;
        elapsed < 60 && game.state.vehicle.energy > 0;
        elapsed += 1 / 30
      )
        game.tick(1 / 30, { down: true });
      expect(game.state.vehicle.energy, `seed ${seed}`).toBe(0);
      expect(game.depth, `seed ${seed}`).toBeGreaterThanOrEqual(290);
      expect(game.cargo).toHaveLength(7);
      expect(game.cargoValue).toBe(3800);
      const identities = game.cargo.map((item) => item.id);
      const preview = game.recoveryPreview;
      expect(preview).toMatchObject({
        freeTow: true,
        keepsCargo: true,
        cost: 0,
        remaining: 200,
      });
      game.recover();
      expect(game.atDock).toBe(true);
      expect(game.state.credits).toBe(200);
      expect(game.cargo.map((item) => item.id)).toEqual(identities);
      expect(game.state.progress.towsUsed).toEqual(["W01"]);
      expect(game.state.vehicle.energy).toBe(preview.energy);
      expect(game.state.vehicle.hull).toBe(preview.hull);
      expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
      expect(game.bank()).toBe(true);
      expect(game.sell()).toBeTruthy();
      expect(game.state.credits).toBe(4000);
    }
  }, 15000);

  it("keeps mission objects with a free tow, then charges and loses carried items on a later disablement", () => {
    const game = new Campaign(createCampaign(7));
    game.state.credits = 5000;
    const mission = game.world.missions[0]!;
    const ore = game.world.packages[0]!;
    mission.status = "carried";
    ore.status = "carried";
    game.state.vehicle.hull = 0;
    expect(game.recoveryPreview.freeTow).toBe(true);
    game.recover();
    expect(mission.status).toBe("carried");
    expect(ore.status).toBe("carried");
    expect(game.state.credits).toBe(5000);
    game.state.vehicle.energy = 0;
    expect(game.recoveryPreview).toMatchObject({
      freeTow: false,
      keepsCargo: false,
      cost: 1000,
    });
    game.recover();
    expect(mission.status).toBe("source");
    expect(ore.status).toBe("lost");
    expect(game.state.credits).toBe(4000);
    expect(game.state.progress.towsUsed).toEqual(["W01"]);
  });

  it("voluntary recovery charges without spending the first emergency tow, which is separate for each world", () => {
    const game = new Campaign(createCampaign(9));
    game.state.credits = 5000;
    expect(game.recoveryPreview.freeTow).toBe(false);
    game.recover();
    expect(game.state.credits).toBe(4000);
    expect(game.state.progress.towsUsed).toEqual([]);
    game.state.vehicle.energy = 0;
    game.recover();
    expect(game.state.progress.towsUsed).toEqual(["W01"]);
    game.state.progress.beacon = true;
    game.state.progress.bankedOre = 3;
    game.state.progress.completed = [1, 2, 3];
    game.state.progress.unlockedWorlds = ["W01", "W02", "W03"];
    for (const mission of game.world.missions) mission.status = "banked";
    expect(game.depart()).toBe(true);
    expect(game.travel("W02")).toBe(true);
    game.state.vehicle.energy = 0;
    expect(game.recoveryPreview.freeTow).toBe(true);
    game.recover();
    expect(game.state.progress.towsUsed).toEqual(["W01", "W02"]);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it.each([1, 2])(
    "defaults the tow ledger for schema %i without rewriting existing terrain or package values",
    (schema) => {
      const old = JSON.parse(JSON.stringify(createCampaign(14)));
      old.schema = schema;
      old.balanceVersion = "0.1";
      old.generatorVersion = 1;
      old.worlds.W01 = createW01V1(14);
      old.vehicle.energy = 3.25;
      delete old.progress.towsUsed;
      const tiles = [...old.worlds.W01.tiles];
      const values = old.worlds.W01.packages.map(
        (item: { value: number }) => item.value,
      );
      const restored = decodeCampaign(JSON.stringify(old));
      expect(restored.progress.towsUsed).toEqual([]);
      expect(restored.vehicle.energy).toBe(3.25);
      expect(restored.worlds.W01!.tiles).toEqual(tiles);
      expect(restored.worlds.W01!.packages.map((item) => item.value)).toEqual(
        values,
      );
    },
  );

  it.each([null, "W01", ["W01", "W01"], ["W99"], [1], {}])(
    "rejects malformed tow histories: %j",
    (towsUsed) => {
      const source = createCampaign(14);
      const raw = JSON.stringify({
        ...source,
        progress: { ...source.progress, towsUsed },
      });
      expect(() => decodeCampaign(raw)).toThrow(/tow history/);
    },
  );
});

function shaft(offset: number, column = 20) {
  const state = createCampaign(23);
  state.worlds.W01!.tiles.fill(1);
  state.worlds.W01!.packages = [];
  state.worlds.W01!.shelves = [];
  for (let row = 0; row < 15; row++)
    state.worlds.W01!.tiles[row * W01.width + column] = 0;
  state.vehicle.x = wrapCampaignX(column + 0.5 + offset);
  return new Campaign(state);
}

describe("forgiving shaft entry and drill input", () => {
  it("enters an existing shaft from offsets through ±0.45 within 250ms without cutting its rim, including at the wrap seam", () => {
    for (const column of [0, 20, 39])
      for (const offset of [0, -0.2, 0.2, -0.3, 0.3, -0.45, 0.45]) {
        const game = shaft(offset, column);
        const terrain = [...game.world.tiles];
        advance(game, 0.25, { down: true });
        expect(game.state.vehicle.y, `${column} + ${offset}`).toBeGreaterThan(
          -0.36,
        );
        expect(game.state.stats.mined).toBe(0);
        expect(game.drillTarget).toBeUndefined();
        expect(game.world.tiles).toEqual(terrain);
      }
  });

  it("still drills the selected adjacent column at ±0.55 and does not pull a walking or flying rig into a shaft", () => {
    for (const offset of [-0.55, 0.55]) {
      const game = shaft(offset);
      game.tick(1 / 120, { down: true });
      expect(game.drillTarget?.x).toBe(offset < 0 ? 19 : 21);
    }
    const walking = shaft(0.3);
    advance(walking, 0.25);
    expect(walking.state.vehicle.x).toBeCloseTo(20.8);
    expect(walking.state.vehicle.y).toBe(-0.36);
    const flying = shaft(0.3);
    advance(flying, 0.25, { up: true, down: true });
    expect(flying.state.vehicle.x).toBeCloseTo(20.8);
    expect(flying.state.vehicle.y).toBeLessThan(-0.36);
    expect(flying.drillTarget).toBeUndefined();
  });

  it("re-enters an upper ledge with one corner grounded, then drills the actual shaft floor above the deepest record", () => {
    for (const offset of [-0.45, 0.45]) {
      const game = shaft(offset);
      game.state.stats.largestDepth = 600;
      game.world.tiles.fill(1);
      // A previously excavated chamber opens into a short, narrow shaft.
      for (let row = 0; row < 8; row++)
        for (let column = 19; column <= 21; column++)
          game.world.tiles[row * W01.width + column] = 0;
      for (let row = 8; row < 12; row++)
        game.world.tiles[row * W01.width + 20] = 0;
      game.state.vehicle.y = 8 - 0.36;
      expect(game.grounded).toBe(true);
      expect(game.tile(20, 8)).toBe(0);
      advance(game, 0.25, { down: true });
      expect(game.state.vehicle.y).toBeGreaterThan(8 - 0.36);
      expect(game.drillTarget).toBeUndefined();
      for (let ticks = 0; ticks < 360 && !game.drillTarget; ticks++) {
        game.tick(1 / 120, { down: true });
        // Alignment never tunnels through either wall or leaves an invalid save.
        expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
      }
      expect(game.drillTarget).toEqual({ x: 20, y: 12 });
      for (let row = 8; row <= 12; row++) {
        expect(game.tile(19, row)).toBe(1);
        expect(game.tile(21, row)).toBe(1);
      }
      expect(game.state.stats.largestDepth).toBe(600);
    }
  });

  it("drills a returned solid ledge directly, with Down taking priority over lateral input", () => {
    for (const controls of [{ down: true }, { down: true, right: true }]) {
      const game = shaft(0);
      game.state.stats.largestDepth = 600;
      game.world.tiles.fill(1);
      for (let row = 0; row < 8; row++)
        for (let column = 19; column <= 21; column++)
          game.world.tiles[row * W01.width + column] = 0;
      game.state.vehicle.y = 8 - 0.36;
      game.tick(1 / 120, controls);
      expect(game.drillTarget).toEqual({ x: 20, y: 8 });
      expect(game.drillDirection).toBe("down");
    }
  });

  it("buffers a Down press 100ms before landing but forgets one 300ms before landing", () => {
    function landing(delay: number) {
      const game = new Campaign(createCampaign(5));
      // Find the native fall's landing time, then repeat it with a brief press.
      game.state.vehicle.y = -2;
      game.velocityY = 2;
      let landed = 0;
      while (!game.grounded && landed < 2) {
        game.tick(1 / 120);
        landed += 1 / 120;
      }
      const replay = new Campaign(createCampaign(5));
      replay.state.vehicle.y = -2;
      replay.velocityY = 2;
      advance(replay, Math.max(0, landed - delay - 1 / 120));
      replay.tick(1 / 120, { down: true });
      advance(replay, delay + 1 / 60);
      return replay;
    }
    expect(landing(0.1).drillTarget).toEqual({ x: 20, y: 0 });
    expect(landing(0.3).drillTarget).toBeUndefined();
  });

  it("freezes facing during a committed cut and obeys the next direction afterwards", () => {
    const game = new Campaign(createCampaign(6));
    game.tick(1 / 120, { down: true });
    advance(game, 0.1, { left: true });
    expect(game.drillDirection).toBe("down");
    expect(game.facing).toBe("right");
    advance(game, 1, { left: true });
    expect(game.facing).toBe("left");
    const lateral = shaft(0);
    lateral.state.vehicle.y = 15 - 0.36;
    lateral.tick(1 / 120, { right: true });
    expect(lateral.drillDirection).toBe("right");
    advance(lateral, 0.1, { left: true });
    expect(lateral.drillDirection).toBe("right");
    expect(lateral.facing).toBe("right");
  });

  it("clears an uncommitted tap on pause or focus loss while preserving a cut already in progress", () => {
    const airborne = new Campaign(createCampaign(5));
    airborne.state.vehicle.y = -0.5;
    airborne.velocityY = 2;
    airborne.tick(1 / 120, { down: true });
    const velocity = airborne.velocityY;
    airborne.clearInputAssist();
    expect(airborne.velocityY).toBe(velocity);
    advance(airborne, 0.15);
    expect(airborne.grounded).toBe(true);
    expect(airborne.drillTarget).toBeUndefined();
    expect(airborne.state.stats.mined).toBe(0);

    const drilling = new Campaign(createCampaign(5));
    drilling.tick(1 / 120, { down: true });
    expect(drilling.drillTarget).toEqual({ x: 20, y: 0 });
    drilling.clearInputAssist();
    expect(drilling.drillTarget).toEqual({ x: 20, y: 0 });
    advance(drilling, 1);
    expect(drilling.state.stats.mined).toBe(1);
    expect(drilling.drillTarget).toBeUndefined();
  });

  it("explains an airborne side cut at most once per three seconds and never blames a Down press", () => {
    const game = shaft(0.1);
    game.state.vehicle.y = 4;
    game.velocityX = 2;
    game.tick(1 / 120, { right: true });
    expect(game.message).toContain("Side drilling needs footing");
    game.message = "Another event";
    advance(game, 0.5, { right: true });
    expect(game.message).toBe("Another event");
    const down = shaft(0.1);
    down.state.vehicle.y = 4;
    down.tick(1 / 120, { right: true, down: true });
    expect(down.message).not.toContain("Side drilling needs footing");
  });

  it("does not turn an engine upgrade into ordinary landing damage", () => {
    for (const engine of [0, 1, 2]) {
      const game = shaft(0);
      game.state.hardware.engine = engine;
      game.state.vehicle.y = 0.5;
      advance(game, 8);
      expect(game.state.vehicle.y).toBeCloseTo(15 - 0.36, 5);
      expect(game.state.vehicle.hull).toBe(game.maxHull);
    }
  });
});
