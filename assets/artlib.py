from PIL import Image, ImageDraw
from pathlib import Path
import math, random, json

ROOT = Path(__file__).resolve().parent
P = {
'ink':'#0A0E14','bg':'#0E1420','panel':'#161F2E','dark':'#22304A','edge':'#33455F','cool':'#4A6B8A',
'white':'#FFE3B0','amber':'#FFC163','orange':'#FF9A3C','ember':'#E2542B','cream':'#F7EEDD','steel':'#8A99A8',
'red':'#7A2E3A','blue':'#2E4A7A','skin':'#D9A67A','gray1':'#5A6472','gray2':'#8C97A6','gray3':'#C3CBD6',
'gold':'#FFC93C','danger':'#FF5C7A','fast':'#F2B33D','staple':'#E8D9A8','spicy':'#E0432B','fried':'#C98B3F',
'made':'#FF7A45','madedrink':'#5FD3A6','drink':'#59A8E8','cold':'#7BC96F','grilled':'#8C5A3C','soup':'#EFE3C8',
'dessert':'#E8A0BF','braised':'#8B5F9E'}
TAGS = [('fast','square'),('staple','circle'),('spicy','triangle'),('fried','star'),('madedish','crescent'),('madedrink','drop'),('drink','bottle'),('cold','diamond'),('grilled','stripes'),('soup','bowl'),('dessert','dots'),('braised','blocks')]
TAGCOL = {k:P[k if k not in ('madedish','madedrink') else ('made' if k=='madedish' else 'madedrink')] for k,_ in TAGS}

def img(w=24,h=24): return Image.new('RGBA',(w,h),(0,0,0,0))
def D(im): return ImageDraw.Draw(im)
def rect(d,box,fill,outline=None): d.rectangle(box,fill=P.get(fill,fill),outline=P.get(outline,outline) if outline else None)
def line(d,xy,fill,width=1): d.line(xy,fill=P.get(fill,fill),width=width)
def poly(d,xy,fill,outline=None):
    d.polygon(xy,fill=P.get(fill,fill))
    if outline: d.line(xy+[xy[0]],fill=P.get(outline,outline),width=1)
def ellipse(d,box,fill,outline=None): d.ellipse(box,fill=P.get(fill,fill),outline=P.get(outline,outline) if outline else None)
def arc(d,box,start,end,fill,width=1): d.arc(box,start,end,fill=P.get(fill,fill),width=width)
def px(d,points,fill):
    for x,y in points: d.point((x,y),fill=P.get(fill,fill))
