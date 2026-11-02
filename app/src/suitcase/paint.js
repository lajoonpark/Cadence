// Everything the suitcase wears is painted here with canvas 2D, so the app ships no image files:
// leather, quilted lining, speaker cloth, the grooves of the vinyl, glyphs for the buttons, soft
// washes for the shadow and the shine. Colours are washes (warm, a little muted), never black.
import * as THREE from 'three';
import { rng } from '../rand.js';

export const COL = {
  leather: '#c98c57',
  leatherDark: '#8f5733',
  lining: '#f1e3bf',
  brass: '#d9a441',
  brassLight: '#ecc468',
  deck: '#e2d5b4',        // cream deck plate: the dark record and the indigo caps read against it
  platter: '#7a6c68',
  vinyl: '#2d262c',
  cloth: '#d6c08a',
  steel: '#cfc3ab',       // the arm: pale warm metal, a wash rather than chrome
  ink: '#2d3158',         // indigo, the same wash as the shop's brush buttons
  hot: '#b4503a',         // terracotta on hover / liked
  paper: '#fbf5e8',
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// Draw something that must tile by repeating it at the neighbouring offsets.
function wrapped(S, fn) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); }

function blobs(g, S, r, n, rad0, rad1, colours, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = rad0 + r() * (rad1 - rad0);
    const col = colours[Math.floor(r() * colours.length)], a = alpha * (0.6 + r() * 0.8);
    wrapped(S, (dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, `rgba(${col},${a})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    });
  }
}

// Tan leather: a wash with pooled darker and lighter patches and a fine grain.
export function leatherTexture() {
  const S = 256, [c, g] = canvas(S, S), r = rng(7);
  g.fillStyle = COL.leather;
  g.fillRect(0, 0, S, S);
  blobs(g, S, r, 22, 30, 90, ['160,98,54', '236,178,120', '120,70,38'], 0.2);
  for (let i = 0; i < 3600; i++) {
    const x = r() * S, y = r() * S, s = 0.8 + r() * 1.8, dark = r() < 0.55, a = 0.05 + r() * 0.11;
    g.fillStyle = dark ? `rgba(86,46,24,${a})` : `rgba(255,222,176,${a})`;
    wrapped(S, (dx, dy) => g.fillRect(x + dx, y + dy, s, s));
  }
  return texture(c, { repeat: [1.6, 1.6] });
}

// Cream lining of the lid, quilted in diamonds.
export function liningTexture() {
  const S = 256, [c, g] = canvas(S, S), r = rng(11);
  g.fillStyle = COL.lining;
  g.fillRect(0, 0, S, S);
  blobs(g, S, r, 14, 40, 100, ['214,186,130', '255,248,225'], 0.2);
  const step = S / 4;
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(150,112,64,.28)';
  for (let i = -4; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * step, S); g.lineTo(i * step + S, 0); g.stroke();
  }
  g.fillStyle = 'rgba(150,112,64,.4)';
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    g.beginPath(); g.arc(i * step, j * step, 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(150,112,64,${0.03 + r() * 0.05})`;
    g.fillRect(r() * S, r() * S, 1.4, 1.4);
  }
  return texture(c, { repeat: [1, 1] });
}

// Speaker cloth: a woven wheat colour.
export function clothTexture() {
  const S = 128, [c, g] = canvas(S, S), r = rng(5);
  g.fillStyle = COL.cloth;
  g.fillRect(0, 0, S, S);
  blobs(g, S, r, 10, 20, 60, ['150,112,60', '250,236,190'], 0.16);
  g.lineWidth = 1.4;
  for (let i = -S; i < S * 2; i += 6) {
    g.strokeStyle = 'rgba(110,80,36,.3)';
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.strokeStyle = 'rgba(255,248,214,.38)';
    g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke();
  }
  return texture(c, { repeat: [3, 2] });
}

// The face of the vinyl: concentric grooves in lighter greys, a few wide smooth bands between
// tracks and faint scuffs, so the record visibly turns even though it is round.
export function vinylTexture(labelFraction) {
  const S = 1024, [c, g] = canvas(S, S), m = S / 2, r = rng(21);
  g.fillStyle = COL.vinyl;
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  let rad = m * labelFraction + 8;
  const limit = m * 0.965;
  while (rad < limit) {
    const gap = r() < 0.018;
    g.strokeStyle = `rgba(255,236,226,${gap ? 0.03 : 0.05 + r() * 0.12})`;
    g.lineWidth = gap ? 6 : 0.9 + r() * 1.4;
    g.beginPath(); g.arc(m, m, rad, 0, Math.PI * 2); g.stroke();
    rad += 2.4 + r() * 3.4;
  }
  // lip at the rim and the run-out ring by the label
  g.strokeStyle = 'rgba(255,236,226,.22)'; g.lineWidth = 4;
  g.beginPath(); g.arc(m, m, m * 0.985, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(m, m, m * labelFraction + 3, 0, Math.PI * 2); g.stroke();
  // scuffs: a few faint wedges that are NOT symmetric, so the turning shows
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, w = 0.04 + r() * 0.09;
    g.fillStyle = `rgba(255,236,226,${0.05 + r() * 0.06})`;
    g.beginPath(); g.moveTo(m, m); g.arc(m, m, limit, a, a + w); g.closePath(); g.fill();
  }
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

// Plain label for a track without a cover: terracotta with a cream ring, like a pressing label.
export function fallbackLabel() {
  const S = 256, [c, g] = canvas(S, S);
  g.fillStyle = COL.hot;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(251,245,232,.85)'; g.lineWidth = 6;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(251,245,232,.9)';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2); g.fill();
  return texture(c);
}

// Two soft bright wedges that stay put while the record turns under them (the shine of a lamp).
export function sheenTexture(labelFraction) {
  const S = 512, [c, g] = canvas(S, S), m = S / 2;
  g.save();
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.arc(m, m, m * labelFraction, 0, Math.PI * 2, true);
  g.clip('evenodd');
  for (let deg = 0; deg < 360; deg++) {
    const a = (deg * Math.PI) / 180, lobe = Math.pow(Math.abs(Math.cos(a - Math.PI * 0.28)), 20);
    if (lobe < 0.01) continue;
    g.fillStyle = `rgba(255,250,235,${0.34 * lobe})`;
    g.beginPath(); g.moveTo(m, m); g.lineTo(m + m * Math.cos(a), m + m * Math.sin(a));
    g.lineTo(m + m * Math.cos(a + Math.PI / 180), m + m * Math.sin(a + Math.PI / 180)); g.closePath(); g.fill();
  }
  g.restore();
  return texture(c);
}

// A loose wash of brown under the case: the shadow is a painted patch, not a rendered one.
export function shadowTexture() {
  const S = 256, [c, g] = canvas(S, S), r = rng(31);
  for (let i = 0; i < 16; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.46, y = S / 2 + (r() - 0.5) * S * 0.4, rad = S * (0.18 + r() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(96,66,50,.2)');
    gr.addColorStop(0.65, 'rgba(96,66,50,.12)');
    gr.addColorStop(1, 'rgba(96,66,50,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  return texture(c);
}

// ---- glyphs for the buttons: chunky shapes with rounded joins, cream (or terracotta when liked) ----
const GLYPHS = {
  play: (g, S) => { g.beginPath(); g.moveTo(S * 0.36, S * 0.25); g.lineTo(S * 0.76, S * 0.5); g.lineTo(S * 0.36, S * 0.75); g.closePath(); },
  pause: (g, S) => { g.beginPath(); g.roundRect(S * 0.28, S * 0.25, S * 0.17, S * 0.5, S * 0.04); g.roundRect(S * 0.55, S * 0.25, S * 0.17, S * 0.5, S * 0.04); },
  previous: (g, S) => {
    g.beginPath(); g.roundRect(S * 0.22, S * 0.26, S * 0.1, S * 0.48, S * 0.03);
    g.moveTo(S * 0.78, S * 0.27); g.lineTo(S * 0.4, S * 0.5); g.lineTo(S * 0.78, S * 0.73); g.closePath();
  },
  next: (g, S) => {
    g.beginPath(); g.roundRect(S * 0.68, S * 0.26, S * 0.1, S * 0.48, S * 0.03);
    g.moveTo(S * 0.22, S * 0.27); g.lineTo(S * 0.6, S * 0.5); g.lineTo(S * 0.22, S * 0.73); g.closePath();
  },
  heart: (g, S) => {
    g.beginPath(); g.moveTo(S * 0.5, S * 0.78);
    g.bezierCurveTo(S * 0.14, S * 0.52, S * 0.2, S * 0.2, S * 0.38, S * 0.24);
    g.bezierCurveTo(S * 0.46, S * 0.26, S * 0.5, S * 0.32, S * 0.5, S * 0.36);
    g.bezierCurveTo(S * 0.5, S * 0.32, S * 0.54, S * 0.26, S * 0.62, S * 0.24);
    g.bezierCurveTo(S * 0.8, S * 0.2, S * 0.86, S * 0.52, S * 0.5, S * 0.78);
    g.closePath();
  },
};

export function glyphTexture(kind) {
  const S = 128, [c, g] = canvas(S, S);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const shape = GLYPHS[kind === 'heartFill' ? 'heart' : kind];
  shape(g, S);
  if (kind === 'heart') {
    g.strokeStyle = COL.paper; g.lineWidth = S * 0.07; g.stroke();   // an outline heart
  } else if (kind === 'heartFill') {
    g.fillStyle = COL.hot; g.fill();
    g.strokeStyle = COL.paper; g.lineWidth = S * 0.06; g.stroke();   // terracotta, edged in cream so it reads on indigo
  } else {
    g.fillStyle = COL.paper; g.fill();
    g.strokeStyle = COL.paper; g.lineWidth = S * 0.05; g.stroke();
  }
  return texture(c);
}

// Blending that keeps the scene buffer's alpha alone: alpha 0 there means "crisp, leave unpainted",
// so a soft wash or shine must mix its colour in without touching it.
export function washBlend(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

// A loose watercolour backdrop for the small window's card: paper with a few pooled washes laid in
// layers, each a soft blob whose edge dried a little darker.
export function washBackdrop(w, h) {
  const [c, g] = canvas(w, h), r = rng(77);
  g.fillStyle = '#f6ebd0';
  g.fillRect(0, 0, w, h);
  const washes = [
    ['178,196,168', 0.12, 0.5, 0.62], ['236,184,156', 0.88, 0.2, 0.55], ['170,188,214', 0.1, 0.1, 0.42],
    ['240,208,140', 0.85, 0.85, 0.55], ['208,172,192', 0.4, 0.98, 0.42], ['190,205,170', 0.7, 0.55, 0.4],
  ];
  for (const [col, fx, fy, fr] of washes) {
    const cx = fx * w, cy = fy * h, rad = fr * Math.min(w, h);
    const blob = () => {
      const n = 9, pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.3, rr = rad * (0.7 + r() * 0.4);
        pts.push([cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr * 0.95]);
      }
      const p = new Path2D();   // a smooth closed curve through the midpoints
      const mid = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
      p.moveTo(...mid(n - 1));
      for (let i = 0; i < n; i++) p.quadraticCurveTo(pts[i][0], pts[i][1], ...mid(i));
      p.closePath();
      return p;
    };
    g.save();
    g.filter = 'blur(3px)';
    for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(${col},0.1)`; g.fill(blob()); }   // glazes: each pass a little different
    g.strokeStyle = `rgba(${col},0.3)`; g.lineWidth = 2.5; g.stroke(blob());               // the wet edge
    g.restore();
  }
  for (let i = 0; i < w * h * 0.01; i++) {                                                  // paper tooth
    g.fillStyle = `rgba(150,120,80,${0.02 + r() * 0.04})`;
    g.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
  return texture(c);
}

// A patch of paper left unpainted round the case, with a pale wet edge and a little brown where it
// sits: the way a painter separates a small subject from a busy background. Used in the shop,
// where the case would otherwise melt into the brown wood and the carpet behind it.
export function paperPatchTexture() {
  const S = 256, [c, g] = canvas(S, S), r = rng(53);
  const [t, tg] = canvas(S, S);
  const path = new Path2D();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, rr = 0.8 + r() * 0.14;
    const x = S / 2 + Math.cos(a) * S * 0.42 * rr, y = S / 2 + Math.sin(a) * S * 0.4 * rr;
    i ? path.lineTo(x, y) : path.moveTo(x, y);
  }
  path.closePath();
  // a little brown low and to the right of the case, where it sits
  tg.fillStyle = 'rgba(120,86,60,.2)';
  tg.save(); tg.translate(S * 0.03, S * 0.045); tg.fill(path); tg.restore();
  tg.fillStyle = 'rgba(253,248,236,.9)';
  tg.fill(path);
  tg.strokeStyle = 'rgba(190,150,100,.3)'; tg.lineWidth = 2; tg.stroke(path);
  g.filter = 'blur(4px)';
  g.drawImage(t, 0, 0);
  return texture(c);
}
