# -*- coding: utf-8 -*-
"""标签 / 词条 / 阶梯 / 共鸣 / 层数来源 数据 v0 骨架（待校）"""

# ---------------------------------------------------------------- 标签 Tag
# tag_id, 名称, 需求权重, 一句话定位
TAGS = [
    ("fast",      "速食",     1.00, "方便面、粉面、关东煮等出餐快的热食"),
    ("staple",    "主食",     0.90, "能吃饱的饭面类，客单价核心"),
    ("spicy",     "魔鬼辣",   0.85, "重口味辣货，年轻人偏好"),
    ("fried",     "炸货",     1.10, "油炸食品，夜市第一香气源"),
    ("madedish",  "现做食品", 1.00, "摊位现场烹饪的非油炸热食"),
    ("madedrink", "现做饮品", 0.90, "现榨现调的饮品"),
    ("drink",     "饮品",     1.20, "开罐即走的包装饮料，吞吐保底"),
    ("cold",      "凉菜",     0.70, "无需加热的冷盘"),
    ("grilled",   "烤物",     1.00, "碳火/铁板类，烟火气来源"),
    ("soup",      "汤羹",     0.65, "汤、粥、羹，暖胃且耐放"),
    ("dessert",   "甜点",     0.80, "甜品糖水，女性与夜间客偏好"),
    ("braised",   "卤味",     0.70, "卤煮酱货，耐存放、可提前备"),
]

# ---------------------------------------------------------------- 词条 Trait
# trait_id, 名称, tag_id, 激活上架款数, 可叠加层数(bool), T0, r, effect_target, 效果摘要
TRAITS = [
    ("fastest",   "速度为王",     "fast",      3, True, 20, 1.35, "own_tag",   "按档位降低出餐时间，4 档起惠及全摊"),
    ("full",      "吃饱了",       "staple",    3, True, 15, 1.35, "own_tag",   "购买主食时按概率多卖非主食餐品"),
    ("spicybuff", "好辣！",       "spicy",     4, True, 25, 1.35, "own_tag",   "购买辣货时按概率加购饮料"),
    ("madedrink", "现做饮品",     "madedrink", 6, True, 20, 1.35, "own_tag",   "缩短现做饮品制作时间"),
    ("madefood",  "现做的不烧心", "madedish",  4, True, 20, 1.35, "own_tag",   "现做食品售出时提高利润"),
    ("iceice",    "冰冰冰",       "cold",      6, True,  1, 1.60, "own_tag",   "凉菜免成品交付，后续档位提份数与售价"),
    ("sizzle",    "滋滋响",       "fried",     4, True, 15, 1.35, "own_tag",   "炸货成交时概率追加出餐"),
    ("cheers",    "干杯",         "drink",     5, True, 10, 1.40, "own_tag",   "包装饮料直售提高利润与单客瓶数"),
    ("ember",     "炭火气",       "grilled",   4, True, 15, 1.35, "own_tag",   "连击上限与满意度提升"),
    ("warm",      "热乎",         "soup",      3, True, 10, 1.35, "own_tag",   "汤羹风味衰减减免，延长顾客耐心"),
    ("sugarhigh", "甜上头",       "dessert",   3, True, 10, 1.35, "own_tag",   "抬高满意度、放宽 QTE 窗口"),
    ("oldbrine",  "老卤",         "braised",   3, True, 15, 1.35, "own_tag",   "卤味份数上限与跨夜保留豁免"),
]

