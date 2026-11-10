// ui.js — 全部界面（DOM 渲染 + 事件委托）
import { icon } from './sprites.js';
import { formatTime } from './save.js';
import * as Audio from './audio.js';
import { digits, num } from './digits.js?v=3';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);

export function toast(msg) {
  const box = el('toast');
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => d.remove(), 1800);
}

const money = (n) => {
  const v = Math.abs(n);
  const body = v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('zh-CN');
  return (n < 0 ? '-¥' : '¥') + body;
};
const pct = (n) => `${Math.round(n * 100)}%`;


/** 重渲染前后保留滚动位置：菜谱速查 / 库存 / 整个 stage */
export function keepScroll(renderFn) {
  const nodes = [...document.querySelectorAll('#stage, #stage .scroll')];
  const saved = nodes.map((n) => n.scrollTop);
  renderFn();
  const after = [...document.querySelectorAll('#stage, #stage .scroll')];
  after.forEach((n, i) => { if (saved[i] != null) n.scrollTop = saved[i]; });
}

export function hud(G) {
  const s = G.s;
  const phaseName = { STOCK: '备货', PREP: '备餐', SELL: '出摊', SETTLE: '结算', META: '局外' }[s.phase] || s.phase;
  const total = s.phase === 'STOCK' ? G.B.stockMinutes : s.phase === 'PREP' ? G.B.prepMinutes : 0;
  let bar = '';
  if (s.phase === 'STOCK' || s.phase === 'PREP') {
    const p = Math.max(0, Math.min(1, s.minutesLeft / total));
    bar = `<div class="hud-timer">${icon('ui/ui_dot_full.png', 18)}
      <div class="bar ${p < 0.25 ? 'warn' : ''}"><i style="width:${p * 100}%"></i></div>
      <span class="dg-min">${digits(Math.round(s.minutesLeft), { size: 16 })}</span><span class="u">分</span></div>`;
  } else if (s.phase === 'SELL' && s.sell) {
    const p = s.sell.tick / G.B.sellTicks;
    bar = `<div class="hud-timer">${icon('ui/ui_dot_full.png', 18)}
      <div class="bar"><i style="width:${p * 100}%"></i></div>
      <span>${(p * 100).toFixed(0)}%</span></div>`;
  }
  el('hud').innerHTML = `
    <span class="hud-day">第 ${s.day} / ${G.B.dayCount} 天</span>
    <span class="hud-cash ${s.cash < 0 ? 'neg' : ''}">${digits(num(s.cash), { size: 32 })}</span>
    <span class="hud-phase">${phaseName}</span>
    ${bar}
    <span class="hud-spacer"></span>
    <span class="hud-meta">口碑 ${Math.round(s.rep)} · 昨日 ${Math.round(s.lastScore)} 分 · 第 ${s.run} 轮</span>
    <button class="small ghost" data-act="mute" title="BGM 开 / 关">${Audio.isMuted() ? '静' : '音'}</button>
    <button class="small ghost" data-act="menu">菜单</button>
  `;
}



/* ---------------------------------------------------------------- 叙事文案 */
/** story.json 里取一段；缺失时返回空，绝不报错 */
function ST(G) {
  return (G && G.DATA && G.DATA.story) || null;
}

/** 当天的开场白 */
export function dayIntro(G) {
  const st = ST(G);
  if (!st || !st.dayIntro) return null;
  return st.dayIntro.find((d) => d.day === G.s.day) || null;
}

/** 按评分挑档位：excellent / good / normal / poor / bad */
export function gradeOf(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'normal';
  if (score >= 35) return 'poor';
  return 'bad';
}

/** 结算那句评语（同一天同一档只变一次，避免抖动） */
export function settleLine(G, score) {
  const st = ST(G);
  if (!st || !st.settleGrade) return null;
  const g = st.settleGrade[gradeOf(score)];
  if (!g || !g.lines || !g.lines.length) return null;
  const pick = g.lines[(G.s.day || 0) % g.lines.length];
  return { title: g.title, text: pick };
}

/** 结局文案：按七天的评分总和挑档位 */
export function endingOf(G) {
  const st = ST(G);
  if (!st || !st.ending) return null;
  const hist = (G.s.history || []);
  const total = hist.length
    ? hist.reduce((a, h) => a + (h.score || 0), 0)
    : (G.s.lastScore || 0) * 7;
  const key = total >= 520 ? 'great' : total >= 370 ? 'ok' : 'weak';
  return st.ending[key] || null;
}


/** 词条的氛围句（story.json 里预写，按 id 取） */
export function traitFlavor(G, id) {
  const st = ST(G);
  if (!st || !st.traitsFlavor) return '';
  return st.traitsFlavor[id] || '';
}

/** 顾客小传 */
export function customerBio(G, type) {
  const st = ST(G);
  if (!st || !st.customers) return null;
  return st.customers[type] || null;
}

/* ---------------------------------------------------------------- 主菜单 */
const HELP = [
  ['目标', '七天一期。把一个小摊子做成这条街最亮的那个。'],
  ['一天三段', '备货 8:00-14:00 买料 → 备餐 14:00-20:00 定菜单/定价/预加工 → 出摊 20:00-24:00 实时 60 秒。'],
  ['词条', '同属性的菜上架够款数才会点亮词条（速食 3 款 / 辣 4 款 / 饮品 5 款…）。'],
  ['层数', '卖出成交会养层数，层数永久累积、不封顶，跨日跨轮都在。'],
  ['风味', '预加工成成品的能立刻取走，但放久了会掉档；废档不能卖。'],
  ['评分', '营业额达成 + 顾客满意度 − 客诉 − 缺货流失。评分决定次日客流和今日经验。'],
  ['存档', '阶段切换自动存本地。出摊中途退回菜单会回到备餐阶段。'],
];


