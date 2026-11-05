// Which way a record's vinyl slides out of its sleeve, so it does not pass through the rack or other
// records. The vinyl always leaves within the sleeve's own plane (+y out of the top is the usual way);
// for the hovered sleeve, in the pose it is in now, each way (up, left, right, down) is swept in a few
// steps against everything solid in the rack (furniture boxes, filler spines, the other sleeves) as
// oriented boxes. The clearest way wins; up wins ties, then the sides, then down. If every way hits
// something, the one that hits least is used (Lajoon: pass through only when there is no better option).
//
//   chooseDiscDir(core, sleeve) -> THREE.Vector2   unit direction in the sleeve's x/y plane
//   discHits(core, sleeve, dir, steps)             the score itself (number of overlaps over the sweep)
//   solidsOf(core, exclude)                        the rack's solid boxes as OBBs (world space)
//   sleeveHits(sleeve, solids)                     how many solids the sleeve itself overlaps (scripts/pass-check.mjs)
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';

const DIRS = [[0, 1, 0], [-1, 0, 0.01], [1, 0, 0.01], [0, -1, 0.03]]; // x, y, bias (a preference, not a hit)
const DISC_R = 0.145, DISC_T = 0.004, SLEEVE = 0.31;
const STEPS = [0.08, 0.13, 0.18, 0.23, 0.28, 0.31]; // slide, sleeve units of 0.31 (DISC_OUT = 0.31)
const SHRINK = 0.004;                               // m: touching is not passing through

const _m = new THREE.Matrix4(), _im = new THREE.Matrix4(), _c = new THREE.Vector3(), _h = new THREE.Vector3();

function obbOf(geo, matrixWorld) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox;
  b.getCenter(_c); b.getSize(_h).multiplyScalar(0.5);
  _h.subScalar(SHRINK).max(new THREE.Vector3(0.0005, 0.0005, 0.0005));
  const o = new OBB(_c.clone(), _h.clone());
  o.applyMatrix4(matrixWorld);
  // a bounding sphere for the quick reject
  o.r = o.halfSize.length();
  return o;
}

function visibleIn(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

// Every solid in the rack (world-space OBBs), except `exclude` and its children (the hovered sleeve,
// with its own vinyl and the name tag).
export function solidsOf(core, exclude) {
  const out = [];
  core.root.updateMatrixWorld(true);
  core.root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.noClear) return;
    for (let p = o; p; p = p.parent) if (p === exclude) return;
    if (o === core.tag?.mesh || !visibleIn(o, core.root)) return;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _im);
        const b = obbOf(o.geometry, _m.multiplyMatrices(o.matrixWorld, _im));
        b.src = o; b.inst = i;
        out.push(b);
      }
    } else { const b = obbOf(o.geometry, o.matrixWorld); b.src = o; out.push(b); }
  });
  return out;
}

// The vinyl as an OBB when slid `amount` (sleeve units) along `dir` from the sleeve's centre.
function discObb(sleeve, dir, amount) {
  const k = sleeve.size / SLEEVE;
  const o = new OBB(new THREE.Vector3(dir.x * amount * k, dir.y * amount * k, 0), new THREE.Vector3(DISC_R * k, DISC_R * k, DISC_T / 2));
  o.applyMatrix4(sleeve.mesh.matrixWorld);
  o.r = o.halfSize.length();
  return o;
}

export function discHits(core, sleeve, dir, solids = solidsOf(core, sleeve.mesh), steps = STEPS) {
  let hits = 0;
  for (const a of steps) {
    const d = discObb(sleeve, dir, a);
    for (const s of solids) {
      if (s.center.distanceTo(d.center) > s.r + d.r) continue;
      if (d.intersectsOBB(s)) hits++;
    }
  }
  return hits;
}

export function chooseDiscDir(core, sleeve) {
  sleeve.mesh.updateWorldMatrix(true, false);
  const solids = solidsOf(core, sleeve.mesh);
  let best = null, bestScore = Infinity;
  for (const [x, y, bias] of DIRS) {
    const dir = new THREE.Vector2(x, y);
    const score = discHits(core, sleeve, dir, solids) + bias;
    if (score < bestScore) { bestScore = score; best = dir; }
    if (score === 0) break; // up and clear: nothing beats it
  }
  return best;
}

export function sleeveHits(sleeve, solids, list = false) {
  sleeve.mesh.updateWorldMatrix(true, false);
  const o = obbOf(sleeve.mesh.geometry, sleeve.mesh.matrixWorld);
  const hit = solids.filter((x) => x.center.distanceTo(o.center) <= x.r + o.r && o.intersectsOBB(x));
  return list ? hit : hit.length;
}
