import numpy as np
from PIL import Image
exec(open('/tmp/w/hz.py').read().split('for n,g')[0])
for n,g,tile,rx in (('a02-spawn-1440x900@2',1144,115.2,2131),('p-portrait-02-spawn@3',1623,116.2,589)):
    b=np.asarray(Image.open(f'/tmp/w/before2/captures/{n}-hudfree.png').convert('RGB')).astype(float)
    a=np.asarray(Image.open(f'/tmp/w/after/captures/{n}-hudfree.png').convert('RGB')).astype(float)
    y0=int(g+2*tile); x0=int(max(0,rx-3*tile)); x1=int(min(b.shape[1],rx+3*tile))
    d=L(a[y0:y0+int(2*tile),x0:x1])-L(b[y0:y0+int(2*tile),x0:x1])
    print(n,'unknown rock (rows 2-3, within 3 tiles of rig): mean dL* %.3f max %.3f'%(d.mean(),d.max()))
    # known lit rows 0-1 near rig
    d=L(a[g+5:g+int(2*tile)-5,int(rx-tile):int(rx+tile)])-L(b[g+5:g+int(2*tile)-5,int(rx-tile):int(rx+tile)])
    print('  lit ground within 1 tile: mean dL* %.2f max %.2f'%(d.mean(),d.max()))
