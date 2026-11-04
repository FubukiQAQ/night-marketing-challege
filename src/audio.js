// audio.js — BGM 播放器：可选曲目、上/下一首、跟随阶段、音量与静音（全部持久化）
const LS_KEY = 'bushaoxin.audio';
const FADE_MS = 800;

/** 曲目表。默认值在 src/data/tracks.json，加载失败时用这里的兜底。 */
const FALLBACK_TRACKS = [
  { file: 'sound/C418 - Aria Math.mp3', title: 'Aria Math', artist: 'C418', phase: 'menu' },
  { file: 'sound/C418 - Moog City 2.mp3', title: 'Moog City 2', artist: 'C418', phase: 'sell' },
  { file: 'sound/ConcernedApe - Spring (Wild Horseradish Jam).mp3', title: 'Spring', artist: 'ConcernedApe', phase: 'stock' },
  { file: 'sound/ConcernedApe - Summer (Nature\'s Crescendo).mp3', title: 'Summer', artist: 'ConcernedApe', phase: 'prep' },
];

const state = {
  tracks: FALLBACK_TRACKS.slice(),
  index: 0,
  playing: false,
  unlocked: false,
  volume: 0.5,
  muted: false,
  followPhase: true,   // true = 按阶段自动切歌；false = 锁定玩家选的这首
  els: [],
  active: 0,
  failed: {},          // file -> true，加载失败的不再重试
  listeners: [],
};

/* ---------------------------------------------------------------- 偏好 */
function loadPrefs() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (typeof o.volume === 'number') state.volume = Math.max(0, Math.min(1, o.volume));
    if (typeof o.muted === 'boolean') state.muted = o.muted;
    if (typeof o.followPhase === 'boolean') state.followPhase = o.followPhase;
    if (typeof o.index === 'number') state.index = o.index;
  } catch (e) { /* 忽略 */ }
}

function savePrefs() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      volume: state.volume, muted: state.muted,
      followPhase: state.followPhase, index: state.index,
    }));
  } catch (e) { /* 忽略 */ }
}

/* ---------------------------------------------------------------- 内部 */
function ensureEls() {
  if (state.els.length) return;
  for (let i = 0; i < 2; i++) {
    const a = new Audio();
    a.loop = true;
    a.preload = 'none';
    a.volume = 0;
    state.els.push(a);
  }
}

function targetVolume() {
  return state.muted ? 0 : state.volume;
}

function fade(el, to, ms, done) {
  const from = el.volume;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / Math.max(1, ms));
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else if (done) done();
  };
  requestAnimationFrame(step);
}

function emit() {
  state.listeners.forEach((fn) => {
    try { fn(snapshot()); } catch (e) { /* 忽略 */ }
  });
}

function snapshot() {
  return {
    tracks: state.tracks,
    index: state.index,
    track: state.tracks[state.index] || null,
    playing: state.playing,
    muted: state.muted,
    volume: state.volume,
    followPhase: state.followPhase,
    unlocked: state.unlocked,
  };
}

/** 切到第 i 首并播放（交叉淡入） */
function load(i, autoplay) {
  ensureEls();
  const n = state.tracks.length;
  if (!n) return;
  state.index = ((i % n) + n) % n;
  savePrefs();
  const track = state.tracks[state.index];
  if (!track) return;

  if (state.failed[track.file]) {
    state.playing = false;
    emit();
    return;
  }

  const nextIdx = 1 - state.active;
  const next = state.els[nextIdx];
  const cur = state.els[state.active];

  next.src = track.file;
  next.dataset.file = track.file;
  next.volume = 0;
  next.onerror = () => {
    state.failed[track.file] = true;
    state.playing = false;
    emit();
  };

  if (autoplay === false || !state.unlocked) {
    state.playing = false;
    emit();
    return;
  }

  const p = next.play();
  if (p && p.catch) {
    p.catch(() => { state.playing = false; emit(); });
  }
  fade(next, targetVolume(), FADE_MS);
  if (cur !== next && !cur.paused) fade(cur, 0, FADE_MS, () => cur.pause());
  state.active = nextIdx;
  state.playing = true;
  emit();
}

/* ---------------------------------------------------------------- 公开 API */
export function setTracks(list) {
  if (Array.isArray(list) && list.length) {
    state.tracks = list;
    if (state.index >= list.length) state.index = 0;
    emit();
  }
}

export function on(fn) {
  state.listeners.push(fn);
  fn(snapshot());
}

export function unlock() {
  if (state.unlocked) return;
  ensureEls();
  state.unlocked = true;
  if (state.playing || state.index != null) load(state.index, true);
}

/** 阶段切歌：followPhase 为真时按 phase 找对应曲目，否则保持玩家选择 */
export function playPhase(phase) {
  if (!state.followPhase) {
    if (!state.playing && state.unlocked) load(state.index, true);
    return;
  }
  const idx = state.tracks.findIndex((t) => t.phase === phase);
  if (idx < 0) return;
  if (idx === state.index && state.playing) return;
  load(idx, true);
}

export function next() {
  state.followPhase = false;
  load(state.index + 1, true);
  savePrefs();
}

export function prev() {
  state.followPhase = false;
  load(state.index - 1, true);
  savePrefs();
}

export function select(i) {
  state.followPhase = false;
  load(i, true);
  savePrefs();
}

export function toggle() {
  ensureEls();
  if (!state.unlocked) { unlock(); return; }
  const cur = state.els[state.active];
  if (state.playing) {
    fade(cur, 0, 260, () => cur.pause());
    state.playing = false;
    emit();
  } else {
    if (!cur.src) { load(state.index, true); return; }
    const p = cur.play();
    if (p && p.catch) p.catch(() => {});
    fade(cur, targetVolume(), 260);
    state.playing = true;
    emit();
  }
}

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  state.muted = state.volume === 0;
  fade(state.els[state.active], targetVolume(), 180);
  savePrefs();
  emit();
}

export function toggleMute() {
  state.muted = !state.muted;
  fade(state.els[state.active], targetVolume(), 180);
  savePrefs();
  emit();
  return state.muted;
}

export function setFollowPhase(on) {
  state.followPhase = !!on;
  savePrefs();
  emit();
}

export function getState() { return snapshot(); }
export function isMuted() { return state.muted; }
export function getVolume() { return state.volume; }

/** 首次交互解锁（浏览器自动播放策略） */
export function installUnlock() {
  loadPrefs();
  const h = () => {
    unlock();
    window.removeEventListener('pointerdown', h);
    window.removeEventListener('keydown', h);
  };
  window.addEventListener('pointerdown', h);
  window.addEventListener('keydown', h);
}

/** 从 tracks.json 载入曲目表（失败就用兜底） */
export async function loadTracks() {
  try {
    const r = await fetch('src/data/tracks.json');
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length) state.tracks = list;
    }
  } catch (e) { /* 用兜底 */ }
  emit();
}
