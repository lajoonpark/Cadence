// Everything the suitcase wears is painted here with canvas 2D, so the app ships no image files:
// leather, quilted lining, speaker cloth, the grooves of the vinyl, glyphs for the buttons, the shadow
// and the shine. The surfaces carry the same brush strokes as the shop (brushpaint.js), in the texture
// so they stay on their own part as the lid swings and the case leans. Their maps wrap every few units
// of the case's own size (brushUV in model.js), so a stroke is the same size on every face.
// Colours are washes (warm, a little muted), never black.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { coat, mark, LEAN } from '../brushpaint.js';

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

// A coat of strokes that tiles. `tile`: how many units of the case one repeat covers.
function coated(tones, { S = 512, tile, len = 150, wid = 42, seed, extra }) {
  const [c, g] = canvas(S, S);
  g.fillStyle = tones[0];
  g.fillRect(0, 0, S, S);
  coat(g, S, S, { tones, len, wid, seed, tile: true });
  extra?.(g, S);
  return texture(c, { repeat: [1 / tile, 1 / tile] });
}

// Tan leather.
export function leatherTexture() {
  return coated(['#c98c57', '#bd7d49', '#d49a66', '#b3713f', '#d9a470', '#c48450', '#c9895a'], { tile: 2.6, seed: 7 });
}

// Cream lining of the lid.
export function liningTexture() {
  return coated(['#f1e3bf', '#ecdbb2', '#f5eacc', '#e8d5a8', '#f7eed6'], { tile: 3, seed: 11 });
}

// The cream deck plate, in the same broad strokes as the lining but a quieter range, under the controls.
export function deckTexture() {
  return coated(['#e2d5b4', '#ddcfac', '#e7dbbd', '#d8c9a4', '#e4d8b9'], { tile: 3, seed: 23 });
}

// Speaker cloth: wheat strokes with the weave showing through.
export function clothTexture() {
  return coated(['#d6c08a', '#cbb379', '#e0cd9c', '#c4aa6e'], {
    S: 256, tile: 1, len: 90, wid: 26, seed: 5,
    extra: (g, S) => {
      g.lineWidth = 1.4;
      for (let i = -S; i < S * 2; i += 8) {
        g.strokeStyle = 'rgba(110,80,36,.24)';
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
        g.strokeStyle = 'rgba(255,248,214,.26)';
        g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke();
      }
    },
  });
}

// Strokes in shades of white, multiplied by a part's own colour: the metal, the deck, the caps and the
// knob (whose colours change on hover) all stay plain colours that happen to be brushed on.
export function strokesTexture() {
  return coated(['#ffffff', '#f0ebe2', '#fff7ea', '#e4dccf', '#eef1f6', '#f7f2e8', '#d9d0c1'], { tile: 1.6, seed: 19, len: 140, wid: 40 });
}

// The face of the vinyl: concentric grooves in lighter greys, a few wide smooth bands between
// tracks and faint scuffs, so the record visibly turns even though it is round.
export function vinylTexture(labelFraction) {
  const S = 1024, [c, g] = canvas(S, S), m = S / 2, r = rng(21);
  g.fillStyle = COL.vinyl;
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  // pulled round the record, then cut off at its edge
  g.save();
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.clip();
  for (let ring = m * labelFraction + 30; ring < m; ring += 42) {
    const n = Math.round((ring * Math.PI * 2) / 150);
    for (let i = 0; i < n; i++) {
      const a = ((i + r()) / n) * Math.PI * 2;
      mark(g, m + Math.cos(a) * ring, m + Math.sin(a) * ring, 230, 58, a + Math.PI / 2, ['#2d262c', '#393037', '#241e25', '#40363c'][Math.floor(r() * 4)], r);
    }
  }
  g.restore();
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

// Brown strokes under the case: the shadow is painted, on the same diagonal, thinning out from the middle.
export function shadowTexture() {
  const S = 512, [c, g] = canvas(S, S), r = rng(31);
  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.46;
    const x = S / 2 + Math.cos(a) * d * S, y = S / 2 + Math.sin(a) * d * S * 0.9;
    mark(g, x, y, 130 + r() * 60, 34 + r() * 16, LEAN + (r() - 0.5) * 0.14, ['#604232', '#6d4c3a', '#573b30'][Math.floor(r() * 3)], r, 0.3 * (1 - (d / 0.46) ** 2));
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

// The small window's backdrop: a coat of pale strokes over the paper, one diagonal as in the shop, its
// colour drifting across the sheet from one pooled patch to the next. Drawn at twice the card's size.
export function brushBackdrop(w, h) {
  const S = 2, [c, g] = canvas(w * S, h * S);
  g.fillStyle = '#f6ebd0';
  g.fillRect(0, 0, w * S, h * S);
  const pools = [
    [[178, 196, 168], 0.12, 0.5], [[236, 184, 156], 0.88, 0.2], [[170, 188, 214], 0.1, 0.1],
    [[240, 208, 140], 0.85, 0.85], [[208, 172, 192], 0.4, 0.98], [[190, 205, 170], 0.7, 0.55],
  ];
  const tones = (x, y, r) => {
    let sum = 0;
    const col = [0, 0, 0];
    for (const [rgb, fx, fy] of pools) {
      const k = 1 / (0.012 + ((x / (w * S) - fx) ** 2 + (y / (h * S) - fy) ** 2));
      sum += k;
      for (let i = 0; i < 3; i++) col[i] += rgb[i] * k;
    }
    const lift = 0.04 + r() * 0.28;   // no two loads of the brush are as strong
    return col.map((v, i) => Math.round((v / sum) * (1 - lift) + [246, 235, 208][i] * lift) & ~3);
  };
  coat(g, w * S, h * S, { tones, len: 420, wid: 130, seed: 76, rowGap: 0.26, colGap: 0.6 });   // the first coat closes the sheet
  coat(g, w * S, h * S, { tones, len: 300, wid: 92, seed: 77, rowGap: 0.24, colGap: 0.55 });
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
