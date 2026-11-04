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

# art_hd 的 ico/trait_<trait_id>.png，仅 fastest 在美术里叫 speed
TRAIT_ICON_ALIAS = {"fastest": "trait_speed"}
traits = []
for r in sheet_rows(wb, "Trait"):
    tid = r["trait_id"]
    traits.append({
        "id": tid, "name": r["词条名"], "tag": str(r["绑定标签"]).split("(")[0],
        "needMenu": int(r["激活上架款数"]), "t0": float(r["阶梯起点 T0"]),
        "r": float(r["阶梯公比 r"]), "scope": r["作用对象"],
        "desc": r["效果摘要"], "icon": TRAIT_ICON_ALIAS.get(tid, "trait_" + tid),
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

# art_hd 提供的 8 张共鸣图标，按顺序分配给 R01~R08
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
# 图集由 tools/pack_atlas_hd.py 生成，这里只读取用于校验贴图是否存在
atlas = {}
_atlas_path = os.path.join(ROOT, "src", "data", "atlas.json")
if os.path.exists(_atlas_path):
    atlas = json.load(open(_atlas_path, encoding="utf-8"))["frames"]
else:
    print("!! 还没有图集，先跑 tools/pack_atlas_hd.py")

# ---------------------------------------------------------------- 餐品 → 精灵
TAG_FALLBACK = {"fast": "food_instant_noodle", "staple": "food_plain_congee",
                "spicy": "food_malatang", "fried": "food_fries",
                "madedish": "food_fried_rice", "madedrink": "food_lemon_tea",
                "drink": "food_cola", "cold": "food_cucumber",
                "grilled": "food_grilled_corn", "soup": "food_seaweed_soup",
                "dessert": "food_pudding", "braised": "food_brine_egg"}

foods, missing = [], []
for r in sheet_rows(wb, "Food"):
    fid = r["food_id"]
    taglist = [t for t in (r["标签1"], r["标签2"], r["标签3"]) if t]
    sprite = "food_" + fid[2:]                      # f_beef_noodle -> food_beef_noodle
    if ("food/" + sprite + ".png") not in atlas:
        sprite = TAG_FALLBACK.get(taglist[0], "food_cola")
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
CAT_FALLBACK = {"starch": "rice", "veg": "veg_mixed", "meat": "pork", "sea": "fish",
                "bean": "tofu", "season": "condiment", "fruit": "lemon", "semi": "meat_stick",
                "drinkbase": "soy_milk_base", "sweet": "sugar", "packaged": "cola"}

ingredients, ing_missing = [], []
for r in sheet_rows(wb, "Ingredient"):
    iid = r["ingredient_id"]
    spr = iid
    if ("ing/ing_" + spr + ".png") not in atlas:
        spr = CAT_FALLBACK.get(r["类别"], "rice")
        ing_missing.append(iid)
    ingredients.append({
        "id": iid, "name": r["名称"], "cat": r["类别"], "catName": r["类别名"],
        "baseStage": r["采购到手阶段"], "price": float(r["基准价(元/单份)"] or 1),
        "space": float(r["占格(每10份)"] or 0.2), "channel": r["采购渠道"] or "",
        "sprite": "ing/ing_" + spr + ".png",
    })

utensils = []
for r in sheet_rows(wb, "Utensil"):
    uid = r["utensil_id"]
    utensils.append({"id": uid, "name": r["名称"], "space": int(r["占台面格"]),
                     "slots": int(r["工位数"] or 1), "cost": int(r["解锁价"] or 0),
                     "tags": str(r["服务标签"]).split(","), "special": r["特殊"] or "",
                     "sprite": "utensil/utensil_" + uid + ".png"})

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


print("\ncounts: tags=%d traits=%d reso=%d foods=%d ing=%d utensils=%d"
      % (len(tags), len(traits), len(resonances), len(foods), len(ingredients), len(utensils)))
if missing:
    print("dish fallback used:", len(missing), missing[:10])
if ing_missing:
    print("ing fallback used:", len(ing_missing), ing_missing[:10])
print("balance keys:", len(balance))