/** 街坊名录：把 story.json 里写的顾客小传展示出来 */
export function renderArchive(o) {
  const story = o.story || null;
  const CUST = [
    ['student', '学生'], ['worker', '夜班工人'], ['runner', '外卖骑手'], ['courier', '跑腿的'],
    ['couple', '情侣'], ['elder', '老街坊'], ['drunk', '喝多了的'], ['child', '小孩'],
  ];
  const SPECIAL = [
    ['blogger', '探店博主', 'pick'], ['critic', '美食评论家', 'timing'],
    ['eater', '大胃王', 'pick'], ['foodie', '老饕', 'timing'],
    ['gold_courier', '金主代跑', 'timing'],
  ];

  const cards = CUST.map(([id, fallback]) => {
    const b = (story && story.customers && story.customers[id]) || {};
    return `<div class="arch-card">
      <span class="arch-ico">${icon('char/chr_customer_' + id + '_wait.png', 56)}</span>
      <div class="arch-body">
        <b>${b.name || fallback}</b>
        <span class="arch-bio">${b.bio || ''}</span>
        ${b.line ? `<em class="arch-line">「${b.line}」</em>` : ''}
      </div>
    </div>`;
  }).join('');

  const specials = SPECIAL.map(([id, name, kind]) => `
    <div class="arch-card special">
      <span class="arch-ico">${icon('char/chr_special_' + id + '_normal.png', 72)}</span>
      <div class="arch-body">
        <b>${name}</b>
        <span class="arch-bio">${kind === 'pick' ? '考你怎么应对 · 三选一' : '考你手速 · 指针进绿区'}</span>
      </div>
    </div>`).join('');

  el('stage').innerHTML = `<div class="menu archive">
    <div class="menu-kicker">街坊名录</div>
    <h1 class="menu-title arch-title">这条街上<br><span>都是什么人</span></h1>
    <p class="menu-sub">客人不是数字。他们的口袋、胃口和耐心都不一样，记住谁在等什么。</p>

    <div class="arch-section">常客</div>
    <div class="arch-grid">${cards}</div>

    <div class="arch-section">特殊来客 <span class="muted tiny">（出摊时小概率出现，成交后会考你一道题）</span></div>
    <div class="arch-grid special">${specials}</div>

    <div class="menu-actions">
      <button class="primary" data-act="backMenu">← 返回主菜单</button>
    </div>
  </div>`;
  el('bar').innerHTML = `<span>特殊来客答对加钱加口碑，答错或超时会掉口碑，超时罚得轻一些。</span>`;
}

export function renderMenu(o) {
  const d = o.desc;
  el('hud').innerHTML = `<span class="hud-day">不烧心夜市挑战</span>
    <span class="hud-spacer"></span>
    <span class="hud-meta">本地存档 · v0.4</span>`;

  if (o.archive) {
    renderArchive(o);
    return;
  }

  if (o.help) {
    el('stage').innerHTML = `<div class="menu">
      <div class="menu-kicker">玩法速览</div>
      ${HELP.map(([k, v]) => `<div class="menu-help-row"><b>${k}</b><span>${v}</span></div>`).join('')}
      <div class="menu-actions">
        <button class="primary" data-act="backMenu">← 返回主菜单</button>
      </div>
    </div>`;
    el('bar').innerHTML = `<span>存档在本地浏览器里，换浏览器就没了。</span>`;
    return;
  }

  const saveLine = d ? `第 ${d.day} / 7 天 · ${money(d.cash)}` : '还没有存档';

  const open = o.opening;
  el('stage').innerHTML = `<div class="menu">
    <div class="menu-kicker">${open ? open.sub : '七天 · 一个新摊位'}</div>
    <h1 class="menu-title">不烧心<br /><span>夜市挑战</span></h1>
    <p class="menu-sub">备货 → 备餐 → 出摊 60 秒。词条层数不封顶，摊子越做越亮。</p>
    ${open ? `<blockquote class="menu-prologue">${open.lines.map((l) => `<span>${l}</span>`).join('')}</blockquote>` : ''}

    <div class="menu-actions">
      ${d ? `<button class="primary big" data-act="continue">继续 · ${saveLine}</button>` : ''}
      ${o.hasMeta ? `<button class="big" data-act="newRun">开始新一轮（继承层数与技能）</button>` : ''}
      ${d || o.hasMeta ? '' : `<button class="primary big" data-act="newRun">开始第一轮</button>`}
      <button data-act="help">玩法说明</button>
      <button data-act="archive">街坊名录</button>
      ${o.canTutorial ? '<button data-act="tutRestart">重看新手引导</button>' : ''}
      ${d || o.hasMeta ? `<button class="danger" data-act="wipe">${o.confirming ? '确定清空存档？再点一次' : '清空存档'}</button>` : ''}
    </div>

    <div class="menu-foot">
      ${d ? `第 ${d.runNo} 轮 · 口碑 ${d.rep} · 存档 ${formatTime(o.savedAt)}` : '进度会存在浏览器里（localStorage）'}
      ${o.hasMeta ? ` · 词条层数 ${o.layerTotal} 点` : ''}
    </div>
  </div>`;
  el('bar').innerHTML = `<span>${d ? '继续上次进度，或开新一轮。' : '点上面的按钮开始。'}</span>`;
}


