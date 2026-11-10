/**
 * Authoring only. Regenerates the band material SVGs, renders each page at
 * @2x and @3x from its source, and writes generated/bands/. Audit T13b: the
 * pages are byte-identical on every machine (resvg renders them,
 * scripts/png-canonical.mjs encodes them).
 */
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createBandSources } from "../assets/campaign/render-sources.mjs";
import { rasterizeCampaignSources } from "./rasterize-campaign-svgs.mjs";
import { canonicalizePngs } from "./png-canonical.mjs";
const source = new URL("../assets/campaign/bands/", import.meta.url);
const output = new URL("../assets/campaign/generated/bands/", import.meta.url);
await createBandSources();
await mkdir(output, { recursive: true });
const manifest = JSON.parse(
  await readFile(new URL("frames.json", source), "utf8"),
);
const pages = [];
const written = [];
for (const scale of [2, 3]) {
  const temporary = new URL(
    `../.cache/band-renders-${scale}x/`,
    import.meta.url,
  );
  await mkdir(temporary, { recursive: true });
  await rasterizeCampaignSources(source, temporary, manifest, scale / 2);
  for (const frame of manifest.frames) {
    const file = `${frame.name}-${scale}x.png`;
    const target = new URL(file, output);
    written.push(fileURLToPath(target));
    await copyFile(new URL(frame.name + ".png", temporary), target);
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
const canonical = await canonicalizePngs(written);
console.log(
  `${pages.length} material pages at native @2x/@3x (${canonical.rewritten} re-encoded); current band and neighbours stream independently.`,
);
