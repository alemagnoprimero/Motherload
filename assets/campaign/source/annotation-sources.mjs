/**
 * Asset 28 (audit §5.6; item T8, decision D3): the annotation glyphs, drawn
 * with the art kit as hand-written layered SVG (pipeline B, decision D5).
 *
 *   ui-chevron-home     HOME's edge chevron, teal (D3: always on)
 *   ui-chevron-target   an off-screen target's edge chevron, amber (Scan;
 *                       T10 keeps it on)
 *   ui-pulse-ring       the ring around an on-screen target (Scan)
 *   ui-scan             the Scan glyph, on the tool-tray button
 *   ui-leader-tick      the tick from a displaced label back to its anchor
 *
 * They are `ui-*` glyphs, so the build exports them as DOM icons in
 * generated/icons (scripts/campaign-zones.mjs DOM_ONLY) and they take no room
 * on the runtime atlas pages: the annotations are DOM (render/annotations.ts).
 * Each frame lists the icon sizes the DOM loads (`iconSizes`); the largest
 * keeps a 24 px chevron sharp at DPR 3.
 *
 * Style guide §6.1: the brightest and warmest pixels are emitters, never UI,
 * so the glyphs stay below the lamp's value and saturation: two flat tones per
 * shape with a hard facet line, the prop outline (#14232b), no glow.
 *
 * Run by `npm run assets:rebuild` after create-w01-sources.mjs, which
 * rewrites frames.json whole; upsertFrames() adds these records back.
 * Authoring only.
 */
import { writeFile } from "node:fs/promises";
import { OUTLINE, lab, withL } from "../kit/palette.mjs";
import {
  circle,
  layer,
  num,
  pathData,
  polygon,
  svgDocument,
} from "../kit/svg.mjs";
import { upsertFrames, writeProvenance } from "../kit/records.mjs";

const source = new URL("./", import.meta.url);

/** Tones: two flat tiers per glyph (lit facet, body), below emitter value. */
export const ANNOTATION_TONES = {
  // HOME: the HUD's teal family (.home-beacon #80b7ae / #b9efe3).
  home: { lit: withL("#86d6c8", 82), body: withL("#4fae9f", 66) },
  // Targets: the signal amber of the HUD (--signal #f0bb69), less saturated.
  target: { lit: withL("#efc98a", 83), body: withL("#d39f52", 70) },
  // Neutral marks (Scan glyph, leader tick): the HUD's icon grey-teal.
  mark: { lit: withL("#d5e4e0", 90), body: withL("#a9c0bc", 77) },
};

/**
 * The edge chevron on a 96 px canvas (it shows at 24 CSS px): an arrowhead
 * pointing right at 0 rad, split along its axis into a lit upper facet and a
 * body lower facet, with the outline. The game rotates it towards the target.
 */
export function chevron(tone) {
  const tip = [86, 48],
    top = [22, 12],
    notch = [42, 48],
    bottom = [22, 84];
  const outline = 6;
  return (
    layer(
      "chevron-ink",
      `<path d="${pathData([tip, top, notch, bottom])}" fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${num(outline * 2)}" stroke-linejoin="round"/>`,
    ) +
    layer("chevron-lit", polygon([tip, top, notch], tone.lit)) +
    layer("chevron-body", polygon([tip, notch, bottom], tone.body))
  );
}

/**
 * The pulse ring on a 192 px canvas (it shows about 1.1 tiles across): an
 * amber ring inside a dark keyline on both sides, with two short side ticks,
 * as the old canvas ring had. Its art fills the frame; the game scales it on
 * the scene clock (reduced motion keeps it still).
 */
export function pulseRing(tone) {
  const c = 96,
    r = 78,
    ink = 13,
    band = 6;
  const ticks = [-1, 1]
    .map((side) => {
      const x = c + side * (r + 9);
      return `<path d="M${num(x)} ${num(c - 9)} V${num(c + 9)}" fill="none" stroke="${OUTLINE}" stroke-width="${num(ink)}"/><path d="M${num(x)} ${num(c - 9)} V${num(c + 9)}" fill="none" stroke="${tone.body}" stroke-width="${num(band)}"/>`;
    })
    .join("");
  return (
    layer(
      "ring-ink",
      circle(c, c, r, "none", { stroke: OUTLINE, "stroke-width": ink }),
    ) +
    // Two tiers: the upper arc lit, the lower arc in the body tone.
    layer(
      "ring-body",
      circle(c, c, r, "none", { stroke: tone.body, "stroke-width": band }),
    ) +
    layer(
      "ring-lit",
      `<path d="M${num(c - r)} ${c} A${r} ${r} 0 0 1 ${num(c + r)} ${c}" fill="none" stroke="${tone.lit}" stroke-width="${num(band)}"/>`,
    ) +
    layer("ring-ticks", ticks)
  );
}

/**
 * The Scan glyph on a 96 px canvas (the tray button shows it at 30 px): a
 * sensor dot and three arcs of its sweep, lit above the axis and body below.
 */