/* ---------------------------------------------------------------- 今日天气 / 事件 */
function weatherOf(G) {
  const list = (G.DATA && G.DATA.weather) || [];
  return list.find((w) => w.id === (G.s.weather || 'clear')) || list[0] || null;
}

/** 天气 + 今日事件的一条横带；两个阶段都用它 */
function dayStrip(G) {
  const w = weatherOf(G);
  const evs = G.s.events || [];
  const rival = G.s.rival;

  const weatherChip = w ? `<span class="day-chip wx-${w.id}" title="${w.desc}">
      ${icon(w.icon, 20)}<b>${w.name}</b><span class="day-chip-desc">${w.desc}</span>
    </span>` : '';

  const evChips = evs.map((e) => `<span class="day-chip ev ${e.good ? 'good' : 'bad'}">
      <b>${e.name}</b><span class="day-chip-desc">${e.title}</span>
    </span>`).join('');

  const rivalChip = rival && rival.strength > 0.02
    ? `<span class="day-chip rival" title="他会抢走一部分客人，你越强他越努力">
        <b>${rival.name}</b><span class="day-chip-desc">抢客 ${Math.round(rival.strength * 100)}%</span>
      </span>` : '';

  if (!weatherChip && !evChips && !rivalChip) return '';
  return `<div class="day-strip">${weatherChip}${evChips}${rivalChip}</div>`;
}

/* ---------------------------------------------------------------- 备货 */
function recipeText(G, f, opts) {
  const s = G.s;
  const showStock = !opts || opts.stock !== false;
  return f.recipe.map((r) => {
    const ing = G.ING[r.ing];
    const have = s.inventory[r.ing] || 0;
    const enough = have >= r.qty;
    const tail = showStock ? ` <span class="${enough ? 'muted' : 'lack'}">(${have})</span>` : '';
    return `<span class="${enough ? '' : 'lack'}">${ing.name}×${r.qty}</span>${tail}`;
  }).join(' · ');
}

/** 备餐页词条树的筛选：all / on / near */
const prepView = { traitFilter: 'all' };

export function setTraitFilter(f) { prepView.traitFilter = f; }
export function getTraitFilter() { return prepView.traitFilter; }

/** 备货页的视图状态：当前供应商页签 + 购物车（key = "si:ii"） */
const stockView = { tab: 0, cart: {} };

export function resetStockView() {
  stockView.tab = 0;
  stockView.cart = {};
}

export function cartLines(G) {
  return Object.entries(stockView.cart)
    .map(([k, q]) => {
      const [si, ii] = k.split(':').map(Number);
      const sup = G.s.suppliers[si];
      const it = sup && sup.items[ii];
      if (!it || q <= 0) return null;
      return { key: k, si, ii, q, ingId: it.ingId, price: it.price, cost: it.price * q };
    })
    .filter(Boolean);
}

export function addToCart(si, ii) {
  const k = si + ':' + ii;
  stockView.cart[k] = (stockView.cart[k] || 0) + 1;
}

export function subFromCart(key) {
  if (!stockView.cart[key]) return;
  stockView.cart[key] -= 1;
  if (stockView.cart[key] <= 0) delete stockView.cart[key];
}

export function clearCart() { stockView.cart = {}; }
export function setStockTab(i) { stockView.tab = i; }
export function getStockTab() { return stockView.tab; }

