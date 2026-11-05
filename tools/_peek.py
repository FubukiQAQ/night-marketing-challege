# -*- coding: utf-8 -*-
import io
import re

c = io.open('D:/02web/1zone/_d4.txt', encoding='utf-8').read()
m = re.search(r'<canvas[^>]*>', c)
print('canvas:', m.group(0) if m else 'NOT FOUND')
print('boot fail:', 'boot-fail' in c or '启动失败' in c)