export function scanGlyph(tone) {
  const cx = 24,
    cy = 72;
  const arc = (r, colour, width) =>
    `<path d="M${num(cx)} ${num(cy - r)} A${r} ${r} 0 0 1 ${num(cx + r)} ${num(cy)}" fill="none" stroke="${colour}" stroke-width="${num(width)}"/>`;
  let ink = "",
    lit = "";
  for (const r of [22, 40, 58]) {
    ink += arc(r, OUTLINE, 12);
    lit += arc(r, tone.lit, 6);
  }
  return (
    layer("scan-ink", ink + circle(cx, cy, 11, OUTLINE)) +
    layer("scan-arcs", lit) +
    layer("scan-dot", circle(cx, cy, 7.5, tone.body))
  );
}

/**
 * The leader tick on a 96 px canvas (it shows at 10 CSS px): a short bar
 * pointing right at 0 rad, from a label's edge towards its anchor.
 */
export function leaderTick(tone) {
  return (
    layer(
      "tick-ink",
      `<path d="M14 48 H82" fill="none" stroke="${OUTLINE}" stroke-width="22"/>`,
    ) +
    layer(
      "tick-body",
      `<path d="M14 48 H82" fill="none" stroke="${tone.body}" stroke-width="10"/>`,
    ) +
    layer(
      "tick-lit",
      polygon(
        [
          [14, 43],
          [82, 43],
          [82, 48],
          [14, 48],
        ],
        tone.lit,
      ),
    )
  );
}

/** Frames, sizes and the icon sizes the DOM loads. */
export const ANNOTATION_FRAMES = [
  {
    name: "ui-chevron-home",
    size: 96,
    iconSizes: [24, 48, 72],
    draw: () => chevron(ANNOTATION_TONES.home),
  },
  {
    name: "ui-chevron-target",
    size: 96,
    iconSizes: [24, 48, 72],
    draw: () => chevron(ANNOTATION_TONES.target),
  },
  {
    name: "ui-pulse-ring",
    size: 192,
    iconSizes: [64, 128, 192],
    draw: () => pulseRing(ANNOTATION_TONES.target),
  },
  {
    name: "ui-scan",
    size: 96,
    iconSizes: [24, 48, 72],
    draw: () => scanGlyph(ANNOTATION_TONES.mark),
  },
  {
    name: "ui-leader-tick",
    size: 96,
    iconSizes: [24, 48, 72],
    draw: () => leaderTick(ANNOTATION_TONES.mark),
  },
];

/** The L* of each tone, for the provenance record and the review. */
export function toneLightness() {
  return Object.fromEntries(
    Object.entries(ANNOTATION_TONES).map(([key, tone]) => [
      key,
      {
        lit: Number(lab(tone.lit)[0].toFixed(1)),
        body: Number(lab(tone.body)[0].toFixed(1)),
      },
    ]),
  );
}

async function main() {
  for (const frame of ANNOTATION_FRAMES)
    await writeFile(
      new URL(`${frame.name}.svg`, source),
      svgDocument(frame.size, frame.size, frame.draw(), frame.name),
    );
  await upsertFrames(new URL("frames.json", source), {
    frames: ANNOTATION_FRAMES.map((frame) => ({
      name: frame.name,
      width: frame.size,
      height: frame.size,
      logicalWidth: frame.size / 2,
      logicalHeight: frame.size / 2,
      category: "glyph",
      iconSizes: frame.iconSizes,
    })),
  });
  await writeProvenance("w01-annotations", {
    asset: 28,
    item: "T8",
    method:
      "hand-written layered SVG through the art kit (pipeline B, decision D5)",
    source: {
      generator:
        "assets/campaign/source/annotation-sources.mjs: chevron(), pulseRing(), scanGlyph(), leaderTick(), ANNOTATION_TONES",
      kit: "assets/campaign/kit/ (palette, svg, records)",
      palette: {
        rule: "style guide §6.1: emitters are the brightest and warmest pixels, never UI; two flat tiers per glyph and the #14232b prop outline",
        lightness: toneLightness(),
        derived:
          "teal from the HUD's HOME beacon (#80b7ae, #b9efe3), amber from the HUD's signal (#f0bb69), grey-teal from the HUD glyphs (#c3d5d6)",
      },
      frames: ANNOTATION_FRAMES.map((frame) => frame.name),
    },
    reference: {
      file: "docs/ART_QUALITY_AUDIT.md",
      use: "§5.6 row 28 (edge chevron, pulse ring, Scan glyph, leader tick; 22 px SVG), docs/art-audit/04-overlays.md R1 and R3 (teal HOME chevron, amber target chevron, leader tick); the board shows no annotation, so no board crop is a reference",
      audit:
        "docs/ART_QUALITY_AUDIT.md §5.3 T8, D3; docs/art-direction/decisions.md D3",
    },
    reviewer: {
      name: "Alejandro (art director)",
      signed: null,
      state: "in review (T8 pull request)",
      fixtures: ["a04-dive-60m@2", "a04p-dive-60m-phone@3"],
    },
    redrawnShare: 0,
    underlays: [],
    boardPixelsCopied: false,
    recorded: "2026-11-10",
    notes:
      "DOM-only glyphs (generated/icons at each frame's iconSizes); no runtime atlas page holds them.",
  });
  console.log(
    `Asset 28: ${ANNOTATION_FRAMES.length} annotation glyphs written.`,
  );
}

await main();