export function renderStock(G) {
  const s = G.s;
  const st = el('stage');
  const used = G.storageUsed();

  // 页签保证不越界
  if (stockView.tab >= s.suppliers.length) stockView.tab = 0;
  const cur = s.suppliers[stockView.tab];

  // ---------- 供应商页签 ----------
  const tabs = s.suppliers.map((sup, si) => `
    <button class="sup-tab ${si === stockView.tab ? 'on' : ''} ${sup.closed ? 'closed' : ''}"
      data-act="stockTab" data-s="${si}">
      ${sup.name}${sup.closed ? '（歇业）' : ''}
    </button>`).join('');

  // ---------- 货架格子 ----------
  let shelf = '';
  if (!cur) {
    shelf = '<div class="hint">今天没有开门的供应商。</div>';
  } else if (cur.closed) {
    shelf = `<div class="shelf-empty">${cur.name} 今天没开门，换一家看看。</div>`;
  } else {
    const tiles = cur.items.map((it, ii) => {
      const ing = G.ING[it.ingId];
      const out = it.stock <= 0;
      const q = stockView.cart[stockView.tab + ':' + ii] || 0;
      return `<button class="tile ${out ? 'out' : ''} ${q > 0 ? 'picked' : ''}"
        data-act="cartAdd" data-s="${stockView.tab}" data-i="${ii}"
        ${out ? 'disabled' : ''} title="${ing.name} · 单价 ${money(it.price)}">
        <span class="tile-ico">${icon(ing.sprite, 40)}</span>
        <span class="tile-name">${ing.name}</span>
        <span class="tile-row"><b>${money(it.price)}</b><em>${out ? '售罄' : '×' + it.stock}</em></span>
        ${q > 0 ? `<span class="tile-badge">${q}</span>` : ''}
      </button>`;
    }).join('');
    shelf = `<div class="shelf">${tiles}</div>`;
  }

  // ---------- 菜谱速查 ----------
  const dishes = G.availableFoods().map((f) => {
    const tags = f.tags.map((t) => `<span class="dish-tags">${G.TAG[t] ? G.TAG[t].name : t}</span>`).join(' ');
    const canMake = f.recipe.every((r) => (s.inventory[r.ing] || 0) >= r.qty || !!G.offerFor(r.ing));
    return `<div class="dish-row">
      <span>${icon(f.sprite, 44)}</span>
      <span>
        <div class="dish-name">${f.name} ${tags} <span class="muted">· ${money(f.price)}</span></div>
        <div class="dish-recipe">${recipeText(G, f)}</div>
      </span>
      <button class="small" data-act="buyDish" data-f="${f.id}" data-n="5" ${canMake ? '' : 'disabled'}>+5 份料</button>
    </div>`;
  }).join('');

  // ---------- 库存 ----------
  const invRows = Object.entries(s.inventory)
    .filter(([, q]) => q > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, q]) => {
      const ing = G.ING[id];
      return `<div class="item" style="grid-template-columns:24px 1fr auto auto">
        <span>${icon(ing.sprite, 24)}</span>
        <span class="item-name">${ing.name}</span>
        <span class="item-stock">${ing.catName}</span>
        <span class="item-stock">×${q}</span></div>`;
    }).join('') || '<div class="hint">还没有进货。</div>';

  // ---------- 购物车 ----------
  const lines = cartLines(G);
  const total = lines.reduce((a, l) => a + l.cost, 0);
  const cartBody = lines.length
    ? lines.map((l) => `<span class="cart-line">
        ${icon(G.ING[l.ingId].sprite, 20)}
        <b>${G.ING[l.ingId].name}</b>
        <em>×${l.q}</em>
        <i>${money(l.cost)}</i>
        <button class="mini" data-act="cartSub" data-k="${l.key}" title="减 1">−</button>
      </span>`).join('')
    : '<span class="cart-empty">点上面的格子把食材放进来</span>';

  st.innerHTML = `<div class="stock-root">
    <div class="stock-top">
      <div class="panel stock-shelf-panel">
        <h3 class="panel-title">今天的供应商 · 点格子进货</h3>
        ${dayStrip(G)}
        <div class="sup-tabs">${tabs}</div>
        ${shelf}
      </div>
      <div class="panel stock-recipe-panel">
        <h3 class="panel-title">菜谱速查 · 买料之前先看这里</h3>
        <div class="scroll" id="scrollRecipe">${dishes}</div>
        <div class="hint mt8">括号里是手上的库存。点「+5 份料」按这道菜 5 份的用量去今天的供应商买，可连点累加。</div>
      </div>
      <div class="panel stock-inv-panel">
        <h3 class="panel-title">手上库存 ${used.toFixed(1)} / ${G.B.storage} 格</h3>
        <div class="scroll" id="scrollInv">${invRows}</div>
      </div>
    </div>
    <div class="cart">
      <span class="cart-title">购物车</span>
      <div class="cart-lines">${cartBody}</div>
      <span class="cart-total ${total > s.cash ? 'over' : ''}">合计 ${money(total)}</span>
      <button class="small" data-act="cartClear" ${lines.length ? '' : 'disabled'}>清空</button>
      <button class="primary" data-act="cartCommit" ${lines.length ? '' : 'disabled'}>结算采购</button>
    </div>
  </div>`;

  el('bar').innerHTML = `
    <span>采购会消耗分钟：剩余 ${Math.round(s.minutesLeft)} 分钟 · 手里 ${money(s.cash)}</span>
    <span class="spacer"></span>
    <button class="primary" data-act="toPrep">去备餐 →</button>
    <span class="spacer"></span>`;
}

