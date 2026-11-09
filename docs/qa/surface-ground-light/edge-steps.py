import sys, json
from PIL import Image
import numpy as np
def luma(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(float); return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
name=sys.argv[3]
m=json.load(open('/tmp/w/before2/captures/manifest.json'))['captures'][name]
v=m['view']; sc=m['deviceScaleFactor']; tile=v['tile']*sc
ground=-v['scrollY']*sc; rigx=v['rigScreenX']*sc
b=luma(sys.argv[1]); a=luma(sys.argv[2])
print(name,'tile',round(tile,1),'ground',round(ground),'rigx',round(rigx))
x0=-v['scrollX']*sc  # world x=0 screen
def bounds(span):
    k0=int(np.floor((rigx-span*tile-x0)/tile)); k1=int(np.ceil((rigx+span*tile-x0)/tile))
    return [x0+k*tile for k in range(k0,k1+1)]
def band(img,y0,y1,xa,xb): return img[int(y0):int(y1),int(xa):int(xb)].mean()
def stats(img,row,span=3.0):
    yc=ground+(row+0.5)*tile; y0,y1=yc-0.15*tile,yc+0.15*tile
    w0,w1=0.07*tile,0.17*tile
    E=[];I=[]
    for xb in bounds(span):
        if abs(xb-rigx)>span*tile: continue
        E.append(abs(band(img,y0,y1,xb+w0,xb+w1)-band(img,y0,y1,xb-w1,xb-w0)))
        xc=xb+tile/2
        I.append(abs(band(img,y0,y1,xc+w0,xc+w1)-band(img,y0,y1,xc-w1,xc-w0)))
    return np.mean(E),np.max(E),np.mean(I),np.max(I),len(E)
for label,img in (('before',b),('after',a)):
    for row in (0,1):
        e,em,i,im,n=stats(img,row)
        print(f'{label} row{row}: edge step mean {e:.2f} max {em:.2f} | inner variation mean {i:.2f} max {im:.2f} | ratio {e/i:.2f} (n={n})')
d=a-b
for row in (0,1):
    yc=int(ground+(row+0.5)*tile); prof=d[yc-5:yc+5].mean(axis=0)
    xs=bounds(3.0); steps=[abs(prof[int(x)+3]-prof[int(x)-3]) for x in xs if abs(x-rigx)<3*tile]
    print(f'light layer row{row}: peak {prof.max():.1f} luma, max step across a cell edge (6px) {max(steps):.2f}')
