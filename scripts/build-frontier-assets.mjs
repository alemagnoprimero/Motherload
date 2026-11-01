/** Authoring only. Normal builds validate committed W02 files using Node alone. */
import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = new URL("assets/campaign/w02/", root);
const output = new URL("assets/campaign/generated/", root);
const temporary = new URL(".cache/frontier-renders/", root);
const profile = new URL(".cache/frontier-inkscape/", root);
const manifest = JSON.parse(
  await readFile(new URL("frames.json", source), "utf8"),
);
await Promise.all([
  mkdir(output, { recursive: true }),
  mkdir(temporary, { recursive: true }),
  mkdir(profile, { recursive: true }),
]);
for (const frame of [...manifest.frames, ...manifest.backgrounds]) {
  const result = spawnSync(
    process.env.INKSCAPE || "inkscape",
    [
      fileURLToPath(new URL(`${frame.name}.svg`, source)),
      "--export-area-page",
      "--export-background-opacity=0",
      `--export-filename=${fileURLToPath(new URL(`${frame.name}.png`, temporary))}`,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, INKSCAPE_PROFILE_DIR: fileURLToPath(profile) },
    },
  );
  if (result.status !== 0)
    throw new Error(
      `SVG export failed for ${frame.name}: ${result.stderr || result.error}`,
    );
}
const packing = String.raw`
import json, math
from pathlib import Path
from PIL import Image
root=Path(__import__('sys').argv[1]);source=root/'assets/campaign/w02';out=root/'assets/campaign/generated';renders=root/'.cache/frontier-renders'
m=json.loads((source/'frames.json').read_text());padding=2;width=1024;x=padding;y=padding;shelf=0;positions={}
for f in sorted(m['frames'],key=lambda a:(-a['height'],-a['width'],a['name'])):
 w,h=f['width'],f['height']
 if x+w+padding>width:x=padding;y+=shelf+padding*2;shelf=0
 positions[f['name']]=(x,y,w,h);x+=w+padding*2;shelf=max(shelf,h)
height=math.ceil((y+shelf+padding)/64)*64
if height>2048:raise ValueError(f'W02 atlas height {height} exceeds mobile budget')
atlas=Image.new('RGBA',(width,height));frames={}
for f in m['frames']:
 x,y,w,h=positions[f['name']];im=Image.open(renders/(f['name']+'.png')).convert('RGBA')
 if im.size!=(w,h):raise ValueError(f"Wrong raster dimensions: {f['name']}")
 atlas.paste(im,(x,y));frames[f['name']]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h},'pivot':f.get('pivot',{'x':.5,'y':.5}),'logicalSize':{'w':f['logicalWidth'],'h':f['logicalHeight']}}
atlas.save(out/'w02-atlas.png',optimize=True)
(out/'w02-atlas.json').write_text(json.dumps({'frames':frames,'meta':{'app':'Motherload original W02 2D artwork','version':'0.1','image':'w02-atlas.png','format':'RGBA8888','size':{'w':width,'h':height},'scale':'2','logicalTile':48,'rigPivot':m['rigPivot'],'rigTreadBaseline':m['rigTreadBaseline'],'framePadding':padding}},indent=2)+'\n')
for f in m['backgrounds']:Image.open(renders/(f['name']+'.png')).convert('RGBA').save(out/(f['name']+'.png'),optimize=True)
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
  for size in (64,128):icon_image(f['name'],size).save(icons/(f['name']+f'-{size}.png'),optimize=True);iconcount+=1
for assetid,record in registry['assets'].items():
 for size in record['iconSizes']:
  icon_image(record['icon'],size).save(icons/(assetid.lower()+f'-icon-{size}.png'),optimize=True);iconcount+=1
registry['provenance']={'renderer':'Inkscape SVG rasterizer','packing':'Node orchestrates Pillow lossless RGBA packing','source':'assets/campaign/w02/*.svg','authoring':'node assets/campaign/w02/create-sources.mjs; node scripts/build-frontier-assets.mjs','frameCount':len(frames),'backgroundCount':len(m['backgrounds']),'iconCount':iconcount}
(out/'w02-assets.json').write_text(json.dumps(registry,indent=2)+'\n')
print(f"W02 atlas: {len(frames)} original frames, {width}x{height}, {(out/'w02-atlas.png').stat().st_size//1024}KiB; {iconcount} icons and three backgrounds exported.")
`;
const result = spawnSync(
  process.env.PYTHON || "python",
  ["-c", packing, fileURLToPath(root)],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
