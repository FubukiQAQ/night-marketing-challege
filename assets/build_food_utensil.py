from artlib import *

# 30 modular components, reusable at runtime.
components={
'bowl_empty':lambda d:bowl(d),'bowl_noodles':lambda d:(bowl(d),[line(d,[(5+i*3,10),(7+i*3,14)],'staple',2) for i in range(5)]),
'bowl_rice':lambda d:(bowl(d),ellipse(d,(5,6,19,13),'cream'),px(d,[(8,7),(12,8),(16,9)],'white')),
'plate_empty':lambda d:plate(d),'plate_meat':lambda d:(plate(d),[rect(d,(4+i*5,10+i%2*2,9+i*5,14+i%2*2),'grilled') for i in range(4)]),
'plate_veg':lambda d:(plate(d),[ellipse(d,(4+i*5,11,8+i*5,15),'cold') for i in range(4)]),
'cup_tea':lambda d:cup(d,col='madedrink'),'cup_juice':lambda d:cup(d,col='orange'),'cup_soy':lambda d:cup(d,col='staple',straw=False),
'bottle':lambda d:(rect(d,(8,6,15,20),'drink','cream'),rect(d,(10,3,13,6),'gray3'),rect(d,(9,10,14,15),'cream')),
'can':lambda d:(rect(d,(7,5,16,20),'drink','cream'),ellipse(d,(7,3,16,7),'gray3'),rect(d,(8,10,15,14),'cream')),
'skewer_meat':lambda d:skewer(d,5,7,3,'grilled'),'skewer_veg':lambda d:skewer(d,5,7,3,'cold'),
'bun':lambda d:(ellipse(d,(4,8,19,20),'staple'),line(d,[(6,10),(17,10)],'cream'),px(d,[(8,8),(13,8),(16,10)],'white')),
'dumpling':lambda d:(plate(d),[poly(d,[(3+i*5,14),(5+i*5,8),(9+i*5,14)],'cream','staple') for i in range(4)]),
'tofu':lambda d:(plate(d),[rect(d,(4+i*5,10,8+i*5,15),'staple','white') for i in range(4)]),
'chicken':lambda d:(plate(d),ellipse(d,(4,7,17,17),'fried'),rect(d,(15,13,20,16),'staple')),
'paper_wrap':lambda d:(poly(d,[(4,8),(19,8),(17,21),(6,21)],'cream'),rect(d,(6,9,17,13),'orange')),
'cone_fries':lambda d:(poly(d,[(5,10),(18,10),(14,21),(9,21)],'ember'),[line(d,[(7+i*2,11),(6+i*3,4)],'gold',2) for i in range(4)]),
'icecream':lambda d:(poly(d,[(8,13),(16,13),(12,22)],'fried'),ellipse(d,(7,7,17,16),'dessert'),ellipse(d,(9,4,14,11),'cream')),
'dessert_cup':lambda d:(cup(d,col='dessert',straw=False),ellipse(d,(8,4,16,10),'cream'),pixel_heart(d,12,5,'danger')),
'garnish_scallion':lambda d:[rect(d,(5+i*4,9+i%2*2,7+i*4,10+i%2*2),'cold') for i in range(4)],
'garnish_chili':lambda d:chili(d,13,8),'garnish_sesame':lambda d:px(d,[(7+i*3,10+i%2*3) for i in range(5)],'white'),
'garnish_coriander':lambda d:[ellipse(d,(6+i*3,8+i%2*2,9+i*3,11+i%2*2),'cold') for i in range(4)],
'garnish_peanut':lambda d:[ellipse(d,(5+i*4,9+i%2*2,8+i*4,12+i%2*2),'staple') for i in range(4)],
'garnish_bamboo':lambda d:[rect(d,(8+i*4,7,10+i*4,14),'staple') for i in range(3)],
'egg':lambda d:(ellipse(d,(5,7,18,18),'cream'),ellipse(d,(9,10,15,16),'gold')),
'leaf':lambda d:(poly(d,[(4,16),(7,7),(15,4),(19,9),(15,17)],'cold'),line(d,[(6,17),(16,7)],'madedrink')),
'steam':lambda d:steam(d,6,8)}
for name,fn in components.items():
    im=img(); fn(D(im)); save(im,f'art/food/component_{name}.png')

