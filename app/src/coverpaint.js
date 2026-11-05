// Covers painted to match the shop: every album / playlist cover is repainted once, when it loads,
// as if copied in watercolour. Fine detail softens, colour runs past its edges, the wash dries unevenly
// with darker rims, paper grain shows through and the margin stays unpainted. How strongly is
// Settings > Cover art (settings key 'covers', COVER_LEVELS): Off, Light, Medium, Heavy (the default:
// you still know the cover at a glance, faces, titles, big shapes, but it reads as painted).
//
//   paintCover(ctx, size, seed, level)  repaints the square canvas in place (call after drawing the cover)
//   paintedCoverURL(url, size)    -> Promise<data: URL> of the painted cover (for <img> in the search slips)
// The racks' covers are painted off the main thread in coverpaint.worker.js (see getCover in racks/common.js).
import { rng } from './rand.js';
import { settings } from './settings.js';

// strength multipliers per level (2 = the old "medium" look, tuned first)
export const COVER_LEVELS = [0, 0.55, 1, 1.75];
export const coverLevel = () => { const v = settings.get('covers'); return v >= 0 && v < COVER_LEVELS.length ? v : 3; };

const PAPER = '#f4ead6';
let grain = null;

// also runs in coverpaint.worker.js, where there is no document: OffscreenCanvas there
function canvas(w, h) {
  if (typeof document === 'undefined') { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d')]; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// paper tooth, light grey speckle around mid-white (multiplied over the paint)
function grainCanvas() {
  if (grain) return grain;
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = rng(77);
  g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const v = Math.round(185 + r() * 70);
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},.55)`;
    const s = 0.8 + r() * 2.4;
    g.fillRect(r() * S, r() * S, s, s);
  }
  g.filter = 'blur(0.5px)';
  g.drawImage(c, 0, 0);
  grain = c;
  return c;
}

export function paintCover(g, size, seed = 1, level = coverLevel()) {
  const S = COVER_LEVELS[level] ?? 1;
  if (!S) return; // Off: the cover as it is
  const r = rng(seed);
  const cap = (v) => Math.min(0.92, v);
  const [src, sg] = canvas(size, size);
  sg.drawImage(g.canvas, 0, 0);
  const k = size / 256; // effects are tuned at 256 px

  g.save();
  // 1. soften: fine detail melts into the wash (half blurred, so edges still read)
  const more = Math.max(0, S - 1); // how far past Medium
  g.filter = `blur(${1.1 * (1 + 0.35 * more) * k}px)`;
  g.globalAlpha = cap(0.55 * Math.min(1, S) + 0.1 * more);
  g.drawImage(src, 0, 0);

  // 2. bleed: two blurred copies nudged in different directions, so colour runs past its edges
  for (let i = 0; i < (S > 1 ? 3 : 2); i++) {
    const a = r() * Math.PI * 2;
    const d = (3 + r() * 3) * (1 + 0.6 * more) * Math.min(1, S) * k;
    g.filter = `blur(${4 * Math.min(1, S) * (1 + 0.25 * more) * k}px)`;
    g.globalAlpha = cap(0.2 * Math.min(1, S) * (1 - 0.15 * more));
    g.drawImage(src, Math.cos(a) * d, Math.sin(a) * d);
  }
  g.filter = 'none';

  // 3. uneven drying: a few soft pale blooms with a slightly darker rim where the pigment pooled
  for (let i = 0; i < 4 + Math.round(2 * more); i++) {
    const x = r() * size, y = r() * size, rad = (30 + r() * 50) * k;
    const lift = g.createRadialGradient(x, y, 0, x, y, rad);
    lift.addColorStop(0, `rgba(255,250,240,${(0.09 * (S + 0.5 * more)).toFixed(3)})`);
    lift.addColorStop(0.8, `rgba(255,250,240,${(0.04 * (S + 0.5 * more)).toFixed(3)})`);
    lift.addColorStop(1, 'rgba(255,250,240,0)');
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'screen';
    g.fillStyle = lift;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = `rgba(120,90,70,${cap(0.09 * Math.min(1, S) * (1 + 0.3 * more)).toFixed(3)})`;
    g.lineWidth = (2 + r() * 2) * k;
    g.filter = `blur(${1.2 * k}px)`;
    g.beginPath();
    // a lumpy, open rim (cauliflower), never a clean circle: random harmonics, and only part of the way round
    const p1 = r() * 6, p2 = r() * 6, from = r() * Math.PI * 2, span = Math.PI * (0.9 + r() * 0.8);
    for (let t = 0; t <= 24; t++) {
      const ang = from + (t / 24) * span;
      const rr = rad * (0.85 + Math.sin(ang * 3 + p1) * 0.08 + Math.sin(ang * 7 + p2) * 0.04 + r() * 0.04);
      t ? g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr) : g.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    g.stroke();
    g.filter = 'none';
  }

  // 4. the colours are a transparent wash over paper: lift a touch toward the paper
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = cap(0.08 * S);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, size, size);

  // 5. paper grain, pigment settling in the tooth
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = cap(0.6 * Math.min(1, S) + 0.15 * more);
  const pat = g.createPattern(grainCanvas(), 'repeat');
  g.translate(r() * 256, r() * 256);
  g.fillStyle = pat;
  g.fillRect(-256, -256, size + 512, size + 512);
  g.setTransform(1, 0, 0, 1, 0, 0);

  // 6. a thin unpainted margin with a ragged, slightly darker wet edge
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const m = 5 * k;
  const edge = new Path2D();
  const n = 40;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([(i / n) * size, m + r() * 2.5 * k]);
  for (let i = 0; i < n; i++) pts.push([size - m - r() * 2.5 * k, (i / n) * size]);
  for (let i = n; i > 0; i--) pts.push([(i / n) * size, size - m - r() * 2.5 * k]);
  for (let i = n; i > 0; i--) pts.push([m + r() * 2.5 * k, (i / n) * size]);
  pts.forEach(([x, y], i) => (i ? edge.lineTo(x, y) : edge.moveTo(x, y)));
  edge.closePath();
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = 'rgba(110,80,60,.25)';
  g.lineWidth = 2 * k;
  g.filter = `blur(${0.8 * k}px)`;
  g.stroke(edge);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  const outside = new Path2D();
  outside.rect(0, 0, size, size);
  outside.addPath(edge);
  g.fillStyle = PAPER;
  g.fill(outside, 'evenodd');
  g.restore();
}

// same seed for the same picture, so a cover always dries the same way
export function coverSeed(url = '') {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000 + 1;
}

const urls = new Map();
export function paintedCoverURL(url, size = 96) {
  const level = coverLevel();
  const key = `${size}|${level}|${url}`;
  if (!urls.has(key)) {
    urls.set(key, new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const [c, g] = canvas(size, size);
        const s = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        paintCover(g, size, coverSeed(url), level);
        try { res(c.toDataURL('image/jpeg', 0.9)); } catch { res(url); } // tainted: show it unpainted
      };
      img.onerror = () => res(url);
      img.src = url;
    }));
    if (urls.size > 200) urls.delete(urls.keys().next().value);
  }
  return urls.get(key);
}
