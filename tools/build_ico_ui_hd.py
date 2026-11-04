"""图标 / UI 素材的确定性生成（不占用 GPU）。

文档 12-美术需求文档-高精度版：
  §2.4 12 标签（色彩 + 外轮廓成对，四态）、§3.5 12 词条 + 8 共鸣、§4 UI 组件与数字字形。

轮廓用逐像素掩膜计算，保证硬边、无抗锯齿、可无损放大；明暗按"左上受光/右下暗部"统一光源。
输出：assets/art_hd/ico/**、assets/art_hd/ui/**
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "art_hd"

# ---------------------------------------------------------------- 调色板（文档 2.3/2.4）

INK = np.array([0x08, 0x0C, 0x12], np.float32)
SHADOW = np.array([0x10, 0x19, 0x27], np.float32)
COOL = np.array([0x42, 0x62, 0x7A], np.float32)
LAMP = np.array([0xFF, 0xF0, 0xC7], np.float32)
MAIN = np.array([0xFF, 0xD0, 0x80], np.float32)
RIM = np.array([0xF2, 0x9A, 0x45], np.float32)
EMBER = np.array([0xD9, 0x57, 0x2B], np.float32)
GOLD = np.array([0xFF, 0xC9, 0x3C], np.float32)
DANGER = np.array([0xFF, 0x5C, 0x7A], np.float32)
CREAM = np.array([0xF7, 0xEE, 0xDD], np.float32)
STEEL = np.array([0x8A, 0x99, 0xA8], np.float32)
PANEL = np.array([0x16, 0x1F, 0x2E], np.float32)
WHITE = np.array([0xFF, 0xFF, 0xFF], np.float32)

TAGS = [
    ("fast", "#F2B33D", "square"), ("staple", "#E8D9A8", "circle"), ("spicy", "#E0432B", "triangle"),
    ("fried", "#C98B3F", "star8"), ("madedish", "#FF7A45", "crescent"), ("madedrink", "#5FD3A6", "drop"),
    ("drink", "#59A8E8", "bottle"), ("cold", "#7BC96F", "diamond"), ("grilled", "#D28A52", "hex"),
    ("soup", "#EFE3C8", "bowl"), ("dessert", "#E8A0BF", "tri_circle"), ("braised", "#A878B8", "blocks"),
]


def hexrgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], np.float32)


# ---------------------------------------------------------------- 掩膜几何


def shape_mask(shape: str, size: int, pad: int = 2) -> np.ndarray:
    n = size
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) + 0.5
    c = n / 2.0
    r = n / 2.0 - pad
    dx, dy = xx - c, yy - c
    if shape == "square":
        return (np.abs(dx) <= r) & (np.abs(dy) <= r)
    if shape == "circle":
        return dx * dx + dy * dy <= r * r
    if shape == "triangle":
        top = (yy >= pad) & (yy <= n - pad)
        half = (yy - pad) / max(1e-3, (n - 2 * pad)) * r
        return top & (np.abs(dx) <= half)
    if shape == "diamond":
        return np.abs(dx) + np.abs(dy) <= r
    if shape == "star8":                       # 方 + 菱形 = 八角星
        a = (np.abs(dx) <= r * 0.74) & (np.abs(dy) <= r * 0.74)
        b = np.abs(dx) + np.abs(dy) <= r * 1.06
        return a | b
    if shape == "hex":                         # 平顶六边形
        return (np.abs(dx) <= r) & (np.abs(dy) * 2.0 + np.abs(dx) * 1.15 <= r * 2.0)
    if shape == "crescent":                    # 圆 - 偏移圆
        big = dx * dx + dy * dy <= r * r
        cut = (dx - r * 0.62) ** 2 + dy * dy <= r * r
        return big & ~cut
    if shape == "drop":                        # 圆 + 上尖
        circ = dx * dx + (dy - r * 0.28) ** 2 <= (r * 0.72) ** 2
        tip = (dy < 0) & (np.abs(dx) <= np.clip((dy + r) / r, 0, 1) ** 1.6 * r * 0.7)
        return circ | tip
    if shape == "bottle":
        body = (np.abs(dx) <= r * 0.72) & (dy >= -r * 0.1) & (dy <= r)
        neck = (np.abs(dx) <= r * 0.34) & (dy >= -r) & (dy < -r * 0.1)
        return body | neck
    if shape == "bowl":                        # 上宽下窄的碗形
        body = (yy >= n * 0.34) & (yy <= n - pad)
        halfw = r * (1.0 - 0.46 * (yy - n * 0.34) / max(1e-3, n - pad - n * 0.34))
        return body & (np.abs(dx) <= halfw)
    if shape == "tri_circle":                  # 三圆组合
        m = np.zeros((n, n), bool)
        for ang in (-90, 30, 150):
            cx = c + math.cos(math.radians(ang)) * r * 0.55
            cy = c + math.sin(math.radians(ang)) * r * 0.55
            m |= (xx - cx) ** 2 + (yy - cy) ** 2 <= (r * 0.44) ** 2
        return m
    if shape == "blocks":                      # 双方块叠形（大块在下、小块在上，留台阶）
        lower = (np.abs(dx) <= r) & (dy >= -r * 0.1) & (dy <= r)
        upper = (np.abs(dx) <= r * 0.55) & (dy >= -r) & (dy < -r * 0.1)
        return lower | upper
    raise ValueError(shape)


def erode(mask: np.ndarray, k: int = 1) -> np.ndarray:
    m = mask.copy()
    for _ in range(k):
        e = m.copy()
        e[1:, :] &= m[:-1, :]
        e[:-1, :] &= m[1:, :]
        e[:, 1:] &= m[:, :-1]
        e[:, :-1] &= m[:, 1:]
        e[0, :] = False
        e[-1, :] = False
        e[:, 0] = False
        e[:, -1] = False
        m = e
    return m


def shade_inside(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """五阶明暗（文档 2.3）：沿左上→右下光轴分 5 档，避免整条横带。"""
    out = rgb.copy()
    n = mask.shape[0]
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    if not mask.any():
        return out
    t = (xx + yy)                       # 光轴投影：左上小、右下大
    tm = t[mask]
    lo, hi = float(tm.min()), float(tm.max())
    norm = (t - lo) / max(1e-6, hi - lo)
    bands = np.clip((norm * 5).astype(np.int32), 0, 4)
    levels = np.array([1.30, 1.10, 0.96, 0.80, 0.62], np.float32)
    factor = levels[bands]
    out = np.where(mask[..., None], np.clip(out * factor[..., None], 0, 255), out)
    # 受光边：左上 1px 亮线；暗部边缘：右下 1px 加深
    top = mask & ~np.roll(mask, 1, axis=0)
    left = mask & ~np.roll(mask, 1, axis=1)
    rim = top | left
    out[rim] = np.minimum(255, out[rim] * 1.16 + 20)
    return out


def paint_shape(rgb: np.ndarray, mask: np.ndarray, ink: bool = True) -> np.ndarray:
    """纯色底 + 明暗 + 1px 深色描边。rgb 可以是单色 (3,) 或整图 (n,n,3)。"""
    n = mask.shape[0]
    base = np.zeros((n, n, 3), np.float32)
    base[:] = rgb
    out = shade_inside(base, mask)
    out[~mask] = 0
    if ink:
        ring = mask & ~erode(mask, 1)
        out[ring] = INK
    return out


# ---------------------------------------------------------------- 标签


def tag_icon(tag_id: str, color: str, shape: str, size: int = 32, state: str = "normal") -> Image.Image:
    base = hexrgb(color)
    mask = shape_mask(shape, size, pad=2)
    rgb = paint_shape(base, mask)
    if shape == "hex":                                  # 横纹六边形
        n = size
        for y in range(3, n - 3, 3):
            row = np.zeros((n, n), bool)
            row[y, :] = True
            sel = mask & row & ~(mask & ~erode(mask, 1))
            rgb[sel] *= 0.86
    if shape == "blocks":
        n = size
        upper = (np.mgrid[0:n, 0:n][0] < n * 0.28) & mask
        rgb[upper] *= 1.18
    layer = tag_glyph(tag_id, size, erode(mask, 2))
    out = np.dstack([rgb, np.where(mask, 255, 0).astype(np.float32)])
    out[..., :3] = np.where(layer[..., 3:4] > 0, layer[..., :3], out[..., :3])
    im = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")

    if state == "grayed":
        lum = im.convert("L")
        im = Image.merge("RGBA", (lum, lum, lum, im.getchannel("A")))
    elif state == "highlight":
        a = np.array(im).astype(np.float32)
        m = a[..., 3] > 0
        a[..., :3][m] = np.minimum(255, a[..., :3][m] * 1.16 + 16)
        im = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
        d = ImageDraw.Draw(im)
        d.rectangle((1, 1, size - 2, size - 2), outline=(255, 255, 255, 150))
    elif state == "fragile":
        d = ImageDraw.Draw(im)
        d.line([(size // 2 - 4, 6), (size // 2 + 1, size // 2), (size // 2 - 3, size // 2 + 3),
                (size // 2 + 2, size - 6)], fill=tuple(int(v) for v in DANGER) + (255,), width=1)
    return im


def tag_glyph(tag_id: str, size: int, clip: np.ndarray) -> np.ndarray:
    """内部图形：每类 ≥3 个识别特征；只在轮廓内部绘制。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size // 2
    w = (255, 255, 255, 240)
    deep = (42, 26, 18, 240)
    if tag_id == "fast":                                     # 碗 + 双蒸汽
        d.arc((c - 8, c - 1, c + 8, c + 11), 0, 180, fill=deep, width=2)
        d.line([(c - 8, c + 3), (c + 8, c + 3)], fill=deep, width=1)
        d.line([(c - 4, c - 4), (c - 5, c - 9)], fill=w, width=1)
        d.line([(c + 2, c - 4), (c + 1, c - 9)], fill=w, width=1)
    elif tag_id == "staple":                                 # 饭团 + 米粒
        d.polygon([(c, c - 8), (c + 8, c + 6), (c - 8, c + 6)], fill=(255, 255, 255, 245), outline=deep)
        for dx, dy in ((-3, 2), (2, 1), (0, 4), (4, 3)):
            d.point((c + dx, c + dy), fill=deep)
    elif tag_id == "spicy":                                  # 弯辣椒
        d.line([(c - 7, c + 7), (c - 2, c + 1), (c + 3, c - 3), (c + 6, c - 8)], fill=deep, width=3)
        d.line([(c + 5, c - 10), (c + 7, c - 8)], fill=(0x7B, 0xC9, 0x6F, 255), width=2)
        d.point((c - 3, c + 3), fill=w)
    elif tag_id == "fried":                                  # 油花
        for dx, dy, r in ((-5, 3, 2), (3, 4, 2), (0, -4, 3), (6, -2, 1), (-6, -1, 1)):
            d.ellipse((c + dx - r, c + dy - r, c + dx + r, c + dy + r), fill=(255, 255, 255, 230))
    elif tag_id == "madedish":                               # 锅铲 + 火舌
        d.line([(c - 6, c + 8), (c + 2, c - 3)], fill=deep, width=2)
        d.rectangle((c + 1, c - 8, c + 6, c - 2), fill=(255, 255, 255, 240), outline=deep)
        d.polygon([(c - 9, c + 9), (c - 5, c + 3), (c - 3, c + 6), (c - 1, c + 2), (c, c + 9)],
                  fill=tuple(int(v) for v in EMBER) + (255,))
    elif tag_id == "madedrink":                              # 雪克杯
        d.polygon([(c - 5, c - 6), (c + 5, c - 6), (c + 4, c + 7), (c - 4, c + 7)],
                  fill=(255, 255, 255, 240), outline=deep)
        d.line([(c - 5, c - 2), (c + 5, c - 2)], fill=deep, width=1)
        d.line([(c - 2, c - 9), (c - 1, c - 6)], fill=deep, width=2)
    elif tag_id == "drink":                                  # 瓶罐
        d.rectangle((c - 3, c - 10, c + 3, c - 6), fill=(255, 255, 255, 240), outline=deep)
        d.rectangle((c - 6, c - 6, c + 6, c + 8), fill=(255, 255, 255, 240), outline=deep)
        d.rectangle((c - 6, c - 1, c + 6, c + 3), fill=deep)
    elif tag_id == "cold":                                   # 叶片 + 冰晶
        d.polygon([(c - 7, c + 5), (c, c - 7), (c + 6, c + 5)], fill=(255, 255, 255, 240), outline=deep)
        d.line([(c - 7, c + 6), (c + 6, c + 6)], fill=deep, width=1)
        d.line([(c + 4, c - 8), (c + 4, c - 1)], fill=(200, 240, 255, 255), width=1)
        d.line([(c + 2, c - 5), (c + 6, c - 5)], fill=(200, 240, 255, 255), width=1)
    elif tag_id == "grilled":                                # 双签烤肉
        d.line([(c - 6, c + 9), (c - 2, c - 9)], fill=(0xE8, 0xD9, 0xA8, 255), width=1)
        d.line([(c + 2, c + 9), (c + 6, c - 9)], fill=(0xE8, 0xD9, 0xA8, 255), width=1)
        for k, (bx, by) in enumerate(((-4, -4), (-4, 1), (4, -4), (4, 1))):
            d.rectangle((c + bx - 2, c + by - 2, c + bx + 2, c + by + 2),
                        fill=(255, 255, 255, 230), outline=deep)
    elif tag_id == "soup":                                   # 汤面 + 三缕蒸汽
        d.arc((c - 8, c - 2, c + 8, c + 10), 0, 180, fill=deep, width=2)
        d.line([(c - 6, c + 2), (c + 6, c + 2)], fill=w, width=1)
        for k in (-4, 0, 4):
            d.line([(c + k, c - 6), (c + k, c - 10)], fill=w, width=1)
    elif tag_id == "dessert":                                # 甜品杯 + 糖粒
        d.polygon([(c - 6, c - 2), (c + 6, c - 2), (c + 4, c + 8), (c - 4, c + 8)],
                  fill=(255, 255, 255, 240), outline=deep)
        d.ellipse((c - 7, c - 8, c + 7, c + 1), fill=(255, 255, 255, 250), outline=deep)
        d.ellipse((c - 2, c - 11, c + 2, c - 7), fill=tuple(int(v) for v in EMBER) + (255,))
    elif tag_id == "braised":                                # 卤锅 + 香料包
        d.rectangle((c - 8, c - 2, c + 8, c + 7), fill=(255, 255, 255, 230), outline=deep)
        d.line([(c - 9, c - 2), (c + 9, c - 2)], fill=deep, width=2)
        d.rectangle((c - 3, c - 9, c + 3, c - 4), fill=(0xE8, 0xD9, 0xA8, 255), outline=deep)
        d.point((c, c + 3), fill=deep)
    arr = np.array(im)
    a = arr[..., 3] > 0
    arr[a & ~clip, 3] = 0
    return arr


