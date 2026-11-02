import json, sys
from PIL import Image, ImageDraw
root='/home/user/Motherload/assets/campaign/generated/'
out='/home/user/Motherload/docs/improvement-plan/work/graphics/'
def load(name):
    d=json.load(open(root+name+'-atlas.json'))
    im=Image.open(root+name+'-atlas.png').convert('RGBA')
    return d['frames'], im
def crop(frames, im, n):
    f=frames[n]['frame']
    return im.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))
def sheet(names, src, cols, scale, fname, bg=(23,35,43,255)):
    frames, im = load(src)
    tiles=[crop(frames, im, n) for n in names]
    w=max(t.size[0] for t in tiles)*scale; h=max(t.size[1] for t in tiles)*scale
    rows=(len(tiles)+cols-1)//cols
    S=Image.new('RGBA',(cols*(w+8)+8, rows*(h+24)+8), bg)
    dr=ImageDraw.Draw(S)
    for i,(n,t) in enumerate(zip(names,tiles)):
        x=8+(i%cols)*(w+8); y=8+(i//cols)*(h+24)
        tt=t.resize((t.size[0]*scale,t.size[1]*scale), Image.NEAREST)
        S.alpha_composite(tt,(x,y))
        dr.text((x,y+h+4), n, fill=(240,240,240,255))
    S.save(out+fname)
# alpha coverage stats for each terrain/edge frame
frames, im = load('w01')
stats={}
for n in sorted(frames):
    t=crop(frames, im, n)
    a=t.getchannel('A')
    hist=a.histogram()
    opaque=sum(hist[250:]); transparent=hist[0]; total=t.size[0]*t.size[1]
    # bbox of non-transparent
    bbox=a.getbbox()
    rgb=t.convert('RGB')
    stats[n]={'size':t.size,'opaque%':round(100*opaque/total,1),'transparent%':round(100*transparent/total,1),'bbox':bbox}
frames2, im2 = load('w02')
for n in sorted(frames2):
    t=crop(frames2, im2, n)
    a=t.getchannel('A'); hist=a.histogram(); total=t.size[0]*t.size[1]
    stats['w02:'+n]={'size':t.size,'opaque%':round(100*sum(hist[250:])/total,1),'transparent%':round(100*hist[0]/total,1),'bbox':a.getbbox()}
json.dump(stats, open(out+'frame-alpha-stats.json','w'), indent=1)
sheet([f'soil-{i}' for i in range(8)]+[f'stone-{i}' for i in range(4)], 'w01', 6, 2, 'w01-terrain-interiors.png')
sheet([f'soil-edge-{i}' for i in range(16)], 'w01', 8, 1, 'w01-edges.png', bg=(255,0,255,255))
sheet([f'ore-o{i}' for i in range(1,5)]+[f'package-o{i}' for i in range(1,5)]+['relic','crack-1','crack-2','crack-3'], 'w01', 6, 1, 'w01-ores.png')
sheet([f'ice-{i}' for i in range(8)]+[f'frozen-rock-{i}' for i in range(4)], 'w02', 6, 2, 'w02-terrain-interiors.png')
sheet([f'ice-edge-{i}' for i in range(16)]+[f'frozen-rock-edge-{i}' for i in range(16)], 'w02', 8, 1, 'w02-edges.png', bg=(255,0,255,255))
sheet([f'ore-o{i}' for i in range(1,5)]+[f'package-o{i}' for i in range(1,5)]+['relic','ice-vent','cold-warning','mission-sample'], 'w02', 6, 1, 'w02-ores.png')
print('ok')
