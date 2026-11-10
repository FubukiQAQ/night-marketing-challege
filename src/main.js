// main.js — 引导、阶段路由、出摊循环、事件委托
import { loadAssets } from './sprites.js';
import { makeGame, mulberry32, setDayMods } from './core.js';
import { loadSave, writeSave, clearSave, describeSave, formatTime } from './save.js';
import * as Audio from './audio.js';
import * as Tut from './tutorial.js';
import * as Touch from './touch.js';
import * as DayMods from './daymods.js';
import { renderSell, resetScene, SCENE } from './render.js';
import { hud, renderStock, renderPrep, renderSellShell, updateSellStats,
         renderSettle, renderMeta, renderMenu, toast, keepScroll,
         resetStockView, addToCart, subFromCart, clearCart, setStockTab, cartLines,
         setTraitFilter, renderArchive, getStockTab } from './ui.js';

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
let menuOpts = { confirming: false, help: false, archive: false };

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
  const [weather, events, rival, regulars] = await Promise.all([
    loadJSON('src/data/weather.json').catch(() => null),
    loadJSON('src/data/events.json').catch(() => null),
    loadJSON('src/data/rival.json').catch(() => null),
    loadJSON('src/data/regulars.json').catch(() => null),
  ]);
  DATA = { tags, traits, foods, ingredients, utensils, balance, story, regulars };
  DayMods.initDayMods({
    weather: weather && weather.list, events: events && events.list, rival: rival || null,
  });
  DATA.weather = weather && weather.list;
  DATA.events = events && events.list;
  setDayMods(DayMods);
  Tut.initTutorial(await loadJSON('src/data/tutorial.json').catch(() => null));
  await loadAssets();

  G = makeGame(DATA);
  pending = loadSave();

  window.addEventListener('click', onClick);
  window.addEventListener('input', onChange);
  Audio.installUnlock();
  Audio.loadTracks();
  Tut.startPolling(() => G);
  Touch.initTouch({
    getGame: () => G,
    tabs: {
      get: getStockTab,
      set: (i) => { setStockTab(i); keepScroll(() => renderStock(G)); },
    },
  });

  const params = new URLSearchParams(location.search);
  const dev = params.get('dev');
  if (dev === 'menuflow') {
    showMenu();
    try { document.title = await menuFlowTest(); }
    catch (e) { document.title = 'MENU FAIL ' + e.message; }
    return;
  }
  if (dev) {
    // 调试入口：直接开局，跳过主菜单
    const carryMeta = (pending && pending.meta) ? pending.meta : null;
    G.startRun(carryMeta);
    if (carryMeta) G.applySkills();
    if (!carryMeta || !carryMeta.runs) Tut.enable(G);
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
    if (dev === 'wx') {
      const w = params.get('w') || 'rain';
      const rv = parseFloat(params.get('rival') || '0.55');
      devAuto('sell2');
      G.s.weather = w;
      G.s.rival = { strength: rv, focusTag: 'fried', name: '街尾那家' };
      G.s.events = [
        { id: 'night_market', name: '夜市活动', good: true, title: '街口在办活动', desc: '' },
      ];
      route();
      return;
    }
    if (dev === 'regulars') {
      try { devAuto('prep'); document.title = regularsFlowTest(); }
      catch (e) { document.title = 'REGULARS FAIL ' + e.message; }
      return;
    }
    if (dev === 'sigview') {
      const dish = G.availableFoods().find((f) => {
        const hasUt = !f.utensil || G.s.utensils.includes(f.utensil);
        return hasUt && f.recipe.length <= 2 && (f.space || 0) <= 2;
      });
      if (dish) G.setSignature(dish.id);
      route();
      return;
    }
    if (dev === 'signature') {
      route();
      try { document.title = signatureFlowTest(); }
      catch (e) { document.title = 'SIGNATURE FAIL ' + e.message; }
      return;
    }
    if (dev === 'menuprobe') {
      setTimeout(menuProbe, 600);
      return;
    }
    if (dev === 'touchdiag') {
      const ph2 = params.get('phase') || 'sell';
      try {
        if (ph2 === 'sell') devAuto('sell2');
        if (params.get('tut') === '1') Tut.enable(G);
        route();
        if (params.get('tut') === '1') { Tut.syncPhase(G); Tut.paint(G); }
        document.title = touchDiag();
      } catch (e) { document.title = 'DIAG FAIL ' + e.message; }
      return;
    }
    if (dev === 'touch') {
      const ph = params.get('phase') || 'stock';
      try {
        if (ph === 'prep') devAuto('prep');
        else if (ph === 'sell') devAuto('sell2');
        else if (ph === 'settle') devAuto('settle');
        else devAuto('stock');
        route();
        document.title = touchAudit() + ' | phase=' + G.s.phase;
      } catch (e) { document.title = 'TOUCH FAIL ' + e.message; }
      return;
    }
    if (dev === 'tutorial') {
      try { document.title = tutorialFlowTest(); }
      catch (e) { document.title = 'TUTORIAL FAIL ' + e.message; }
      return;
    }
    if (dev === 'regsview') {
      devAuto('prep');
      Tut.disable(G);
      const T = (G.DATA.regulars && G.DATA.regulars.types) || [];
      G.s.regulars = {};
      T.slice(0, 4).forEach((x, i) => {
        G.s.regulars[x.id] = { lv: 3 - i, favTag: x.favTag, miss: i === 1 ? 1 : 0 };
      });
      G.s.regularNews = [{ id: T[3] && T[3].id, name: T[3] ? T[3].name : '老街坊', lv: 0 }];
      // 上架几道能做的菜：让「爱吃」有的绿有的红
      G.availableFoods().filter((f) =>
        (!f.utensil || G.s.utensils.includes(f.utensil)) && G.canMake(f))
        .slice(0, 3).forEach((f) => {
          if (!G.s.menu.find((m) => m.foodId === f.id)) G.toggleMenu(f.id);
        });
      route();
      return;
    }
    if (dev === 'qte2rhythm') {
      devAuto('sell2');
      const c = G.spawnCustomer();
      c.special = 'foodie';
      c.mood = 'normal';
      G.s.sell.customers.unshift(c);
      G.s.sell.qte = {
        type: 'foodie', name: '炸货老饕', kind: 'rhythm',
        total: 620, left: 383, cust: c,
        base: 40, mul: 1.9, rep: 3, failRep: -2, ended: false, ok: false,
        beats: [0.22, 0.5, 0.78], beatIndex: 1, hits: 1, misses: 0,
        tol: 0.085, flash: ['hit'],
      };
      route();
      return;
    }
    if (dev === 'qte2mash' || dev === 'qte2math') {
      devAuto('sell2');
      const kind = dev === 'qte2mash' ? 'mash' : 'math';
      const c = G.spawnCustomer();
      c.special = kind === 'mash' ? 'eater' : 'critic';
      c.mood = 'normal';
      G.s.sell.customers.unshift(c);
      G.s.sell.qte = {
        type: c.special, name: kind === 'mash' ? '大胃王' : '美食评论家',
        kind, total: 620, left: 560, cust: c,
        base: 40, mul: 2.2, rep: 3, failRep: -2, ended: false, ok: false,
        hits: 5, need: 12,
        bill: 50, paid: 32.5, change: 17.5,
        options: [
          { v: 27.5, ok: false }, { v: 17.5, ok: true },
          { v: 12.5, ok: false }, { v: 7.5, ok: false },
        ],
      };
      route();
      return;
    }
    if (dev === 'qte2') {
      qteShowcase('timing');
      updateSellStats(G);
      return;
    }
    if (dev === 'qte2pick') {
      qteShowcase('pick');
      updateSellStats(G);
      return;
    }
    if (dev === 'qte') {
      try { document.title = qteFlowTest(); }
      catch (e) { document.title = 'QTE FAIL ' + e.message; }
      return;
    }
    if (dev === 'cart') {
      try { document.title = cartFlowTest(); }
      catch (e) { document.title = 'CART FAIL ' + e.message; }
    }
    return;
  }

  if (params.get('page') === 'archive') menuOpts.archive = true;
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
    archive: menuOpts.archive,
    story: (DATA && DATA.story) || null,
    canTutorial: !!(G && G.s && G.s.tut < 900) || !!desc,
  });
  mountPlayer();
  Tut.syncPhase(G);
  Touch.rebindTouch({
    getGame: () => G,
    tabs: {
      get: getStockTab,
      set: (i) => { setStockTab(i); keepScroll(() => renderStock(G)); },
    },
  });
}

