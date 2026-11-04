"""HD pixel-art pipeline (Qwen-Image-2.1-Turbo NVFP4 + perfectPixel).

pipeline: prompt -> ComfyUI generation -> perfectPixel grid lock (output is already
          target-size pure pixel art) -> chroma key / outline / palette clamp
          -> PNG-32 export + preview pages + overview sheets + manifest

run with the ComfyUI venv:
    python tools/artgen.py --config tools/artgen_sample.json [--only id1,id2] [--dry]
"""
from __future__ import annotations

import argparse, json, math, sys, time, urllib.request, uuid
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HOST = "http://127.0.0.1:8188"
COMFY_OUT = Path(r"D:\QwenImage\ComfyUI\output")
PROJECT = Path(r"D:\02web\1zone")

UNET = "qwen-image-2.1-turbo-NVFP4.safetensors"
TE = "qwen3vl_8b_int8_convrot.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"
SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0"

# night palette ink (spec 2.3 deepest dark)
INK = (0x08, 0x0C, 0x12)

# ---------------------------------------------------------------- ComfyUI


def _post(path, payload):
    req = urllib.request.Request(HOST + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def _get(path):
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return json.loads(r.read())


def comfy_txt2img(prompt: str, seed: int, w: int, h: int, prefix: str = "ai_raw") -> Path:
    graph = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": TE, "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": prompt, "negative_prompt": "", "resolution": 1024}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "6": {"class_type": "QwenImage21Cache", "inputs": {"model": ["1", 0], "device": "auto", "dtype": "default"}},
        "7": {"class_type": "CFGGuider",
              "inputs": {"model": ["6", 0], "positive": ["4", 0], "negative": ["4", 1], "cfg": 1.0}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed, "control_after_generate": "fixed"}},
        "10": {"class_type": "ManualSigmas", "inputs": {"sigmas": SIGMAS}},
        "11": {"class_type": "SamplerCustomAdvanced",
               "inputs": {"noise": ["9", 0], "guider": ["7", 0], "sampler": ["8", 0],
                          "sigmas": ["10", 0], "latent_image": ["5", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": prefix}},
    }
    pid = _post("/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(2)
        hist = _get("/history/%s" % pid)
        if pid in hist:
            st = hist[pid].get("status", {})
            if not st.get("completed"):
                raise RuntimeError("generation failed: %s" % (st.get("messages"),))
            img = hist[pid]["outputs"]["13"]["images"][0]
            return COMFY_OUT / img.get("subfolder", "") / img["filename"]
        if time.time() - t0 > 600:
            raise TimeoutError(pid)


# ---------------------------------------------------------------- perfectPixel


def lock_grid(rgb: np.ndarray, grid: tuple[int, int], method: str = "median") -> np.ndarray:
    """Align the image to a perfect pixel grid; returns a grid_w x grid_h pixel image."""
    from perfect_pixel import get_perfect_pixel
    gw, gh = grid
    w, h, out = get_perfect_pixel(rgb, sample_method=method, grid_size=(gw, gh),
                                  refine_intensity=0.25, fix_square=False)
    if w is None:
        raise RuntimeError("perfectPixel grid detection failed")
    return np.asarray(out)[:gh, :gw]


# ---------------------------------------------------------------- post process


def _corner_key(img: np.ndarray, k: int = 6) -> np.ndarray:
    patches = [img[:k, :k], img[:k, -k:], img[-k:, :k], img[-k:, -k:]]
    return np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0)


def chroma_alpha(img: np.ndarray, tol: float = 62.0) -> np.ndarray:
    """Flood-fill the background from the border using the corner key colour (hard alpha)."""
    h, w, _ = img.shape
    key = _corner_key(img)
    dist = np.sqrt(((img.astype(np.float32) - key) ** 2).sum(axis=2))
    bg = dist < tol
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    out = img.copy()
    spill = (~seen) & (dist < tol * 1.4)
    if spill.any():
        out[spill] = (out[spill].astype(np.float32) * 0.8 + key.astype(np.float32) * 0.2).astype(np.uint8)
    return np.dstack([out, alpha])


def add_outline(rgba: np.ndarray, col=INK, width: int = 1) -> np.ndarray:
    """1px dark contour outside the subject (spec 2.1)."""
    a = rgba[..., 3] > 0
    for _ in range(width):
        grow = a.copy()
        grow[1:, :] |= a[:-1, :]
        grow[:-1, :] |= a[1:, :]
        grow[:, 1:] |= a[:, :-1]
        grow[:, :-1] |= a[:, 1:]
        ring = grow & ~a
        rgba[ring, 0], rgba[ring, 1], rgba[ring, 2], rgba[ring, 3] = col[0], col[1], col[2], 255
        a = grow
    return rgba


def fit_canvas(rgba: np.ndarray, size: tuple[int, int], margin_ratio: float = 0.08) -> np.ndarray:
    """Crop to subject bbox, then integer-pixel centre it on the target canvas (never interpolate)."""
    tw, th = size
    a = rgba[..., 3] > 0
    if not a.any():
        return np.zeros((th, tw, 4), np.uint8)
    ys, xs = np.where(a)
    bbox = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    mx, my = int(tw * margin_ratio), int(th * margin_ratio)
    max_w, max_h = tw - 2 * mx, th - 2 * my
    bh, bw = bbox.shape[:2]
    if bw > max_w or bh > max_h:
        step = max(1, int(round(max(bw / max_w, bh / max_h))))
        bbox = bbox[::step, ::step]
        bh, bw = bbox.shape[:2]
    else:
        # integer nearest-neighbour magnification only (spec: no fractional scaling)
        while bw * 2 <= max_w and bh * 2 <= max_h:
            bbox = bbox.repeat(2, axis=0).repeat(2, axis=1)
            bh, bw = bbox.shape[:2]
    canvas = np.zeros((th, tw, 4), np.uint8)
    oy, ox = (th - bh) // 2, (tw - bw) // 2
    canvas[oy:oy + bh, ox:ox + bw] = bbox
    return canvas


def quantize(rgba: np.ndarray, colors: int) -> np.ndarray:
    """Dither-free palette clamp; transparency preserved."""
    a = rgba[..., 3]
    im = (Image.fromarray(rgba[..., :3]).convert("RGB")
          .quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
          .convert("RGB"))
    out = np.dstack([np.asarray(im), a])
    out[out[..., 3] == 0] = 0
    return out


# ---------------------------------------------------------------- pipeline

STYLE = ("high-detail pixel art game sprite, {subject}, {pose}, single object filling the frame, "
         "isolated on flat solid magenta background #FF00FF, chunky uniform square pixels aligned to a perfect grid, "
         "crisp hard pixel edges, thick 1px dark brown-black outline, hand-placed pixel shading with a clear core "
         "shadow, one midtone and one highlight band, warm amber key light from the upper left, muted grey-blue "
         "shadow on the lower right, restrained muted palette of about 14 colours, bold simple silhouette that stays "
         "readable at tiny size, no anti-aliasing, no gradient, no glow, no neon, no text, no watermark")

DEFAULT_POSE = "front three-quarter view, upright, centred"


def gen_size(grid: tuple[int, int], long_side: int = 1024) -> tuple[int, int]:
    """Match the generation aspect ratio to the target grid so the grid lock does not stretch."""
    gw, gh = grid
    if gw >= gh:
        return long_side, max(64, int(round(long_side * gh / gw / 64)) * 64)
    return max(64, int(round(long_side * gw / gh / 64)) * 64), long_side


def build_asset(item: dict, out_root: Path, method: str, colors: int,
                outline: bool, margin: float, supersample: int = 2) -> dict:
    prompt = STYLE.format(subject=item["subject"], pose=item.get("pose", DEFAULT_POSE))
    grid = tuple(item.get("grid") or item["size"])
    ss = max(1, int(item.get("supersample", supersample)))
    lock_pt = (grid[0] * ss, grid[1] * ss)
    gw, gh = gen_size(lock_pt)
    t0 = time.time()
    raw_path = comfy_txt2img(prompt, int(item.get("seed", 1000)), gw, gh, prefix="ai_raw/" + item["id"])
    t_gen = time.time() - t0

    src = np.array(Image.open(raw_path).convert("RGB"))
    locked = lock_grid(src, lock_pt, method=method)
    if ss > 1:                      # nearest decimation keeps hard pixel edges
        locked = locked[::ss, ::ss]

    rgba = chroma_alpha(locked)
    if outline:
        rgba = add_outline(rgba, INK, 1)
    rgba = fit_canvas(rgba, tuple(item["size"]), margin)
    rgba = quantize(rgba, colors)

    out_path = out_root / item["cat"] / (item["id"] + ".png")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(out_path, optimize=True)

    alpha = rgba[..., 3] > 0
    return {
        "id": item["id"], "cat": item["cat"], "file": str(out_path.relative_to(PROJECT)),
        "size": list(item["size"]), "grid": list(grid), "supersample": ss, "seed": item.get("seed"),
        "colors": colors, "coverage": round(float(alpha.mean()), 3),
        "gen_sec": round(t_gen, 1), "raw": raw_path.name,
    }


def thumb_page(paths: list[Path], out: Path) -> None:
    """Original + 24px + 16px nearest-neighbour preview page (spec 2.4)."""
    imgs = [Image.open(p).convert("RGBA") for p in paths]
    if not imgs:
        return
    cw = max(64, max(i.width for i in imgs) + 12)
    ch = max(64, max(i.height for i in imgs) + 12)
    scales = (1.0, 24 / 32, 16 / 32)
    cols = min(12, len(imgs))
    rows = math.ceil(len(imgs) / cols)
    page = Image.new("RGBA", (cols * (cw + 2) * len(scales) + 16, rows * (ch + 2) + 16), (20, 26, 37, 255))
    for idx, im in enumerate(imgs):
        cx = (idx % cols) * (cw + 2) + 8
        cy = (idx // cols) * (ch + 2) + 8
        for si, sc in enumerate(scales):
            tw, th = max(1, int(round(im.width * sc))), max(1, int(round(im.height * sc)))
            tile = Image.new("RGBA", (cw, ch), (14, 20, 32, 255))
            tile.alpha_composite(im.resize((tw, th), Image.NEAREST), ((cw - tw) // 2, (ch - th) // 2))
            page.alpha_composite(tile, (cx + si * (cw + 2), cy))
    out.parent.mkdir(parents=True, exist_ok=True)
    page.save(out)


def contact_sheet(entries: list[dict], out: Path, scale: int = 6, cols: int = 8) -> None:
    imgs = [(e, Image.open(PROJECT / e["file"]).convert("RGBA")) for e in entries]
    if not imgs:
        return
    cw = max(i.width for _, i in imgs) * scale + 18
    ch = max(i.height for _, i in imgs) * scale + 18
    rows = math.ceil(len(imgs) / cols)
    sheet = Image.new("RGBA", (cols * cw, rows * ch), (14, 20, 32, 255))
    for idx, (_e, im) in enumerate(imgs):
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        sheet.alpha_composite(big, ((idx % cols) * cw + (cw - big.width) // 2,
                                    (idx // cols) * ch + (ch - big.height) // 2))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", default="assets/art_hd")
    ap.add_argument("--only", default="")
    ap.add_argument("--method", default="median", choices=["center", "median", "majority"])
    ap.add_argument("--colors", type=int, default=20)
    ap.add_argument("--no-outline", action="store_true")
    ap.add_argument("--margin", type=float, default=0.08)
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    items = cfg["items"]
    if args.only:
        keep = {s.strip() for s in args.only.split(",")}
        items = [i for i in items if i["id"] in keep]
    out_root = PROJECT / args.out

    if args.dry:
        for i in items:
            print(i["id"], i["cat"], i["size"], "|", STYLE.format(subject=i["subject"])[:160])
        return 0

    manifest_path = out_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"assets": []}
    done = {a["id"] for a in manifest["assets"]}

    for item in items:
        if item["id"] in done:
            print("skip " + item["id"])
            continue
        try:
            rec = build_asset(item, out_root, args.method, args.colors, not args.no_outline, args.margin, args.supersample)
            manifest["assets"].append(rec)
            print("OK  %-28s %dx%d cov=%.2f gen=%ss" % (rec["id"], rec["size"][0], rec["size"][1],
                                                        rec["coverage"], rec["gen_sec"]))
        except Exception as e:
            print("ERR %s: %s: %s" % (item["id"], type(e).__name__, e))
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    by_cat = {}
    for a in manifest["assets"]:
        by_cat.setdefault(a["cat"], []).append(a)
    for cat, ents in by_cat.items():
        contact_sheet(ents, out_root / "overview" / (cat + "_overview.png"))
        thumb_page([PROJECT / e["file"] for e in ents], out_root / "overview" / (cat + "_preview.png"))
    print("manifest: %s | assets: %d" % (manifest_path, len(manifest["assets"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
