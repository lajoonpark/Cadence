// Paper for the watercolour pass.
import * as THREE from 'three';
import { rng } from './rand.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
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
