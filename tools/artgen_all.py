"""全量美术素材批量生成（可断点续跑 / 拼版生成 / 内容分割 / 原图备份）。

设计要点
  1) 断点续跑：进度写 assets/art_hd/_state.json，每张图/每格落盘，随时中断随时续跑。
  2) 拼版生成：同规格素材合成一张图，速度快 4~16 倍，且同版共享光照与调色板。
  3) 按内容分割：不再假设模型排版均匀。先抠出整张图的物件掩膜，再做连通域分割，
     按"行优先"顺序对应到素材，因此不会切到邻居、不会切歪；数量不符则自动降级为单张重出。
  4) 角色按角色成组：同一个角色的多个动作/表情放在同一张拼图里生成，从根源保证帧间一致性。
  5) 原图备份：每张生成图（拼图或单张）与每格裁切原图都另存到 assets/art_hd/_raw/，
     便于事后复核或重新处理，不必重新生成。
  6) 纯文生图：不使用图生图，不引用任何历史素材作为参考图。

常用命令（用 ComfyUI 的 venv 跑）
  python tools/artgen_all.py --plan
  python tools/artgen_all.py --categories ing --max-gen 12
  python tools/artgen_all.py                        # 跑全部
  python tools/artgen_all.py --retry-failed
  python tools/artgen_all.py --sheet off --only food_lamb_skewer
"""
from __future__ import annotations

import argparse, csv, io, json, math, os, shutil, sys, time, traceback
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
PROJECT = TOOLS.parent

import artgen as G                      # noqa: E402
import art_prompts as AP                # noqa: E402

OUT = PROJECT / "assets" / "art_hd"
RAW = OUT / "_raw"
STATE = OUT / "_state.json"
LOGFILE = OUT / "_run.log"

# 每类素材的规格：(宽, 高, 拼版列, 拼版行, 单格像素)
# 生成画布 = cols*cell × rows*cell，默认控制在 ≤1280² 以适配 12GB 显存。
SPEC = {
    "ing":       dict(w=32, h=32, cols=4, rows=4, cell=320),
    "food_s":    dict(w=48, h=48, cols=3, rows=3, cell=384),
    "food_l":    dict(w=64, h=64, cols=2, rows=2, cell=512),
    "utensil":   dict(w=64, h=64, cols=2, rows=2, cell=512),
    "utensil_l": dict(w=96, h=96, cols=1, rows=1, cell=1024),
    "char":      dict(w=48, h=64, cols=3, rows=2, cell=384),
    "special":   dict(w=160, h=160, cols=3, rows=1, cell=512),
    "scene":     dict(w=960, h=540, cols=1, rows=1, cell=1024, supersample=1, grid=(480, 270)),
}

# 角色组内动作数 -> 拼版布局（允许末尾空格，提示词会说明空格留空）
CHAR_LAYOUT = {1: (1, 1), 2: (2, 1), 3: (3, 1), 4: (2, 2), 5: (3, 2), 6: (3, 2), 7: (3, 3), 8: (3, 3), 9: (3, 3)}

SHEET_STYLE = (
    "a pixel art sprite sheet of {n} separate game icons arranged in a {cols} by {rows} grid on a flat solid "
    "magenta background, every object sits fully inside its own cell with a wide magenta gap on all four sides "
    "and never touches a cell boundary, objects evenly spaced in {rows} rows of {cols}, each cell holds exactly "
    "one object, all objects share one light direction and one restrained muted palette, chunky uniform square "
    "pixels aligned to a single grid, crisp hard pixel edges, 1px dark brown-black outline, warm amber key light "
    "from the upper left, muted grey-blue shadow on the lower right, no grid lines, no frame, no text, no numbers, "
    "no labels, no anti-aliasing, no gradient, no glow, no neon"
)

CHAR_STYLE = (
    "a pixel art character sheet showing the SAME character in {n} different poses arranged in a {cols} by {rows} "
    "grid on a flat solid magenta background; {base}; identical character design, identical outfit, identical body "
    "proportions, identical hairstyle and identical limited palette in every cell, only the pose and expression "
    "change: {poses}; each figure stands fully inside its own cell with a wide magenta gap and never touches a cell "
    "boundary, all figures share one light direction (warm key from upper left, cool shadow lower right), chunky "
    "uniform square pixels on a single grid, crisp hard pixel edges, 1px dark outline, no grid lines, no frame, "
    "no text, no labels, no anti-aliasing, no gradient, no glow"
)

