// Frame pacing for the shop window. The watercolour pass is expensive (several full-screen passes at
// Retina size), so drawing it at the screen's full rate all the time kept the GPU flat out and the
// laptop hot even when nothing on screen moved. The pacer:
//   - never draws faster than Settings > Smoothness (60 or 30 fps), even on a 120 Hz screen;
//   - while something moves (camera, input, flights, animations), draws at that cap;
//   - once things settle, drops to idleFps() (enough for the boiling edges, lanterns and a spinning record);
//   - stops completely while the window is hidden, minimised or fully covered (document.hidden).
//
//   const pacer = createPacer({ renderer, step: (now) => frame(...), busy: () => bool, idleFps: () => 12 });
//   pacer.start(); pacer.kick();   // kick: something changed, draw at full rate for a moment
import { settings } from './settings.js';

const GRACE_MS = 1200; // keep the full rate this long after the last sign of movement
const SLACK_MS = 2;    // vsync jitter: a 60 cap on a 120 Hz screen must give 60, not 40

export const maxFps = () => (Number(settings.get('maxFps')) === 30 ? 30 : 60);

export function createPacer({ renderer, step, busy = () => false, idleFps = () => 12 }) {
  let running = false;
  let last = -Infinity;
  let busyUntil = 0;

  function loop() {
    const now = performance.now();
    if (busy()) busyUntil = now + GRACE_MS;
    const cap = maxFps();
    const fps = now < busyUntil ? cap : Math.min(cap, idleFps());
    if (now - last < 1000 / fps - SLACK_MS) return;
    last = now;
    step(now);
  }

  const sync = () => renderer.setAnimationLoop(running && !document.hidden ? loop : null);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) busyUntil = performance.now() + GRACE_MS; sync(); });

  return {
    start() { running = true; sync(); },
    stop() { running = false; sync(); },
    kick(ms = GRACE_MS) { busyUntil = Math.max(busyUntil, performance.now() + ms); },
    get idle() { return performance.now() >= busyUntil; },   // for checks: drawing at the idle rate now
  };
}
