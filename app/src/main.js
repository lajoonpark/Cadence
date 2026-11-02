import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildShop } from './shop.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour } from './watercolour.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer) : null;

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#f4c98a');
scene.background = skyColor;
scene.fog = new THREE.Fog('#f1cf9b', 18, 52);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 120);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

// Light: warm low sun for the street, soft sky fill. Interior lamps live in shop.js.
const hemi = new THREE.HemisphereLight('#d6dcf2', '#b08a70', 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffc27a', 2.3);
// shadows cover the whole street and the shop behind it, so the vaults keep the sun out
sun.position.set(-20, 16, 30);
sun.target.position.set(0, 0, -1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 110 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const sky = createSky();
scene.add(sky.dome);

const street = buildStreet();
scene.add(street.root);
scene.add(buildShop());
const timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });

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

// ?cam=x,y,z,tx,ty,tz pins the camera (for looking around the shop while the intro only reaches the hall)
const pinned = params.get('cam')?.split(',').map(Number);

function frame(t) {
  timeOfDay.update(t);
  const c = pinned ? { pos: new THREE.Vector3(...pinned.slice(0, 3)), target: new THREE.Vector3(...pinned.slice(3, 6)) } : cameraAt(t);
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
  if (painter) painter.render(scene, camera, t);
  else renderer.render(scene, camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
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
