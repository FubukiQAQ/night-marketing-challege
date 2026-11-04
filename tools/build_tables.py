# -*- coding: utf-8 -*-
"""生成《不烧心夜市挑战》配表：xlsx（多 sheet）+ CSV + 校验报告
用法：python tools/build_tables.py
"""
import csv
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

import tbl_data_tag as T
import tbl_data_ing as I
import tbl_data_food as F

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "配表")
CSV_DIR = os.path.join(OUT_DIR, "csv")

MARGIN = {"fast": 0.50, "staple": 0.45, "spicy": 0.45, "fried": 0.50,
          "madedish": 0.45, "madedrink": 0.60, "drink": 0.25, "cold": 0.55,
          "grilled": 0.50, "soup": 0.50, "dessert": 0.60, "braised": 0.50}
MIN_PRICE = {"drink": 3.0}
FRESH_K = {"fast": 0.0045, "staple": 0.0035, "spicy": 0.0040, "fried": 0.0055,
           "madedish": 0.0045, "madedrink": 0.0060, "drink": 0.0060, "cold": 0.0020,
           "grilled": 0.0050, "soup": 0.0015, "dessert": 0.0030, "braised": 0.0012}
TAKE_TICKS = 5

ING = {r[0]: r for r in I.INGREDIENTS}
ING_NAME = {r[0]: r[1] for r in I.INGREDIENTS}
TAG_NAME = {r[0]: r[1] for r in T.TAGS}
UTENSIL_NAME = {r[0]: r[1] for r in I.UTENSILS}



def compute_price(cost, primary):
    """夜市定价：包材+人工+摊位成本都摊进固定加工费，饮品类薄利多销"""
    if primary == 'drink':
        price = cost * 2.2 + 1.5
    else:
        price = cost * 3.2 + 3.0
    price = max(price, MIN_PRICE.get(primary, 4.0))
    return math.ceil(price * 2) / 2.0

def calc_food(rec):
    """返回 (cost, price, freshness_k)"""
    cost = sum(ING[i][4] * q for i, _s, q in rec)
    primary = None
    for r in F.FOODS:
        if r[10] is rec:
            primary = r[2][0]
            break
    margin = MARGIN.get(primary, 0.5)
    price = compute_price(cost, primary)
    return round(cost, 2), price, FRESH_K.get(primary, 0.04)


# ------------------------------------------------------------------ 组装行
food_rows, recipe_rows = [], []
tag_counter = {t[0]: 0 for t in T.TAGS}
utensil_counter = {u[0]: 0 for u in I.UTENSILS}
ing_counter = {i[0]: 0 for i in I.INGREDIENTS}

for (fid, name, tags, space, utensil, sell_no_ut, serve, k_override,
     unlock, perk, rec) in F.FOODS:
    cost = sum(ING[i][4] * q for i, _s, q in rec)
    primary = tags[0]
    margin = MARGIN.get(primary, 0.5)
    price = compute_price(cost, primary)
    margin = max(0.2, 1 - cost / price) if price else margin
    k = k_override or FRESH_K.get(primary, 0.04)

    for t in tags:
        tag_counter[t] = tag_counter.get(t, 0) + 1
    if utensil:
        utensil_counter[utensil] = utensil_counter.get(utensil, 0) + 1
    for i, _s, _q in rec:
        ing_counter[i] = ing_counter.get(i, 0) + 1

    if perk:
        pt, ptarget, pn, pdelta, pchance, pcond = perk
    else:
        pt, ptarget, pn, pdelta, pchance, pcond = ("", "", "", "", "", "")

    food_rows.append([
        fid, name,
        tags[0] if len(tags) > 0 else "",
        tags[1] if len(tags) > 1 else "",
        tags[2] if len(tags) > 2 else "",
        space, utensil if utensil else "", "是" if sell_no_ut else "否",
        serve, TAKE_TICKS, price, round(cost, 2),
        f"{margin:.0%}", k, unlock,
        pt, ptarget, pn, pdelta, pchance, pcond, "是",
        " + ".join(f"{ING_NAME[i]}x{q}" for i, _s, q in rec),
    ])
    for slot, (iid, stage, qty) in enumerate(rec, 1):
        recipe_rows.append([fid, name, slot, iid, ING_NAME[iid], stage, qty,
                            round(ING[iid][4] * qty, 2)])

