/** A7 authoring driver, run after create-w01-sources rewrites frames.json.
 * The raster masters are generated, never painted: layered SVG -> pinned
 * resvg -> pinned canonical PNG. The normal raster path derives zone pages.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import {
  dressingFrames,
  DRESSING_DEFAULTS,
  DRESSING_SEED,
} from "./w01-dressing.mjs";
import { upsertFrames, writeProvenance } from "../kit/records.mjs";
import {
  canonicalPng,
  CANONICAL_PNG,
} from "../../../scripts/png-canonical.mjs";
import { RASTERIZER } from "../../../scripts/rasterize-campaign-svgs.mjs";

const directory = new URL("./", import.meta.url);
await mkdir(directory, { recursive: true });
const frames = dressingFrames();
for (const record of frames) {
  await writeFile(new URL(`${record.name}.svg`, directory), record.svg + "\n");
  const rendered = new Resvg(record.svg, {
    fitTo: { mode: "width", value: record.width * 2 },
    font: { loadSystemFonts: false },
  }).render();
  if (
    rendered.width !== record.width * 2 ||
    rendered.height !== record.height * 2
  )
    throw new Error(`${record.name}: incorrect @4 raster dimensions`);
  await writeFile(
    new URL(`${record.name}.png`, directory),
    canonicalPng(rendered.asPng()),
  );
}
await upsertFrames(new URL("frames.json", directory), {
  frames: frames.map(({ body, svg, ...record }) => record),
});
const generated = new URL("../generated/", import.meta.url);
await mkdir(generated, { recursive: true });
await writeFile(
  new URL("w01-dressing.json", generated),
  JSON.stringify(
    {
      version: 1,
      logicalTile: 48,
      frames: frames.map((f) => ({
        name: f.name,
        width: f.width,
        height: f.height,
        logicalWidth: f.logicalWidth,
        logicalHeight: f.logicalHeight,
        anchor: f.anchor ?? "particle",
        baseline: f.baseline,
        family: f.family,
        highContrast: f.highContrast,
        phase: f.phase,
      })),
    },
    null,
    2,
  ) + "\n",
);
for (const [family, asset] of Object.entries({
  stalactite: 16,
  rust: 17,
  rubble: 18,
  boulder: 19,
  crystal: 20,
})) {
  await writeProvenance(`w01-cave-${family}`, {
    asset,
    item: "A7",
    method:
      "Seeded layered SVG from hand-drawn archetypes, rasterized to generated @4 PNG masters; source:raster zone pages",
    source: {
      generator: "assets/campaign/source/w01-dressing.mjs",
      writer: "assets/campaign/source/create-dressing-sources.mjs",
      kit: [
        "random",
        "palette",
        "svg",
        "records",
        "emissive",
        "rock-chunk",
        "rust",
      ],
      seed: DRESSING_SEED,
      variant: DRESSING_DEFAULTS[family],
      alternatives: ["facets", "splinter", "shelf"],
      rasterizer: RASTERIZER,
      encoding: CANONICAL_PNG,
      frames: frames.filter((f) => f.family === family).map((f) => f.name),
    },
    reference: {
      file: "docs/art-direction/d0-target-cavern-wide.png",
      use: "Manually drawn ceiling needles, branching rust, angular rubble, low boulders and pointed crystal clusters at the board's tile scale; no reference pixels used by the generator",
      palette: "docs/art-direction/swatches/w01-swatches.json",
      audit: `docs/ART_QUALITY_AUDIT.md §5.6 row ${asset}; §6.1`,
    },
    reviewer: {
      name: "Alejandro (art director)",
      signed: null,
      state: "in review",
      fixtures: ["60m", "150m", "330m", "SITE-4"],
    },
    redrawnShare: 1,
    underlays: [],
    boardPixelsCopied: false,
    recorded: "2026-11-14",
    notes:
      family === "crystal"
        ? "D8 violet #bd8df6. HC body L*42, lit facet54, shadow29; black zero-energy ADD sparkle keeps the value below copper. Director confirmation pending."
        : family === "rust"
          ? "Drip decals and six particle phases only; T2 owns rust seams."
          : family === "boulder"
            ? "Authored for T6 foreground layer; T5 temporarily draws below the rig."
            : "Three selectable styles; seeded changes move facet junctions without replacing the authored contours with noise.",
  });
}
console.log(
  `A7: ${frames.length} layered SVGs and generated @4 raster masters, five provenance records.`,
);
