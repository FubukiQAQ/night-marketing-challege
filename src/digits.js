// digits.js —— 位图数字渲染
// 字形表实测：16 格 = 0 1 2 3 4 5 6 7 8 9 + - ¥ : / %
// 格宽 = 图集宽 / 16（约 size×0.875），不是 size 本身
// 图集真实像素尺寸从 atlas.json 取，绝不写死（v0.6 写死 1024×1024 导致全崩）
import { ASSETS } from './sprites.js';

const GLYPHS = '0123456789+-¥:/%';
const IDX = {};
for (let i = 0; i < GLYPHS.length; i++) IDX[GLYPHS[i]] = i;

const COLS = 16;
let CACHE = null;

/** 从 atlas 里取 4 档数字的几何信息（只算一次） */
function geo() {
  if (CACHE) return CACHE;
  const out = {};
  const frames = (ASSETS && ASSETS.frames) || {};
  for (const size of [16, 24, 32, 48]) {
    const f = frames['ui/ui_digits_' + size + '.png'];
    if (!f) continue;
    out[size] = {
      png: f.png,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      cell: f.w / COLS,   // 实测 14 / 21 / 28 / 42
    };
  }
  CACHE = out;
  return out;
}

/** 图集 png 的真实像素尺寸，用于 background-size */
function pngSize(png) {
  const im = (ASSETS && ASSETS.imgs) ? ASSETS.imgs[png] : null;
  if (!im) return null;
  return { w: im.width, h: im.height };
}

/** 去掉千分位逗号，但保留 ¥ + - : / % 这些图集里有的字符 */
function clean(value) {
  return String(value).replace(/,/g, '');
}

/**
 * 渲染一串位图数字
 * @param {string|number} value
 * @param {object} opt {size:16|24|32|48, scale:number, prefix:string, suffix:string}
 */
export function digits(value, opt) {
  const o = opt || {};
  const size = o.size || 24;
  const scale = o.scale || 1;
  const g = geo();
  const a = g[size] || g[24];
  if (!a) return '<span class="dg-fallback">' + value + '</span>';
  const ps = pngSize(a.png);
  if (!ps) return '<span class="dg-fallback">' + value + '</span>';

  const text = clean(value);
  const cw = a.cell * scale;
  const parts = [];
  for (const ch of text) {
    if (!(ch in IDX)) continue;          // 图集里没有的字符直接跳过
    const bgX = -(a.x + IDX[ch] * a.cell) * scale;
    const bgY = -a.y * scale;
    parts.push(
      '<span class="dg" style="' +
      'width:' + cw + 'px;height:' + a.h * scale + 'px;' +
      'background-image:url(' + a.png + ');' +
      'background-position:' + bgX + 'px ' + bgY + 'px;' +
      'background-size:' + (ps.w * scale) + 'px ' + (ps.h * scale) + 'px;' +
      '"></span>'
    );
  }
  const pre = o.prefix ? '<span class="dg-t">' + o.prefix + '</span>' : '';
  const suf = o.suffix ? '<span class="dg-t">' + o.suffix + '</span>' : '';
  return '<span class="dgrow">' + pre + parts.join('') + suf + '</span>';
}

/** 千分位（会插入逗号，digits() 内部会去掉）。保留负号：图集里有 '-' 字形 */
export function num(n) {
  return Math.round(n).toLocaleString('en-US');
}
