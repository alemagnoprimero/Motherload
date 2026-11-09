/**
 * Authoring only. Normal builds validate committed W02 files using Node alone.
 * Audit T13b: byte-identical on every machine, like build-campaign-assets.mjs.
 */
import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  RASTERIZER,
  rasterizeCampaignSources,
} from "./rasterize-campaign-svgs.mjs";
import { CANONICAL_PNG, canonicalizePngs, pngFiles } from "./png-canonical.mjs";
import { buildZonePages } from "./build-zone-pages.mjs";

const root = new URL("../", import.meta.url);
const source = new URL("assets/campaign/w02/", root);
const output = new URL("assets/campaign/generated/", root);
const temporary = new URL(".cache/frontier-renders/", root);
const manifest = JSON.parse(
  await readFile(new URL("frames.json", source), "utf8"),
);
await Promise.all([
  mkdir(output, { recursive: true }),
  mkdir(temporary, { recursive: true }),
]);
await rasterizeCampaignSources(source, temporary, manifest);

const packing = String.raw`
import json, sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]);source=root/'assets/campaign/w02';out=root/'assets/campaign/generated';renders=root/'.cache/frontier-renders'
m=json.loads((source/'frames.json').read_text())
# Intermediates: png-canonical.mjs re-encodes every PNG at the end of the build.
for f in m['backgrounds']:Image.open(renders/(f['name']+'.png')).convert('RGBA').save(out/(f['name']+'.png'),compress_level=1)
registry=json.loads((source/'asset-map.json').read_text())
icons=out/'w02-icons';icons.mkdir(exist_ok=True)
def icon_image(name,size):
 im=Image.open(renders/(name+'.png')).convert('RGBA');bbox=im.getbbox()
 if not bbox:raise ValueError('Transparent W02 icon: '+name)
 im=im.crop(bbox);im.thumbnail((size-8,size-8),Image.Resampling.LANCZOS)
 canvas=Image.new('RGBA',(size,size));canvas.paste(im,((size-im.width)//2,(size-im.height)//2));return canvas
iconcount=0
for f in m['frames']:
 if f.get('category') in ('mineral','package','mission','relic','equipment','core_hardware','hazard','world'):
  for size in (64,128):icon_image(f['name'],size).save(icons/(f['name']+f'-{size}.png'),compress_level=1);iconcount+=1
for assetid,record in registry['assets'].items():
 for size in record['iconSizes']:
  icon_image(record['icon'],size).save(icons/(assetid.lower()+f'-icon-{size}.png'),compress_level=1);iconcount+=1
registry['provenance']={'renderer':sys.argv[2],'packing':'Node orchestrates Pillow lossless RGBA packing; '+sys.argv[3],'source':'assets/campaign/w02/*.svg','authoring':'node assets/campaign/w02/create-sources.mjs; node scripts/build-frontier-assets.mjs','frameCount':len(m['frames']),'backgroundCount':len(m['backgrounds']),'iconCount':iconcount}
(out/'w02-assets.json').write_text(json.dumps(registry,indent=2)+'\n')
print(f"W02: {len(m['frames'])} original frames; {iconcount} icons and {len(m['backgrounds'])} backgrounds exported.")
`;
const result = spawnSync(
  process.env.PYTHON || "python",
  ["-c", packing, fileURLToPath(root), RASTERIZER, CANONICAL_PNG],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);

// Every density is rendered from source (decisions.md D5): @3x at scale 1.5.
const renders3 = new URL(".cache/frontier-renders-3x/", root);
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
      "w02",
      ...args,
    ],
    { stdio: "inherit" },
  );
  if (packed.status !== 0) process.exit(packed.status || 1);
};
// The full @2x atlas: every frame, for the asset checks.
pack("2");
// Legacy runtime pages, loaded by the game until it reads the zone pages.
pack("2", "runtime");
pack("3", "runtime");
// Audit T13b: zone pages at @2x, @3x and (hero set) @4x, and their manifest.
await buildZonePages({
  root,
  world: "W02",
  source,
  manifest,
  renders: temporary,
});

// Audit T13b: one encoding for every PNG this build wrote.
const canonical = await canonicalizePngs([
  ...(await pngFiles(output, (name) => name.startsWith("w02-"))),
  ...(await pngFiles(new URL("w02-icons/", output))),
]);
console.log(
  `W02: ${canonical.files} PNGs in canonical form (${canonical.rewritten} re-encoded).`,
);
