import type { Campaign } from "../model";
import { WORLD_CATALOG } from "../config";
import { journalMarkup, claimMapMarkup } from "./journal";
import { button as viewButton } from "./terminal/shared";
import {
  patchMarkup,
  escapeMarkup as escape,
  byId as $,
  setHidden,
} from "./dom";
export function renderNavigation(
  campaign: Campaign,
  mapTab: string,
  busy: boolean,
) {
  const button = (
    command: string,
    label: string,
    disabled = false,
    primary = false,
  ) => viewButton(command, label, disabled || busy, primary);
  setHidden("campaign-map-worlds", mapTab !== "stars");
  setHidden("campaign-claim-map", mapTab !== "claim");
  setHidden("campaign-field-journal", mapTab !== "journal");
  patchMarkup($("campaign-claim-map"), claimMapMarkup(campaign));
  patchMarkup($("campaign-field-journal"), journalMarkup(campaign));
  const state = campaign.state;
  $("campaign-map-copy").textContent = state.progress.departed
    ? "Choose an established destination or continue into the Ice comet. Travel starts at the lander and keeps every excavated route."
    : "Restore the navigation core, finish construction and record the Frontier departure at the lander to reach the Ice comet.";
  patchMarkup(
    $("campaign-map-worlds"),
    '<svg class="navigation-routes" viewBox="0 0 640 150" aria-label="Frontier routes: asteroid to comet or moon, comet to iron planet" role="img"><path d="M90 75 300 36 545 36M90 75 300 116" stroke="#739f9b" stroke-width="2" fill="none" stroke-dasharray="7 7"/><g fill="#d6c18b" stroke="#324d55" stroke-width="4"><circle cx="90" cy="75" r="16"/><circle cx="300" cy="36" r="12"/><circle cx="300" cy="116" r="10"/><circle cx="545" cy="36" r="18"/></g><g fill="#e5eee0" font-family="Inter, sans-serif" font-size="14"><text x="58" y="116">Asteroid</text><text x="329" y="41">Comet</text><text x="329" y="121">Moon</text><text x="506" y="82">Iron planet</text></g></svg>' +
      WORLD_CATALOG.slice(0, 4)
        .map((world) => {
          const current = world.id === state.currentWorld;
          const visited = Boolean(state.worlds[world.id]);
          const playable = world.id === "W01" || world.id === "W02";
          const preview = campaign.travelPreview(world.id);
          const charted = state.progress.unlockedWorlds.includes(world.id);
          const status = current
            ? "CURRENT DESTINATION"
            : playable
              ? visited
                ? "RETURN ROUTE"
                : state.progress.departed
                  ? "AVAILABLE"
                  : "LOCKED"
              : charted
                ? "CHARTED · IN DEVELOPMENT"
                : "LOCKED · IN DEVELOPMENT";
          const description =
            world.id === "W01"
              ? "Return to your established shafts, banked cargo and restored lander."
              : world.id === "W02"
                ? "Preserve volatile crystals, recover cryogenic samples and build a comet condenser."
                : world.id === "W03"
                  ? "A future route through unstable stone, fault surveys and supported crossings."
                  : "A future planetary mine beyond the Planetary certificate.";
          const progress = current
            ? campaign.completedMilestones.length + "/3 milestones complete"
            : world.id === "W01"
              ? state.progress.completed.length + "/3 milestones complete"
              : visited
                ? "Established routes retained"
                : "";
          return (
            '<article class="world-card world-' +
            world.id.toLowerCase() +
            '" data-world="' +
            world.id +
            '">' +
            planetArt(world.id) +
            '<p class="eyebrow">' +
            world.id +
            " · " +
            status +
            "</p><h2>" +
            world.name +
            "</h2><p>" +
            description +
            "</p><small>" +
            escape(
              progress ||
                (playable
                  ? preview.reason
                  : world.id === "W04"
                    ? charted
                      ? "Planetary certificate secured · not yet playable"
                      : "Requires the Planetary certificate · not yet playable"
                    : "The moon branch is not yet playable"),
            ) +
            "</small>" +
            (!current && playable
              ? button(
                  "travel-" + world.id,
                  (visited ? "Return to " : "Travel to ") + world.name,
                  !preview.allowed,
                  preview.allowed,
                ) +
                (!preview.allowed && progress
                  ? '<small class="travel-reason">' +
                    escape(preview.reason) +
                    "</small>"
                  : "")
              : "") +
            "</article>"
          );
        })
        .join(""),
  );
}

function planetArt(id: string) {
  const shape =
    id === "W01"
      ? '<path d="M27 30 68 14 96 43 90 78 49 99 15 64Z" fill="#bd9265"/><path d="m27 30 30 12 11-28M15 64l42-22 33 36M49 99l8-57 39 1" fill="none" stroke="#5d5a4b" stroke-width="5"/>'
      : id === "W02"
        ? '<path d="M26 71 3 106 79 88 111 15 42 40Z" fill="#5d9fb1" opacity=".5"/><path d="m39 23 43 5 19 35-29 31-43-15-9-30Z" fill="#a8d6d7"/><path d="m39 23 12 40 50 0M29 79l22-16 21 31M82 28 51 63" stroke="#568a9c" stroke-width="5" fill="none"/>'
        : '<circle cx="60" cy="60" r="42" fill="' +
          (id === "W03" ? "#9d9c91" : "#bf7759") +
          '"/><path d="m35 27 19 27-12 29m12-29 29-6M54 54l22 37" stroke="#464b48" stroke-width="5" fill="none"/>';
  return `<svg class="planet-art" viewBox="0 0 120 120" aria-hidden="true">${shape}</svg>`;
}
