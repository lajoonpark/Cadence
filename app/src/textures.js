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

// Soft, hand-painted honey-coloured stone blocks.
export function stoneTexture(repeatX, repeatY) {
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  g.fillStyle = '#b98f5e'; g.fillRect(0, 0, 512, 512);
  const rows = 8;
  const rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 60;
    while (x < 512) {
      const w = 70 + r() * 70;
      const h = 190 + r() * 40;
      const l = 54 + r() * 14;
      g.fillStyle = `hsl(${32 + r() * 8}, ${38 + r() * 14}%, ${l}%)`;
      g.beginPath();
      g.roundRect(x + 3, y * rh + 3, w - 6, rh - 6, 7);
      g.fill();
      x += w;
    }
  }
  return finish(c, repeatX, repeatY);
}

// Rounded flagstones for the street.
export function cobbleTexture(repeatX, repeatY) {
  const [c, g] = canvas(512, 512);
  const r = rng(11);
  g.fillStyle = '#4f4a52'; g.fillRect(0, 0, 512, 512);
  const cols = 5, rows = 5;
  const cw = 512 / cols, ch = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const l = 52 + r() * 14;
      g.fillStyle = `hsl(${268 + r() * 20}, ${8 + r() * 8}%, ${l}%)`;
      g.beginPath();
      g.roundRect(x * cw + 4 + r() * 6, y * ch + 4 + r() * 6, cw - 12, ch - 12, 18);
      g.fill();
    }
  }
  return finish(c, repeatX, repeatY);
}

export function plankTexture(repeatX, repeatY, horizontal = false) {
  const [c, g] = canvas(512, 512);
  const r = rng(23);
  const n = 8;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(${30 + r() * 6}, ${42 + r() * 10}%, ${60 + r() * 10}%)`;
    g.fillRect(horizontal ? 0 : i * (512 / n), horizontal ? i * (512 / n) : 0, horizontal ? 512 : 512 / n, horizontal ? 512 / n : 512);
    g.strokeStyle = 'rgba(90,55,25,.55)'; g.lineWidth = 3;
    g.beginPath();
    if (horizontal) { g.moveTo(0, i * (512 / n)); g.lineTo(512, i * (512 / n)); }
    else { g.moveTo(i * (512 / n), 0); g.lineTo(i * (512 / n), 512); }
    g.stroke();
    // a few grain lines
    g.strokeStyle = 'rgba(120,75,35,.25)'; g.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const o = (i + r()) * (512 / n);
      g.beginPath();
      if (horizontal) { g.moveTo(0, o); g.lineTo(512, o + (r() - .5) * 8); }
      else { g.moveTo(o, 0); g.lineTo(o + (r() - .5) * 8, 512); }
      g.stroke();
    }
  }
  return finish(c, repeatX, repeatY);
}

export function concreteTexture(repeatX, repeatY) {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  g.fillStyle = '#8c8680'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() > .5 ? 255 : 0},${r() > .5 ? 255 : 0},${r() > .5 ? 255 : 0},.05)`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 8, 2 + r() * 8);
  }
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return finish(c, repeatX, repeatY);
}

// Sticker-style lettering: chunky white fill, thick black outline, hard offset shadow.
export function stickerTexture(text, { w = 1024, h = 256, size = 170, color = '#fff' } = {}) {
  const [c, g] = canvas(w, h);
  g.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const x = w / 2, y = h / 2;
  g.fillStyle = '#000';
  g.fillText(text, x + 10, y + 12);
  g.lineWidth = 26; g.strokeStyle = '#000';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Stepped gradient so lights read as flat bands (non-photoreal look).
export function toonGradient(steps = 4) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(70 + (185 * i) / (steps - 1));
  const t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
