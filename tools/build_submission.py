# -*- coding: utf-8 -*-
"""生成参赛提交包：完整版 / 匿名版，各出「含 BGM」与「无 BGM」两种

- 含 BGM 版只打包 ConcernedApe 的两首（备货 / 备餐），并同步裁剪 tracks.json
- README 里不保留仓库链接（避免评委顺着链接找到作者）
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = 'D:/02web/1zone'
DIST = os.path.join(ROOT, 'dist')
NAME = '不烧心夜市挑战'

# 匿名化替换表
ANON_RULES = [
    (re.compile(r'FubukiQAQ', re.I), 'dev'),
]

# 两个包都要做的 README 处理：抹掉仓库链接
COMMON_RULES = [
    (re.compile(r'^git clone .*$', re.M),
     '# 本包为赛事提交版本，直接在解压后的目录里起静态服务器即可'),
    # 任何残留的 github 链接一并去掉
    (re.compile(r'^\s*(git clone\s+)?https?://github\.com/\S*\s*$', re.M), ''),
]

EXCLUDE_EXACT = {
    'gameset.orig.md',
    'RUN_ART.bat',
    'build_submission.py',
    'buff.xlsx',
    'food.xlsx',
}
TEXT_EXT = {'.js', '.mjs', '.json', '.md', '.html', '.css', '.py', '.txt',
            '.yml', '.bat', '.csv'}

# 允许随包分发的 BGM（用户指定：只放 ConcernedApe 的两首）
AUDIO_PATTERN = re.compile(r'^ConcernedApe', re.I)


def run(cmd, cwd=ROOT):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True)
    if p.returncode != 0:
        print('FAILED:', ' '.join(cmd))
        print(p.stderr.decode('utf-8', 'ignore')[:2000])
        sys.exit(1)
    return p.stdout


def git_tracked():
    out = run(['git', '-c', 'core.quotepath=false', 'ls-files', '-z'])
    files = [x for x in out.decode('utf-8').split('\0') if x]
    keep = []
    for f in files:
        base = os.path.basename(f)
        if f in EXCLUDE_EXACT or base in EXCLUDE_EXACT:
            continue
        keep.append(f)
    return keep


def audio_files():
    """要随包分发的 mp3（未跟踪，直接从磁盘取）"""
    d = os.path.join(ROOT, 'sound')
    if not os.path.isdir(d):
        return []
    out = []
    for fn in sorted(os.listdir(d)):
        if fn.lower().endswith('.mp3') and AUDIO_PATTERN.match(fn):
            out.append('sound/' + fn)
    return out


def filter_tracks_txt(txt, available_basenames):
    """把 tracks.json 裁剪成只包含包里真实存在的曲目"""
    try:
        lst = json.loads(txt)
    except Exception:
        return txt, 0
    kept = [t for t in lst if os.path.basename(t.get('file', '')) in available_basenames]
    if len(kept) == len(lst):
        return txt, 0
    return json.dumps(kept, ensure_ascii=False, indent=2) + '\n', len(lst) - len(kept)


def build(src_files, out_zip, anon, audio):
    tag = '_tmp_' + ('anon' if anon else 'full') + ('_a' if audio else '')
    tmp = os.path.join(DIST, tag)
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp, exist_ok=True)

    files = list(src_files) + (audio_files() if audio else [])
    audio_names = {os.path.basename(f) for f in audio_files()} if audio else set()

    n_copied = 0
    patched = []
    for rel in files:
        src = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.isfile(src):
            print('  missing (skip):', rel)
            continue
        dst = os.path.join(tmp, rel.replace('/', os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        ext = os.path.splitext(rel)[1].lower()

        if ext in TEXT_EXT:
            try:
                txt = io.open(src, encoding='utf-8').read()
            except UnicodeDecodeError:
                shutil.copy2(src, dst)
                n_copied += 1
                continue
            new = txt
            # 链接清理只作用于 README：LICENSE / OFL 正文一个字都不能改
            if rel == 'README.md':
                for rx, rep in COMMON_RULES:
                    new = rx.sub(rep, new)
            if anon:
                for rx, rep in ANON_RULES:
                    new = rx.sub(rep, new)
            # 含 BGM 版：tracks.json 只留真实存在的曲目
            if audio and rel == 'src/data/tracks.json':
                new, dropped = filter_tracks_txt(new, audio_names)
                if dropped:
                    print('  tracks.json 裁掉 %d 条（包里没有对应文件）' % dropped)
            if new != txt:
                patched.append(rel)
            io.open(dst, 'w', encoding='utf-8', newline='').write(new)
            n_copied += 1
        else:
            shutil.copy2(src, dst)
            n_copied += 1

    if os.path.exists(out_zip):
        os.remove(out_zip)
    suffix = ('匿名版' if anon else '完整版') + ('-含BGM' if audio else '-无BGM')
    rootname = NAME + '-' + suffix
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dirpath, _, filenames in os.walk(tmp):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                relp = os.path.relpath(full, tmp).replace(os.sep, '/')
                z.write(full, rootname + '/' + relp)
    shutil.rmtree(tmp)
    mb = os.path.getsize(out_zip) / 1024 / 1024
    print('  -> %s  (%d files, %d patched, %.1f MB)'
          % (os.path.basename(out_zip), n_copied, len(patched), mb))
    if patched:
        print('     patched:', ', '.join(sorted(set(patched))))
    return out_zip


def main():
    os.makedirs(DIST, exist_ok=True)
    files = git_tracked()
    au = audio_files()
    print('tracked files: %d ; audio to include: %s' % (len(files), [os.path.basename(x) for x in au]))

    jobs = [
        (False, True, os.path.join(DIST, NAME + '-完整版-含BGM.zip')),
        (True, True, os.path.join(DIST, NAME + '-匿名版-含BGM.zip')),
        (False, False, os.path.join(DIST, NAME + '-完整版-无BGM.zip')),
        (True, False, os.path.join(DIST, NAME + '-匿名版-无BGM.zip')),
    ]
    for i, (anon, audio, path) in enumerate(jobs, 1):
        label = ('匿名版' if anon else '完整版') + (' 含BGM' if audio else ' 无BGM')
        print('\n[%d/%d] %s' % (i, len(jobs), label))
        build(files, path, anon=anon, audio=audio)

    # 清理旧的命名（v1.6 那版没有后缀）
    for old in (NAME + '-完整版.zip', NAME + '-匿名版.zip'):
        p = os.path.join(DIST, old)
        if os.path.isfile(p):
            os.remove(p)
            print('removed legacy:', old)

    print('\ndone.')


if __name__ == '__main__':
    main()
