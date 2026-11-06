# -*- coding: utf-8 -*-
"""分三次提交：先临时把 index.html 收敛到只含 P0-1 的样式链接"""
import io

p = 'D:/02web/1zone/index.html'
s = io.open(p, encoding='utf-8').read()
for name in ['styles-9slice.css', 'styles-palette.css']:
    line = '<link rel="stylesheet" href="%s" />\n' % name
    s = s.replace(line, '')
io.open(p, 'w', encoding='utf-8').write(s)
print('index.html 现在只有 P0-1 链接:')
for l in s.split('\n'):
    if 'stylesheet' in l:
        print(' ', l.strip())
