// Instanced building kit. Thousands of bricks, flagstones, tiles and slats are collected here as
// (matrix, colour) pairs and turned into one InstancedMesh per part at the end, so a whole street
// of real 3D masonry costs a handful of draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './materials.js';

export const BRICK = { len: 0.5, row: 0.24, gap: 0.028, depth: 0.2 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Matrix from position, Euler rotation (x, y, z) and scale.
export function trs(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
}

class Part {
  constructor(geometry, material, { castShadow = true, receiveShadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.matrices = [];
    this.colors = [];
  }
  add(matrix, color) {
    this.matrices.push(matrix.clone());
    this.colors.push(_c.set(color).clone());
  }
  build() {
    if (!this.matrices.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    this.matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.colors[i]);
    });
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

function halfPipe() {
  // canal roof tile: half cylinder along +z, open side down
  const g = new THREE.CylinderGeometry(0.11, 0.12, 1, 7, 1, true, -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  return g;
}

export function createKit() {
  const white = () => toon('#ffffff');
  const parts = {
    brick: new Part(new RoundedBoxGeometry(BRICK.len, BRICK.row - BRICK.gap, BRICK.depth, 2, 0.035), white()),
    block: new Part(new RoundedBoxGeometry(1, 1, 1, 1, 0.06), white()), // generic stone/wood block, scaled freely
    flag: new Part(new RoundedBoxGeometry(1, 0.12, 1, 2, 0.05), white(), { castShadow: false }),
    tile: new Part(halfPipe(), toon('#ffffff', { side: THREE.DoubleSide })),
    slat: new Part(new THREE.BoxGeometry(1, 1, 1), white()),
    rod: new Part(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), white()), // iron bars, pipes, poles (unit, scaled)
    ball: new Part(new THREE.IcosahedronGeometry(0.5, 1), white()), // fruit, flowers, leaves (scaled)
    leaf: new Part(new THREE.SphereGeometry(0.5, 7, 5), white()),
    cone: new Part(new THREE.ConeGeometry(0.5, 1, 4), white()),
    pot: new Part(new THREE.CylinderGeometry(0.5, 0.36, 1, 12), white()),
    disc: new Part(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), white()),
  };
  return {
    ...parts,
    // Bake everything into the given group.
    flush(root) {
      for (const p of Object.values(parts)) {
        const mesh = p.build();
        if (mesh) root.add(mesh);
      }
    },
  };
}

// Mul helper: parent * child, returns new matrix.
export function mul(parent, child) {
  return _m.multiplyMatrices(parent, child).clone();
}
