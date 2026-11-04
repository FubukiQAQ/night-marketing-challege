// sprites.js — 图集加载与绘制
export const ASSETS = { frames: {}, imgs: {}, scene: {}, ready: false };

export async function loadAssets() {
  const atlas = await (await fetch('src/data/atlas.json')).json();
  ASSETS.frames = atlas.frames;
  ASSETS.scene = atlas.scene;
  const pngs = [...new Set(Object.values(atlas.frames).map((f) => f.png))];
  await Promise.all(pngs.map((p) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { ASSETS.imgs[p] = im; res(); };
    im.onerror = () => res();
    im.src = p;
  })));
  await Promise.all(Object.entries(atlas.scene).map(([k, p]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { ASSETS.sceneImg = ASSETS.sceneImg || {}; ASSETS.sceneImg[k] = im; res(); };
    im.onerror = () => res();
    im.src = p;
  })));
  ASSETS.ready = true;
  return ASSETS;
}

export function frame(name) {
  return ASSETS.frames[name] || null;
}

export function draw(ctx, name, x, y, w, h, alpha = 1) {
  const f = ASSETS.frames[name];
  if (!f) return false;
  const im = ASSETS.imgs[f.png];
  if (!im) return false;
  const old = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(im, f.x, f.y, f.w, f.h, Math.round(x), Math.round(y),
    w || f.w, h || f.h);
  ctx.globalAlpha = old;
  return true;
}

export function sceneDraw(ctx, key, x, y, w, h) {
  const im = (ASSETS.sceneImg || {})[key];
  if (!im) return false;
  ctx.drawImage(im, x, y, w || im.width, h || im.height);
  return true;
}

// DOM 图标：用 background-position 裁切图集
export function icon(name, size = 16, scale = 1) {
  const f = ASSETS.frames[name];
  if (!f) return `<span class="spr" style="width:${size}px;height:${size}px"></span>`;
  const im = ASSETS.imgs[f.png];
  const iw = im ? im.width : 1024;
  const ih = im ? im.height : 1024;
  const s = size / Math.max(f.w, f.h);
  return `<span class="spr" style="width:${Math.round(f.w * s)}px;height:${Math.round(f.h * s)}px;` +
    `background-image:url(${f.png});background-position:${-Math.round(f.x * s)}px ${-Math.round(f.y * s)}px;` +
    `background-size:${Math.round(iw * s)}px ${Math.round(ih * s)}px;background-repeat:no-repeat"></span>`;
}

export function customerTypes() {
  const set = new Set();
  Object.keys(ASSETS.frames).forEach((k) => {
    const m = k.match(/chr_customer_(\w+?)_wait\.png$/);
    if (m) set.add(m[1]);
  });
  return [...set];
}