# ---------------------------------------------------------------- 阶梯档位
# 前 6 档显式，第 7 档起按 T(n)=T0*r^(n-1) 与 v 的延伸公式生成（见 Balance）
# trait_id, tier, min_x, effect_op, v1, v2, scope, 描述
_TIERS = {
    "fastest": [
        (1, 20, "time_reduce_pct", 20, 0, "own_tag",     "速食出餐时间 -20%"),
        (2, 27, "time_reduce_pct", 25, 0, "own_tag",     "速食出餐时间 -25%"),
        (3, 36, "time_reduce_pct", 30, 0, "own_tag",     "速食出餐时间 -30%"),
        (4, 49, "time_reduce_pct", 35, 0, "all_half",    "出餐 -35%，且全摊餐品再 -17%"),
        (5, 66, "time_reduce_pct", 40, 0, "all_half",    "出餐 -40%，且全摊餐品再 -20%"),
        (6, 89, "time_reduce_pct", 45, 0, "all_half",    "出餐 -45%，且全摊餐品再 -22%"),
    ],
    "full": [
        (1, 15, "extra_buy", 20, 1, "own_tag", "买主食时 20% 概率多卖 1 份非主食"),
        (2, 20, "extra_buy", 30, 1, "own_tag", "买主食时 30% 概率多卖 1 份非主食"),
        (3, 27, "extra_buy", 40, 2, "own_tag", "买主食时 40% 概率多卖 2 份非主食"),
        (4, 36, "extra_buy", 50, 2, "own_tag", "买主食时 50% 概率多卖 2 份非主食"),
        (5, 49, "extra_buy", 60, 3, "own_tag", "买主食时 60% 概率多卖 3 份非主食"),
        (6, 66, "extra_buy", 70, 3, "own_tag", "买主食时 70% 概率多卖 3 份非主食"),
    ],
    "spicybuff": [
        (1, 25, "extra_buy_drink", 50, 1, "own_tag", "买辣货 50% 概率多买 1 份饮料"),
        (2, 34, "extra_buy_drink", 50, 2, "own_tag", "买辣货 50% 概率多买 2 份饮料"),
        (3, 45, "extra_buy_drink", 55, 3, "own_tag", "买辣货 55% 概率多买 3 份饮料"),
        (4, 61, "extra_buy_drink", 60, 4, "own_tag", "买辣货 60% 概率多买 4 份饮料"),
        (5, 82, "extra_buy_drink", 65, 5, "own_tag", "买辣货 65% 概率多买 5 份饮料"),
        (6, 111, "extra_buy_drink", 75, 6, "own_tag", "买辣货 75% 概率多买 6 份饮料"),
    ],
    "madedrink": [
        (1, 20, "time_reduce_pct", 20, 0, "own_tag", "现做饮品制作时间 -20%"),
        (2, 27, "time_reduce_pct", 26, 0, "own_tag", "现做饮品制作时间 -26%"),
        (3, 36, "time_reduce_pct", 32, 0, "own_tag", "现做饮品制作时间 -32%"),
        (4, 49, "time_reduce_pct", 38, 0, "own_tag", "现做饮品制作时间 -38%"),
        (5, 66, "time_reduce_pct", 44, 0, "own_tag", "现做饮品制作时间 -44%"),
        (6, 89, "time_reduce_pct", 50, 0, "own_tag", "现做饮品制作时间 -50%"),
    ],
    "madefood": [
        (1, 20, "profit_up_pct", 10, 0, "own_tag", "现做食品利润 +10%"),
        (2, 27, "profit_up_pct", 16, 0, "own_tag", "现做食品利润 +16%"),
        (3, 36, "profit_up_pct", 22, 0, "own_tag", "现做食品利润 +22%"),
        (4, 49, "profit_up_pct", 28, 0, "own_tag", "现做食品利润 +28%"),
        (5, 66, "profit_up_pct", 34, 0, "own_tag", "现做食品利润 +34%"),
        (6, 89, "profit_up_pct", 40, 0, "own_tag", "现做食品利润 +40%"),
    ],
    "iceice": [
        (1, 1,  "bypass_finished", 1, 0, "own_tag", "凉菜无需成品即可交付（直接扣食材）"),
        (2, 2,  "qty_cap_up",      1, 0, "own_tag", "凉菜单日可售份数上限 +1"),
        (3, 3,  "price_up_pct",    5, 0, "own_tag", "凉菜售价 +5%"),
        (4, 5,  "qty_cap_up",      2, 0, "own_tag", "凉菜份数上限 +2（累计 +3）"),
        (5, 8,  "price_up_pct",   10, 0, "own_tag", "凉菜售价 +10%"),
        (6, 13, "qty_cap_up",      3, 0, "own_tag", "凉菜份数上限 +3（累计 +6）"),
    ],
    "sizzle": [
        (1, 15, "extra_fry", 10, 1, "own_tag", "炸货成交 10% 概率追加 1 份出餐"),
        (2, 20, "extra_fry", 15, 1, "own_tag", "炸货成交 15% 概率追加 1 份出餐"),
        (3, 27, "extra_fry", 20, 1, "own_tag", "炸货成交 20% 概率追加 1 份出餐"),
        (4, 36, "extra_fry", 25, 2, "own_tag", "炸货成交 25% 概率追加 2 份出餐"),
        (5, 49, "extra_fry", 30, 2, "own_tag", "炸货成交 30% 概率追加 2 份出餐"),
        (6, 66, "extra_fry", 35, 3, "own_tag", "炸货成交 35% 概率追加 3 份出餐"),
    ],
    "cheers": [
        (1, 10, "profit_up_pct", 8,  1, "own_tag", "饮料利润 +8%，单客可带 1 瓶"),
        (2, 14, "profit_up_pct", 12, 1, "own_tag", "饮料利润 +12%，单客可带 1 瓶"),
        (3, 20, "profit_up_pct", 16, 2, "own_tag", "饮料利润 +16%，单客可带 2 瓶"),
        (4, 28, "profit_up_pct", 20, 2, "own_tag", "饮料利润 +20%，单客可带 2 瓶"),
        (5, 39, "profit_up_pct", 24, 3, "own_tag", "饮料利润 +24%，单客可带 3 瓶"),
        (6, 55, "profit_up_pct", 28, 3, "own_tag", "饮料利润 +28%，单客可带 3 瓶"),
    ],
    "ember": [
        (1, 15, "streak_cap_up", 3,  2, "own_tag", "连击上限 3，满意度 +2%"),
        (2, 20, "streak_cap_up", 4,  4, "own_tag", "连击上限 4，满意度 +4%"),
        (3, 27, "streak_cap_up", 5,  6, "own_tag", "连击上限 5，满意度 +6%"),
        (4, 36, "streak_cap_up", 6,  8, "own_tag", "连击上限 6，满意度 +8%"),
        (5, 49, "streak_cap_up", 7, 10, "own_tag", "连击上限 7，满意度 +10%"),
        (6, 66, "streak_cap_up", 8, 12, "own_tag", "连击上限 8，满意度 +12%"),
    ],
    "warm": [
        (1, 10, "freshness_slow_pct", 15, 30,  "own_tag", "汤羹风味衰减 -15%，顾客耐心 +30 tick"),
        (2, 14, "freshness_slow_pct", 22, 60,  "own_tag", "汤羹风味衰减 -22%，顾客耐心 +60 tick"),
        (3, 20, "freshness_slow_pct", 29, 90,  "own_tag", "汤羹风味衰减 -29%，顾客耐心 +90 tick"),
        (4, 28, "freshness_slow_pct", 36, 120, "own_tag", "汤羹风味衰减 -36%，顾客耐心 +120 tick"),
        (5, 39, "freshness_slow_pct", 43, 150, "own_tag", "汤羹风味衰减 -43%，顾客耐心 +150 tick"),
        (6, 55, "freshness_slow_pct", 50, 180, "own_tag", "汤羹风味衰减 -50%，顾客耐心 +180 tick"),
    ],
    "sugarhigh": [
        (1, 10, "satisfaction_up", 0.2,  5, "own_tag", "甜点顾客满意度 +0.2 星，QTE 窗口 +5%"),
        (2, 14, "satisfaction_up", 0.3,  8, "own_tag", "甜点顾客满意度 +0.3 星，QTE 窗口 +8%"),
        (3, 20, "satisfaction_up", 0.4, 11, "own_tag", "甜点顾客满意度 +0.4 星，QTE 窗口 +11%"),
        (4, 28, "satisfaction_up", 0.5, 14, "own_tag", "甜点顾客满意度 +0.5 星，QTE 窗口 +14%"),
        (5, 39, "satisfaction_up", 0.6, 17, "own_tag", "甜点顾客满意度 +0.6 星，QTE 窗口 +17%"),
        (6, 55, "satisfaction_up", 0.7, 20, "own_tag", "甜点顾客满意度 +0.7 星，QTE 窗口 +20%"),
    ],
    "oldbrine": [
        (1, 15, "qty_cap_up", 1, 0, "own_tag", "卤味单日可售份数上限 +1"),
        (2, 20, "qty_cap_up", 2, 1, "own_tag", "卤味份数上限 +2，跨夜保留 1 份免风味惩罚"),
        (3, 27, "qty_cap_up", 3, 1, "own_tag", "卤味份数上限 +3，跨夜保留 1 份免风味惩罚"),
        (4, 36, "qty_cap_up", 4, 2, "own_tag", "卤味份数上限 +4，跨夜保留 2 份免风味惩罚"),
        (5, 49, "qty_cap_up", 5, 2, "own_tag", "卤味份数上限 +5，跨夜保留 2 份免风味惩罚"),
        (6, 66, "qty_cap_up", 6, 3, "own_tag", "卤味份数上限 +6，跨夜保留 3 份免风味惩罚"),
    ],
}

