/**
 * Authoring only. Normal builds validate the committed PNGs and need neither
 * resvg nor Pillow. Audit T13b: the output is byte-identical on every machine
 * (resvg renders, Pillow packs, scripts/png-canonical.mjs encodes), and CI
 * rebuilds it to prove that (`npm run assets:rebuild`).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  RASTERIZER,
  rasterizeCampaignSources,
} from "./rasterize-campaign-svgs.mjs";
import { CANONICAL_PNG, canonicalizePngs, pngFiles } from "./png-canonical.mjs";
import { buildZonePages } from "./build-zone-pages.mjs";

const root = new URL("../", import.meta.url);
const source = new URL("assets/campaign/source/", root);
const generated = new URL("assets/campaign/generated/", root);
const temporary = new URL(".cache/campaign-renders/", root);
const manifest = JSON.parse(
  await readFile(new URL("frames.json", source), "utf8"),
);
await mkdir(temporary, { recursive: true });
await mkdir(generated, { recursive: true });
await rasterizeCampaignSources(source, temporary, manifest);

const packing = String.raw`
import json
from pathlib import Path
from PIL import Image, ImageChops
root=Path(__import__('sys').argv[1]);source=root/'assets/campaign/source';out=root/'assets/campaign/generated';renders=root/'.cache/campaign-renders'
m=json.loads((source/'frames.json').read_text())
# Intermediates: png-canonical.mjs re-encodes every PNG at the end of the build.
for f in m['backgrounds']:
 Image.open(renders/(f['name']+'.png')).convert('RGBA').save(out/(f['name']+'.png'),compress_level=1)
icons=out/'icons';icons.mkdir(exist_ok=True)
names={f['name'] for f in m['frames']}
# Audit T13b: a DOM icon has no darkness, so a frame with an -emissive sibling
# shows it lit (the sibling's premultiplied RGB added, as the game's ADD pass
# does); the sibling gets no icon of its own.
def lit(name):
 im=Image.open(renders/(name+'.png')).convert('RGBA')
 if name+'-emissive' not in names:return im
 glow=Image.open(renders/(name+'-emissive.png')).convert('RGBA')
 r,g,b,a=glow.split();alpha=Image.merge('RGB',(a,a,a))
 rgb=ImageChops.add(im.convert('RGB'),ImageChops.multiply(Image.merge('RGB',(r,g,b)),alpha))
 return Image.merge('RGBA',(*rgb.split(),ImageChops.lighter(im.getchannel('A'),a)))
for f in m['frames']:
 name=f['name']
 if name.endswith('-emissive'):continue
 if f.get('category')=='icon' or name.startswith(('ore-','mission-','package-')) or name=='relic':
  im=lit(name)
  for size in (64,128):im.resize((size,size),Image.Resampling.LANCZOS).save(icons/(name+f'-{size}.png'),compress_level=1)
 if f.get('category')=='glyph':
  im=Image.open(renders/(name+'.png')).convert('RGBA')
  for size in (24,48):im.resize((size,size),Image.Resampling.LANCZOS).save(icons/(name+f'-{size}.png'),compress_level=1)
assetmap=json.loads((source/'asset-map.json').read_text())
for assetid,record in assetmap['assets'].items():
 icon=record.get('icon')
 if not icon:continue
 im=Image.open(renders/(icon+'.png')).convert('RGBA')
 for size in record.get('iconSizes',[64,128]):im.resize((size,size),Image.Resampling.LANCZOS).save(icons/(assetid.lower()+f'-icon-{size}.png'),compress_level=1)
(out/'w01-assets.json').write_text(json.dumps(assetmap,indent=2)+'\n')
print(f"W01: {len(m['frames'])} original frames; icons and {len(m['backgrounds'])} backgrounds exported.")
`;
const result = spawnSync(
  process.env.PYTHON || "python",
  ["-c", packing, fileURLToPath(root)],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
await writeFile(
  new URL("provenance.json", generated),
  JSON.stringify(
    {
      version: "0.1",
      world: "W01",
      source:
        "Original layered SVG artwork; source/create-w01-sources.mjs and individual editable SVGs",
      conceptReference:
        "User-supplied campaign v0.1 boards; no board pixels included",
      renderer: RASTERIZER,
      packing: `Node.js orchestrates Pillow lossless RGBA packing; ${CANONICAL_PNG}`,
      logicalTile: 48,
      authorScale: 2,
      frameCount: manifest.frames.length,
      // Audit T13a: PNGs beside the SVGs, resampled per page.
      rasterFrames: manifest.frames
        .filter((frame) => frame.source === "raster")
        .map((frame) => frame.name),
    },
    null,
    2,
  ) + "\n",
);

// Pages keep each frame's source rectangle and pivot and drop its transparent
// padding. Every density is rendered from source (decisions.md D5): @3x at scale 1.5.
const renders3 = new URL(".cache/campaign-renders-3x/", root);
await mkdir(renders3, { recursive: true });
await rasterizeCampaignSources(
  source,
  renders3,
  { ...manifest, backgrounds: [] },
  1.5,
);
const pack = (...args) => {
  const packed = spawnSync(
    process.env.PYTHON || "python",
    [
      fileURLToPath(new URL("scripts/pack-campaign-atlas.py", root)),
      fileURLToPath(root),
      "w01",
      ...args,
    ],
    { stdio: "inherit" },
  );
  if (packed.status !== 0) process.exit(packed.status || 1);
};
// The full @2x atlas: every frame, for the asset checks.
pack("2");
// Audit T13b: zone pages at @2x, @3x and (hero set) @4x, and their manifest.
await buildZonePages({
  root,
  world: "W01",
  source,
  manifest,
  renders: temporary,
});

// Audit T13b: one encoding for every PNG this build wrote.
const canonical = await canonicalizePngs([
  ...(await pngFiles(generated, (name) => name.startsWith("w01-"))),
  ...(await pngFiles(new URL("icons/", generated))),
]);
console.log(
  `W01: ${canonical.files} PNGs in canonical form (${canonical.rewritten} re-encoded).`,
);
