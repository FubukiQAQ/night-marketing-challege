// ui.js — 全部界面（DOM 渲染 + 事件委托）
import { icon } from './sprites.js';

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
    bar = `<div class="hud-timer">${icon('ico/state_timer.png', 14)}
      <div class="bar ${p < 0.25 ? 'warn' : ''}"><i style="width:${p * 100}%"></i></div>
      <span>${Math.round(s.minutesLeft)} 分</span></div>`;
  } else if (s.phase === 'SELL' && s.sell) {
    const p = s.sell.tick / G.B.sellTicks;
    bar = `<div class="hud-timer">${icon('ico/state_clock.png', 14)}
      <div class="bar"><i style="width:${p * 100}%"></i></div>
      <span>${(p * 100).toFixed(0)}%</span></div>`;
  }
  el('hud').innerHTML = `
    <span class="hud-day">第 ${s.day} / ${G.B.dayCount} 天</span>
    <span class="hud-cash ${s.cash < 0 ? 'neg' : ''}">${icon('ico/state_coin.png', 14)} ${money(s.cash)}</span>
    <span class="hud-phase">${phaseName}</span>
    ${bar}
    <span class="hud-spacer"></span>
    <span class="hud-meta">口碑 ${Math.round(s.rep)} · 昨日 ${Math.round(s.lastScore)} 分 · 第 ${s.run} 轮</span>
  `;
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

