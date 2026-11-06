// Paints the world with real brush strokes, pinned to it: each stroke is a small painted decal fixed
// to a spot on a wall, floor or table, so it moves exactly with that surface and sits perfectly still
// when the camera does. Only its colour is live, read from the rendered scene at that spot, so lighting
// and time of day still reach the paint. A stroke may run past the edge of its surface, which is what
// makes outlines uneven, but breaks up where the picture stops being its colour.
//
// Where strokes go is found by rendering the scene's positions from the places the camera visits and
// reading them back, so hidden faces get none. Closer views add smaller strokes, and each stroke fades
// in and out by its size on screen, so the marks stay about the same size wherever you stand.
// Glazes multiply onto the paper like transparent pigment: overlaps deepen, gaps stay pale.
import * as THREE from 'three';
import { rng } from './rand.js';

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }
`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Atlas of brush marks, baked once. R coverage (ragged sides, frayed tail), G pigment density (bristle
// streaks), B wet rim (where pigment pools at the edge of the mark).
const ATLAS_COLS = 2, ATLAS_ROWS = 4;
const atlasFragment = /* glsl */ `
varying vec2 vUv;
${NOISE}
void main() {
  vec2 g = vUv * vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  vec2 id = floor(g), f = fract(g);
  float seed = id.x * 7.3 + id.y * 13.1 + 1.0;
  float u = f.x, v = f.y * 2.0 - 1.0;
  // the brush lands, loads the paper, then lifts off and runs dry
  float body = smoothstep(0.0, 0.05, u) * (1.0 - pow(smoothstep(0.7, 0.99, u), 2.0));
  float centre = (fbm(vec2(u * 1.3, seed + 9.0)) - 0.5) * 0.45;
  float width = 0.6 * body * (1.0 + (fbm(vec2(u * 2.5, seed)) - 0.5) * 0.6)
    + (fbm(vec2(u * 9.0, seed + 3.0)) - 0.5) * 0.2 * body;
  float d = abs(v - centre) / max(width, 0.001);
  d += (noise(vec2(u * 26.0, v * 7.0 + seed)) - 0.5) * 0.22; // a torn, uneven edge
  float cover = 1.0 - smoothstep(0.84, 1.0, d);
  // dry brush: bristle tracks open up toward the tail
  float bristle = fbm(vec2(u * 1.5, v * 9.0 + seed * 2.0));
  float dry = smoothstep(0.35, 1.0, u) * 0.75 + (fbm(vec2(u * 6.0, v * 4.0 + seed)) - 0.5) * 0.35;
  cover *= smoothstep(dry - 0.16, dry + 0.16, bristle + 0.14);
  float density = 0.8 + 0.2 * smoothstep(0.25, 0.75, bristle);
  float rim = smoothstep(0.7, 0.98, d) * cover;
  gl_FragColor = vec4(cover, density, rim, 1.0);
}
`;

const strokeVertex = /* glsl */ `
attribute vec4 aPos;         // world position, stroke length in metres
attribute vec4 aTan;         // direction along the surface, random
attribute vec4 aNor;         // surface normal, random
uniform sampler2D tRef;
uniform sampler2D tDepth;
uniform mat4 viewProj;
uniform vec3 eye;
uniform vec2 clipRange;      // camera near, far
uniform float heightAt1m;    // metres of world filling the screen's height, 1 m from the camera
uniform float lodShift;      // keeps stroke colours at the same scale at any window size
uniform float widthRatio;
uniform vec2 window;         // stroke length on screen (fraction of its height) where it is fully shown
uniform vec2 lods;           // fine, coarse colour levels
uniform vec2 gate;           // detail difference that starts / fully shows a stroke (0 0: always)
uniform float power;         // how transparent a glaze is; overlaps add back up to the scene colour
varying vec2 vAtlas;
varying vec3 vPigment;
varying vec3 vWants;         // the colour this mark is painting: it stops where the picture stops being that
varying float vFade;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 saturated(vec3 c) { return clamp(mix(vec3(lum(c)), c, 1.3), 0.0, 1.0); }
float sceneDepth(vec2 uv) {
  float z = textureLod(tDepth, uv, 0.0).x * 2.0 - 1.0;
  return (2.0 * clipRange.x * clipRange.y) / (clipRange.y + clipRange.x - z * (clipRange.y - clipRange.x));
}
void main() {
  // anything not on show collapses off screen before the costly part
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAtlas = vec2(0.0); vPigment = vec3(1.0); vWants = vec3(1.0); vFade = 0.0;
  vec4 clipA = viewProj * vec4(aPos.xyz, 1.0);
  if (clipA.w < 0.15) return;
  vec2 a = clipA.xy / clipA.w * 0.5 + 0.5;
  if (a.x < -0.5 || a.x > 1.5 || a.y < -0.5 || a.y > 1.5) return;
  if (dot(aNor.xyz, eye - aPos.xyz) <= 0.0) return;
  float onScreen = aPos.w / (clipA.w * heightAt1m);
  float fade = smoothstep(window.x * 0.6, window.x, onScreen) * (1.0 - smoothstep(window.y, window.y * 1.5, onScreen));
  if (fade <= 0.01) return;

  // hidden behind something nearer? Several taps, so a stroke fades as it goes behind an edge
  float bias = 0.05 + 0.012 * clipA.w;
  vec2 ua = clamp(a, 0.0, 1.0);
  float seen = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i < 2 ? -0.006 : 0.006, (i == 0 || i == 2) ? -0.009 : 0.009);
    seen += step(clipA.w - bias, sceneDepth(clamp(ua + o, 0.0, 1.0))) * 0.25;
  }
  fade *= seen;
  if (fade <= 0.01) return;

  vec3 fine = textureLod(tRef, ua, lods.x + lodShift).rgb;
  vec3 coarse = textureLod(tRef, ua, lods.y + lodShift).rgb;
  if (gate.y > 0.0) fade *= smoothstep(gate.x, gate.y, length(fine - coarse));
  if (fade <= 0.01) return;
  vFade = fade;

  // a hand swings in an arc, so no mark is straight
  float len = aPos.w * (0.75 + 0.5 * aNor.w);
  float wid = aPos.w * widthRatio * (0.75 + 0.5 * fract(aNor.w * 7.13));
  float bend = (fract(aNor.w * 11.3) - 0.5) * 0.7;
  vec2 lp = vec2(position.x, position.y + bend * (position.x * position.x - 0.15));
  vec3 side = cross(aNor.xyz, aTan.xyz);
  vec3 world = aPos.xyz + aTan.xyz * lp.x * len + side * lp.y * wid + aNor.xyz * 0.01;
  gl_Position = viewProj * vec4(world, 1.0);
  vWants = fine;

  float cell = floor(aTan.w * 97.0);
  vec2 id = vec2(mod(cell, ${ATLAS_COLS}.0), mod(floor(cell / ${ATLAS_COLS}.0), ${ATLAS_ROWS}.0));
  vAtlas = (id + uv) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
