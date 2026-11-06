// digits.js —— 位图数字渲染
// 关键：图集真实尺寸从 atlas.json 读，不写死（v0.6 就是写死成 1024×1024 导致全崩）
import { ASSETS } from './sprites.js';

const DIGIT_IDX = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  '+': 10, '-': 11, '/': 12, ':': 13,
};

let CACHE = null;

/** 从 atlas 里取 4 档数字的几何信息（只算一次） */
function geo() {
  if (CACHE) return CACHE;
  const out = {};
  const frames = (ASSETS && ASSETS.frames) || {};
  for (const size of [16, 24, 32, 48]) {
    const key = 'ui/ui_digits_' + size + '.png';
    const f = frames[key];
    if (!f) continue;
    out[size] = {
      png: f.png,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      cell: size,                       // 每格就是 size×size
      cols: Math.round(f.w / size),     // 一般是 14
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

/**
 * 渲染一串位图数字
 * @param {string|number} value 值
 * @param {object} opt {size:16|24|32|48, scale:number, prefix:'', suffix:''}
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

  const text = String(value);
  const parts = [];
  for (const ch of text) {
    if (!(ch in DIGIT_IDX)) {
      // 逗号、货币符号这类不支持的字符，直接跳过（不显示乱格）
      continue;
    }
    const idx = DIGIT_IDX[ch];
    const bgX = -(a.x + idx * a.cell) * scale;
    const bgY = -a.y * scale;
    parts.push(
      '<span class="dg" style="' +
      'width:' + a.cell * scale + 'px;height:' + a.h * scale + 'px;' +
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

/** 千分位 */
export function num(n) {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}
