import * as THREE from 'three';
import { toonGradient } from './textures.js';

const gradientMap = toonGradient(4);

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

export function glow(color) {
  return new THREE.MeshBasicMaterial({ color });
}
