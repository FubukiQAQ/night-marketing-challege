// render.js — 出摊场景的 Canvas 绘制（640×360 逻辑分辨率）
import { draw, sceneDraw, frame, customerTypes, ASSETS } from './sprites.js';

export function drawSrc(ctx, name, sx, sy, sw, sh, dx, dy, dw, dh, alpha = 1) {
  const f = ASSETS.frames[name];
  if (!f) return false;
  const im = ASSETS.imgs[f.png];
  if (!im) return false;
  const old = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(im, f.x + sx, f.y + sy, sw, sh, Math.round(dx), Math.round(dy),
    dw || sw, dh || sh);
  ctx.globalAlpha = old;
  return true;
}


const W = 640, H = 360;
const BOOTH_X = 188;          // 摊位左边缘
const AWNING_Y = 46;          // 雨棚顶
const SIGN_Y = 100;
const BULB_Y = 94;
const SURF_Y = 194;           // 台面格（48 高）
const UT_Y = 146;             // 厨具（48 高，坐在台面上）
const BASE_Y = 234;           // 车体（裁短后 66 高）
const GROUND = 300;          // 地面线
const QUEUE_X = 402;
const QUEUE_STEP = 54;
const PERSON = 2;             // 人物放大倍数（整数倍，像素不糊）

let TYPES = null;
let t = 0;

export function resetScene() { t = 0; }

function animFrame(base, n, fps) {
  return `${base}_${String((Math.floor(t * fps) % n) + 1).padStart(2, '0')}`;
}

export function renderSell(ctx, G, dt) {
  t += dt;
  if (!TYPES) TYPES = customerTypes();
  const s = G.s;
  const S = s.sell;

  ctx.clearRect(0, 0, W, H);
  // ---------- 背景三层
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, W, H);
  sceneDraw(ctx, 'night_far_dark', 0, -6, W, H * 0.62);
  sceneDraw(ctx, 'night_mid_dark', 0, 60, W, H * 0.62);
  // 地面
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, GROUND, W, H - GROUND);

  const totalLayers = Object.values(s.layers || {}).reduce((a, b) => a + b, 0);
  const litBulbs = Math.min(18, Math.floor(totalLayers / 3));

  // ---------- 摊位
  drawSrc(ctx, 'scene/booth_base.png', 0, 30, 192, 66, BOOTH_X, BASE_Y, 192, 66);
  // 台面格：按加成扩容的数量画
  const surfModules = Math.max(3, Math.min(6, Math.round(G.B.surface / 6)));
  for (let i = 0; i < surfModules; i++) {
    draw(ctx, 'scene/booth_surface_1x.png', BOOTH_X + 12 + i * 44, SURF_Y, 48, 48);
  }
  draw(ctx, 'scene/booth_awning_up.png', BOOTH_X, AWNING_Y);
  draw(ctx, 'scene/booth_sign.png', BOOTH_X + 48, SIGN_Y);
  // 菜单板 + 收款牌 + 凳子
  draw(ctx, 'scene/booth_menu_board.png', BOOTH_X + 150, SIGN_Y - 4);
  draw(ctx, 'scene/booth_qr_sign.png', BOOTH_X + 34, SURF_Y - 16);
  draw(ctx, 'scene/booth_stool_red.png', BOOTH_X - 62, GROUND - 48, 32, 48);
  draw(ctx, 'scene/booth_stool_blue.png', BOOTH_X - 28, GROUND - 44, 32, 48);

  // ---------- 灯串 = 层数（永久累积的视觉化）
  for (let i = 0; i < 12; i++) {
    const bx = BOOTH_X + 8 + i * 16;
    const on = i < Math.ceil(litBulbs / 1.6);
    draw(ctx, on ? 'ui/ui_bulb_on.png' : 'ui/ui_bulb_off.png', bx, BULB_Y, 8, 8);
  }

  // ---------- 厨具（最多 4 件，横排在台面上）
  const us = s.utensils.slice(0, 4);
  us.forEach((uid, i) => {
    const x = BOOTH_X + 8 + i * 44;
    const busy = S && Object.keys(S.jobs).includes(uid) && S.jobs[uid].length > 0;
    const name = busy
      ? `utensil/utensil_${uid}_work_0${(Math.floor(t * 8) % 2) + 1}.png`
      : `utensil/utensil_${uid}_idle.png`;
    // 光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    draw(ctx, 'fx/light_warm.png', x - 16, UT_Y - 16, 80, 80, busy ? 0.55 : 0.22);
    ctx.restore();
    draw(ctx, name, x, UT_Y, 48, 48);
  });

  // ---------- 顾客队列
  if (S) {
    const list = S.customers.filter((c) => c.state !== 'wait' || true).slice(0, 5);
    list.forEach((c, i) => {
      const type = TYPES && TYPES.length ? TYPES[(c.typeSeed || i) % TYPES.length] : 'student';
      const x = QUEUE_X + i * QUEUE_STEP;
      const y = GROUND - 40 * PERSON;
      let spr = `char/chr_customer_${type}_wait.png`;
      if (c.state === 'happy') {
        spr = `char/chr_customer_${type}_happy.png`;
      } else if (c.state === 'browse') {
        spr = i % 2 ? `char/chr_customer_${type}_walk_01.png` : `char/chr_customer_${type}_walk_02.png`;
      } else if (c.state === 'wait') {
        const ratio = c.waited / Math.max(1, c.patience);
        spr = ratio > 0.6 ? `char/chr_customer_${type}_urgent.png` : `char/chr_customer_${type}_wait.png`;
      }
      draw(ctx, spr, x, y, 24 * PERSON, 40 * PERSON);
      // 需求气泡
      let mood = 'normal';
      if (c.state === 'happy') mood = 'happy';
      else if (c.state === 'wait' && c.waited / Math.max(1, c.patience) > 0.6) mood = 'urgent';
      draw(ctx, `ico/want_${c.wantTag}_${mood}.png`, x + 16, y - 22, 16, 16);
      // 耐心条
      if (c.state === 'wait') {
        const ratio = 1 - c.waited / Math.max(1, c.patience);
        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(x + 4, y - 8, 40, 4);
        ctx.fillStyle = ratio > 0.4 ? '#ffc163' : '#ff5c7a';
        ctx.fillRect(x + 4, y - 8, Math.max(0, 40 * ratio), 4);
      }
    });
  }

  // ---------- 飘字
  if (S) {
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    S.floaters = S.floaters.filter((f) => f.age < 1.6);
    S.floaters.forEach((f, i) => {
      f.age += dt;
      const p = f.age / 1.6;
      const y = 210 - p * 40 - (i % 3) * 6;
      const x = 300 + ((i * 37) % 120) - 40;
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

}

export const SCENE = { W, H };
