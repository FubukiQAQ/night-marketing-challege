# -*- coding: utf-8 -*-
"""把 assets/art_hd/ 的高清素材打包成图集，并生成 src/data/atlas.json

art_hd 的命名是语义 id（food_<foodId 去掉 f_>、ing_<ingId>、utensil_<utid>），
所以运行时可以直接按 id 取图，不需要映射表。
"""
import glob
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "art_hd")
OUT_PNG = os.path.join(ROOT, "assets", "packed")
OUT_JSON = os.path.join(ROOT, "src", "data", "atlas.json")
os.makedirs(OUT_PNG, exist_ok=True)

MAXW = 1024
CATS = ["ing", "food", "ico", "ui", "char", "utensil"]
# 单张就超过 1024 宽的资产单独出文件（目前没有，留作兜底）
SKIP_DIRS = {"overview", "_raw"}


def pack(cat):
    files = sorted(glob.glob(os.path.join(SRC, cat, "*.png")))
    imgs = []
    for p in files:
        im = Image.open(p).convert("RGBA")
        imgs.append((p, im))
    imgs.sort(key=lambda t: (-t[1].height, -t[1].width))
    x = y = 0
    rowH = 0
    placements = {}
    for p, im in imgs:
        if x + im.width > MAXW:
            x = 0
            y += rowH + 2
            rowH = 0
        placements[p] = (x, y)
        x += im.width + 2
        rowH = max(rowH, im.height)
    total_h = y + rowH + 2
    H = 64
    while H < total_h:
        H *= 2
    sheet = Image.new("RGBA", (MAXW, H), (0, 0, 0, 0))
    frames = {}
    for p, im in imgs:
        px, py = placements[p]
        sheet.paste(im, (px, py))
        key = cat + "/" + os.path.basename(p)
        frames[key] = {"png": "assets/packed/%s.png" % cat,
                       "x": px, "y": py, "w": im.width, "h": im.height}
    out = os.path.join(OUT_PNG, cat + ".png")
    sheet.save(out, optimize=True)
    print("%-8s %3d -> %-12s %dx%d" % (cat, len(imgs), os.path.basename(out), MAXW, H))
    return frames


frames = {}
for c in CATS:
    frames.update(pack(c))

# 场景大图保持独立文件（960×540 × 15 张，不进图集）
scene = {}
for p in sorted(glob.glob(os.path.join(SRC, "scene", "*.png"))):
    name = os.path.basename(p)[:-4]
    im = Image.open(p)
    scene[name] = "assets/art_hd/scene/" + os.path.basename(p)
    frames["scene/" + os.path.basename(p)] = {
        "png": scene[name], "x": 0, "y": 0, "w": im.width, "h": im.height,
    }

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump({"frames": frames, "scene": scene, "hd": True}, f,
              ensure_ascii=False, separators=(",", ":"))

print("frames:", len(frames), "-> src/data/atlas.json")
print("scene layers:", len(scene))
