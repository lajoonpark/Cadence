// How the search bar arrives and leaves: as paint, not as a wipe.
//   Open:  the ink is slapped on left to right, bristle by bristle (the slow ones catch up, dry gaps close),
//          throwing droplets off the brush; the bar lands with a bounce; the cream goes over it; then the
//          magnifying glass and the text.
//   Close: the paint is dragged on off the right-hand end, the way the brush was going, and flicked away.
// Results use the same bristles as a stop-motion mask (slipMasks), so 20 slips cost no canvas each.
//
// Everything hangs off one clock, so a hotkey pressed halfway just runs that clock backwards.
import { rng } from './rand.js';
import { TONES } from './brushpaint.js';

export const IN_MS = 620, OUT_MS = 460;
export const MARGIN = 64;    // room around the bar for droplets (the canvas is this much larger on every side)
export const SLIP_FRAMES = 10;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const slap = (x) => 1 - (1 - x) ** 2.6;           // the brush lands fast and slows along the stroke
const flick = (x) => x * x;                       // the paint is dragged off faster and faster
const backOut = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const spring = (x) => 1 - Math.exp(-5.5 * x) * Math.cos(11 * x);

function makeBristles(seed, count) {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    i,
    lag: r() * 0.3,                               // finishes this much of the stroke before the slowest bristle
    gapAt: 0.12 + r() * 0.7,
    gapLen: r() < 0.45 ? 0.05 + r() * 0.16 : 0,   // a dry skip, which closes late in the stroke
  }));
}

// Adds the painted part of each bristle to the path. off: the same stroke leaving, its tail chasing the end.
function traceBristles(g, bristles, w, h, p, off = false) {
  const bh = h / bristles.length, rad = bh * 0.5;
  const seg = (a, z, y) => { if (z - a > 0.5) g.roundRect(a, y, z - a, bh + 1.2, Math.min(rad, (z - a) / 2)); };
  for (const b of bristles) {
    const y = b.i * bh - 0.6;
    const travel = clamp01(p / (1 - b.lag));
    const gap = b.gapLen * w * (off ? smooth(span(p, 0, 0.5)) : 1 - smooth(span(p, 0.5, 1)));
    const gx = b.gapAt * w;
    if (off) {
      const a = flick(travel) * (w + 2);
      if (gap > 0.5 && a < gx) { seg(a, gx, y); seg(gx + gap, w, y); } else seg(a, w, y);
    } else {
      const z = slap(travel) * (w + 2);
      if (gap > 0.5 && z > gx + gap) { seg(0, gx, y); seg(gx + gap, z, y); } else seg(0, z, y);
    }
  }
}

// One sprite per brush direction: frame 0 is bare, the last is covered. Used as a mask stepped by mask-position.
export function slipMasks() {
  const W = 240, H = 24;
  const make = (mirror) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H * SLIP_FRAMES;
    const g = c.getContext('2d'), bristles = makeBristles(mirror ? 8 : 3, 9);
    for (let k = 0; k < SLIP_FRAMES; k++) {
      g.save();
      g.beginPath();
      g.rect(0, k * H, W, H);
      g.clip();
      g.translate(mirror ? W : 0, k * H);
      if (mirror) g.scale(-1, 1);
      g.beginPath();
      if (k === SLIP_FRAMES - 1) g.rect(0, 0, W, H);
      else traceBristles(g, bristles, W, H, k / (SLIP_FRAMES - 1));
      g.fill();
      g.restore();
    }
    return `url(${c.toDataURL()})`;
  };
  return { fromLeft: make(false), fromRight: make(true) };
}

