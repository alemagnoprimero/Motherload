/** Authoring only. Normal builds validate the committed PNGs without a browser. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rasterizeCampaignSources } from "./rasterize-campaign-svgs.mjs";

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
import json, math
from pathlib import Path
from PIL import Image
root=Path(__import__('sys').argv[1]);source=root/'assets/campaign/source';out=root/'assets/campaign/generated';renders=root/'.cache/campaign-renders'
m=json.loads((source/'frames.json').read_text());padding=2;width=2048;x=padding;y=padding;shelf=0;positions={}
for f in sorted(m['frames'],key=lambda a:(-a['height'],-a['width'],a['name'])):
 w,h=f['width'],f['height']
 if x+w+padding>width:x=padding;y+=shelf+padding*2;shelf=0
 positions[f['name']]=(x,y,w,h);x+=w+padding*2;shelf=max(shelf,h)
height=math.ceil((y+shelf+padding)/64)*64
if height>2048:raise ValueError(f'Atlas height {height} exceeds mobile budget')
atlas=Image.new('RGBA',(width,height));frames={}
for f in m['frames']:
 x,y,w,h=positions[f['name']];im=Image.open(renders/(f['name']+'.png')).convert('RGBA');atlas.paste(im,(x,y))
 frames[f['name']]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h},'pivot':f.get('pivot',{'x':.5,'y':.5}),'logicalSize':{'w':f['logicalWidth'],'h':f['logicalHeight']},**({'source':'raster'} if f.get('source')=='raster' else {})}
atlas.save(out/'w01-atlas.png',optimize=True)
(out/'w01-atlas.json').write_text(json.dumps({'frames':frames,'meta':{'app':'Motherload original W01 2D artwork','version':'0.1','image':'w01-atlas.png','format':'RGBA8888','size':{'w':width,'h':height},'scale':'2','logicalTile':48,'rigPivot':m['rigPivot'],'rigTreadBaseline':m['rigTreadBaseline'],'framePadding':padding}},indent=2)+'\n')
for f in m['backgrounds']:
 Image.open(renders/(f['name']+'.png')).convert('RGBA').save(out/(f['name']+'.png'),optimize=True)
icons=out/'icons';icons.mkdir(exist_ok=True)
for f in m['frames']:
 name=f['name']
 if f.get('category')=='icon' or name.startswith(('ore-','mission-','package-')) or name=='relic':
  im=Image.open(renders/(name+'.png')).convert('RGBA')
  for size in (64,128):im.resize((size,size),Image.Resampling.LANCZOS).save(icons/(name+f'-{size}.png'),optimize=True)
 if f.get('category')=='glyph':
  im=Image.open(renders/(name+'.png')).convert('RGBA')
  for size in (24,48):im.resize((size,size),Image.Resampling.LANCZOS).save(icons/(name+f'-{size}.png'),optimize=True)
assetmap=json.loads((source/'asset-map.json').read_text())
for assetid,record in assetmap['assets'].items():
 icon=record.get('icon')
 if not icon:continue
 im=Image.open(renders/(icon+'.png')).convert('RGBA')
 for size in record.get('iconSizes',[64,128]):im.resize((size,size),Image.Resampling.LANCZOS).save(icons/(assetid.lower()+f'-icon-{size}.png'),optimize=True)
(out/'w01-assets.json').write_text(json.dumps(assetmap,indent=2)+'\n')
print(f"W01 atlas: {len(frames)} original frames, {width}x{height}, {(out/'w01-atlas.png').stat().st_size//1024}KiB; icons and {len(m['backgrounds'])} backgrounds exported.")
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
      renderer: "Chromium SVG rasterizer",
      packing: "Node.js orchestrates Pillow lossless RGBA packing",
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

// Resolution pages preserve each source rectangle and pivot while removing transparent padding.
for (const scale of [2, 3]) {
  if (scale === 3) {
    const renders3 = new URL(".cache/campaign-renders-3x/", root);
    await mkdir(renders3, { recursive: true });
    await rasterizeCampaignSources(
      source,
      renders3,
      { ...manifest, backgrounds: [] },
      1.5,
    );
  }
  const packed = spawnSync(
    process.env.PYTHON || "python",
    [
      fileURLToPath(new URL("scripts/pack-campaign-atlas.py", root)),
      fileURLToPath(root),
      "w01",
      String(scale),
    ],
    { stdio: "inherit" },
  );
  if (packed.status !== 0) process.exit(packed.status || 1);
  const runtime = spawnSync(
    process.env.PYTHON || "python",
    [
      fileURLToPath(new URL("scripts/pack-campaign-atlas.py", root)),
      fileURLToPath(root),
      "w01",
      String(scale),
      "runtime",
    ],
    { stdio: "inherit" },
  );
  if (runtime.status !== 0) process.exit(runtime.status || 1);
}
