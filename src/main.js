// main.js — 引导、阶段路由、出摊循环、事件委托
import { loadAssets } from './sprites.js';
import { makeGame, mulberry32 } from './core.js';
import { loadSave, writeSave, clearSave, describeSave, formatTime } from './save.js';
import * as Audio from './audio.js';
import { renderSell, resetScene, SCENE } from './render.js';
import { hud, renderStock, renderPrep, renderSellShell, updateSellStats,
         renderSettle, renderMeta, renderMenu, toast, keepScroll,
         resetStockView, addToCart, subFromCart, clearCart, setStockTab, cartLines,
         setTraitFilter } from './ui.js';

let DATA = null;
let pending = null;   // 读到的存档，等玩家在主菜单选

/* 页面背景：用 HD 场景图的 near 层，压暗后当作大背景 */
const BACKDROP = {
  menu: 'assets/art_hd/scene/scene_night_near.png',
  market: 'assets/art_hd/scene/scene_market_near.png',
  prep: 'assets/art_hd/scene/scene_prep_near.png',
  night: 'assets/art_hd/scene/scene_night_near.png',
};
function setBackdrop(name) {
  const node = document.getElementById('bgscene');
  if (!node) return;
  const url = BACKDROP[name];
  if (!url) return;
  if (node.dataset.key === url) { node.classList.add('on'); return; }
  node.dataset.key = url;
  const img = new Image();
  img.onload = () => { node.style.backgroundImage = 'url(' + url + ')'; node.classList.add('on'); };
  img.src = url;
}
let menuOpts = { confirming: false, help: false };

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
  const [tags, traits, foods, ingredients, utensils, balance, story] = await Promise.all([
    loadJSON('src/data/tags.json'), loadJSON('src/data/traits.json'),
    loadJSON('src/data/foods.json'), loadJSON('src/data/ingredients.json'),
    loadJSON('src/data/utensils.json'), loadJSON('src/data/balance.json'),
    loadJSON('src/data/story.json').catch(() => null),
  ]);
  DATA = { tags, traits, foods, ingredients, utensils, balance, story };
  await loadAssets();

  G = makeGame(DATA);
  pending = loadSave();

  window.addEventListener('click', onClick);
  window.addEventListener('input', onChange);
  Audio.installUnlock();
  Audio.loadTracks();

  const dev = new URLSearchParams(location.search).get('dev');
  if (dev === 'menuflow') {
    showMenu();
    try { document.title = await menuFlowTest(); }
    catch (e) { document.title = 'MENU FAIL ' + e.message; }
    return;
  }
  if (dev) {
    // 调试入口：直接开局，跳过主菜单
    if (pending && pending.meta) {
      G.startRun(pending.meta); G.applySkills();
    } else {
      G.startRun(null);
    }
    if (dev === 'play') {
      route();
      try { document.title = 'E2E ' + (await devPlay()); }
      catch (e) { document.title = 'E2E FAIL ' + e.message; }
      return;
    }
    devAuto(dev);
    route();
    if (dev === 'width') {
      try { document.title = 'W boot'; await probeWidth(); }
      catch (e) { document.title = 'W FAIL ' + e.message; }
      return;
    }
    if (dev === 'cart') {
      try { document.title = cartFlowTest(); }
      catch (e) { document.title = 'CART FAIL ' + e.message; }
    }
    return;
  }

  showMenu();
}



/** 每次底栏被重写后，把播放器重新挂上去 */
function mountPlayer() {
  const bar = document.getElementById('bar');
  if (!bar) return;
  let host = bar.querySelector('#player');
  if (!host) {
    host = document.createElement('div');
    host.id = 'player';
    bar.appendChild(host);
  }
  renderPlayer();
}

