import type Phaser from "phaser";
import { W01_ORES } from "./campaign/config";

export type OreMarker = "dot" | "parallel" | "bars" | "triangle";

const MARKERS = [
  { marker: "dot", glyph: "●", pattern: "Round dot" },
  { marker: "parallel", glyph: "Ⅱ", pattern: "Two vertical bars" },
  { marker: "bars", glyph: "≡", pattern: "Three horizontal bars" },
  { marker: "triangle", glyph: "▲", pattern: "Triangle" },
] as const;

export const campaignOreMarker = (number: number) =>
  MARKERS[number - 1] ?? MARKERS[0];
export const CAMPAIGN_ORE_LEGEND = W01_ORES.map((ore, index) => ({
  id: ore.id,
  name: ore.name,
  value: ore.value,
  bulk: ore.bulk,
  ...campaignOreMarker(index + 1),
}));
export const CAMPAIGN_HAZARD_LEGEND = [
  {
    glyph: "▰",
    name: "Bedrock",
    description: "Solid boundary rock cannot be drilled.",
  },
  {
    glyph: "!",
    name: "Unstable shelf",
    description: "Cracked rock warns before collapsing; move clear.",
  },
] as const;

/** Small white inlays identify known minerals without relying on their color. */
export function drawOreMarker(
  graphics: Phaser.GameObjects.Graphics,
  marker: OreMarker,
  x: number,
  y: number,
  size: number,
  alpha = 1,
) {
  const r = size / 2;
  graphics.fillStyle(0x07121c, alpha * 0.78);
  graphics.fillCircle(x, y, r + 3);
  graphics.lineStyle(1.6, 0xe8f0f5, alpha);
  graphics.fillStyle(0xe8f0f5, alpha);
  if (marker === "dot") graphics.fillCircle(x, y, r * 0.5);
  else if (marker === "parallel") {
    for (const offset of [-r * 0.35, r * 0.35])
      graphics.lineBetween(x + offset, y - r * 0.7, x + offset, y + r * 0.7);
  } else if (marker === "bars") {
    for (const offset of [-r * 0.6, 0, r * 0.6])
      graphics.lineBetween(x - r * 0.75, y + offset, x + r * 0.75, y + offset);
  } else if (marker === "triangle")
    graphics.fillTriangle(
      x,
      y - r * 0.8,
      x - r * 0.75,
      y + r * 0.65,
      x + r * 0.75,
      y + r * 0.65,
    );
}
