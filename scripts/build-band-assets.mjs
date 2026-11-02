import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createBandSources } from "../assets/campaign/render-sources.mjs";
import { rasterizeCampaignSources } from "./rasterize-campaign-svgs.mjs";
const source = new URL("../assets/campaign/bands/", import.meta.url);
const output = new URL("../assets/campaign/generated/bands/", import.meta.url);
await createBandSources();
await mkdir(output, { recursive: true });
const manifest = JSON.parse(
  await readFile(new URL("frames.json", source), "utf8"),
);
const pages = [];
for (const scale of [2, 3]) {
  const temporary = new URL(
    `../.cache/band-renders-${scale}x/`,
    import.meta.url,
  );
  await mkdir(temporary, { recursive: true });
  await rasterizeCampaignSources(source, temporary, manifest, scale / 2);
  for (const frame of manifest.frames) {
    const file = `${frame.name}-${scale}x.png`;
    await copyFile(
      new URL(frame.name + ".png", temporary),
      new URL(file, output),
    );
    pages.push({
      ...frame,
      file,
      scale,
      width: (frame.width * scale) / 2,
      height: (frame.height * scale) / 2,
    });
  }
}
await writeFile(
  new URL("manifest.json", output),
  JSON.stringify({ version: 1, tile: 48, period: 8, pages }, null, 2) + "\n",
);
console.log(
  `${pages.length} material pages at native @2x/@3x; current band and neighbours stream independently.`,
);

const rgba = spawnSync(
  process.env.PYTHON || "python",
  [
    "-c",
    "from pathlib import Path;from PIL import Image;import sys;[(lambda im,p: im.convert('RGBA').save(p,optimize=True))(Image.open(p),p) for p in Path(sys.argv[1]).glob('*.png')]",
    fileURLToPath(output),
  ],
  { stdio: "inherit" },
);
if (rgba.status !== 0) process.exit(rgba.status || 1);