TRAIT_TIERS = []
for _tid, _rows in _TIERS.items():
    for _r in _rows:
        TRAIT_TIERS.append((_tid,) + _r)

# ---------------------------------------------------------------- 共鸣 Resonance
# resonance_id, 名称, trait_a, min_x_a, trait_b, min_x_b, trait_c, min_x_c, 说明
RESONANCES = [
    ("R01", "解辣搭档", "spicybuff", 25, "madedrink", 20, None,  0, "辣货 + 现做饮品：辣单一律带动饮品"),
    ("R02", "下酒组合", "sizzle",    15, "cheers",    10, None,  0, "炸货 + 包装饮料：单客瓶数提升"),
    ("R03", "一餐够了", "full",      15, "warm",      10, None,  0, "主食 + 汤羹：客单价提升"),
    ("R04", "夜市标配", "fastest",   20, "ember",     15, None,  0, "速食 + 烤物：出餐与客流双修"),
    ("R05", "冷盘双拼", "iceice",     8, "oldbrine",  15, None,  0, "凉菜 + 卤味：冷盘份数与评价提升"),
    ("R06", "甜辣风暴", "sugarhigh", 10, "spicybuff", 25, None,  0, "甜点 + 辣货：甜点触发解辣连锁加购"),
    ("R07", "铁板双煞", "ember",     15, "sizzle",    15, None,  0, "烤物 + 炸货：连击累加提速"),
    ("R08", "全摊大满贯", "fastest", 50, "sizzle",    50, "cheers", 50, "速食+炸货+饮料同时达标：全摊利润"),
]