# ---------------------------------------------------------------- 词条 / 共鸣

TRAITS = ["speed", "full", "spicybuff", "madedrink", "madefood", "iceice",
          "sizzle", "cheers", "ember", "warm", "sugarhigh", "oldbrine"]
RESO = [
    ("reso_spicy_fast", "spicy", "fast"), ("reso_hot_full", "soup", "staple"),
    ("reso_fried_spicy", "fried", "spicy"), ("reso_grill_drink", "grilled", "drink"),
    ("reso_braise_staple", "braised", "staple"), ("reso_cold_sweet", "cold", "dessert"),
    ("reso_dessert_drink", "dessert", "drink"), ("reso_fresh_drink", "madedrink", "drink"),
]


def trait_icon(trait_id: str, size: int = 32) -> Image.Image:
    """32×32 具象物件，右下留 10×10 空角（文档 3.5）。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size // 2 - 2
    cream = (0xE8, 0xD9, 0xA8, 255)
    ink = tuple(int(v) for v in INK) + (255,)
    hot = tuple(int(v) for v in EMBER) + (255,)
    lamp = tuple(int(v) for v in MAIN) + (255,)
    steel = tuple(int(v) for v in STEEL) + (255,)
    white = (255, 255, 255, 240)
    if trait_id == "speed":
        d.ellipse((c - 8, c - 3, c + 6, c + 7), fill=(0x33, 0x45, 0x5F, 255), outline=ink)
        for k in range(3):
            d.line([(c + 8, c - 2 + k * 3), (size - 3, c - 2 + k * 3)], fill=lamp, width=1)
    elif trait_id == "full":
        d.arc((c - 7, c - 1, c + 7, c + 8), 0, 180, fill=ink, width=2)
        d.ellipse((c - 7, c - 6, c + 7, c + 1), fill=white, outline=ink)
        for dx in (-3, 1, 4):
            d.point((c + dx, c - 4), fill=cream)
    elif trait_id == "spicybuff":
        d.line([(c - 7, c + 5), (c - 2, c), (c + 3, c - 3), (c + 6, c - 7)], fill=hot, width=3)
        d.polygon([(c + 4, c - 9), (c + 9, c - 5), (c + 5, c - 3)], fill=lamp)
    elif trait_id == "madedrink":
        d.polygon([(c - 5, c - 6), (c + 5, c - 6), (c + 4, c + 7), (c - 4, c + 7)], fill=white, outline=ink)
        d.line([(c - 5, c - 2), (c + 5, c - 2)], fill=ink, width=1)
    elif trait_id == "madefood":
        d.line([(c - 6, c + 7), (c + 1, c - 2)], fill=steel, width=2)
        d.polygon([(c - 9, c + 9), (c - 6, c + 3), (c - 3, c + 7), (c - 1, c + 3), (c, c + 9)], fill=hot)
    elif trait_id == "iceice":
        for dx, dy in ((-4, 2), (1, 5), (-1, -1)):
            d.rectangle((c + dx - 3, c + dy - 3, c + dx + 3, c + dy + 3), fill=(0xBF, 0xE8, 0xF5, 235), outline=ink)
        d.line([(c + 6, c - 9), (c + 6, c - 3)], fill=(255, 255, 255, 255), width=1)
        d.line([(c + 3, c - 6), (c + 9, c - 6)], fill=(255, 255, 255, 255), width=1)
    elif trait_id == "sizzle":
        d.arc((c - 7, c - 1, c + 7, c + 8), 0, 180, fill=steel, width=2)
        for dx, dy, r in ((-3, 0, 1), (2, 1, 2), (5, -2, 1), (-1, -4, 1)):
            d.ellipse((c + dx - r, c + dy - r, c + dx + r, c + dy + r), fill=lamp)
    elif trait_id == "cheers":
        d.rectangle((c - 9, c - 4, c - 2, c + 6), fill=white, outline=ink)
        d.rectangle((c + 2, c - 7, c + 9, c + 3), fill=white, outline=ink)
        d.line([(c - 1, c - 2), (c + 2, c - 4)], fill=lamp, width=1)
    elif trait_id == "ember":
        for dx, dy in ((-4, 3), (2, 4), (-1, -1)):
            d.rectangle((c + dx - 3, c + dy - 2, c + dx + 3, c + dy + 2), fill=(0x4A, 0x3A, 0x33, 255), outline=ink)
        d.line([(c + 4, c - 9), (c + 6, c - 5), (c + 3, c - 3)], fill=(0x8A, 0x99, 0xA8, 190), width=1)
    elif trait_id == "warm":
        d.arc((c - 8, c - 2, c + 8, c + 8), 0, 180, fill=white, width=2)
        d.line([(c - 6, c + 2), (c + 6, c + 2)], fill=lamp, width=1)
        for k in (-4, 0, 4):
            d.line([(c + k, c - 5), (c + k, c - 11)], fill=(255, 255, 255, 200), width=1)
    elif trait_id == "sugarhigh":
        d.ellipse((c - 8, c - 3, c + 8, c + 8), fill=(0xE8, 0xA0, 0xBF, 255), outline=ink)
        d.ellipse((c - 5, c - 7, c + 5, c + 2), fill=white, outline=ink)
        for dx, dy in ((-2, -4), (2, -3), (0, -1)):
            d.point((c + dx, c + dy), fill=(255, 255, 255, 255))
    elif trait_id == "oldbrine":
        d.rectangle((c - 8, c - 1, c + 8, c + 7), fill=(0x6B, 0x45, 0x28, 255), outline=ink)
        d.line([(c - 9, c - 1), (c + 9, c - 1)], fill=steel, width=2)
        d.rectangle((c - 2, c - 8, c + 2, c - 3), fill=cream, outline=ink)
    return im


def reso_icon(reso_id: str, a_tag: str, b_tag: str, size: int = 48) -> Image.Image:
    """48×48：两个物件 + 连接结构 + 双色光弧（光弧不遮物件）。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ca = next(hexrgb(c) for t, c, _ in TAGS if t == a_tag)
    cb = next(hexrgb(c) for t, c, _ in TAGS if t == b_tag)
    d.arc((1, 3, size - 2, size - 1), 195, 345, fill=tuple(int(v) for v in ca) + (255,), width=2)
    d.arc((1, 3, size - 2, size - 1), 15, 165, fill=tuple(int(v) for v in cb) + (255,), width=2)
    left = tag_icon(a_tag, "#" + "".join("%02X" % int(v) for v in ca), "circle", 20).resize((20, 20), Image.NEAREST)
    right = tag_icon(b_tag, "#" + "".join("%02X" % int(v) for v in cb), "circle", 20).resize((20, 20), Image.NEAREST)
    im.alpha_composite(left, (4, size - 24))
    im.alpha_composite(right, (size - 24, size - 24))
    d.line([(21, size - 14), (27, size - 14)], fill=tuple(int(v) for v in GOLD) + (255,), width=2)
    return im


