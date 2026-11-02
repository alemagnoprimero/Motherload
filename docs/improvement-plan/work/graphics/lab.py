import json, numpy as np
from PIL import Image
root='/home/user/Motherload/assets/campaign/generated/'
def load(name):
    d=json.load(open(root+name+'-atlas.json'))['frames']
    im=np.asarray(Image.open(root+name+'-atlas.png').convert('RGBA')).astype(float)
    return d,im
def fr(d,im,n):
    f=d[n]['frame']; return im[f['y']:f['y']+f['h'], f['x']:f['x']+f['w']]
def srgb2lab(rgb):
    c=rgb/255.0
    c=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz=c@M.T
    xyz/=np.array([0.95047,1.0,1.08883])
    f=np.where(xyz>0.008856, np.cbrt(xyz), 7.787*xyz+16/116)
    L=116*f[...,1]-16; a=500*(f[...,0]-f[...,1]); b=200*(f[...,1]-f[...,2])
    return np.stack([L,a,b],-1)
out={}
for w,terrain,hard in [('w01','soil-0','stone-0'),('w02','ice-0','frozen-rock-0')]:
    d,im=load(w)
    T=fr(d,im,terrain)[...,:3].reshape(-1,3); Tl=srgb2lab(T).mean(0)
    H=fr(d,im,hard)[...,:3].reshape(-1,3); Hl=srgb2lab(H).mean(0)
    out[w+':terrainLab']=[round(x,1) for x in Tl]; out[w+':hardLab']=[round(x,1) for x in Hl]
    out[w+':terrain-vs-hard dE']=round(float(np.linalg.norm(Tl-Hl)),1)
    for i in range(1,5):
        a=fr(d,im,f'ore-o{i}'); m=a[...,3]>200
        px=a[...,:3][m]; lab=srgb2lab(px)
        fill=lab[lab[:,0]>25]  # exclude dark outline strokes
        fl=fill.mean(0)
        out[f'{w}:ore-o{i}']={'fillLab':[round(x,1) for x in fl],'dL_vs_terrain':round(float(fl[0]-Tl[0]),1),'dE_vs_terrain':round(float(np.linalg.norm(fl-Tl)),1),'outlinePct':round(float((lab[:,0]<=25).mean()*100),1)}
    # pairwise ore dE
    fills={i:srgb2lab(fr(d,im,f'ore-o{i}')[...,:3][fr(d,im,f'ore-o{i}')[...,3]>200]) for i in range(1,5)}
    means={i:v[v[:,0]>25].mean(0) for i,v in fills.items()}
    out[w+':ore-pairwise-dE']={f'o{i}-o{j}':round(float(np.linalg.norm(means[i]-means[j])),1) for i in range(1,5) for j in range(i+1,5)}
json.dump(out,open('lab-contrast.json','w'),indent=1)
print(json.dumps(out,indent=1))
