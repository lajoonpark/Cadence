import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildShop } from './shop.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = new THREE.Color('#f4c98a');
scene.background = sky;
scene.fog = new THREE.Fog('#f1cf9b', 18, 52);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 120);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

// Light: warm low sun for the street, soft sky fill. Interior lamps live in shop.js.
scene.add(new THREE.HemisphereLight('#ffe7c2', '#8a6a55', 1.0));
const sun = new THREE.DirectionalLight('#ffc27a', 1.3);
sun.position.set(-6, 9, 14);
scene.add(sun);

const street = buildStreet();
scene.add(street.root);
scene.add(buildShop());

// ---- intro timeline (seconds) ----
const T = { hold: 0.9, push: 4.4, doorStart: 3.0, doorEnd: 4.9, enter: 7.6 };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

function cameraAt(t) {
  const push = easeInOut(clamp01((t - T.hold) / (T.push - T.hold)));
  const enter = easeInOut(clamp01((t - T.push) / (T.enter - T.push)));
  const z = lerp(lerp(19.5, 2.6, push), -3.5, enter);
  const y = lerp(lerp(2.3, 1.75, push), 1.7, enter);
  // gentle sway while walking
  const sway = Math.sin(t * 1.7) * 0.04 * (push > 0 && enter < 1 ? 1 : 0);
  return { pos: new THREE.Vector3(sway, y, z), target: new THREE.Vector3(0, lerp(2.0, 1.55, enter), z - 10) };
}

function doorAngle(t) {
  return easeInOut(clamp01((t - T.doorStart) / (T.doorEnd - T.doorStart))) * THREE.MathUtils.degToRad(105);
}

// ---- cursor tilt ----
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  tilt.tx = (e.clientX / innerWidth) * 2 - 1;
  tilt.ty = (e.clientY / innerHeight) * 2 - 1;
});

const lookM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function frame(t) {
  const c = cameraAt(t);
  rig.position.copy(c.pos);
  // Matrix4.lookAt uses the camera convention (looks down -z); Object3D.lookAt on a group would face the other way.
  rig.quaternion.setFromRotationMatrix(lookM.lookAt(c.pos, c.target, UP));
  for (const { pivot, side } of street.leaves) pivot.rotation.y = side * -doorAngle(t);
  tilt.x += (tilt.tx - tilt.x) * 0.06;
  tilt.y += (tilt.ty - tilt.y) * 0.06;
  const settled = clamp01((t - T.push) / (T.enter - T.push));
  const k = 0.25 + 0.75 * settled; // gentle tilt outside, full tilt inside
  camera.rotation.order = 'YXZ';
  camera.rotation.set(-tilt.y * 0.09 * k, -tilt.x * 0.2 * k, 0);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Deterministic time for screenshots: ?shot, then window.__seek(seconds).
if (params.has('shot')) {
  window.__seek = (t) => { frame(t); return true; };
  window.__ready = true;
} else {
  const start = performance.now() - (Number(params.get('t')) || 0) * 1000;
  renderer.setAnimationLoop(() => frame(Math.min((performance.now() - start) / 1000, T.enter + 9999)));
}
