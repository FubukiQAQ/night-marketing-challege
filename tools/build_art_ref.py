# -*- coding: utf-8 -*-
"""生成美术参考图：调色板色卡 + 640x360 风格示意图（轮廓稿 / 上色稿）"""
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
os.makedirs(OUT, exist_ok=True)

C = {
    "ink950": (10, 14, 20), "ink900": (14, 20, 32), "ink800": (22, 31, 46),
    "ink700": (34, 48, 74), "ink600": (51, 69, 95), "cool": (74, 107, 138),
    "lamp1": (255, 227, 176), "lamp2": (255, 193, 99), "lamp3": (255, 154, 60),
    "ember": (226, 84, 43), "cream": (247, 238, 221), "steel": (138, 153, 168),
    "clothR": (122, 46, 58), "clothB": (46, 74, 122), "skin": (217, 166, 122),
    "gray1": (90, 100, 114), "gray2": (140, 151, 166), "gray3": (195, 203, 214),
    "gold": (255, 201, 60), "danger": (255, 92, 122),
}
TAGS = [
    ("速食", (242, 179, 61)), ("主食", (232, 217, 168)), ("魔鬼辣", (224, 67, 43)),
    ("炸货", (201, 139, 63)), ("现做食品", (255, 122, 69)), ("现做饮品", (95, 211, 166)),
    ("饮品", (89, 168, 232)), ("凉菜", (123, 201, 111)), ("烤物", (140, 90, 60)),
    ("汤羹", (239, 227, 200)), ("甜点", (232, 160, 191)), ("卤味", (139, 95, 158)),
]

try:
    F = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 12)
    FB = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 15)
    FS = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 11)
except Exception:
    F = FB = FS = ImageFont.load_default()

W, H = 640, 360
SIL_FG = (18, 18, 18)
SIL_BG = (242, 242, 242)


def palette_card():
    im = Image.new("RGB", (672, 300), C["ink900"])
    d = ImageDraw.Draw(im)
    d.text((12, 10), "不烧心夜市 · 全局调色板（≤20 色）", font=FB, fill=C["cream"])
    x, y = 12, 38
    for name, col in C.items():
        d.rectangle([x, y, x + 40, y + 40], fill=col, outline=C["ink600"])
        d.text((x, y + 44), name, font=FS, fill=C["gray3"])
        d.text((x, y + 57), "#%02X%02X%02X" % col, font=FS, fill=C["gray1"])
        x += 54
        if x > 620:
            x, y = 12, y + 76
    d.text((12, y + 82), "12 个标签色 —— 必须与形状成对使用（色弱 / 夜间低对比双保险）",
           font=FB, fill=C["cream"])
    x, y2 = 12, y + 108
    for name, col in TAGS:
        d.rectangle([x, y2, x + 26, y2 + 26], fill=col, outline=C["ink600"])
        d.text((x, y2 + 30), name, font=F, fill=C["gray3"])
        x += 54
    im.save(os.path.join(OUT, "美术-调色板.png"))


