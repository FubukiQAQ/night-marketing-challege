// audio.js — BGM 管理：分场景播放 + 交叉淡入淡出 + 音量/静音（持久化）
const TRACKS = {
  menu: 'sound/C418 - Aria Math.mp3',
  stock: 'sound/ConcernedApe - Spring (Wild Horseradish Jam).mp3',
  prep: 'sound/ConcernedApe - Summer (Nature\'s Crescendo).mp3',
  sell: 'sound/C418 - Moog City 2.mp3',
};

const LS_KEY = 'bushaoxin.audio';
const FADE_MS = 900;

const state = {
  volume: 0.55,
  muted: false,
  scene: null,
  unlocked: false,
  els: [],       // 两个 audio 元素做交叉淡入
  active: 0,
  wanted: null,  // 未解锁前记住想放哪首
  timer: null,
};

function loadPrefs() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (typeof o.volume === 'number') state.volume = Math.max(0, Math.min(1, o.volume));
    if (typeof o.muted === 'boolean') state.muted = o.muted;
  } catch (e) { /* 忽略 */ }
}

function savePrefs() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ volume: state.volume, muted: state.muted }));
  } catch (e) { /* 忽略 */ }
}

function ensureEls() {
  if (state.els.length) return;
  for (let i = 0; i < 2; i++) {
    const a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    state.els.push(a);
  }
}

function targetVolume() {
  return state.muted ? 0 : state.volume;
}

function fade(el, to, ms, done) {
  if (state.timer) { /* 每个元素独立淡入，用 rAF 更稳 */ }
  const from = el.volume;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else if (done) done();
  };
  requestAnimationFrame(step);
}

export function unlock() {
  if (state.unlocked) return;
  ensureEls();
  state.unlocked = true;
  if (state.wanted) play(state.wanted, true);
}

export function play(sceneName) {
  ensureEls();
  state.scene = sceneName;
  state.wanted = sceneName;
  if (!state.unlocked) return;              // 等用户第一次交互
  const src = TRACKS[sceneName];
  if (!src) return;

  const cur = state.els[state.active];
  if (cur.src.endsWith(encodeURI(src).split('/').pop()) || cur.dataset.scene === sceneName) {
    if (cur.paused) cur.play().catch(() => {});
    return;
  }
  const nextIdx = 1 - state.active;
  const next = state.els[nextIdx];
  next.src = src;
  next.dataset.scene = sceneName;
  next.volume = 0;
  const p = next.play();
  if (p && p.catch) p.catch(() => {});
  fade(next, targetVolume(), FADE_MS);
  fade(cur, 0, FADE_MS, () => { cur.pause(); });
  state.active = nextIdx;
}

export function stop() {
  state.els.forEach((a) => { fade(a, 0, 400, () => a.pause()); });
  state.scene = null;
  state.wanted = null;
}

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  if (!state.muted) fade(state.els[state.active], state.volume, 200);
  savePrefs();
}

export function toggleMute() {
  state.muted = !state.muted;
  fade(state.els[state.active], targetVolume(), 200);
  savePrefs();
  return state.muted;
}

export function getVolume() { return state.volume; }
export function isMuted() { return state.muted; }

/** 首次交互解锁（浏览器自动播放策略） */
export function installUnlock() {
  loadPrefs();
  const h = () => {
    unlock();
    window.removeEventListener('pointerdown', h);
    window.removeEventListener('keydown', h);
  };
  window.addEventListener('pointerdown', h, { once: false });
  window.addEventListener('keydown', h, { once: false });
}

export const TRACK_NAMES = {
  menu: 'C418 — Aria Math',
  stock: 'ConcernedApe — Spring',
  prep: 'ConcernedApe — Summer',
  sell: 'C418 — Moog City 2',
};