# ---------------------------------------------------------------- UI


def nine_slice(kind: str, state: str, size: int = 64) -> Image.Image:
    """四层结构：外框 / 内沿 / 底纹 / 受光边。"""
    pal = {
        "panel_dark": (PANEL, np.array([0x33, 0x45, 0x5F], np.float32), SHADOW),
        "panel_light": (np.array([0xE8, 0xE0, 0xC8], np.float32), np.array([0x9A, 0x8A, 0x6A], np.float32),
                        np.array([0xCF, 0xC3, 0xA5], np.float32)),
        "primary": (np.array([0xD8, 0x72, 0x28], np.float32), MAIN, np.array([0xA8, 0x4E, 0x18], np.float32)),
        "secondary": (np.array([0x2E, 0x4A, 0x6A], np.float32), np.array([0x4A, 0x6B, 0x8A], np.float32),
                      np.array([0x1C, 0x30, 0x46], np.float32)),
        "danger": (np.array([0xC0, 0x33, 0x44], np.float32), DANGER, np.array([0x84, 0x1F, 0x2C], np.float32)),
        "disabled": (np.array([0x3A, 0x40, 0x4A], np.float32), np.array([0x5A, 0x64, 0x72], np.float32),
                     np.array([0x28, 0x2D, 0x35], np.float32)),
    }[kind]
    fill, edge, inner = pal
    if state == "hover":
        fill = np.minimum(255, fill * 1.15)
    elif state == "pressed":
        fill = fill * 0.84
        edge = edge * 0.88
    n = size
    a = np.zeros((n, n, 3), np.float32)
    a[:, :] = fill
    a[:2, :] = edge
    a[-2:, :] = edge
    a[:, :2] = edge
    a[:, -2:] = edge
    a[2, :] = np.minimum(255, edge * 1.22)
    a[:, 2] = np.minimum(255, edge * 1.1)
    a[3, 3:-3] = inner
    a[-4, 3:-3] = inner
    a[3:-3, 3] = inner
    a[3:-3, -4] = inner
    for y in range(6, n - 6):
        for x in range(6, n - 6):
            if (x + y) % 8 == 0:
                a[y, x] = np.minimum(255, a[y, x] * 1.07)
    if state == "focus":
        a[1, 1:n - 1] = GOLD
        a[n - 2, 1:n - 1] = GOLD
        a[1:n - 1, 1] = GOLD
        a[1:n - 1, n - 2] = GOLD
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGB").convert("RGBA")


