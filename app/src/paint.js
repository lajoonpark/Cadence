// Watercolour versions of the procedural textures: loose washes with darker wet edges and
// unpainted (light) gaps instead of clean blocks. Used when ?style=watercolour.
import * as THREE from 'three';
import { rng } from './rand.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

// A wobbly closed blob around a rounded rectangle.
function blobPath(g, r, x, y, w, h, wobble) {
  const pts = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // superellipse so blocks stay blocky but soft
    const c = Math.cos(a), s = Math.sin(a);
    const px = Math.sign(c) * Math.pow(Math.abs(c), 0.35);
    const py = Math.sign(s) * Math.pow(Math.abs(s), 0.35);
    const j = 1 + (r() - 0.5) * wobble;
    pts.push([x + w / 2 + (px * w) / 2 * j, y + h / 2 + (py * h) / 2 * j]);
  }
  g.beginPath();
  g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    g.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
  }
  g.closePath();
}

// One wash: a few translucent layers that pool darker at the rim (the "wet edge").
function wash(g, r, color, edge, shape) {
  g.save();
  g.filter = 'blur(1.2px)';
  g.globalAlpha = 0.55;
  g.fillStyle = color;
  for (let k = 0; k < 2; k++) { shape(k); g.fill(); }
  g.globalAlpha = 0.35;
  g.lineWidth = 2.5 + r() * 2;
  g.strokeStyle = edge;
  shape(2); g.stroke();
  g.restore();
}

// Soft speckle of pigment granules.
function granulate(g, r, w, h, count, rgb, alpha) {
  g.save();
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(${rgb},${alpha * (0.4 + r() * 0.6)})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.restore();
}

export function washStone(repeatX, repeatY) {
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  g.fillStyle = '#e2c9a0'; g.fillRect(0, 0, 512, 512); // mortar left as pale paper
  const rows = 8, rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 60;
    while (x < 512) {
      const w = 70 + r() * 70;
      const hue = 30 + r() * 10, sat = 40 + r() * 16, l = 58 + r() * 12;
      const bx = x + 5, by = y * rh + 5, bw = w - 10, bh = rh - 10;
      wash(g, r, `hsl(${hue},${sat}%,${l}%)`, `hsl(${hue - 4},${sat + 10}%,${l - 22}%)`,
        () => blobPath(g, r, bx, by, bw, bh, 0.12));
      x += w;
    }
  }
  granulate(g, r, 512, 512, 1600, '120,80,40', 0.12);
  return finish(c, repeatX, repeatY);
}

export function washCobble(repeatX, repeatY) {
  const [c, g] = canvas(512, 512);
  const r = rng(11);
  g.fillStyle = '#b4a9ad'; g.fillRect(0, 0, 512, 512);
  const cols = 5, rows = 5, cw = 512 / cols, ch = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const hue = 262 + r() * 30, l = 58 + r() * 12, sat = 10 + r() * 10;
      const bx = x * cw + 5 + r() * 6, by = y * ch + 5 + r() * 6;
      wash(g, r, `hsl(${hue},${sat}%,${l}%)`, `hsl(${hue},${sat + 8}%,${l - 24}%)`,
        () => blobPath(g, r, bx, by, cw - 14, ch - 14, 0.18));
    }
  }
  granulate(g, r, 512, 512, 2200, '60,50,70', 0.14);
  return finish(c, repeatX, repeatY);
}

export function washPlank(repeatX, repeatY, horizontal = false) {
  const [c, g] = canvas(512, 512);
  const r = rng(23);
  g.fillStyle = '#f0d9b5'; g.fillRect(0, 0, 512, 512);
  const n = 8, s = 512 / n;
  for (let i = 0; i < n; i++) {
    const hue = 28 + r() * 8, sat = 48 + r() * 12, l = 62 + r() * 10;
    const rect = (k) => {
      const j = (r() - 0.5) * 3;
      g.beginPath();
      if (horizontal) g.rect(-4, i * s + 3 + j, 520, s - 6);
      else g.rect(i * s + 3 + j, -4, s - 6, 520);
    };
    wash(g, r, `hsl(${hue},${sat}%,${l}%)`, `hsl(${hue - 6},${sat + 8}%,${l - 26}%)`, rect);
    // loose dry-brush grain streaks
    g.save();
    g.filter = 'blur(0.8px)';
    g.strokeStyle = `hsla(${hue - 6},${sat}%,${l - 22}%,.28)`;
    for (let k = 0; k < 3; k++) {
      g.lineWidth = 1 + r() * 2;
      const o = (i + 0.2 + r() * 0.6) * s;
      g.beginPath();
      if (horizontal) { g.moveTo(0, o); g.bezierCurveTo(170, o + (r() - .5) * 10, 340, o + (r() - .5) * 10, 512, o); }
      else { g.moveTo(o, 0); g.bezierCurveTo(o + (r() - .5) * 10, 170, o + (r() - .5) * 10, 340, o, 512); }
      g.stroke();
    }
    g.restore();
  }
  granulate(g, r, 512, 512, 1200, '110,70,30', 0.1);
  return finish(c, repeatX, repeatY);
}

export function washConcrete(repeatX, repeatY) {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  g.fillStyle = '#c3bbb2'; g.fillRect(0, 0, 256, 256);
  g.save();
  g.filter = 'blur(6px)';
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `hsla(${25 + r() * 20},${8 + r() * 10}%,${55 + r() * 20}%,.35)`;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 18 + r() * 40, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  granulate(g, r, 256, 256, 700, '70,60,50', 0.12);
  g.save();
  g.filter = 'blur(0.8px)';
  g.strokeStyle = 'rgba(90,75,60,.22)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.restore();
  return finish(c, repeatX, repeatY);
}

// Cold-press paper: fine tooth plus a few long fibres. Greyscale height, 1 = raised.
export function paperTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = rng(99);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = Math.round(150 + r() * 105);
    g.fillStyle = `rgba(${v},${v},${v},.5)`;
    const s = 1 + r() * 4;
    g.fillRect(r() * S, r() * S, s, s);
  }
  g.save();
  g.filter = 'blur(0.7px)';
  g.drawImage(c, 0, 0);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.25)';
  for (let i = 0; i < 140; i++) {
    g.lineWidth = 0.6 + r();
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 10 + r() * 30;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
