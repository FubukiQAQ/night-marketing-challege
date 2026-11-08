// render.js — 出摊场景（HD 素材，逻辑分辨率 960×540）
import { draw, sceneDraw, customerTypes, ASSETS } from './sprites.js';

const W = 960, H = 540;

/** 版面常量：HD 场景图层里摊位/台面/地面的大致位置。
 *  这些数是按 scene_night_near.png 的亮度分布估的，肉眼校对后改这里即可。 */
export const LAYOUT = {
  // 场景实测锚点（tools/analyze_layout.py）：台面边缘 y≈313，地面 y≈465，暖光中心 x≈450
  // 人物放大 3x（48×64 → 144×192）后重排：厨具占左中，顾客占右侧，互不重叠
  counterY: 344,      // 台面基线（厨具底边）
  utensil: 120,       // 厨具绘制尺寸（源图 64 → 约 1.9x，与人物比例协调）
  utensilX0: 48,      // 第一件厨具 x
  utensilStep: 130,   // 厨具间距
  utensilMax: 4,      // 台面上最多同时画 4 件（再多画会挤到顾客区）
  groundY: 506,       // 顾客脚底线
  customerW: 144,     // 顾客 48×64 → 3x
  customerH: 192,
  queueX0: 566,       // 队列起始 x
  queueStep: 116,     // 队列间距（略小于人物宽度，形成自然的拥挤感）
  maxQueue: 3,        // 同屏最多 3 位（再多会越界）
};


