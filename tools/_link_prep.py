# -*- coding: utf-8 -*-
import io

p = 'D:/02web/1zone/index.html'
s = io.open(p, encoding='utf-8').read()
if 'styles-prep.css' not in s:
    s = s.replace('<link rel="stylesheet" href="styles-stock.css" />',
                  '<link rel="stylesheet" href="styles-stock.css" />\n<link rel="stylesheet" href="styles-prep.css" />')
    io.open(p, 'w', encoding='utf-8').write(s)
    print('linked')
for l in s.split('\n'):
    if 'stylesheet' in l:
        print(' ', l.strip())