class Scene:
    def __init__(self, sil=False):
        self.sil = sil
        self.im = Image.new("RGB", (W, H), SIL_BG if sil else C["ink900"])
        self.d = ImageDraw.Draw(self.im)

    def col(self, c):
        return SIL_FG if self.sil else C[c] if isinstance(c, str) else c

    # ---------- 远景
    def far(self):
        d = self.d
        if not self.sil:
            d.rectangle([0, 0, W, 150], fill=C["ink900"])
        for (x0, y0, x1, y1) in [(0, 58, 78, 150), (86, 34, 150, 150), (158, 72, 226, 150),
                                 (300, 46, 348, 150), (358, 88, 424, 150),
                                 (446, 52, 512, 150), (528, 78, 620, 150)]:
            d.rectangle([x0, y0, x1, y1], fill=self.col(C["ink950"]))
        if not self.sil:
            for (x0, y0, x1, y1) in [(86, 34, 150, 150), (300, 46, 348, 150),
                                     (446, 52, 512, 150)]:
                for wy in range(y0 + 10, y1 - 8, 18):
                    for wx in range(x0 + 8, x1 - 8, 16):
                        if (wx * 7 + wy * 3) % 5:
                            d.rectangle([wx, wy, wx + 4, wy + 6], fill=C["ink700"])
            d.rectangle([268, 16, 288, 36], fill=C["lamp1"])
            d.rectangle([274, 10, 282, 16], fill=C["lamp1"])

    # ---------- 中景：邻摊
    def mid(self):
        d = self.d
        for bx in (-40, 486):
            d.rectangle([bx, 150, bx + 190, 300], fill=self.col(C["ink800"]))
            d.rectangle([bx, 150, bx + 190, 162], fill=self.col(C["clothR"]))
            if not self.sil:
                for lx in range(bx + 20, bx + 180, 26):
                    d.rectangle([lx, 168, lx + 5, 175], fill=C["ink700"])
        if not self.sil:
            d.rectangle([0, 300, W, 360], fill=C["ink950"])
        if not self.sil:
            d.rectangle([180, 306, 460, 309], fill=C["ink800"])

    # ---------- 地面反光 + 光斑（上色稿专属）
    def glow(self):
        if self.sil:
            return
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        for (cx, cy, r, c, a0) in [(230, 212, 46, C["lamp3"], 26),
                                   (310, 214, 30, C["ember"], 22),
                                   (322, 130, 76, C["lamp2"], 10)]:
            for rr in range(r, 0, -8):
                gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                           fill=c + (max(2, int(a0 * (1 - rr / r))),))
        self.im = Image.alpha_composite(self.im.convert("RGBA"), g).convert("RGB")
        self.d = ImageDraw.Draw(self.im)

    # ---------- 摊车
    def booth(self, bulbs_on=0):
        d = self.d
        # 背板
        d.rectangle([170, 170, 470, 252], fill=self.col(C["ink800"]))
        # 招牌
        d.rectangle([252, 178, 388, 210], fill=self.col(C["clothR"]))
        if not self.sil:
            d.rectangle([255, 181, 385, 207], fill=C["clothR"])
            d.text((276, 186), "不 烧 心", font=F, fill=C["lamp1"])
        # 雨棚（条纹只画在棚内）
        d.rectangle([140, 98, 500, 128], fill=self.col(C["clothB"]))
        if not self.sil:
            for i, sx in enumerate(range(144, 498, 16)):
                cc = C["clothR"] if i % 3 == 0 else (C["cream"] if i % 3 == 1 else C["clothB"])
                d.rectangle([sx, 100, sx + 10, 126], fill=cc)
        d.rectangle([140, 128, 500, 131], fill=self.col(C["ink700"]))
        # 灯串
        d.line([(148, 136), (494, 136)], fill=self.col(C["ink600"]))
        for i in range(12):
            x = 150 + i * 28
            on = i < bulbs_on
            c = C["lamp2"] if (on and not self.sil) else (C["ink700"] if not self.sil else SIL_FG)
            d.rectangle([x, 136, x + 7, 144], fill=c)
            if not self.sil and not on:
                d.rectangle([x, 136, x + 7, 144], fill=C["ink700"])
        # 车体
        d.rectangle([170, 252, 470, 330], fill=self.col(C["ink700"]))
        d.rectangle([170, 252, 470, 258], fill=self.col(C["ink600"]))
        if not self.sil:
            d.rectangle([182, 268, 458, 272], fill=C["ink800"])
        # 台面 3 格
        for i in range(3):
            x = 196 + i * 48
            d.rectangle([x, 226, x + 44, 250], fill=self.col(C["ink700"]))
            d.rectangle([x, 226, x + 44, 228], fill=self.col(C["gray2"]))
        # 锅
        d.ellipse([204, 200, 254, 228], fill=self.col(C["ink950"]))
        if not self.sil:
            d.ellipse([208, 204, 250, 226], fill=C["steel"])
            d.ellipse([214, 208, 244, 222], fill=C["ink900"])
            for i, sx in enumerate((218, 227, 236)):
                d.rectangle([sx, 190 - (i % 2) * 5, sx + 2, 202], fill=C["gray2"])
        # 炸锅
        d.rectangle([282, 204, 336, 230], fill=self.col(C["ink950"]))
        if not self.sil:
            d.rectangle([285, 207, 333, 227], fill=C["lamp3"])
            for i in range(5):
                d.rectangle([290 + i * 9, 212 + (i % 2) * 5, 293 + i * 9,
                             215 + (i % 2) * 5], fill=C["lamp1"])
        # 制冰机
        d.rectangle([378, 196, 428, 230], fill=self.col(C["ink950"]))
        if not self.sil:
            d.rectangle([380, 198, 426, 228], fill=C["steel"])
            d.rectangle([385, 203, 421, 216], fill=C["cool"])

    # ---------- 顾客
    def customers(self):
        d = self.d
        people = [(64, TAGS[0][1], 0), (516, TAGS[6][1], 1), (554, TAGS[2][1], 2)]
        for (x, tagc, k) in people:
            body = self.col(C["ink700"])
            d.rectangle([x, 272, x + 20, 322], fill=body)
            d.rectangle([x + 4, 254, x + 16, 272], fill=body)
            if not self.sil:
                d.rectangle([x, 272, x + 1, 322], fill=C["cool"])
                d.rectangle([x + 4, 254, x + 5, 272], fill=C["cool"])
                d.rectangle([x + 6, 259, x + 8, 261], fill=C["gray3"])
                d.rectangle([x + 12, 259, x + 14, 261], fill=C["gray3"])
            bx, by = x - 1, 230
            d.rectangle([bx, by, bx + 22, by + 18], fill=self.col(C["cream"]))
            d.polygon([(bx + 8, by + 18), (bx + 15, by + 18), (bx + 11, by + 23)],
                      fill=self.col(C["cream"]))
            if not self.sil:
                d.rectangle([bx + 7, by + 5, bx + 16, by + 13], fill=tagc)

    def float_text(self):
        if self.sil:
            return
        d = self.d
        d.text((346, 196), "+12", font=FB, fill=C["gold"])
        d.text((266, 152), "+1", font=F, fill=C["lamp2"])
        d.text((352, 248), "加购!", font=F, fill=TAGS[6][1])

    def build(self, bulbs_on=0):
        self.far()
        self.mid()
        self.glow()
        self.booth(bulbs_on)
        self.customers()
        self.float_text()
        return self.im


