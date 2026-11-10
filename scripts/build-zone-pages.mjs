/**
 * Zone pages of one world (audit T13b), shared by build-campaign-assets.mjs
 * and build-frontier-assets.mjs. Authoring only.
 *
 * Expects the world's frames already rendered from source at @2x (scale 1)
 * and @3x (scale 1.5) in `renders` and `renders`-3x; renders the hero set at
 * @4x (scale 2) into `renders`-4x, packs one page group per (zone, hero set,
 * density) from scripts/campaign-zones.mjs with scripts/pack-campaign-atlas.py,
 * removes zone pages a smaller group no longer has, and writes
 * generated/<world>-zones.json, the manifest the game loads pages from.
 * PNGs are intermediates here; the world build canonicalizes them.
 */
import { mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rasterizeCampaignSources } from "./rasterize-campaign-svgs.mjs";
import {
  BAND_ROWS,
  DENSITIES,
  MAX_DENSITY,
  PAGE_LIMIT,
  ZONES,
  classifyFrames,
  densityScale,
  isHero,
  pageGroups,
  zonePageFile,
  zoneWorlds,
} from "./campaign-zones.mjs";

/**
 * `world` "W01" | "W02"; `source` the folder URL of its SVGs; `manifest` its
 * frames.json; `renders` the folder URL of its @2x renders (".../" form).
 */
export async function buildZonePages({
  root,
  world,
  source,
  manifest,
  renders,
}) {
  const generated = new URL("assets/campaign/generated/", root);
  const renders4 = new URL(`${renders.href.replace(/\/$/, "")}-4x/`);
  await mkdir(renders4, { recursive: true });
  // D5: the @4x pages are rendered from source like every other density.
  await rasterizeCampaignSources(
    source,
    renders4,
    {
      frames: manifest.frames.filter(
        (frame) => isHero(frame.name) && frame.source !== "raster",
      ),
      backgrounds: [],
    },
    densityScale(4),
  );
  const groups = pageGroups(world, manifest.frames);
  const plan = new URL(`.cache/${world.toLowerCase()}-zone-plan.json`, root);
  const result = new URL(`.cache/${world.toLowerCase()}-zone-pages.json`, root);
  await writeFile(
    plan,
    JSON.stringify({ groups, result: fileURLToPath(result) }, null, 2) + "\n",
  );
  const packed = spawnSync(
    process.env.PYTHON || "python",
    [
      fileURLToPath(new URL("scripts/pack-campaign-atlas.py", root)),
      fileURLToPath(root),
      world.toLowerCase(),
      "zones",
      fileURLToPath(plan),
    ],
    { stdio: "inherit" },
  );
  if (packed.status !== 0) process.exit(packed.status || 1);
  const pages = JSON.parse(await readFile(result, "utf8"));
  // A group that needs fewer pages than before leaves no stale page behind.
  const keep = new Set(pages.flatMap((page) => [page.image, page.data]));
  for (const file of await readdir(generated))
    if (zonePageFile(world).test(file) && !keep.has(file))
      await rm(new URL(file, generated));
  const { zones: frames, hero, excluded } = classifyFrames(manifest.frames);
  const rows = BAND_ROWS[world];
  const zones = {};
  for (const [zone, { bands, note }] of Object.entries(ZONES)) {
    const names = Object.keys(frames).filter((name) => frames[name] === zone);
    if (!names.length) continue;
    zones[zone] = {
      bands,
      rows: [rows[bands[0]][0], rows[bands.at(-1)][1]],
      worlds: zoneWorlds(world, zone, names),
      note,
      frames: names.length,
    };
  }
  const data = {
    version: 1,
    world,
    logicalTile: 48,
    pageLimit: PAGE_LIMIT,
    densities: Object.fromEntries(
      DENSITIES.map((density) => [density, densityScale(density)]),
    ),
    maxDensity: MAX_DENSITY,
    zones,
    frames,
    hero,
    excluded,
    pages: pages.map((page) => ({
      key: `campaign-${page.image.replace(/\.png$/, "")}`,
      zone: page.zone,
      hero: page.hero,
      ...(page.stage === undefined ? {} : { stage: page.stage }),
      density: page.density,
      image: page.image,
      data: page.data,
      width: page.width,
      height: page.height,
      bytes: page.bytes,
      frames: page.frames,
    })),
  };
  await writeFile(
    new URL(`${world.toLowerCase()}-zones.json`, generated),
    JSON.stringify(data, null, 2) + "\n",
  );
  for (const density of DENSITIES) {
    const mib =
      data.pages
        .filter((page) => page.density === density)
        .reduce((sum, page) => sum + page.bytes, 0) /
      2 ** 20;
    console.log(
      `${world} zone pages @${density}x: ${mib.toFixed(2)} MiB decoded`,
    );
  }
  return data;
}
