import type { Campaign } from "../model";
import { escapeMarkup } from "./dom";
import { money, button } from "./terminal/shared";
export function contractMarkup(campaign: Campaign) {
  return `<h2>Optional contracts</h2>${campaign.contractViews.map((contract) => `<article class="contract-card"><h3>${escapeMarkup(contract.title)}</h3><p>${escapeMarkup(contract.description)}</p><strong>${Math.min(contract.target, contract.progress)} / ${contract.target} · ${money(contract.reward)}</strong>${button((contract.accepted ? "contract-claim:" : "contract-accept:") + contract.id, contract.claimed ? "Claimed" : contract.completed ? "Collect reward" : contract.accepted ? "In progress" : "Accept contract", !campaign.atDock || contract.claimed || (contract.accepted && !contract.completed), contract.completed && !contract.claimed)}</article>`).join("")}`;
}
export function journalMarkup(campaign: Campaign) {
  return `<div class="journal-columns"><section>${contractMarkup(campaign)}</section><section><h2>Field journal</h2>${
    (campaign.world.fieldLogs ?? [])
      .filter((log) => log.read)
      .map(
        (log) =>
          `<article><h3>${escapeMarkup(log.title)}</h3><p>${escapeMarkup(log.text)}</p></article>`,
      )
      .join("") ||
    "<p>Read terminals at discovered sites to recover field logs.</p>"
  }</section></div>`;
}
export function claimMapMarkup(campaign: Campaign) {
  const world = campaign.world,
    width = world.width,
    rows = world.rows;
  const cells = world.discovered
    .flatMap((known, index) =>
      known
        ? [
            `<rect x="${index % width}" y="${Math.floor(index / width)}" width="1" height="1" fill="${world.tiles[index] === 0 ? "#29464e" : world.tiles[index] === 4 ? "#f6bc67" : "#8a9c92"}" data-map-x="${index % width}" data-map-y="${Math.floor(index / width)}"/>`,
          ]
        : [],
    )
    .join("");
  const points = (campaign.state.progress.waypoints ?? []).filter(
    (point) => point.worldId === world.id,
  );
  const labels = points
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r=".65" fill="#ffcf70"/>`,
    )
    .join("");
  return `<p>Only surveyed terrain appears. Select a known cell to mark it.</p><div class="claim-map-layout"><svg id="campaign-claim-canvas" role="img" aria-label="Surveyed mine and waypoints" viewBox="0 -2 ${width} ${rows + 2}"><rect x="0" y="-2" width="${width}" height="${rows + 2}" fill="#14262e"/>${cells}${labels}<circle cx="${campaign.state.vehicle.x}" cy="${campaign.state.vehicle.y}" r=".8" fill="#f8f4db"/></svg><aside>${button("waypoint-current", "Mark current position", campaign.state.vehicle.y < 0)}${points.map((point) => `<article><strong>${escapeMarkup(point.label)}</strong><p>${Math.round((point.y + 1) * 10)} m</p>${button("waypoint-remove:" + point.id, "Remove marker")}</article>`).join("") || "<p>No waypoints yet.</p>"}</aside></div>`;
}
