// main.js — 引导、阶段路由、出摊循环、事件委托
import { loadAssets } from './sprites.js';
import { makeGame } from './core.js';
import { renderSell, resetScene, SCENE } from './render.js';
import { hud, renderStock, renderPrep, renderSellShell, updateSellStats,
         renderSettle, renderMeta, toast } from './ui.js';

const SAVE_KEY = 'bushaoxin.v1';

let G = null;
let raf = 0;
let lastTs = 0;
let tickAcc = 0;
let speed = 1;
let ctx = null;

async function loadJSON(p) {
  return (await fetch(p)).json();
}

async function boot() {
  const [tags, traits, foods, ingredients, utensils, balance] = await Promise.all([
    loadJSON('src/data/tags.json'), loadJSON('src/data/traits.json'),
    loadJSON('src/data/foods.json'), loadJSON('src/data/ingredients.json'),
    loadJSON('src/data/utensils.json'), loadJSON('src/data/balance.json'),
  ]);
  const DATA = { tags, traits, foods, ingredients, utensils, balance };
  await loadAssets();

  G = makeGame(DATA);
  const saved = loadSave();
  if (saved) {
    G.s = saved;
    if (G.s.phase === 'SELL') { G.s.phase = 'PREP'; G.s.sell = null; }
    toast('已读取上次进度');
  } else {
    G.startRun(null);
  }

  window.addEventListener('click', onClick);
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev === 'play') {
    route();
    try { document.title = 'E2E ' + (await devPlay()); }
    catch (e) { document.title = 'E2E FAIL ' + e.message; }
    return;
  }
  if (dev && !saved) devAuto(dev);
  window.addEventListener('input', onChange);
  route();
}

/* ---------------------------------------------------------------- 端到端自测（?dev=play） */
async function devPlay() {
  const click = (sel) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error('找不到 ' + sel);
    node.click();
  };
  const step = [];
  for (let d = 0; d < 7; d++) {
    // 备货：核心食材各买 30
    for (let k = 0; k < 8; k++) {
      const list = [...document.querySelectorAll('[data-act="buy"][data-q="30"]')];
      const b = list[k % Math.max(1, list.length)];
      if (!b) break;
      b.click();
    }
    click('[data-act="toPrep"]');
    // 备餐：优先上架同标签的菜
    if (d === 0) {
      for (let k = 0; k < 3; k++) {
        const card = [...document.querySelectorAll('.food')].find((c) => {
          const m = c.textContent.match(/食材够(\d+)份/);
          const btn = c.querySelector('[data-act="toggle"]');
          return m && +m[1] >= 5 && btn && btn.textContent.trim() === '上架';
        });
        if (!card) break;
        card.querySelector('[data-act="toggle"]').click();
      }
    }
    for (let k = 0; k < 8; k++) {
      const list = [...document.querySelectorAll('[data-act="prep"]')];
      const b = list[k % Math.max(1, list.length)];
      if (!b) break;
      b.click();
    }
    click('[data-act="toSell"]');
    if (!document.getElementById('sellcanvas')) { const t = document.getElementById('toast'); throw new Error('出摊没渲染: ' + (t ? t.innerText.replace(/\n/g,'/') : '') + ' phase=' + G.s.phase + ' menu=' + G.s.menu.filter(m=>m.onMenu).length); }
    click('[data-act="skipSell"]');
    const bonus = document.querySelector('[data-act="bonus"]');
    if (!bonus) throw new Error('结算没出加成卡');
    bonus.click();
    step.push(`d${d + 1}:${Math.round(G.s.lastSettle.score)}`);
    await new Promise((r) => setTimeout(r, 0));
  }
  return step.join(' ') + ' | phase=' + G.s.phase + ' cash=' + Math.round(G.s.cash);
}

/* ---------------------------------------------------------------- 开发用自动推进 */
function devAuto(mode) {
  const core = ['potato', 'rice', 'flour', 'egg', 'chicken_steak', 'starch_sausage',
    'veg_mixed', 'condiment', 'ice', 'cola'];
  core.forEach((ing) => {
    const off = G.offerFor(ing);
    if (off) G.buy(off.si, off.ii, 30);
  });
  G.finishStock();
  if (mode === 'prep') return;
  if (mode === 'settle' || mode === 'meta') {
    const playDay = () => {
      const pool = G.availableFoods().filter((f) =>
        (!f.utensil || G.s.utensils.includes(f.utensil) || f.sellWo) && G.canMake(f));
      const menu = pool.slice().sort((a, b) => a.cost - b.cost).slice(0, 4);
      G.s.menu = menu.map((f) => ({ foodId: f.id, price: f.price, onMenu: true }));
      menu.forEach((f) => f.recipe.forEach((r) => {
        const off = G.offerFor(r.ing);
        if (off) G.buy(off.si, off.ii, r.qty * 10);
      }));
      G.s.phase = 'STOCK';
      G.s.minutesLeft = G.B.stockMinutes;
      G.finishStock();
      menu.forEach((f) => { const n = Math.min(G.rawCapacity(f), 8); if (n > 0) G.prep(f.id, n); });
      G.startSell();
      while (!G.s.sell.done) G.tick();
      G.endSell();
    };
    if (mode === 'settle') { playDay(); return; }
    for (let d = 0; d < 7; d++) {
      playDay();
      G.chooseBonus(G.bonusPool()[0].id);
      const r = G.nextDay();
      if (r.runOver) { G.s.phase = 'META'; break; }
    }
    return;
  }
  if (mode === 'sell2') {
    ['f_starch_sausage', 'f_pepper_sausage', 'f_chicken_steak', 'f_fries'].forEach((id) => {
      if (G.FOOD[id]) G.toggleMenu(id);
    });
    G.toggleMenu('f_cola');
    G.startSell();
    for (let i = 0; i < 2600; i++) G.tick();
    return;
  }
  ['f_starch_sausage', 'f_pepper_sausage', 'f_chicken_steak', 'f_fries'].forEach((id) => {
    if (G.FOOD[id]) { G.toggleMenu(id); G.prep(id, 8); }
  });
  G.toggleMenu('f_cola');
  G.startSell();
  if (mode === 'sell') { for (let i = 0; i < 2200; i++) G.tick(); }
}