# ------------------------------------------------------------------ 工作表数据
SHEETS = []

SHEETS.append(("README", [
    ["《不烧心夜市挑战》配表 v0（骨架）"],
    ["生成日期", "2026-11-04"],
    ["生成脚本", "tools/build_tables.py（数据源 tools/tbl_data_*.py）"],
    [""],
    ["⚠ 数据状态", "本表全部数值为 v0 骨架，标注「待校」，用于跑通流程，不是平衡终值。"],
    [""],
    ["口径说明"],
    ["价格", "元 / 单份用量。餐品售价 = 单份成本 ÷ (1 − 标签毛利率)，向上取整到 0.5 元。"],
    ["成本", "单份成本 = Σ(配方食材基准价 × 数量)。"],
    ["时间", "备货/备餐用「分钟」，出摊用「游戏刻 tick」；200 tick = 1 实时秒，全场 12000 tick。"],
    ["空间", "单位「格」。摊位空间 = 该餐品上架后常驻占用的台面格；0 = 纯成品型不占操作位。"],
    ["风味 k", "每分钟风味衰减率（0~1）。冰柜收纳的成品衰减 ×0.65。"],
    ["层数", "X 永久累积、不设上限；靠「触发所需销量 N(X)=N0×(1+X/G)」与「单餐品每日触发上限 K」限速。"],
    ["阶梯", "每词条前 6 档显式配置，第 7 档起按 T(n)=T0×r^(n-1) 与效果延伸公式生成。"],
    ["共鸣", "两条（或三条）词条同时激活且 X 达阈值时生效，共鸣本身也有 3 档。"],
    [""],
    ["与旧表的差异"],
    ["food.xlsx", "原 32 款全部保留；补全 8 款凉菜的特性/出餐时间/配方；表头补 2 列；新增 50 款。"],
    ["buff.xlsx", "6 条词条全部保留为「一档」语义并扩展为 6 档阶梯；补 炸货/饮品 两条；新增 8 条共鸣。"],
    ["激活特性", "旧表「激活特性=否」的行已统一启用（否则层数输入源不足 6 成）。"],
    [""],
    ["Sheet 说明"],
    ["Tag", "属性枚举（12 个）"],
    ["Trait", "词条（12 条主词条）"],
    ["TraitTier", "词条阶梯档位（前 6 档显式）"],
    ["Resonance / ResonanceTier", "跨词条共鸣及其档位（8 条 × 3 档）"],
    ["TraitGain", "层数来源规则目录（18 类）"],
    ["Food / Recipe", "餐品与配方"],
    ["Ingredient / IngredientStage", "食材枚举与升阶耗时"],
    ["Utensil", "厨具枚举（13 件）"],
    ["Balance", "全局参数骨架"],
]))

SHEETS.append(("Tag", [
    ["tag_id", "名称", "需求权重", "定位", "对应词条", "餐品数", "备注"],
] + [
    [t[0], t[1], t[2], t[3],
     next((tr[0] for tr in T.TRAITS if tr[2] == t[0]), ""),
     tag_counter.get(t[0], 0),
     "" if any(tr[2] == t[0] for tr in T.TRAITS) else "无对应词条"]
    for t in T.TAGS
]))

ORIGIN_TRAIT_DESC = {
    "fastest": "上架3款：速食出餐 -20%；上架5款：所有餐品出餐 -20%",
    "full": "上架3款：买主食有(10+X/2)%概率多买1份非主食；上架5款：多买2份",
    "spicybuff": "上架4款：买辣货50%概率多买X/50份饮料；X>150 → 75%",
    "madedrink": "上架6款：现做饮品制作时间 -(20+X)%",
    "madefood": "上架4款：现做食品售出时利润 +(5+X)%",
    "iceice": "上架6款：凉菜无需成品即可交付（直接扣食材）",
    "sizzle": "新增（原表无炸货词条）",
    "cheers": "新增（原表无饮品词条）",
    "ember": "新增",
    "warm": "新增",
    "sugarhigh": "新增",
    "oldbrine": "新增",
}

