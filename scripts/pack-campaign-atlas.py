"""Lossless trimmed multi-page packing. Source rectangles preserve all rig anchors."""
import json, math, sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]);world=sys.argv[2];scale=int(sys.argv[3]);runtime=len(sys.argv)>4 and sys.argv[4]=='runtime';folder='source' if world=='w01' else 'w02'
source=root/'assets/campaign'/folder
renders=root/('.cache/campaign-renders' if world=='w01' else '.cache/frontier-renders')
if scale==3:renders=Path(str(renders)+'-3x')
out=root/'assets/campaign/generated';manifest=json.loads((source/'frames.json').read_text());padding=2;width=2048 if world=='w01' else 1024
if scale==3:width=2048
entries=[]
for record in manifest['frames']:
 if runtime and record['name'].split('-')[0] in ('soil','stone','ice','frozen','bedrock'):continue
 image=Image.open(renders/(record['name']+'.png')).convert('RGBA');box=image.getbbox() or (0,0,1,1)
 entries.append((record,image,box))
pages=[];page=[];x=y=padding;shelf=0
for record,image,box in sorted(entries,key=lambda entry:(-(entry[2][3]-entry[2][1]),-(entry[2][2]-entry[2][0]),entry[0]['name'])):
 w,h=box[2]-box[0],box[3]-box[1]
 if x+w+padding>width:x=padding;y+=shelf+padding*2;shelf=0
 if y+h+padding>2048:
  pages.append((page,math.ceil((y+shelf+padding)/64)*64));page=[];x=y=padding;shelf=0
 page.append((record,image,box,x,y));x+=w+padding*2;shelf=max(shelf,h)
pages.append((page,math.ceil((y+shelf+padding)/64)*64))
pageinfo=[]
for n,(entries,height) in enumerate(pages):
 family='runtime' if runtime else 'atlas'
 name=f'{world}-{family}' if scale==2 and n==0 else f'{world}-{family}-{scale}x-{n}'
 atlas=Image.new('RGBA',(width,height));frames={}
 for record,image,box,x,y in entries:
  w,h=box[2]-box[0],box[3]-box[1];atlas.paste(image.crop(box),(x,y));sw,sh=image.size
  frames[record['name']]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':box!=(0,0,sw,sh),'spriteSourceSize':{'x':box[0],'y':box[1],'w':w,'h':h},'sourceSize':{'w':sw,'h':sh},'pivot':record.get('pivot',{'x':.5,'y':.5}),'logicalSize':{'w':record['logicalWidth'],'h':record['logicalHeight']}}
 atlas.save(out/(name+'.png'),optimize=True)
 data={'frames':frames,'meta':{'app':'Deep Frontier original layered SVG artwork','version':'0.2','image':name+'.png','format':'RGBA8888','size':{'w':width,'h':height},'scale':str(scale),'logicalTile':48,'rigPivot':[v*scale/2 for v in manifest['rigPivot']],'rigTreadBaseline':manifest['rigTreadBaseline']*scale/2,'framePadding':padding}}
 (out/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')
 pageinfo.append({'image':name+'.png','data':name+'.json','frames':list(frames),'width':width,'height':height,'bytes':width*height*4})
(out/f'{world}-pages-{"runtime-" if runtime else ""}{scale}x.json').write_text(json.dumps({'scale':scale,'pages':pageinfo},indent=2)+'\n')
print(f'{world} {"runtime" if runtime else "full"} @{scale}x: {len(pages)} trimmed page(s), {sum(p["bytes"] for p in pageinfo)/2**20:.2f} MiB decoded')
if runtime and scale==2:
 sky=Image.open(root/('.cache/campaign-renders' if world=='w01' else '.cache/frontier-renders')/(world+'-sky.png')).convert('RGBA')
 sky.resize((512,256),Image.Resampling.LANCZOS).save(out/(world+'-sky-runtime.png'),optimize=True)