/* ---------------------------------------------------------------- 备餐 */
export function renderPrep(G) {
  const s = G.s;
  const intro = dayIntro(G);
  const act = G.activeTraits();
  const mods = G.effects();
  const avail = G.availableFoods();

  const sigId = s.signature || null;
  const sigFood = sigId ? G.FOOD[sigId] : null;
  const foodRows = avail.map((f) => {
    const m = s.menu.find((x) => x.foodId === f.id);
    const on = m && m.onMenu;
    const hasUt = !f.utensil || s.utensils.includes(f.utensil);
    const isSig = sigId === f.id;
    const clash = G.conflictsSignature(f.id);
    const raw = G.rawCapacity(f);
    const pre = s.premade[f.id] ? s.premade[f.id].n : 0;
    const recipeLine = f.recipe.map((r) => {
      const ing = G.ING[r.ing];
      const have = s.inventory[r.ing] || 0;
      const enough = have >= r.qty;
      return `<span class="${enough ? '' : 'lack'}">${ing.name}×${r.qty}</span>`;
    }).join(' · ');
    const tags = f.tags.map((t) => {
      const tg = G.TAG[t];
      const tr = G.DATA.traits.traits.find((x) => x.tag === t);
      return `<span class="tiny" style="color:${tagColor(t)}">${tg ? tg.name : t}${tr && act[tr.id] ? '✓' : ''}</span>`;
    }).join(' ');
    const sigBadge = isSig
      ? `<span class="sig-badge">招牌 +${G.B.signaturePriceUp}%</span>` : '';
    const clashNote = clash
      ? `<span class="clash-note">与招牌「${sigFood ? sigFood.name : ''}」冲突</span>` : '';
    const sigBtn = (!sigId && hasUt)
      ? `<button class="small sig-btn" data-act="signature" data-f="${f.id}">设为招牌</button>` : '';

    return `<div class="food ${on ? 'on' : ''} ${isSig ? 'sig' : ''} ${clash ? 'clash' : ''}" data-fid="${f.id}">
      <span>${icon(f.sprite, 44)}</span>
      <span>
        <span class="food-name">${f.name} ${tags}${sigBadge}${hasUt ? '' : '<span class="warn tiny">缺厨具</span>'}${clashNote}</span>
        <span class="food-sub">空间 ${f.space} 格${isSig ? ` +${G.B.signatureSurface} 招牌位` : ''} · 现做 ${(f.serveTicks / 200).toFixed(2)}s · 备好 ${pre} 份 · 食材够 ${raw} 份</span>
        <div class="recipe">配方 ${recipeLine} <span class="muted">· 一份约 ${G.prepMinutesFor(f).toFixed(1)} 分钟</span></div>
      </span>
      <span style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        ${on ? `<input type="number" step="0.5" min="1" value="${m.price}" data-act="price" data-f="${f.id}">` : ''}
        <button class="small ${on ? 'danger' : ''}" data-act="toggle" data-f="${f.id}" ${clash ? 'disabled' : ''}>${on ? '下架' : '上架'}</button>
        ${on ? `<button class="small" data-act="prep" data-f="${f.id}">备10份</button>` : ''}
        ${sigBtn}
      </span>
    </div>`;
  }).join('');

  // ---------- 词条树：标签（你上架什么）→ 词条（你得到什么）→ 档位进度 ----------
  const allTraits = G.DATA.traits.traits.map((tr) => {
    const cnt = G.menuCount(tr.tag);
    const on = cnt >= tr.needMenu;
    const X = s.layers[tr.id] || 0;
    const tier = G.tierOf(tr);
    const tiers = G.DATA.traits.tiers[tr.id] || [];
    const nextTier = tiers.find((x) => x.minX > X);
    const need = Math.max(0, tr.needMenu - cnt);
    const near = !on && need <= 1;

    // 标签图标四态：已激活 / 差一款 / 未激活
    const state = on ? 'highlight' : (near ? 'fragile' : 'grayed');
    const tagIcon = 'ico/tag_' + tr.tag + '_' + state + '.png';
    const tagName = G.TAG[tr.tag] ? G.TAG[tr.tag].name : tr.tag;

    // 该标签下已上架的菜
    const listed = s.menu.filter((m) => m.onMenu && G.FOOD[m.foodId]
      && G.FOOD[m.foodId].tags.includes(tr.tag)).map((m) => G.FOOD[m.foodId].name);

    // 档位进度：当前档下限 → 下一档下限
    const curMin = tier ? tier.minX : 0;
    const nextMin = nextTier ? nextTier.minX : curMin;
    const prog = nextTier && nextMin > curMin
      ? Math.max(0, Math.min(1, (X - curMin) / (nextMin - curMin)))
      : (tier ? 1 : 0);

    const dots = Array.from({ length: Math.min(tr.needMenu, 6) }, (_, i) =>
      `<span class="dot-sq ${i < Math.min(cnt, tr.needMenu) ? 'on' : ''}"></span>`).join('');

    const html = `<div class="tnode ${on ? 'on' : ''} ${near ? 'near' : ''}">
      <div class="tnode-head">
        <span class="tnode-tagico">${icon(tagIcon, 26)}</span>
        <span class="tnode-tag">${tagName}</span>
        <span class="dots">${dots}</span>
        <span class="tnode-cnt">${cnt}/${tr.needMenu} 款</span>
        <span class="tnode-x">X=${Math.round(X)}</span>
      </div>

      <div class="tnode-branch">
        <span class="tnode-line">└</span>
        <span class="tnode-ico">${icon('ico/' + tr.icon + '.png', 24)}</span>
        <span class="tnode-name">${tr.name}</span>
        ${on
          ? `<span class="tnode-tier">${tier ? tier.tier + ' 档' : '已激活'}</span>`
          : `<span class="tnode-lock">${near ? `再上架 ${need} 款` : '未激活'}</span>`}
      </div>

      ${listed.length
        ? `<div class="tnode-dishes">已上架 · ${listed.slice(0, 4).join('、')}${listed.length > 4 ? ` 等 ${listed.length} 道` : ''}</div>`
        : (on ? '' : `<div class="tnode-dishes empty">上架 ${tr.needMenu} 款「${tagName}」就点亮</div>`)}

      ${on
        ? `<div class="tnode-prog">
             <div class="tnode-bar"><i style="width:${(prog * 100).toFixed(0)}%"></i></div>
             <span class="tnode-next">${nextTier ? `下一档 X=${nextTier.minX} · 差 ${nextTier.minX - X}` : '已满档'}</span>
           </div>
           <div class="tnode-desc">${tier ? tier.desc : tr.desc}</div>`
        : ''}
    </div>`;
    return { id: tr.id, on, near, html };
  });

  // 筛选：全部 / 已激活 / 差一款
  const stat = {
    on: allTraits.filter((x) => x.on).length,
    near: allTraits.filter((x) => x.near).length,
  };
  const showTraits = allTraits.filter((x) => {
    if (prepView.traitFilter === 'on') return x.on;
    if (prepView.traitFilter === 'near') return x.near || x.on;
    return true;
  });
  const traitRows = showTraits.length
    ? showTraits.map((x) => x.html).join('')
    : '<div class="hint">这个分类下还没有词条。先上架同标签的菜试试。</div>';

  const resoRows = G.DATA.traits.resonances.map((r) => {
    const ok = mods.resonances.find((x) => x.id === r.id);
    return `<div class="tiny ${ok ? 'reso' : 'muted'}">${icon('ico/' + r.icon + '.png', 20)}
      ${r.name} <span class="muted">(${r.a}/${r.b}${r.c ? '/' + r.c : ''})</span>
      ${ok ? `→${ok.tier ? ok.tier.tier + '档' : '生效'}` : ''}</div>`;
  }).join('');

  const used = G.surfaceUsed();
  const over = used > G.B.surface;

  el('stage').innerHTML = `<div class="cols prep-cols">
    <div class="col-main">
      <div class="panel"><h3 class="panel-title">${icon('ui/ui_trend_up.png', 18)} 餐品库（点"上架"加入今日菜单）</h3>
        ${intro ? `<div class="day-note"><b>第 ${s.day} 天 · ${intro.title}</b><span>${intro.text}</span></div>` : ''}
        ${dayStrip(G)}
        <div class="food-list">${foodRows}</div>
      </div>
    </div>
    <div class="col-side">
      <div class="panel prep-trait-panel">
        <h3 class="panel-title">${icon('ico/trait_speed.png', 18)} 词条树 · 上架同标签的菜点亮</h3>
        <div class="tfilter">
          <button class="small ${prepView.traitFilter === 'all' ? 'primary' : ''}" data-act="traitFilter" data-f="all">全部 ${allTraits.length}</button>
          <button class="small ${prepView.traitFilter === 'on' ? 'primary' : ''}" data-act="traitFilter" data-f="on">已激活 ${stat.on}</button>
          <button class="small ${prepView.traitFilter === 'near' ? 'primary' : ''}" data-act="traitFilter" data-f="near">差一款 ${stat.near}</button>
        </div>
        <div class="tnode-list">${traitRows}</div>
      </div>
      <div class="panel mt8">
        <h3 class="panel-title">${icon('ui/ui_dot_full.png', 18)} 空间</h3>
        <div class="hint">台面 <b class="${over ? 'warn' : 'ok'}">${used.toFixed(0)} / ${G.B.surface}</b> 格（含厨具）</div>
        <div class="hint">储存 ${G.storageUsed().toFixed(1)} / ${G.B.storage} 格</div>
        ${over ? '<div class="warn tiny">台面超了，下架几道或少上大件</div>' : ''}
      </div>
      <div class="panel mt8">
        <h3 class="panel-title">${icon('ico/reso_spicy_fast.png', 18)} 共鸣</h3>
        ${resoRows}
      </div>
    </div>
  </div>`;

  const issues = G.validateMenu().issues;
  el('bar').innerHTML = `
    <span class="muted tiny">剩余 ${Math.round(s.minutesLeft)} 分钟 · 备餐消耗分钟</span>
    <span class="spacer"></span>
    ${issues.filter((i) => i.level === 'error').map((i) => `<span class="warn tiny">⚠ ${i.msg}</span>`).join('')}
    <button class="primary" data-act="toSell">出摊 →</button>
    <span class="spacer"></span>`;
}


