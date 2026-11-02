import type { Campaign } from "../model";
import { WORLD_CATALOG } from "../config";
import { setText, setHidden } from "./dom";
import { money } from "./terminal/shared";
const worldName = (id: string) =>
  WORLD_CATALOG.find((world) => world.id === id)?.name ?? id;
export function renderTitle(campaign: Campaign, hasCheckpoint: boolean) {
  setText(
    "campaign-start",
    hasCheckpoint ? "Continue expedition" : "Deploy rig",
  );
  setHidden("campaign-title-new", !hasCheckpoint);
  setHidden("campaign-save-card", !hasCheckpoint);
  setText(
    "campaign-save-card",
    `${worldName(campaign.state.currentWorld)} · ${money(campaign.state.credits)} · ${campaign.completedMilestones.length}/3 milestones`,
  );
  setText(
    "campaign-title-location",
    worldName(campaign.state.currentWorld).toUpperCase(),
  );
}
