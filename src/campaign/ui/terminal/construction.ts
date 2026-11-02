import type { Campaign } from "../../model";
import { escapeMarkup } from "../dom";
import { button, money } from "./shared";
export function constructionMarkup(campaign: Campaign, busy: boolean) {
  const milestone = campaign.currentMilestone;
  const milestones = campaign.milestoneDefinitions
    .map(
      (item) =>
        `<span class="construction-stage ${campaign.completedMilestones.includes(item.id) ? "complete" : ""}">${item.id} · ${escapeMarkup(item.name)}</span>`,
    )
    .join("");
  const progress = `<div class="construction-stages">${milestones}</div>`;
  if (!milestone)
    return (
      progress +
      `<article class="construction-project"><h2>Chapter complete</h2><p>Your routes and discoveries remain yours.</p>${button(campaign.state.currentWorld === "W01" ? "depart" : "map", campaign.state.currentWorld === "W01" ? "Launch the restored lander" : "Open navigation", busy, true)}</article>`
    );
  return (
    progress +
    `<article class="construction-project"><p class="eyebrow">PROJECT ${milestone.id} / 3</p><h2>${escapeMarkup(milestone.name)}</h2><p>${escapeMarkup(milestone.description)}</p><strong>${money(milestone.fee)}</strong><p>${campaign.missionReady ? "Discoveries banked" : "Return the marked mission objects"}</p>${button("milestone", "Fund construction", busy || !campaign.missionReady || campaign.state.credits < milestone.fee, true)}${campaign.state.credits < milestone.fee ? `<small>Need ${money(milestone.fee - campaign.state.credits)}</small>` : ""}</article>`
  );
}
