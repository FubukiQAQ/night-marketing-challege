// render.js — 出摊场景（HD 素材，逻辑分辨率 960×540）
import { draw, sceneDraw, customerTypes, ASSETS } from './sprites.js';

const W = 960, H = 540;

/** 版面常量：HD 场景图层里摊位/台面/地面的大致位置。
 *  这些数是按 scene_night_near.png 的亮度分布估的，肉眼校对后改这里即可。 */
export const LAYOUT = {
  // 场景实测锚点（tools/analyze_layout.py）：台面边缘 y≈313，地面 y≈465
  // 人物 3x：48×64 → 144×192
  counterY: 344,
  utensil: 120,
  utensilX0: 48,
  utensilStep: 130,
  utensilMax: 4,
  groundY: 506,
  customerW: 144,
  customerH: 192,
  queueX0: 556,
  queueStep: 100,
  maxQueue: 6,
  // 摊主：站在台面后偏左，稍微遮挡厨具底部
  playerW: 128,
  playerH: 160,
  playerX: 96,
  playerY: 158,
  // 出餐动画
  flyFrames: 22,
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
let playerFrame = 'idle';
/** 飞行中的餐品：{sprite, x0,y0, x1,y1, age, tag} */
let flying = [];
let lastLayersBoost = 0;

export function resetScene() {
  t = 0;
  flying = [];
  playerFrame = 'idle';
  lastLayersBoost = 0;
}

/** 由 main 在每次成交时调用，播一段"菜飞过去" */
export function spawnFly(sprite, tag, fromIdx) {
  const ux = LAYOUT.utensilX0 + (fromIdx || 0) * LAYOUT.utensilStep;
  const idx = flying.length % LAYOUT.maxQueue;
  flying.push({
    sprite: sprite,
    tag: tag || 'fast',
    x0: ux + LAYOUT.utensil / 2,
    y0: LAYOUT.counterY - LAYOUT.utensil * 0.4,
    x1: LAYOUT.queueX0 + idx * LAYOUT.queueStep + LAYOUT.customerW / 2,
    y1: LAYOUT.groundY - LAYOUT.customerH * 0.55,
    age: 0,
  });
}

export function setPlayerFrame(f) { playerFrame = f; }

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

  // ---------- 摊主（站在台面后，先画，被厨具和前景遮住下半身）
  if (S) {
    const busy = Object.keys(S.jobs).some((k) => S.jobs[k] && S.jobs[k].length > 0);
    const frame = busy ? 'cook' : (playerFrame || 'idle');
    draw(ctx, 'char/chr_player_' + frame + '.png',
      LAYOUT.playerX, LAYOUT.playerY, LAYOUT.playerW, LAYOUT.playerH);
    // 摊主身上的一点暖光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, LAYOUT.playerX + LAYOUT.playerW / 2, LAYOUT.playerY + 40, 90, '255,190,120', 0.10);
    ctx.restore();
  }

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
      draw(ctx, 'char/chr_customer_' + type + '_' + state + '.png',
        x, y, LAYOUT.customerW, LAYOUT.customerH);

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

  // ---------- 出餐抛物线：餐品从厨具飞向顾客
  flying = flying.filter((f) => f.age < LAYOUT.flyFrames);
  flying.forEach((f) => {
    f.age += 1;
    const k = f.age / LAYOUT.flyFrames;
    const x = f.x0 + (f.x1 - f.x0) * k;
    // 抛物线：起点高、中途抬升、落点略高
    const arc = Math.sin(k * Math.PI) * 70;
    const y = f.y0 + (f.y1 - f.y0) * k - arc;
    const size = 52;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y + size / 2, 26, '255,220,150', 0.22 * (1 - k * 0.4));
    ctx.restore();
    draw(ctx, f.sprite, x - size / 2, y, size, size, 1 - k * 0.15);
    // 拖尾
    if (k < 0.7) {
      ctx.save();
      ctx.globalAlpha = 0.25 * (1 - k);
      draw(ctx, f.sprite, x - size * 0.9, y + 6, size * 0.5, size * 0.5);
      ctx.restore();
    }
  });

  // ---------- 灯光层（加法叠加，压在所有东西上面）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 层数分 3 档：灯层本身逐渐加亮，整条街跟着亮起来
  const layersTotal = Object.values(s.layers || {}).reduce((a, b) => a + b, 0);
  const tier = layersTotal >= 60 ? 3 : layersTotal >= 20 ? 2 : 1;
  const lightAlpha = [0, 0.55, 0.78, 1.0][tier];
  ctx.globalAlpha = lightAlpha;
  sceneDraw(ctx, 'scene_night_light', 0, 0, W, H);
  // 基础色温叠加（档位越高越暖越亮）
  const boost = [0, 0.05, 0.10, 0.16][tier];
  if (boost > 0) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 205, 120, ' + boost.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  // 平滑过渡（避免切档时突兀）
  lastLayersBoost += (boost - lastLayersBoost) * Math.min(1, dt * 4);
}

export const SCENE = { W, H };
