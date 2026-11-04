from artlib import *
from collections import Counter

# PNG-8 files are already generated. Make icon acceptance previews at native 16px.
for path in sorted((ROOT/'art/ico').glob('*.png')):
    im=Image.open(path).convert('RGBA')
    if im.size in ((24,24),(32,32)):
        # Nearest-neighbour 2x sampling, followed by half-size acceptance preview.
        save(im.resize((16,16),Image.Resampling.NEAREST),f'art/ico/preview16/{path.stem}_16.png')

# TexturePacker JSON hash, one atlas per category, 2px gutters to avoid sampling bleed.
for category in ('scene','food','ing','utensil','ico','char','ui','fx'):
    files=sorted((ROOT/'art'/category).rglob('*.png'))
    frames={}; page_no=0; i=0
    while i<len(files):
        page_files=files[i:i+96] if category in ('food','ing','char','ico') else files[i:]
        if category=='scene':
            # Large scene layers are kept as separate source PNGs; atlas contains small modules only.
            page_files=[p for p in page_files if p.parent==ROOT/'art/scene' and Image.open(p).width<=192]
            if not page_files: break
            files=[p for p in files if p not in page_files]; i=0
        else: i+=len(page_files)
        pad=2; x=y=pad; rowh=0; placements=[]; maxx=0
        for p in page_files:
            im=Image.open(p); w,h=im.size
            if x+w+pad>1024: x=pad; y+=rowh+pad; rowh=0
            placements.append((p,x,y,w,h)); x+=w+pad; rowh=max(rowh,h); maxx=max(maxx,x)
        pageh=y+rowh+pad
        if pageh>2048: raise ValueError(f'{category} atlas overflow')
        atlas=Image.new('RGBA',(1024,max(32,pageh)),(0,0,0,0))
        for p,x,y,w,h in placements:
            atlas.alpha_composite(Image.open(p).convert('RGBA'),(x,y))
            key=str(p.relative_to(ROOT/'art')).replace('\\','/')
            frames[key]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h}}
        suffix=f'_{page_no}' if page_no else ''
        name=f'{category}{suffix}'
        save(atlas,f'art/atlas/{name}.png')
        data={'frames':frames,'meta':{'app':'Kimi procedural pixel pipeline','version':'1.0','image':f'{name}.png','format':'RGBA8888 indexed PNG-8','size':{'w':atlas.width,'h':atlas.height},'scale':'1','premultiplyAlpha':False,'filter':'nearest','gutter':2}}
        (ROOT/f'art/atlas/{name}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        page_no+=1
        if category=='scene': break

# 480x480 tag comparison sheet, English IDs only (Chinese remains DOM-rendered).
from PIL import ImageFont
font=ImageFont.load_default(size=12)
sheet=Image.new('RGBA',(480,480),P['bg']); d=D(sheet)
d.text((20,14),'NIGHT MARKET / TAG SHAPE + COLOR',font=font,fill=P['cream'])
for idx,(name,sh) in enumerate(TAGS):
    x=25+(idx%3)*153; y=48+(idx//3)*103
    rect(d,(x-5,y-5,x+131,y+87),'panel','edge')
    icon=Image.open(ROOT/f'art/ico/tag_{name}.png').convert('RGBA').resize((48,48),Image.Resampling.NEAREST)
    sheet.alpha_composite(icon,(x,y)); d.text((x+56,y+8),name,font=font,fill=P[TAGCOL[name]] if False else TAGCOL[name])
    small=Image.open(ROOT/f'art/ico/tag_{name}.png').convert('RGBA').resize((16,16),Image.Resampling.NEAREST)
    sheet.alpha_composite(small,(x,y+61)); d.text((x+24,y+63),sh,font=font,fill=P['gray3'])
sheet.save(ROOT/'art/ico/tag_overview_480.png')

# Contact sheets per asset category, using crisp nearest-neighbor previews.
def contact(paths,title,out,cell=(74,88),cols=10,scale=2):
    rows=(len(paths)+cols-1)//cols; w=cols*cell[0]+32; h=rows*cell[1]+58
    canvas=Image.new('RGBA',(w,h),P['bg']); d=D(canvas); d.text((16,14),title,font=ImageFont.load_default(size=16),fill=P['cream'])
    for idx,p in enumerate(paths):
        im=Image.open(p).convert('RGBA'); x=16+(idx%cols)*cell[0]; y=43+(idx//cols)*cell[1]
        maxw,maxh=cell[0]-12,cell[1]-28
        fac=min(scale,max(1,min(maxw//im.width,maxh//im.height)))
        preview=im.resize((im.width*fac,im.height*fac),Image.Resampling.NEAREST)
        rect(d,(x-2,y-2,x+cell[0]-8,y+cell[1]-23),'panel','edge')
        canvas.alpha_composite(preview,(x+(cell[0]-12-preview.width)//2,y+(maxh-preview.height)//2))
        label=p.stem.replace('food_','').replace('chr_customer_','').replace('utensil_','')
        if len(label)>12: label=label[:12]
        d.text((x,y+cell[1]-19),label,font=ImageFont.load_default(size=9),fill=P['gray3'])
    canvas.convert('RGB').save(ROOT/out)

contact(sorted((ROOT/'art/food').glob('food_*.png')),'82 DISHES / 24 PX','art/food/overview.png',cols=10)
contact(sorted((ROOT/'art/ing').glob('*.png')),'126 INGREDIENTS / 16 PX','art/ing/overview.png',cols=14,cell=(62,68),scale=2)
contact(sorted((ROOT/'art/utensil').glob('*.png')),'13 UTENSILS / 4 STATES','art/utensil/overview.png',cols=8,cell=(108,116),scale=2)
contact(sorted((ROOT/'art/char').glob('chr_customer_*.png')),'CUSTOMERS / BODY + FACE','art/char/overview_customers.png',cols=14,cell=(58,96),scale=1)
contact(sorted((ROOT/'art/ui').glob('*.png')),'UI CONTROLS','art/ui/overview.png',cols=10)
contact(sorted((ROOT/'art/fx').glob('*.png')),'FX / QTE RING','art/fx/overview.png',cols=8,cell=(108,116),scale=1)
contact(sorted((ROOT/'art/ico').glob('*.png')),'TAGS / TRAITS / RESONANCE / FEEDBACK','art/ico/overview.png',cols=10,cell=(78,82),scale=2)

# Representative night-market key art assembled from the actual modular sprites.
key=Image.open(ROOT/'art/scene/night_near_dark.png').convert('RGBA')
key.alpha_composite(Image.open(ROOT/'art/scene/night_far_lit.png').convert('RGBA').crop((32,0,672,360)))
key.alpha_composite(Image.open(ROOT/'art/scene/night_mid_lit.png').convert('RGBA').crop((64,0,704,360)))
key.alpha_composite(Image.open(ROOT/'art/scene/booth_base.png').convert('RGBA'),(218,229))
key.alpha_composite(Image.open(ROOT/'art/scene/booth_awning_down.png').convert('RGBA'),(218,143))
for x in range(218,410,48): key.alpha_composite(Image.open(ROOT/'art/scene/booth_bulb_string.png').convert('RGBA'),(x,191))
key.alpha_composite(Image.open(ROOT/'art/char/chr_player_idle_01_red.png').convert('RGBA'),(298,184))
for j,name in enumerate(('pot','fryer','ice_maker','fridge')):
    key.alpha_composite(Image.open(ROOT/f'art/utensil/utensil_{name}_work_01.png').convert('RGBA'),(222+j*47,200))
for j,name in enumerate(('student','courier','elder','couple')):
    key.alpha_composite(Image.open(ROOT/f'art/char/chr_customer_{name}_wait.png').convert('RGBA'),(182+j*78,268))
key.save(ROOT/'art/scene/night_market_keyart.png')
key.resize((1280,720),Image.Resampling.NEAREST).save(ROOT/'art/scene/night_market_keyart_2x.png')

# Delivery manifest and machine-readable acceptance report.
all_png=[p for p in (ROOT/'art').rglob('*.png') if 'atlas' not in p.parts and 'overview' not in p.stem and 'preview16' not in p.parts]
report={'style':'HD-feel medium-density pixel art','native_canvas':[640,360],'scaling':'nearest-neighbour integer only','palette':'assets/palette.json','counts_by_category':dict(Counter(p.relative_to(ROOT/'art').parts[0] for p in all_png)),'total_source_png':len(all_png),'png_mode':'P (PNG-8), indexed alpha','scene_layers':12,'dishes':82,'ingredients':126,'utensils':13,'utensil_frames':52,'tag_icons':12,'trait_icons':12,'resonance_icons':8,'text_baked':'none','animation':{'regular_fps':8,'critical_fps':12,'qte_ring_frames':8},'atlas_format':'TexturePacker JSON hash','atlas_max_size':[1024,2048],'notes':['Large parallax layers remain individual PNGs to avoid oversized atlases.','Special portraits use 48 or fewer source colors per asset.','Source generator scripts are included for deterministic revisions.','Ingredient names are original semantic IDs because no external ingredient spreadsheet was supplied.']}
(ROOT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
# Palette is both human- and machine-readable.
(ROOT/'palette.json').write_text(json.dumps(P,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