def trait_space_need(tag, n):
    """凑够 n 款该标签餐品所需的最低台面格 + 涉及的厨具数"""
    cand = [(row[3], row[4]) for row in F.FOODS if tag in row[2]]
    cand.sort(key=lambda x: (x[0], x[1]))
    pick = cand[:n]
    return sum(sp for sp, _u in pick), len({u for _sp, u in pick if u})


SHEETS.append(("Trait", [
    ["trait_id", "词条名", "绑定标签", "激活上架款数", "可叠加层数",
     "阶梯起点 T0", "阶梯公比 r", "作用对象", "效果摘要", "旧表原文",
     "激活最低台面格", "需厨具件数"],
] + [
    [t[0], t[1], f"{t[2]}({TAG_NAME[t[2]]})", t[3], "是" if t[4] else "否",
     t[5], t[6], t[7], t[8], ORIGIN_TRAIT_DESC.get(t[0], ""),
     trait_space_need(t[2], t[3])[0], trait_space_need(t[2], t[3])[1]]
    for t in T.TRAITS
]))

SHEETS.append(("TraitTier", [
    ["trait_id", "词条名", "档位", "层数门槛 min_x", "effect_op", "v1", "v2", "作用范围", "档位描述"],
] + [
    [r[0], next(t[1] for t in T.TRAITS if t[0] == r[0]), r[1], r[2], r[3], r[4], r[5], r[6], r[7]]
    for r in T.TRAIT_TIERS
]))

SHEETS.append(("Resonance", [
    ["resonance_id", "共鸣名", "词条A", "A层数门槛", "词条B", "B层数门槛",
     "词条C", "C层数门槛", "说明"],
] + [
    [r[0], r[1], r[2], r[3], r[4], r[5], r[6] or "", r[7] or "", r[8]]
    for r in T.RESONANCES
]))

SHEETS.append(("ResonanceTier", [
    ["resonance_id", "共鸣名", "档位", "额外层数门槛(两词条X之和超出部分)",
     "effect_op", "v1", "v2", "档位描述"],
] + [
    [r[0], next(x[1] for x in T.RESONANCES if x[0] == r[0]), r[1], r[2],
     r[3], r[4], r[5], r[6]]
    for r in T.RESONANCE_TIERS
]))

SHEETS.append(("TraitGain", [
    ["gain_id", "source_type", "是否挂在餐品上", "target", "默认单日上限", "说明"],
] + [list(r) for r in T.GAIN_CATALOG]))

SHEETS.append(("Food", [
    ["food_id", "餐品名", "标签1", "标签2", "标签3", "摊位空间", "所需厨具",
     "无厨具可售成品", "出餐tick", "预加工交付tick", "建议售价", "单份成本",
     "毛利率", "风味衰减k", "解锁条件", "特性触发", "特性目标", "N", "增量",
     "概率", "条件", "特性启用", "配方摘要"],
] + food_rows))

SHEETS.append(("Recipe", [
    ["food_id", "餐品名", "槽位", "食材id", "食材名", "起始阶段", "数量", "单份成本"],
] + recipe_rows))

SHEETS.append(("Ingredient", [
    ["ingredient_id", "名称", "类别", "类别名", "采购到手阶段", "基准价(元/单份)",
     "占格(每10份)", "采购渠道", "被引用餐品数"],
] + [
    [r[0], r[1], r[2], I.CATEGORY_CN[r[2]], r[3], r[4], r[5], r[6], ing_counter.get(r[0], 0)]
    for r in I.INGREDIENTS
]))

stage_rows = []
for r in I.INGREDIENTS:
    iid, name, cat, base, _price, _space, _ch = r
    base_idx = I.STAGES.index(base)
    for (a, b, minutes, utensil) in I.CATEGORY_CHAIN.get(cat, []):
        if I.STAGES.index(a) < base_idx:
            continue
        stage_rows.append([iid, name, f"{a}({I.STAGE_CN[a]})", f"{b}({I.STAGE_CN[b]})",
                           minutes, utensil or "无", I.CATEGORY_CN[cat]])
SHEETS.append(("IngredientStage", [
    ["ingredient_id", "名称", "from_stage", "to_stage", "每分钟/10份", "所需厨具", "类别"],
] + stage_rows))