def save(im,rel):
    path=ROOT/rel; path.parent.mkdir(parents=True,exist_ok=True)
    # PNG-8 with binary transparency; all source pixels remain snapped to integer coordinates.
    alpha=im.getchannel('A')
    out=im.quantize(colors=64,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
    mask=alpha.point(lambda a:255 if a<128 else 0)
    # Reserve palette index 255 exclusively for transparent pixels, including opaque ink black.
    out.paste(255,mask)
    out.info['transparency']=255
    out.save(path,optimize=True)
    return path

def shadow_sized(w,h):
    im=img(w,h); d=D(im)
    for inset,c in [(0,'bg'),(2,'panel'),(4,'dark')]:
        ellipse(d,(inset,h//3+inset//2,w-1-inset,h-1-inset//2),c)
    return im

def bowl(d,x=2,y=9,w=20,h=10,col='cream',rim='white'):
    ellipse(d,(x,y,x+w,y+4),rim)
    rect(d,(x+1,y+2,x+w-1,y+h-3),col)
    poly(d,[(x+1,y+3),(x+w-1,y+3),(x+w-3,y+h),(x+3,y+h)],col)
    rect(d,(x+4,y+h,x+w-4,y+h+1),'edge')
    line(d,[(x+3,y+5),(x+4,y+h-1)],'gray3')

def plate(d,x=1,y=14,w=22,col='cream'):
    ellipse(d,(x,y,x+w,y+5),'edge'); ellipse(d,(x,y-1,x+w,y+3),col); line(d,[(x+4,y+1),(x+w-4,y+1)],'gray3')

def cup(d,x=7,y=7,w=11,h=14,col='drink',straw=True):
    poly(d,[(x,y),(x+w,y),(x+w-2,y+h),(x+2,y+h)],col,'cream')
    rect(d,(x-1,y-2,x+w+1,y),'cream')
    if straw: line(d,[(x+w-2,y-5),(x+w-4,y+4)],'white')

def steam(d,x,y,col='white',phase=0):
    for i in range(3):
        xx=x+i*4
        line(d,[(xx,y),(xx+(1 if (i+phase)%2 else -1),y-2),(xx,y-4)],col)

def flame(d,x,y,scale=1):
    poly(d,[(x,y+8*scale),(x-3*scale,y+5*scale),(x-2*scale,y+2*scale),(x,y+3*scale),(x+2*scale,y),(x+4*scale,y+5*scale),(x+2*scale,y+8*scale)],'orange')
    poly(d,[(x,y+7*scale),(x-1*scale,y+4*scale),(x+1*scale,y+3*scale),(x+2*scale,y+7*scale)],'white')

def chili(d,x,y,col='spicy',flip=0):
    line(d,[(x,y),(x+2,y-2),(x+3,y-1)],'cold')
    poly(d,[(x,y),(x+4,y),(x+3,y+4),(x,y+7),(x-2,y+8),(x,y+4)],col)
    px(d,[(x+1,y+1)],'white')

def skewer(d,x,y,n=3,col='grilled',vertical=False):
    if vertical:
        line(d,[(x,y-2),(x,y+15)],'staple')
        for i in range(n): rect(d,(x-2,y+i*4,x+2,y+i*4+2),col,'white' if i==0 else None)
    else:
        line(d,[(x-2,y+10),(x+13,y-3)],'staple')
        for i in range(n):
            xx=x+i*4; yy=y+6-i*4
            rect(d,(xx,yy,xx+4,yy+3),col,'white' if i==0 else None)

def sparkle(d,x,y,col='gold',r=3):
    line(d,[(x-r,y),(x+r,y)],col); line(d,[(x,y-r),(x,y+r)],col); px(d,[(x,y)],'white')

def arrow(d,x,y,col='gold',direction='up'):
    if direction=='up': poly(d,[(x,y),(x-3,y+4),(x-1,y+4),(x-1,y+8),(x+1,y+8),(x+1,y+4),(x+3,y+4)],col)
    elif direction=='down': poly(d,[(x,y+8),(x-3,y+4),(x-1,y+4),(x-1,y),(x+1,y),(x+1,y+4),(x+3,y+4)],col)
    elif direction=='right': poly(d,[(x+8,y),(x+4,y-3),(x+4,y-1),(x,y-1),(x,y+1),(x+4,y+1),(x+4,y+3)],col)
    else: poly(d,[(x,y),(x+4,y-3),(x+4,y-1),(x+8,y-1),(x+8,y+1),(x+4,y+1),(x+4,y+3)],col)

def pixel_heart(d,x,y,col='danger'):
    poly(d,[(x-3,y-2),(x-1,y-2),(x,y-1),(x+1,y-2),(x+3,y-2),(x+3,y),(x,y+4),(x-3,y)],col)

def make_background(size,far=True,lit=False,time='night'):
    w,h=size; im=img(w,h); d=D(im)
    rect(d,(0,0,w-1,h-1), 'panel' if time=='market' else ('dark' if time=='prep' else 'bg'))
    if time=='prep':
        rect(d,(0,0,w-1,55),'blue'); rect(d,(0,56,w-1,84),'red'); rect(d,(0,85,w-1,116),'grilled'); rect(d,(0,117,w-1,145),'orange')
    # Skyline stepped silhouettes.
    rnd=random.Random(17 if far else 28)
    base=238 if far else 287
    x=-8
    while x<w:
        bw=rnd.randrange(28,65); bh=rnd.randrange(48,137)
        c='ink' if far else ('panel' if time!='market' else 'edge')
        rect(d,(x,base-bh,x+bw,base),c)
        if far:
            for wx in range(x+6,x+bw-4,9):
                for wy in range(base-bh+8,base-10,13):
                    if rnd.random()<(.47 if lit else .16): rect(d,(wx,wy,wx+2,wy+4),'amber' if time=='night' else 'cool')
        x+=bw+3
    if far:
        ellipse(d,(w-113,28,w-93,48),'staple' if time=='night' else 'gray3')
        line(d,[(0,90),(w,62)],'ink'); line(d,[(0,106),(w,81)],'ink')
    else:
        rect(d,(0,base,w-1,h-1),'ink' if time=='night' else 'dark')
        for x in range(18,w,87):
            line(d,[(x,base+4),(x+8,h)],'panel')
    return im