#ifdef CORRECT
  // a correction on top of the glazes: only what this spot needs beyond the coarser colour
  vPigment = clamp(fine / max(coarse, vec3(0.04)), 0.0, 1.0);
#elif defined(TOUCH)
  vPigment = fine;
#else
  vPigment = pow(saturated(fine), vec3(power));
#endif
  // each mark leans a little warm or cool, as if the brush was not rinsed between loads
  vPigment *= mix(vec3(1.04, 1.0, 0.95), vec3(0.96, 1.0, 1.05), fract(aNor.w * 3.71));
}
`;

const strokeFragment = /* glsl */ `
uniform sampler2D tAtlas;
uniform sampler2D tRef;
uniform float opacity;
uniform float rimPower;
uniform float lodShift;
uniform vec3 clip;           // reference level, colour distance where the mark starts to break, and stops
varying vec2 vAtlas;
varying vec3 vPigment;
varying vec3 vWants;
varying float vFade;
void main() {
  vec4 s = texture2D(tAtlas, vAtlas);
  // The mark stops at the edge of the shape it is painting, raggedly: the bristle pattern shifts
  // where it looks, so the edge is uneven and sometimes overshoots.
  vec2 screen = gl_FragCoord.xy / vec2(textureSize(tRef, 0));
  vec2 off = (s.gb - vec2(0.8, 0.2)) * 0.022;
  vec3 here = textureLod(tRef, screen + off, clip.x + lodShift).rgb;
  float stay = 1.0 - smoothstep(clip.y, clip.z, length(here - vWants));
  float cover = s.r * stay * vFade;
  vec3 pig = pow(max(vPigment, vec3(0.001)), vec3(1.0 + s.b * rimPower));
#ifdef TOUCH
  gl_FragColor = vec4(pig, cover * opacity);
#else
  gl_FragColor = vec4(mix(vec3(1.0), pig, cover * s.g * opacity), 1.0);
#endif
}
`;

// The first thin wash under everything: moving things (records, the door) get no pinned strokes, and
// gaps between strokes show this, not white.
const underFragment = /* glsl */ `
uniform sampler2D tRef;
uniform float lodShift;
uniform float power;
uniform vec2 pan;
uniform float aspect;
varying vec2 vUv;
${NOISE}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 q = (vUv + pan) * vec2(aspect, 1.0);
  // every shape's edge wanders here, in the first wash, before a brush touches it
  vec2 wander = (vec2(fbm(q * 5.0 + 11.0), fbm(q * 5.0 + 37.0)) - 0.5) * 0.028
              + (vec2(fbm(q * 19.0 + 3.0), fbm(q * 19.0 + 23.0)) - 0.5) * 0.009;
  vec3 c = textureLod(tRef, vUv + wander, 2.2 + lodShift).rgb;
  c = clamp(mix(vec3(lum(c)), c, 1.3), 0.0, 1.0);
  // left bare in places: the paper shows through as light catches
  float thin = smoothstep(0.5, 0.74, fbm(q * 2.6 + 3.0));
  gl_FragColor = vec4(mix(pow(c, vec3(power)), vec3(1.0), thin * 0.45), 1.0);
}
`;

// reach: stroke length as a fraction of its distance from the view that placed it.
// spacing: gap between strokes as a fraction of their length.
const LAYERS = [
  // broad glazes
  { segments: 6, cap: 60000, reach: 0.36, spacing: 0.68, widthRatio: 0.4, window: [0.2, 0.6], lods: [3.0, 4.2], gate: [0, 0], power: 0.25, opacity: 0.95, rim: 0.5, clip: [1.6, 0.15, 0.3], mode: 'GLAZE' },
  // medium strokes, where the picture has detail the glazes could not hold
  { segments: 3, cap: 90000, reach: 0.14, spacing: 0.55, widthRatio: 0.33, window: [0.08, 0.24], lods: [1.6, 3.4], gate: [0.025, 0.09], power: 1, opacity: 0.85, rim: 0.4, clip: [1.2, 0.08, 0.2], mode: 'CORRECT' },
  // fine touches of opaque colour, the only marks that can put light back on a dark wash
  { segments: 1, cap: 120000, reach: 0.05, spacing: 0.5, widthRatio: 0.29, window: [0.03, 0.1], lods: [0.8, 2.2], gate: [0.07, 0.18], power: 1, opacity: 0.72, rim: 0.2, clip: [0.7, 0.1, 0.22], mode: 'TOUCH' },
];
const BASE_LENGTH = 0.1; // metres; stroke lengths are this times a power of two
const MAX_OCTAVE = 6;
const BAKE_W = 320, BAKE_H = 200;
const BAKE_STRIDE = 3;
const FARTHEST = 70; // metres: the sky dome is painted by the first wash alone

function bakeAtlas(renderer) {
  const t = new THREE.WebGLRenderTarget(1024, 1024, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const m = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: atlasFragment, depthTest: false, depthWrite: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  q.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(q);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(t);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prev);
  m.dispose();
  q.geometry.dispose();
  return t;
}

const positionMaterial = () => new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
varying vec3 vW;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
  fragmentShader: /* glsl */ `
