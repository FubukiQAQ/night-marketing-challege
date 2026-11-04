# -*- coding: utf-8 -*-
"""把 配表/不烧心夜市-配表.xlsx + assets/ 打包成游戏运行期数据 src/data/*.json"""
import glob
import json
import os
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data")
os.makedirs(OUT, exist_ok=True)


def sheet_rows(wb, name):
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    head = [("" if c is None else str(c).strip()) for c in rows[0]]
    out = []
    for r in rows[1:]:
        if all(c is None for c in r):
            continue
        out.append(dict(zip(head, r)))
    return out


XLSX = glob.glob(os.path.join(ROOT, "配表", "*.xlsx"))[0]
wb = openpyxl.load_workbook(XLSX, data_only=True)

# ---------------------------------------------------------------- 基础表
tags = []
for r in sheet_rows(wb, "Tag"):
    tags.append({"id": r["tag_id"], "name": r["名称"],
                 "weight": float(r["需求权重"] or 1), "desc": r["定位"] or ""})

trait_icon = {"fastest": "trait_speed", "full": "trait_full", "spicybuff": "trait_spicy",
              "madedrink": "trait_madedrink", "madefood": "trait_fresh", "iceice": "trait_ice",
              "sizzle": "trait_sizzle", "cheers": "trait_cheers", "ember": "trait_charcoal",
              "warm": "trait_hot", "sugarhigh": "trait_sweet", "oldbrine": "trait_braise"}
traits = []
for r in sheet_rows(wb, "Trait"):
    tid = r["trait_id"]
    traits.append({
        "id": tid, "name": r["词条名"], "tag": str(r["绑定标签"]).split("(")[0],
        "needMenu": int(r["激活上架款数"]), "t0": float(r["阶梯起点 T0"]),
        "r": float(r["阶梯公比 r"]), "scope": r["作用对象"],
        "desc": r["效果摘要"], "icon": trait_icon.get(tid, "trait_speed"),
    })

tier_map = {}
for r in sheet_rows(wb, "TraitTier"):
    tier_map.setdefault(r["trait_id"], []).append({
        "tier": int(r["档位"]), "minX": float(r["层数门槛 min_x"]), "op": r["effect_op"],
        "v1": float(r["v1"] or 0), "v2": float(r["v2"] or 0),
        "scope": r["作用范围"], "desc": r["档位描述"],
    })
for v in tier_map.values():
    v.sort(key=lambda x: x["tier"])

reso_icons = ["reso_spicy_fast", "reso_fried_spicy", "reso_hot_full", "reso_grill_drink",
              "reso_cold_sweet", "reso_dessert_drink", "reso_fresh_drink", "reso_braise_staple"]
res_tier = {}
for r in sheet_rows(wb, "ResonanceTier"):
    res_tier.setdefault(r["resonance_id"], []).append({
        "tier": int(r["档位"]), "extra": float(r["额外层数门槛(两词条X之和超出部分)"] or 0),
        "op": r["effect_op"], "v1": float(r["v1"] or 0), "v2": float(r["v2"] or 0),
        "desc": r["档位描述"],
    })
resonances = []
for i, r in enumerate(sheet_rows(wb, "Resonance")):
    resonances.append({
        "id": r["resonance_id"], "name": r["共鸣名"],
        "a": r["词条A"], "minA": float(r["A层数门槛"]), "b": r["词条B"], "minB": float(r["B层数门槛"]),
        "c": r["词条C"] or None, "minC": float(r["C层数门槛"] or 0),
        "desc": r["说明"], "icon": reso_icons[i % len(reso_icons)],
        "tiers": sorted(res_tier.get(r["resonance_id"], []), key=lambda x: x["tier"]),
    })

def _isnum(x):
    try:
        float(x)
        return True
    except Exception:
        return False


balance = {}
for r in sheet_rows(wb, "Balance"):
    v = r["value"]
    if isinstance(v, (int, float)):
        balance[r["key"]] = v
    else:
        s = str(v)
        try:
            balance[r["key"]] = float(s)
        except ValueError:
            balance[r["key"]] = [float(x) if _isnum(x) else x for x in s.replace("/", " ").split()] if "/" in s else s


# ---------------------------------------------------------------- 配方
recipe = {}
for r in sheet_rows(wb, "Recipe"):
    recipe.setdefault(r["food_id"], []).append({
        "ing": r["食材id"], "stage": r["起始阶段"], "qty": int(r["数量"]),
    })

