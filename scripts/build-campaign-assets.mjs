/** Authoring only. Normal builds validate the committed PNGs without a browser. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = new URL("../", import.meta.url);
const source = new URL("assets/campaign/source/", root);
const generated = new URL("assets/campaign/generated/", root);
const temporary = new URL(".cache/campaign-renders/", root);
const manifest = JSON.parse(
  await readFile(new URL("frames.json", source), "utf8"),
);
await mkdir(temporary, { recursive: true });
await mkdir(generated, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
  });
  const images = [...manifest.frames, ...manifest.backgrounds];
  for (const frame of images) {
    const drawing = await readFile(
      new URL(`${frame.name}.svg`, source),
      "utf8",
    );
    await page.setViewportSize({ width: frame.width, height: frame.height });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}svg{display:block}</style>${drawing}`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${frame.name}.png`, temporary)),
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}

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
 frames[f['name']]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h},'pivot':f.get('pivot',{'x':.5,'y':.5}),'logicalSize':{'w':f['logicalWidth'],'h':f['logicalHeight']}}
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
print(f"W01 atlas: {len(frames)} original frames, {width}x{height}, {(out/'w01-atlas.png').stat().st_size//1024}KiB; icons and three backgrounds exported.")
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
    },
    null,
    2,
  ) + "\n",
);
