/** A8 review inputs: authored @2 strips, through the pinned resvg/Pillow path. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import {
  BACKWALL_VARIANTS,
  BACKWALL_DEFAULT,
  BACKWALL_SEED,
  BACKWALL_BASE,
  backwallFrames,
} from "../assets/campaign/source/w01-backwall.mjs";
import { CONCEPT_TILE } from "../assets/campaign/kit/review.mjs";

const out = resolve(process.argv[2] || "artifacts/art-review-a8");
await mkdir(out, { recursive: true });
const variants = [];
const resamples = [];
for (const variant of BACKWALL_VARIANTS) {
  await mkdir(`${out}/${variant}`, { recursive: true });
  const frames = [];
  for (const frame of backwallFrames({ variant })) {
    const source = `${variant}/${frame.name}.svg`;
    const x2 = `${variant}/${frame.name}-x2.png`;
    const board = `${variant}/${frame.name}-board.png`;
    await writeFile(`${out}/${source}`, frame.svg);
    await writeFile(
      `${out}/${x2}`,
      new Resvg(frame.svg, {
        font: { loadSystemFonts: false },
      })
        .render()
        .asPng(),
    );
    resamples.push({
      source: `${out}/${x2}`,
      target: `${out}/${board}`,
      width: Math.round((frame.width * CONCEPT_TILE) / 96),
      height: Math.round((frame.height * CONCEPT_TILE) / 96),
    });
    frames.push({
      name: frame.name,
      layer: frame.layer,
      width: frame.width,
      height: frame.height,
      logicalWidth: frame.logicalWidth,
      logicalHeight: frame.logicalHeight,
      maxDensity: frame.maxDensity,
      periodX: frame.periodX,
      periodY: frame.periodY,
      verticalRepeat: frame.verticalRepeat,
      verticalPartner: frame.verticalPartner,
      source,
      x2,
      board,
    });
  }
  variants.push({ variant, frames });
}
const resized = spawnSync(
  process.env.PYTHON || "python3",
  [
    "-c",
    "import json,sys; from PIL import Image\nfor row in json.load(sys.stdin):\n im=Image.open(row['source']).convert('RGBA')\n im.resize((row['width'],row['height']),Image.Resampling.LANCZOS).save(row['target'],compress_level=1)\n",
  ],
  { input: JSON.stringify(resamples), encoding: "utf8" },
);
if (resized.status !== 0)
  throw new Error(resized.stderr || "A8 review resampling failed");
await writeFile(
  `${out}/review.json`,
  JSON.stringify(
    {
      item: "A8",
      seed: BACKWALL_SEED,
      defaultVariant: BACKWALL_DEFAULT,
      base: BACKWALL_BASE,
      tile: CONCEPT_TILE,
      variants,
      board: "docs/art-direction/d0-target-cavern-wide.png",
      rasterPath:
        "Native @2 resvg; Pillow premultiplied Lanczos to board scale",
    },
    null,
    2,
  ) + "\n",
);
console.log(`A8: ${variants.length} variants in ${out}/review.json`);