# ---------------------------------------------------------------- 素材清单
atlas = {}
for jf in sorted(glob.glob(os.path.join(ROOT, "assets", "art", "atlas", "*.json"))):
    data = json.load(open(jf, encoding="utf-8"))
    png = os.path.basename(jf).replace(".json", ".png")
    for name, f in data["frames"].items():
        fr = f.get("frame", f)
        atlas[name] = {"png": "assets/art/atlas/" + png, "x": fr["x"], "y": fr["y"],
                       "w": fr["w"], "h": fr["h"]}

scene_files = {os.path.basename(p)[:-4]: "assets/art/scene/" + os.path.basename(p)
               for p in glob.glob(os.path.join(ROOT, "assets", "art", "scene", "*.png"))}

# ---------------------------------------------------------------- 餐品 → 精灵
DISH_MAP = {
    "f_sour_spicy_noodle": "food_sour_spicy_noodles", "f_luosifen": "food_luosifen",
    "f_malatang": "food_malatang", "f_turkey_noodle": "food_hotdry_noodles",
    "f_instant_noodle": "food_cold_noodles", "f_oden": "food_soup_dumplings",
    "f_chicken_steak": "food_fried_chicken", "f_fried_leg": "food_fried_chicken",
    "f_whole_chicken": "food_fried_chicken", "f_fries": "food_fries",
    "f_potato_tower": "food_fries", "f_popcorn_chicken": "food_popcorn_chicken",
    "f_squid_ring": "food_tempura", "f_lotus_box": "food_fried_tofu",
    "f_fried_niangao": "food_fried_dough", "f_starch_sausage": "food_tempura",
    "f_pepper_sausage": "food_tempura",
    "f_lemon_water": "food_lemon_tea", "f_lemonade": "food_lemon_tea",
    "f_cola": "food_cola", "f_soda": "food_soda",
    "f_watermelon_juice": "food_watermelon_juice", "f_orange_juice": "food_orange_juice",
    "f_sour_plum": "food_sour_plum_drink", "f_mango_pomelo": "food_fruit_tea",
    "f_mango_sago": "food_mango_sago", "f_soy_milk": "food_soymilk",
    "f_coconut_milk": "food_coconut", "f_bubble_tea": "food_milk_tea",
    "f_lemon_tea": "food_lemon_tea", "f_coconut_latte": "food_coconut",
    "f_strawberry_shake": "food_yogurt", "f_passion_soda": "food_soda",
    "f_iced_tea": "food_soda", "f_water": "food_water",
    "f_oolong": "food_beer", "f_herbal_tea": "food_energy",
    "f_cucumber": "food_cold_cucumber", "f_wood_ear": "food_cold_wood_ear",
    "f_kelp": "food_seaweed_salad", "f_fuzhu": "food_cold_tofu",
    "f_tofu_skin": "food_cold_tofu", "f_vermicelli": "food_cold_noodles",
    "f_lemon_claw": "food_cold_chicken", "f_century_egg": "food_pickled_radish",
    "f_grilled_gluten": "food_skewer_veg", "f_lamb_skewer": "food_skewer_lamb",
    "f_beef_skewer": "food_skewer_lamb", "f_grilled_wing": "food_skewer_chicken",
    "f_grilled_claw": "food_braised_feet", "f_grilled_leek": "food_skewer_veg",
    "f_grilled_corn": "food_grilled_corn", "f_teppan_squid": "food_squid_skewer",
    "f_teppan_tofu": "food_fried_tofu", "f_grilled_oyster": "food_oyster",
    "f_hot_sour_soup": "food_hot_sour_soup", "f_seaweed_soup": "food_seaweed_soup",
    "f_pepper_soup": "food_tomato_egg_soup", "f_congee": "food_pork_congee",
    "f_plain_congee": "food_rice_bowl", "f_tremella": "food_tremella_soup",
    "f_tomato_beef_soup": "food_soup_beef", "f_lotus_starch": "food_tremella_soup",
    "f_grass_jelly": "food_shaved_ice", "f_double_skin": "food_tofu_pudding",
    "f_red_bean_soup": "food_redbean_soup", "f_mung_bean_soup": "food_redbean_soup",
    "f_ice_jelly": "food_shaved_ice", "f_peach_gum": "food_tofu_pudding",
    "f_pudding": "food_egg_tart", "f_plum_tangyuan": "food_sesame_ball",
    "f_brine_claw": "food_braised_feet", "f_brine_duck_neck": "food_braised_wings",
    "f_brine_tofu": "food_braised_tofu", "f_brine_egg": "food_braised_egg",
    "f_brine_lotus": "food_braised_platter", "f_brine_tripe": "food_braised_beef",
    "f_brine_intestine": "food_braised_platter", "f_brine_wing": "food_braised_wings",
    "f_fried_rice": "food_fried_rice", "f_beef_noodle": "food_beef_noodles",
    "f_braised_pork_rice": "food_braised_pork_rice",
}
TAG_FALLBACK = {"fast": "food_rice_bowl", "staple": "food_rice_bowl", "spicy": "food_dan_dan_noodles",
                "fried": "food_fried_chicken", "madedish": "food_fried_rice",
                "madedrink": "food_fruit_tea", "drink": "food_soda", "cold": "food_cold_tofu",
                "grilled": "food_skewer_lamb", "soup": "food_soup_chicken",
                "dessert": "food_tofu_pudding", "braised": "food_braised_platter"}

