# -*- coding: utf-8 -*-
"""把 assets/art/ 下的源 PNG 重新打包成 RGBA 图集（原图集 PNG-8 调色板损坏）"""
import glob
import json
import os

import numpy as np
from PIL import Image


def key_out_black(im):
    """源素材用纯黑 (0,0,0) 当背景：从四边泛洪扣掉，保留内部黑色描边"""
    a = np.array(im.convert('RGBA'))
    if tuple(a[0, 0]) != (0, 0, 0, 255):
        return im
    h, w, _ = a.shape
    black = (a[:, :, 0] == 0) & (a[:, :, 1] == 0) & (a[:, :, 2] == 0) & (a[:, :, 3] == 255)
    seen = np.zeros((h, w), bool)
    stack = []
    for x in range(w):
        stack.append((0, x)); stack.append((h - 1, x))
    for y in range(h):
        stack.append((y, 0)); stack.append((y, w - 1))
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not black[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    a[:, :, 3] = np.where(seen, 0, a[:, :, 3])
    return Image.fromarray(a, 'RGBA')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "art")
OUT_PNG = os.path.join(ROOT, "assets", "packed")
OUT_JSON = os.path.join(ROOT, "src", "data", "atlas.json")
os.makedirs(OUT_PNG, exist_ok=True)

CATS = ["ing", "food", "ico", "ui", "char", "utensil", "fx", "scene"]
MAXW = 1024


def pack(cat):
    files = sorted(glob.glob(os.path.join(ART, cat, "**", "*.png"), recursive=True))
    # 场景大图不打包，保留独立文件
    imgs = []
    for p in files:
        im = key_out_black(Image.open(p).convert("RGBA"))
        if im.width >= 128:
            continue
        imgs.append((p, im))
    # 按高度排序做 shelf packing
    imgs.sort(key=lambda t: (-t[1].height, -t[1].width))
    x = y = 0
    rowH = 0
    placements = {}
    for p, im in imgs:
        if x + im.width > MAXW:
            x = 0
            y += rowH + 1
            rowH = 0
        placements[p] = (x, y)
        x += im.width + 1
        rowH = max(rowH, im.height)
    W = MAXW
    H = 1
    while H < y + rowH + 2:
        H *= 2
    H = min(H, 2048)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    frames = {}
    for p, im in imgs:
        px, py = placements[p]
        sheet.paste(im, (px, py))
        rel = os.path.relpath(p, ART).replace("\\", "/")
        frames[rel] = {"png": "assets/packed/%s.png" % cat,
                       "x": px, "y": py, "w": im.width, "h": im.height}
    out = os.path.join(OUT_PNG, cat + ".png")
    sheet.save(out, optimize=True)
    print("%-8s %3d sprites -> %s (%dx%d)" % (cat, len(imgs), os.path.basename(out), W, H))
    return frames


all_frames = {}
for c in CATS:
    all_frames.update(pack(c))

# 场景大图（独立文件）
scene = {}
for p in sorted(glob.glob(os.path.join(ART, "scene", "*.png"))):
    im = Image.open(p)
    if im.width < 128:
        continue
    name = os.path.basename(p)[:-4]
    scene[name] = "assets/art/scene/" + os.path.basename(p)
    rel = "scene/" + os.path.basename(p)
    all_frames[rel] = {"png": "assets/art/scene/" + os.path.basename(p),
                       "x": 0, "y": 0, "w": im.width, "h": im.height}

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump({"frames": all_frames, "scene": scene}, f, ensure_ascii=False, separators=(",", ":"))
print("frames:", len(all_frames), "-> src/data/atlas.json")
