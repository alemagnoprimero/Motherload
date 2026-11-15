/** A8 uses a native @2 raster on both @2 and @3 cave pages. */
import { mkdir, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import {
  backwallFrames,
  BACKWALL_DEFAULT,
  BACKWALL_SEED,
  BACKWALL_VARIANTS,
} from "./w01-backwall.mjs";
import { upsertFrames, writeProvenance } from "../kit/records.mjs";
import {
  canonicalPng,
  CANONICAL_PNG,
} from "../../../scripts/png-canonical.mjs";
import { RASTERIZER } from "../../../scripts/rasterize-campaign-svgs.mjs";

const source = new URL("./", import.meta.url),
  frames = backwallFrames();
await mkdir(source, { recursive: true });
for (const f of frames) {
  await writeFile(new URL(`${f.name}.svg`, source), f.svg + "\n");
  const png = new Resvg(f.svg, { font: { loadSystemFonts: false } }).render();
  if (png.width !== 1024 || png.height !== 384)
    throw new Error(`${f.name}: native strip size changed`);
  await writeFile(new URL(`${f.name}.png`, source), canonicalPng(png.asPng()));
}
await upsertFrames(new URL("frames.json", source), {
  frames: frames.map(({ body, svg, ...f }) => f),
});
await writeProvenance("w01-cave-backwall", {
  asset: 21,
  item: "A8",
  method:
    "Seeded layered SVG from hand-drawn periodic profiles, rasterized at native @2; capped source:raster on cave pages",
  source: {
    generator: "assets/campaign/source/w01-backwall.mjs",
    writer: "assets/campaign/source/create-backwall-sources.mjs",
    kit: ["random", "palette", "svg", "records"],
    seed: BACKWALL_SEED,
    variant: BACKWALL_DEFAULT,
    alternatives: BACKWALL_VARIANTS,
    rasterizer: RASTERIZER,
    encoding: CANONICAL_PNG,
    frames: frames.map((f) => f.name),
  },
  reference: {
    file: "docs/art-direction/d0-target-cavern-wide.png",
    use: "Manually drawn angular vault and low ridge silhouettes at matched tile scale; no reference pixels in generated art",
    palette: "docs/art-direction/swatches/w01-swatches.json",
    audit: "docs/ART_QUALITY_AUDIT.md §5.6 row 21; §6.1",
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
    "Two native @2 layers; flat cool tiers, no outlines, horizontal period512 logical px. Vertical repeat alternates the two upright192px sources in opposite phase per parallax slot for a384px (8tile) period; shared L*11 dark edges and flat collars make both joins continuous without reversing authored facets. T4 owns known-air clipping, parallax, reveal and recessed dug walls. Broad vaults are the provisional default; needles and shelves remain selectable.",
});
console.log(
  "A8: two native @2 periodic back-wall strips and provenance record.",
);