# resonance_id, tier, min_extra_x(额外层数总和), effect_op, v1, v2, 描述
RESONANCE_TIERS = [
    ("R01", 1, 0,   "extra_buy_drink", 100, 1, "辣单 100% 带动 1 份现做饮品"),
    ("R01", 2, 30,  "extra_buy_drink", 100, 2, "辣单 100% 带动 2 份现做饮品"),
    ("R01", 3, 80,  "extra_buy_drink", 100, 3, "辣单 100% 带动 3 份现做饮品"),
    ("R02", 1, 0,   "bottle_cap_up",    1, 0, "单客可带瓶数 +1"),
    ("R02", 2, 30,  "bottle_cap_up",    2, 0, "单客可带瓶数 +2"),
    ("R02", 3, 80,  "bottle_cap_up",    3, 0, "单客可带瓶数 +3"),
    ("R03", 1, 0,   "ticket_up_pct",    5,  0, "客单价 +5%"),
    ("R03", 2, 30,  "ticket_up_pct",    8,  0, "客单价 +8%"),
    ("R03", 3, 80,  "ticket_up_pct",   12,  0, "客单价 +12%"),
    ("R04", 1, 0,   "time_reduce_pct",  5,  2, "出餐 -5%，客流 +2%"),
    ("R04", 2, 30,  "time_reduce_pct",  8,  4, "出餐 -8%，客流 +4%"),
    ("R04", 3, 80,  "time_reduce_pct", 12,  6, "出餐 -12%，客流 +6%"),
    ("R05", 1, 0,   "qty_cap_up",       1,  0, "冷盘类份数上限 +1"),
    ("R05", 2, 30,  "qty_cap_up",       2,  0, "冷盘类份数上限 +2"),
    ("R05", 3, 80,  "qty_cap_up",       3,  0, "冷盘类份数上限 +3"),
    ("R06", 1, 0,   "extra_buy",       30,  1, "甜点成交 30% 概率跟 1 份解辣饮品"),
    ("R06", 2, 30,  "extra_buy",       45,  1, "甜点成交 45% 概率跟 1 份解辣饮品"),
    ("R06", 3, 80,  "extra_buy",       60,  2, "甜点成交 60% 概率跟 2 份解辣饮品"),
    ("R07", 1, 0,   "streak_gain_up",   1,  0, "连击每层额外 +1"),
    ("R07", 2, 30,  "streak_gain_up",   2,  0, "连击每层额外 +2"),
    ("R07", 3, 80,  "streak_gain_up",   3,  0, "连击每层额外 +3"),
    ("R08", 1, 0,   "profit_up_pct",   10,  0, "全摊利润 +10%"),
    ("R08", 2, 60,  "profit_up_pct",   15,  0, "全摊利润 +15%"),
    ("R08", 3, 150, "profit_up_pct",   20,  0, "全摊利润 +20%"),
]