function continueGame() {
  const o = pending || loadSave();
  if (!o || !o.run) { toast('没有存档'); return; }
  G = makeGame(DATA);
  G.s = o.run;
  if (o.balance) G.B = Object.assign(G.B, o.balance);
  if (G.s.phase === 'SELL') { G.s.phase = 'PREP'; G.s.sell = null; }
  G.rng = mulberry32(G.s.rngSeed || 1);
  menuOpts = { confirming: false, help: false, archive: false };
  route();
}

function startNewRun() {
  const o = pending || loadSave();
  const meta = o && o.meta ? o.meta : null;
  G = makeGame(DATA);
  G.startRun(meta ? { ...meta } : null);
  G.applySkills();
  if (!meta || !meta.runs) Tut.enable(G);
  menuOpts = { confirming: false, help: false, archive: false };
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
  menuOpts = { confirming: false, help: false, archive: false };
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
    // 备货：先切到有货的页签，再点格子
    const tabWithStock = [...document.querySelectorAll('.sup-tab')].findIndex((tb, i) => {
      tb.click();
      return document.querySelectorAll('.tile').length > 0;
    });
    if (tabWithStock >= 0) {
      document.querySelectorAll('.sup-tab')[tabWithStock].click();
    }
    // 点前 8 个格子各 10 次进购物车，再结算
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
    // 出摊：边推进边把 QTE 点掉（模拟会玩的玩家）
    for (let n = 0; n < 4000; n++) {
      const S2 = G.s.sell;
      if (!S2 || S2.done) break;
      const q = S2.qte;
      if (q && !q.ended) {
        if (q.kind === 'pick') {
          const idx = (q.options || []).findIndex((o) => o.ok);
          const btn = document.querySelectorAll('[data-act="qtePick"]')[idx];
          if (btn) btn.click();
        } else {
          // 把指针推到绿区中央再点
          const z = q.zone || [0.44, 0.60];
          const mid = (z[0] + z[1]) / 2;
          q.left = Math.round(q.total * (1 - mid));
          const btn = document.querySelector('[data-act="qteHit"]');
          if (btn) btn.click();
        }
      }
      G.tick();
    }
    if (!(G.s.sell && G.s.sell.done)) click('[data-act="skipSell"]');
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




/* ---------------------------------------------------------------- QTE 定场（?dev=qte2） */
function qteShowcase(kind) {
  const S = G.s.sell;
  if (!S) return 'no sell';
  // 队列里放两位特殊顾客 + 一位普通
  const mk = (special, i) => {
    const c = G.spawnCustomer();
    c.special = special;
    c.mood = 'normal';
    c.state = 'wait';
    c.typeSeed = i;
    c.waited = 20;
    c.patience = 600;
    c.wantTag = c.wantTag || 'fried';
    S.customers.push(c);
    return c;
  };
  const c1 = mk('critic', 0);
  mk('blogger', 1);
  // 再塞一位普通顾客
  const c3 = G.spawnCustomer();
  c3.state = 'wait'; c3.waited = 10; c3.typeSeed = 2;
  S.customers.push(c3);

  const opts = [
    { t: '先摆盘、擦净碗边再端上去', ok: true },
    { t: '直接端上去，热就行', ok: false },
    { t: '让他自己到灶台前挑', ok: false },
  ];
  if (kind === 'pick') {
    S.qte = {
      type: 'blogger', name: '探店博主', kind: 'pick',
      total: 620, left: 470, cust: c1, base: 40, mul: 1.6,
      rep: 3, failRep: -2, ended: false, ok: false, options: opts,
    };
  } else {
    S.qte = {
      type: 'critic', name: '美食评论家', kind: 'timing',
      total: 620, left: Math.round(620 * 0.46), cust: c1, base: 40, mul: 2.2,
      rep: 4, failRep: -3, ended: false, ok: false, zone: [0.44, 0.60],
    };
  }
  S.banner = { text: '美食评论家：这摊子有点意思', kind: 'ok', until: S.tick + 99999 };
  return 'showcase ' + kind;
}






/* ---------------------------------------------------------------- 熟客自测（?dev=regulars） */
function regularsFlowTest() {
  const log = [];
  const s = G.s;
  const REG = G.DATA.regulars;
  if (!REG || !REG.types || !REG.types.length) throw new Error('regulars.json 没加载');

  // 造一个备餐局面：上架 4 道能做的菜，保证标签检查有意义
  if (!s.menu.some((m) => m.onMenu)) {
    G.availableFoods().filter((f) =>
      (!f.utensil || s.utensils.includes(f.utensil) || f.sellWo) && G.canMake(f))
      .slice(0, 4).forEach((f) => {
        if (!s.menu.find((m) => m.foodId === f.id)) G.toggleMenu(f.id);
      });
  }
  log.push('菜单 ' + s.menu.filter((m) => m.onMenu).length + ' 道');

  // ① 初始没有熟客
  if (Object.keys(s.regulars || {}).length) throw new Error('开局就有熟客？');
  log.push('开局无熟客 OK');

  // ② 服务差不会升级
  const ct = REG.types[0].id;
  const before = G.regularOf(ct).lv;
  for (let i = 0; i < 20; i++) G.tryUpgradeRegular(ct, 3.0);
  if (G.regularOf(ct).lv !== before) throw new Error('差评居然升级了');
  log.push('差评不升级 OK');

  // ③ 好评能升级
  s.regulars = {};
  let up = null;
  for (let i = 0; i < 40; i++) {
    s.regulars = {};            // 清 lastUpDay，模拟跨天
    up = G.tryUpgradeRegular(ct, 4.9);
    if (up) break;
  }
  if (!up || G.regularOf(ct).lv !== 1) throw new Error('好评没升成熟客：' + JSON.stringify(s.regulars));
  log.push('好评升级 OK（' + ct + ' Lv.1）');

  // ④ 同一天不能连升（升级本身是概率的，先确保升过一次再看限制）
  s.regulars = { [ct]: { lv: 0, favTag: REG.types[0].favTag, miss: 0 } };
  let guard4 = 0;
  while (G.regularOf(ct).lv === 0 && guard4++ < 60) {
    s.regulars[ct].lastUpDay = -1;      // 假装跨天，允许再掷一次
    G.tryUpgradeRegular(ct, 4.9);
  }
  if (G.regularOf(ct).lv !== 1) throw new Error('始终没升上去，无法验证同日限制');
  // 此时 lastUpDay 就是今天，紧接着再掷应当无效
  for (let i = 0; i < 30; i++) G.tryUpgradeRegular(ct, 5);
  if (G.regularOf(ct).lv !== 1) throw new Error('同一天连升了：' + G.regularOf(ct).lv);
  log.push('同日限一次 OK');

  // ⑤ 等级上限
  s.regulars = { [ct]: { lv: REG.maxLevel, favTag: REG.types[0].favTag, miss: 0 } };
  for (let i = 0; i < 10; i++) { s.regulars[ct].lastUpDay = -1; G.tryUpgradeRegular(ct, 5); }
  if (G.regularOf(ct).lv !== REG.maxLevel) throw new Error('超过上限了');
  log.push('Lv.' + REG.maxLevel + ' 封顶 OK');

  // ⑥ 熟客出现权重更高
  s.regulars = { [ct]: { lv: REG.maxLevel, favTag: REG.types[0].favTag, miss: 0 } };
  G.startSell();
  let hit = 0;
  for (let i = 0; i < 3000; i++) {
    const c = G.spawnCustomer();
    if (c.ctype === ct) hit++;
  }
  const expect = 3000 / REG.types.length;
  if (hit < expect * 1.2) throw new Error('熟客没更容易出现：' + hit + ' vs 均值 ' + Math.round(expect));
  log.push('出现权重 OK（' + hit + ' vs 均值 ' + Math.round(expect) + '）');

  // ⑦ 偏爱：熟客更想点自己爱吃的
  const fav = REG.types[0].favTag;
  const onMenuHasFav = s.menu.filter((m) => m.onMenu)
    .some((m) => (G.FOOD[m.foodId].tags || []).includes(fav));
  if (onMenuHasFav) {
    let want = 0, n = 0;
    for (let i = 0; i < 3000; i++) {
      const c = G.spawnCustomer();
      if (c.ctype !== ct) continue;
      n++;
      if (c.wantTag === fav) want++;
    }
    if (!(want > n * 0.3)) throw new Error('熟客没偏爱：' + want + '/' + n);
    log.push('偏爱 OK（' + want + '/' + n + '）');
  } else {
    log.push('菜单无该标签，跳过偏爱检查');
  }

  // ⑧ 连续两天没上爱吃的菜 → 掉级
  s.regulars = { [ct]: { lv: 2, favTag: 'no_such_tag', miss: 0 } };
  const lvB = G.regularOf(ct).lv;
  G.tickRegulars();
  if (G.regularOf(ct).lv !== lvB) throw new Error('第一次失望就掉级了');
  const news = G.tickRegulars();
  if (G.regularOf(ct).lv >= lvB) throw new Error('两次失望没掉级');
  if (!news.length) throw new Error('掉级没有产生播报');
  log.push('缺席掉级 OK（Lv.' + lvB + '→' + G.regularOf(ct).lv + '）');

  // ⑨ 上了爱吃的菜 → 失望清零
  s.regulars = { [ct]: { lv: 2, favTag: REG.types[0].favTag, miss: 1 } };
  const hasFav = G.menuCount(REG.types[0].favTag) > 0;
  if (hasFav) {
    G.tickRegulars();
    if ((s.regulars[ct].miss || 0) !== 0) throw new Error('上了爱吃的菜还没清零');
    log.push('上架即清零 OK');
  } else {
    log.push('菜单无该标签，跳过清零检查');
  }

  // ⑩ 存档往返：熟客 / 招牌 / 天气 / 事件都得存住
  s.regulars = { [ct]: { lv: 2, favTag: REG.types[0].favTag, miss: 1 } };
  s.signature = s.menu.find((m) => m.onMenu) ? s.menu.find((m) => m.onMenu).foodId : null;
  s.weather = 'rain';
  s.events = [{ id: 'clearance', name: '清仓甩卖', good: true, title: 'T', desc: 'D' }];
  save();
  const raw = localStorage.getItem('bushaoxin.save.v2');
  if (!raw) throw new Error('没写进存档');
  const back = JSON.parse(raw).run;
  if (!back.regulars || !back.regulars[ct] || back.regulars[ct].lv !== 2) {
    throw new Error('熟客没存住：' + JSON.stringify(back.regulars));
  }
  if (back.signature !== s.signature) throw new Error('招牌没存住');
  if (back.weather !== 'rain') throw new Error('天气没存住：' + back.weather);
  if (!back.events || back.events.length !== 1) throw new Error('事件没存住');
  log.push('存档往返 OK');

  return 'REGULARS OK — ' + log.join(' | ');
}

/* ---------------------------------------------------------------- 招牌菜自测（?dev=signature） */
function signatureFlowTest() {
  const log = [];
  const s = G.s;
  if (G.s.phase !== 'PREP') throw new Error('不在备餐阶段：' + G.s.phase);

  // 挑一道有厨具、配方短的菜
  const dish = G.availableFoods().find((f) => {
    const hasUt = !f.utensil || s.utensils.includes(f.utensil);
    return hasUt && f.recipe.length <= 2 && (f.space || 0) <= 2;
  });
  if (!dish) throw new Error('找不到合适的教学菜');

  // ① 按钮存在
  const btn = document.querySelector('.food[data-fid="' + dish.id + '"] [data-act="signature"]');
  if (!btn) throw new Error('没有「设为招牌」按钮');

  // ② 定招牌
  btn.click();
  if (s.signature !== dish.id) throw new Error('招牌没定上：' + s.signature);
  log.push('定招牌 OK：' + dish.name);

  // ③ 招牌自动上架
  const m = s.menu.find((x) => x.foodId === dish.id);
  if (!m || !m.onMenu) throw new Error('招牌没有自动上架');
  log.push('自动上架 OK');

  // ④ 同属性其他菜被下架 + 上架被拒
  const clash = G.availableFoods().find((f) => f.id !== dish.id
    && f.tags.some((t) => dish.tags.includes(t)));
  if (clash) {
    const r = G.toggleMenu(clash.id);
    const on = (s.menu.find((x) => x.foodId === clash.id) || {}).onMenu;
    if (on) throw new Error('冲突菜居然能上架：' + clash.name);
    if (!r.issues.some((i) => i.level === 'error')) throw new Error('冲突没有报错');
    log.push('冲突拦截 OK（' + clash.name + '）');
  } else {
    log.push('无同属性菜可测');
  }

  // ⑤ 台面多算了招牌位
  const usedWith = G.surfaceUsed();
  const saveSig = s.signature;
  s.signature = null;
  const usedWithout = G.surfaceUsed();
  s.signature = saveSig;
  const delta = usedWith - usedWithout;
  if (delta !== G.B.signatureSurface) {
    throw new Error('招牌台面位不对：' + delta + ' vs ' + G.B.signatureSurface);
  }
  log.push('占位 +' + delta + ' 格 OK');

  // ⑥ 出餐更快
  const tSig = G.prepMinutesFor(dish);
  s.signature = null;
  const tBase = G.prepMinutesFor(dish);
  s.signature = saveSig;
  if (!(tSig < tBase)) throw new Error('招牌没有更快：' + tSig + ' vs ' + tBase);
  log.push('备餐 ' + tBase.toFixed(2) + '→' + tSig.toFixed(2) + ' 分钟');

  // ⑦ 不能换招牌
  const r2 = G.setSignature(dish.id);
  if (r2.ok) throw new Error('居然允许换招牌');
  log.push('不可更换 OK');

  // ⑧ 出摊时招牌加价
  G.startSell();
  const S = G.s.sell;
  const mods = S.mods;
  const base = 20;
  const expect = base * mods.profitMul * mods.priceMul * (1 + G.B.signaturePriceUp / 100);
  const got = base * mods.profitMul * mods.priceMul
    * (s.signature === dish.id ? 1 + G.B.signaturePriceUp / 100 : 1);
  if (Math.abs(got - expect) > 0.01) throw new Error('招牌溢价算错');
  log.push('溢价 +' + G.B.signaturePriceUp + '% OK');

  return 'SIGNATURE OK — ' + log.join(' | ');
}

/* ---------------------------------------------------------------- 触屏诊断（?dev=touchdiag） */
function touchDiag() {
  const out = [];
  const cc = document.querySelector('.coach-card');
  if (cc) {
    const g = getComputedStyle(cc);
    out.push('coach bg=' + g.backgroundColor + ' z=' + g.zIndex
      + ' op=' + g.opacity + ' pos=' + g.position);
  } else out.push('coach=none');
  const co = document.getElementById('coach');
  if (co) {
    const g = getComputedStyle(co);
    const r = co.getBoundingClientRect();
    out.push('host z=' + g.zIndex + ' pos=' + g.position
      + ' rect top=' + Math.round(r.top) + ' bottom=' + Math.round(r.bottom)
      + ' left=' + Math.round(r.left) + ' right=' + Math.round(r.right));
  }
  const hud = document.getElementById('hud');
  if (hud) {
    const g = getComputedStyle(hud);
    const kids = [...hud.children].map((k) => {
      const r = k.getBoundingClientRect();
      return (k.className || k.tagName) + ':' + Math.round(r.top) + 'x' + Math.round(r.height);
    });
    out.push('hud h=' + Math.round(hud.getBoundingClientRect().height)
      + ' wrap=' + g.flexWrap + ' [' + kids.join(' ') + ']');
  }
  const mb = document.querySelector('#hud button.small.ghost');
  if (mb) {
    const g2 = getComputedStyle(mb);
    out.push('muteBtn cls=' + mb.className
      + ' minW=' + g2.minWidth + ' w=' + g2.width
      + ' pad=' + g2.padding + ' flex=' + g2.flex + ' disp=' + g2.display);
  }
  const cv = document.getElementById('sellcanvas');
  if (cv) {
    const g = getComputedStyle(cv);
    out.push('canvas z=' + g.zIndex + ' pos=' + g.position);
  }
  return 'DIAG ' + out.join(' | ');
}

/* ---------------------------------------------------------------- 触屏审计（?dev=touch） */
function touchAudit() {
  const SEL = 'button, .tile, .sup-tab, .qte-opt, .qte-btn, .food, .bonus, .dish-row, input, select, .mini';
  const nodes = [...document.querySelectorAll(SEL)];
  const small = [];
  nodes.forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;       // 隐藏的不算
    if (n.offsetParent === null) return;
    if (r.height < 43.5) {
      const label = (n.textContent || '').trim().slice(0, 10) || n.className || n.tagName;
      small.push(label + '=' + Math.round(r.height));
    }
  });
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const overflow = sw > vw + 1;

  // 触摸行为检查
  const probe = document.querySelector('.tile') || document.querySelector('button')
    || document.querySelector('#sellcanvas');
  const cs = probe ? getComputedStyle(probe) : null;
  const tapHl = cs ? cs.webkitTapHighlightColor : '-';
  const touchAct = cs ? cs.touchAction : '-';
  const userSel = cs ? cs.userSelect : '-';

  return 'TOUCH vw=' + vw + ' sw=' + sw + (overflow ? ' OVERFLOW!' : ' no-overflow')
    + ' | targets=' + nodes.length
    + ' | under44=' + small.length + (small.length ? ' [' + small.slice(0, 6).join(', ') + ']' : '')
    + ' | probe=' + (probe ? (probe.id || probe.className || probe.tagName) : 'none')
    + ' tap=' + tapHl + ' action=' + touchAct + ' select=' + userSel
    + ' | canvasTA=' + (document.getElementById('sellcanvas')
        ? getComputedStyle(document.getElementById('sellcanvas')).touchAction : '-');
}

