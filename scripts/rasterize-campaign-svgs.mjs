/**
 * Authoring helper shared by both worlds. No browser is needed at runtime or
 * at build time.
 *
 * Audit T13b (byte-identical rebuilds): SVG frames are rasterized by resvg
 * (@resvg/resvg-js, pinned exactly in package.json) instead of a browser
 * screenshot. resvg renders the same pixels on every run, with no page load
 * to race against and no browser version to drift with. System fonts are not
 * loaded, so a build never depends on the fonts a machine has installed; the
 * sources draw no text.
 *
 * The PNGs written here are intermediates in .cache/. The builds re-encode
 * every PNG they commit with scripts/png-canonical.mjs, so the committed bytes
 * depend only on the pixels.
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const { version } = createRequire(import.meta.url)(
  "@resvg/resvg-js/package.json",
);
/** Written into provenance records next to the frames it rendered. */
export const RASTERIZER = `resvg ${version} (@resvg/resvg-js)`;

/**
 * Audit T13a: a frame listed with `"source": "raster"` is a PNG beside the
 * SVGs (`<name>.png`) instead of a drawing. Each page gets it at the frame's
 * size for that page, Lanczos-resampled (Pillow works in premultiplied alpha,
 * so edges keep their colour) or copied pixel for pixel when the PNG is
 * already that size. Pillow's resampling is integer and fixed-point
 * arithmetic, so the pixels are the same on every run; the file is an
 * intermediate, saved with fast compression.
 */
const RESAMPLE = String.raw`
import sys
from PIL import Image
source, target, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
image = Image.open(source).convert('RGBA')
if image.size != (width, height):
    image = image.resize((width, height), Image.Resampling.LANCZOS)
image.save(target, compress_level=1)
`;

function resampleRaster(frame, source, output, scale) {
  const result = spawnSync(
    process.env.PYTHON || "python",
    [
      "-c",
      RESAMPLE,
      fileURLToPath(new URL(`${frame.name}.png`, source)),
      fileURLToPath(new URL(`${frame.name}.png`, output)),
      String(Math.round(frame.width * scale)),
      String(Math.round(frame.height * scale)),
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(`Raster source ${frame.name}.png could not be resampled`);
}

/**
 * Render every frame and background of `manifest` from `source` (a folder
 * URL holding `<name>.svg`, or `<name>.png` for raster frames) into `output`
 * at `scale` times the frame's size: the drawing is fitted to
 * round(width × scale) px wide and must come out round(height × scale) px
 * tall.
 */
export async function rasterizeCampaignSources(
  source,
  output,
  manifest,
  scale = 1,
) {
  for (const frame of [...manifest.frames, ...manifest.backgrounds]) {
    if (frame.source === "raster") {
      resampleRaster(frame, source, output, scale);
      continue;
    }
    const drawing = await readFile(new URL(`${frame.name}.svg`, source));
    const width = Math.round(frame.width * scale);
    const height = Math.round(frame.height * scale);
    const image = new Resvg(drawing, {
      fitTo: { mode: "width", value: width },
      font: { loadSystemFonts: false },
    }).render();
    if (image.width !== width || image.height !== height)
      throw new Error(
        `${frame.name}: resvg rendered ${image.width}x${image.height}, expected ${width}x${height}`,
      );
    await writeFile(new URL(`${frame.name}.png`, output), image.asPng());
  }
}
