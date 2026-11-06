// Paints the rendered world with real brush strokes instead of filtering it: thousands of instanced
// stroke quads, each taking its colour from the scene at its anchor and turning to follow the shapes
// there. Three layers, big to small: broad glazes everywhere, then medium and fine strokes only where
// the picture has detail the layer above could not hold.
//
// Glazes multiply onto the paper like transparent pigment, so overlaps deepen and gaps stay pale.
// Anchors live on the paper and pan with the camera's turn, so strokes stay put as the view tilts.
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
attribute vec4 aSeed;        // anchor on the paper (0..1), two randoms
uniform sampler2D tRef;
uniform vec2 pan;            // the camera's turn, in screen fractions
uniform float aspect;
uniform float lodShift;      // keeps stroke colours at the same scale at any window size
uniform vec2 size;           // stroke length, width, as fractions of the screen height
uniform vec2 lods;           // fine, coarse colour levels
uniform vec2 gate;           // detail difference that starts / fully shows a stroke (0 0: always)
uniform float power;         // how transparent a glaze is; overlaps add back up to the scene colour
varying vec2 vAtlas;
varying vec3 vPigment;
varying vec3 vWants;         // the colour this mark is painting: it stops where the picture stops being that
varying vec2 vScreen;
const float MARGIN = 0.22;   // strokes wrap off screen, so one never pops at the edge
${NOISE}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 saturated(vec3 c) { return clamp(mix(vec3(lum(c)), c, 1.3), 0.0, 1.0); }
void main() {
  vec2 a = fract(aSeed.xy - pan / (1.0 + 2.0 * MARGIN)) * (1.0 + 2.0 * MARGIN) - MARGIN;
  vec3 fine = textureLod(tRef, a, lods.x + lodShift).rgb;
  vec3 coarse = textureLod(tRef, a, lods.y + lodShift).rgb;

  // the stroke follows the shape under it; where the picture is calm it follows the hand's sweep
  float lg = lods.y + lodShift;
  vec2 e = vec2(pow(2.0, lg) * 1.5) / vec2(textureSize(tRef, 0));
  vec2 grad = vec2(
    lum(textureLod(tRef, a + vec2(e.x, 0.0), lg).rgb) - lum(textureLod(tRef, a - vec2(e.x, 0.0), lg).rgb),
    lum(textureLod(tRef, a + vec2(0.0, e.y), lg).rgb) - lum(textureLod(tRef, a - vec2(0.0, e.y), lg).rgb));
  float sweep = -0.3 + (fbm(aSeed.xy * 2.0) - 0.5) * 1.5;
  vec2 flow = vec2(cos(sweep), sin(sweep));
  vec2 along = vec2(-grad.y, grad.x);
  float strength = smoothstep(0.015, 0.1, length(grad));
  if (dot(along, flow) < 0.0) along = -along;
  vec2 dir = normalize(mix(flow, normalize(along + 1e-5), strength));
  float wander = (aSeed.z - 0.5) * 0.45;
  dir = mat2(cos(wander), sin(wander), -sin(wander), cos(wander)) * dir;

  // detail layers appear only where this layer knows something the coarser one does not
  float show = 1.0;
  if (gate.y > 0.0) show = smoothstep(gate.x, gate.y, length(fine - coarse));

  // shorter marks on edges, so they keep the shape; long sweeping ones across calm areas
  float len = size.x * mix(1.0, 0.62, strength) * (0.75 + 0.5 * aSeed.w);
  float wid = size.y * (0.75 + 0.5 * fract(aSeed.w * 7.13));
  // a hand swings in an arc, so no mark is straight
  float bend = (fract(aSeed.w * 11.3) - 0.5) * 0.7;
  vec2 lp = vec2(position.x, position.y + bend * (position.x * position.x - 0.15));
  vec2 p = (lp.x * len) * dir + (lp.y * wid) * vec2(-dir.y, dir.x);
  vec2 ndc = (a * 2.0 - 1.0) + vec2(p.x / aspect, p.y) * 2.0 * show;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vScreen = ndc * 0.5 + 0.5;
  vWants = fine;

  float cell = floor(aSeed.z * 97.0);
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
  vPigment *= mix(vec3(1.04, 1.0, 0.95), vec3(0.96, 1.0, 1.05), fract(aSeed.w * 3.71));
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
varying vec2 vScreen;
void main() {
  vec4 s = texture2D(tAtlas, vAtlas);
  // The mark stops at the edge of the shape it is painting, raggedly: the bristle pattern shifts
  // where it looks, so the edge is uneven and sometimes overshoots.
  vec2 off = (s.gb - vec2(0.8, 0.2)) * 0.022;
  vec3 here = textureLod(tRef, vScreen + off, clip.x + lodShift).rgb;
  float stay = 1.0 - smoothstep(clip.y, clip.z, length(here - vWants));
  s.r *= stay;
  vec3 pig = pow(max(vPigment, vec3(0.001)), vec3(1.0 + s.b * rimPower));
#ifdef TOUCH
  gl_FragColor = vec4(pig, s.r * opacity);
#else
  gl_FragColor = vec4(mix(vec3(1.0), pig, s.r * s.g * opacity), 1.0);
#endif
}
`;

// The first thin wash under everything: gaps between strokes show this, not white.
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

const LAYERS = [
  // broad glazes: about two of them cover any spot
  { count: 420, size: [0.36, 0.13], lods: [3.0, 4.2], gate: [0, 0], power: 0.25, opacity: 0.95, rim: 0.5, clip: [1.6, 0.15, 0.3], mode: 'GLAZE' },
  { count: 1500, size: [0.15, 0.05], lods: [1.6, 3.4], gate: [0.025, 0.09], power: 1, opacity: 0.85, rim: 0.4, clip: [1.2, 0.08, 0.2], mode: 'CORRECT' },
  // fine touches of opaque colour, the only marks that can put light back on a dark wash
  { count: 3500, size: [0.055, 0.016], lods: [0.8, 2.2], gate: [0.07, 0.18], power: 1, opacity: 0.72, rim: 0.2, clip: [0.7, 0.1, 0.22], mode: 'TOUCH' },
];

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

function layerMesh(layer, seed, shared, atlas) {
  const r = rng(seed);
  const geo = new THREE.InstancedBufferGeometry();
  // the mark starts at the anchor's far side: x -0.5..0.5 along, y -0.5..0.5 across
  const plane = new THREE.PlaneGeometry(1, 1, 10, 1);
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  const data = new Float32Array(layer.count * 4);
  // jittered grid: strokes spread evenly without looking gridded
  const cols = Math.ceil(Math.sqrt(layer.count * 1.7));
  const rows = Math.ceil(layer.count / cols);
  for (let i = 0; i < layer.count; i++) {
    const cx = i % cols, cy = Math.floor(i / cols);
    data[i * 4] = (cx + r()) / cols;
    data[i * 4 + 1] = (cy + r()) / rows;
    data[i * 4 + 2] = r();
    data[i * 4 + 3] = r();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(data, 4));
  geo.instanceCount = layer.count;
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
      size: { value: new THREE.Vector2(...layer.size) },
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
  return { mesh, geo, mat, plane };
}

// source: the sRGB scene, mip-mapped by the caller's prep step. render(target) paints into target.
export function createBrushStrokes(renderer, prepTexture) {
  const shared = {
    tRef: { value: prepTexture },
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
    const part = layerMesh(l, 101 + i * 37, shared, atlas);
    part.mesh.renderOrder = i + 1;
    scene.add(part.mesh);
    return part;
  });
  return {
    scene,
    setSize(w, h) {
      shared.aspect.value = w / h;
      shared.lodShift.value = Math.log2(Math.max(1, h) / 720);
    },
    setPan(x, y) { shared.pan.value.set(x, y); },
    dispose() {
      atlas.dispose();
      under.dispose();
      underQuad.geometry.dispose();
      for (const p of layers) { p.mat.dispose(); p.geo.dispose(); p.plane.dispose(); }
    },
  };
}