# 82 dishes. Distinct visual anchors for similar noodle/soup items.
dishes=[
('hotdry_noodles','noodle','staple','scallion'),('sour_spicy_noodles','noodle','spicy','peanut'),('luosifen','noodle','braised','bamboo'),('malatang','noodle','spicy','skewer'),('beef_noodles','noodle','grilled','coriander'),('dan_dan_noodles','noodle','spicy','sesame'),('cold_noodles','noodle','cold','sesame'),('fried_noodles','noodle','fried','scallion'),
('rice_bowl','rice','staple','egg'),('fried_rice','rice','fast','scallion'),('curry_rice','rice','gold','carrot'),('braised_pork_rice','rice','braised','coriander'),('chicken_rice','rice','staple','chicken'),('rice_ball','rice','staple','leaf'),
('dumplings','dumpling','staple','scallion'),('soup_dumplings','dumpling','soup','steam'),('wonton','dumpling','soup','coriander'),('bao','bun','staple','steam'),('bbq_bun','bun','braised','sesame'),('shengjian','bun','fried','scallion'),
('skewer_lamb','skewer','grilled','chili'),('skewer_chicken','skewer','grilled','sesame'),('skewer_veg','skewerveg','cold','chili'),('squid_skewer','skewer','orange','chili'),('grilled_fish','meat','grilled','leaf'),('grilled_corn','veg','gold','butter'),('grilled_eggplant','veg','grilled','garlic'),('oyster','meat','soup','garlic'),
('fried_chicken','chicken','fried','sesame'),('fries','fries','fried','salt'),('fried_tofu','tofu','fried','chili'),('tempura','meat','fried','leaf'),('fried_dough','wrap','gold','sesame'),('popcorn_chicken','chicken','orange','pepper'),
('soup_beef','soup','soup','coriander'),('soup_chicken','soup','staple','scallion'),('hot_sour_soup','soup','spicy','bamboo'),('seaweed_soup','soup','cold','egg'),('tomato_egg_soup','soup','ember','egg'),('pork_congee','rice','soup','scallion'),('redbean_soup','soup','braised','dessert'),('tremella_soup','soup','dessert','fruit'),
('cold_cucumber','veg','cold','garlic'),('cold_wood_ear','veg','grilled','chili'),('cold_tofu','tofu','cold','scallion'),('cold_chicken','meat','cold','chili'),('seaweed_salad','veg','cold','sesame'),('pickled_radish','veg','orange','chili'),
('braised_beef','meat','braised','spice'),('braised_egg','egg','braised','spice'),('braised_tofu','tofu','braised','chili'),('braised_feet','meat','braised','sesame'),('braised_wings','chicken','braised','spice'),('braised_platter','meat','braised','coriander'),
('milk_tea','tea','madedrink','pearl'),('lemon_tea','tea','madedrink','lemon'),('fruit_tea','juice','madedrink','fruit'),('orange_juice','juice','drink','orange'),('watermelon_juice','juice','spicy','melon'),('soymilk','soy','staple','steam'),('sour_plum_drink','tea','braised','ice'),('coconut','tea','cream','leaf'),
('cola','can','drink','ice'),('soda','can','madedrink','lemon'),('beer','bottle','gold','foam'),('water','bottle','drink','drop'),('energy','can','orange','spark'),('yogurt','bottle','cream','fruit'),
('icecream','icecream','dessert','heart'),('shaved_ice','dessertcup','drink','fruit'),('mango_sago','dessertcup','gold','fruit'),('tofu_pudding','dessertcup','cream','syrup'),('sesame_ball','bun','dessert','sesame'),('egg_tart','tart','dessert','egg'),('tanghulu','skewer','danger','sugar'),('cotton_candy','icecream','dessert','spark'),
('pancake','wrap','made','scallion'),('jianbing','wrap','staple','egg'),('rice_roll','wrap','cream','meat'),('hand_pancake','wrap','gold','leaf'),('stinky_tofu','tofu','grilled','chili'),('egg_waffle','tart','gold','egg')]