foods, missing = [], []
for r in sheet_rows(wb, "Food"):
    fid = r["food_id"]
    taglist = [t for t in (r["标签1"], r["标签2"], r["标签3"]) if t]
    sprite = DISH_MAP.get(fid)
    if not sprite or ("food/" + sprite + ".png") not in atlas:
        sprite = TAG_FALLBACK.get(taglist[0], "food_rice_bowl")
        missing.append(fid)
    foods.append({
        "id": fid, "name": r["餐品名"], "tags": taglist,
        "space": int(r["摊位空间"] or 0), "utensil": r["所需厨具"] or "",
        "sellWo": r["无厨具可售成品"] == "是",
        "serveTicks": int(r["出餐tick"] or 0), "takeTicks": int(r["预加工交付tick"] or 5),
        "price": float(r["建议售价"] or 0), "cost": float(r["单份成本"] or 0),
        "k": float(r["风味衰减k"] or 0.03), "unlock": r["解锁条件"] or "",
        "perk": {"trigger": r["特性触发"] or "", "target": r["特性目标"] or "",
                 "n": int(r["N"] or 0), "delta": int(r["增量"] or 0),
                 "chance": float(r["概率"] or 0), "cond": r["条件"] or ""},
        "recipe": recipe.get(fid, []),
        "sprite": "food/" + sprite + ".png",
    })

# ---------------------------------------------------------------- 食材 → 精灵
ING_MAP = {
    "instant_noodle": "instant_noodles", "rice_noodle": "noodles", "he_fen": "noodle_cake",
    "flour_noodle": "noodles", "rice": "rice", "nian_gao": "rice_cake", "mi_xian": "noodles",
    "won_tun_wrapper": "bun_skin", "flour": "flour", "man_tou": "bun_skin",
    "sweet_potato_noodle": "vermicelli", "dough_stick": "fried_dough", "liang_pi": "noodle_cake",
    "toast": "flour", "veg_mixed": "cabbage", "potato": "potato", "lettuce": "lettuce",
    "cucumber": "cucumber", "cabbage": "cabbage", "bean_sprout": "spinach",
    "mushroom_needle": "mushroom", "fungus": "wood_ear", "kelp_shred": "seaweed",
    "lotus_root": "lotus_root", "green_pepper": "pepper", "onion": "scallion",
    "cilantro": "cilantro", "corn": "corn", "leek": "scallion", "gluten": "gluten",
    "chicken": "chicken", "chicken_leg": "chicken", "chicken_claw": "chicken_feet",
    "chicken_wing": "chicken_wing", "pork": "pork", "pork_belly": "pork_belly",
    "minced_pork": "minced_pork", "beef": "beef", "beef_tripe": "beef",
    "duck_neck": "chicken_wing", "duck_intestine": "chicken_feet",
    "spare_rib": "pork_belly", "egg": "egg", "century_egg": "quail_egg",
    "fish": "fish", "fish_ball": "fish_ball", "shrimp": "shrimp", "squid": "squid",
    "clam": "clam", "crab_stick": "crab_stick", "cuttlefish_ball": "fish_ball",
    "shrimp_paste": "shrimp", "fish_tofu": "fish_tofu", "oyster": "oyster",
    "tofu_skin": "tofu_skin", "bamboo_tofu": "bean_curd_stick", "tofu": "tofu",
    "dried_tofu": "dried_tofu", "thousand_sheet": "tofu_skin", "veg_chicken": "tofu",
    "tofu_puff": "fried_tofu", "condiment": "five_spice", "hotpot_mix": "chili_oil",
    "chili_powder": "chili", "cumin": "peppercorn", "mala_base": "chili_oil",
    "soy_sauce": "soy_sauce", "vinegar": "vinegar", "garlic_sauce": "garlic_sauce",
    "sesame_paste": "sesame", "sugar": "sugar", "brine_pack": "five_spice",
    "noodle_soup": "soup_base", "broth": "broth", "rice_wine": "soup_base",
    "lemon": "lemon", "watermelon": "watermelon", "orange": "orange", "mango": "mango",
    "grapefruit": "orange", "grape": "grape", "strawberry": "strawberry",
    "passion_fruit": "passion_fruit", "hawthorn": "red_bean", "plum": "peach",
    "starch_sausage": "sausage", "pepper_sausage": "sausage", "chicken_steak": "chicken",
    "lamb_skewer": "lamb", "beef_skewer": "beef", "wing_skewer": "chicken_wing",
    "meat_ball": "meatball", "bacon": "ham", "luncheon_meat": "ham",
    "odeng_skewer": "fish_ball", "chicken_popcorn": "chicken", "squid_ring": "squid",
    "lotus_sandwich": "lotus_root", "syrup": "syrup", "coconut_milk": "coconut_milk",
    "soy_milk_base": "soymilk", "soy_bean": "pearl", "tea_powder": "tea_black",
    "tea_leaf": "tea_green", "sour_plum_soup": "sour_plum_drink" if False else "soup_base",
    "coffee_liquid": "coffee", "yogurt": "yogurt", "ice": "ice",
    "sago": "sago", "taro_ball": "taro_ball", "coconut_cream": "coconut_milk",
    "condensed_milk": "milk", "pudding_powder": "vanilla", "red_bean": "red_bean",
    "mung_bean": "red_bean", "grass_jelly": "jelly", "guiling_gao": "jelly",
    "tangyuan": "pearl", "peach_gum": "tremella",
    "cola": "cola", "soda": "soda_water", "lemonade_pack": "lemon_soda",
    "iced_tea": "tea_black", "mineral_water": "mineral_water", "oolong_tea": "tea_oolong",
    "herbal_tea": "energy_drink",
}
CAT_FALLBACK = {"starch": "noodles", "veg": "cabbage", "meat": "pork", "sea": "fish",
                "bean": "tofu", "season": "salt", "fruit": "apple", "semi": "meatball",
                "drinkbase": "soup_base", "sweet": "sugar", "packaged": "soda_water"}

