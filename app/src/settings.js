// User settings, kept in localStorage so they survive restarts. The shop window and the
// Ctrl+Option+Space mini window share one origin, so a change in one reaches the other through the
// 'storage' event. Storage can be unavailable (private mode, blocked): everything still works with
// the defaults, it just does not remember.
//
//   import { settings } from './settings.js';
//   settings.get('paint')            -> 3
//   settings.set('paint', 2)
//   const off = settings.on('paint', (v) => ...)   // also fires for changes made in the other window

const KEY = 'cadence.settings';

export const DEFAULTS = {
  paint: 3, // watercolour strength, 0..3 (see LEVELS in watercolour.js)
  fps: false, // frame-rate readout in the corner (for perf reports)
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const listeners = new Map(); // key -> Set<fn>
let values = { ...DEFAULTS, ...load() };

function emit(key) {
  for (const fn of listeners.get(key) ?? []) fn(values[key]);
}

export const settings = {
  get(key) { return values[key]; },
  set(key, value) {
    if (values[key] === value) return;
    values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* not remembered, still applied */ }
    emit(key);
  },
  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  },
};

// the other window changed something
globalThis.addEventListener?.('storage', (e) => {
  if (e.key !== KEY) return;
  const before = values;
  values = { ...DEFAULTS, ...load() };
  for (const k of Object.keys(values)) if (before[k] !== values[k]) emit(k);
});
