# -*- coding: utf-8 -*-
"""加回 9slice 链接，准备 P0-2 提交"""
import io

p = 'D:/02web/1zone/index.html'
s = io.open(p, encoding='utf-8').read()
if 'styles-9slice.css' not in s:
    s = s.replace('<link rel="stylesheet" href="styles-p0.css" />',
                  '<link rel="stylesheet" href="styles-p0.css" />\n<link rel="stylesheet" href="styles-9slice.css" />')
io.open(p, 'w', encoding='utf-8').write(s)
print('done')
