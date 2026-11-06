# -*- coding: utf-8 -*-
"""加回 palette 链接，准备 P0-3 提交"""
import io

p = 'D:/02web/1zone/index.html'
s = io.open(p, encoding='utf-8').read()
if 'styles-palette.css' not in s:
    s = s.replace('<link rel="stylesheet" href="styles-9slice.css" />',
                  '<link rel="stylesheet" href="styles-9slice.css" />\n<link rel="stylesheet" href="styles-palette.css" />')
io.open(p, 'w', encoding='utf-8').write(s)
for l in s.split('\n'):
    if 'stylesheet' in l:
        print(' ', l.strip())
