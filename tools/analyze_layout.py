# -*- coding: utf-8 -*-
"""分析 HD 夜景图层，自动推断出摊场景的关键坐标（台面 / 地面 / 摊位中心）"""
import io

import numpy as np
from PIL import Image

LAYERS = ['far', 'mid', 'ground', 'near']
base = None
for l in LAYERS:
    im = Image.open('assets/art_hd/scene/scene_night_%s.png' % l).convert('RGBA')
    a = np.array(im).astype(float)
    al = a[:, :, 3:4] / 255.0
    rgb = a[:, :, :3] * al
    base = rgb if base is None else base * (1 - al) + rgb

lum = base.mean(axis=2)
H, W = lum.shape

out = io.open('_layout.txt', 'w', encoding='utf-8')
out.write('scene composite %dx%d\n\n' % (W, H))

# 1) 行亮度剖面，找台面（局部极大）与地面（亮起的地面反光）
row = lum.mean(axis=1)
out.write('row profile (每 10px):\n')
for y in range(0, H, 10):
    bar = '#' * int(row[y] / 2)
    out.write('  y=%3d %5.1f %s\n' % (y, row[y], bar))

# 2) 行方向的梯度（水平边缘强度），台面边缘会是个尖峰
grad = np.abs(np.diff(row))
top_edges = np.argsort(grad)[-12:][::-1]
out.write('\nstrongest horizontal edges (y, |dLum|):\n')
for y in sorted(top_edges):
    out.write('  y=%3d  d=%.2f\n' % (y, grad[y]))

# 3) 列亮度剖面，找摊位中心（暖光集中处）
r, g, b = base[:, :, 0], base[:, :, 1], base[:, :, 2]
warm = (r > 90) & (r > b + 20)
colwarm = warm.mean(axis=0)
out.write('\nwarm-light column profile (每 40px):\n')
for x in range(0, W, 40):
    seg = colwarm[x:x + 40].mean()
    out.write('  x=%3d %5.3f %s\n' % (x, seg, '#' * int(seg * 200)))

# 4) 最暖的区域（摊位所在）
ys, xs = np.where(warm)
if len(xs):
    out.write('\nwarm bbox: x[%d..%d] y[%d..%d]\n' % (xs.min(), xs.max(), ys.min(), ys.max()))
    out.write('warm centroid: x=%.0f y=%.0f\n' % (xs.mean(), ys.mean()))
    # 用分位数排除零星噪点
    out.write('warm p5..p95: x[%d..%d] y[%d..%d]\n' % (
        np.percentile(xs, 5), np.percentile(xs, 95),
        np.percentile(ys, 5), np.percentile(ys, 95)))

out.close()
print('written _layout.txt')