def style_sheet():
    top = Scene(sil=True).build()
    bot = Scene(sil=False).build(bulbs_on=9)
    pad, head = 12, 34
    sheet = Image.new("RGB", (W * 2 + pad * 3, H + head + 30), C["ink950"])
    d = ImageDraw.Draw(sheet)
    d.text((pad, 9), "① 轮廓稿：纯剪影下能否读出摊位 / 顾客 / 灯串", font=FB, fill=C["cream"])
    d.text((W + pad * 2, 9), "② 上色稿：全黑街道，只有灯在说话（灯串=层数）",
           font=FB, fill=C["cream"])
    sheet.paste(top, (pad, head))
    sheet.paste(bot, (W + pad * 2, head))
    d.text((pad, H + head + 8),
           "640x360 · 整数放大 · 最近邻缩放 · 色值见 美术-调色板.png · 图中元素为几何占位，非最终画稿",
           font=F, fill=C["gray1"])
    sheet.save(os.path.join(OUT, "美术-风格示意.png"))


palette_card()
style_sheet()

# 上色稿 2 倍整数放大（模拟 720p 下实际观感）
big = Scene(sil=False).build(bulbs_on=9).resize((W * 2, H * 2), Image.NEAREST)
big.save(os.path.join(OUT, "美术-风格示意-上色稿2x.png"))
print("done")
