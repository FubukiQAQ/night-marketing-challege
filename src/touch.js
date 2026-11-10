// touch.js —— 触屏手势：货架左右滑切供应商、QTE 整条时间轴可点
// 只在 pointer:coarse 或实际触摸时生效，桌面鼠标完全不受影响。

let enabled = false;
let shelfSwipeBound = false;

function isTouch() {
  if (typeof window === 'undefined') return false;
  if ('ontouchstart' in window) return true;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch (e) {
    return false;
  }
}

/** 货架左右滑 → 切换供应商页签 */
function bindShelfSwipe(getGame, onChange) {
  if (shelfSwipeBound) return;
  const stage = document.getElementById('stage');
  if (!stage) return;

  let x0 = 0, y0 = 0, t0 = 0, tracking = false;

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    const t = e.target;
    // 只在货架区域响应，避免和「点格子」打架
    if (!t.closest || !t.closest('.shelf')) { tracking = false; return; }
    const p = e.touches[0];
    x0 = p.clientX; y0 = p.clientY; t0 = Date.now();
    tracking = true;
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const p = e.changedTouches[0];
    if (!p) return;
    const dx = p.clientX - x0;
    const dy = p.clientY - y0;
    const dt = Date.now() - t0;
    // 横向位移够大、纵向够小、够快 → 认为是滑动而不是点击
    if (dt > 700) return;
    if (Math.abs(dx) < 56) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.6) return;

    const G = getGame();
    if (!G || !G.s || G.s.phase !== 'STOCK') return;
    const n = (G.s.suppliers || []).length;
    if (n <= 1) return;

    const cur = onChange.current();
    const next = dx < 0 ? (cur + 1) % n : (cur - 1 + n) % n;
    onChange.set(next);
  }, { passive: true });

  shelfSwipeBound = true;
}

/**
 * QTE：整条时间轴可点，不用非得点按钮
 * 手机上按钮在下面，手指盖住时看不到指针位置，点条更自然。
 */
function bindQteLane() {
  document.addEventListener('pointerdown', (e) => {
    const lane = e.target.closest && e.target.closest('.qte-lane');
    if (!lane) return;
    const btn = document.querySelector('[data-act="qteHit"]');
    if (btn) btn.click();
  }, { passive: true });
}

/** 阻止出摊时页面跟着手指滚（canvas 上的手势） */
function blockCanvasScroll() {
  document.addEventListener('touchmove', (e) => {
    const t = e.target;
    if (t && t.id === 'sellcanvas') e.preventDefault();
  }, { passive: false });
}

/** 初始化 */
export function initTouch(opts) {
  if (!isTouch()) return false;
  if (enabled) return true;
  enabled = true;

  document.documentElement.classList.add('touch');
  blockCanvasScroll();
  bindQteLane();
  if (opts && opts.getGame && opts.tabs) bindShelfSwipe(opts.getGame, opts.tabs);
  return true;
}

/** 阶段切换后重新绑（stage 会被替换） */
export function rebindTouch(opts) {
  if (!enabled) return;
  if (opts && opts.getGame && opts.tabs) {
    shelfSwipeBound = false;
    bindShelfSwipe(opts.getGame, opts.tabs);
  }
}

export function isTouchEnabled() { return enabled; }