# ---------------------------------------------------------------- 层数来源目录
# gain_id, source_type, 是否需要挂在餐品上, target, 默认单日上限, 说明
GAIN_CATALOG = [
    ("G01", "per_sold",          "是", "own_tag",          "K(餐品)", "每售出 N0 份，所属已激活词条 +1；N 随 X 增长"),
    ("G02", "per_sold",          "是", "random_active",    "K(餐品)", "每售出 N0 份，随机一条已激活词条 +1"),
    ("G03", "per_sold",          "是", "highest",          "K(餐品)", "每售出 N0 份，层数最高的已激活词条 +1"),
    ("G04", "per_sold",          "是", "lowest",           "K(餐品)", "每售出 N0 份，层数最低的已激活词条 +1"),
    ("G05", "per_sold",          "是", "own_tag_noreq",    "K(餐品)", "每售出 N0 份，所属词条 +1（无需激活）"),
    ("G06", "per_sold_chance",   "是", "own_tag",          "K(餐品)", "每份 P 概率，所属已激活词条 +1"),
    ("G07", "per_sold_chance",   "是", "random_active",    "K(餐品)", "每份 P 概率，随机已激活词条 +1"),
    ("G08", "per_revenue",       "是", "own_tag",          "K(餐品)", "每满 M 元，所属已激活词条 +1"),
    ("G09", "on_phase_enter",    "是", "all_active",       "1/日",   "进入出摊阶段时，所有已激活词条 +n"),
    ("G10", "on_phase_exit",     "是", "all_active",       "1/日",   "结束出摊阶段时，所有已激活词条 +n"),
    ("G11", "on_first_sold",     "是", "highest",          "1/日",   "当日首次售出时触发（可按空间等条件）"),
    ("G12", "on_first_sold",     "是", "own_tag",          "1/日",   "当日首次售出时，所属词条 +n"),
    ("G13", "on_customer_type",  "全局", "random_active",  "3/日",   "特殊顾客成交时给层数"),
    ("G14", "on_qte_result",     "全局", "random_active",  "3/日",   "QTE 成功给层数，失败不给"),
    ("G15", "on_streak",         "全局", "own_tag",        "连击上限", "连续同属性成交达到连击数时给层数"),
    ("G16", "on_fresh_tier",     "全局", "own_tag",        "无上限", "售出「优」档成品时额外 +1"),
    ("G17", "on_event",          "全局", "random_active",  "事件定义", "事件结果给层数（如夜市活动）"),
    ("G18", "on_resonance",      "全局", "specific",       "共鸣定义", "共鸣激活时给指定词条层数"),
]