//   const paint = createBarPaint({ canvas, bar, glass, input, onClosed });
//   paint.setLayers({ w, h, ink, paper, paperRect });   // the finished paint, as canvases
//   paint.play(true | false);                           // to open / to closed, from wherever it is now
//   paint.lead();                                       // ms until the bar has landed, for what follows it
export function createBarPaint({ canvas, bar, glass, input, onClosed }) {
  const g = canvas.getContext('2d');
  const inkBristles = makeBristles(11, 18), paperBristles = makeBristles(29, 12);
  const r = rng(77);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let layers = null, frameId = 0, last = 0;
  let phase = 'in', t = 0, dir = 1, want = false;
  let inkBurst = false, paperBurst = false;
  let drops = [];

  const dur = () => (phase === 'in' ? IN_MS : OUT_MS);
  const atEnd = () => (dir > 0 ? t >= dur() : t <= 0);

  function spawn(x, y, n, colours, { fast = 0, spread = 170 } = {}) {
    for (let i = 0; i < n && drops.length < 90; i++) {
      drops.push({
        x, y,
        vx: 120 + r() * 340 + fast * r(),
        vy: (r() - 0.62) * spread * 2,
        size: 0.8 + r() ** 2 * 3.2,
        life: 240 + r() * 300,
        colour: colours[Math.floor(r() * colours.length)],
      });
    }
  }

  function layer(img, x, y, w, h, bristles, p, off) {
    if (off ? p >= 1 : p <= 0) return;
    if (off ? p <= 0 : p >= 1) { g.drawImage(img, x, y, w, h); return; }
    g.save();
    g.translate(x, y);
    g.beginPath();
    traceBristles(g, bristles, w, h, p, off);
    g.clip();
    g.drawImage(img, 0, 0, w, h);
    g.restore();
  }

  function pose() {
    const u = t / dur();
    if (phase === 'in') {
      const s = spring(u), thwack = Math.sin(Math.PI * span(u, 0.5, 0.8)) * 0.055;
      bar.style.transform = `translateY(${-12 * (1 - s)}px) rotate(${-3 + 2.4 * s}deg) scale(${0.96 + 0.04 * s}, ${0.82 + 0.18 * s + thwack})`;
    } else {
      const e = flick(u);
      bar.style.transform = `translate(${46 * e}px, ${-8 * e}px) rotate(${-0.6 - 3.4 * e}deg) skewX(${-10 * e}deg)`;
    }
    const k = phase === 'in' ? span(u, 0.5, 1) : 1 - span(u, 0, 0.22);
    glass.style.opacity = input.style.opacity = String(k);
    glass.style.transform = `scale(${0.3 + 0.7 * backOut(k)}) rotate(${-25 * (1 - k)}deg)`;
    input.style.transform = `translateX(${-10 * (1 - k)}px)`;
  }

  function draw(dt) {
    const { w, h, ink, paper, paperRect: pr } = layers;
    const u = t / dur(), going = phase === 'out';
    const inkP = going ? span(u, 0.22, 0.92) : span(u, 0, 0.6);
    const paperP = going ? span(u, 0.08, 0.55) : span(u, 0.2, 0.8);

    if (dir > 0 && dt > 0) {
      const at = (p, width) => (going ? flick(p) : slap(p)) * width;
      if (inkP > 0 && inkP < 1 && r() < dt * 0.14) spawn(at(inkP, w), r() * h, 1 + Math.floor(r() * 3), TONES.ink);
      if (paperP > 0 && paperP < 1 && r() < dt * 0.06) spawn(pr.x + at(paperP, pr.w), pr.y + r() * pr.h, 1, TONES.paper);
      if (inkP >= 1 && !inkBurst) { inkBurst = true; spawn(w - 6, h * 0.5, going ? 26 : 14, TONES.ink, { fast: going ? 520 : 220, spread: going ? 260 : 210 }); }
      if (paperP >= 1 && !paperBurst) { paperBurst = true; if (going) spawn(pr.x + pr.w, pr.y + pr.h * 0.5, 10, TONES.paper, { fast: 340 }); }
    }

    g.clearRect(-MARGIN, -MARGIN, canvas.width, canvas.height);
    layer(ink, 0, 0, w, h, inkBristles, inkP, going);
    layer(paper, pr.x, pr.y, pr.w, pr.h, paperBristles, paperP, going);

    const s = dt / 1000;
    drops = drops.filter((d) => (d.life -= dt) > 0);
    for (const d of drops) {
      d.x += d.vx * s; d.y += d.vy * s;
      d.vy += 900 * s; d.vx *= 0.985;
      g.globalAlpha = clamp01(d.life / 120);
      g.fillStyle = d.colour;
      g.beginPath();
      g.ellipse(d.x, d.y, d.size * (1 + Math.hypot(d.vx, d.vy) / 500), d.size, Math.atan2(d.vy, d.vx), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function rest() {
    bar.style.transform = glass.style.transform = input.style.transform = '';
    glass.style.opacity = input.style.opacity = '';
    g.clearRect(-MARGIN, -MARGIN, canvas.width, canvas.height);
    if (want) {
      const { w, h, ink, paper, paperRect: pr } = layers;
      g.drawImage(ink, 0, 0, w, h);
      g.drawImage(paper, pr.x, pr.y, pr.w, pr.h);
    } else onClosed();
  }

  function frame(now) {
    frameId = 0;
    if (!layers) { frameId = requestAnimationFrame(frame); last = now; return; }   // the paint is still drying
    const dt = Math.max(0, now - last);
    last = now;
    t = Math.min(dur(), Math.max(0, t + dir * dt));
    pose();
    draw(dt);
    if (atEnd() && !drops.length) { rest(); return; }
    frameId = requestAnimationFrame(frame);
  }

  function play(open) {
    want = open;
    if (calm) { if (layers || !open) { drops = []; if (layers) rest(); else onClosed(); } return; }
    if (!frameId || atEnd()) {
      phase = open ? 'in' : 'out';
      t = 0; dir = 1;
      inkBurst = paperBurst = false;
    } else dir = (phase === 'in') === open ? 1 : -1;     // changed its mind halfway: back the way it came
    pose();
    if (!frameId) { last = performance.now(); frameId = requestAnimationFrame(frame); }
  }

  function setLayers(next) {
    layers = next;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.ceil((next.w + MARGIN * 2) * dpr);
    canvas.height = Math.ceil((next.h + MARGIN * 2) * dpr);
    g.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
    if (!frameId && want) rest();                        // resized while open
  }

  const lead = () => (phase === 'in' && dir > 0 && frameId ? Math.max(0, IN_MS * 0.42 - t) : 0);

  return { setLayers, play, lead };
}
