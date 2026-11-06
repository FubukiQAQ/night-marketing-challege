# -*- coding: utf-8 -*-
"""扫描文本文件：① 是否有 GBK 乱码 ② 是否能按 UTF-8 解码"""
import glob
import io

MARKS = ['锟', '涓嶇', '鎸', '鏅', '閽', '璐', '鍑', '锛', '鐨', '浜', '娴']

files = ['index.html', 'README.md', 'gameset.md']
files += glob.glob('src/*.js') + glob.glob('docs/*.md') + glob.glob('tools/*.py')
files += glob.glob('styles*.css')

out = io.open('_textcheck.txt', 'w', encoding='utf-8')
bad = 0
for f in files:
    if 'check_text' in f:
        continue
    try:
        s = io.open(f, encoding='utf-8').read()
    except UnicodeDecodeError as e:
        out.write('UTF8-FAIL %s at byte %d\n' % (f, e.start))
        bad += 1
        continue
    for m in MARKS:
        if m in s:
            out.write('MOJIBAKE %s -> %s\n' % (f, m))
            bad += 1
            break

out.write('scanned %d files, %d problems\n' % (len(files), bad))
out.close()
print('bad =', bad)