/* ---------------------------------------------------------------- 存档 */
function save() {
  if (!G || !G.s) return;
  try {
    const s = { ...G.s };
    delete s.sell;
    s.suppliers = G.s.suppliers;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, s, balance: G.B }));
  } catch (e) { /* 忽略 */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return null;
    if (o.balance) G.B = Object.assign(G.B, o.balance);
    return o.s;
  } catch (e) { return null; }
}

/* ---------------------------------------------------------------- 路由 */
function route() {
  cancelAnimationFrame(raf);
  raf = 0;
  hud(G);
  switch (G.s.phase) {
    case 'STOCK': renderStock(G); save(); break;
    case 'PREP': renderPrep(G); save(); break;
    case 'SELL': startSellView(); break;
    case 'SETTLE': renderSettle(G); break;
    case 'META': renderMeta(G); save(); break;
    default: renderStock(G);
  }
}

/* ---------------------------------------------------------------- 出摊 */
function startSellView() {
  renderSellShell(G);
  if (!G.s.sell) G.startSell();
  resetScene();
  const cv = document.getElementById('sellcanvas');
  ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  lastTs = performance.now();
  tickAcc = 0;
  speed = 1;
  loop();
}

function loop() {
  if (!G.s.sell || G.s.sell.done) { finishSell(); return; }
  const now = performance.now();
  let dt = (now - lastTs) / 1000;
  lastTs = now;
  if (dt > 0.25) dt = 0.25;         // 切标签页回来不要雪崩
  tickAcc += dt * 200 * speed;
  let budget = 1200;
  const S = G.s.sell;
  while (tickAcc >= 1 && budget-- > 0 && !S.done) {
    G.tick();
    tickAcc -= 1;
  }
  renderSell(ctx, G, dt * speed);
  updateSellStats(G);
  raf = requestAnimationFrame(loop);
}

function finishSell() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (!G.s.lastSettle) G.endSell();
  hud(G);
  renderSettle(G);
  save();
}

/* ---------------------------------------------------------------- 事件 */
function onClick(ev) {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  switch (act) {
    case 'buy': {
      const r = G.buy(+t.dataset.s, +t.dataset.i, +t.dataset.q);
      if (!r.ok) toast(r.msg); else { hud(G); renderStock(G); }
      break;
    }
    case 'toPrep': {
      G.finishStock();
      route();
      break;
    }
    case 'toggle': {
      const v = G.toggleMenu(t.dataset.f);
      if (v.issues.some((i) => i.level === 'error')) toast(v.issues.find((i) => i.level === 'error').msg);
      hud(G); renderPrep(G); save();
      break;
    }
    case 'prep': {
      // 尽量备到食材上限（每次 10 份）
      const f = G.FOOD[t.dataset.f];
      const can = G.rawCapacity(f);
      const n = Math.min(10, can);
      if (n <= 0) { toast('食材不够，先去备货'); break; }
      const r = G.prep(f.id, n);
      if (!r.ok) toast(r.msg || '做不了');
      else toast(`备好 ${n} 份${f.name}（${r.minutes.toFixed(0)} 分钟）`);
      hud(G); renderPrep(G); save();
      break;
    }
    case 'toSell': {
      const v = G.validateMenu();
      const err = v.issues.find((i) => i.level === 'error');
      if (err) { toast(err.msg); break; }
      if (!G.s.menu.some((m) => m.onMenu)) { toast('至少上架一道菜'); break; }
      G.startSell();
      route();
      break;
    }
    case 'speed': {
      speed = speed === 1 ? 2 : 1;
      t.textContent = speed + 'x';
      break;
    }
    case 'skipSell': {
      const S = G.s.sell;
      while (S && !S.done) G.tick();
      finishSell();
      break;
    }
    case 'bonus': {
      G.chooseBonus(t.dataset.b);
      const r = G.nextDay();
      if (r.runOver) { G.s.phase = 'META'; }
      hud(G); route();
      break;
    }
    case 'skill': {
      if (!G.buySkill(t.dataset.b)) toast('技能点不够或已满级');
      hud(G); renderMeta(G); save();
      break;
    }
    case 'nextRun': {
      G.nextRun();
      hud(G); route();
      break;
    }
    default: break;
  }
}

function onChange(ev) {
  const t = ev.target;
  if (t.dataset && t.dataset.act === 'price') {
    G.setPrice(t.dataset.f, parseFloat(t.value) || 1);
    hud(G);
    save();
  }
}

boot().catch((e) => {
  document.body.innerHTML = `<pre style="color:#ff5c7a;padding:20px">启动失败：${e && e.message}\n${e && e.stack}</pre>`;
});