def dish_icon(style,color,garnish):
    im=img(); d=D(im)
    if style=='noodle':
        bowl(d); ellipse(d,(4,8,19,13),color)
        for i in range(5): line(d,[(5+i*3,9),(7+i*3,12)],'staple')
    elif style in ('rice','soup'):
        bowl(d); ellipse(d,(5,7,18,13),color)
        if style=='rice':
            for i in range(5): rect(d,(7+i*2,7+i%2,8+i*2,8+i%2),'cream')
    elif style in ('meat','veg'):
        plate(d)
        for i in range(4): ellipse(d,(3+i*5,9+i%2*2,9+i*5,14+i%2*2),color)
    elif style=='dumpling':
        plate(d)
        for i in range(4): poly(d,[(3+i*5,14),(5+i*5,8),(9+i*5,14)],'cream',color)
    elif style in ('bun','tart'):
        plate(d)
        for x in (4,13): ellipse(d,(x,8,x+7,16),color); px(d,[(x+2,9),(x+4,10)],'cream')
    elif style in ('skewer','skewerveg'):
        skewer(d,3,7,3,color); skewer(d,8,8,3,color)
    elif style=='chicken':
        plate(d); ellipse(d,(4,7,18,17),color); rect(d,(16,13,20,16),'staple'); px(d,[(8,9),(13,10)],'white')
    elif style=='fries':
        poly(d,[(5,10),(18,10),(14,21),(9,21)],'ember')
        for i in range(4): line(d,[(7+i*2,11),(6+i*3,4)],'gold',2)
    elif style in ('tea','juice','soy'):
        cup(d,col=color)
    elif style in ('can','bottle'):
        if style=='can': rect(d,(7,5,16,20),color,'cream'); ellipse(d,(7,3,16,7),'gray3')
        else: rect(d,(8,6,15,20),color,'cream'); rect(d,(10,3,13,6),'gray3')
        rect(d,(9,11,14,15),'cream')
    elif style=='icecream':
        poly(d,[(8,13),(16,13),(12,22)],'fried'); ellipse(d,(7,7,17,16),color); ellipse(d,(9,4,14,11),'cream')
    elif style=='dessertcup':
        cup(d,col=color,straw=False); ellipse(d,(8,4,16,10),'cream')
    elif style=='egg':
        plate(d); ellipse(d,(5,7,18,18),'cream'); ellipse(d,(9,10,15,16),color)
    elif style=='wrap':
        poly(d,[(4,8),(19,8),(17,21),(6,21)],'cream'); rect(d,(6,9,17,13),color)
    elif style=='tofu':
        plate(d)
        for i in range(4): rect(d,(4+i*5,9,8+i*5,15),color,'cream')
    if garnish in ('chili','pepper'): chili(d,13,8)
    elif garnish in ('scallion','coriander','leaf'):
        for i in range(4): rect(d,(5+i*4,8+i%2*2,7+i*4,10+i%2*2),'cold')
    elif garnish in ('sesame','salt','sugar','spice'): px(d,[(7+i*3,9+i%2*3) for i in range(5)],'white' if garnish!='spice' else 'staple')
    elif garnish=='peanut':
        for i in range(3): ellipse(d,(5+i*5,8,8+i*5,11),'staple')
    elif garnish=='bamboo':
        for i in range(3): rect(d,(7+i*4,6,9+i*4,13),'staple')
    elif garnish=='skewer': skewer(d,14,5,2,'grilled',True)
    elif garnish in ('egg','orange','lemon','melon','fruit','butter'):
        ellipse(d,(14,6,19,11),'gold' if garnish in ('egg','butter') else ('cold' if garnish=='melon' else 'orange'))
    elif garnish=='steam': steam(d,6,8)
    elif garnish in ('heart','syrup'): pixel_heart(d,16,8,'danger')
    elif garnish=='spark': sparkle(d,17,7)
    elif garnish in ('ice','drop'): poly(d,[(15,5),(20,10),(16,13),(12,9)],'drink','cream')
    elif garnish in ('foam','pearl','garlic','carrot','meat'):
        for i in range(3): ellipse(d,(6+i*4,7+i%2,9+i*4,10+i%2),'cream' if garnish in ('foam','garlic') else 'orange')
    return im

for i,(name,style,col,garnish) in enumerate(dishes):
    save(dish_icon(style,P.get(col,col),garnish),f'art/food/food_{name}.png')