varying vec3 vW;
void main() { gl_FragColor = vec4(vW, 1.0); }`,
  side: THREE.DoubleSide,
});

function layerMesh(layer, shared, atlas) {
  const geo = new THREE.InstancedBufferGeometry();
  // x -0.5..0.5 along the stroke, y -0.5..0.5 across; enough segments to bend (small marks need few)
  const plane = new THREE.PlaneGeometry(1, 1, layer.segments, 1);
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  const attr = (name) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(layer.cap * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const buffers = { aPos: attr('aPos'), aTan: attr('aTan'), aNor: attr('aNor') };
  geo.instanceCount = 0;
  const blend = layer.mode === 'TOUCH'
    ? { blending: THREE.NormalBlending }
    : { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
  const mat = new THREE.ShaderMaterial({
    vertexShader: strokeVertex,
    fragmentShader: strokeFragment,
    defines: layer.mode === 'GLAZE' ? {} : { [layer.mode]: '' },
    uniforms: {
      ...shared,
      tAtlas: { value: atlas.texture },
      widthRatio: { value: layer.widthRatio },
      window: { value: new THREE.Vector2(...layer.window) },
      lods: { value: new THREE.Vector2(...layer.lods) },
      gate: { value: new THREE.Vector2(...layer.gate) },
      power: { value: layer.power },
      opacity: { value: layer.opacity },
      rimPower: { value: layer.rim },
      clip: { value: new THREE.Vector3(...layer.clip) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...blend,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, geo, mat, plane, buffers, layer, count: 0, taken: new Set() };
}

// A direction along the surface: level across walls, with a slow drift over the world and some hand
// wobble, so strokes on one wall roughly agree. Fixed once chosen.
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const tangent = new THREE.Vector3();
function chooseTangent(p, n, r) {
  tangent.crossVectors(Math.abs(n.y) > 0.8 ? X : UP, n).normalize();
  const drift = Math.sin(p.x * 0.7 + p.z * 0.4) * 0.5 + Math.sin(p.y * 1.1 - p.z * 0.6) * 0.4;
  return tangent.applyAxisAngle(n, -0.3 + drift + (r - 0.5) * 0.6);
}

const FACES = (n) => (Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 0 : 1) : Math.abs(n.y) > Math.abs(n.z) ? (n.y > 0 ? 2 : 3) : (n.z > 0 ? 4 : 5));

export function createBrushStrokes(renderer, refTexture, depthTexture) {
  const shared = {
    tRef: { value: refTexture },
    tDepth: { value: depthTexture },
    viewProj: { value: new THREE.Matrix4() },
    eye: { value: new THREE.Vector3() },
    clipRange: { value: new THREE.Vector2(0.1, 100) },
    heightAt1m: { value: 1 },
    pan: { value: new THREE.Vector2() },
    aspect: { value: 1 },
    lodShift: { value: 0 },
  };
  const atlas = bakeAtlas(renderer);
  const scene = new THREE.Scene();
  const under = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: underFragment,
    uniforms: { tRef: shared.tRef, lodShift: shared.lodShift, pan: shared.pan, aspect: shared.aspect, power: { value: 0.7 } },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const underQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), under);
  underQuad.frustumCulled = false;
  underQuad.renderOrder = 0;
  scene.add(underQuad);
  const layers = LAYERS.map((l, i) => {
    const part = layerMesh(l, shared, atlas);
    part.mesh.renderOrder = i + 1;
    part.mesh.visible = false; // until the first bake
    scene.add(part.mesh);
    return part;
  });

  const r = rng(7);
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), toEye = new THREE.Vector3();
  const place = (cam, data) => {
    const at = (x, y, out) => { const i = (y * BAKE_W + x) * 4; if (!data[i + 3]) return null; return out.set(data[i], data[i + 1], data[i + 2]); };
    const eye = cam.getWorldPosition(new THREE.Vector3());
    for (let y = 0; y < BAKE_H - 2 * BAKE_STRIDE; y += BAKE_STRIDE) {
      for (let x = 0; x < BAKE_W - 2 * BAKE_STRIDE; x += BAKE_STRIDE) {
        const px = x + Math.floor(r() * BAKE_STRIDE), py = y + Math.floor(r() * BAKE_STRIDE);
        if (!at(px, py, p) || !at(px + BAKE_STRIDE, py, a) || !at(px, py + BAKE_STRIDE, b)) continue;
        const d = toEye.subVectors(eye, p).length();
        if (d > FARTHEST) continue;
        const reachOk = 0.12 * d;
        if (a.distanceTo(p) > reachOk || b.distanceTo(p) > reachOk) continue; // across an edge
        n.crossVectors(a.sub(p), b.sub(p));
        if (n.lengthSq() < 1e-12) continue;
        n.normalize();
        if (n.dot(toEye) < 0) n.negate();
        for (const part of layers) {
          const { layer, buffers, taken } = part;
          if (part.count >= layer.cap) continue;
          const octave = Math.min(MAX_OCTAVE, Math.max(0, Math.round(Math.log2((layer.reach * d) / BASE_LENGTH))));
          const len = BASE_LENGTH * 2 ** octave;
          const cell = len * layer.spacing;
          const key = (Math.floor(p.x / cell) + 8192) * 2 ** 34 + (Math.floor(p.y / cell) + 8192) * 2 ** 20 + (Math.floor(p.z / cell) + 8192) * 2 ** 6 + octave * 6 + FACES(n);
          if (taken.has(key)) continue;
          taken.add(key);
          const t = chooseTangent(p, n, r());
          const i = part.count++;
          buffers.aPos.setXYZW(i, p.x, p.y, p.z, len);
          buffers.aTan.setXYZW(i, t.x, t.y, t.z, r());
          buffers.aNor.setXYZW(i, n.x, n.y, n.z, r());
        }
      }
    }
  };

  // views: [{ pos, target, fov }]. Adds strokes for whatever those views can see that has none yet.
  function bake(world, views) {
    const rt = new THREE.WebGLRenderTarget(BAKE_W, BAKE_H, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const mat = positionMaterial();
    const cam = new THREE.PerspectiveCamera(70, BAKE_W / BAKE_H, 0.1, 200);
    const data = new Float32Array(BAKE_W * BAKE_H * 4);
    // only solid, drawn meshes: glows, lines and glass have no surface to paint on
    const hidden = [];
    world.traverse((o) => {
      if (!o.visible) return;
      const solid = o.isMesh && ![].concat(o.material).every((m) => m.transparent || m.opacity < 1);
      if (!solid && (o.isSprite || o.isLine || o.isPoints || o.isMesh)) { hidden.push(o); o.visible = false; }
    });
    const prev = { target: renderer.getRenderTarget(), bg: world.background, over: world.overrideMaterial, autoClear: renderer.autoClear, shadows: renderer.shadowMap.needsUpdate, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    world.background = null;
    world.overrideMaterial = mat;
    renderer.shadowMap.needsUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    for (const v of views) {
      cam.fov = v.fov ?? 70;
      cam.updateProjectionMatrix();
      cam.position.copy(v.pos);
      cam.lookAt(v.target);
      cam.updateMatrixWorld();
      renderer.render(world, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, data);
      place(cam, data);
    }
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.clear, prev.alpha);
    renderer.autoClear = prev.autoClear;
    renderer.shadowMap.needsUpdate = prev.shadows;
    world.background = prev.bg;
    world.overrideMaterial = prev.over;
    for (const o of hidden) o.visible = true;
    rt.dispose();
    mat.dispose();
    for (const part of layers) {
      part.geo.instanceCount = part.count;
      part.mesh.visible = part.count > 0;
      for (const buf of Object.values(part.buffers)) { buf.clearUpdateRanges(); buf.addUpdateRange(0, part.count * 4); buf.needsUpdate = true; }
    }
  }

  return {
    scene,
    bake,
    get counts() { return layers.map((l) => l.count); },
    setSize(w, h) {
      shared.aspect.value = w / h;
      shared.lodShift.value = Math.log2(Math.max(1, h) / 720);
    },
    setPan(x, y) { shared.pan.value.set(x, y); },
    setCamera(camera) {
      shared.viewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      camera.getWorldPosition(shared.eye.value);
      shared.clipRange.value.set(camera.near, camera.far);
      shared.heightAt1m.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    },
    dispose() {
      atlas.dispose();
      under.dispose();
      underQuad.geometry.dispose();
      for (const part of layers) { part.mat.dispose(); part.geo.dispose(); part.plane.dispose(); }
    },
  };
}
