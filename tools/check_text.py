# -*- coding: utf-8 -*-
"""扫描文本文件里的典型乱码（UTF-8 被按 GBK 解码后的痕迹）"""
import glob
import io
import sys

MARKS = ['锟', '涓嶇', '鎸', '鏅', '閽', '璐', '鍑', '锛', '鐨', '浜', '娴']

files = ['index.html', 'styles.css', 'README.md', 'gameset.md']
files += glob.glob('src/*.js') + glob.glob('docs/*.md') + glob.glob('tools/*.py')
files = [f for f in files if 'check_text' not in f]

bad = []
for f in files:
    try:
        s = io.open(f, encoding='utf-8').read()
    except Exception as e:
        bad.append((f, 'READ-FAIL'))
        continue
    for m in MARKS:
        if m in s:
            bad.append((f, m))
            break

out = io.open('_textcheck.txt', 'w', encoding='utf-8')
if bad:
    out.write('FOUND %d files with mojibake\n' % len(bad))
    for f, m in bad:
        out.write('  %s -> %s\n' % (f, m))
else:
    out.write('OK: no mojibake\n')
out.write('scanned %d files\n' % len(files))
out.close()
print('done, see _textcheck.txt')
