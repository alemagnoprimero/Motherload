/** Authoring helper shared by both worlds. No browser is needed at runtime. */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/**
 * Audit T13a: a frame listed with `"source": "raster"` is a PNG beside the
 * SVGs (`<name>.png`) instead of a drawing. Each page gets it at the frame's
 * size for that page, Lanczos-resampled (Pillow works in premultiplied alpha,
 * so edges keep their colour) or copied pixel for pixel when the PNG is
 * already that size. Pillow output is deterministic, so rebuilds stay
 * byte-identical.
 */
const RESAMPLE = String.raw`
import sys
from PIL import Image
source, target, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
image = Image.open(source).convert('RGBA')
if image.size != (width, height):
    image = image.resize((width, height), Image.Resampling.LANCZOS)
image.save(target)
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

export async function rasterizeCampaignSources(
  source,
  output,
  manifest,
  scale = 1,
) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 512, height: 512 },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    for (const frame of [...manifest.frames, ...manifest.backgrounds]) {
      if (frame.source === "raster") {
        resampleRaster(frame, source, output, scale);
        continue;
      }
      const drawing = await readFile(
        new URL(`${frame.name}.svg`, source),
        "utf8",
      );
      await page.setViewportSize({
        width: Math.round(frame.width * scale),
        height: Math.round(frame.height * scale),
      });
      await page.setContent(
        `<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${drawing}`,
      );
      // Two animation frames: the drawing is laid out and painted at this
      // frame's size before the capture.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.screenshot({
        path: fileURLToPath(new URL(`${frame.name}.png`, output)),
        omitBackground: true,
        animations: "disabled",
      });
    }
  } finally {
    await browser.close();
  }
}