/* ---------------------------------------------------------------- BGM 播放器 */
function renderPlayer() {
  const st = Audio.getState();
  const tr = st.track || { title: '无曲目', artist: '—' };
  const bar = document.getElementById('bar');
  const host = bar.querySelector('#player');
  if (!host) return;
  const pct = Math.round(st.volume * 100);
  host.innerHTML = `
    <div class="player">
      <button class="small ghost" data-act="bgmPrev" title="上一首">◀</button>
      <button class="small ghost" data-act="bgmToggle" title="播放 / 暂停">${st.playing ? '❙❙' : '▶'}</button>
      <button class="small ghost" data-act="bgmNext" title="下一首">▶</button>
      <div class="player-meta">
        <b>${tr.title}</b><span>${tr.artist}</span>
      </div>
      <div class="player-pick">
        <button class="small ghost" data-act="bgmFollow"
          title="开启后按阶段自动切歌">${st.followPhase ? '跟随阶段' : '手动锁定'}</button>
        <select class="player-select" data-act="bgmPickRaw">
          ${st.tracks.map((x, i) => `<option value="${i}" ${i === st.index ? 'selected' : ''}>${x.title} · ${x.artist}</option>`).join('')}
        </select>
      </div>
      <div class="player-vol">
        <button class="small ghost" data-act="mute" title="静音">${st.muted ? '静' : '音'}</button>
        <input type="range" min="0" max="100" value="${pct}" data-act="bgmVolRange">
        <span class="tiny muted">${pct}%</span>
      </div>
    </div>`;
}

/** 播放器控件的通用壳，塞进底栏 */
function playerShell(inner) {
  return `<span class="spacer"></span><div id="player">${inner || ''}</div>`;
}

/* ---------------------------------------------------------------- 主菜单 */
function showMenu() {
  cancelAnimationFrame(raf);
  raf = 0;
  const desc = pending ? describeSave(pending) : null;
  const meta = pending && pending.meta ? pending.meta : null;
  const layerTotal = meta
    ? Object.values(meta.layers || {}).reduce((a, b) => a + b, 0) : 0;
  Audio.playPhase('menu');
  setBackdrop('menu');
  document.getElementById('app').classList.add('menu-mode');
  renderMenu({
    desc,
    hasMeta: !!meta,
    confirming: menuOpts.confirming,
    help: menuOpts.help,
    savedAt: pending ? pending.savedAt : 0,
    layerTotal,
    opening: (DATA && DATA.story) ? DATA.story.opening : null,
  });
  mountPlayer();
}

function continueGame() {
  const o = pending || loadSave();
  if (!o || !o.run) { toast('没有存档'); return; }
  G = makeGame(DATA);
  G.s = o.run;
  if (o.balance) G.B = Object.assign(G.B, o.balance);
  if (G.s.phase === 'SELL') { G.s.phase = 'PREP'; G.s.sell = null; }
  G.rng = mulberry32(G.s.rngSeed || 1);
  menuOpts = { confirming: false, help: false };
  route();
}

function startNewRun() {
  const o = pending || loadSave();
  const meta = o && o.meta ? o.meta : null;
  G = makeGame(DATA);
  G.startRun(meta ? { ...meta } : null);
  G.applySkills();
  menuOpts = { confirming: false, help: false };
  writeSave(G);
  route();
  toast(meta ? '新一轮：继承层数与技能' : '第一轮开始');
}