/* ---------------------------------------------------------------- 新手教程自测（?dev=tutorial） */
function tutorialFlowTest() {
  const log = [];
  const step = () => (G.s.tut | 0);
  const coachTitle = () => {
    const el2 = document.querySelector('#coach .coach-title');
    return el2 ? el2.textContent.trim() : '';
  };
  const expect = (n, label) => {
    if (step() !== n) throw new Error(`${label}：期望第 ${n + 1} 步，实际 ${step() + 1}`);
    Tut.syncPhase(G); Tut.paint(G);
  };
  

  if (!(G.s.tut === 0)) throw new Error('教程没有从第 1 步开始：tut=' + G.s.tut);
  Tut.syncPhase(G); Tut.paint(G);
  if (!document.querySelector('#coach.on')) throw new Error('教练卡没显示');
  if (!document.querySelector('.tut-hl')) throw new Error('没有高亮目标');
  log.push('① ' + coachTitle());

  // ① 点格子
  document.querySelector('.shelf .tile').click();
  expect(1, '点格子');
  log.push('② ' + coachTitle());

  // ② 结算采购
  document.querySelector('[data-act="cartCommit"]').click();
  expect(2, '结算采购');

  // ③ 去备餐
  document.querySelector('[data-act="toPrep"]').click();
  if (G.s.phase !== 'PREP') throw new Error('没进备餐：' + G.s.phase);
  expect(3, '去备餐');
  log.push('④ ' + coachTitle());

  // ④ 上架（用教程指定的那道菜）
  const card = document.querySelector('.food[data-fid="' + G.s.tutDish + '"]');
  if (!card) throw new Error('找不到教学菜卡：' + G.s.tutDish);
  const toggle = card.querySelector('[data-act="toggle"]');
  if (!toggle) throw new Error('教学菜没有上架按钮');
  toggle.click();
  expect(4, '上架');

  // ⑤ 备几份
  const card2 = document.querySelector('.food[data-fid="' + G.s.tutDish + '"]');
  const prepBtn = card2 && card2.querySelector('[data-act="prep"]');
  if (!prepBtn) throw new Error('上架后没有备餐按钮');
  prepBtn.click();
  expect(5, '备份');
  const preN = (G.s.premade[G.s.tutDish] || {}).n || 0;
  if (preN <= 0) throw new Error('备份后没有成品，教学菜=' + G.s.tutDish);
  log.push('⑥ ' + coachTitle());

  // ⑥ 出摊
  document.querySelector('[data-act="toSell"]').click();
  if (G.s.phase !== 'SELL') throw new Error('没进招摊：' + G.s.phase);
  expect(6, '出摊');
  log.push('⑦ ' + coachTitle());

  // ⑦ 等成交
  let guard = 0;
  while (step() === 6 && guard++ < 3000) {
    const q = G.s.sell.qte;
    if (q && !q.ended) G.resolveQte(true);
    G.tick();
    if (G.s.sell.served > 0) Tut.advance(G, 'served');
    Tut.syncPhase(G); Tut.paint(G);
  }
  if (step() === 6) throw new Error('等不到成交 tut=' + step()
    + ' phase=' + G.s.phase
    + ' served=' + (G.s.sell ? G.s.sell.served : 'nosell')
    + ' cust=' + (G.s.sell ? G.s.sell.customers.length : '-')
    + ' tick=' + (G.s.sell ? G.s.sell.tick : '-')
    + ' menu=' + G.s.menu.filter((m) => m.onMenu).length + ' lost=' + (G.s.sell ? G.s.sell.lost : '-') + ' pre=' + JSON.stringify(G.s.premade) + ' cap=' + (G.s.sell ? G.s.sell.queueCap : '-'));
  log.push('⑧ ' + coachTitle());

  // ⑧ 特殊来客：造一个 QTE 并答对
  if (step() === 7) {
    const c = G.spawnCustomer();
    c.special = 'critic'; c.state = 'wait'; c.typeSeed = 0; c.patience = 99999;
    G.s.sell.customers.push(c);
    G.s.sell.qte = {
      type: 'critic', name: '美食评论家', kind: 'timing',
      total: 620, left: 300, cust: c, base: 40, mul: 2.2,
      rep: 4, failRep: -3, ended: false, ok: false, zone: [0.44, 0.60],
    };
    Tut.syncPhase(G); Tut.paint(G);
    const btn = document.querySelector('[data-act="qteHit"]');
    if (btn) btn.click(); else G.resolveQte(true);
    log.push('⑨ ' + coachTitle());
  }

  // ⑨ 打完收工 → 结算选卡
  while (!G.s.sell.done && guard++ < 20000) G.tick();
  finishSell();
  if (G.s.phase !== 'SETTLE') throw new Error('没进结算：' + G.s.phase);
  Tut.syncPhase(G); Tut.paint(G);
  const bonus = document.querySelector('[data-act="bonus"]');
  if (!bonus) throw new Error('结算没出加成卡');
  const before = step();
  bonus.click();
  if (step() <= before) throw new Error('选卡后教程没结束');
  if (step() < Tut.stepCount()) throw new Error('教程没走到结尾：' + step() + '/' + Tut.stepCount());
  if (document.querySelector('#coach.on')) throw new Error('教程结束后教练卡还在');
  log.push('全部 ' + Tut.stepCount() + ' 步完成');

  return 'TUTORIAL OK — ' + log.join(' | ');
}

