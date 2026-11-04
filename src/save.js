// save.js — 本地存档（localStorage），一个存档槽 + 跨轮继承的 meta
const KEY = 'bushaoxin.save.v2';
const LEGACY_KEY = 'bushaoxin.v1';
const VERSION = 2;

export function loadSave() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      // 迁移旧版（v0.3 及以前只有一份 run 状态）
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return null;
      const old = JSON.parse(legacy);
      if (!old || !old.s) return null;
      const mig = {
        v: VERSION,
        run: old.s,
        meta: pickMeta(old.s),
        balance: old.balance || null,
        savedAt: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(mig));
      localStorage.removeItem(LEGACY_KEY);
      return mig;
    }
    const o = JSON.parse(raw);
    if (!o || o.v !== VERSION) return null;
    return o;
  } catch (e) {
    return null;
  }
}

export function writeSave(G) {
  if (!G || !G.s) return false;
  try {
    const run = { ...G.s };
    delete run.sell;                       // 出摊过程不存
    if (run.phase === 'SELL') run.phase = 'PREP';
    const payload = {
      v: VERSION,
      run,
      meta: pickMeta(G.s),
      balance: G.B,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) { /* 忽略 */ }
}

/** 跨轮永久保留的部分 */
export function pickMeta(s) {
  return {
    run: s.run || 1,
    layers: s.layers || {},
    exp: s.exp || 0,
    skills: s.skills || { eff: 0, cap: 0, flv: 0 },
    utensils: s.utensils || ['pot', 'fryer', 'ice_maker', 'fridge'],
    runs: s.runs || 0,
    bestDay: s.bestDay || 0,
  };
}

export function describeSave(o) {
  if (!o || !o.run) return null;
  const r = o.run;
  return {
    day: r.day || 1,
    cash: Math.round(r.cash || 0),
    rep: Math.round(r.rep || 55),
    runNo: (o.meta && o.meta.run) || 1,
    phase: r.phase || 'STOCK',
    savedAt: o.savedAt || 0,
  };
}

export function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
