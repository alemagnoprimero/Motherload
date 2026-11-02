import type { Campaign } from "../model";
import { W02_ORES } from "../frontier";
import {
  CAMPAIGN_ORE_LEGEND,
  CAMPAIGN_HAZARD_LEGEND,
} from "../../mineral-legend";
import { itemName } from "../names";
import { patchMarkup, byId as $, escapeMarkup as escape } from "./dom";
import { money } from "./terminal/shared";
export function renderLegend(campaign: Campaign) {
  const comet = campaign.state.currentWorld === "W02";
  const patterns = [
    "Low chipped cluster",
    "Paired elongated facets",
    "Three-point radial crystal · volatile",
    "Hollow geometric crown · volatile",
  ];
  const definitions = comet
    ? W02_ORES.map((item, index) => ({
        ...item,
        glyph: ["◒", "◈", "✦", "⬡"][index]!,
        pattern: patterns[index]!,
      }))
    : CAMPAIGN_ORE_LEGEND;
  const ores = definitions.map((ore) => {
    const source =
      campaign.world.packages.find(
        (item) => item.itemId === ore.id && !item.processedBy.length,
      ) ?? campaign.world.packages.find((item) => item.itemId === ore.id);
    return {
      ...ore,
      value: source?.value ?? ore.value,
      bulk: source?.bulk ?? ore.bulk,
    };
  });
  const hazards = comet
    ? [
        {
          glyph: "≈",
          name: "Cold pocket",
          description:
            "Mist warns before a four-second acceleration reduction. Move clear during the warning.",
        },
        {
          glyph: "↑",
          name: "Ice vent",
          description:
            "A jet deals 6 hull on contact, at most once every three seconds. Keep a retreat route.",
        },
        {
          glyph: "◇",
          name: "Volatile extraction",
          description:
            "Release drilling at completion. The first three new-world cuts allow 1.5 seconds; later cuts allow 0.75 seconds. Mission samples have no sale value.",
        },
      ]
    : [
        ...CAMPAIGN_HAZARD_LEGEND,
        ...((campaign.world.generatorVersion ?? 1) >= 2
          ? [
              {
                glyph: "▥",
                name: "Fused plate",
                description:
                  "A continuous hard layer. Install a rank-1 drill to cross it.",
              },
              {
                glyph: "!",
                name: "Pressure seam",
                description:
                  "Hissing warns for 1.2 seconds. Move away before the burst; hull upgrades reduce its damage.",
              },
            ]
          : []),
      ];
  patchMarkup(
    $("campaign-legend-list"),
    ores
      .map(
        (item) =>
          '<li><span class="legend-glyph" aria-hidden="true">' +
          item.glyph +
          "</span><div><strong>" +
          escape(itemName(item.id, item.name)) +
          "</strong><small>" +
          escape(item.pattern) +
          " · " +
          money(item.value) +
          " · " +
          item.bulk +
          " bulk</small></div></li>",
      )
      .join("") +
      hazards
        .map(
          (item) =>
            '<li><span class="legend-glyph" aria-hidden="true">' +
            item.glyph +
            "</span><div><strong>" +
            escape(item.name) +
            "</strong><small>" +
            escape(item.description) +
            "</small></div></li>",
        )
        .join(""),
  );
}