FRAME_STYLE = (
    "high-detail pixel art background illustration, {subject}, full frame composition with no border and no "
    "margin, wide 16:9 scene, chunky uniform square pixels aligned to a perfect grid, crisp hard pixel edges, "
    "no anti-aliasing, no gradient blur, no glow bloom, restrained muted night palette of about 28 colours, "
    "warm amber light sources against deep blue shadows, layered depth, readable silhouettes, "
    "no text, no watermark, no frame, no vignette"
)


class LayoutMismatch(RuntimeError):
    """拼图里的物件数量/位置与预期不符。"""


# ---------------------------------------------------------------- 日志与状态


def log(msg: str) -> None:
    line = "[%s] %s" % (datetime.now().strftime("%H:%M:%S"), msg)
    print(line, flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    with io.open(LOGFILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"items": {}, "runs": 0}


def save_state(st: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, STATE)


def archive(src: Path, tag: str) -> str:
    """把生成的原图另存一份备份（最后兜底，永不覆盖原文件）。"""
    RAW.mkdir(parents=True, exist_ok=True)
    dst = RAW / ("%s__%s" % (tag, src.name))
    try:
        shutil.copy2(src, dst)
    except Exception as e:                        # 备份失败不影响生产
        log("WARN 原图备份失败 %s: %s" % (src, e))
        return ""
    return str(dst.relative_to(PROJECT))


def archive_cell(cell_rgb: np.ndarray, item_id: str, idx: int) -> str:
    """另存每一格的裁切原图（未抠底），便于事后重处理。"""
    d = RAW / "cells"
    d.mkdir(parents=True, exist_ok=True)
    p = d / ("%s__cell%d.png" % (item_id, idx + 1))
    Image.fromarray(cell_rgb).save(p, optimize=True)
    return str(p.relative_to(PROJECT))


# ---------------------------------------------------------------- 队列


def read_csv(name: str) -> list[dict]:
    with io.open(PROJECT / "配表" / "csv" / name, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def build_queue() -> list[dict]:
    q: list[dict] = []
    for row in read_csv("Ingredient.csv"):
        iid = row["ingredient_id"]
        if iid not in AP.ING:
            log("WARN 缺少提示词: ing %s" % iid)
            continue
        hint = AP.ING_CAT_HINT.get(row["类别"], "")
        q.append(dict(id="ing_" + iid, cat="ing", spec="ing", size=[32, 32],
                      subject=AP.ING[iid] + (", " + hint if hint else ""), seed=2100 + len(q)))

    for row in read_csv("Food.csv"):
        fid = row["food_id"]
        if fid not in AP.FOOD:
            log("WARN 缺少提示词: food %s" % fid)
            continue
        big = fid in AP.FOOD_64
        q.append(dict(id="food_" + fid.removeprefix("f_"), cat="food",
                      spec="food_l" if big else "food_s", size=[64, 64] if big else [48, 48],
                      subject=AP.FOOD[fid], seed=2200 + len(q)))

    for row in read_csv("Utensil.csv"):
        uid = row["utensil_id"]
        if uid not in AP.UTENSIL:
            log("WARN 缺少提示词: utensil %s" % uid)
            continue
        big = uid in AP.UTENSIL_96
        q.append(dict(id="utensil_" + uid, cat="utensil", spec="utensil_l" if big else "utensil",
                      size=[96, 96] if big else [64, 64], subject=AP.UTENSIL[uid], seed=2300 + len(q)))

    # 角色：同一角色的所有动作归到同一 char_id，拼版时成组生成（保证帧间一致）
    for cid, subj in AP.CUSTOMER.items():
        for st_name, st_txt in AP.CUSTOMER_STATE.items():
            q.append(dict(id="chr_customer_%s_%s" % (cid, st_name), cat="char", spec="char",
                          char_id="customer_" + cid, base=subj, pose=st_txt,
                          size=[48, 64], subject="%s, %s" % (subj, st_txt), seed=2400 + len(q)))
    for pose, pose_txt in AP.PLAYER_POSE.items():
        q.append(dict(id="chr_player_%s" % pose, cat="char", spec="char",
                      char_id="player", base=AP.PLAYER, pose=pose_txt,
                      size=[64, 80], grid=(64, 80), subject="%s, %s" % (AP.PLAYER, pose_txt),
                      seed=2500 + len(q)))
    for sid, subj in AP.SPECIAL.items():
        for mood in ("happy", "normal", "unhappy"):
            q.append(dict(id="chr_special_%s_%s" % (sid, mood), cat="char", spec="special",
                          char_id="special_" + sid, base=subj,
                          pose="%s expression, half-body" % mood,
                          size=[160, 160], subject="%s, %s expression" % (subj, mood),
                          seed=2600 + len(q)))

    for scene_id, layers in AP.SCENE.items():
        for layer in ("far", "mid", "ground", "near", "light"):
            q.append(dict(id="scene_%s_%s" % (scene_id, layer), cat="scene", spec="scene",
                          size=[960, 540], subject=layers[layer], mode="frame",
                          grid=(480, 270), seed=2700 + len(q)))
    return q


def _group_key(it: dict) -> tuple:
    if it["cat"] == "char":
        return ("char", it["char_id"])
    return (it["cat"], it["spec"], it.get("grid") or tuple(it["size"]))


def plan_sheets(queue: list[dict], sheet: str) -> list[list[dict]]:
    """分组：角色按角色分组（多动作同版），其余按类别+规格分组。"""
    if sheet == "off":
        return [[it] for it in queue]

    groups: dict[tuple, list[dict]] = {}
    order: list[tuple] = []
    for it in queue:
        key = _group_key(it)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(it)

    cap = {"2x2": 4, "3x3": 9, "4x4": 16}.get(sheet)
    out: list[list[dict]] = []
    for key in order:
        items = groups[key]
        if cap:
            for i in range(0, len(items), cap):
                out.append(items[i:i + cap])
            continue
        if key[0] == "char":
            out.append(items)                       # 一个角色一张图（默认 ≤5 个动作）
            continue
        n = SPEC[key[1]]["cols"] * SPEC[key[1]]["rows"]
        for i in range(0, len(items), n):
            out.append(items[i:i + n])
    return out


def sheet_layout(items: list[dict], sheet: str) -> tuple[int, int]:
    """返回拼版列数与行数。角色按动作数选最少空格的布局。"""
    n = len(items)
    if n == 1:
        return 1, 1
    if sheet in ("2x2", "3x3", "4x4"):
        return {"2x2": (2, 2), "3x3": (3, 3), "4x4": (4, 4)}[sheet]
    if items[0]["cat"] == "char":
        return CHAR_LAYOUT.get(min(n, 9), (3, 3))
    spec = SPEC[items[0]["spec"]]
    cols, rows = spec["cols"], spec["rows"]
    while cols * rows < n:
        if cols <= rows:
            cols += 1
        else:
            rows += 1
    # 尽量贴近正方，避免空格过多
    while (cols - 1) * rows >= n and cols > 1:
        cols -= 1
    return cols, rows


def gen_canvas(items: list[dict], cols: int, rows: int) -> tuple[int, int]:
    if len(items) == 1:
        it = items[0]
        spec = SPEC[it["spec"]]
        grid = it.get("grid") or tuple(it["size"])
        ss = int(it.get("supersample", spec.get("supersample", 2)))
        long_side = spec["cell"] if spec["cell"] >= 1024 else 1024
        return G.gen_size((grid[0] * ss, grid[1] * ss), long_side=long_side)
    spec = SPEC[items[0]["spec"]]
    cell = spec["cell"]
    if items[0]["cat"] == "char":
        cell = 512 if max(cols, rows) <= 2 else 384
    return cols * cell, rows * cell


# ---------------------------------------------------------------- 提示词


def build_sheet_prompt(items: list[dict], cols: int, rows: int) -> str:
    cells = cols * rows
    if items[0]["cat"] == "char":
        base = items[0].get("base", items[0]["subject"])
        poses = "; ".join("cell %d %s" % (i + 1, it["pose"]) for i, it in enumerate(items))
        txt = CHAR_STYLE.format(n=len(items), cols=cols, rows=rows, base=base, poses=poses)
    else:
        body = "; ".join("cell %d %s" % (i + 1, it["subject"]) for i, it in enumerate(items))
        txt = SHEET_STYLE.format(n=len(items), cols=cols, rows=rows) + " ; " + body
    if len(items) < cells:
        txt += "; the remaining %d cell(s) stay empty flat magenta" % (cells - len(items))
    return txt


# ---------------------------------------------------------------- 内容分割


def _components(mask: np.ndarray, min_area: float) -> list[dict]:
    try:
        from scipy import ndimage
        lab, n = ndimage.label(mask)
        if n == 0:
            return []
        out = []
        for i in range(1, n + 1):
            sel = lab == i
            area = int(sel.sum())
            if area < min_area:
                continue
            ys, xs = np.where(sel)
            out.append(dict(bbox=(int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
                            cx=float(xs.mean()), cy=float(ys.mean()), area=area))
        return out
    except ImportError:                                   # 无 scipy 时的兜底
        from collections import deque
        h, w = mask.shape
        seen = np.zeros((h, w), bool)
        out = []
        for y0 in range(h):
            for x0 in range(w):
                if not mask[y0, x0] or seen[y0, x0]:
                    continue
                q = deque([(y0, x0)])
                seen[y0, x0] = True
                ys, xs = [], []
                while q:
                    y, x = q.popleft()
                    ys.append(y); xs.append(x)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                if len(xs) < min_area:
                    continue
                out.append(dict(bbox=(min(xs), min(ys), max(xs), max(ys)),
                                cx=float(sum(xs) / len(xs)), cy=float(sum(ys) / len(ys)), area=len(xs)))
        return out


def split_by_content(src: np.ndarray, n: int, pad: int = 3, tol: float = 62.0) -> list[dict]:
    """按物件实际位置切分拼图（不假设均匀网格）。"""
    alpha = G.chroma_alpha(src, tol=tol)[..., 3] > 0
    if not alpha.any():
        raise LayoutMismatch("整张图抠底后为空")
    total = int(alpha.sum())
    blobs = _components(alpha, max(48.0, total / max(1, n) * 0.18))
    if not blobs:
        raise LayoutMismatch("未检测到任何物件")
    # 去掉明显过小的碎片
    med = float(np.median([b["area"] for b in blobs]))
    blobs = [b for b in blobs if b["area"] >= med * 0.25]
    if len(blobs) != n:
        raise LayoutMismatch("物件数 %d != 期望 %d（可能出现粘连、缺失或多余物件）" % (len(blobs), n))

    # 行优先排序：先按 y 聚类成行，再按 x 排序
    heights = [b["bbox"][3] - b["bbox"][1] + 1 for b in blobs]
    mh = float(np.median(heights)) or 1.0
    blobs.sort(key=lambda b: b["cy"])
    rows, cur = [], [blobs[0]]
    for b in blobs[1:]:
        if b["cy"] - cur[0]["cy"] > 0.65 * mh:
            rows.append(cur); cur = [b]
        else:
            cur.append(b)
    rows.append(cur)
    ordered = []
    for r in rows:
        ordered += sorted(r, key=lambda b: b["cx"])
    if len(ordered) != n:
        raise LayoutMismatch("排序后数量异常")

    h, w = src.shape[:2]
    cells = []
    for b in ordered:
        x0, y0, x1, y1 = b["bbox"]
        px0, py0 = max(0, x0 - pad), max(0, y0 - pad)
        px1, py1 = min(w - 1, x1 + pad), min(h - 1, y1 + pad)
        cells.append(dict(rgb=src[py0:py1 + 1, px0:px1 + 1],
                          bbox=[px0, py0, px1, py1],
                          edge=bool(x0 <= 0 or y0 <= 0 or x1 >= w - 1 or y1 >= h - 1)))
    return cells


# ---------------------------------------------------------------- 单格处理


def fit_grid(arr: np.ndarray, gw: int, gh: int) -> np.ndarray:
    """把锁格结果补齐/裁到精确 gw×gh（纯复制，不重采样）。"""
    h, w = arr.shape[:2]
    if w >= gw and h >= gh:
        x0, y0 = (w - gw) // 2, (h - gh) // 2
        return arr[y0:y0 + gh, x0:x0 + gw]
    pad = np.empty((gh, gw) + arr.shape[2:], arr.dtype)
    pad[:, :] = arr[0, 0]
    ph, pw = min(h, gh), min(w, gw)
    pad[:ph, :pw] = arr[:ph, :pw]
    if pw < gw:
        pad[:ph, pw:] = arr[:ph, pw - 1:pw]
    if ph < gh:
        pad[ph:, :] = pad[ph - 1:ph, :]
    return pad


def pad_to_aspect(cell: np.ndarray, tw: int, th: int) -> np.ndarray:
    """用品红把裁切块补到目标宽高比，避免锁格时被拉伸。"""
    h, w = cell.shape[:2]
    target = tw / float(th)
    cur = w / float(h)
    key = np.array(G._corner_key(cell), np.uint8)
    if abs(cur - target) < 1e-3:
        return cell
    if cur > target:                       # 太宽 -> 补上下
        nh = max(h, int(round(w / target)))
        out = np.empty((nh, w, 3), np.uint8)
        out[:, :] = key
        off = (nh - h) // 2
        out[off:off + h] = cell
        return out
    nw = max(w, int(round(h * target)))    # 太高 -> 补左右
    out = np.empty((h, nw, 3), np.uint8)
    out[:, :] = key
    off = (nw - w) // 2
    out[:, off:off + w] = cell
    return out


def process_cell(cell_rgb: np.ndarray, item: dict, colors: int, outline: bool,
                 margin: float, edge: bool = False) -> tuple[np.ndarray, dict]:
    spec = SPEC[item["spec"]]
    grid = item.get("grid") or tuple(item["size"])
    ss = int(item.get("supersample", spec.get("supersample", 2)))
    gw, gh = grid
    tw, th = item["size"]

    work = cell_rgb if item.get("mode") == "frame" else pad_to_aspect(cell_rgb, gw, gh)
    locked = fit_grid(G.lock_grid(work, (gw * ss, gh * ss), method="median"), gw * ss, gh * ss)
    if ss > 1:
        locked = locked[::ss, ::ss]

    if item.get("mode") == "frame":
        f = tw // locked.shape[1]
        if f != th // locked.shape[0] or f < 1:
            raise RuntimeError("frame 模式要求目标尺寸是网格整数倍: %s vs %s" % ((tw, th), locked.shape))
        big = np.repeat(np.repeat(locked, f, axis=0), f, axis=1)
        rgba = np.dstack([big, np.full(big.shape[:2], 255, np.uint8)])
        return G.quantize(rgba, max(colors, 24)), {"coverage": 1.0, "bleed": 0.0, "upscale": f}

    rgba = G.chroma_alpha(locked)
    cov0 = float((rgba[..., 3] > 0).mean())
    if cov0 < 0.05:
        raise RuntimeError("抠底后几乎全透明，原图可能没有纯色背景（cov=%.3f）" % cov0)
    if outline:
        rgba = G.add_outline(rgba, G.INK, 1)
    rgba = G.fit_canvas(rgba, (tw, th), margin)
    rgba = G.quantize(rgba, colors)
    # 按内容裁切后，bbox 必然贴着主体，不能用"边缘不透明"判切断；
    # 真正的切断风险 = 物件贴到了整张拼图的边框（edge）。
    return rgba, {"coverage": round(float((rgba[..., 3] > 0).mean()), 3),
                  "bleed": 0.05 if edge else 0.0}


# ---------------------------------------------------------------- 出图执行


def store(item: dict, rgba: np.ndarray, rec: dict, qc: dict, st: dict) -> str:
    out_path = OUT / item["cat"] / (item["id"] + ".png")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(out_path, optimize=True)
    issues = []
    if qc.get("coverage", 1.0) < 0.12:
        issues.append("empty")
    elif qc.get("coverage", 0.0) > 0.88:
        issues.append("overflow")
    if qc.get("bleed", 0.0) > 0.02:
        issues.append("cut-off")
    rec.update(status="suspect" if issues else "ok", file=str(out_path.relative_to(PROJECT)),
               size=list(item["size"]), qc=qc, issues=issues,
               ts=datetime.now().isoformat(timespec="seconds"))
    return str(out_path.relative_to(PROJECT))


def run_sheet(items: list[dict], sheet: str, args, st: dict) -> bool:
    cols, rows = sheet_layout(items, sheet)
    gw, gh = gen_canvas(items, cols, rows)
    prompt = build_sheet_prompt(items, cols, rows)
    if args.dry:
        log("DRY sheet %dx%d %s | %s" % (gw, gh, [i["id"] for i in items], prompt[:110]))
        return True

    seed = int(items[0].get("seed", 1000))
    t0 = time.time()
    raw = G.comfy_txt2img(prompt, seed, gw, gh, prefix="ai_raw/sheet_%d" % int(t0))
    backup = archive(raw, "sheet_%dx%d_%s" % (cols, rows, items[0]["id"]))
    src = np.array(Image.open(raw).convert("RGB"))
    log("sheet %dx%d / %d 项 -> %s  生成 %.0fs  备份 %s" % (cols, rows, len(items), raw.name,
                                                          time.time() - t0, backup or "(失败)"))

    try:
        cells = split_by_content(src, len(items), pad=3)
    except LayoutMismatch as e:
        log("  ! 分割失败（%s），改用单张重出这 %d 项" % (e, len(items)))
        for it in items:
            rec = st["items"].setdefault(it["id"], {"attempts": 0})
            rec.update(status="pending", note="sheet-layout-mismatch: %s" % e,
                       last_sheet=raw.name, ts=datetime.now().isoformat(timespec="seconds"))
        save_state(st)
        for it in items:                                 # 同一次运行内直接降级
            if st["items"][it["id"]].get("attempts", 0) < 3:
                run_single(it, args, st)
        return False

    for idx, (item, cell) in enumerate(zip(items, cells)):
        rec = st["items"].setdefault(item["id"], {"attempts": 0})
        rec["attempts"] += 1
        rec["cell_bbox"] = cell["bbox"]
        rec["raw_cell"] = archive_cell(cell["rgb"], item["id"], idx)
        try:
            rgba, qc = process_cell(cell["rgb"], item, args.colors, not args.no_outline,
                                     args.margin, edge=cell["edge"])
            store(item, rgba, rec, qc, st)
            rec.update(seed=seed, sheet=raw.name, raw_backup=backup, cell=idx + 1)
            if rec["issues"]:
                log("  ~ %-30s %s %s" % (item["id"], qc, ",".join(rec["issues"])))
                if args.strict:
                    rec["status"] = "failed"
        except Exception as e:
            rec.update(status="failed", err="%s: %s" % (type(e).__name__, e),
                       ts=datetime.now().isoformat(timespec="seconds"))
            log("  ! %-30s %s" % (item["id"], e))
        save_state(st)
    return True


def run_single(item: dict, args, st: dict) -> None:
    rec = st["items"].setdefault(item["id"], {"attempts": 0})
    rec["attempts"] += 1
    spec = SPEC[item["spec"]]
    grid = item.get("grid") or tuple(item["size"])
    ss = int(item.get("supersample", spec.get("supersample", 2)))
    long_side = spec["cell"] if spec["cell"] >= 1024 else 1024
    gw, gh = G.gen_size((grid[0] * ss, grid[1] * ss), long_side=long_side)

    if item.get("mode") == "frame":
        prompt = FRAME_STYLE.format(subject=item["subject"])
    else:
        prompt = G.STYLE.format(subject=item["subject"], pose=item.get("pose", G.DEFAULT_POSE))
    if args.dry:
        log("DRY single %s %dx%d" % (item["id"], gw, gh))
        return

    t0 = time.time()
    raw = G.comfy_txt2img(prompt, int(item.get("seed", 1000)), gw, gh, prefix="ai_raw/" + item["id"])
    backup = archive(raw, "single_" + item["id"])
    src = np.array(Image.open(raw).convert("RGB"))
    rec["raw_cell"] = archive_cell(src, item["id"], 0)
    try:
        rgba, qc = process_cell(src, item, args.colors, not args.no_outline, args.margin)
        store(item, rgba, rec, qc, st)
        rec.update(seed=item.get("seed"), sheet=raw.name, raw_backup=backup)
        log("  + %-30s %dx%d cov=%.2f %.0fs" % (item["id"], item["size"][0], item["size"][1],
                                               qc["coverage"], time.time() - t0))
    except Exception as e:
        rec.update(status="failed", err="%s: %s" % (type(e).__name__, e),
                   ts=datetime.now().isoformat(timespec="seconds"))
        log("  ! %-30s %s" % (item["id"], e))
    save_state(st)


# ---------------------------------------------------------------- 汇总


def refresh_overviews() -> None:
    st = load_state()
    by_cat: dict[str, list[dict]] = {}
    for iid, rec in st["items"].items():
        if rec.get("status") in ("ok", "suspect") and rec.get("file"):
            by_cat.setdefault(iid.split("_", 1)[0], []).append({"id": iid, "file": rec["file"]})
    for cat, ents in by_cat.items():
        try:
            G.contact_sheet(ents, OUT / "overview" / (cat + "_overview.png"))
            G.thumb_page([PROJECT / e["file"] for e in ents], OUT / "overview" / (cat + "_preview.png"))
            log("overview %s (%d)" % (cat, len(ents)))
        except Exception as e:
            log("overview %s 失败: %s" % (cat, e))


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--categories", default="", help="ing,food,utensil,char,scene")
    ap.add_argument("--only", default="")
    ap.add_argument("--sheet", default="auto", choices=["auto", "off", "2x2", "3x3", "4x4"])
    ap.add_argument("--max", type=int, default=0, help="本次最多处理的素材数")
    ap.add_argument("--max-gen", type=int, default=0, help="本次最多发起多少次生成")
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--regen", action="store_true")
    ap.add_argument("--colors", type=int, default=20)
    ap.add_argument("--margin", type=float, default=0.08)
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--no-outline", action="store_true")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--no-overview", action="store_true")
    args = ap.parse_args()

    queue = build_queue()
    if args.categories:
        keep = {c.strip() for c in args.categories.split(",")}
        queue = [q for q in queue if q["cat"] in keep]
    if args.only:
        keep = {s.strip() for s in args.only.split(",")}
        queue = [q for q in queue if q["id"] in keep]

    st = load_state()
    if args.retry_failed:
        for rec in st["items"].values():
            if rec.get("status") == "failed":
                rec["status"] = "pending"
    if args.regen:
        for it in queue:
            st["items"].pop(it["id"], None)

    todo = [q for q in queue
            if st["items"].get(q["id"], {}).get("status") != "ok"
            and st["items"].get(q["id"], {}).get("attempts", 0) < 4]
    if args.max:
        todo = todo[: args.max]
    sheets = plan_sheets(todo, args.sheet)

    if args.plan or args.dry:
        n_items = sum(len(s) for s in sheets)
        est = n_items * 0.9 + len(sheets) * 36
        log("队列: 待生成 %d 项 / 本次 %d 张图，预计 %.0f 分钟" % (n_items, len(sheets), est / 60))
        per_cat: dict[str, int] = {}
        for it in todo:
            per_cat[it["cat"]] = per_cat.get(it["cat"], 0) + 1
        log("分类: %s" % per_cat)
        if args.dry:
            for s in sheets[:6]:
                c, r = sheet_layout(s, args.sheet)
                log("  批次 %d 项 %dx%d: %s" % (len(s), c, r, [i["id"] for i in s][:6]))
        return 0

    try:
        import urllib.request
        with urllib.request.urlopen(G.HOST + "/system_stats", timeout=10) as r:
            stats = json.loads(r.read())
        log("ComfyUI 就绪 %s | VRAM free %.1fGB" % (stats["system"]["comfyui_version"],
                                                    stats["devices"][0]["vram_free"] / 1024 ** 3))
    except Exception as e:
        log("ComfyUI 未启动（%s），请先运行 D:\\QwenImage\\start_comfyui.bat" % e)
        return 2

    st["runs"] = st.get("runs", 0) + 1
    save_state(st)
    t_start, gens = time.time(), 0
    try:
        for sheet_items in sheets:
            if args.max_gen and gens >= args.max_gen:
                log("达到 --max-gen=%d，本次收工（进度已保存）" % args.max_gen)
                break
            if len(sheet_items) == 1:
                run_single(sheet_items[0], args, st)
            else:
                run_sheet(sheet_items, args.sheet, args, st)
            gens += 1
            done = sum(1 for r in st["items"].values() if r.get("status") == "ok")
            eta = (time.time() - t_start) / max(1, gens) * (len(sheets) - gens) / 60
            log("进度 %d 完成 | 剩余约 %.0f 分钟" % (done, eta))
    except KeyboardInterrupt:
        log("已中断，进度已保存；下次运行自动续跑")

    if not args.no_overview:
        refresh_overviews()
    ok = sum(1 for r in st["items"].values() if r.get("status") == "ok")
    sus = sum(1 for r in st["items"].values() if r.get("status") == "suspect")
    bad = [k for k, r in st["items"].items() if r.get("status") == "failed"]
    log("本次结束：完成 %d / 可疑 %d / 失败 %d" % (ok, sus, len(bad)))
    if bad:
        log("失败列表: %s" % ", ".join(bad[:20]))
    log("原图备份目录: %s" % RAW.relative_to(PROJECT))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