def simple_icon(kind: str, size: int = 32, col: np.ndarray = CREAM) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size // 2
    ink = tuple(int(v) for v in INK) + (255,)
    colr = tuple(int(v) for v in col) + (255,)
    gold = tuple(int(v) for v in GOLD) + (255,)
    danger = tuple(int(v) for v in DANGER) + (255,)
    if kind == "arrow_up":
        d.polygon([(c, 6), (c + 7, 17), (c + 3, 17), (c + 3, 26), (c - 3, 26), (c - 3, 17), (c - 7, 17)], fill=colr, outline=ink)
    elif kind == "arrow_down":
        d.polygon([(c, 26), (c + 7, 15), (c + 3, 15), (c + 3, 6), (c - 3, 6), (c - 3, 15), (c - 7, 15)], fill=colr, outline=ink)
    elif kind == "arrow_left":
        d.polygon([(6, c), (17, c - 7), (17, c - 3), (26, c - 3), (26, c + 3), (17, c + 3), (17, c + 7)], fill=colr, outline=ink)
    elif kind == "arrow_right":
        d.polygon([(26, c), (15, c - 7), (15, c - 3), (6, c - 3), (6, c + 3), (15, c + 3), (15, c + 7)], fill=colr, outline=ink)
    elif kind in ("close", "more", "trend_up", "trend_down", "trend_flat"):
        if kind == "close":
            d.line([(9, 9), (size - 10, size - 10)], fill=colr, width=3)
            d.line([(size - 10, 9), (9, size - 10)], fill=colr, width=3)
        elif kind == "more":
            for dx in (-8, 0, 8):
                d.rectangle((c + dx - 2, c - 2, c + dx + 2, c + 2), fill=colr, outline=ink)
        elif kind == "trend_up":
            d.line([(7, size - 9), (14, 16), (19, 20), (size - 7, 9)], fill=colr, width=2)
            d.polygon([(size - 7, 9), (size - 13, 10), (size - 8, 15)], fill=colr)
        elif kind == "trend_down":
            d.line([(7, 9), (14, 16), (19, 12), (size - 7, size - 9)], fill=colr, width=2)
            d.polygon([(size - 7, size - 9), (size - 13, size - 10), (size - 8, size - 15)], fill=colr)
        else:
            d.line([(7, c), (size - 8, c)], fill=colr, width=2)
            d.polygon([(size - 7, c), (size - 13, c - 4), (size - 13, c + 4)], fill=colr)
    elif kind in ("star_full", "star_empty"):
        pts = []
        for i in range(10):
            ang = math.radians(i * 36 - 90)
            r = size * 0.38 if i % 2 == 0 else size * 0.16
            pts.append((c + r * math.cos(ang), c + r * math.sin(ang)))
        d.polygon(pts, fill=gold if kind == "star_full" else None, outline=ink if kind == "star_full" else colr)
    elif kind in ("checkbox_on", "checkbox_off"):
        d.rectangle((5, 5, size - 6, size - 6), fill=(0xD8, 0x72, 0x28, 255) if kind == "checkbox_on" else tuple(int(v) for v in PANEL) + (255,), outline=colr, width=2)
        if kind == "checkbox_on":
            d.line([(10, 16), (14, 21), (22, 11)], fill=(255, 255, 255, 255), width=3)
    elif kind in ("radio_on", "radio_off"):
        d.ellipse((5, 5, size - 6, size - 6), fill=tuple(int(v) for v in PANEL) + (255,), outline=colr, width=2)
        if kind == "radio_on":
            d.ellipse((11, 11, size - 12, size - 12), fill=(0xD8, 0x72, 0x28, 255))
    elif kind in ("dot_full", "dot_empty", "dot_highlight", "dot_fragile"):
        if kind == "dot_full":
            d.ellipse((3, 3, size - 4, size - 4), fill=gold, outline=ink)
        elif kind == "dot_empty":
            d.ellipse((3, 3, size - 4, size - 4), fill=None, outline=colr, width=1)
        elif kind == "dot_highlight":
            d.ellipse((1, 1, size - 2, size - 2), fill=(255, 255, 255, 90), outline=gold, width=1)
        else:
            d.ellipse((3, 3, size - 4, size - 4), fill=None, outline=danger, width=1)
            d.line([(c - 3, c + 3), (c + 3, c - 3)], fill=danger, width=1)
    elif kind.startswith("stamp_"):
        ring = {"stamp_excellent": gold, "stamp_good": colr, "stamp_normal": tuple(int(v) for v in STEEL) + (255,),
                "stamp_poor": tuple(int(v) for v in EMBER) + (255,), "stamp_bad": danger}[kind]
        d.ellipse((2, 2, size - 3, size - 3), outline=ring, width=3)
        d.ellipse((6, 6, size - 7, size - 7), outline=ring, width=1)
        if kind == "stamp_excellent":
            d.line([(c - 8, c), (c - 2, c + 7), (c + 9, c - 8)], fill=ring, width=3)
        elif kind == "stamp_good":
            d.line([(c - 8, c), (c - 2, c + 7), (c + 9, c - 8)], fill=ring, width=2)
        elif kind == "stamp_normal":
            d.line([(c - 8, c), (c + 8, c)], fill=ring, width=3)
        elif kind == "stamp_poor":
            d.line([(c - 7, c + 6), (c + 7, c + 6)], fill=ring, width=3)
            d.line([(c - 5, c + 1), (c + 5, c + 1)], fill=ring, width=2)
        else:
            d.line([(c - 7, c - 7), (c + 7, c + 7)], fill=ring, width=3)
            d.line([(c + 7, c - 7), (c - 7, c + 7)], fill=ring, width=3)
    elif kind.startswith("node_"):
        if kind == "node_locked":
            d.rectangle((6, 12, size - 7, size - 5), fill=tuple(int(v) for v in PANEL) + (255,), outline=colr, width=2)
            d.arc((11, 5, size - 12, 19), 180, 360, fill=colr, width=2)
        elif kind == "node_ready":
            d.rectangle((6, 12, size - 7, size - 5), fill=(0x2E, 0x4A, 0x6A, 255), outline=colr, width=2)
            d.arc((11, 5, size - 12, 19), 180, 360, fill=colr, width=2)
            d.point((c, size - 12), fill=gold)
        elif kind == "node_active":
            d.rectangle((4, 10, size - 5, size - 3), fill=(0xD8, 0x72, 0x28, 255), outline=gold, width=2)
            d.arc((9, 3, size - 10, 17), 180, 360, fill=gold, width=2)
        else:
            d.ellipse((2, 8, size - 3, size - 2), fill=None, outline=gold, width=2)
    elif kind == "mask_dither":
        for y in range(size):
            for x in range(size):
                if (x % 4 in (0, 1)) and (y % 4 in (0, 2)):
                    im.putpixel((x, y), (0, 0, 0, 255))
    elif kind == "slider_knob":
        d.rectangle((8, 6, size - 9, size - 7), fill=(0xD8, 0x72, 0x28, 255), outline=colr, width=2)
        d.line([(c, 9), (c, size - 10)], fill=colr, width=1)
    elif kind == "slider_track":
        d.rectangle((0, size // 2 - 5, size - 1, size // 2 + 4), fill=tuple(int(v) for v in SHADOW) + (255,),
                    outline=tuple(int(v) for v in PANEL) + (255,))
    elif kind == "progress_bg":
        d.rectangle((0, size // 2 - 6, size - 1, size // 2 + 5), fill=tuple(int(v) for v in SHADOW) + (255,),
                    outline=tuple(int(v) for v in PANEL) + (255,))
    elif kind == "progress_fill":
        d.rectangle((0, size // 2 - 6, size - 1, size // 2 + 5), fill=(0xD8, 0x72, 0x28, 255))
        d.line([(0, size // 2 - 5), (size - 1, size // 2 - 5)], fill=tuple(int(v) for v in MAIN) + (255,), width=1)
    elif kind == "progress_fill_danger":
        d.rectangle((0, size // 2 - 6, size - 1, size // 2 + 5), fill=(0xC0, 0x33, 0x44, 255))
        d.line([(0, size // 2 - 5), (size - 1, size // 2 - 5)], fill=danger, width=1)
    return im


# ---------------------------------------------------------------- 数字字形（5×7）

DIGITS = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "¥": ["10001", "01010", "00100", "11111", "00100", "11111", "00100"],
    ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
}


def glyph(ch: str, scale: int, col: np.ndarray = CREAM) -> Image.Image:
    rows = DIGITS.get(ch)
    im = Image.new("RGBA", (5, 7), (0, 0, 0, 0))
    if rows:
        for y, row in enumerate(rows):
            for x, v in enumerate(row):
                if v == "1":
                    im.putpixel((x, y), tuple(int(c) for c in col) + (255,))
    return im.resize((5 * scale, 7 * scale), Image.NEAREST)


def digit_sheet(height: int, col: np.ndarray = CREAM) -> Image.Image:
    scale = max(1, round(height / 8))
    order = "0123456789+-¥:/%"
    cells = [glyph(ch, scale, col) for ch in order]
    cw = max(c.width for c in cells) + 2 * scale
    sheet = Image.new("RGBA", (cw * len(cells), height), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.alpha_composite(c, (i * cw + (cw - c.width) // 2, (height - c.height) // 2))
    return sheet


# ---------------------------------------------------------------- 主流程


def save(im: Image.Image, rel: str) -> None:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, optimize=True)


def main() -> int:
    made = 0
    for tag_id, color, shape in TAGS:
        for state in ("normal", "grayed", "highlight", "fragile"):
            save(tag_icon(tag_id, color, shape, 32, state), f"ico/tag_{tag_id}_{state}.png")
            made += 1
        save(tag_icon(tag_id, color, shape, 32, "normal").resize((24, 24), Image.NEAREST),
             f"ico/preview24/tag_{tag_id}_24.png")

    for trait_id in TRAITS:
        save(trait_icon(trait_id, 32), f"ico/trait_{trait_id}.png")
        made += 1

    for rid, a, b in RESO:
        save(reso_icon(rid, a, b, 48), f"ico/{rid}.png")
        made += 1

    for kind in ("panel_dark", "panel_light", "primary", "secondary", "danger", "disabled"):
        for state in ("normal", "hover", "pressed", "focus"):
            save(nine_slice(kind, state, 64), f"ui/ui_{kind}_{state}_9slice.png")
            made += 1
    for kind in ("arrow_up", "arrow_down", "arrow_left", "arrow_right", "close", "more",
                 "trend_up", "trend_down", "trend_flat", "star_full", "star_empty",
                 "checkbox_on", "checkbox_off", "radio_on", "radio_off",
                 "node_locked", "node_ready", "node_active", "node_highlight",
                 "stamp_excellent", "stamp_good", "stamp_normal", "stamp_poor", "stamp_bad"):
        save(simple_icon(kind, 32), f"ui/ui_{kind}.png")
        made += 1
    for kind in ("dot_full", "dot_empty", "dot_highlight", "dot_fragile"):
        save(simple_icon(kind, 16), f"ui/ui_{kind}.png")
        made += 1
    for kind, nm in (("mask_dither", "ui_mask_dither"), ("slider_knob", "ui_slider_knob"),
                     ("slider_track", "ui_slider_track"), ("progress_bg", "ui_progress_bg"),
                     ("progress_fill", "ui_progress_fill_warm"), ("progress_fill_danger", "ui_progress_fill_danger")):
        save(simple_icon(kind, 64 if kind == "mask_dither" else 32), f"ui/{nm}.png")
        made += 1

    for h in (16, 24, 32, 48):
        save(digit_sheet(h), f"ui/ui_digits_{h}.png")
        made += 1

    print("procedural assets written:", made, "->", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
