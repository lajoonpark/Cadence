// A painted sky dome: vertical gradient plus soft cloud washes, redrawn when the time of day changes.
import * as THREE from 'three';
import { rng } from './rand.js';

export function createSky() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat);
  dome.renderOrder = -1;

  let key = '';
  function paint({ top, horizon, cloud, cloudAlpha, stars = 0 }) {
    const k = [top, horizon, cloud, cloudAlpha.toFixed(2), stars.toFixed(2)].join();
    if (k === key) return;
    key = k;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, top);
    grad.addColorStop(0.42, top);
    grad.addColorStop(0.5, horizon);
    grad.addColorStop(1, horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    if (stars > 0.01) {
      const rs = rng(5);
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = stars * (0.3 + rs() * 0.7);
        g.fillStyle = '#fff6e0';
        const sz = 0.8 + rs() * 1.6;
        g.fillRect(rs() * 1024, rs() * 230, sz, sz);
      }
      g.globalAlpha = 1;
    }
    const r = rng(17);
    g.save();
    g.filter = 'blur(10px)';
    for (let i = 0; i < 22; i++) {
      const x = r() * 1024, y = 90 + r() * 150;
      g.globalAlpha = cloudAlpha * (0.35 + r() * 0.4);
      g.fillStyle = cloud;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.ellipse(x + (k - 2) * 26 + r() * 10, y + (r() - 0.5) * 12, 40 + r() * 40, 12 + r() * 10, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    tex.needsUpdate = true;
  }
  return { dome, paint };
}