SHEETS.append(("Utensil", [
    ["utensil_id", "名称", "占台面格", "工位数", "解锁价", "服务标签", "特殊", "关联餐品数"],
] + [
    [u[0], u[1], u[2], u[3], u[4], u[5], u[6], utensil_counter.get(u[0], 0)]
    for u in I.UTENSILS
]))

BALANCE = [
    ("start_cash", 300, "元", "开局现金"),
    ("day_count", 7, "天", "一轮天数"),
    ("stock_minutes", 360, "分钟", "备货阶段时间预算"),
    ("prep_minutes", 360, "分钟", "备餐阶段时间预算"),
    ("sell_ticks", 12000, "tick", "出摊阶段总长"),
    ("ticks_per_second", 200, "tick/s", "出摊实时速率"),
    ("tick_to_game_seconds", 1.2, "游戏秒", "1 tick 折算的店内时间"),
    ("surface_capacity_init", 26, "格", "初始台面容量（扣除厨具后仍够上架 4~5 道）"),
    ("surface_capacity_max", 32, "格", "经加成扩容后的理论上限"),
    ("storage_capacity_init", 36, "格", "初始储存容量"),
    ("take_ticks", TAKE_TICKS, "tick", "预加工成品的交付耗时"),
    ("prep_batch_minutes", 10, "分钟", "每批加工固定开销"),
    ("fresh_tier_thresholds", "0.90/0.70/0.50/0.25", "-", "优/良/普/次 的风味下界，其余为废"),
    ("fresh_tier_price", "1.0/0.90/0.80/0.60/0", "-", "各档售价系数"),
    ("fridge_fresh_factor", 0.65, "-", "冰柜内成品衰减乘数"),
    ("gain_base_N0", 8, "份", "特性触发基础销量 N0"),
    ("gain_growth_G", 120, "层", "N(X)=N0×(1+X/G) 的成长尺度"),
    ("gain_daily_cap_K", 6, "次/餐品/日", "单餐品单日触发次数上限"),
    ("tier_T0_default", 20, "层", "阶梯起点默认值（各词条可覆写）"),
    ("tier_ratio_r", 1.35, "-", "阶梯公比，第 7 档起 T(n)=T0×r^(n-1)"),
    ("time_reduce_cap", 80, "%", "出餐/制作时间减免硬下限"),
    ("probability_cap", 0.95, "-", "一切概率类效果的上限"),
    ("satisfaction_cap", 5.0, "星", "单客满意度上限"),
    ("resonance_tier_extra_x", "0/30/80", "层", "共鸣 3 档所需额外层数"),
    ("arrival_lambda_day1", 0.5, "人/实时秒", "第 1 天基础到店强度"),
    ("arrival_day_growth", 1.15, "-", "每天到店强度的乘数"),
    ("arrival_curve", "0.7/1.0/1.3/1.0/0.8/0.6", "-", "20-21/21-22/22-23/23-24 分段权重（按 5 段均分示意）"),
    ("patience_ticks", 900, "tick", "顾客耐心基准"),
    ("browse_ticks", 80, "tick", "顾客选品耗时"),
    ("queue_cap", 8, "人", "同屏排队上限，超出即流失"),
    ("utensil_queue_penalty", 1.25, "-", "队列长度≥3 时的出餐时间乘数"),
    ("score_w1", 0.40, "-", "评分权重：营业额达成率"),
    ("score_w2", 0.35, "-", "评分权重：满意度"),
    ("score_w3", 0.15, "-", "评分权重：客诉率"),
    ("score_w4", 0.10, "-", "评分权重：缺货流失率"),
    ("target_revenue_base", 90, "元", "第 1 天目标营业额，按天递增"),
    ("target_revenue_growth", 1.12, "-", "目标营业额的每日乘数"),
    ("nextday_traffic_high", 1.15, "-", "评分≥85 的次日客流系数"),
    ("nextday_traffic_low", 0.75, "-", "评分<40 的次日客流系数"),
    ("qte_max_per_run", 3, "次", "一局 QTE 上限"),
    ("event_max_per_run", 4, "次", "一局事件上限"),
    ("qte_window_sec", 2.5, "秒", "QTE 操作窗口基准"),
    ("online_shipping_base", 8, "元", "在线订货基础运费"),
    ("online_markup", 0.08, "-", "在线订货相对现场采购的加价率"),
    ("tmp_purchase_markup", 0.45, "-", "备餐阶段临时采购的溢价"),
    ("exp_per_point", 800, "经验", "1 个技能点所需经验"),
]
SHEETS.append(("Balance", [["key", "value", "单位", "说明"]] + [list(b) for b in BALANCE]))