function menuNeedRows(G) {
  const s = G.s;
  const on = s.menu.filter((m) => m.onMenu);
  if (!on.length) return '<div class="hint">还没定菜单。先去「备餐」上架几道菜，这里就会列出该买的食材。</div>';
  const need = {};
  on.forEach((m) => G.FOOD[m.foodId].recipe.forEach((r) => {
    need[r.ing] = (need[r.ing] || 0) + r.qty;
  }));
  return Object.entries(need)
    .sort((a, b) => (s.inventory[a[0]] || 0) - (s.inventory[b[0]] || 0))
    .map(([id, q]) => {
      const ing = G.ING[id];
      const have = s.inventory[id] || 0;
      const short = have < q;
      return `<div class="item" style="grid-template-columns:24px 1fr auto auto">
        <span>${icon(ing.sprite, 24)}</span>
        <span class="item-name ${short ? 'warn' : ''}">${ing.name}</span>
        <span class="item-stock">每份需 ${q}</span>
        <span class="item-stock ${short ? 'warn' : 'ok'}">库存 ${have}</span>
      </div>`;
    }).join('') + '<div class="hint mt8">想多卖几份就按「每份需 × 预计份数」进货。</div>';
}

function tagColor(tagId) {
  const map = {
    fast: '#f2b33d', staple: '#e8d9a8', spicy: '#e0432b', fried: '#c98b3f',
    madedish: '#ff7a45', madedrink: '#5fd3a6', drink: '#59a8e8', cold: '#7bc96f',
    grilled: '#8c5a3c', soup: '#efe3c8', dessert: '#e8a0bf', braised: '#8b5f9e',
  };
  return map[tagId] || '#fff';
}

