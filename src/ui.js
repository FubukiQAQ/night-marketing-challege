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

export function renderMenu(o) {
  const d = o.desc;
  el('hud').innerHTML = `<span class="hud-day">不烧心夜市挑战</span>
    <span class="hud-spacer"></span>
    <span class="hud-meta">本地存档 · v0.4</span>`;

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

  el('stage').innerHTML = `<div class="menu">
    <div class="menu-kicker">七天 · 一个新摊位</div>
    <h1 class="menu-title">不烧心<br /><span>夜市挑战</span></h1>
    <p class="menu-sub">备货 → 备餐 → 出摊 60 秒。词条层数不封顶，摊子越做越亮。</p>

    <div class="menu-actions">
      ${d ? `<button class="primary big" data-act="continue">继续 · ${saveLine}</button>` : ''}
      ${o.hasMeta ? `<button class="big" data-act="newRun">开始新一轮（继承层数与技能）</button>` : ''}
      ${d || o.hasMeta ? '' : `<button class="primary big" data-act="newRun">开始第一轮</button>`}
      <button data-act="help">玩法说明</button>
      ${d || o.hasMeta ? `<button class="danger" data-act="wipe">${o.confirming ? '确定清空存档？再点一次' : '清空存档'}</button>` : ''}
    </div>

    <div class="menu-foot">
      ${d ? `第 ${d.runNo} 轮 · 口碑 ${d.rep} · 存档 ${formatTime(o.savedAt)}` : '进度会存在浏览器里（localStorage）'}
      ${o.hasMeta ? ` · 词条层数 ${o.layerTotal} 点` : ''}
    </div>
  </div>`;
  el('bar').innerHTML = `<span>${d ? '继续上次进度，或开新一轮。' : '点上面的按钮开始。'}</span>`;
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
      <div class="stock-main">
        <div class="panel stock-shelf-panel">
          <h3 class="panel-title">今天的供应商 · 点格子进货</h3>
          <div class="sup-tabs">${tabs}</div>
          ${shelf}
        </div>
        <div class="panel stock-inv-panel">
          <h3 class="panel-title">手上库存 ${used.toFixed(1)} / ${G.B.storage} 格</h3>
          <div class="scroll" id="scrollInv">${invRows}</div>
        </div>
      </div>
      <div class="stock-side">
        <div class="panel">
          <h3 class="panel-title">菜谱速查 · 买料之前先看这里</h3>
          <div class="scroll" id="scrollRecipe">${dishes}</div>
          <div class="hint mt8">括号里是手上的库存。点「+5 份料」按这道菜 5 份的用量去今天的供应商买，可连点累加。</div>
        </div>
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
  const act = G.activeTraits();
  const mods = G.effects();
  const avail = G.availableFoods();

  const foodRows = avail.map((f) => {
    const m = s.menu.find((x) => x.foodId === f.id);
    const on = m && m.onMenu;
    const hasUt = !f.utensil || s.utensils.includes(f.utensil);
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
    return `<div class="food ${on ? 'on' : ''}">
      <span>${icon(f.sprite, 44)}</span>
      <span>
        <span class="food-name">${f.name} ${tags}${hasUt ? '' : '<span class="warn tiny">缺厨具</span>'}</span>
        <span class="food-sub">空间 ${f.space} 格 · 现做 ${(f.serveTicks / 200).toFixed(2)}s · 备好 ${pre} 份 · 食材够 ${raw} 份</span>
        <div class="recipe">配方 ${recipeLine} <span class="muted">· 一份约 ${G.prepMinutesFor(f).toFixed(1)} 分钟</span></div>
      </span>
      <span style="display:flex;gap:4px;align-items:center">
        ${on ? `<input type="number" step="0.5" min="1" value="${m.price}" data-act="price" data-f="${f.id}">` : ''}
        <button class="small ${on ? 'danger' : ''}" data-act="toggle" data-f="${f.id}">${on ? '下架' : '上架'}</button>
        ${on ? `<button class="small" data-act="prep" data-f="${f.id}">备10份</button>` : ''}
      </span>
    </div>`;
  }).join('');

  // ---------- 词条树：标签（你上架什么）→ 词条（你得到什么）→ 档位进度 ----------
  const traitRows = G.DATA.traits.traits.map((tr) => {
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

    return `<div class="tnode ${on ? 'on' : ''} ${near ? 'near' : ''}">
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
  }).join('');

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
        <div class="food-list">${foodRows}</div>
      </div>
    </div>
    <div class="col-side">
      <div class="panel prep-trait-panel">
        <h3 class="panel-title">${icon('ico/trait_speed.png', 18)} 词条树 · 上架同标签的菜点亮</h3>
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
      <span class="sell-clock"><span class="u">剩余</span><b id="sellleft">${digits(60, { size: 48 })}</b><span class="unit">s</span></span>
      <span class="sell-rev"><b id="sellrev">${digits(0, { size: 48 })}</b></span>
    </div>
    <canvas id="sellcanvas" width="960" height="540"></canvas>
    <div class="sellbar" id="sellstats"></div>
  </div>`;
  el('bar').innerHTML = `
    <span class="muted tiny">出摊中：顾客排队 → 出餐 → 收钱。备好的成品可以立刻取走，没备的要现做。</span>
    <span class="spacer"></span>
    <button class="small" data-act="speed">1x</button>
    <button data-act="skipSell">打烊结算</button>
    <span class="spacer"></span>`;
}

export function updateSellStats(G) {
  const S = G.s.sell;
  if (!S) return;
  const dom = el('sellstats');
  if (!dom) return;
  const active = G.activeTraits();
  const chips = Object.keys(active).map((id) => {
    const tr = G.DATA.traits.traits.find((x) => x.id === id);
    const X = Math.round(G.s.layers[id] || 0);
    const tier = G.tierOf(tr);
    return `<span class="pill">${tr.name}<b> X${X}</b>${tier ? ' · ' + tier.tier + '档' : ''}</span>`;
  }).join('');
  const leftSec = Math.max(0, Math.round((G.B.sellTicks - S.tick) / 200));
  const leftEl = el('sellleft');
  if (leftEl && leftEl.dataset.v !== String(leftSec)) {
    leftEl.dataset.v = leftSec;
    leftEl.innerHTML = digits(leftSec, { size: 48 });
  }
  const revVal = Math.round(S.revenue);
  const revEl = el('sellrev');
  if (revEl && revEl.dataset.v !== String(revVal)) {
    revEl.dataset.v = revVal;
    revEl.innerHTML = digits(num(revVal), { size: 48 });
  }
  dom.innerHTML = `
    <span class="pill">${icon('ui/ui_trend_up.png', 18)} 卖出 <b>${S.served}</b></span>
    <span class="pill">${icon('ui/ui_trend_down.png', 18)} 流失 <b>${S.lost}</b></span>
    <span class="pill">${icon('ui/ui_trend_down.png', 18)} 客诉 <b>${Math.round(S.complaints)}</b></span>
    ${chips || '<span class="muted tiny">今天没有词条激活 —— 明天试试把同属性的菜多上几款</span>'}`;
}

/* ---------------------------------------------------------------- 结算 */
export function renderSettle(G) {
  const st = G.s.lastSettle;
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
          <div class="tiny muted">${st.score > 70 ? '好评如潮' : st.score > 55 ? '生意不错' : st.score > 40 ? '平平淡淡' : '有点冷清'}</div></div>
      </div>
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
  el('stage').innerHTML = `
    <div class="panel">
      <h3 class="panel-title">${icon('ui/ui_star_full.png', 20)} 第 ${s.run} 轮 · 7 天结束</h3>
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
