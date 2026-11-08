// tutorial.js —— 新手教程：步进式教练卡 + 目标高亮
// 设计：教程只做「提示 + 高亮」，不阻塞任何操作；进度存在 G.s.tut 里，跟着存档走。

let STEPS = [];
let META = { title: '新手引导', intro: '', finish: { title: '', text: '' } };
let hostEl = null;
let lastKey = '';
let pollTimer = 0;

/** 载入步骤表 */
export function initTutorial(data) {
  if (!data || !Array.isArray(data.steps)) return;
  STEPS = data.steps;
  META = {
    title: data.title || META.title,
    intro: data.intro || '',
    finish: data.finish || META.finish,
  };
}

export function stepCount() { return STEPS.length; }

/** 当前步骤下标（999 = 已跳过/已完成） */
export function current(G) {
  if (!G || !G.s) return 999;
  if (typeof G.s.tut !== 'number') return 999;
  return G.s.tut;
}

export function isActive(G) {
  return current(G) < STEPS.length;
}

/**
 * 试营业的起步料：挑配方最短的几道菜，把它们要的料各给 10 份。
 * 目的不是送钱，是保证「上架 → 备份 → 出摊」这条链在教程里一定能跑通，
 * 否则玩家可能因为只买了一样东西而在出摊时无事发生。
 */
function pickTutorialDish(G) {
  const foods = (typeof G.availableFoods === 'function' ? G.availableFoods() : []) || [];
  const ok = foods.filter((f) => {
    const hasUt = !f.utensil || G.s.utensils.includes(f.utensil);
    return hasUt && f.recipe && f.recipe.length >= 1 && f.recipe.length <= 2
      && (f.space || 0) <= 2;
  });
  ok.sort((a, b) => a.recipe.length - b.recipe.length
    || (a.space || 0) - (b.space || 0)
    || (b.price || 0) - (a.price || 0));
  return ok[0] || foods[0] || null;
}

/** 只给教学菜备料：保证「上架 → 备份 → 出摊」这条链一定能跑通 */
function seedStarterKit(G, dish) {
  if (!dish) return 0;
  let added = 0;
  dish.recipe.forEach((r) => {
    const want = r.qty * 10;
    const cur = G.s.inventory[r.ing] || 0;
    if (cur < want) { G.s.inventory[r.ing] = want; added++; }
  });
  return added;
}

/** 开场把教程打开（只对第一次玩的人），并发放起步料 */
export function enable(G) {
  if (!G || !G.s) return;
  if (typeof G.s.tut === 'number') return;
  G.s.tut = 0;
  const dish = pickTutorialDish(G);
  if (dish) {
    G.s.tutDish = dish.id;
    G.s.tutorialKit = seedStarterKit(G, dish) > 0;
  }
}

/** 把 {dish} 占位符换成教学菜 id */
function resolveTarget(sel, G) {
  if (!sel) return sel;
  const id = (G && G.s && G.s.tutDish) || '';
  return sel.replace(/\{dish\}/g, id);
}

export function disable(G) {
  if (!G || !G.s) return;
  G.s.tut = 999;
  paint(G);
}

export function restart(G) {
  if (!G || !G.s) return;
  G.s.tut = 0;
  lastKey = '';
  paint(G);
}

/**
 * 玩家做了某个动作 → 若正好是当前步骤，推进一格。
 * @param {string} actionId 与 tutorial.json 的 step.id 对应
 */
export function advance(G, actionId) {
  if (!isActive(G)) return false;
  let moved = false;
  // 允许连续跳过若干步（例如连锁动作）
  for (let guard = 0; guard < STEPS.length; guard++) {
    const st = STEPS[current(G)];
    if (!st || st.id !== actionId) break;
    G.s.tut = current(G) + 1;
    moved = true;
    actionId = null;          // 一次只推进一格
    break;
  }
  if (moved) { lastKey = ''; paint(G); }
  return moved;
}

/** 阶段变化时调用：自动跳过「可选项」以及已经错过的步骤 */
export function syncPhase(G) {
  if (!isActive(G)) { paint(G); return; }
  const phase = G.s.phase;
  const order = ['STOCK', 'PREP', 'SELL', 'SETTLE', 'META'];
  let guard = 0;
  while (guard++ < STEPS.length) {
    const st = STEPS[current(G)];
    if (!st) break;
    const curIdx = order.indexOf(st.phase);
    const nowIdx = order.indexOf(phase);
    // 教程步骤所在阶段已经过去了 → 跳过（可选项更该跳）
    if (curIdx >= 0 && nowIdx > curIdx) { G.s.tut = current(G) + 1; continue; }
    break;
  }
  lastKey = '';
  paint(G);
}

function el() {
  if (!hostEl || !hostEl.isConnected) {
    hostEl = document.getElementById('coach');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.id = 'coach';
      document.body.appendChild(hostEl);
    }
  }
  return hostEl;
}

/** 清掉所有高亮 */
function clearHL() {
  document.querySelectorAll('.tut-hl').forEach((e) => e.classList.remove('tut-hl'));
}

/** 绘制教练卡 */
export function paint(G) {
  const host = el();
  if (!host) return;

  if (!G || !G.s || !isActive(G)) {
    if (host.dataset.on === '1') {
      host.dataset.on = '0';
      host.innerHTML = '';
      host.classList.remove('on');
      clearHL();
      lastKey = '';
    }
    return;
  }

  const idx = current(G);
  const st = STEPS[idx];
  if (!st) return;

  const key = idx + ':' + G.s.phase;
  if (host.dataset.k === key) return;
  host.dataset.k = key;
  host.dataset.on = '1';
  host.classList.add('on');
  lastKey = key;

  host.innerHTML = `
    <div class="coach-card">
      <div class="coach-top">
        <span class="coach-badge">${META.title}</span>
        <span class="coach-prog">${idx + 1} / ${STEPS.length}</span>
      </div>
      <div class="coach-title">${st.title}</div>
      <div class="coach-text">${st.text}</div>
      <div class="coach-acts">
        <button class="small" data-act="tutSkip">跳过引导</button>
      </div>
    </div>`;

  // 高亮目标
  clearHL();
  const tsel = resolveTarget(st.target, G);
  if (tsel) {
    let node = null;
    try { node = document.querySelector(tsel); } catch (e) { node = null; }
    if (node) {
      node.classList.add('tut-hl');
      // 滚动到可见（只在容器内滚，不动整页）
      try { node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* 忽略 */ }
    }
  }
}

/** 每 250ms 兜一次：应对各种重渲染把节点换掉 */
export function startPolling(getGame) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const G = getGame();
    if (!G || !G.s) return;
    syncPhase(G);
    paint(G);
    // 高亮可能被重渲染擦掉，补回来
    const st = STEPS[current(G)];
    const psel = st ? resolveTarget(st.target, G) : null;
    if (st && psel && isActive(G)) {
      let node = null;
      try { node = document.querySelector(psel); } catch (e) { node = null; }
      if (node && !node.classList.contains('tut-hl')) {
        clearHL();
        node.classList.add('tut-hl');
      }
    }
  }, 250);
}

export function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
}
