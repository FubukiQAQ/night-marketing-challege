// render.js — 出摊场景（HD 素材，逻辑分辨率 960×540）
import { draw, sceneDraw, customerTypes, ASSETS } from './sprites.js';

const W = 960, H = 540;

/** 版面常量：HD 场景图层里摊位/台面/地面的大致位置。
 *  这些数是按 scene_night_near.png 的亮度分布估的，肉眼校对后改这里即可。 */
export const LAYOUT = {
  // 以下数值由 tools/analyze_layout.py 从 scene_night_*.png 合成图实测得出：
  //   y=313 是台面最强水平边缘，暖光中心 x≈450，地面边缘 y≈465
  counterY: 313,      // 台面基线（厨具底边）
  utensil: 72,        // 厨具绘制尺寸（源图 64，放大到 72 更醒目）
  utensilX0: 258,     // 第一件厨具 x（5 件居中于 x=450）
  utensilStep: 78,    // 厨具间距
  bulletY: 150,       // 灯串 y
  bulletX0: 258,
  bulletStep: 26,
  groundY: 465,       // 顾客脚底线
  customerW: 48,
  customerH: 64,
  queueX0: 648,       // 队列起始 x（右侧暖光边缘内）
  queueStep: 68,
  maxQueue: 4,
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
  const uids = s.utensils.slice(0, 5);
  uids.forEach((uid, i) => {
    const busy = S && S.jobs[uid] && S.jobs[uid].length > 0;
    const x = LAYOUT.utensilX0 + i * LAYOUT.utensilStep;
    const size = LAYOUT.utensil;
    const y = LAYOUT.counterY - size + 8;
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
      draw(ctx, 'char/chr_customer_' + type + '_' + state + '.png',
        x, y, LAYOUT.customerW, LAYOUT.customerH);

      // 需求气泡
      let mood = 'normal';
      if (state === 'happy') mood = 'happy';
      else if (state === 'urgent') mood = 'urgent';
      const bub = 'ico/tag_' + c.wantTag + '_' + (mood === 'happy' ? 'highlight' : mood === 'urgent' ? 'fragile' : 'normal') + '.png';
      draw(ctx, bub, x + 8, y - 34, 32, 32);

      // 耐心条
      if (c.state === 'wait') {
        const ratio = 1 - c.waited / Math.max(1, c.patience);
        ctx.fillStyle = 'rgba(10,14,20,0.85)';
        ctx.fillRect(x + 6, y - 12, 36, 5);
        ctx.fillStyle = ratio > 0.4 ? '#ffc163' : '#ff5c7a';
        ctx.fillRect(x + 6, y - 12, Math.max(0, 36 * ratio), 5);
      }
    });
  }

  // ---------- 飘字
  if (S) {
    ctx.font = 'bold 16px monospace';
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