# 126 ingredient icons, 16px, no outlines or shadows.
ingredients={
'staple':['rice','noodles','vermicelli','instant_noodles','udon','flour','glutinous_rice','bun_skin','corn','potato','sweet_potato','rice_cake'],
'veg':['scallion','cilantro','cabbage','lettuce','spinach','cucumber','tomato','eggplant','mushroom','wood_ear','seaweed','bamboo_shoot','radish','carrot','lotus_root'],
'meat':['pork','beef','lamb','chicken','chicken_wing','chicken_feet','pork_belly','minced_pork','sausage','bacon','egg','quail_egg'],
'seafood':['fish','squid','shrimp','oyster','clam','crab','scallop','fish_ball','cuttlefish'],
'tofu':['tofu','fried_tofu','tofu_skin','dried_tofu','stinky_tofu','tofu_pudding','gluten','bean_curd_stick'],
'seasoning':['chili','chili_oil','pepper','peppercorn','soy_sauce','vinegar','salt','sugar','sesame_oil','sesame','garlic_sauce','bean_paste','curry','five_spice','stock','oyster_sauce'],
'fruit':['lemon','orange','watermelon','mango','strawberry','peach','grape','pineapple','coconut','passion_fruit','apple','pear'],
'prepared':['fish_tofu','meatball','crab_stick','ham','tempura','fried_dough','noodle_cake','soup_base','ice','jelly','taro_ball','red_bean'],
'base':['water','milk','soymilk','tea_black','tea_green','tea_oolong','coffee','coconut_milk','soda_water','broth'],
'dessert':['cream','chocolate','honey','syrup','pearl','sago','tremella','osmanthus','matcha','vanilla','mango_puree','waffle_mix'],
'packaged':['cola','lemon_soda','beer','mineral_water','energy_drink','yogurt','orange_soda','sparkling_water']}
colors={'staple':'staple','veg':'cold','meat':'ember','seafood':'drink','tofu':'cream','seasoning':'spicy','fruit':'orange','prepared':'fried','base':'madedrink','dessert':'dessert','packaged':'drink'}
manifest=[]
for cat,names in ingredients.items():
    for idx,name in enumerate(names):
        im=img(16,16); d=D(im); c=colors[cat]
        typ=idx%7
        if cat=='packaged':
            rect(d,(5,3,10,13),c); rect(d,(6,1,9,3),'gray3'); rect(d,(6,7,9,10),'cream')
        elif cat=='base':
            poly(d,[(4,4),(12,4),(11,14),(5,14)],c); rect(d,(3,3,13,5),'cream'); line(d,[(10,1),(9,7)],'cream')
        elif cat in ('meat','seafood'):
            if typ%2: poly(d,[(2,8),(7,3),(13,6),(11,11),(5,13)],c); rect(d,(9,4,11,5),'cream')
            else: ellipse(d,(3,4,12,12),c); rect(d,(10,9,14,11),'staple'); px(d,[(6,6),(9,7)],'cream')
        elif cat in ('fruit','veg'):
            if typ%3==0:
                ellipse(d,(3,4,12,13),c); rect(d,(7,2,8,4),'cold'); rect(d,(9,3,12,4),'madedrink'); px(d,[(5,6),(6,6)],'cream')
            elif typ%3==1: poly(d,[(2,12),(4,4),(9,2),(14,6),(11,13)],c); line(d,[(4,13),(11,4)],'madedrink')
            else:
                for x,y in [(3,6),(7,3),(10,8),(5,11)]: ellipse(d,(x,y,x+4,y+4),c)
        elif cat=='seasoning':
            if typ%2: chili(d,6,5,c)
            else: rect(d,(4,5,11,13),c); rect(d,(5,2,10,5),'gray2'); rect(d,(5,8,10,10),'cream')
        elif cat in ('staple','prepared'):
            if typ%3==0: bowl(d,1,5,13,7,c,c)
            elif typ%3==1:
                for i in range(3): line(d,[(3+i*3,3),(4+i*3,13)],c,2)
            else: poly(d,[(2,5),(12,3),(14,11),(5,14)],c); px(d,[(5,6),(9,8),(7,10)],'cream')
        elif cat=='dessert':
            if typ%2: poly(d,[(4,7),(12,7),(8,14)],'fried'); ellipse(d,(4,3,12,10),c)
            else:
                for x,y in [(3,4),(9,3),(6,9),(10,10)]: rect(d,(x,y,x+3,y+3),c)
        else:
            for x,y in [(2,5),(8,3),(5,10),(10,9)]: rect(d,(x,y,x+4,y+3),c)
        # One/two distinct pixels make same-category icons distinguishable.
        px(d,[(2+idx%11,14-idx%3)],'cream' if cat!='tofu' else 'gold')
        save(im,f'art/ing/{name}.png'); manifest.append({'id':name,'category':cat})