export function renderStock(G) {
  const s = G.s;
  const st = el('stage');
  const used = G.storageUsed();

  // 库存
  const invRows = Object.entries(s.inventory)
    .filter(([, q]) => q > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, q]) => {
      const ing = G.ING[id];
      return `<div class="item" style="grid-template-columns:24px 1fr auto auto">
        <span>${icon(ing.sprite, 16)}</span>
        <span class="item-name">${ing.name}</span>
        <span class="item-stock">${ing.catName}</span>
        <span class="item-stock">×${q}</span></div>`;
    }).join('') || '<div class="hint">还没有进货。</div>';

  // 供应商（每行标出这料能做哪些菜）
  const sups = s.suppliers.map((sup, si) => {
    const items = sup.items.map((it, ii) => {
      const ing = G.ING[it.ingId];
      const out = it.stock <= 0;
      const users = G.ingredientUsers(it.ingId, 3);
      const all = G.ingredientUsers(it.ingId);
      const usedBy = all.length
        ? `用于 ${all.slice(0, 4).join('、')}${all.length > 4 ? ` 等 ${all.length} 道菜` : ''}`
        : '暂时没有用到它的菜';
      return `<div class="item">
        <span>${icon(ing.sprite, 16)}</span>
        <span class="item-name">${ing.name}</span>
        <span class="item-price">${money(it.price)}</span>
        <span class="item-stock">${out ? '售罄' : '×' + it.stock}</span>
        <span style="display:flex; gap:3px">
          <button class="small" data-act="buy" data-s="${si}" data-i="${ii}" data-q="1" ${out ? 'disabled' : ''}>1</button>
          <button class="small" data-act="buy" data-s="${si}" data-i="${ii}" data-q="10" ${out ? 'disabled' : ''}>10</button>
          <button class="small" data-act="buy" data-s="${si}" data-i="${ii}" data-q="30" ${out ? 'disabled' : ''}>30</button>
        </span>
        <div class="used-by">${usedBy}</div>
      </div>`;
    }).join('');
    return `<div class="sup ${sup.closed ? 'closed' : ''}">
      <div class="sup-head">${icon(sup.closed ? 'ui/ui_supply_closed.png' : 'ui/ui_supply_open.png', 16)}
        ${sup.name}<span class="sup-mark">加价 ${(sup.markup * 100).toFixed(0)}%</span></div>
      ${sup.closed ? '<div class="hint">今天没开门</div>' : items}
    </div>`;
  }).join('');

  // 菜谱速查：所有已解锁的菜 + 配方 + 一键买齐
  const dishes = G.availableFoods().map((f) => {
    const tags = f.tags.map((t) => `<span class="dish-tags">${G.TAG[t] ? G.TAG[t].name : t}</span>`).join(' ');
    const canMake = f.recipe.every((r) => (s.inventory[r.ing] || 0) >= r.qty || !!G.offerFor(r.ing));
    return `<div class="dish-row">
      <span>${icon(f.sprite, 24)}</span>
      <span>
        <div class="dish-name">${f.name} ${tags} <span class="muted">· ${money(f.price)}</span></div>
        <div class="dish-recipe">${recipeText(G, f)}</div>
      </span>
      <button class="small" data-act="buyDish" data-f="${f.id}" data-n="5" ${canMake ? '' : 'disabled'}>+5 份料</button>
    </div>`;
  }).join('');

  st.innerHTML = `<div class="cols">
    <div class="col-main">
      <div class="panel"><h3 class="panel-title">今天的供应商</h3>
        <div class="sup-grid">${sups}</div>
      </div>
    </div>
    <div class="col-side">
      <div class="panel">
        <h3 class="panel-title">菜谱速查 · 买料之前先看这里</h3>
        <div class="scroll" id="scrollRecipe" style="max-height:min(46vh, 430px)">${dishes}</div>
        <div class="hint mt8">括号里是你手上的库存。点「+5 份料」会按这道菜 5 份的用量去今天的供应商那里买，可以连点累加。</div>
      </div>
      <div class="panel mt8">
        <h3 class="panel-title">库存 ${used.toFixed(1)} / ${G.B.storage} 格</h3>
        <div class="scroll" id="scrollInv" style="max-height:180px">${invRows}</div>
      </div>
    </div>
  </div>`;

  el('bar').innerHTML = `
    <span>采购会消耗分钟：剩余 ${Math.round(s.minutesLeft)} 分钟</span>
    <span class="spacer"></span>
    <button class="primary" data-act="toPrep">去备餐 →</button>`;
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
      <span>${icon(f.sprite, 32)}</span>
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

  const traitRows = G.DATA.traits.traits.map((tr) => {
    const cnt = G.menuCount(tr.tag);
    const on = cnt >= tr.needMenu;
    const X = s.layers[tr.id] || 0;
    const tier = G.tierOf(tr);
    const nextTier = (G.DATA.traits.tiers[tr.id] || []).find((x) => x.minX > X);
    const need = Math.max(0, tr.needMenu - cnt);
    const near = !on && need <= 1;
    const dots = Array.from({ length: Math.min(tr.needMenu, 6) }, (_, i) =>
      `<span class="dot-sq ${i < Math.min(cnt, tr.needMenu) ? 'on' : ''}"></span>`).join('');
    return `<div class="trait ${on ? 'on' : ''} ${near ? 'near' : ''}">
      <span>${icon('ico/' + tr.icon + '.png', 20)}</span>
      <span>
        <div class="trait-row2">
          <span class="trait-name">${tr.name}</span>
          <span class="dots">${dots}</span>
          <span class="tiny muted">${cnt}/${tr.needMenu}款</span>
          ${on ? `<span class="tiny ok">${tier ? tier.tier + '档' : '激活'}</span>` : `<span class="tiny muted">未激活</span>`}
          <span class="layer">X=${Math.round(X)}</span>
        </div>
        <div class="tiny muted">
          ${on && tier ? tier.desc : (near ? `⤷ 再上架 ${need} 款就点亮` : tr.desc)}
          ${on && nextTier ? ` · 下一档 ${nextTier.minX} 层` : ''}
        </div>
      </span>
    </div>`;
  }).join('');

  const resoRows = G.DATA.traits.resonances.map((r) => {
    const ok = mods.resonances.find((x) => x.id === r.id);
    return `<div class="tiny ${ok ? 'reso' : 'muted'}">${icon('ico/' + r.icon + '.png', 16)}
      ${r.name} <span class="muted">(${r.a}/${r.b}${r.c ? '/' + r.c : ''})</span>
      ${ok ? `→${ok.tier ? ok.tier.tier + '档' : '生效'}` : ''}</div>`;
  }).join('');

  const used = G.surfaceUsed();
  const over = used > G.B.surface;

  el('stage').innerHTML = `<div class="cols">
    <div class="col-main">
      <div class="panel"><h3 class="panel-title">${icon('ico/state_sale.png', 14)} 餐品库（点"上架"加入今日菜单）</h3>
        <div class="food-list">${foodRows}</div>
      </div>
    </div>
    <div class="col-side">
      <div class="panel">
        <h3 class="panel-title">${icon('ico/trait_speed.png', 14)} 词条面板</h3>
        ${traitRows}
      </div>
      <div class="panel mt8">
        <h3 class="panel-title">${icon('ico/state_space.png', 14)} 空间</h3>
        <div class="hint">台面 <b class="${over ? 'warn' : 'ok'}">${used.toFixed(0)} / ${G.B.surface}</b> 格（含厨具）</div>
        <div class="hint">储存 ${G.storageUsed().toFixed(1)} / ${G.B.storage} 格</div>
        ${over ? '<div class="warn tiny">台面超了，下架几道或少上大件</div>' : ''}
      </div>
      <div class="panel mt8">
        <h3 class="panel-title">${icon('ico/reso_spicy_fast.png', 14)} 共鸣</h3>
        ${resoRows}
      </div>
    </div>
  </div>`;

  const issues = G.validateMenu().issues;
  el('bar').innerHTML = `
    <span class="muted tiny">剩余 ${Math.round(s.minutesLeft)} 分钟 · 备餐消耗分钟</span>
    <span class="spacer"></span>
    ${issues.filter((i) => i.level === 'error').map((i) => `<span class="warn tiny">⚠ ${i.msg}</span>`).join('')}
    <button class="primary" data-act="toSell">出摊 →</button>`;
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
        <span>${icon(ing.sprite, 16)}</span>
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
      <span class="sell-clock">${icon('ico/state_clock.png', 20)} 剩余 <b id="sellleft">60</b><span class="unit">s</span></span>
      <span class="sell-rev">${icon('ico/state_coin.png', 20)} <b id="sellrev">0</b></span>
    </div>
    <canvas id="sellcanvas" width="640" height="360"></canvas>
    <div class="sellbar" id="sellstats"></div>
  </div>`;
  el('bar').innerHTML = `
    <span class="muted tiny">出摊中：顾客排队 → 出餐 → 收钱。备好的成品可以立刻取走，没备的要现做。</span>
    <span class="spacer"></span>
    <button class="small" data-act="speed">1x</button>
    <button data-act="skipSell">打烊结算</button>`;
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
  const leftEl = el('sellleft');
  if (leftEl) leftEl.textContent = Math.max(0, Math.round((G.B.sellTicks - S.tick) / 200));
  const revEl = el('sellrev');
  if (revEl) revEl.textContent = S.revenue.toFixed(0);
  dom.innerHTML = `
    <span class="pill">${icon('ico/state_sale.png', 14)} 卖出 <b>${S.served}</b></span>
    <span class="pill">${icon('ico/state_stockout.png', 14)} 流失 <b>${S.lost}</b></span>
    <span class="pill">${icon('ico/state_complaint.png', 14)} 客诉 <b>${Math.round(S.complaints)}</b></span>
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
      <h3 class="panel-title">${icon('ico/state_bill.png', 16)} 第 ${st.day} 天 · 打烊结算</h3>
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
      <h3 class="panel-title">${icon('ico/state_combo_up.png', 16)} 选一个加成（本局永久生效）</h3>
      <div class="bonus-grid">
        ${pool.map((b) => `<div class="bonus" data-act="bonus" data-b="${b.id}">
          ${icon('ico/' + b.icon + '.png', 24)}<b>${b.name}</b><span>${b.desc}</span></div>`).join('')}
      </div>
    </div>`;
  el('bar').innerHTML = `<span class="muted tiny">选一张卡继续</span>`;
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
      <h3 class="panel-title">${icon('ui/ui_rank.png', 16)} 第 ${s.run} 轮 · 7 天结束</h3>
      <div class="settle-grid">
        ${s.history.map((h) => `<div class="kpi"><div class="k">第 ${h.day} 天</div>
          <div class="v">${h.score.toFixed(0)}</div><div class="tiny muted">${money(h.revenue)}</div></div>`).join('')}
      </div>
      <div class="hint mt8">平均评分 <b>${avg.toFixed(1)}</b> · 总经验 ${s.exp} · 可用技能点 <b class="gold">${pts}</b></div>
    </div>
    <div class="panel mt8">
      <h3 class="panel-title">${icon('ico/skill_capacity.png', 16)} 技能（跨轮永久）</h3>
      <div class="cols">
        ${branch('eff', '效率', '备餐时间 +30 分钟/级')}
        ${branch('cap', '容量', '台面 +3 格/级')}
        ${branch('flv', '风味', '风味衰减 -10%/级（下一轮生效）')}
      </div>
    </div>
    <div class="panel mt8">
      <h3 class="panel-title">${icon('ui/ui_bulb_on.png', 16)} 词条层数（永久累积，不会清零）</h3>
      <div class="sellbar">
        ${G.DATA.traits.traits.map((tr) => `<span class="pill">${icon('ico/' + tr.icon + '.png', 14)} ${tr.name}
          <b>X${Math.round(s.layers[tr.id] || 0)}</b></span>`).join('')}
      </div>
    </div>`;
  el('bar').innerHTML = `<span class="muted tiny">层数和技能都会带进下一轮</span>
    <span class="spacer"></span><button class="primary" data-act="nextRun">开始第 ${s.run + 1} 轮 →</button>`;
}
