from artlib import *

# Scene layers: no baked shadows or text.
for lit in (False,True):
    for layer,size in [('far',(704,360)),('mid',(768,360)),('near',(640,360))]:
        im=make_background(size,layer=='far',lit)
        d=D(im)
        if layer=='mid':
            for x in range(50,720,155):
                rect(d,(x,185,x+94,287),'ink'); rect(d,(x-5,179,x+99,184),'red' if x%3 else 'blue')
                for j in range(3): rect(d,(x+8+j*25,204,x+28+j*25,222),'panel')
                if lit: rect(d,(x+12,225,x+81,242),'grilled'); rect(d,(x+19,230,x+75,232),'orange')
            # Ground reflected warm stripes, no smooth gradients.
            if lit:
                for x in range(62,700,155):
                    for y in range(295,350,7):
                        half=max(1,18-(y-295)//4); rect(d,(x-half,y,x+half,y+1),'grilled' if y<320 else 'panel')
        elif layer=='near':
            for x,y in [(52,314),(580,300),(466,336)]:
                rect(d,(x,y,x+35,y+2),'dark'); rect(d,(x+9,y+3,x+26,y+3),'grilled' if lit else 'panel')
        save(im,f'art/scene/night_{layer}_{"lit" if lit else "dark"}.png')

for kind in ('market','prep'):
    for layer,size in [('far',(704,360)),('mid',(768,360)),('near',(640,360))]:
        im=make_background(size,layer=='far',True,'market' if kind=='market' else 'prep'); d=D(im)
        if layer=='mid':
            if kind=='market':
                for x in range(15,730,86):
                    rect(d,(x,236,x+65,285),'edge'); rect(d,(x+4,240,x+61,247),'cool')
                    for j in range(4): rect(d,(x+6+j*13,252,x+15+j*13,263),'cold' if j%2 else 'staple')
                for x in range(0,768,96): rect(d,(x,138,x+8,287),'gray1')
                for x in range(16,768,112): poly(d,[(x,138),(x+65,138),(x+80,157),(x-16,157)],'gray2')
            else:
                rect(d,(0,211,767,218),'panel')
                for x in range(10,768,98): rect(d,(x,214,x+60,285),'panel'); rect(d,(x+7,223,x+53,243),'dark')
        elif layer=='near':
            rect(d,(0,342,639,359),'panel')
            if kind=='prep':
                for x in (75,104,137):
                    rect(d,(x,319,x+18,337),'edge'); ellipse(d,(x+3,315,x+15,325),'cold')
            else:
                for x in range(30,640,127): rect(d,(x,329,x+45,341),'blue'); line(d,[(x+3,331),(x+41,331)],'cool')
        save(im,f'art/scene/{kind}_{layer}.png')

# Cart modules.
im=img(192,96); d=D(im)
rect(d,(7,15,184,64),'red','edge'); rect(d,(0,8,191,18),'steel','gray3'); rect(d,(5,21,186,26),'grilled')
for x in range(13,180,17): line(d,[(x,29),(x,61)],'red')
for x in (28,157): ellipse(d,(x,65,x+19,85),'ink'); ellipse(d,(x+4,70,x+15,80),'gray1'); rect(d,(x+8,73,x+11,77),'steel')
rect(d,(15,48,71,58),'panel'); rect(d,(120,44,174,56),'panel')
save(im,'art/scene/booth_base.png')
for kind in ('surface_1x','surface_end_left','surface_end_right'):
    im=img(48,48); d=D(im); rect(d,(0,0,47,47),'steel','gray3')
    for y in range(7,48,8): line(d,[(0,y),(47,y)],'gray2')
    line(d,[(0,45),(47,45)],'edge')
    if kind.endswith('left'): rect(d,(0,0,4,47),'edge'); rect(d,(2,3,3,40),'cool')
    if kind.endswith('right'): rect(d,(43,0,47,47),'edge'); rect(d,(44,3,45,40),'gray3')
    save(im,'art/scene/booth_'+kind+'.png')
for state in ('down','up'):
    im=img(192,48); d=D(im)
    for x in range(0,192,16): rect(d,(x,5,min(x+15,191),29 if state=='down' else 20),['cream','red','blue'][(x//16)%3])
    rect(d,(0,3,191,6),'edge'); line(d,[(0,31 if state=='down' else 22),(191,31 if state=='down' else 22)],'gray1')
    if state=='up':
        for x in range(8,192,24): line(d,[(x,21),(x+4,25),(x+8,21)],'gray2')
    save(im,f'art/scene/booth_awning_{state}.png')
im=img(96,32); d=D(im); rect(d,(0,0,95,31),'edge'); rect(d,(3,3,92,28),'panel'); rect(d,(5,5,90,26),'red'); line(d,[(5,5),(90,5)],'amber'); save(im,'art/scene/booth_sign.png')
im=img(48,16); d=D(im); line(d,[(0,1),(12,4),(24,6),(36,4),(47,1)],'gray1')
for x,y in [(5,3),(21,6),(37,3)]:
    rect(d,(x,y,x+2,y+2),'gray1'); rect(d,(x-1,y+3,x+3,y+6),'amber'); px(d,[(x,y+3),(x+1,y+4)],'white')
save(im,'art/scene/booth_bulb_string.png')
im=img(48,64); d=D(im); rect(d,(2,3,45,61),'gray1'); rect(d,(5,6,42,58),'ink','steel'); rect(d,(20,0,27,5),'amber')
for y in range(13,52,9): line(d,[(10,y),(36,y)],'edge')
save(im,'art/scene/booth_menu_board.png')
for name,col in [('red','red'),('blue','blue'),('white','cream')]:
    im=img(16,24); d=D(im); rect(d,(1,4,14,9),col,'gray2'); rect(d,(3,0,12,4),col)
    line(d,[(3,10),(1,22)],col,2); line(d,[(12,10),(14,22)],col,2); line(d,[(4,17),(11,17)],'edge')
    save(im,f'art/scene/booth_stool_{name}.png')
im=img(24,48); d=D(im); rect(d,(9,1,14,5),'steel'); rect(d,(6,5,17,10),'edge'); ellipse(d,(3,8,20,40),'gray1'); rect(d,(3,16,20,38),'gray1'); ellipse(d,(4,33,19,43),'edge'); rect(d,(5,13,7,32),'cool'); rect(d,(5,39,18,43),'dark'); save(im,'art/scene/booth_gas_tank.png')
im=img(16,16); d=D(im); rect(d,(2,1,13,14),'cream','madedrink'); rect(d,(4,3,11,11),'ink')
for x,y in [(4,3),(8,3),(10,4),(5,6),(7,7),(9,9),(4,10),(11,11)]: rect(d,(x,y,x+1,y+1),'madedrink')
save(im,'art/scene/booth_qr_sign.png')
im=img(24,24); d=D(im); ellipse(d,(3,3,20,7),'steel'); poly(d,[(3,5),(20,5),(17,22),(6,22)],'gray1','steel'); rect(d,(6,9,8,18),'cool'); save(im,'art/scene/booth_bucket.png')
im=img(32,32); d=D(im); line(d,[(15,0),(15,7)],'gray2',2); poly(d,[(6,8),(25,8),(29,18),(2,18)],'edge','steel'); rect(d,(4,19,27,21),'white'); rect(d,(7,22,24,23),'amber'); save(im,'art/scene/booth_light_lamp.png')

# Customer generator, 7 body frames + 4 face patches per archetype.
customers=[('student','blue','cream'),('worker','gray2','gray1'),('courier','gold','dark'),('couple','dessert','blue'),('elder','cream','gray1'),('child','orange','blue'),('runner','madedrink','dark'),('drunk','red','gray1')]
for ci,(name,shirt,pants) in enumerate(customers):
    for frame,action in enumerate(['walk_01','walk_02','wait','urgent','happy','leave_01','leave_02']):
        im=img(24,40); d=D(im); bob=1 if frame in (0,3,5) else 0
        # Legs and stride.
        line(d,[(8,29+bob),(7-frame%2*2,38)],pants,3); line(d,[(15,29+bob),(16+frame%2*2,38)],pants,3)
        rect(d,(4,37,9,39),'ink'); rect(d,(14,37,20,39),'ink')
        # Torso, arms.
        poly(d,[(6,17+bob),(17,17+bob),(19,30+bob),(5,30+bob)],shirt)
        line(d,[(6,20+bob),(3,27+bob)],'skin' if name!='drunk' else 'ember',2); line(d,[(17,20+bob),(20,26+bob)],'skin',2)
        # Face/hair.
        rect(d,(7,5+bob,16,16+bob),'skin'); rect(d,(6,4+bob,17,8+bob),'gray2' if name=='elder' else 'ink')
        px(d,[(9,11+bob),(14,11+bob)],'ink'); line(d,[(10,14+bob),(13,14+bob)],'grilled')
        if name=='student':
            rect(d,(3,18,6,27),'dark'); line(d,[(7,19),(10,27)],'cream'); line(d,[(16,19),(13,27)],'cream')
        elif name=='worker':
            line(d,[(10,18),(14,18)],'cream'); poly(d,[(12,18),(14,22),(12,27),(10,22)],'red'); line(d,[(8,10),(15,10)],'ink')
        elif name=='courier':
            rect(d,(5,3,18,7),'gold'); rect(d,(7,1,16,3),'amber'); rect(d,(15,20,22,30),'orange','white')
        elif name=='couple':
            pixel_heart(d,12,25,'cream'); line(d,[(19,25),(22,29)],'skin')
        elif name=='elder':
            ellipse(d,(17,24,22,29),'staple'); line(d,[(20,28),(22,20)],'staple')
        elif name=='child':
            rect(d,(10,19,13,25),'cream')
        elif name=='runner':
            line(d,[(6,7),(4,13),(8,14)],'cool'); px(d,[(4,13)],'cream'); line(d,[(7,20),(16,20)],'cream')
        elif name=='drunk':
            rect(d,(7,10,9,12),'ember'); rect(d,(14,10,16,12),'ember'); line(d,[(6,3),(17,5)],'ink')
        if action=='urgent': line(d,[(20,5),(20,9)],'danger'); px(d,[(20,11)],'danger')
        if action=='happy': pixel_heart(d,21,6,'danger')
        save(im,f'art/char/chr_customer_{name}_{action}.png')
    for face in ('calm','expect','urgent','angry'):
        im=img(16,16); d=D(im); rect(d,(2,2,13,13),'skin'); rect(d,(1,1,14,4),'gray2' if name=='elder' else 'ink')
        if face=='angry': line(d,[(4,6),(7,7)],'ink'); line(d,[(11,6),(8,7)],'ink'); line(d,[(6,11),(10,10)],'grilled')
        else:
            px(d,[(5,7),(10,7)],'ink')
            if face=='expect': arc(d,(5,7,10,12),0,180,'grilled')
            elif face=='urgent': rect(d,(7,10,8,12),'grilled'); line(d,[(14,4),(14,7)],'drink'); px(d,[(13,8)],'drink')
            else: line(d,[(6,10),(9,10)],'grilled')
        save(im,f'art/char/chr_customer_{name}_face_{face}.png')

# Player action frames, three palettes.
for skin,shirt in [('red','red'),('blue','blue'),('cream','cream')]:
    actions=['idle_01','idle_02','cook_01','cook_02','cook_03','serve_01','serve_02','carry_01','carry_02','wipe']
    for i,action in enumerate(actions):
        im=img(32,48); d=D(im); bob=i%2
        line(d,[(11,37),(10,46)],'dark',4); line(d,[(20,37),(22,46)],'dark',4)
        rect(d,(7,44,13,47),'ink'); rect(d,(20,44,27,47),'ink')
        poly(d,[(8,19+bob),(23,19+bob),(25,39),(7,39)],'gray2'); poly(d,[(10,22),(21,22),(23,39),(8,39)],shirt)
        rect(d,(11,7+bob,22,19+bob),'skin'); rect(d,(10,5+bob,23,11+bob),'ink'); rect(d,(20,11+bob,23,17+bob),'skin')
        line(d,[(8,22),(3,30)],'skin',3)
        if action.startswith('cook'):
            line(d,[(23,23),(28,18+i%3)],'skin',3); line(d,[(28,18+i%3),(30,11)],'steel')
        elif action.startswith('serve'):
            line(d,[(22,23),(29,23)],'skin',3); plate(d,21,17,10)
        elif action.startswith('carry'):
            line(d,[(22,23),(26,30)],'skin',3); rect(d,(0,25,29,39),'grilled','staple'); line(d,[(1,29),(28,29)],'staple')
        elif action=='wipe':
            line(d,[(22,24),(21,9)],'skin',3); rect(d,(18,6,24,10),'cream')
        else: line(d,[(23,22),(27,31)],'skin',3)
        save(im,f'art/char/chr_player_{action}_{skin}.png')

# Background silhouettes and stock workers.
for i in range(12):
    im=img(64,48); d=D(im); x=25+(i%3)*3
    ellipse(d,(x,3,x+10,13),'ink'); poly(d,[(x-3,13),(x+13,13),(x+15,32),(x-5,32)],'ink')
    line(d,[(x,30),(x-4+(i%2)*4,45)],'ink',4); line(d,[(x+10,30),(x+16-(i%2)*4,45)],'ink',4)
    if i<8:
        line(d,[(x,17),(x-8-i%4,27)],'ink',3); line(d,[(x+10,17),(x+19,27-i%4*2)],'ink',3)
    else:
        rect(d,(x+12,24,x+27,37),'ink'); line(d,[(x+8,18),(x+20,28)],'ink',3)
    save(im,f'art/char/chr_crowd_{"worker" if i>=8 else "silhouette"}_{i%4 if i>=8 else i:02}.png')

# Special patrons: 96px portraits, 2 expressions, 48px avatars.
specials=[('blogger','dessert'),('gold_courier','gold'),('foodie','orange'),('critic','gray2'),('eater','braised')]
for si,(name,col) in enumerate(specials):
    im=img(96,96); d=D(im)
    ellipse(d,(24,9,70,57),'skin'); poly(d,[(22,14),(34,3),(65,6),(75,28),(70,37),(65,18),(30,20),(25,38)],'gray2' if name=='critic' else 'ink')
    rect(d,(29,29,34,32),'ink'); rect(d,(58,29,63,32),'ink'); line(d,[(39,46),(55,46)],'grilled',2)
    poly(d,[(25,54),(70,54),(89,92),(6,92)],col)
    if name=='blogger':
        rect(d,(62,37,84,66),'ink','cream'); rect(d,(66,41,80,58),'drink'); rect(d,(67,30,78,35),'white')
    elif name=='gold_courier':
        poly(d,[(19,22),(26,3),(65,2),(76,22)],'gold'); rect(d,(21,20,74,26),'amber'); rect(d,(66,59,93,91),'orange','white')
    elif name=='foodie':
        rect(d,(15,52,78,62),'cream'); line(d,[(16,54),(12,84)],'cream',5)
    elif name=='critic':
        rect(d,(25,27,41,36),'gray1','cream'); rect(d,(53,27,69,36),'gray1','cream'); line(d,[(42,31),(52,31)],'gray1'); line(d,[(79,55),(83,91)],'staple',3)
    else:
        for y in range(55,86,9): bowl(d,60,y-10,27,10)
    save(im,f'art/char/chr_special_{name}_portrait.png')
    avatar=im.resize((48,48),Image.Resampling.NEAREST); save(avatar,f'art/char/chr_special_{name}_avatar.png')
    for mood in ('happy','angry'):
        ex=img(96,96); ed=D(ex); ex.alpha_composite(im)
        rect(ed,(27,27,66,49),'skin')
        if mood=='happy':
            line(ed,[(29,32),(34,30),(38,32)],'ink'); line(ed,[(56,32),(60,30),(65,32)],'ink'); arc(ed,(39,35,57,48),0,180,'grilled',2)
        else:
            line(ed,[(29,29),(38,33)],'ink',2); line(ed,[(56,33),(65,29)],'ink',2); line(ed,[(42,46),(54,43)],'grilled',2)
        save(ex,f'art/char/chr_special_{name}_{mood}.png')
print('scene and character assets generated')
