// core.js — 纯逻辑：无 DOM 依赖，可在 Node 里跑（无头验证用）

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STAGES = ['RAW', 'INGREDIENT', 'SEMI_RAW', 'SEMI_COOKED', 'FINISHED'];
const STAGE_CN = { RAW: '原料', INGREDIENT: '食材', SEMI_RAW: '生半成品', SEMI_COOKED: '熟半成品', FINISHED: '成品' };
export { STAGE_CN };

const TIER_OPS_KEYS = [
  'time_reduce_pct', 'extra_buy', 'extra_buy_drink', 'profit_up_pct', 'bypass_finished',
  'qty_cap_up', 'price_up_pct', 'extra_fry', 'streak_cap_up', 'freshness_slow_pct',
  'satisfaction_up', 'bottle_cap_up', 'ticket_up_pct', 'streak_gain_up',
];

export function makeGame(DATA) {
  /** 特殊顾客：更挑、更值钱、成交后触发一次 QTE */
  const SPECIALS = {
    blogger: {
      name: '探店博主', need: ['cold', 'dessert', 'madedrink'],
      mul: 1.6, rep: 3, failRep: -2, kind: 'pick',
      desc: '先拍照再动筷，卖相第一',
      picks: [
        { t: '擦亮碗边、摆正配菜再端上去', ok: true },
        { t: '直接端上去，快就行', ok: false },
        { t: '让她自己挑一份', ok: false },
      ],
    },
    critic: {
      name: '美食评论家', need: ['braised', 'soup', 'grilled'],
      mul: 2.2, rep: 4, failRep: -3, kind: 'timing',
      desc: '嘴上不留情，但一句话能带来客流',
    },
    eater: {
      name: '大胃王', need: null,
      mul: 2.6, rep: 1, failRep: -1, kind: 'pick',
      desc: '一个人点三份，吃完还要打包',
      picks: [
        { t: '提醒他还有一份主食没上', ok: true },
        { t: '照单上菜，别的不管', ok: false },
        { t: '劝他少点一些', ok: false },
      ],
    },
    foodie: {
      name: '老饕', need: ['madedish', 'grilled', 'braised'],
      mul: 1.9, rep: 3, failRep: -2, kind: 'timing',
      desc: '只认现做的锅气，凉了就摇头',
    },
    gold_courier: {
      name: '金主代跑', need: null,
      mul: 3.0, rep: 2, failRep: -2, kind: 'timing',
      desc: '一口气打包十份，赶时间',
    },
  };

  const B = DATA.balance;
  const num = (k, d) => (typeof B[k] === 'number' ? B[k] : d);
  const tags = DATA.tags, traits = DATA.traits.traits || DATA.traits;
  const FOOD = {}, ING = {}, UT = {}, TAG = {};
  DATA.foods.forEach((f) => (FOOD[f.id] = f));
  DATA.ingredients.ingredients.forEach((i) => (ING[i.id] = i));
  DATA.utensils.forEach((u) => (UT[u.id] = u));
  tags.forEach((t) => (TAG[t.id] = t));

  const G = {
    DATA, FOOD, ING, UT, TAG,
    s: null,
    rng: mulberry32(1),
    B: {
      dayCount: num('day_count', 7),
      stockMinutes: num('stock_minutes', 360),
      prepMinutes: num('prep_minutes', 360),
      sellTicks: num('sell_ticks', 12000),
      takeTicks: num('take_ticks', 5),
      startCash: num('start_cash', 300),
      surface: num('surface_capacity_init', 16),
      storage: num('storage_capacity_init', 24),
      freshTiers: [0.9, 0.7, 0.5, 0.25],
      gainN0: num('gain_base_N0', 8),
      gainG: num('gain_growth_G', 120),
      gainK: num('gain_daily_cap_K', 6),
      tierT0: num('tier_T0_default', 20),
      tierR: num('tier_ratio_r', 1.35),
      timeCap: num('time_reduce_cap', 80) / 100,
      pCap: num('probability_cap', 0.95),
      arrival: num('arrival_lambda_day1', 1.2),
      arrivalGrowth: num('arrival_day_growth', 1.18),
      patience: num('patience_ticks', 600),
      browse: num('browse_ticks', 80),
      queueCap: num('queue_cap', 8),
      w1: num('score_w1', 0.4), w2: num('score_w2', 0.35),
      w3: num('score_w3', 0.15), w4: num('score_w4', 0.1),
      targetBase: num('target_revenue_base', 150),
      targetGrowth: num('target_revenue_growth', 1.25),
      trafficHigh: num('nextday_traffic_high', 1.15),
      trafficLow: num('nextday_traffic_low', 0.75),
      onlineBase: num('online_shipping_base', 8),
      tmpMarkup: num('tmp_purchase_markup', 0.45),
      expPerPoint: num('exp_per_point', 800),
      prepBatch: num('prep_batch_minutes', 10),
    },
  };

  // ---------------------------------------------------------------- 存档/开局
  // ---------------------------------------------------------------- 解锁
  G.UTENSIL_BY_CN = { 锅: 'pot', 炸锅: 'fryer', 烤炉: 'grill', 铁板: 'griddle', 蒸笼: 'steamer', 汤桶: 'soup_pot', 卤锅: 'braise_pot', 制冰机: 'ice_maker', 榨汁机: 'juicer', 豆浆机: 'soymilk', 搅拌机: 'blender', 电饭煲: 'rice_cooker', 冰柜: 'fridge' };

  G.isUnlocked = function (food) {
    const s = G.s;
    const u = String(food.unlock || '');
    if (!u || u.indexOf('初始') >= 0) return true;
    const m = u.match(/第(\d+)天/);
    if (m) return s.day >= parseInt(m[1], 10);
    const mu = u.match(/厨具(.+)$/);
    if (mu) {
      const uid = G.UTENSIL_BY_CN[mu[1].trim()];
      return !uid || s.utensils.includes(uid);
    }
    const ms = u.match(/售出(\d+)份/);
    if (ms) return s.day >= 3 || s.bestDay >= 3;
    return s.day >= 3;
  };

  // 这个食材被哪些「已解锁」的菜用到（备货时判断该不该买）
  G.ingredientUsers = function (ingId, limit) {
    return G.availableFoods()
      .filter((f) => f.recipe.some((r) => r.ing === ingId))
      .map((f) => f.name)
      .slice(0, limit || 99);
  };

  // 一键买齐某道菜（按份数），买不到的部分返回缺口
  G.buyForDish = function (foodId, servings) {
    const f = FOOD[foodId];
    const miss = [];
    f.recipe.forEach((r) => {
      let want = r.qty * servings;   // 每次点都"再买 N 份的料"，累加
      while (want > 0) {
        const off = G.offerFor(r.ing);
        if (!off) { miss.push(ING[r.ing].name); break; }
        const q = Math.min(want, off.stock);
        const res = G.buy(off.si, off.ii, q);
        if (!res.ok) { miss.push(ING[r.ing].name); break; }
        want -= q;
      }
    });
    return { ok: miss.length === 0, miss };
  };

  G.availableFoods = function () {
    return DATA.foods.filter((f) => G.isUnlocked(f));
  };

  G.newState = function (carry) {
    const base = {
      run: (carry && carry.run) || 1,
      day: 1,
      cash: G.B.startCash + (carry && carry.cashBonus ? carry.cashBonus : 0),
      layers: (carry && carry.layers) || {},      // 词条层数：永久累积
      exp: (carry && carry.exp) || 0,
      skills: (carry && carry.skills) || { eff: 0, cap: 0, flv: 0 },
      utensils: (carry && carry.utensils) || ['pot', 'fryer', 'ice_maker', 'fridge'],
      bestDay: (carry && carry.bestDay) || 0,
      runs: (carry && carry.runs) || 0,
      rep: 55,
      lastScore: 55,
      phase: 'STOCK',
      inventory: {},           // ingId -> 份数
      premade: {},             // foodId -> {n, fresh}
      menu: [],                // {foodId, price, onMenu}
      carryMenu: null,
      minutesLeft: G.B.stockMinutes,
      suppliers: [],
      dayStats: null,
      lastSettle: null,
      history: [],
      bonusPicked: [],
    };
    return base;
  };

  G.startRun = function (carry) {
    G.s = G.newState(carry);
    if (carry && carry.layers) G.s.layers = Object.assign({}, carry.layers);
    G.startDay();
  };

  G.startDay = function () {
    const s = G.s;
    s.phase = 'STOCK';
    s.minutesLeft = G.B.stockMinutes;
    s.dayStats = null;
    s.rngSeed = s.run * 1000 + s.day * 37;
    G.rng = mulberry32(s.rngSeed);
    s.suppliers = G.rollSuppliers();
    s.menu = s.carryMenu ? s.carryMenu.map((m) => ({ ...m })) : [];
    s.premade = {};
    // 跨日：成品最多留 1 天（简化为丢弃上一日剩余，保留在 carry 里过夜的由 prep 阶段处理）
    s.dayTriggers = {};
    s.sell = null;
  };

  // ---------------------------------------------------------------- 供应商
  G.rollSuppliers = function () {
    const s = G.s;
    const channels = {};
    DATA.ingredients.ingredients.forEach((i) => {
      (channels[i.channel] = channels[i.channel] || []).push(i);
    });
    const all = DATA.ingredients.ingredients;
    const out = [];
    // 综合批发：保证每天都有基础覆盖
    const CORE = ['potato', 'rice', 'flour', 'egg', 'chicken_steak', 'starch_sausage',
      'veg_mixed', 'condiment', 'ice', 'cola'];
    const core = CORE.map((id) => all.find((x) => x.id === id)).filter(Boolean);
    const rest = all.filter((x) => !CORE.includes(x.id)).sort(() => G.rng() - 0.5).slice(0, 8);
    const mixed = core.concat(rest).map((ing) => ({ ingId: ing.id,
      price: Math.max(0.2, Math.round(ing.price * 1.15 * (0.92 + G.rng() * 0.2) * 100) / 100),
      stock: 40 + Math.floor(G.rng() * 80) }));
    const _unused = all;
;
    out.push({ name: '夜市综合批发', markup: 0.12, items: mixed, closed: false, mixed: true });
    // 品类档
    const chs = Object.keys(channels).sort(() => G.rng() - 0.5);
    const n = 3 + Math.floor(G.rng() * 2);
    for (let i = 0; i < n && i < chs.length; i++) {
      const ch = chs[i];
      const markup = 0.02 + G.rng() * 0.2;
      const items = channels[ch].slice().sort(() => G.rng() - 0.5)
        .slice(0, 4 + Math.floor(G.rng() * 4))
        .map((ing) => ({ ingId: ing.id,
          price: Math.max(0.2, Math.round(ing.price * (1 + markup) * (0.9 + G.rng() * 0.25) * 100) / 100),
          stock: 20 + Math.floor(G.rng() * 60) }));
      out.push({ name: ch, markup, items, closed: G.rng() < 0.06, mixed: false });
    }
    return out;
  };

  // 今天哪些食材买得到 / 最低价在哪家
  G.offerFor = function (ingId) {
    const s = G.s;
    let best = null;
    s.suppliers.forEach((sup, si) => {
      if (sup.closed) return;
      sup.items.forEach((it, ii) => {
        if (it.ingId !== ingId || it.stock <= 0) return;
        if (!best || it.price < best.price) best = { si, ii, price: it.price, stock: it.stock };
      });
    });
    return best;
  };

  G.canMake = function (food) {
    return food.recipe.every((r) => !!G.offerFor(r.ing) || (G.s.inventory[r.ing] || 0) > 0);
  };

  // ---------------------------------------------------------------- 采购
  G.storageUsed = function () {
    const s = G.s;
    let used = 0;
    for (const k in s.inventory) {
      const ing = ING[k];
      if (ing) used += (s.inventory[k] * ing.space) / 10;
    }
    return used;
  };

  G.buy = function (supIdx, itemIdx, qty) {
    const s = G.s;
    const sup = s.suppliers[supIdx];
    if (!sup || sup.closed) return { ok: false, msg: '这家今天没开门' };
    const it = sup.items[itemIdx];
    if (!it) return { ok: false, msg: '没有这件货' };
    qty = Math.max(1, Math.floor(qty));
    const ing = ING[it.ingId];
    const cost = it.price * qty;
    const credit = 60 + 20 * s.day;   // 赊账额度：允许先欠着，结算时再补
    if (cost > s.cash + credit) return { ok: false, msg: '现金和赊账额度都不够了' };
    const addSpace = (qty * ing.space) / 10;
    if (G.storageUsed() + addSpace > G.B.storage) return { ok: false, msg: '储存格装不下' };
    const mins = 3 * qty * 0 ; // 采购时间在 finishStock 统一折算
    s.cash = Math.round((s.cash - cost) * 100) / 100;
    it.stock -= qty;
    s.inventory[it.ingId] = (s.inventory[it.ingId] || 0) + qty;
    s.purchases = (s.purchases || 0) + cost;
    s.minutesLeft = Math.max(0, s.minutesLeft - Math.max(1, Math.ceil(qty / 20)));
    if (s.minutesLeft <= 0) G.finishStock();
    return { ok: true, cost };
  };

  G.finishStock = function () {
    const s = G.s;
    if (s.phase !== 'STOCK') return;
    s.phase = 'PREP';
    s.minutesLeft = G.B.prepMinutes;
    s.prepLog = [];
  };

  // ---------------------------------------------------------------- 备餐
  G.prepMinutesFor = function (food) {
    // 一份要从配方起始阶段推到成品所需分钟（含批量开销）
    let m = 0;
    food.recipe.forEach((r) => {
      const steps = DATA.ingredients.stages[r.ing] || [];
      const baseIdx = STAGES.indexOf(r.stage);
      steps.forEach((st) => {
        if (STAGES.indexOf(st.from) >= baseIdx) m += st.minutes / 10;
      });
    });
    return Math.max(0.4, m * 0.6 + G.B.prepBatch / 20);
  };

  G.rawCapacity = function (food) {
    const s = G.s;
    let cap = Infinity;
    for (const r of food.recipe) {
      const have = s.inventory[r.ing] || 0;
      cap = Math.min(cap, Math.floor(have / r.qty));
    }
    return cap === Infinity ? 0 : cap;
  };

  G.consumeRecipe = function (food, n) {
    const s = G.s;
    for (const r of food.recipe) {
      s.inventory[r.ing] = (s.inventory[r.ing] || 0) - r.qty * n;
      if (s.inventory[r.ing] <= 0) delete s.inventory[r.ing];
    }
  };

  G.toggleMenu = function (foodId) {
    const s = G.s;
    const i = s.menu.findIndex((m) => m.foodId === foodId);
    if (i >= 0) { if (s.menu[i].onMenu) s.menu[i].onMenu = false; else s.menu[i].onMenu = true; }
    else {
      const f = FOOD[foodId];
      s.menu.push({ foodId, price: f.price, onMenu: true });
    }
    if (!s.menu.find((m) => m.foodId === foodId).onMenu) {
      // 下架时清掉预备份
      if (s.premade[foodId]) delete s.premade[foodId];
    }
    return G.validateMenu();
  };

  G.setPrice = function (foodId, price) {
    const m = G.s.menu.find((x) => x.foodId === foodId);
    if (m) m.price = Math.max(1, Math.round(price * 2) / 2);
  };

  G.surfaceUsed = function () {
    const s = G.s;
    let used = 0;
    s.menu.filter((m) => m.onMenu).forEach((m) => {
      const f = FOOD[m.foodId];
      used += f.space;
      if (f.utensil && s.utensils.includes(f.utensil) && !m._uCounted) { /* 厨具按件计 */ }
    });
    s.utensils.forEach((u) => { if (UT[u]) used += UT[u].space; });
    return used;
  };

  G.menuCount = function (tagId) {
    return G.s.menu.filter((m) => m.onMenu && FOOD[m.foodId].tags.includes(tagId)).length;
  };

  G.activeTraits = function () {
    const out = {};
    traits.forEach((t) => {
      if (G.menuCount(t.tag) >= t.needMenu) out[t.id] = true;
    });
    return out;
  };

  G.tierOf = function (trait) {
    const X = G.s.layers[trait.id] || 0;
    const tiers = DATA.traits.tiers[trait.id] || [];
    let cur = null;
    tiers.forEach((t) => { if (X >= t.minX) cur = t; });
    return cur;
  };

  G.tierProgress = function (trait) {
    const X = G.s.layers[trait.id] || 0;
    const tiers = DATA.traits.tiers[trait.id] || [];
    const next = tiers.find((t) => t.minX > X);
    return { X, next: next ? next.minX : null, tier: G.tierOf(trait) };
  };

  // 汇总所有生效效果
  G.effects = function () {
    const active = G.activeTraits();
    const mods = {
      active,
      serveMul: 1, profitMul: 1, priceMul: 1, freshMul: 1,
      extraBuy: [], extraDrink: [], extraFry: [],
      qtyCapAdd: {}, satisfactionAdd: 0, streakCap: 3, trafficMul: 1,
      bypassFinished: {}, resonances: [],
    };
    const apply = (op, v1, v2, scopeTag) => {
      switch (op) {
        case 'time_reduce_pct': mods.serveMul *= 1 - Math.min(G.B.timeCap, v1 / 100); break;
        case 'profit_up_pct': mods.profitMul *= 1 + v1 / 100; break;
        case 'price_up_pct': mods.priceMul *= 1 + v1 / 100; break;
        case 'freshness_slow_pct': mods.freshMul *= 1 - Math.min(0.8, v1 / 100); break;
        case 'extra_buy': mods.extraBuy.push({ p: Math.min(G.B.pCap, v1 / 100), n: v2 }); break;
        case 'extra_buy_drink': mods.extraDrink.push({ p: Math.min(G.B.pCap, v1 / 100), n: v2 }); break;
        case 'extra_fry': mods.extraFry.push({ p: Math.min(G.B.pCap, v1 / 100), n: v2 }); break;
        case 'qty_cap_up': mods.qtyCapAdd[scopeTag] = (mods.qtyCapAdd[scopeTag] || 0) + v1; break;
        case 'bypass_finished': mods.bypassFinished[scopeTag] = true; break;
        case 'satisfaction_up': mods.satisfactionAdd += v1; break;
        case 'streak_cap_up': mods.streakCap = Math.max(mods.streakCap, v1); break;
        case 'bottle_cap_up': mods.extraDrink.push({ p: 1, n: v1 }); break;
        case 'ticket_up_pct': mods.profitMul *= 1 + v1 / 100; break;
        case 'streak_gain_up': mods.streakBonus = (mods.streakBonus || 0) + v1; break;
        default: break;
      }
    };
    traits.forEach((t) => {
      if (!active[t.id]) return;
      const tier = G.tierOf(t);
      if (!tier) return;
      apply(tier.op, tier.v1, tier.v2, t.tag);
      if (tier.scope === 'all_half') apply(tier.op, tier.v1 / 2, tier.v2, 'all');
    });
    // 共鸣
    DATA.traits.resonances.forEach((r) => {
      const okA = active[r.a] && (G.s.layers[r.a] || 0) >= r.minA;
      const okB = active[r.b] && (G.s.layers[r.b] || 0) >= r.minB;
      const okC = !r.c || (active[r.c] && (G.s.layers[r.c] || 0) >= r.minC);
      if (!(okA && okB && okC)) return;
      const extra = Math.min(
        (G.s.layers[r.a] || 0) - r.minA + ((G.s.layers[r.b] || 0) - r.minB) + (r.c ? (G.s.layers[r.c] || 0) - r.minC : 0),
        Infinity
      );
      let tier = null;
      r.tiers.forEach((t) => { if (extra >= t.extra) tier = t; });
      mods.resonances.push({ id: r.id, name: r.name, tier });
      if (tier) apply(tier.op, tier.v1, tier.v2, 'reso');
      if (op0(tier) === 'time_reduce_pct' && tier.v2) mods.trafficMul *= 1 + tier.v2 / 100;
    });
    function op0(t) { return t ? t.op : null; }
    return mods;
  };

  // ---------------------------------------------------------------- 备餐动作
  G.prep = function (foodId, servings) {
    const s = G.s;
    const f = FOOD[foodId];
    servings = Math.floor(servings);
    if (servings <= 0) return { ok: false, msg: '' };
    const can = G.rawCapacity(f);
    if (can < servings) return { ok: false, msg: `食材只够做 ${can} 份` };
    const need = G.prepMinutesFor(f) * servings;
    if (need > s.minutesLeft) return { ok: false, msg: `时间不够（需 ${need.toFixed(0)} 分钟）` };
    G.consumeRecipe(f, servings);
    s.minutesLeft -= need;
    const cur = s.premade[foodId] || { n: 0, fresh: 1 };
    s.premade[foodId] = { n: cur.n + servings, fresh: Math.min(cur.fresh, 1) };
    s.prepLog = s.prepLog || [];
    s.prepLog.push({ foodId, servings, minutes: need });
    return { ok: true, servings, minutes: need };
  };

  G.validateMenu = function () {
    const s = G.s;
    const issues = [];
    const onMenu = s.menu.filter((m) => m.onMenu);
    if (!onMenu.length) issues.push({ level: 'warn', msg: '还没上架任何餐品' });
    onMenu.forEach((m) => {
      const f = FOOD[m.foodId];
      if (f.utensil && !s.utensils.includes(f.utensil) && !f.sellWo)
        issues.push({ level: 'error', msg: `${f.name} 需要${UT[f.utensil] ? UT[f.utensil].name : f.utensil}，且不能只卖成品` });
    });
    const used = G.surfaceUsed();
    if (used > G.B.surface) issues.push({ level: 'error', msg: `台面超了 ${(used - G.B.surface).toFixed(1)} 格` });
    return { issues, used, cap: G.B.surface };
  };

  // ---------------------------------------------------------------- 出摊
  G.startSell = function () {
    const s = G.s;
    const mods = G.effects();
    s.phase = 'SELL';
    s.sell = {
      tick: 0,
      customers: [],
      jobs: {},
      revenue: 0, served: 0, lost: 0, complaints: 0, satSum: 0, satN: 0,
      streak: 0, lastTag: null,
      floaters: [],
      counters: {},        // foodId -> 计数
      gains: {},           // foodId -> 今日已触发次数
      mods,
      pricesYesterday: s.pricesYesterday || {},
      queueCap: G.B.queueCap,
      done: false,
    };
    // 进入出摊钩子
    G.firePhaseHook('on_phase_enter');
    return s.sell;
  };

  G.firePhaseHook = function (trigger) {
    const s = G.s;
    const onMenu = s.menu.filter((m) => m.onMenu);
    const active = G.activeTraits();
    onMenu.forEach((m) => {
      const f = FOOD[m.foodId];
      const p = f.perk;
      if (!p || p.trigger !== trigger) return;
      const targets = G.perkTargets(f, p, active);
      targets.forEach((tid) => G.addLayers(tid, p.delta, f.name, trigger));
    });
  };

  G.perkTargets = function (food, p, active, foodOnly) {
    const out = [];
    const own = food.tags.map((tg) => traits.find((t) => t.tag === tg)).filter(Boolean).map((t) => t.id);
    switch (p.target) {
      case 'own_tag': out.push(...own.filter((id) => active[id])); break;
      case 'own_tag_noreq': out.push(...own); break;
      case 'all_active': out.push(...Object.keys(active)); break;
      case 'random_active': {
        const ks = Object.keys(active);
        if (ks.length) out.push(ks[Math.floor(G.rng() * ks.length)]);
        break;
      }
      case 'highest': {
        const ks = Object.keys(active);
        if (ks.length) out.push(ks.sort((a, b) => (G.s.layers[b] || 0) - (G.s.layers[a] || 0))[0]);
        break;
      }
      case 'lowest': {
        const ks = Object.keys(active);
        if (ks.length) out.push(ks.sort((a, b) => (G.s.layers[a] || 0) - (G.s.layers[b] || 0))[0]);
        break;
      }
      default: break;
    }
    return out;
  };

  G.addLayers = function (traitId, n, src, reason) {
    const s = G.s;
    const before = G.s.layers[traitId] || 0;
    G.s.layers[traitId] = before + n;
    const t = traits.find((x) => x.id === traitId);
    if (s.sell) {
      s.sell.floaters.push({ kind: 'layer', text: `+${n}`, trait: traitId, age: 0 });
      const tOld = G.tierAt(traitId, before);
      const tNew = G.tierAt(traitId, before + n);
      if (tOld !== tNew) {
        s.sell.floaters.push({ kind: 'tier', text: `${t ? t.name : traitId} ${tNew} 档!`, trait: traitId, age: 0 });
      }
    }
    return n;
  };

  G.tierAt = function (traitId, X) {
    const tiers = DATA.traits.tiers[traitId] || [];
    let idx = 0;
    tiers.forEach((t) => { if (X >= t.minX) idx = t.tier; });
    return idx;
  };

  // 每 tick 推进
  G.tick = function () {
    const s = G.s;
    const S = s.sell;
    if (!S || S.done) return;
    const mods = S.mods;
    S.tick++;
    const T = S.tick;
    const maxT = G.B.sellTicks;

    // 风味衰减
    for (const fid in s.premade) {
      const p = s.premade[fid];
      const f = FOOD[fid];
      if (p.n > 0) p.fresh = Math.max(0, p.fresh - f.k * 0.02 * mods.freshMul);
    }

    // 到达
    const seg = T / maxT;
    const curve = seg < 0.15 ? 0.7 + seg * 2 : seg < 0.45 ? 1.0 + seg * 0.5 : seg < 0.75 ? 1.25 : 0.8;
    const lambda = G.B.arrival * Math.pow(G.B.arrivalGrowth, s.day - 1)
      * (s.lastScore >= 85 ? G.B.trafficHigh : s.lastScore < 40 ? G.B.trafficLow : 1)
      * mods.trafficMul * curve;
    if (S.customers.length < S.queueCap && G.rng() < lambda / 200) {
      S.customers.push(G.spawnCustomer());
    }

    // 顾客推进
    for (let i = S.customers.length - 1; i >= 0; i--) {
      const c = S.customers[i];
      c.age++;
      if (c.state === 'browse') {
        if (c.age >= G.B.browse) {
          const job = G.customerOrder(c);
          if (!job || job.instant) S.customers.splice(i, 1);
          else { c.state = 'wait'; c.job = job; c.waited = 0; }
        }
        continue;
      }
      if (c.state === 'happy') {
        if (S.tick >= (c.happyUntil || 0)) S.customers.splice(i, 1);
        continue;
      }
      if (c.state === 'wait') {
        c.waited++;
        if (c.done) { S.customers.splice(i, 1); continue; }
        if (c.waited > c.patience) {
          G.cancelJob(c.job);
          S.customers.splice(i, 1);
          S.lost++;
          S.complaints += 0.5;
          S.floaters.push({ kind: 'bad', text: '等太久走了', age: 0 });
        }
      }
    }

    // QTE 倒计时：超时算没接住
    if (S.qte && !S.qte.ended) {
      S.qte.left--;
      if (S.qte.left <= 0) G.resolveQte(false, '没来得及', true);
    }
    // 彩带/横幅超时清理
    if (S.banner && T >= S.banner.until) S.banner = null;

    // 厨具加工
    for (const u in S.jobs) {
      const slots = UT[u] ? UT[u].slots : 1;
      const q = S.jobs[u];
      let active = 0;
      for (let i = 0; i < q.length; i++) {
        if (active >= slots) break;
        active++;
        q[i].left--;
        if (q[i].left <= 0) {
          G.completeServe(q[i]);
          q.splice(i, 1);
          i--; active--;
        }
      }
    }

    // 立即取货（premade）完成的顾客在上一步已结算
    if (T >= maxT) G.endSell();
  };

  G.spawnCustomer = function () {
    const s = G.s;
    const onMenu = s.menu.filter((m) => m.onMenu);
    // 按「该标签上架款数 × 属性需求权重」加权：招牌越集中，客流越集中
    const w = {};
    onMenu.forEach((m) => {
      FOOD[m.foodId].tags.forEach((t) => {
        const tg = TAG[t];
        w[t] = (w[t] || 0) + (tg ? tg.weight : 1) * 0.5;
      });
    });
    const keys = Object.keys(w);
    let total = keys.reduce((a, k) => a + w[k], 0) || 1;
    let r = G.rng() * total;
    let wantTag = keys[0] || 'fast';
    for (const k of keys) { r -= w[k]; if (r <= 0) { wantTag = k; break; } }
    const cust = {
      state: 'browse', age: 0, wantTag,
      patience: G.B.patience * (0.7 + G.rng() * 0.6),
      waited: 0,
      budget: 30 + G.rng() * 60,
    };

    // 特殊顾客：小概率出现，更挑也更值钱
    const chance = (G.B.specialChance != null ? G.B.specialChance : 0.14);
    if (G.rng() < chance) {
      const ids = Object.keys(SPECIALS);
      const id = ids[Math.floor(G.rng() * ids.length) % ids.length];
      const sp = SPECIALS[id];
      cust.special = id;
      cust.mood = 'normal';
      cust.patience = G.B.patience * (0.55 + G.rng() * 0.35);
      cust.budget = 80 + G.rng() * 120;
      // 优先点他要的那类
      if (sp.need) {
        const hit = sp.need.filter((t) => keys.includes(t));
        if (hit.length) cust.wantTag = hit[Math.floor(G.rng() * hit.length) % hit.length];
      }
    }
    return cust;
  };

  /** 玩家接下 QTE。ok=true 成功，false 失败（超时也走这里） */
  G.resolveQte = function (ok, reason, soft) {
    const s = G.s;
    const S = s.sell;
    const q = S && S.qte;
    if (!q || q.ended) return null;
    q.ended = true;
    q.ok = !!ok;

    const sp = SPECIALS[q.type] || {};
    if (ok) {
      // 成功：加钱 + 加口碑 + 记一次高光
      const bonus = q.base * (q.mul - 1);
      S.revenue += bonus;
      s.rep = (s.rep || 0) + (q.rep || 2);
      S.qteWins = (S.qteWins || 0) + 1;
      if (q.cust) q.cust.mood = 'happy';
      S.floaters.push({ kind: 'money', text: `+¥${bonus.toFixed(1)}`, age: 0 });
      S.banner = { text: `${q.name}：这摊子值得再来`, kind: 'ok', until: S.tick + 150 };
    } else {
      // 失败：掉口碑；超时算轻度，不计客诉、罚一半
      const pen = (q.failRep || -2) * (soft ? 0.5 : 1);
      s.rep = Math.max(0, (s.rep || 0) + pen);
      if (!soft) S.complaints = (S.complaints || 0) + 1;
      S.qteFails = (S.qteFails || 0) + 1;
      if (q.cust) q.cust.mood = 'unhappy';
      S.floaters.push({ kind: 'bad', text: reason || '没接住', age: 0 });
      S.banner = { text: `${q.name}：就这？`, kind: 'bad', until: S.tick + 150 };
    }
    // 让这个人快点走，别堵队
    if (q.cust) q.cust.happyUntil = Math.min(q.cust.happyUntil || S.tick, S.tick + 20);
    S.qte = null;
    return { ok: q.ok, type: q.type, name: q.name };
  };

  G.pickDish = function (tag, exclude) {
    const s = G.s;
    const S = s.sell;
    const cands = s.menu.filter((m) => m.onMenu && FOOD[m.foodId].tags.includes(tag) && !(exclude || []).includes(m.foodId));
    if (!cands.length) return null;
    // 便宜的更容易被点
    let total = 0;
    const ws = cands.map((m) => {
      const w = 1 / Math.max(1, m.price) * 20;
      total += w;
      return w;
    });
    let r = G.rng() * total;
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i]; }
    return cands[cands.length - 1];
  };

  G.customerOrder = function (c) {
    const s = G.s;
    const S = s.sell;
    let m = null, f = null;
    const tried = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      m = G.pickDish(c.wantTag, tried);
      if (!m) break;
      f = FOOD[m.foodId];
      const pre0 = s.premade[m.foodId];
      const capAdd0 = S.mods.qtyCapAdd[f.tags[0]] || 0;
      const raw0 = G.rawCapacity(f) + capAdd0;
      const canCook0 = !f.utensil || s.utensils.includes(f.utensil);
      const bypass0 = S.mods.bypassFinished[f.tags[0]];
      if ((pre0 && pre0.n > 0) || (raw0 > 0 && (canCook0 || bypass0 || f.sellWo))) break;
      tried.push(m.foodId);
      m = null;
    }
    if (!m) { S.lost++; return null; }
    const pre = s.premade[m.foodId];
    const capAdd = S.mods.qtyCapAdd[f.tags[0]] || 0;
    let usePre = pre && pre.n > 0;
    if (!usePre) {
      const rawCap = G.rawCapacity(f) + capAdd;
      const canCook = !f.utensil || s.utensils.includes(f.utensil);
      const bypass = S.mods.bypassFinished[f.tags[0]];
      if (rawCap <= 0 || (!canCook && !bypass && !f.sellWo)) { S.lost++; return null; }
      G.consumeRecipe(f, 1);
    }
    const job = { foodId: m.foodId, price: m.price, tag: c.wantTag, cust: c, left: 0, pre: !!usePre, fresh: 1, instant: false, utensil: '' };
    if (usePre) {
      job.fresh = pre.fresh;
      pre.n--;
      job.instant = true;
      job.left = Math.max(1, Math.round(f.takeTicks));
      G.completeServe(job);
    } else {
      job.fresh = 1;
      let t = f.serveTicks * S.mods.serveMul;
      if (S.mods.bypassFinished[f.tags[0]]) t = Math.min(t, f.takeTicks * 2);
      job.left = Math.max(2, Math.round(t));
      const u = f.utensil && s.utensils.includes(f.utensil) ? f.utensil : '_none';
      job.utensil = u;
      (S.jobs[u] = S.jobs[u] || []).push(job);
      if (u === '_none') {
        job.instant = true;
        S.jobs[u].pop();
        G.completeServe(job);
      }
    }
    // 足迹：特性计数
    G.countPerk(f);
    return job;
  };

  G.countPerk = function (f) {
    const s = G.s;
    const S = s.sell;
    const p = f.perk;
    if (!p || !p.trigger || !p.trigger.startsWith('per_sold')) return;
    const gained = S.gains[f.id] || 0;
    if (gained >= G.B.gainK && p.trigger === 'per_sold') return;
    if (p.trigger === 'per_sold') {
      S.counters[f.id] = (S.counters[f.id] || 0) + 1;
      const X = G.s.layers[traits.find((t) => t.tag === f.tags[0]) ? traits.find((t) => t.tag === f.tags[0]).id : ''] || 0;
      const need = Math.round(p.n * (1 + X / G.B.gainG));
      if (S.counters[f.id] >= need) {
        S.counters[f.id] -= need;
        const active = G.activeTraits();
        G.perkTargets(f, p, active).forEach((tid) => G.addLayers(tid, p.delta, f.name, 'per_sold'));
        S.gains[f.id] = gained + 1;
      }
    } else if (p.trigger === 'per_sold_chance') {
      if (G.rng() < p.chance) {
        const active = G.activeTraits();
        G.perkTargets(f, p, active).forEach((tid) => G.addLayers(tid, p.delta, f.name, 'chance'));
        S.gains[f.id] = gained + 1;
      }
    }
  };

  G.completeServe = function (job) {
    const s = G.s;
    const S = s.sell;
    const f = FOOD[job.foodId];
    const mods = S.mods;
    const tierIdx = job.fresh >= G.B.freshTiers[0] ? 0 : job.fresh >= G.B.freshTiers[1] ? 1
      : job.fresh >= G.B.freshTiers[2] ? 2 : job.fresh >= G.B.freshTiers[3] ? 3 : 4;
    if (tierIdx >= 4) { S.lost++; return; }
    const freshMul = [1, 0.9, 0.8, 0.6][tierIdx] || 0.6;
    const price = job.price * freshMul * mods.profitMul * mods.priceMul;
    S.revenue += price;
    S.served++;
    let sat = 4.6 + mods.satisfactionAdd - (1 - job.fresh) * 1.6;
    // 额外加购（吃饱了 / 好辣！/ 共鸣）
    mods.extraBuy.forEach((e) => {
      if (G.rng() < e.p) { S.revenue += price * 0.35 * e.n; S.floaters.push({ kind: 'buy', text: `加购!`, age: 0 }); sat += 0.1; }
    });
    if (f.tags.includes('spicy')) {
      mods.extraDrink.forEach((e) => {
        if (G.rng() < e.p) { S.revenue += 6 * e.n * mods.profitMul; S.floaters.push({ kind: 'buy', text: `配饮料!`, age: 0 }); }
      });
    }
    if (f.tags.includes('fried')) {
      mods.extraFry.forEach((e) => {
        if (G.rng() < e.p) { S.revenue += price * 0.5 * e.n; S.floaters.push({ kind: 'buy', text: `再炸一份!`, age: 0 }); }
      });
    }
    // streak
    if (S.lastTag === job.tag) S.streak++; else { S.streak = 1; S.lastTag = job.tag; }
    if (S.streak >= 2) sat += Math.min(mods.streakCap, S.streak) * 0.05;
    sat = Math.max(1, Math.min(5, sat));
    S.satSum += sat; S.satN++;
    if (sat < 3) S.complaints++;
    S.floaters.push({ kind: 'money', text: `+¥${price.toFixed(1)}`, age: 0 });
    if (job.cust) {                                   // 成交后短暂停留再离开
      job.cust.state = 'happy';
      job.cust.happyUntil = S.tick + 45;
      job.cust.done = false;

      // 特殊顾客：成交后开一次 QTE（同时只允许一个）
      if (job.cust.special && !S.qte) {
        const sp = SPECIALS[job.cust.special];
        const total = (G.B.qteTicks != null ? G.B.qteTicks : 620);
        const qte = {
          type: job.cust.special,
          name: sp.name,
          kind: sp.kind,
          total,
          left: total,
          cust: job.cust,
          base: price,
          mul: sp.mul,
          rep: sp.rep,
          failRep: sp.failRep,
          ended: false,
          ok: false,
        };
        if (sp.kind === 'pick') {
          // 打乱选项顺序，避免每次都点同一个位置
          const opts = sp.picks.map((p) => ({ t: p.t, ok: p.ok }));
          for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(G.rng() * (i + 1)) % (i + 1);
            const tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
          }
          qte.options = opts;
        } else {
          // 时机：绿区在中间偏右，位置由 left 推出来
          qte.zone = [0.44, 0.60];
        }
        S.qte = qte;
        S.floaters.push({ kind: 'tier', text: sp.name + ' 来了!', age: 0 });
      }
    }
    // 售出类统计钩子
    if (f.perk && f.perk.trigger === 'on_first_sold') {
      const key = f.id + '_first';
      if (!G.s.dayTriggers[key]) {
        G.s.dayTriggers[key] = true;
        const active = G.activeTraits();
        G.perkTargets(f, f.perk, active).forEach((tid) => G.addLayers(tid, f.perk.delta, f.name, 'first'));
      }
    }
  };

  G.cancelJob = function (job) {
    const S = G.s.sell;
    if (!job || !job.utensil) return;
    const q = S.jobs[job.utensil];
    if (!q) return;
    const i = q.indexOf(job);
    if (i >= 0) q.splice(i, 1);
  };

  G.endSell = function () {
    const s = G.s;
    const S = s.sell;
    if (S.done) return s.lastSettle;
    G.firePhaseHook('on_phase_exit');
    S.done = true;
    const rev = S.revenue;
    const target = G.B.targetBase * Math.pow(G.B.targetGrowth, s.day - 1);
    const reach = Math.min(1, rev / target);
    const sat = S.satN ? S.satSum / S.satN : 0;
    const complaintRate = S.served ? S.complaints / S.served : 0;
    const totalVisitors = S.served + S.lost;
    const lostRate = totalVisitors ? S.lost / totalVisitors : 0;
    s.cash = Math.round((s.cash + rev) * 100) / 100;   // 营收入账
    let score = (G.B.w1 * reach + G.B.w2 * (sat / 5) - G.B.w3 * complaintRate - G.B.w4 * lostRate) * 100;
    score = Math.max(0, Math.min(100, score));
    s.lastScore = score;
    s.rep = Math.max(0, Math.min(100, s.rep + (score - 55) * 0.3));
    const exp = Math.round((60 + s.day * 20) * (0.5 + score / 100));
    s.exp += exp;
    s.history.push({ day: s.day, revenue: rev, score, served: S.served, lost: S.lost, sat, exp });
    // 菜单价格记忆（供次日弹性）
    s.pricesYesterday = {};
    s.menu.filter((m) => m.onMenu).forEach((m) => { s.pricesYesterday[m.foodId] = m.price; });
    s.carryMenu = s.menu.filter((m) => m.onMenu).map((m) => ({ ...m }));
    s.lastSettle = {
      day: s.day, revenue: rev, target, reach, sat, score, exp,
      served: S.served, lost: S.lost, complaints: S.complaints,
      layers: { ...s.layers },
    };
    s.phase = 'SETTLE';
    return s.lastSettle;
  };

  // ---------------------------------------------------------------- 加成 / 结算
  G.bonusPool = function () {
    const s = G.s;
    const pool = [
      { id: 'surface', name: '摊位扩容', desc: '台面 +4 格', icon: 'ui/ui_node_active.png', apply: () => { G.B.surface += 4; } },
      { id: 'storage', name: '多买一个冰柜', desc: '储存 +6 格', icon: 'ui/ui_node_ready.png', apply: () => { G.B.storage += 6; } },
      { id: 'time', name: '手脚麻利', desc: '备餐时间 +60 分钟', icon: 'ui/ui_progress_fill_warm.png', apply: () => { G.B.prepMinutes += 60; } },
      { id: 'profit', name: '会做生意', desc: '全摊利润 +8%', icon: 'ui/ui_star_full.png', apply: () => { s.permanentProfit = (s.permanentProfit || 0) + 0.08; } },
      { id: 'fresh', name: '保温箱', desc: '成品风味衰减 -20%', icon: 'ui/ui_stamp_good.png', apply: () => { s.permanentFresh = (s.permanentFresh || 0) + 0.2; } },
      { id: 'traffic', name: '老主顾', desc: '客流 +10%', icon: 'ui/ui_trend_up.png', apply: () => { s.permanentTraffic = (s.permanentTraffic || 0) + 0.1; } },
      { id: 'layers', name: '灯又亮了几颗', desc: '所有已激活词条 +3 层', icon: 'ui/ui_star_full.png', apply: () => { Object.keys(G.activeTraits()).forEach((k) => { s.layers[k] = (s.layers[k] || 0) + 3; }); } },
      { id: 'utensil', name: '添置厨具', desc: '免费获得一件未拥有厨具', icon: 'ui/ui_node_active.png', apply: () => { const miss = DATA.utensils.find((u) => !s.utensils.includes(u.id)); if (miss) s.utensils.push(miss.id); } },
    ];
    return pool;
  };

  G.chooseBonus = function (id) {
    const s = G.s;
    const b = G.bonusPool().find((x) => x.id === id);
    if (b) { b.apply(); s.bonusPicked.push(b.name); }
    return b;
  };

  G.nextDay = function () {
    const s = G.s;
    if (s.day >= G.B.dayCount) { s.phase = 'META'; return { runOver: true }; }
    s.day++;
    G.startDay();
    return { runOver: false };
  };

  // 把技能加成套到当前 B 上（开局/新一轮都走这里）
  G.applySkills = function () {
    const b = DATA.balance;
    G.B.surface = (b.surface_capacity_init || 26) + (G.s.skills.cap || 0) * 3;
    G.B.storage = (b.storage_capacity_init || 36);
    G.B.prepMinutes = (b.prep_minutes || 360) + (G.s.skills.eff || 0) * 30;
  };

  G.skillPoints = function () {
    const s = G.s;
    return Math.floor(s.exp / G.B.expPerPoint) - (s.skills.eff + s.skills.cap + s.skills.flv);
  };

  G.buySkill = function (branch) {
    const s = G.s;
    if (G.skillPoints() <= 0) return false;
    if (s.skills[branch] >= 3) return false;
    s.skills[branch]++;
    return true;
  };

  G.nextRun = function () {
    const s = G.s;
    const carry = {
      run: s.run + 1, layers: s.layers, exp: s.exp, skills: s.skills,
      utensils: s.utensils, runs: (s.runs || 0) + 1, bestDay: Math.max(s.bestDay, G.B.dayCount),
    };
    G.startRun(carry);
    G.applySkills();
  };

  return G;
}