function wipeSave() {
  if (!menuOpts.confirming) {
    menuOpts.confirming = true;
    showMenu();
    return;
  }
  clearSave();
  pending = null;
  G = makeGame(DATA);
  G.startRun(null);
  menuOpts = { confirming: false, help: false };
  showMenu();
  toast('存档已清空');
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
    // 备货：点前 8 个格子各 3 次进购物车，再结算
    for (let k = 0; k < 8; k++) {
      for (let n = 0; n < 10; n++) {
        const t = document.querySelectorAll('.tile:not(.out)')[k];
        if (!t) break;
        t.click();
      }
    }
    const commit = document.querySelector('[data-act="cartCommit"]');
    if (!commit || commit.disabled) throw new Error('购物车结算按钮不可用');
    commit.click();
    click('[data-act="toPrep"]');
    // 备餐：优先上架同标签的菜
    if (d === 0) {
      for (let k = 0; k < 3; k++) {
        const card = [...document.querySelectorAll('.food')].find((c) => {
          const m = c.textContent.match(/食材够\s*(\d+)\s*份/);
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


/* ---------------------------------------------------------------- 主菜单自测（?dev=menuflow） */
async function menuFlowTest() {
  const $ = (s) => document.querySelector(s);
  const log = [];
  // ① 首次进菜单：应有「开始第一轮」
  if (!$('[data-act="newRun"]')) throw new Error('菜单里没有开始按钮');
  $('[data-act="newRun"]').click();
  if (!G.s || G.s.phase !== 'STOCK') throw new Error('没进入备货阶段');
  log.push('开局 OK');

  // ② 买点东西（点格子进购物车 → 结算），记下现金
  const tile = document.querySelector('.tile:not(.out)');
  if (!tile) throw new Error('货架格子没渲染');
  tile.click();
  const commitBtn = $('[data-act="cartCommit"]');
  if (!commitBtn || commitBtn.disabled) throw new Error('购物车结算按钮不可用');
  commitBtn.click();
  const cash = Math.round(G.s.cash);
  log.push('买料后现金 ' + cash);

  // ③ 回主菜单：应出现「继续」
  $('[data-act="menu"]').click();
  const cont = $('[data-act="continue"]');
  if (!cont) throw new Error('回菜单后没有继续按钮');
  log.push('继续按钮文案: ' + cont.textContent.replace(/\s+/g, ' ').trim().slice(0, 26));

  // ④ 继续：状态要还原
  cont.click();
  if (G.s.phase !== 'STOCK') throw new Error('继续后阶段不对: ' + G.s.phase);
  if (Math.round(G.s.cash) !== cash) throw new Error('继续后现金不一致 ' + G.s.cash + ' vs ' + cash);
  log.push('继续还原 OK');

  // ⑤ 清空存档（两次点击确认）
  $('[data-act="menu"]').click();
  const w1 = $('[data-act="wipe"]');
  if (!w1) throw new Error('菜单里没有清空按钮');
  w1.click();
  const w2 = $('[data-act="wipe"]');
  if (!w2 || !w2.textContent.includes('确定')) throw new Error('清空没有二次确认');
  w2.click();
  if (localStorage.getItem('bushaoxin.save.v2')) throw new Error('清空后存档仍然存在');
  if (!$('[data-act="newRun"]')) throw new Error('清空后菜单异常');
  log.push('清空存档 OK');

  return 'MENU OK — ' + log.join(' | ');
}


/* ---------------------------------------------------------------- 购物车自测（?dev=cart） */
function cartFlowTest() {
  const log = [];
  const $ = (sel) => document.querySelector(sel);
  const cash0 = G.s.cash;
  const inv0 = Object.values(G.s.inventory).reduce((a, b) => a + b, 0);

  // ① 点第一个格子 3 次，第二个格子 2 次
  const tap = (idx) => {
    const t = document.querySelectorAll('.tile:not(.out)')[idx];
    if (!t) throw new Error('货架格子不足');
    t.click();                       // 每次点击都会重渲染，必须重新查询
  };
  tap(0); tap(0); tap(0);
  tap(1); tap(1);

  const badge = document.querySelectorAll('.tile.picked').length;
  if (badge !== 2) throw new Error('购物车标记数量不对：' + badge);
  log.push('加购 OK（2 种）');

  // ② 购物车应显示 2 行 + 合计
  const lines = document.querySelectorAll('.cart-line').length;
  if (lines !== 2) throw new Error('购物车行数不对：' + lines);
  const totalTxt = $('.cart-total').textContent;
  log.push('合计显示 ' + totalTxt.replace(/\s+/g, ' ').trim());

  // ③ 减 1 应该让第一行消失（3→2 不会消失，这里减到 0）
  const sub = document.querySelector('.cart-line .mini');
  sub.click();
  const lines2 = document.querySelectorAll('.cart-line').length;
  if (lines2 !== 2) throw new Error('减 1 后行数异常：' + lines2);

  // ④ 结算采购
  const commit = $('[data-act="cartCommit"]');
  if (!commit || commit.disabled) throw new Error('结算按钮不可用');
  commit.click();

  const inv1 = Object.values(G.s.inventory).reduce((a, b) => a + b, 0);
  const cash1 = G.s.cash;
  if (inv1 <= inv0) throw new Error('结算后库存没有增加');
  if (cash1 >= cash0) throw new Error('结算后现金没有减少');
  log.push(`库存 ${inv0}→${inv1}，现金 ${Math.round(cash0)}→${Math.round(cash1)}`);

  // ⑤ 购物车应被清空
  const left = document.querySelectorAll('.cart-line').length;
  const empty = document.querySelector('.cart-empty');
  if (left !== 0 || !empty) throw new Error('结算后购物车没清空');
  log.push('清空 OK');

  // ⑥ 切页签
  const tabs = document.querySelectorAll('.sup-tab');
  if (tabs.length < 2) throw new Error('页签不足');
  tabs[1].click();
  if (!document.querySelector('.sup-tab.on')) throw new Error('页签切换后没有选中态');
  log.push('页签 OK');

  return 'CART OK — ' + log.join(' | ');
}


/* ---------------------------------------------------------------- 宽度探针（?dev=width） */
async function probeWidth() {
  await new Promise((r) => setTimeout(r, 700));
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const bad = [];
  document.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) {
      bad.push((e.id || e.className || e.tagName) + '@' + Math.round(r.right) + ' w=' + Math.round(r.width));
    }
  });
  document.title = 'W vw=' + vw + ' sw=' + sw + ' | ' + bad.slice(0, 6).join(' ; ');
}
/* ---------------------------------------------------------------- 开发用自动推进 */
function devAuto(mode) {
  if (mode === 'stock' || mode === 'cart') return;   // 停在备货阶段，方便截图/调试
  const core = ['potato', 'rice', 'flour', 'egg', 'chicken_steak', 'starch_sausage',
    'veg_mixed', 'condiment', 'ice', 'cola'];
  core.forEach((ing) => {
    const off = G.offerFor(ing);
    if (off) G.buy(off.si, off.ii, 30);
  });
  G.finishStock();

  // 造一个「已有层数 + 已上架」的备餐局面，用来验证词条树激活态
  if (mode === 'prepLayers') {
    G.s.layers = { fastest: 14, cheers: 22, sizzle: 6, spicy: 9, full: 4 };
    ['f_starch_sausage', 'f_pepper_sausage', 'f_chicken_steak', 'f_fries', 'f_cola']
      .forEach((id) => { if (G.FOOD[id]) G.toggleMenu(id); });
    return;
  }

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
  writeSave(G);
  pending = loadSave();
}

/* ---------------------------------------------------------------- 路由 */
function route() {
  cancelAnimationFrame(raf);
  raf = 0;
  document.getElementById('app').classList.remove('menu-mode');
  hud(G);
  switch (G.s.phase) {
    case 'STOCK': Audio.playPhase('stock'); setBackdrop('market'); resetStockView(); renderStock(G); save(); break;
    case 'PREP': Audio.playPhase('prep'); setBackdrop('prep'); renderPrep(G); save(); break;
    case 'SELL': Audio.playPhase('sell'); setBackdrop('night'); startSellView(); break;
    case 'SETTLE': Audio.playPhase('sell'); setBackdrop('night'); renderSettle(G); save(); break;
    case 'META': Audio.playPhase('menu'); setBackdrop('menu'); renderMeta(G); save(); break;
    default: Audio.playPhase('stock'); renderStock(G);
  }
  mountPlayer();
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
    case 'stockTab': {
      setStockTab(+t.dataset.s);
      keepScroll(() => renderStock(G));
      break;
    }
    case 'cartAdd': {
      addToCart(+t.dataset.s, +t.dataset.i);
      keepScroll(() => renderStock(G));
      break;
    }
    case 'cartSub': {
      subFromCart(t.dataset.k);
      keepScroll(() => renderStock(G));
      break;
    }
    case 'cartClear': {
      clearCart();
      keepScroll(() => renderStock(G));
      break;
    }
    case 'cartCommit': {
      const lines = cartLines(G);
      if (!lines.length) { toast('购物车是空的'); break; }
      let done = 0, fail = null;
      for (const l of lines) {
        const r = G.buy(l.si, l.ii, l.q);
        if (!r.ok) { fail = r.msg; break; }
        done++;
        if (G.s.phase !== 'STOCK') break;   // 时间耗尽会自动收摊
      }
      clearCart();
      if (fail) toast(fail);
      else if (G.s.phase === 'STOCK') toast(`已采购 ${done} 种食材`);
      hud(G);
      if (G.s.phase === 'STOCK') keepScroll(() => renderStock(G));
      else route();
      save();
      break;
    }
    case 'buy': {
      const r = G.buy(+t.dataset.s, +t.dataset.i, +t.dataset.q);
      if (!r.ok) toast(r.msg); else { hud(G); keepScroll(() => renderStock(G)); }
      break;
    }
    case 'buyDish': {
      const res = G.buyForDish(t.dataset.f, +t.dataset.n || 5);
      if (!res.ok) toast('没买齐：缺 ' + res.miss.join('、'));
      else toast(`已按 ${t.dataset.n || 5} 份备齐 ${G.FOOD[t.dataset.f].name} 的料`);
      hud(G); keepScroll(() => renderStock(G));
      break;
    }
    case 'menu': {
      cancelAnimationFrame(raf);
      raf = 0;
      save();
      pending = loadSave();
      menuOpts = { confirming: false, help: false };
      showMenu();
      break;
    }
    case 'continue': {
      continueGame();
      break;
    }
    case 'newRun': {
      startNewRun();
      break;
    }
    case 'wipe': {
      wipeSave();
      break;
    }
    case 'bgmPrev': { Audio.prev(); renderPlayer(); break; }
    case 'bgmNext': { Audio.next(); renderPlayer(); break; }
    case 'bgmToggle': { Audio.toggle(); renderPlayer(); break; }
    case 'bgmFollow': {
      Audio.setFollowPhase(!Audio.getState().followPhase);
      renderPlayer();
      break;
    }
    case 'bgmPick': {
      Audio.select(+t.dataset.i);
      renderPlayer();
      break;
    }
    case 'bgmVol': {
      const v = parseFloat(t.dataset.v);
      Audio.setVolume(v);
      renderPlayer();
      break;
    }
    case 'mute': {
      const muted = Audio.toggleMute();
      t.textContent = muted ? '🔇' : '🔊';
      hud(G);
      break;
    }
    case 'help': {
      menuOpts.help = true;
      showMenu();
      break;
    }
    case 'backMenu': {
      menuOpts.help = false;
      menuOpts.confirming = false;
      showMenu();
      break;
    }
    case 'toPrep': {
      G.finishStock();
      route();
      break;
    }
    case 'traitFilter': {
      setTraitFilter(t.dataset.f);
      keepScroll(() => renderPrep(G));
      break;
    }
    case 'toggle': {
      const v = G.toggleMenu(t.dataset.f);
      if (v.issues.some((i) => i.level === 'error')) toast(v.issues.find((i) => i.level === 'error').msg);
      hud(G); keepScroll(() => renderPrep(G)); save();
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
      hud(G); keepScroll(() => renderPrep(G)); save();
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
    return;
  }
  if (t.dataset && t.dataset.act === 'bgmPickRaw') {
    Audio.select(parseInt(t.value, 10) || 0);
    renderPlayer();
    return;
  }
  if (t.dataset && t.dataset.act === 'bgmVolRange') {
    Audio.setVolume((parseFloat(t.value) || 0) / 100);
    const lab = t.parentElement.querySelector('.tiny');
    if (lab) lab.textContent = Math.round(Audio.getVolume() * 100) + '%';
  }
}

boot().catch((e) => {
  document.body.innerHTML = `<pre style="color:#ff5c7a;padding:20px">启动失败：${e && e.message}\n${e && e.stack}</pre>`;
});