/* ---------------------------------------------------------------- 出摊 */
export function renderSellShell(G) {
  const s = G.s;
  el('stage').innerHTML = `<div id="sellwrap">
    <div class="sell-top">
      <span class="badge badge-clock">
        <span class="badge-lbl">剩余</span>
        <b id="sellleft">${digits(60, { size: 48 })}</b>
        <span class="badge-unit">秒</span>
      </span>
      <span class="badge badge-rev">
        <span class="badge-ico">${icon('ui/ui_star_full.png', 26)}</span>
        <b id="sellrev">${digits(0, { size: 48 })}</b>
      </span>
    </div>
    <canvas id="sellcanvas" width="960" height="540"></canvas>
    <div class="qte-host" id="qtehost"></div>
    <div class="sellbar" id="sellstats"></div>
  </div>`;
  el('bar').innerHTML = `
    <span class="muted tiny">出摊中：顾客排队 → 出餐 → 收钱。备好的成品可以立刻取走，没备的要现做。</span>
    <span class="spacer"></span>
    <button class="small" data-act="speed">1x</button>
    <button data-act="skipSell">打烊结算</button>
    <span class="spacer"></span>`;
}


/** QTE 覆盖层：时机条 / 三选一 */
function renderQte(G) {
  const host = document.getElementById('qtehost');
  if (!host) return;
  const S = G.s.sell;
  const q = S && S.qte;

  if (!q) {
    if (host.dataset.on === '1') {
      host.dataset.on = '0';
      host.innerHTML = '';
      host.classList.remove('on');
      document.body.classList.remove('qte-on');
    }
    return;
  }

  // 只在数值变化时重绘（每 tick 一次，别每帧刷）
  const key = q.type + ':' + q.left + ':' + (q.ended ? '1' : '0');
  if (host.dataset.k === key) return;
  host.dataset.k = key;
  host.dataset.on = '1';
  host.classList.add('on');
  document.body.classList.add('qte-on');

  const ratio = Math.max(0, q.left / q.total);
  const pos = 1 - ratio;                 // 指针位置 0..1
  const secs = Math.max(0, q.left / 200).toFixed(1);

  if (q.kind === 'pick') {
    host.innerHTML = `
      <div class="qte">
        <div class="qte-head">
          <b>${q.name}</b>
          <span>在看着你做什么 · ${secs}s</span>
        </div>
        <div class="qte-timer"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>
        <div class="qte-opts">
          ${(q.options || []).map((o, i) =>
            `<button class="qte-opt" data-act="qtePick" data-i="${i}">${o.t}</button>`).join('')}
        </div>
      </div>`;
  } else {
    const z0 = (q.zone ? q.zone[0] : 0.44) * 100;
    const z1 = (q.zone ? q.zone[1] : 0.60) * 100;
    host.innerHTML = `
      <div class="qte">
        <div class="qte-head">
          <b>${q.name}</b>
          <span>指针进绿区时按下 · ${secs}s</span>
        </div>
        <div class="qte-lane">
          <div class="qte-zone" style="left:${z0}%;width:${z1 - z0}%"></div>
          <div class="qte-marker" style="left:${(pos * 100).toFixed(1)}%"></div>
        </div>
        <button class="qte-btn" data-act="qteHit">上菜！</button>
      </div>`;
  }
}

export function updateSellStats(G) {
  const S = G.s.sell;
  if (!S) return;

  // ---------- 顶部徽章：每帧都可能变，单独更新 ----------
  const leftSec = Math.max(0, Math.round((G.B.sellTicks - S.tick) / 200));
  const leftEl = el('sellleft');
  if (leftEl && leftEl.dataset.v !== String(leftSec)) {
    leftEl.dataset.v = leftSec;
    leftEl.innerHTML = digits(leftSec, { size: 48 });
    const badge = leftEl.closest ? leftEl.closest('.badge-clock') : null;
    if (badge) badge.classList.toggle('hot', leftSec <= 10);
  }
  const revVal = Math.round(S.revenue);
  const revEl = el('sellrev');
  if (revEl && revEl.dataset.v !== String(revVal)) {
    revEl.dataset.v = revVal;
    revEl.innerHTML = digits(num(revVal), { size: 48 });
  }

  // ---------- QTE 覆盖层 ----------
  renderQte(G);

  // ---------- 底部统计：按 key 节流 ----------
  const dom = el('sellstats');
  if (!dom) return;
  const key = [S.served, S.lost, S.complaints || 0,
    Object.keys(G.activeTraits()).length,
    Math.round(S.revenue)].join(',');
  if (dom.dataset.k === key) return;
  dom.dataset.k = key;

  const active = G.activeTraits();
  const chips = Object.keys(active).map((id) => {
    const tr = G.DATA.traits.traits.find((x) => x.id === id);
    const X = Math.round(G.s.layers[id] || 0);
    const tier = G.tierOf(tr);
    return `<span class="stat-chip on">${icon('ico/' + tr.icon + '.png', 18)}
      <b>${tr.name}</b><em>X${X}${tier ? ' · ' + tier.tier + '档' : ''}</em></span>`;
  }).join('');

  dom.innerHTML = `
    <span class="stat-chip"><span class="stat-k">卖出</span><b>${S.served}</b></span>
    <span class="stat-chip ${S.lost ? 'warn' : ''}"><span class="stat-k">流失</span><b>${S.lost}</b></span>
    <span class="stat-chip ${(S.complaints || 0) ? 'warn' : ''}"><span class="stat-k">客诉</span><b>${S.complaints || 0}</b></span>
    ${chips}`;
}

