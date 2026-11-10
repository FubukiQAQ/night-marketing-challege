// daymods.js —— 天气 / 随机事件 / 同行竞争
// 三者都只改参数不改规则（见 docs/06）：只乘系数、开关产能、塞顾客。
// 所有随机都走 G.rng()，保证同一种子可复现。

let WEATHER = [];
let EVENTS = [];
let RIVAL = null;

export function initDayMods(data) {
  if (data && Array.isArray(data.weather)) WEATHER = data.weather;
  if (data && Array.isArray(data.events)) EVENTS = data.events;
  if (data && data.rival) RIVAL = data.rival;
}

/* ---------------------------------------------------------------- 天气 */

function pickWeighted(list, rng) {
  const total = list.reduce((a, x) => a + (x.weight || 1), 0) || 1;
  let r = rng() * total;
  for (const x of list) {
    r -= (x.weight || 1);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

export function weatherDef(id) {
  return WEATHER.find((w) => w.id === id) || WEATHER[0] || null;
}

export function rollWeather(G) {
  const s = G.s;
  // 第 1 天固定晴：新手不该第一天就吃天气惩罚
  if (s.day <= 1 || !WEATHER.length) { s.weather = 'clear'; return s.weather; }
  // 晴的权重额外抬高一点，避免连续坏天气
  const prev = s.weather;
  const pool = WEATHER.filter((w) => !(prev && prev !== 'clear' && w.id === prev));
  const w = pickWeighted(pool.length ? pool : WEATHER, G.rng);
  s.weather = w.id;
  return s.weather;
}

/* ---------------------------------------------------------------- 事件 */

function eventDef(id) {
  return EVENTS.find((e) => e.id === id) || null;
}

/** 冷却 / 次数 / 天数门槛都满足吗 */
function eligible(G, def) {
  const s = G.s;
  if (s.day < (def.minDay || 1)) return false;
  const seen = (s.eventSeen && s.eventSeen[def.id]) || 0;
  if (def.cooldownDays && seen && s.day - seen < def.cooldownDays) return false;
  const used = (s.eventCounts && s.eventCounts[def.id]) || 0;
  if (def.maxPerRun != null && used >= def.maxPerRun) return false;
  return true;
}

function markUsed(G, def) {
  const s = G.s;
  s.eventSeen = s.eventSeen || {};
  s.eventCounts = s.eventCounts || {};
  s.eventSeen[def.id] = s.day;
  s.eventCounts[def.id] = (s.eventCounts[def.id] || 0) + 1;
}

function logEvent(G, def, extra) {
  const s = G.s;
  s.events = s.events || [];
  s.events.push({
    id: def.id, name: def.name, good: !!def.good,
    title: (extra && extra.title) || def.title,
    desc: (extra && extra.desc) || def.desc,
    phase: def.phase,
  });
}

/** 把系数累加进 s.eventMods */
function bumpMods(G, key, factor) {
  const s = G.s;
  s.eventMods = s.eventMods || { trafficMul: 1, priceMul: 1, serveMul: 1, demandMul: {} };
  s.eventMods[key] = (s.eventMods[key] || 1) * factor;
}

function bumpDemand(G, tag, factor) {
  const s = G.s;
  s.eventMods = s.eventMods || { trafficMul: 1, priceMul: 1, serveMul: 1, demandMul: {} };
  s.eventMods.demandMul[tag] = (s.eventMods.demandMul[tag] || 1) * factor;
}

/** 备货阶段事件：随机挑 0~2 个并立即生效 */
export function rollStockEvents(G) {
  const s = G.s;
  s.events = [];
  s.eventMods = { trafficMul: 1, priceMul: 1, serveMul: 1, demandMul: {} };
  if (!EVENTS.length) return s.events;

  const pool = EVENTS.filter((e) => e.phase === 'STOCK' && eligible(G, e));
  if (!pool.length) return s.events;

  // 每天 55% 概率来一个，第 4 天起 15% 再来一个（同组互斥）
  const n = (G.rng() < 0.55 ? 1 : 0) + (s.day >= 4 && G.rng() < 0.15 ? 1 : 0);
  const usedGroups = {};
  for (let k = 0; k < n; k++) {
    const cand = pool.filter((e) => !usedGroups[e.group] && eligible(G, e));
    if (!cand.length) break;
    const def = pickWeighted(cand, G.rng);
    usedGroups[def.group] = true;
    applyStockEvent(G, def);
  }
  return s.events;
}

function applyStockEvent(G, def) {
  const s = G.s;
  const arg = def.arg || {};
  const open = s.suppliers.filter((x) => !x.closed);

  switch (def.op) {
    case 'supplier_close': {
      // 至少留一家开着的，否则玩家没法玩
      const closable = open.filter((x) => !x.core);
      if (closable.length <= 1) return;
      const target = closable[Math.floor(G.rng() * closable.length) % closable.length];
      target.closed = true;
      logEvent(G, def, { title: target.name + ' 今天没开门' });
      break;
    }
    case 'price_category': {
      const cat = open.length ? open[Math.floor(G.rng() * open.length) % open.length] : null;
      if (!cat) return;
      cat.items.forEach((it) => { it.price = Math.round(it.price * (arg.factor || 1.3) * 100) / 100; });
      logEvent(G, def, { title: cat.name + ' 全线涨价' });
      break;
    }
    case 'clearance': {
      const target = open[Math.floor(G.rng() * open.length) % open.length];
      if (!target) return;
      target.items.forEach((it) => {
        it.price = Math.max(0.2, Math.round(it.price * (arg.factor || 0.62) * 100) / 100);
        it.stock = Math.floor(it.stock * (arg.stockMul || 2));
      });
      logEvent(G, def, { title: target.name + ' 在清仓' });
      break;
    }
    case 'item_grant': {
      const all = G.DATA.ingredients.ingredients;
      const ing = all[Math.floor(G.rng() * all.length) % all.length];
      if (!ing) return;
      s.inventory[ing.id] = (s.inventory[ing.id] || 0) + (arg.qty || 15);
      logEvent(G, def, { title: '邻居送了你 ' + (arg.qty || 15) + ' 份' + ing.name });
      break;
    }
    case 'item_spoil': {
      const ratio = arg.ratio || 0.25;
      let lost = 0;
      Object.keys(s.inventory).forEach((id) => {
        const q = s.inventory[id] || 0;
        if (q <= 0) return;
        const drop = Math.floor(q * ratio);
        if (drop > 0) { s.inventory[id] = q - drop; lost += drop; }
      });
      if (lost <= 0) return;
      logEvent(G, def, { title: '扔掉了 ' + lost + ' 份泡坏的食材' });
      break;
    }
    default:
      return;
  }
  markUsed(G, def);
}

/** 出摊事件：进入出摊时先排好这一晚的事件时刻表，tick 里按表触发。
 *  用排期而不是每 tick 概率，才能控制节奏（docs/06：一局 ≤4 个、间隔 ≥1500 tick）。 */
export function planSellEvents(G) {
  const s = G.s;
  const S = s.sell;
  if (!S || !EVENTS.length) return;
  S.eventPlan = [];
  S.eventCount = 0;
  S.lastEventTick = 0;

  const maxT = G.B.sellTicks || 12000;
  const gap = G.B.sellEventGap || 1500;
  // 第 1 天不出摊事件，让新手先看明白正常流程
  if (s.day <= 1) return;

  const want = s.day >= 4 && G.rng() < 0.45 ? 2 : (G.rng() < 0.72 ? 1 : 0);
  if (!want) return;

  const pool = EVENTS.filter((e) => e.phase === 'SELL' && eligible(G, e));
  if (!pool.length) return;

  const usedGroups = {};
  const usedIds = {};
  let lastTick = gap;
  for (let k = 0; k < want; k++) {
    const cand = pool.filter((e) => !usedGroups[e.group] && !usedIds[e.id] && eligible(G, e));
    if (!cand.length) break;
    const def = pickWeighted(cand, G.rng);
    usedGroups[def.group] = true;
    usedIds[def.id] = true;
    // 落在 [max(gap, 25% 进度), 85% 进度] 之间，越靠后越热闹
    const lo = Math.max(lastTick + gap, Math.floor(maxT * 0.25));
    const hi = Math.floor(maxT * 0.85);
    if (lo >= hi) break;
    const at = lo + Math.floor(G.rng() * (hi - lo));
    S.eventPlan.push({ tick: at, def });
    lastTick = at;
  }
}

/** tick 里检查排期 */
export function tickSellEvents(G) {
  const s = G.s;
  const S = s.sell;
  if (!S || S.done || !S.eventPlan || !S.eventPlan.length) return;
  while (S.eventPlan.length && S.tick >= S.eventPlan[0].tick) {
    const item = S.eventPlan.shift();
    applySellEvent(G, item.def);
    S.eventCount = (S.eventCount || 0) + 1;
    S.lastEventTick = S.tick;
    markUsed(G, item.def);
  }
}

function applySellEvent(G, def) {
  const s = G.s;
  const S = s.sell;
  const arg = def.arg || {};

  switch (def.op) {
    case 'spawn_group': {
      const onMenu = s.menu.filter((m) => m.onMenu);
      const tags = [];
      onMenu.forEach((m) => (G.FOOD[m.foodId].tags || []).forEach((t) => tags.push(t)));
      if (!tags.length) return;
      const tag = tags[Math.floor(G.rng() * tags.length) % tags.length];
      const n = Math.min(arg.count || 4, Math.max(0, S.queueCap - S.customers.length));
      for (let i = 0; i < n; i++) {
        const c = G.spawnCustomer();
        c.wantTag = tag;
        c.patience *= 1.15;          // 团购的人稍微多等一会儿
        S.customers.push(c);
      }
      if (n <= 0) return;
      logEvent(G, def, { title: '来了 ' + n + ' 个要吃' + tagName(G, tag) + '的' });
      break;
    }
    case 'traffic_mul': {
      bumpMods(G, 'trafficMul', arg.factor || 1.35);
      S.mods.trafficMul *= (arg.factor || 1.35);
      logEvent(G, def);
      break;
    }
    case 'utensil_fail': {
      const uids = s.utensils.filter((u) => u);
      if (!uids.length) return;
      const uid = uids[Math.floor(G.rng() * uids.length) % uids.length];
      S.slotsOverride = S.slotsOverride || {};
      S.slotsOverride[uid] = 0;
      logEvent(G, def, { title: utensilName(G, uid) + ' 罢工了' });
      break;
    }
    default:
      return;
  }
  S.banner = { text: def.title, kind: def.good ? 'ok' : 'bad', until: S.tick + 150 };
}

function tagName(G, tag) {
  const t = G.DATA.tags.find ? G.DATA.tags.find((x) => x.id === tag) : null;
  return t ? t.name : tag;
}

function utensilName(G, uid) {
  const u = (G.DATA.utensils.utensils || []).find((x) => x.id === uid);
  return u ? u.name : uid;
}

/* ---------------------------------------------------------------- 汇总 */

/** 给 effects() 用的总系数 */
export function modsFor(G) {
  const s = G.s;
  const w = weatherDef(s.weather) || {};
  const ev = s.eventMods || {};
  const rv = rivalMods(G);
  return {
    weather: w,
    trafficMul: (w.trafficMul || 1) * (ev.trafficMul || 1) * rv.trafficMul,
    priceMul: (w.priceMul || 1) * (ev.priceMul || 1),
    serveMul: (ev.serveMul || 1) * rv.serveMul,
    demandMul: Object.assign({}, w.demand || {}, ev.demandMul || {}),
  };
}

/* ---------------------------------------------------------------- 同行竞争 */

/** 街尾摊：强度随天数和你昨天的评分成长，专挑你最弱的招牌线 */
export function rollRival(G) {
  const s = G.s;
  if (!RIVAL || RIVAL.enabled === false) { s.rival = null; return null; }

  // 你最集中的属性（上架款数最多）
  const cnt = {};
  s.menu.filter((m) => m.onMenu).forEach((m) => {
    (G.FOOD[m.foodId].tags || []).forEach((t) => { cnt[t] = (cnt[t] || 0) + 1; });
  });
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || null;

  // 强度：天数推进 + 你昨天的评分（你越强它越努力）
  const dayK = (s.day - 1) / Math.max(1, G.B.dayCount - 1);
  const scoreK = Math.max(0, Math.min(1, ((s.lastScore || 40) - 40) / 50));
  const strength = Math.max(0, Math.min(1,
    (RIVAL.base || 0.12) + dayK * (RIVAL.dayGain || 0.35) + scoreK * (RIVAL.scoreGain || 0.25)));

  s.rival = { strength, focusTag: top, name: RIVAL.name || '街尾那家' };
  return s.rival;
}

/** 同行抢客：如果他盯的是你最集中的线，抢得更狠 */
export function rivalMods(G) {
  const s = G.s;
  const r = s && s.rival;
  if (!r || !r.strength) return { trafficMul: 1, serveMul: 1 };
  const focus = r.focusTag;
  let pressure = r.strength * (RIVAL ? (RIVAL.pressure || 0.5) : 0.5);
  if (focus) {
    const same = s.menu.filter((m) => m.onMenu
      && (G.FOOD[m.foodId].tags || []).includes(focus)).length;
    // 你在这条线上堆得越多，他抢得越狠
    pressure *= (0.7 + Math.min(1.2, same * 0.15));
  }
  const mul = Math.max(0.55, 1 - pressure);
  return { trafficMul: mul, serveMul: 1 + pressure * 0.25 };
}

export function setRivalEnabled(G, on) {
  if (!RIVAL) return;
  RIVAL.enabled = !!on;
}

export function rivalDef() { return RIVAL; }
export function eventList() { return EVENTS; }
