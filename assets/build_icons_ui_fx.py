from artlib import *

# Tag shapes.
def shape(d,name,col,box=(3,3,20,20),outline='cream'):
    x1,y1,x2,y2=box
    if name=='square': rect(d,box,col,outline); rect(d,(x1+3,y1+3,x2-3,y2-3),'panel')
    elif name=='circle':
        ellipse(d,box,col,outline)
        inset=max(1,(x2-x1)//4)
        if x2-x1>inset*2 and y2-y1>inset*2: ellipse(d,(x1+inset,y1+inset,x2-inset,y2-inset),'panel')
    elif name=='triangle': poly(d,[(12,y1),(x2,y2),(x1,y2)],col,outline)
    elif name=='star': poly(d,[(12,2),(15,8),(21,7),(18,13),(21,18),(15,17),(12,22),(9,17),(3,18),(6,13),(3,7),(9,8)],col,outline)
    elif name=='crescent':
        ellipse(d,box,col,outline); ellipse(d,(8,1,21,16),'panel')
    elif name=='drop': poly(d,[(12,2),(5,13),(5,17),(8,21),(16,21),(19,17),(19,13)],col,outline)
    elif name=='bottle': poly(d,[(9,3),(15,3),(15,7),(18,10),(18,21),(6,21),(6,10),(9,7)],col,outline); rect(d,(8,12,16,16),'panel')
    elif name=='diamond': poly(d,[(12,2),(21,12),(12,22),(3,12)],col,outline)
    elif name=='stripes':
        rect(d,box,col,outline)
        for x in range(5,20,5): line(d,[(x,4),(x-4,20)],'panel',2)
    elif name=='bowl': poly(d,[(3,8),(21,8),(18,18),(15,21),(9,21),(6,18)],col,outline); line(d,[(2,7),(22,7)],outline)
    elif name=='dots':
        for x,y in [(7,7),(16,7),(7,16),(16,16)]: ellipse(d,(x-3,y-3,x+3,y+3),col,outline)
    elif name=='blocks':
        rect(d,(3,11,12,20),col,outline); rect(d,(12,4,21,13),col,outline); rect(d,(13,14,20,20),col,outline)

for name,sh in TAGS:
    im=img(); d=D(im); rect(d,(1,1,22,22),'panel','edge'); shape(d,sh,TAGCOL[name])
    # Semantic pictogram in each shape.
    if name in ('fast','staple','soup'): bowl(d,7,10,10,7,'cream','cream')
    elif name=='spicy': chili(d,10,9,'cream')
    elif name=='fried': sparkle(d,12,12,'cream',3)
    elif name=='madedish': line(d,[(8,17),(16,7)],'cream',2); rect(d,(6,15,10,19),'cream')
    elif name=='madedrink': line(d,[(14,7),(12,16)],'cream')
    elif name=='drink': rect(d,(9,11,15,16),'cream')
    elif name=='cold':
        line(d,[(8,12),(16,12)],'cream'); line(d,[(12,8),(12,16)],'cream')
    elif name=='grilled': skewer(d,7,10,2,'cream')
    elif name=='dessert': pixel_heart(d,12,12,'cream')
    else: rect(d,(9,10,15,16),'cream')
    save(im,f'art/ico/tag_{name}.png')
    # Want bubble and 5 shared variants.
    for state in ('normal','urgent','happy','stockout','poor'):
        b=img(16,16); bd=D(b); rect(bd,(0,1,15,12),'cream'); poly(bd,[(3,13),(6,13),(3,15)],'cream')
        shape(bd,sh,TAGCOL[name],(4,2,11,9),None)
        if state=='urgent': line(bd,[(13,2),(13,6)],'danger'); px(bd,[(13,8)],'danger')
        elif state=='happy': sparkle(bd,13,4,'gold',2)
        elif state=='stockout': line(bd,[(10,6),(14,10)],'danger',2); line(bd,[(14,6),(10,10)],'danger',2)
        elif state=='poor': rect(bd,(10,5,14,9),'gold'); px(bd,[(12,6)],'ink')
        save(b,f'art/ico/want_{name}_{state}.png')

# Trait icons, lower-right 8x8 empty inset.
traits=['speed','full','spicy','madedrink','fresh','ice','sizzle','cheers','charcoal','hot','sweet','braise']
for i,name in enumerate(traits):
    im=img(); d=D(im); rect(d,(1,1,22,22),'panel','edge')
    if name=='speed': bowl(d,3,8,14,9,'gray2'); [line(d,[(2,6+j*3),(7,6+j*3)],'gold') for j in range(3)]
    elif name=='full': bowl(d,3,10,15,8); ellipse(d,(5,5,16,13),'staple')
    elif name=='spicy': chili(d,9,7); flame(d,15,3)
    elif name=='madedrink': poly(d,[(6,5),(15,8),(13,18),(4,15)],'drink','cream'); line(d,[(6,5),(16,4)],'cream',2)
    elif name=='fresh': line(d,[(4,17),(14,5)],'steel',3); flame(d,15,5)
    elif name=='ice':
        rect(d,(4,7,13,16),'drink','cream'); sparkle(d,16,6,'cream')
    elif name=='sizzle':
        bowl(d,3,9,15,9,'gold');
        for x,y in [(6,6),(11,4),(16,7)]: ellipse(d,(x,y,x+2,y+2),'cream')
    elif name=='cheers':
        line(d,[(4,17),(9,5)],'drink',4); line(d,[(18,17),(13,5)],'gold',4); sparkle(d,11,4,'cream',2)
    elif name=='charcoal':
        poly(d,[(3,15),(7,8),(16,9),(18,17),(8,19)],'gray1','steel'); px(d,[(8,13),(13,15),(10,17)],'ember')
    elif name=='hot': bowl(d,3,11,15,8); steam(d,6,10)
    elif name=='sweet': pixel_heart(d,10,11,'dessert'); px(d,[(4,5),(15,4),(16,14),(5,16)],'cream')
    else:
        bowl(d,3,9,15,10,'braised'); rect(d,(11,5,16,10),'staple')
    rect(d,(15,15,23,23),'ink','edge'); line(d,[(16,16),(21,16)],'gray1')
    save(im,f'art/ico/trait_{name}.png')

# Resonance icons: two linked pictograms.
resos=[('spicy_fast','spicy','fast'),('hot_full','soup','staple'),('fried_spicy','fried','spicy'),('fresh_drink','madedish','madedrink'),('cold_sweet','cold','dessert'),('grill_drink','grilled','drink'),('braise_staple','braised','staple'),('dessert_drink','dessert','madedrink')]
for name,a,b in resos:
    im=img(32,32); d=D(im); rect(d,(1,1,30,30),'panel','edge')
    shape(d,dict(TAGS)[a],TAGCOL[a],(2,9,13,20),'cream'); shape(d,dict(TAGS)[b],TAGCOL[b],(18,9,29,20),'cream')
    arc(d,(6,2,25,23),195,345,'gold',2); sparkle(d,16,6,'white',2)
    save(im,f'art/ico/reso_{name}.png')

# State / money / time / storage.
for name in ['wait','urgent','happy','angry','stockout','complaint','combo_up','coin','bill','timer','clock','space','storage','warning','sale','lost']:
    im=img(16,16); d=D(im)
    if name=='wait': ellipse(d,(2,2,13,13),'drink','cream'); px(d,[(6,6),(10,6)],'ink'); line(d,[(6,10),(10,10)],'ink')
    elif name=='urgent': poly(d,[(5,2),(11,2),(9,9),(7,14),(6,9)],'drink','cream')
    elif name=='happy': pixel_heart(d,8,7)
    elif name=='angry':
        line(d,[(3,4),(7,8),(3,12)],'danger',2); line(d,[(12,4),(8,8),(12,12)],'danger',2)
    elif name=='stockout':
        rect(d,(2,3,13,12),'panel','gray2'); line(d,[(3,4),(12,11)],'danger',2); line(d,[(12,4),(3,11)],'danger',2)
    elif name=='complaint': ellipse(d,(2,2,13,13),'danger','cream'); line(d,[(5,10),(10,7)],'ink')
    elif name=='combo_up': arrow(d,7,3,'gold'); sparkle(d,13,3)
    elif name=='coin': ellipse(d,(2,2,13,13),'gold','cream'); rect(d,(7,5,8,10),'grilled')
    elif name=='bill': rect(d,(1,4,14,12),'madedrink','cream'); ellipse(d,(6,6,9,10),'cream')
    elif name in ('timer','clock'):
        ellipse(d,(2,3,13,14),'panel','cream'); line(d,[(8,5),(8,9),(11,10)],'gold'); rect(d,(6,0,9,3),'gray3')
    elif name=='space': rect(d,(2,2,13,13),'panel','gray2'); rect(d,(5,5,10,10),'edge')
    elif name=='storage':
        rect(d,(1,4,14,13),'grilled','staple'); line(d,[(2,7),(13,7)],'staple')
    elif name=='warning': poly(d,[(8,1),(15,14),(1,14)],'danger','cream'); line(d,[(8,5),(8,9)],'ink'); px(d,[(8,12)],'ink')
    elif name=='sale': ellipse(d,(2,2,13,13),'gold','cream'); sparkle(d,8,8,'cream')
    else: arrow(d,7,3,'danger','down')
    save(im,f'art/ico/state_{name}.png')

# QTE icons.
for name in ('tap','rhythm','choose','calc'):
    im=img(); d=D(im); rect(d,(1,1,22,22),'panel','edge')
    if name=='tap':
        rect(d,(8,4,12,14),'cream'); rect(d,(10,12,16,17),'skin'); sparkle(d,5,6,'gold')
    elif name=='rhythm':
        for x,h in [(4,7),(9,13),(14,9),(18,15)]: rect(d,(x,18-h,x+2,18),'madedrink')
    elif name=='choose':
        rect(d,(4,5,9,10),'drink','cream'); rect(d,(14,5,19,10),'gold','cream'); line(d,[(6,17),(17,17)],'cream')
    else:
        line(d,[(5,6),(10,11)],'gold',2); line(d,[(10,6),(5,11)],'gold',2); line(d,[(14,6),(19,6)],'cream'); line(d,[(14,10),(19,10)],'cream')
    save(im,f'art/ico/qte_{name}.png')

# Progress dots and skill-tree icons.
for state,col in [('empty','panel'),('full','amber'),('highlight','gold')]:
    im=img(8,8); d=D(im); rect(d,(1,1,6,6),col,'gray3' if state=='empty' else col)
    save(im,f'art/ui/ui_dot_{state}.png')
for name,col in [('efficiency','gold'),('capacity','drink'),('flavor','danger'),('bonus_food','fast'),('bonus_drink','madedrink'),('bonus_service','cream'),('bonus_stock','cold'),('bonus_qte','dessert'),('bonus_gold','gold'),('bonus_space','blue')]:
    im=img(); d=D(im); rect(d,(1,1,22,22),'panel','edge')
    if name=='efficiency': arrow(d,9,5,col); arrow(d,15,8,col)
    elif name in ('capacity','bonus_space'): rect(d,(5,5,18,18),'panel',col); rect(d,(8,8,15,15),col)
    elif name=='flavor': chili(d,9,7,col)
    elif name=='bonus_gold': ellipse(d,(5,5,18,18),col,'cream')
    else: sparkle(d,12,12,col,6)
    save(im,f'art/ico/skill_{name}.png')
for state in ('locked','ready','active'):
    im=img(24,24); d=D(im); rect(d,(2,2,21,21),'panel',{'locked':'gray1','ready':'gold','active':'madedrink'}[state])
    if state=='locked': rect(d,(8,10,15,17),'gray1'); arc(d,(9,5,14,13),180,360,'gray1')
    else: sparkle(d,12,12,'gold' if state=='ready' else 'madedrink',4)
    save(im,f'art/ui/ui_node_{state}.png')

# UI nine-slices and controls.
for name,base,border in [('panel','panel','edge'),('panel_light','cream','gray2'),('tooltip','ink','gold'),('card_frame','panel','amber'),('qte_panel','bg','drink')]:
    im=img(32 if name!='tooltip' else 24,32 if name!='tooltip' else 24); d=D(im); w,h=im.size
    rect(d,(0,0,w-1,h-1),border); rect(d,(2,2,w-3,h-3),base); line(d,[(4,4),(w-5,4)],'gray3' if name=='panel_light' else 'edge')
    save(im,f'art/ui/ui_{name}_9slice.png')
for color,col in [('primary','amber'),('secondary','edge'),('danger','danger'),('disabled','gray1')]:
    for state in ('normal','hover','pressed','selected'):
        im=img(24,24); d=D(im)
        border='white' if state=='hover' else ('gold' if state=='selected' else col)
        rect(d,(0,0,23,23),border); rect(d,(2,2,21,21),'panel' if state=='pressed' else col)
        line(d,[(3,20),(20,20)],'grilled' if state!='disabled' else 'dark')
        save(im,f'art/ui/ui_btn_{color}_{state}_9slice.png')
for state in ('on','off'):
    im=img(24,48); d=D(im); rect(d,(0,0,23,47),'gold' if state=='on' else 'edge'); rect(d,(2,2,21,45),'panel'); line(d,[(3,3),(20,3)],'amber' if state=='on' else 'gray1'); save(im,f'art/ui/ui_tab_{state}.png')
for name in ('slider_track','slider_knob','checkbox_on','checkbox_off','scrollbar','scroll_thumb','divider_h','divider_v','progressbar_bg','progressbar_fill_warm','progressbar_fill_danger'):
    sizes={'slider_track':(8,16),'slider_knob':(16,16),'checkbox_on':(16,16),'checkbox_off':(16,16),'scrollbar':(8,8),'scroll_thumb':(8,24),'divider_h':(8,8),'divider_v':(8,8),'progressbar_bg':(8,8),'progressbar_fill_warm':(8,8),'progressbar_fill_danger':(8,8)}
    im=img(*sizes[name]); d=D(im)
    if name=='slider_track': rect(d,(3,0,4,15),'gray1'); rect(d,(2,7,5,8),'edge')
    elif name=='slider_knob': rect(d,(2,2,13,13),'amber','cream'); rect(d,(5,4,10,11),'gold')
    elif name.startswith('checkbox'):
        rect(d,(1,1,14,14),'panel','gray2')
        if name.endswith('on'): line(d,[(4,8),(7,11),(12,4)],'madedrink',2)
    elif name=='scrollbar': rect(d,(2,0,5,7),'panel')
    elif name=='scroll_thumb': rect(d,(1,0,6,23),'gray1','gray2')
    elif name=='divider_h': rect(d,(0,3,7,4),'edge')
    elif name=='divider_v': rect(d,(3,0,4,7),'edge')
    elif name=='progressbar_bg': rect(d,(0,0,7,7),'panel','edge')
    else: rect(d,(0,0,7,7),'amber' if name.endswith('warm') else 'danger')
    save(im,f'art/ui/ui_{name}.png')
for name in ('close','arrow_up','arrow_down','arrow_left','arrow_right','more','star_full','star_empty','trend_up','trend_flat','trend_down'):
    im=img(16,16); d=D(im)
    if name=='close': line(d,[(3,3),(12,12)],'cream',2); line(d,[(12,3),(3,12)],'cream',2)
    elif name.startswith('arrow'): arrow(d,7,3,'cream',name.split('_')[1])
    elif name=='more':
        for x in (3,7,11): rect(d,(x,7,x+1,8),'cream')
    elif name.startswith('star'): poly(d,[(8,1),(10,5),(15,5),(11,9),(13,14),(8,11),(3,14),(5,9),(1,5),(6,5)],'gold' if name.endswith('full') else 'gray1')
    else: arrow(d,7,3,'gold' if name.endswith('up') else ('danger' if name.endswith('down') else 'gray2'),'up' if name.endswith('up') else ('down' if name.endswith('down') else 'right'))
    save(im,f'art/ui/ui_{name}.png')
im=img(64,64); d=D(im)
for y in range(64):
    for x in range(64):
        if (x+y)%2==0: px(d,[(x,y)],'ink')
save(im,'art/ui/ui_mask_dither.png')
for state in ('on','off','flash'):
    im=img(8,8); d=D(im); rect(d,(3,0,4,2),'gray1')
    if state=='off': rect(d,(2,3,5,6),'gray1')
    else: rect(d,(1,2,6,6),'white' if state=='flash' else 'amber'); px(d,[(2,2),(3,3)],'white')
    save(im,f'art/ui/ui_bulb_{state}.png')
for i in range(8):
    im=img(12,12); d=D(im); ellipse(d,(2,2,9,9),['skin','gray2','skin','skin','gray1'][i%5]); rect(d,(1,1,10,3),['ink','gold','gray2','ink','red'][i%5]); rect(d,(3,9,8,11),['blue','orange','cream','red','gray1'][i%5]); px(d,[(4,5),(7,5)],'ink'); save(im,f'art/ui/ui_supplier_{i:02}.png')
for state,col in [('open','madedrink'),('closed','gray1'),('blocked','danger')]:
    im=img(16,8); d=D(im); rect(d,(0,0,15,7),'panel',col); rect(d,(2,3,5,4),col); line(d,[(8,3),(13,3)],col); save(im,f'art/ui/ui_supply_{state}.png')

# Ranking ribbons and five blank stamps.
for rank,col in [(1,'gold'),(2,'gray3'),(3,'fried')]:
    im=img(96,24); d=D(im); rect(d,(6,3,89,20),'panel',col); poly(d,[(0,7),(7,3),(7,20),(0,16),(4,12)],col); rect(d,(10,6,12,17),col); save(im,f'art/ui/ui_rank_{rank}.png')
for i,name in enumerate(('excellent','good','normal','poor','bad')):
    im=img(48,48); d=D(im); col=['gold','madedrink','cream','orange','danger'][i]
    ellipse(d,(3,3,44,44),'panel',col); ellipse(d,(7,7,40,40),'panel',col)
    # Geometric seal glyph, no Chinese text baked in.
    if i<2: sparkle(d,24,24,col,10)
    elif i==2: rect(d,(15,21,32,26),col)
    else: line(d,[(15,15),(32,32)],col,3); line(d,[(32,15),(15,32)],col,3)
    save(im,f'art/ui/ui_stamp_{name}.png')

# FX particles, light bands, rain, ring and banner.
for name,size in [('dot',4),('spark',8),('smoke',16),('oil',8)]:
    im=img(size,size); d=D(im)
    if name=='dot': rect(d,(1,1,2,2),'white')
    elif name=='spark': sparkle(d,3,3,'amber',3)
    elif name=='oil': ellipse(d,(1,1,6,6),'gold','cream')
    else:
        for box,c in [((1,6,14,14),'dark'),((4,2,11,12),'gray1'),((6,4,14,10),'gray2')]: ellipse(d,box,c)
        for x,y in [(2,5),(12,12),(4,14),(13,5)]: px(d,[(x,y)],'bg')
    save(im,f'art/fx/fx_{name}.png')
for name,size,col in [('warm',(96,96),'amber'),('fire',(64,64),'orange'),('cool',(64,64),'drink')]:
    im=img(*size); d=D(im); w,h=size
    for inset,c in [(0,'panel'),(w//6,'grilled' if col!='drink' else 'blue'),(w//3,col)]:
        ellipse(d,(inset,inset,w-1-inset,h-1-inset),c)
    # Quantized dither at the outer edge.
    for y in range(h):
        for x in range(w):
            if (x+y)%3==0 and ((x-w/2)**2+(y-h/2)**2)<(w*.45)**2: px(d,[(x,y)],c if (x+y)%2 else 'panel')
    save(im,f'art/fx/light_{name}.png')
im=img(16,16); d=D(im); arc(d,(0,0,15,15),200,340,'gold',2); px(d,[(4,3),(12,3)],'white'); save(im,'art/fx/fx_resonance_arc.png')
im=img(16,16); d=D(im)
for x,y in [(1,0),(7,5),(13,10),(3,11)]: line(d,[(x,y),(x-3,y+5)],'cool')
save(im,'art/fx/fx_rain_tile.png')
im=img(64,64); d=D(im)
for y in range(64):
    for x in range(64):
        if (x+y)%2==0 and (x//4+y//4)%2==0: px(d,[(x,y)],'gray2')
save(im,'art/fx/fx_fog_dither.png')
im=img(128,32); d=D(im); poly(d,[(0,8),(12,3),(116,3),(127,8),(119,16),(127,24),(116,29),(12,29),(0,24),(8,16)],'red','gold'); rect(d,(12,7,115,25),'red'); line(d,[(15,8),(112,8)],'amber'); save(im,'art/fx/fx_ribbon.png')
for frame in range(3):
    im=img(32,32); d=D(im); r=[5,10,14][frame]
    for i in range(8):
        # Eight axis/diagonal stepped rays, not arbitrary sprite rotation.
        if i==0: line(d,[(16-r,16),(16+r,16)],'gold')
        elif i==1: line(d,[(16,16-r),(16,16+r)],'gold')
        else:
            s=r-2
            line(d,[(16-s,16-s),(16+s,16+s)],'orange')
            line(d,[(16-s,16+s),(16+s,16-s)],'orange')
            break
    sparkle(d,16,16,'white',3+frame)
    save(im,f'art/fx/fx_starburst_{frame:02}.png')
for frame in range(8):
    im=img(96,96); d=D(im)
    # Pixel circle with eight frame clock arcs.
    ellipse(d,(8,8,87,87),'panel','edge'); ellipse(d,(14,14,81,81),'ink','gray1')
    arc(d,(10,10,85,85),-90,-90+(frame+1)*45,'gold',3)
    save(im,f'art/fx/qte_timer_ring_{frame:02}.png')

# Scene prop groups, three for market, small props for other scenes.
for group in range(3):
    im=img(64,48); d=D(im)
    if group==0:
        for x,y,c in [(2,20,'blue'),(24,13,'red'),(37,25,'edge')]: rect(d,(x,y,x+22,y+18),c,'gray2'); line(d,[(x+3,y+5),(x+19,y+5)],'cool')
    elif group==1:
        rect(d,(3,15,58,31),'gray1','steel'); ellipse(d,(7,31,20,43),'ink'); ellipse(d,(43,31,56,43),'ink'); rect(d,(6,18,55,21),'cool')
    else:
        rect(d,(4,12,56,38),'staple'); line(d,[(5,18),(55,18)],'grilled'); rect(d,(18,3,42,13),'cream')
    save(im,f'art/scene/market_props_{group:02}.png')
print('icons, UI, FX generated')