/* ---------------------------------------------------------------- QTE 自测（?dev=qte） */
function qteFlowTest() {
  const log = [];
  const S = () => G.s.sell;

  // 造一个特殊顾客直接进队并成交，触发 QTE
  const forceQte = (special) => {
    const c = G.spawnCustomer();
    c.special = special;
    c.mood = 'normal';
    c.state = 'wait';
    c.typeSeed = 0;
    c.patience = 100000;
    S().customers.push(c);
    return c;
  };

  // ① timing 类型：指针在绿区时按下 → 成功
  const before1 = G.s.rep;
  const c1 = forceQte('critic');
  S().qte = {
    type: 'critic', name: '美食评论家', kind: 'timing',
    total: 620, left: 620, cust: c1, base: 40, mul: 2.2,
    rep: 4, failRep: -3, ended: false, ok: false, zone: [0.44, 0.60],
  };
  // 把指针推到绿区中央（pos ≈ 0.52 → left = 620*0.48 ≈ 298）
  S().qte.left = Math.round(620 * (1 - 0.52));
  updateSellStats(G);
  const hitBtn = document.querySelector('[data-act="qteHit"]');
  if (!hitBtn) throw new Error('timing QTE 没渲染出「上菜」按钮');
  const rev0 = S().revenue;
  hitBtn.click();
  if (S().qte) throw new Error('点完 QTE 没有清空');
  if (S().revenue <= rev0) throw new Error('QTE 成功没有加钱');
  if (G.s.rep <= before1) throw new Error('QTE 成功没有加口碑');
  log.push(`timing 成功 +¥${(S().revenue - rev0).toFixed(0)} 口碑 ${Math.round(before1)}→${Math.round(G.s.rep)}`);

  // ② pick 类型：选对 → 成功
  const c2 = forceQte('blogger');
  const opts = [
    { t: '擦亮碗边再端上去', ok: true },
    { t: '直接端上去', ok: false },
    { t: '让她自己挑', ok: false },
  ];
  S().qte = {
    type: 'blogger', name: '探店博主', kind: 'pick',
    total: 620, left: 500, cust: c2, base: 40, mul: 1.6,
    rep: 3, failRep: -2, ended: false, ok: false, options: opts,
  };
  updateSellStats(G);
  const btns = [...document.querySelectorAll('[data-act="qtePick"]')];
  if (btns.length !== 3) throw new Error('pick QTE 选项数不对：' + btns.length);
  const rep2 = G.s.rep;
  btns[0].click();
  if (!(G.s.rep > rep2)) throw new Error('pick 选对没有加口碑');
  log.push('pick 成功 +口碑');

  // ③ 失败路径：选错
  const c3 = forceQte('eater');
  const rep3 = G.s.rep;
  S().qte = {
    type: 'eater', name: '大胃王', kind: 'pick',
    total: 620, left: 500, cust: c3, base: 40, mul: 2.6,
    rep: 1, failRep: -1, ended: false, ok: false,
    options: [{ t: '错的', ok: false }, { t: '对的', ok: true }, { t: '也错', ok: false }],
  };
  updateSellStats(G);
  document.querySelectorAll('[data-act="qtePick"]')[0].click();
  if (G.s.rep >= rep3) throw new Error('选错没有掉口碑');
  log.push('pick 失败 -口碑');

  // ④ 超时路径
  const c4 = forceQte('foodie');
  const rep4 = G.s.rep;
  S().qte = {
    type: 'foodie', name: '老饕', kind: 'timing',
    total: 620, left: 2, cust: c4, base: 40, mul: 1.9,
    rep: 3, failRep: -2, ended: false, ok: false, zone: [0.44, 0.60],
  };
  for (let i = 0; i < 5; i++) G.tick();
  if (S().qte) throw new Error('超时后 QTE 没结束');
  if (G.s.rep >= rep4) throw new Error('超时没有掉口碑');
  log.push('超时判负 OK');

  // ⑤ 连点：点够次数即成功
  const c5 = forceQte('eater');
  S().qte = {
    type: 'eater', name: '大胃王', kind: 'mash',
    total: 620, left: 600, cust: c5, base: 40, mul: 2.6,
    rep: 1, failRep: -1, ended: false, ok: false, hits: 0, need: 12,
  };
  updateSellStats(G);
  const tapBtn = document.querySelector('[data-act="qteTap"]');
  if (!tapBtn) throw new Error('连点 QTE 没渲染出按钮');
  for (let i = 0; i < 11; i++) {
    const b = document.querySelector('[data-act="qteTap"]');
    if (!b) break;
    b.click();
  }
  if (!S().qte) throw new Error('点 11 次就结束了？');
  if ((S().qte.hits || 0) < 11) throw new Error('连点没记上：' + (S().qte.hits || 0));
  const bLast = document.querySelector('[data-act="qteTap"]');
  if (bLast) bLast.click();
  if (S().qte) throw new Error('点够 12 次后 QTE 没结束');
  log.push('连点 OK（12 次判成功）');

  // ⑥ 算账：选对找零
  const c6 = forceQte('critic');
  S().qte = {
    type: 'critic', name: '美食评论家', kind: 'math',
    total: 620, left: 560, cust: c6, base: 40, mul: 2.2,
    rep: 4, failRep: -3, ended: false, ok: false,
    bill: 50, paid: 32.5, change: 17.5,
    options: [{ v: 27.5, ok: false }, { v: 17.5, ok: true }, { v: 12.5, ok: false }, { v: 7.5, ok: false }],
  };
  updateSellStats(G);
  const mathBtns = [...document.querySelectorAll('[data-act="qtePick"].math, .qte-opt.math')];
  if (mathBtns.length !== 4) throw new Error('算账选项数不对：' + mathBtns.length);
  const repM = G.s.rep;
  mathBtns[1].click();
  if (!(G.s.rep > repM)) throw new Error('算账选对没加口碑');
  log.push('算账 OK（选对 +口碑）');

  // ⑦ 节奏：三个拍点全中 → 成功
  const c7 = forceQte('foodie');
  const mkRhythm = (base, mul) => ({
    type: 'foodie', name: '炸货老饕', kind: 'rhythm',
    total: 620, left: 620, cust: base, base: 40, mul: mul || 1.9,
    rep: 3, failRep: -2, ended: false, ok: false,
    beats: [0.22, 0.5, 0.78], beatIndex: 0, hits: 0, misses: 0,
    tol: 0.085, flash: [],
  });
  S().qte = mkRhythm(c7);
  updateSellStats(G);
  if (!document.querySelector('.qte-lane.rhythm')) throw new Error('节奏 QTE 没渲染出轨道');
  // 在三个拍点各点一次
  [0.22, 0.5, 0.78].forEach((b) => {
    const q = S().qte;
    if (!q) return;
    q.left = Math.round(q.total * (1 - b));
    G.qteTap();
  });
  if (S().qte) throw new Error('三拍全中还没结束：' + JSON.stringify(S().qte.beatIndex));
  log.push('节奏 3/3 OK');

  // ⑧ 节奏：只中两拍 → 仍算接住，但溢价减半
  const c8 = forceQte('foodie');
  S().qte = mkRhythm(c8);
  [0.22, 0.5].forEach((b) => {
    const q = S().qte;
    if (!q) return;
    q.left = Math.round(q.total * (1 - b));
    G.qteTap();
  });
  // 第三拍故意错过：把时间推过去（需 ~174 tick 才到 0.78）
  if (S().qte) {
    for (let i = 0; i < 400 && S().qte; i++) G.tick();
  }
  if (S().qte) throw new Error('第三拍漏了还没结束');
  log.push('节奏 2/3 OK（减半）');

  // ⑨ 节奏：一拍不中 → 失败
  const c9 = forceQte('foodie');
  S().qte = mkRhythm(c9);
  const rep9 = G.s.rep;
  for (let i = 0; i < 700 && S().qte; i++) G.tick();
  if (S().qte) throw new Error('一拍没中还没结束');
  if (!(G.s.rep <= rep9)) throw new Error('全漏了口碑没掉');
  log.push('节奏 0/3 判负 OK');

  // ⑩ 节奏：点早了不算命中
  const c10 = forceQte('foodie');
  S().qte = mkRhythm(c10);
  S().qte.left = Math.round(S().qte.total * (1 - 0.05));   // 离第一拍还早
  const r10 = G.qteTap();
  if (!r10 || !r10.early) throw new Error('点早了没判早');
  if ((S().qte.hits || 0) !== 0) throw new Error('点早了却算命中');
  log.push('节奏点早判早 OK');
  S().qte = null;

  // ⑪ 特殊顾客出现在队列里，且渲染不炸
  if (!S().customers.some((c) => c.special)) throw new Error('特殊顾客没进队列');
  log.push('特殊顾客入队 OK');

  return 'QTE OK — ' + log.join(' | ');
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

/* ---------------------------------------------------------------- 菜单高度探测（?dev=menuprobe） */
function menuProbe() {
  if (!document.querySelector('#stage .menu')) showMenu();
  const st = document.getElementById('stage');
  if (!st) { document.title = 'MENUPROBE no stage'; return; }
  const mn = st.querySelector('.menu');
  const cr = mn && mn.querySelector('.menu-credits');
  const sr = st.getBoundingClientRect();
  const mr = mn ? mn.getBoundingClientRect() : null;
  const cbr = cr ? cr.getBoundingClientRect() : null;
  document.title = 'MENUPROBE stage=' + Math.round(sr.height)
    + ' menu=' + (mr ? Math.round(mr.height) : '-')
    + ' scrollH=' + st.scrollHeight + ' clientH=' + st.clientHeight
    + ' credits=' + (cbr ? Math.round(cbr.bottom) : '-')
    + ' stageBottom=' + Math.round(sr.bottom)
    + ' overflow=' + (cbr && cbr.bottom > sr.bottom ? 'YES' : 'no');
}

function devAuto(mode) {
  if (mode === 'stock' || mode === 'cart' || mode === 'tutorial' || mode === 'touch') return;   // 停在备货阶段，方便截图/调试
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

  if (mode === 'prep' || mode === 'signature' || mode === 'sigview'
    || mode === 'regulars' || mode === 'regsview') return;
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
  if (S.served > 0) Tut.advance(G, 'served');   // 教程：第一次有成交就推进
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
      Tut.advance(G, 'cartAdd');
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
      Tut.advance(G, 'cartCommit');
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
      menuOpts = { confirming: false, help: false, archive: false };
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
    case 'tutSkip': {
      Tut.disable(G);
      toast('已跳过新手引导');
      save();
      break;
    }
    case 'tutRestart': {
      Tut.restart(G);
      route();
      save();
      break;
    }
    case 'archive': {
      menuOpts.archive = true;
      showMenu();
      break;
    }
    case 'help': {
      menuOpts.help = true;
      showMenu();
      break;
    }
    case 'backMenu': {
      menuOpts.help = false;
      menuOpts.archive = false;
      menuOpts.confirming = false;
      showMenu();
      break;
    }
    case 'toPrep': {
      Tut.advance(G, 'toPrep');
      G.finishStock();
      route();
      break;
    }
    case 'qteTap': {
      Tut.advance(G, 'qte');
      const r = G.qteTap();
      if (r && r.done === false) break;      // 还没点够，继续
      if (r && r.ok !== undefined) toast(r.ok ? `${r.name}：够快` : `${r.name}：太慢了`);
      break;
    }
    case 'qteHit': {
      const S = G.s.sell;
      const q = S && S.qte;
      if (!q || q.ended) break;
      const pos = 1 - q.left / q.total;
      const z = q.zone || [0.44, 0.60];
      const ok = pos >= z[0] && pos <= z[1];
      Tut.advance(G, 'qte');
      const r = G.resolveQte(ok, ok ? '' : '手慢了');
      if (r) toast(r.ok ? `${r.name}：好手艺` : `${r.name}：差点意思`);
      break;
    }
    case 'qtePick': {
      const S = G.s.sell;
      const q = S && S.qte;
      if (!q || q.ended) break;
      const opt = (q.options || [])[+t.dataset.i];
      Tut.advance(G, 'qte');
      const r = G.resolveQte(!!(opt && opt.ok), opt && opt.ok ? '' : '做错了');
      if (r) toast(r.ok ? `${r.name}：这摊子值得再来` : `${r.name}：就这？`);
      break;
    }
    case 'traitFilter': {
      setTraitFilter(t.dataset.f);
      keepScroll(() => renderPrep(G));
      break;
    }
    case 'signature': {
      const r = G.setSignature(t.dataset.f);
      if (!r.ok) { toast(r.msg); break; }
      toast('招牌定下了：' + G.FOOD[t.dataset.f].name + '（这一轮不能换）');
      hud(G); keepScroll(() => renderPrep(G)); save();
      break;
    }
    case 'toggle': {
      Tut.advance(G, 'toggle');
      const v = G.toggleMenu(t.dataset.f);
      if (v.issues.some((i) => i.level === 'error')) toast(v.issues.find((i) => i.level === 'error').msg);
      hud(G); keepScroll(() => renderPrep(G)); save();
      break;
    }
    case 'prep': {
      Tut.advance(G, 'prep');
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
      Tut.advance(G, 'toSell');
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
      Tut.advance(G, 'bonus');
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