ingredients, ing_missing = [], []
for r in sheet_rows(wb, "Ingredient"):
    iid = r["ingredient_id"]
    spr = ING_MAP.get(iid)
    if not spr or ("ing/" + spr + ".png") not in atlas:
        spr = CAT_FALLBACK.get(r["类别"], "salt")
        ing_missing.append(iid)
    ingredients.append({
        "id": iid, "name": r["名称"], "cat": r["类别"], "catName": r["类别名"],
        "baseStage": r["采购到手阶段"], "price": float(r["基准价(元/单份)"] or 1),
        "space": float(r["占格(每10份)"] or 0.2), "channel": r["采购渠道"] or "",
        "sprite": "ing/" + spr + ".png",
    })

utensils = []
for r in sheet_rows(wb, "Utensil"):
    utensils.append({"id": r["utensil_id"], "name": r["名称"], "space": int(r["占台面格"]),
                     "slots": int(r["工位数"] or 1), "cost": int(r["解锁价"] or 0),
                     "tags": str(r["服务标签"]).split(","), "special": r["特殊"] or ""})

stages = []
for r in sheet_rows(wb, "IngredientStage"):
    stages.append({"ing": r["ingredient_id"], "from": str(r["from_stage"]).split("(")[0],
                   "to": str(r["to_stage"]).split("(")[0], "minutes": float(r["每分钟/10份"] or 0),
                   "utensil": r["所需厨具"] if r["所需厨具"] != "无" else ""})
stage_by_ing = {}
for s in stages:
    stage_by_ing.setdefault(s["ing"], []).append(s)


def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print("%-22s %8d bytes" % (name, os.path.getsize(p)))


dump("tags.json", tags)
dump("traits.json", {"traits": traits, "tiers": tier_map,
                     "resonances": resonances})
dump("foods.json", foods)
dump("ingredients.json", {"ingredients": ingredients, "stages": stage_by_ing})
dump("utensils.json", utensils)
dump("balance.json", balance)
dump("atlas.json", {"frames": atlas, "scene": scene_files})

print("\ncounts: tags=%d traits=%d reso=%d foods=%d ing=%d utensils=%d"
      % (len(tags), len(traits), len(resonances), len(foods), len(ingredients), len(utensils)))
if missing:
    print("dish fallback used:", len(missing), missing[:10])
if ing_missing:
    print("ing fallback used:", len(ing_missing), ing_missing[:10])
print("balance keys:", len(balance))
