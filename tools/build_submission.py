# -*- coding: utf-8 -*-
"""生成参赛提交包：完整版 + 匿名版

完整版  = git 跟踪的全部文件（自动排除 .gitignore 里的临时件与商业 BGM）
匿名版  = 完整版 + 身份信息脱敏（FubukiQAQ → dev）
"""
import io
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = 'D:/02web/1zone'
DIST = os.path.join(ROOT, 'dist')
NAME = '不烧心夜市挑战'
ZIP_FULL = os.path.join(DIST, NAME + '-完整版.zip')
ZIP_ANON = os.path.join(DIST, NAME + '-匿名版.zip')

# 匿名化替换表：(正则, 替换)
ANON_RULES = [
    (re.compile(r'FubukiQAQ', re.I), 'dev'),
    # 匿名版的 clone 行要换掉：dev 不是真实仓库，不能让人照抄
    (re.compile(r'^git clone .*$', re.M),
     '# 本包为赛事提交版本，直接在解压后的目录里起静态服务器即可'),
    (re.compile(r'^cd night-marketing-challege\s*$', re.M),
     'cd 不烧心夜市挑战-匿名版'),
]

# 这些文件不进任何包（冗余/开发中间物）
EXCLUDE_PREFIX = ()
EXCLUDE_EXACT = {
    'gameset.orig.md',        # 老稿，留仓库里做历史，不进提交包
    'RUN_ART.bat',            # 美术生成脚本入口，评委用不上
    'build_submission.py',    # 打包脚本本体：含脱敏规则，进包会被自己改坏
    'buff.xlsx',              # 旧版规划表，已被 配表/ 取代
    'food.xlsx',
}
TEXT_EXT = {'.js', '.mjs', '.json', '.md', '.html', '.css', '.py', '.txt',
            '.yml', '.bat', '.csv', '.gitignore'}


def run(cmd, cwd=ROOT):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True)
    if p.returncode != 0:
        print('FAILED:', ' '.join(cmd))
        print(p.stderr.decode('utf-8', 'ignore')[:2000])
        sys.exit(1)
    return p.stdout


def git_tracked():
    out = run(['git', '-c', 'core.quotepath=false', 'ls-files', '-z'])
    raw = out.decode('utf-8')
    files = [x for x in raw.split('\0') if x]
    keep = []
    for f in files:
        base = os.path.basename(f)
        if f in EXCLUDE_EXACT or base in EXCLUDE_EXACT:
            continue
        if any(f.startswith(p) for p in EXCLUDE_PREFIX):
            continue
        keep.append(f)
    return keep


def build(src_files, out_zip, anon):
    tmp = os.path.join(DIST, '_tmp_' + ('anon' if anon else 'full'))
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp, exist_ok=True)

    n_copied = 0
    n_patched = 0
    for rel in src_files:
        src = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.isfile(src):
            print('  missing (skip):', rel)
            continue
        dst = os.path.join(tmp, rel.replace('/', os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        ext = os.path.splitext(rel)[1].lower()
        if anon and (ext in TEXT_EXT or os.path.basename(rel) == '.gitignore'):
            try:
                txt = io.open(src, encoding='utf-8').read()
            except UnicodeDecodeError:
                shutil.copy2(src, dst)
                n_copied += 1
                continue
            new = txt
            for rx, rep in ANON_RULES:
                new = rx.sub(rep, new)
            if new != txt:
                n_patched += 1
                print('  anon patched:', rel)
            io.open(dst, 'w', encoding='utf-8', newline='').write(new)
            n_copied += 1
        else:
            shutil.copy2(src, dst)
            n_copied += 1

    # 打包
    if os.path.exists(out_zip):
        os.remove(out_zip)
    base = os.path.dirname(tmp)
    rootname = os.path.basename(tmp).replace('_tmp_anon', '匿名版').replace('_tmp_full', '完整版')
    rootname = NAME + '-' + rootname
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dirpath, _, filenames in os.walk(tmp):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                relp = os.path.relpath(full, tmp).replace(os.sep, '/')
                z.write(full, rootname + '/' + relp)
    shutil.rmtree(tmp)
    size = os.path.getsize(out_zip) / 1024 / 1024
    print('  -> %s  (%d files, %d patched, %.1f MB)'
          % (os.path.basename(out_zip), n_copied, n_patched, size))
    return out_zip


def main():
    os.makedirs(DIST, exist_ok=True)
    files = git_tracked()
    print('tracked files to package: %d' % len(files))

    print('\n[1/2] 完整版')
    build(files, ZIP_FULL, anon=False)

    print('\n[2/2] 匿名版')
    build(files, ZIP_ANON, anon=True)

    print('\ndone.')


if __name__ == '__main__':
    main()
