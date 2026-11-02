import { Campaign, campaignDelta } from "../../src/campaign/model";
import type { CampaignControls } from "../../src/campaign/types";

export const FRAME = 1 / 60;

/** Runs production physics; a bounded failure is never treated as a completed trip. */
export function until(
  game: Campaign,
  controls: CampaignControls | (() => CampaignControls),
  predicate: () => boolean,
  limit = 90,
) {
  let elapsed = 0;
  while (!predicate() && elapsed < limit) {
    game.tick(FRAME, typeof controls === "function" ? controls() : controls);
    elapsed += FRAME;
  }
  if (!predicate())
    throw new Error(
      `Native path timed out at ${JSON.stringify(game.state.vehicle)}: ${game.message}`,
    );
  return elapsed;
}

export function drive(game: Campaign, target: number) {
  return until(
    game,
    () => {
      const delta = campaignDelta(
        game.state.vehicle.x,
        target,
        game.world.width,
      );
      const desired = Math.max(-5, Math.min(5, delta * 3));
      const direction = desired - game.velocityX;
      return { left: direction < -0.15, right: direction > 0.15 };
    },
    () =>
      Math.abs(campaignDelta(game.state.vehicle.x, target, game.world.width)) <
        0.08 &&
      Math.abs(game.velocityX) < 0.4 &&
      Math.abs(game.state.vehicle.y + 0.36) < 0.001,
    45,
  );
}

export function returnToDock(game: Campaign) {
  until(game, { up: true }, () => game.state.vehicle.y <= -0.36);
  drive(game, game.activeWorldDefinition.dockX);
  if (!game.atDock) throw new Error("Native return missed the docking bay");
}

/** An excavated test shaft isolates motion from drilling, hazards and pickups. */
export function clearShaft(game: Campaign, column: number, depth: number) {
  for (let row = 0; row < depth; row++)
    game.world.tiles[row * game.world.width + column] = 0;
  game.world.tiles[depth * game.world.width + column] = 1;
  game.world.shelves = [];
  game.world.pressureSeams = [];
  for (const item of game.world.packages)
    if (Math.floor(item.x) === column && item.status !== "carried")
      item.status = "lost";
  game.state.vehicle.x = column + 0.5;
  game.state.vehicle.y = depth - 0.36;
  game.velocityX = game.velocityY = 0;
}