(ROOT/'art/ing/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

# Utensils: idle, 2 work frames, countertop view.
utensils=['pot','fryer','grill','griddle','steamer','soup_pot','braise_pot','ice_maker','juicer','soymilk','blender','rice_cooker','fridge']
for name in utensils:
    for state in ('idle','work_01','work_02','counter'):
        im=img(48,48); d=D(im)
        if name in ('pot','fryer','griddle','braise_pot'):
            if name=='fryer': rect(d,(6,15,41,39),'steel','gray3'); rect(d,(9,18,38,28),'gold')
            elif name=='griddle': poly(d,[(5,20),(41,20),(38,34),(8,34)],'ink','steel'); rect(d,(7,35,40,39),'edge')
            else: ellipse(d,(5,15,42,35),'steel'); rect(d,(5,22,42,31),'ink'); ellipse(d,(7,16,40,26),'braised' if name=='braise_pot' else 'dark')
            line(d,[(4,21),(0,21)],'steel',3); line(d,[(43,21),(47,21)],'steel',3)
        elif name=='grill':
            rect(d,(3,18,44,35),'gray1','steel'); rect(d,(7,21,40,28),'ink')
            for x in range(9,40,5): rect(d,(x,23,x+3,26),'ember')
            line(d,[(8,36),(5,45)],'steel',2); line(d,[(39,36),(43,45)],'steel',2)
        elif name=='steamer':
            for y in (13,22,31): ellipse(d,(8,y,39,y+8),'staple'); rect(d,(8,y+3,39,y+7),'grilled'); ellipse(d,(8,y+1,39,y+7),'staple')
        elif name=='soup_pot':
            ellipse(d,(9,9,38,17),'gray3'); rect(d,(9,13,38,40),'steel'); ellipse(d,(9,35,38,42),'gray1'); line(d,[(14,15),(14,34)],'gray3'); line(d,[(7,19),(3,19)],'steel',2); line(d,[(40,19),(44,19)],'steel',2)
        elif name in ('ice_maker','soymilk','rice_cooker','fridge'):
            rect(d,(8,6,39,42),'cream','gray3')
            if name=='fridge': rect(d,(11,10,36,38),'dark','cool'); rect(d,(14,13,19,28),'drink'); rect(d,(23,15,29,31),'madedrink'); rect(d,(33,12,35,23),'gray3')
            elif name=='ice_maker': rect(d,(12,12,35,26),'dark'); rect(d,(15,29,32,37),'cool');
            elif name=='rice_cooker': ellipse(d,(8,3,39,17),'gray3'); rect(d,(15,26,32,34),'panel'); rect(d,(27,28,30,30),'orange')
            else: rect(d,(12,11,35,22),'dark'); rect(d,(14,27,33,38),'staple'); rect(d,(28,24,31,26),'orange')
        else:
            rect(d,(12,33,36,42),'gray2'); rect(d,(9,38,39,44),'steel')
            poly(d,[(14,7),(34,7),(31,34),(17,34)],'dark','gray3'); rect(d,(17,19,31,31),'orange' if name=='juicer' else 'madedrink')
            rect(d,(12,4,36,9),'steel'); line(d,[(23,11),(27,28)],'cream')
        if state.startswith('work'):
            phase=0 if state.endswith('01') else 1
            if name in ('fryer','soup_pot'):
                for i in range(7): ellipse(d,(11+i*4,18+(i+phase)%3*3,13+i*4,20+(i+phase)%3*3),'cream')
            if name in ('pot','steamer','soup_pot','braise_pot','rice_cooker','soymilk'): steam(d,13,12-phase*2,'white',phase)
            if name in ('grill','griddle','pot'):
                flame(d,20,37-phase,1); sparkle(d,35,12+phase*3,'orange',2)
            if name in ('ice_maker','fridge'):
                for i in range(3): poly(d,[(5+i*13,28-phase*3),(8+i*13,31-phase*3),(5+i*13,34-phase*3)],'drink')
            if name in ('juicer','blender'):
                line(d,[(18,23),(28,18),(29,25),(20,28)],'cream',2)
        save(im,f'art/utensil/utensil_{name}_{state}.png')
print(len(dishes),'dishes,',len(manifest),'ingredients, utensils generated')
