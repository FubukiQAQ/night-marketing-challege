// headless_run.mjs — 无头跑完整一周目（模拟"聚焦一个标签、薄利多销"的玩家）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGame, setDayMods } from '../src/core.js';
import * as DayMods from '../src/daymods.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, 'src/data', p), 'utf8'));
const DATA = { tags: J('tags.json'), traits: J('traits.json'), foods: J('foods.json'),
  ingredients: J('ingredients.json'), utensils: J('utensils.json'), balance: J('balance.json') };
const JOPT = (p) => { try { return J(p); } catch (e) { return null; } };
const wj = JOPT('weather.json');
const ej = JOPT('events.json');
const rj = JOPT('rival.json');
DayMods.initDayMods({ weather: wj && wj.list, events: ej && ej.list, rival: rj || null });
setDayMods(DayMods);

const G = makeGame(DATA);
G.startRun(null);
const log = [];
const utensilOk = (f) => !f.utensil || G.s.utensils.includes(f.utensil) || f.sellWo;

function buildMenu(size = 4) {
  const pool = G.availableFoods().filter((f) => utensilOk(f) && G.canMake(f));
  if (!pool.length) return null;
  let best = null;
  for (const t of DATA.tags) {
    const trait = DATA.traits.traits.find((x) => x.tag === t.id);
    const list = pool.filter((f) => f.tags.includes(t.id));
    if (!trait || list.length < trait.needMenu) continue;
    const space = list.slice(0, trait.needMenu).reduce((a, f) => a + f.space, 0);
    if (space > G.B.surface) continue;
    if (!best || list.length > best.list.length) best = { t, list, trait };
  }
  if (!best) return null;
  const need = best.list.slice().sort((a, b) => a.space - b.space).slice(0, best.trait.needMenu);
  const menu = need.slice();
  let space = menu.reduce((a, f) => a + f.space, 0);
  for (const f of pool.slice().sort((a, b) => a.cost - b.cost)) {
    if (menu.length >= size) break;
    if (menu.find((x) => x.id === f.id)) continue;
    if (space + f.space > G.B.surface) continue;
    menu.push(f); space += f.space;
  }
  return menu;
}

function buyAll(need, budget) {
  for (const ingId in need) {
    let want = need[ingId], guard = 0;
    while (want > 0 && guard++ < 20) {
      const off = G.offerFor(ingId);
      if (!off) break;
      const afford = Math.floor(budget / Math.max(0.2, off.price));
      const q = Math.min(want, off.stock, Math.max(0, afford));
      if (q <= 0) break;
      budget -= q * off.price;
      const r = G.buy(off.si, off.ii, q);
      if (!r.ok) break;
      want -= q;
    }
  }
}

let totalScore = 0;
for (let d = 1; d <= 7; d++) {
  const menu = buildMenu(4);
  if (!menu) { log.push(`day${d}: 无可用餐品`); break; }
  G.s.menu = menu.map((f) => ({ foodId: f.id, price: Math.round(f.price * 1.1 * 2) / 2, onMenu: true }));

  const expect = Math.round(34 * Math.pow(1.15, d - 1));
  const per = Math.max(4, Math.ceil(expect / menu.length));
  const budget = Math.max(20, G.s.cash * 0.85);
  const need = {};
  menu.forEach((f) => f.recipe.forEach((r) => { need[r.ing] = (need[r.ing] || 0) + r.qty * per; }));
  G.s.phase = 'STOCK';
  G.s.minutesLeft = G.B.stockMinutes;
  const spend0 = G.s.purchases || 0;
  buyAll(need, budget);
  const spend = (G.s.purchases || 0) - spend0;
  G.finishStock();

  let prepped = 0;
  for (const f of menu) {
    const n = Math.min(G.rawCapacity(f), Math.ceil(per * 0.85));
    if (n > 0) { const r = G.prep(f.id, n); if (r.ok) prepped += n; }
  }
  const errs = G.validateMenu().issues.filter((i) => i.level === 'error').map((i) => i.msg);

  G.startSell();
  const S = G.s.sell;
  let n = 0;
  while (!S.done && n++ < G.B.sellTicks + 20) {
    // 模拟玩家处理 QTE：按 70% 的手速/判断力决策
    const q = S.qte;
    if (q && !q.ended) {
      const good = G.rng() < 0.7;
      G.resolveQte(good, good ? '' : '手慢了');
    }
    G.tick();
  }
  const st = G.endSell();
  totalScore += st.score;
  const active = Object.keys(G.effects().active);
  const layers = Object.entries(G.s.layers).filter(([, x]) => x > 0).map(([k, x]) => `${k}:${x}`).join(' ');
  const w = (G.s.weather || 'clear');
  const evs = (G.s.events || []).map((e) => e.id).join(',') || '-';
  const rv = G.s.rival ? G.s.rival.strength.toFixed(2) : '-';
  log.push(`  [${w}] ev=${evs} rival=${rv}`);
  log.push(`day${d} 现金${G.s.cash.toFixed(0)} 花费¥${spend.toFixed(0)} 营收¥${st.revenue.toFixed(0)}/` +
    `${st.target.toFixed(0)} 分=${st.score.toFixed(1)} 卖出${st.served} 流失${st.lost} ` +
    `备${prepped} 菜${menu.length} 词条[${active}] 层{${layers}}` + (errs.length ? ` ⚠${errs.join(';')}` : ''));

  const pool = G.bonusPool();
  const pick = pool.find((b) => b.id === 'surface') || pool.find((b) => b.id === 'layers') || pool[0];
  G.chooseBonus(pick.id);
  G.nextDay();
}

console.log(log.join('\n'));
console.log('\nphase =', G.s.phase, '| cash =', G.s.cash.toFixed(0), '| exp =', G.s.exp,
  '| skillPts =', G.skillPoints(), '| layers =', JSON.stringify(G.s.layers));
console.log('avg score =', (totalScore / 7).toFixed(1));
console.log(G.s.phase === 'META' ? '✅ 完整跑完 7 天一周目' : '❌ 未到达局外结算');
