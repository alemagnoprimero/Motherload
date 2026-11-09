import numpy as np
from PIL import Image
def L(rgb):
    c=rgb/255.0; c=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4); y=0.2126*c[...,0]+0.7152*c[...,1]+0.0722*c[...,2]
    return np.where(y>216/24389,116*np.cbrt(y)-16,24389/27*y)
for n,g in (('a02-spawn-1440x900@2',1144),('p-portrait-02-spawn@3',1623)):
    for t in ('before2','after'):
        a=np.asarray(Image.open(f'/tmp/w/{t}/captures/{n}-hudfree.png').convert('RGB')).astype(float)
        print(n,t,'horizon L* (strip 0.5-0.1 tile above ground)',round(L(a[g-58:g-12]).mean(),2), 'sky identical rows:',g)
