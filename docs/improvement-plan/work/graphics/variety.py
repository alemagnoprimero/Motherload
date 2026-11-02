import json, numpy as np
from PIL import Image
root='/home/user/Motherload/assets/campaign/generated/'
out={}
def load(name):
    d=json.load(open(root+name+'-atlas.json'))['frames']
    im=np.asarray(Image.open(root+name+'-atlas.png').convert('RGBA')).astype(float)
    return d,im
def fr(d,im,n):
    f=d[n]['frame']; return im[f['y']:f['y']+f['h'], f['x']:f['x']+f['w']]
def lum(a):
    rgb=a[...,:3]/255.0
    lin=np.where(rgb<=0.04045, rgb/12.92, ((rgb+0.055)/1.055)**2.4)
    return 0.2126*lin[...,0]+0.7152*lin[...,1]+0.0722*lin[...,2]
for w in ['w01','w02']:
    d,im=load(w)
    base='soil' if w=='w01' else 'ice'
    hard='stone' if w=='w01' else 'frozen-rock'
    A=fr(d,im,f'{base}-0')
    out[w+'-interior-variant-MAD-vs-0']={f'{base}-{i}':round(float(np.abs(fr(d,im,f'{base}-{i}')[...,:3]-A[...,:3]).mean()),2) for i in range(1,8)}
    out[w+'-interior-variant-pct-pixels-differing>8']={f'{base}-{i}':round(float((np.abs(fr(d,im,f'{base}-{i}')[...,:3]-A[...,:3]).max(axis=2)>8).mean()*100),1) for i in range(1,8)}
    B=fr(d,im,f'{hard}-0')
    out[w+'-hard-variant-pct-pixels-differing>8']={f'{hard}-{i}':round(float((np.abs(fr(d,im,f'{hard}-{i}')[...,:3]-B[...,:3]).max(axis=2)>8).mean()*100),1) for i in range(1,4)}
    # mean colour and luminance of interior vs hard
    for n in [f'{base}-0', f'{hard}-0']:
        a=fr(d,im,n); out[w+':'+n+':meanRGB']=[round(x) for x in a[...,:3].reshape(-1,3).mean(axis=0)]; out[w+':'+n+':meanRelLum']=round(float(lum(a).mean()),4)
    # edge-frame interior identical to variant 0?
    e0=fr(d,im,(f'soil-edge-0' if w=='w01' else 'ice-edge-0'))
    out[w+'-edge0-vs-interior0-pct-differing>8']=round(float((np.abs(e0[...,:3]-A[...,:3]).max(axis=2)>8).mean()*100),2)
    # ores: mean luminance of opaque pixels, and hue
    import colorsys
    for i in range(1,5):
        a=fr(d,im,f'ore-o{i}'); m=a[...,3]>200
        rgb=a[...,:3][m].mean(axis=0)
        h,l,s=colorsys.rgb_to_hls(*(rgb/255))
        out[f'{w}:ore-o{i}']={'meanRGB':[round(x) for x in rgb],'hueDeg':round(h*360),'sat':round(s,2),'relLum':round(float(lum(a[m][None,...]).mean()),4)}
d,im=load('w01')
b0=fr(d,im,'rig-body-0')
out['rig-body-frame-pct-differing-from-0']={f'rig-body-{i}':round(float((np.abs(fr(d,im,f'rig-body-{i}')-b0).max(axis=2)>8).mean()*100),2) for i in range(1,8)}
dd0=fr(d,im,'rig-drill-down-0')
out['rig-drill-down-frame-pct-differing-from-0']={f'rig-drill-down-{i}':round(float((np.abs(fr(d,im,f'rig-drill-down-{i}')-dd0).max(axis=2)>8).mean()*100),2) for i in range(1,8)}
t0=fr(d,im,'thrust-0')
out['thrust-frame-pct-differing']={f'thrust-{i}':round(float((np.abs(fr(d,im,f'thrust-{i}')-t0).max(axis=2)>8).mean()*100),2) for i in range(1,6)}
# opaque area of composite rig parts
def bbox(n):
    a=fr(d,im,n); ys,xs=np.where(a[...,3]>20); return [int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]
out['rig-bboxes(src px of 128)']={n:bbox(n) for n in ['rig-body-0','rig-cabin','rig-engine-0','rig-energy-0','rig-bay-0','rig-hull-0','rig-drill-idle','rig-drill-down-0','rig-drill-right-0','thrust-0']}
json.dump(out,open('variety.json','w'),indent=1)
print(json.dumps(out,indent=1))