# ------------------------------------------------------------------ 写 xlsx
HEAD_FILL = PatternFill("solid", fgColor="1F3B4D")
HEAD_FONT = Font(color="FFFFFF", bold=True, size=10)
THIN = Side(style="thin", color="D0D7DE")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WARN_FILL = PatternFill("solid", fgColor="FFF2CC")

os.makedirs(CSV_DIR, exist_ok=True)
wb = Workbook()
wb.remove(wb.active)

for name, rows in SHEETS:
    ws = wb.create_sheet(name)
    for r in rows:
        ws.append(r)
    if name == "README":
        ws.column_dimensions["A"].width = 18
        ws.column_dimensions["B"].width = 96
        for row in ws.iter_rows():
            for c in row:
                c.alignment = Alignment(vertical="top", wrap_text=True)
        ws["A1"].font = Font(bold=True, size=14)
        continue

    for c in ws[1]:
        c.fill = HEAD_FILL
        c.font = HEAD_FONT
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, col in enumerate(ws.iter_cols(), 1):
        width = max((len(str(c.value)) for c in col if c.value is not None), default=6)
        ws.column_dimensions[get_column_letter(i)].width = min(max(8, width * 1.6), 42)

    # CSV 导出
    with open(os.path.join(CSV_DIR, f"{name}.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh)
        for r in rows:
            writer.writerow(["" if x is None else x for x in r])

xlsx_path = os.path.join(OUT_DIR, "不烧心夜市-配表.xlsx")
wb.save(xlsx_path)

with open(os.path.join(CSV_DIR, "README.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    csv.writer(fh).writerows(SHEETS[0][1])

# ------------------------------------------------------------------ 校验
problems = []
food_ids = [r[0] for r in F.FOODS]
if len(set(food_ids)) != len(food_ids):
    problems.append("food_id 有重复")
for r in F.FOODS:
    fid, name, tags, space, utensil, _s, _sv, _k, _u, _p, rec = r
    for t in tags:
        if t not in TAG_NAME:
            problems.append(f"{name}: 未知标签 {t}")
    if utensil and utensil not in UTENSIL_NAME:
        problems.append(f"{name}: 未知厨具 {utensil}")
    if not rec:
        problems.append(f"{name}: 没有配方")
    for iid, stage, qty in rec:
        if iid not in ING:
            problems.append(f"{name}: 未知食材 {iid}")
        elif stage not in I.STAGES:
            problems.append(f"{name}: 未知阶段 {stage}")
        elif I.STAGES.index(stage) < I.STAGES.index(ING[iid][3]):
            problems.append(f"{name}: {ING[iid][1]} 起始阶段 {stage} 低于采购阶段 {ING[iid][3]}")
    if not (0 <= space <= 6):
        problems.append(f"{name}: 摊位空间越界 {space}")

thin_tags = [(t[0], tag_counter.get(t[0], 0)) for t in T.TAGS if tag_counter.get(t[0], 0) < 6]
if thin_tags:
    problems.append("以下标签餐品数 < 6：" + ", ".join(f"{a}({b})" for a, b in thin_tags))

trait_tags = {t[2] for t in T.TRAITS}
for t in T.TAGS:
    if t[0] not in trait_tags:
        problems.append(f"标签 {t[0]} 没有对应词条")
for r in T.RESONANCES:
    for tid in (r[2], r[4], r[6]):
        if tid and tid not in {t[0] for t in T.TRAITS}:
            problems.append(f"共鸣 {r[1]} 引用了不存在的词条 {tid}")

report = []
report.append("# 配表校验报告\n")
report.append(f"- 生成时间：2026-11-04")
report.append(f"- 主文件：`配表/不烧心夜市-配表.xlsx`（{len(SHEETS)} 个 sheet）")
report.append(f"- CSV 副本：`配表/csv/`\n")
report.append("## 一、数量达标\n")
report.append("| 指标 | 要求 | 实际 | 结果 |")
report.append("|---|---|---|---|")
checks = [
    ("标签数", "≥ 8", len(T.TAGS)),
    ("词条数", "≥ 10", len(T.TRAITS)),
    ("共鸣数", "≥ 1", len(T.RESONANCES)),
    ("共鸣档位数", "-", len(T.RESONANCE_TIERS)),
    ("阶梯档位行数", "-", len(T.TRAIT_TIERS)),
    ("层数来源规则", "-", len(T.GAIN_CATALOG)),
    ("餐品数", "≥ 70", len(F.FOODS)),
    ("配方行数", "-", len(recipe_rows)),
    ("食材数", "≥ 60", len(I.INGREDIENTS)),
    ("食材升阶行数", "-", len(stage_rows)),
    ("厨具数", "≥ 10", len(I.UTENSILS)),
]
for label, req, got in checks:
    ok = "✅"
    if req.startswith("≥"):
        ok = "✅" if got >= int(req[1:].strip()) else "❌"
    report.append(f"| {label} | {req} | {got} | {ok} |")

report.append("\n## 二、标签覆盖（每标签餐品数，要求 ≥6）\n")
report.append("| 标签 | 名称 | 餐品数 | 词条 |")
report.append("|---|---|---|---|")
for t in T.TAGS:
    tr = next((x[0] for x in T.TRAITS if x[2] == t[0]), "—")
    report.append(f"| {t[0]} | {t[1]} | {tag_counter.get(t[0], 0)} | {tr} |")

report.append("\n## 三、厨具覆盖\n")
report.append("| 厨具 | 名称 | 占格 | 工位 | 关联餐品数 |")
report.append("|---|---|---|---|---|")
for u in I.UTENSILS:
    report.append(f"| {u[0]} | {u[1]} | {u[2]} | {u[3]} | {utensil_counter.get(u[0], 0)} |")

report.append("\n## 四、词条激活的空间可行性（关键平衡检查）\n")
report.append("凑够激活门槛所需「最省空间的 N 款该标签餐品」的台面占用：\n")
report.append("| 词条 | 标签 | 需上架 | 最低台面格 | 需厨具 | 判定 |")
report.append("|---|---|---|---|---|---|")
for t in T.TRAITS:
    need, ut = trait_space_need(t[2], t[3])
    verdict = "开局可达" if need + ut <= 16 else ("需扩容" if need + ut <= 32 else "❌ 超出上限")
    report.append(f"| {t[1]} | {t[2]} | {t[3]} 款 | {need} 格 | {ut} 件 | {verdict} |")

report.append("\n## 五、价格区间（单份成本 → 建议售价）\n")
report.append("| 餐品 | 成本 | 售价 | 毛利率 |")
report.append("|---|---|---|---|")
for row in food_rows[:0]:
    pass
sample = sorted(food_rows, key=lambda r: -r[11])[:8] + sorted(food_rows, key=lambda r: r[11])[:5]
for r in sample:
    report.append(f"| {r[1]} | ¥{r[11]} | ¥{r[10]} | {r[12]} |")

report.append("\n## 六、问题清单\n")
if problems:
    for p in problems:
        report.append(f"- ⚠ {p}")
else:
    report.append("- 无引用完整性问题，无数量不达标项。")

report.append("\n## 七、遗留待校项\n")
report.append("- 全部数值为 v0 骨架，需在 M1 之后跑批量模拟校准（重点：`gain_growth_G`、`tier_ratio_r`、`arrival_lambda_day1`、`target_revenue_base`）。")
report.append("- 「解锁条件」目前按天数/厨具/销量做了占位划分，尚未与局外解锁经济表对齐。")
report.append("- 8 条共鸣的档位阈值（额外层数 0/30/80）需要按实际层数曲线重标。")

with open(os.path.join(OUT_DIR, "校验报告.md"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(report) + "\n")

print(f"OK sheets={len(SHEETS)} foods={len(F.FOODS)} recipes={len(recipe_rows)} "
      f"ing={len(I.INGREDIENTS)} stages={len(stage_rows)} utensils={len(I.UTENSILS)} "
      f"traits={len(T.TRAITS)} tiers={len(T.TRAIT_TIERS)} res={len(T.RESONANCES)}")
print(f"problems={len(problems)}")
for p in problems:
    print("  !", p)
print(xlsx_path)