/* ---------------------------------------------------------------- 结算 */
export function renderSettle(G) {
  const st = G.s.lastSettle;
  const line = settleLine(G, st.score);
  // 今晚点亮的词条氛围句
  const active = G.activeTraits();
  const flavors = Object.keys(active).map((id) => {
    const tr = G.DATA.traits.traits.find((x) => x.id === id);
    const text = traitFlavor(G, id);
    return tr && text ? { name: tr.name, text } : null;
  }).filter(Boolean).slice(0, 3);
  const all = G.bonusPool();
  const pool = [];
  const used = new Set();
  for (const b of all.slice().sort(() => Math.random() - 0.5)) {
    if (used.has(b.icon)) continue;
    used.add(b.icon);
    pool.push(b);
    if (pool.length === 3) break;
  }
  el('stage').innerHTML = `
    <div class="panel">
      <h3 class="panel-title">${icon('ui/ui_progress_fill_warm.png', 20)} 第 ${st.day} 天 · 打烊结算</h3>
      <div class="settle-grid">
        <div class="kpi"><div class="k">营业额</div><div class="v acc">${money(st.revenue)}</div>
          <div class="tiny muted">目标 ${money(st.target)}</div></div>
        <div class="kpi"><div class="k">卖出 / 流失</div><div class="v">${st.served} / ${st.lost}</div></div>
        <div class="kpi"><div class="k">满意度</div><div class="v">${st.sat.toFixed(2)}</div></div>
        <div class="kpi"><div class="k">评分</div><div class="v acc">${st.score.toFixed(0)}</div>
          <div class="tiny muted">${line ? line.title : ''}</div></div>
      </div>
      ${line ? `<blockquote class="settle-quote">${line.text}</blockquote>` : ''}
      ${flavors.length ? `<div class="flavor-list">
        ${flavors.map((f) => `<div class="flavor"><span class="flavor-name">${f.name}</span><span class="flavor-text">${f.text}</span></div>`).join('')}
      </div>` : ''}
      <div class="hint mt8">获得经验 ${st.exp} · 口碑 ${Math.round(G.s.rep)}</div>
    </div>
    <div class="panel mt8">
      <h3 class="panel-title">${icon('ui/ui_trend_up.png', 20)} 选一个加成（本局永久生效）</h3>
      <div class="bonus-grid">
        ${pool.map((b) => `<div class="bonus" data-act="bonus" data-b="${b.id}">
          ${icon(b.icon, 36)}<b>${b.name}</b><span>${b.desc}</span></div>`).join('')}
      </div>
    </div>`;
  el('bar').innerHTML = `<span class="muted tiny">选一张卡继续</span><span class="spacer"></span>`;
}

/* ---------------------------------------------------------------- 局外 */
export function renderMeta(G) {
  const s = G.s;
  const pts = G.skillPoints();
  const avg = s.history.length ? s.history.reduce((a, h) => a + h.score, 0) / s.history.length : 0;
  const branch = (id, name, desc) => `
    <div class="panel">
      <h3 class="panel-title">${icon('ico/skill_' + (id === 'eff' ? 'efficiency' : id === 'cap' ? 'capacity' : 'flavor') + '.png', 16)} ${name} Lv.${s.skills[id]}</h3>
      <div class="hint">${desc}</div>
      <button class="small mt8" data-act="skill" data-b="${id}" ${pts <= 0 || s.skills[id] >= 3 ? 'disabled' : ''}>升级（1 点）</button>
    </div>`;
  const end = endingOf(G);
  el('stage').innerHTML = `
    <div class="panel">
      <h3 class="panel-title">${icon('ui/ui_star_full.png', 20)} 第 ${s.run} 轮 · 7 天结束</h3>
      ${end ? `<div class="ending">
        <div class="ending-title">${end.title}</div>
        <blockquote class="ending-text">${end.text}</blockquote>
      </div>` : ''}
      <div class="settle-grid">
        ${s.history.map((h) => `<div class="kpi"><div class="k">第 ${h.day} 天</div>
          <div class="v">${h.score.toFixed(0)}</div><div class="tiny muted">${money(h.revenue)}</div></div>`).join('')}
      </div>
      <div class="hint mt8">平均评分 <b>${avg.toFixed(1)}</b> · 总经验 ${s.exp} · 可用技能点 <b class="gold">${pts}</b></div>
    </div>
    <div class="panel mt8">
      <h3 class="panel-title">${icon('ui/ui_node_active.png', 20)} 技能（跨轮永久）</h3>
      <div class="cols">
        ${branch('eff', '效率', '备餐时间 +30 分钟/级')}
        ${branch('cap', '容量', '台面 +3 格/级')}
        ${branch('flv', '风味', '风味衰减 -10%/级（下一轮生效）')}
      </div>
    </div>
    <div class="panel mt8">
      <h3 class="panel-title">${icon('ui/ui_dot_full.png', 20)} 词条层数（永久累积，不会清零）</h3>
      <div class="sellbar">
        ${G.DATA.traits.traits.map((tr) => `<span class="pill">${icon('ico/' + tr.icon + '.png', 18)} ${tr.name}
          <b>X${Math.round(s.layers[tr.id] || 0)}</b></span>`).join('')}
      </div>
    </div>`;
  el('bar').innerHTML = `<span class="muted tiny">层数和技能都会带进下一轮</span>
    <span class="spacer"></span><button class="primary" data-act="nextRun">开始第 ${s.run + 1} 轮 →</button>
    <span class="spacer"></span>`;
}
