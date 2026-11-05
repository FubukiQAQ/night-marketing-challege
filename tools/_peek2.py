# -*- coding: utf-8 -*-
"""模拟页面环境，跑一遍 fitCanvas 逻辑，定位为什么 scale 只有 0.25"""
import io

# 读 main.js 里的常量与函数体，手工推理
m = io.open('D:/02web/1zone/src/main.js', encoding='utf-8').read()
i = m.index('const HUD_TOP')
print(m[i:i + 900])