/** 程序化径向光晕（HD 素材包里没有 fx/ 图层） */
function glow(ctx, cx, cy, r, rgb, alpha) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(' + rgb + ',' + (alpha).toFixed(3) + ')');
  g.addColorStop(0.45, 'rgba(' + rgb + ',' + (alpha * 0.45).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

const SPECIAL_LABEL = {
  blogger: '探店博主', critic: '美食评论家', eater: '大胃王',
  foodie: '老饕', gold_courier: '金主代跑',
};

let TYPES = null;
let t = 0;

export function resetScene() { t = 0; }

function sceneKey(name) {
  return 'scene/scene_' + name + '.png';
}

export function renderSell(ctx, G, dt) {
  t += dt;
  if (!TYPES) TYPES = customerTypes();
  const s = G.s;
  const S = s.sell;

  ctx.clearRect(0, 0, W, H);

  // ---------- 场景分层：远 / 中 / 地面 / 近 / 灯
  sceneDraw(ctx, 'scene_night_far', 0, 0, W, H)
    || (ctx.fillStyle = '#0a0e14', ctx.fillRect(0, 0, W, H));
  sceneDraw(ctx, 'scene_night_mid', 0, 0, W, H);
  sceneDraw(ctx, 'scene_night_ground', 0, 0, W, H);
  sceneDraw(ctx, 'scene_night_near', 0, 0, W, H);

  // ---------- 厨具
  const uids = s.utensils.slice(0, LAYOUT.utensilMax);
  uids.forEach((uid, i) => {
    const busy = S && S.jobs[uid] && S.jobs[uid].length > 0;
    const x = LAYOUT.utensilX0 + i * LAYOUT.utensilStep;
    const size = LAYOUT.utensil;
    const y = LAYOUT.counterY - size;
    // 忙碌时热光
    if (busy) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + size / 2, y + size * 0.55, size * 0.95, '255,175,90', 0.28);
      ctx.restore();
    }
    const spr = 'utensil/utensil_' + uid + '.png';
    draw(ctx, spr, x, y, size, size);
    if (busy) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 6 + i);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + size / 2, y + size * 0.5, size * 0.6, '255,220,150', 0.10 + pulse * 0.10);
      ctx.restore();
    }
  });

  // ---------- 顾客队列
  if (S) {
    const list = S.customers.slice(0, LAYOUT.maxQueue);
    list.forEach((c, i) => {
      const type = TYPES && TYPES.length ? TYPES[(c.typeSeed || i) % TYPES.length] : 'student';
      const x = LAYOUT.queueX0 + i * LAYOUT.queueStep;
      const y = LAYOUT.groundY - LAYOUT.customerH;
      let state = 'wait';
      if (c.state === 'happy') state = 'happy';
      else if (c.state === 'browse') state = 'walk';
      else if (c.state === 'wait' && c.waited / Math.max(1, c.patience) > 0.6) state = 'urgent';

      if (c.special) {
        // ---------- 特殊顾客：160×160 立绘 + 金色光环 ----------
        const sw = 176, sh = 176;
        const sx = x + LAYOUT.customerW / 2 - sw / 2;
        const sy = LAYOUT.groundY - sh;
        const mood = c.mood || 'normal';
        // 光环（呼吸）
        const pulse = 0.55 + 0.45 * Math.sin(t * 3 + i);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, sx + sw / 2, sy + sh * 0.6, sw * 0.75,
          mood === 'unhappy' ? '200,90,90' : '255,210,120', 0.10 + pulse * 0.12);
        ctx.restore();
        draw(ctx, 'char/chr_special_' + c.special + '_' + mood + '.png', sx, sy, sw, sh);
        // 名字牌
        const label = SPECIAL_LABEL[c.special] || '';
        if (label) {
          ctx.font = 'bold 15px monospace';
          ctx.textAlign = 'center';
          const tw = ctx.measureText(label).width + 14;
          ctx.fillStyle = 'rgba(12,10,8,0.82)';
          ctx.fillRect(sx + sw / 2 - tw / 2, sy - 24, tw, 20);
          ctx.fillStyle = mood === 'unhappy' ? '#ff8f9f' : '#ffd24a';
          ctx.fillText(label, sx + sw / 2, sy - 9);
        }
      } else {
        draw(ctx, 'char/chr_customer_' + type + '_' + state + '.png',
          x, y, LAYOUT.customerW, LAYOUT.customerH);
      }

      // 需求气泡
      let mood = 'normal';
      if (state === 'happy') mood = 'happy';
      else if (state === 'urgent') mood = 'urgent';
      const bub = 'ico/tag_' + c.wantTag + '_' + (mood === 'happy' ? 'highlight' : mood === 'urgent' ? 'fragile' : 'normal') + '.png';
      draw(ctx, bub, x + LAYOUT.customerW / 2 - 32, y - 68, 64, 64);

      // 耐心条
      if (c.state === 'wait') {
        const ratio = 1 - c.waited / Math.max(1, c.patience);
        const bw = LAYOUT.customerW - 24;
        ctx.fillStyle = 'rgba(10,14,20,0.88)';
        ctx.fillRect(x + 12, y - 18, bw, 8);
        ctx.fillStyle = ratio > 0.4 ? '#ffc163' : '#ff5c7a';
        ctx.fillRect(x + 12, y - 18, Math.max(0, bw * ratio), 8);
      }
    });
  }

  // ---------- 飘字
  if (S) {
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    S.floaters = S.floaters.filter((f) => f.age < 1.6);
    S.floaters.forEach((f, i) => {
      f.age += dt;
      const p = f.age / 1.6;
      const x = 420 + ((i * 47) % 180) - 60;
      const y = 300 - p * 58 - (i % 3) * 8;
      ctx.globalAlpha = Math.max(0, 1 - p);
      if (f.kind === 'money') ctx.fillStyle = '#ffc93c';
      else if (f.kind === 'layer') ctx.fillStyle = '#ffc163';
      else if (f.kind === 'buy') ctx.fillStyle = '#6ee7a8';
      else if (f.kind === 'tier') ctx.fillStyle = '#ffe3b0';
      else ctx.fillStyle = '#ff5c7a';
      ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    });
  }

  // ---------- QTE 横幅
  if (S && S.banner) {
    const b = S.banner;
    const txt = b.text;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    const tw = Math.min(W - 80, ctx.measureText(txt).width + 36);
    const bx = (W - tw) / 2;
    const by = 34;
    ctx.fillStyle = b.kind === 'bad' ? 'rgba(70,16,22,0.88)' : 'rgba(52,38,10,0.88)';
    ctx.fillRect(bx, by, tw, 34);
    ctx.strokeStyle = b.kind === 'bad' ? '#ff5c7a' : '#ffc93c';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, tw - 2, 32);
    ctx.fillStyle = b.kind === 'bad' ? '#ffb3c0' : '#ffe08a';
    ctx.fillText(txt, W / 2, by + 23);
  }

  // ---------- 灯光层（加法叠加，压在所有东西上面）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  sceneDraw(ctx, 'scene_night_light', 0, 0, W, H);
  // 层数越高，整条街越亮
  const layersTotal = Object.values(s.layers || {}).reduce((a, b) => a + b, 0);
  const boost = Math.min(0.42, layersTotal / 420);
  if (boost > 0.01) {
    ctx.fillStyle = 'rgba(255, 205, 120, ' + (boost * 0.18).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

export const SCENE = { W, H };
