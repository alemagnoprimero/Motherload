/**
 * A7 review inputs. Three selectable generator recipes, rendered by the same
 * pinned resvg path as the asset build at @2x, @4x and the board's tile scale.
 * No board pixels are read by the generator; the Python sheet builder uses
 * them only as the labelled reference beside the authored drawings.
 *
 * node scripts/art-review-a7.mjs OUT
 * python3 scripts/art-review-a7.py OUT/review.json docs/qa/a7-cave-dressing
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import {
  DRESSING_DEFAULTS,
  DRESSING_VARIANTS,
  dressingFrames,
} from "../assets/campaign/source/w01-dressing.mjs";
import { CONCEPT_TILE } from "../assets/campaign/kit/review.mjs";

const out = resolve(process.argv[2] || "artifacts/art-review-a7");
const seed = "DF-A7-2026-11-14";
await mkdir(out, { recursive: true });
const copperSource = await readFile(
  new URL("../assets/campaign/source/ore-o2.svg", import.meta.url),
  "utf8",
);
await writeFile(
  `${out}/copper-board.png`,
  new Resvg(copperSource, {
    fitTo: { mode: "width", value: Math.round(CONCEPT_TILE * 0.9) },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng(),
);
const variants = [];
const resamples = [];
for (const variant of DRESSING_VARIANTS) {
  const selected = Object.fromEntries(
    Object.keys(DRESSING_DEFAULTS).map((family) => [family, variant]),
  );
  const frames = [];
  await mkdir(`${out}/${variant}`, { recursive: true });
  for (const frame of dressingFrames({ variants: selected, seed })) {
    const source = `${variant}/${frame.name}.svg`;
    await writeFile(`${out}/${source}`, frame.svg);
    const files = {};
    for (const [label, scale] of [
      ["x2", 1],
      ["x4", 2],
      ["board", CONCEPT_TILE / 96],
    ]) {
      const file = `${variant}/${frame.name}-${label}.png`;
      if (label === "x4") {
        const raster = new Resvg(frame.svg, {
          fitTo: { mode: "width", value: Math.round(frame.width * scale) },
          font: { loadSystemFonts: false },
        }).render();
        await writeFile(`${out}/${file}`, raster.asPng());
      } else {
        resamples.push({
          source: `${out}/${variant}/${frame.name}-x4.png`,
          target: `${out}/${file}`,
          width: Math.round(frame.width * scale),
          height: Math.round(frame.height * scale),
        });
      }
      files[label] = file;
    }
    frames.push({
      name: frame.name,
      family: frame.family,
      variant: frame.variant,
      anchor: frame.anchor,
      ...(frame.animation
        ? { animation: frame.animation, phase: frame.phase }
        : {}),
      width: frame.width,
      height: frame.height,
      logicalWidth: frame.logicalWidth,
      logicalHeight: frame.logicalHeight,
      source,
      ...files,
    });
  }
  variants.push({ variant, frames });
}
// Match source:raster: the SVG is rasterized at @4, then Pillow performs
// premultiplied Lanczos resampling, as rasterize-campaign-svgs.mjs does.
const resized = spawnSync(
  process.env.PYTHON || "python3",
  [
    "-c",
    "import json,sys; from PIL import Image\nfor row in json.load(sys.stdin):\n im=Image.open(row['source']).convert('RGBA')\n im.resize((row['width'],row['height']), Image.Resampling.LANCZOS).save(row['target'],compress_level=1)\n",
  ],
  { input: JSON.stringify(resamples), encoding: "utf8" },
);
if (resized.status !== 0)
  throw new Error(resized.stderr || "A7 review raster resampling failed");
await writeFile(
  `${out}/review.json`,
  JSON.stringify(
    {
      item: "A7",
      seed,
      defaultVariants: DRESSING_DEFAULTS,
      tile: CONCEPT_TILE,
      rasterPath:
        "resvg @4; Pillow premultiplied Lanczos to @2 and board scale",
      board: "docs/art-direction/d0-target-cavern-wide.png",
      variants,
    },
    null,
    2,
  ) + "\n",
);
console.log(`A7: ${variants.length} variants in ${out}/review.json`);
