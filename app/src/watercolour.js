// Screen pass that turns the rendered scene into a watercolour painting:
// wobbling edges, colour bleed, darker wet edges, pigment granulating in the paper tooth,
// a high-key paper tint and an unpainted ragged border.
import * as THREE from 'three';
import { paperTexture } from './paint.js';

const BOIL_FPS = 8; // edges re-wobble at a hand-drawn frame rate instead of every frame

// How far the scene is pushed from "render" toward "painting". ?wc=0 is the old single pass (grain,
// small blur); higher levels first flatten the image into washes (Kuwahara filter, half resolution)
// and then let neighbouring washes run, in patches, into each other along a wandering flow (bleed).
//   radius: Kuwahara radius in pixels (bigger = flatter, bigger washes)
//   bleed:  how far colour runs, pixels; bleedMix: how strongly, in the patches where it runs
//   bloom:  strength of backruns (pale blooms with a dark rim where wet paint pushed back)
const LEVELS = [
  null,
  { radius: 3, bleed: 7, bleedMix: 0.55, bloom: 0.5, edge: 0.9, lift: 0.09 },
  { radius: 4, bleed: 12, bleedMix: 0.75, bloom: 0.8, edge: 0.8, lift: 0.12 },
  { radius: 6, bleed: 20, bleedMix: 0.9, bloom: 1.0, edge: 0.7, lift: 0.15 },
];
const DEFAULT_LEVEL = 2;
function levelFromUrl() {
  const v = Number(new URLSearchParams(globalThis.location?.search ?? '').get('wc'));
  return Number.isInteger(v) && v >= 0 && v < LEVELS.length ? v : DEFAULT_LEVEL;
}

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

// Pass 1: smoothed Kuwahara. Each pixel takes the mean of whichever quarter of its
// neighbourhood is most even, so gradients and fine 3D shading collapse into flat washes while the
// boundaries between them stay put. Quarters are blended by evenness (not picked) to avoid blocks.
const washShader = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 texel;   // full-res texel
varying vec2 vUv;
${NOISE}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 at(vec2 uv) { return toSRGB(clamp(texture2D(tScene, uv).rgb, 0.0, 1.0)); }
void main() {
  vec3 m[4]; vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  float n = float((RADIUS + 1) * (RADIUS + 1));
  for (int j = 0; j <= RADIUS; j++) {
    for (int i = 0; i <= RADIUS; i++) {
      vec2 o = vec2(float(i), float(j)) * texel;
      vec3 a = at(vUv + vec2(-o.x, -o.y)); m[0] += a; s[0] += a * a;
      vec3 b = at(vUv + vec2( o.x, -o.y)); m[1] += b; s[1] += b * b;
      vec3 c = at(vUv + vec2(-o.x,  o.y)); m[2] += c; s[2] += c * c;
      vec3 d = at(vUv + vec2( o.x,  o.y)); m[3] += d; s[3] += d * d;
    }
  }
  vec3 col = vec3(0.0); float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    vec3 mean = m[k] / n;
    vec3 v = abs(s[k] / n - mean * mean);
    float sd = sqrt(v.r + v.g + v.b);
    float w = 1.0 / (1e-5 + pow(sd * 12.0, 6.0));
    col += mean * w; wsum += w;
  }
  gl_FragColor = vec4(col / wsum, texture2D(tScene, vUv).a);
}
`;

// Pass 2: bleed. Only in patches (a noise mask), so some shapes stay crisp and others run. Colour is smeared along a slowly wandering flow field that is glued to
// the paper (so it does not swim over the scene), over a distance that itself varies, and darker,
// denser pigment carries further into light areas than the other way round, like wet-in-wet.
const bleedShader = /* glsl */ `
uniform sampler2D tWash;
uniform vec2 texel;
uniform vec2 paperOffset;
uniform float seed;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 pq = gl_FragCoord.xy / 512.0 + paperOffset;
  float ang = fbm(pq * 1.1) * 12.566 + (fbm(pq * 3.0 + seed * 0.02) - 0.5) * 0.6;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 side = vec2(-dir.y, dir.x);
  float len = BLEED * mix(0.3, 1.0, smoothstep(0.25, 0.75, fbm(pq * 2.3 + 5.0)));
  vec4 c0 = texture2D(tWash, vUv);
  float l0 = lum(c0.rgb);
  vec3 acc = c0.rgb; float wsum = 1.0;
  float jit = hash(gl_FragCoord.xy + seed) - 0.5;
  for (int i = 1; i <= 6; i++) {
    float t = (float(i) + jit * 0.8) / 6.0;
    float g = exp(-t * t * 2.2);
    for (int sgn = -1; sgn <= 1; sgn += 2) {
      vec2 o = (dir * t * float(sgn) + side * jit * 0.25) * len * texel;
      vec3 c = texture2D(tWash, vUv + o).rgb;
      // dark into light: a darker neighbour gets more say
      float w = g * clamp(1.0 + 2.5 * (l0 - lum(c)), 0.25, 2.5);
      acc += c * w; wsum += w;
    }
  }
  float runs = smoothstep(0.34, 0.62, fbm(pq * 0.9 + 41.0));
  gl_FragColor = vec4(mix(c0.rgb, acc / wsum, runs * BLEED_MIX), c0.a);
}
`;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tPaper;
uniform vec2 resolution;
uniform vec2 paperOffset;
uniform float seed;
uniform float near;
uniform float far;
uniform sampler2D tWash;   // the bled washes, only with WASH
uniform float bloomAmt;
uniform float edgeAmt;
uniform float lift;       // how far every wash is thinned toward the paper
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }

vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 sceneAt(vec2 uv) { return toSRGB(clamp(texture2D(tScene, uv).rgb, 0.0, 1.0)); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float depthAt(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

void main() {
  vec2 px = 1.0 / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 q = vUv * vec2(aspect, 1.0);

  // 1. hand wobble: displace where we read the scene with slow noise that boils at BOIL_FPS
  vec2 wob = vec2(fbm(q * 7.0 + seed), fbm(q * 7.0 + seed + 31.7)) - 0.5;
  vec2 uv = vUv + wob * px * 5.0;

#ifdef WASH
  // 2. the bled washes from the wash passes; depth jumps (silhouettes) add a broken drawn line
  // under the wash, the way a painter keeps the pencil sketch.
  vec3 sharp = texture2D(tWash, uv).rgb;
  vec3 soft = sharp;
  float j = hash(gl_FragCoord.xy + seed) * 6.2831;
  for (int i = 0; i < 8; i++) {
    float a = j + float(i) * 0.7854;
    soft += texture2D(tWash, uv + vec2(cos(a), sin(a)) * px * 3.0).rgb;
  }
  soft /= 9.0;
  vec3 col = mix(sharp, soft, 0.2);

  // 3. hard wash edges: where one wash meets another, pigment dries darker at the rim
  float lx = lum(texture2D(tWash, uv + vec2(px.x * 2.0, 0.0)).rgb) - lum(texture2D(tWash, uv - vec2(px.x * 2.0, 0.0)).rgb);
  float ly = lum(texture2D(tWash, uv + vec2(0.0, px.y * 2.0)).rgb) - lum(texture2D(tWash, uv - vec2(0.0, px.y * 2.0)).rgb);
  float cEdge = smoothstep(0.03, 0.16, length(vec2(lx, ly)));
  float d = depthAt(uv);
  float dx = depthAt(uv + vec2(px.x * 1.5, 0.0)) - depthAt(uv - vec2(px.x * 1.5, 0.0));
  float dy = depthAt(uv + vec2(0.0, px.y * 1.5)) - depthAt(uv - vec2(0.0, px.y * 1.5));
  float dEdge = smoothstep(0.08, 0.3, length(vec2(dx, dy)) / max(d, 0.5));
  // (a soft deepening of the same hue, not an outline: watercolour has no ink line)
  float edge = max(cEdge * 0.7, dEdge * 0.6) * (0.4 + 0.6 * fbm(q * 30.0 + seed)) * edgeAmt;
  float pool = smoothstep(0.03, 0.12, length(soft - sharp));
  float wet = clamp(max(edge, pool * 0.6), 0.0, 1.0);
  col = mix(col, col * col * 0.92, wet * 0.55);

  // backruns: pale blooms with a cauliflower dark rim, glued to the paper
  vec2 pq = gl_FragCoord.xy / 512.0 + paperOffset;
  float bm = fbm(pq * 0.7 + 17.0) + (noise(pq * 11.0) - 0.5) * 0.05;
  float inside = smoothstep(0.66, 0.69, bm);
  float rim = inside - smoothstep(0.69, 0.72, bm);
  col = mix(col, col * 0.8 + 0.2 * vec3(0.985, 0.965, 0.93), inside * 0.3 * bloomAmt);
  col = mix(col, col * 0.85, rim * 0.35 * bloomAmt);
#else
  // 2. colour bleed: soft ring of taps, jittered so the blur reads as wet spreading, not a lens blur
  vec3 sharp = sceneAt(uv);
  vec3 soft = sharp;
  float j = hash(gl_FragCoord.xy + seed) * 6.2831;
  for (int i = 0; i < 8; i++) {
    float a = j + float(i) * 0.7854;
    soft += sceneAt(uv + vec2(cos(a), sin(a)) * px * 2.6);
  }
  soft /= 9.0;
  vec3 col = mix(sharp, soft, 0.45);

  // 3. edges, from colour and depth (Sobel-ish cross)
  float lx = lum(sceneAt(uv + vec2(px.x * 1.5, 0.0))) - lum(sceneAt(uv - vec2(px.x * 1.5, 0.0)));
  float ly = lum(sceneAt(uv + vec2(0.0, px.y * 1.5))) - lum(sceneAt(uv - vec2(0.0, px.y * 1.5)));
  float cEdge = smoothstep(0.04, 0.22, length(vec2(lx, ly)));
  float d = depthAt(uv);
  float dx = depthAt(uv + vec2(px.x * 1.5, 0.0)) - depthAt(uv - vec2(px.x * 1.5, 0.0));
  float dy = depthAt(uv + vec2(0.0, px.y * 1.5)) - depthAt(uv - vec2(0.0, px.y * 1.5));
  float dEdge = smoothstep(0.05, 0.25, length(vec2(dx, dy)) / max(d, 0.5));
  // break the line up so it reads as pigment pooling, not an ink outline
  float edge = max(cEdge, dEdge) * (0.55 + 0.45 * fbm(q * 40.0 + seed));

  // wet edge: pigment collects at the boundary of a wash -> same hue, deeper.
  // (soft - sharp) is large just inside a colour boundary, which is where the pooling shows.
  float pool = smoothstep(0.035, 0.14, length(soft - sharp));
  float wet = clamp(max(edge * 0.8, pool), 0.0, 1.0);
  col = mix(col, col * col * 0.9, wet * 0.7);

#endif

  // darks are glazes, not black: lift them and lean them cool (violet-brown)
  float dark = 1.0 - smoothstep(0.08, 0.45, lum(col));
  col = mix(col, col * 0.75 + vec3(0.17, 0.13, 0.18), dark * 0.75);

  // 4. paper: granulation settles in the valleys, more so for denser (darker) pigment
  vec2 paperUv = (gl_FragCoord.xy / 512.0) + paperOffset;
  float h = texture2D(tPaper, paperUv).r;
  h = smoothstep(0.35, 0.95, h);
  float density = 1.0 - lum(col);
#ifdef WASH
  col *= 1.0 - (1.0 - h) * (0.18 + 0.55 * density);
#else
  col *= 1.0 - (1.0 - h) * (0.12 + 0.4 * density);
#endif

  // 5. watercolour is transparent: lift toward the paper and calm the saturation a touch
  vec3 paper = vec3(0.985, 0.965, 0.93);
  col = mix(col, paper, lift);
#ifdef WASH
  // highlights are the bare paper left unpainted
  col = mix(col, paper, smoothstep(0.72, 0.95, lum(col)) * 0.6);
#endif
  col = mix(vec3(lum(col)), col, 1.08);

  // low-frequency blooms (uneven wash density) in screen space, very gentle
  col *= mix(0.95, 1.04, fbm(q * 2.2 + 3.0));

  // crisp things (album art, labels) wrote alpha 0: show them as rendered, barely touched by paper
  float crisp = clamp(1.0 - texture2D(tScene, vUv).a, 0.0, 1.0);
  vec3 clean = sceneAt(vUv);
  clean *= 0.97 + 0.03 * h;
  col = mix(col, clean, crisp);

  // 6. unpainted ragged border, like a painting that stops short of the sheet edge
  vec2 e = min(vUv, 1.0 - vUv) * vec2(aspect, 1.0);
  float border = min(e.x, e.y) + (fbm(q * 9.0 + seed * 0.3) - 0.5) * 0.05;
#ifdef CARD
  border -= 0.05; // a wider paper margin: the sheet itself is the card
#endif
  float paint = smoothstep(0.0, 0.045, border);
  vec3 paperShade = paper * (0.94 + 0.06 * h);
  col = mix(paperShade, col, paint);

#ifdef CARD
  // The sheet is a torn card with a deckle edge; beyond it the window is transparent (premultiplied).
  float sheet = min(e.x, e.y) + (fbm(q * 13.0 + 5.0) - 0.5) * 0.04 + (noise(q * 75.0) - 0.5) * 0.008 - 0.02;
  float a = smoothstep(0.0, 0.006, sheet);
  gl_FragColor = vec4(col * a, a);
#else
  gl_FragColor = vec4(col, 1.0);
#endif
}
`;

// Draws `overlay` ({ scene, camera }) on top of what is already in the target, with the depth
// cleared so it never clips into the world (a camera-space HUD that is still painted).
export function renderOverlay(renderer, overlay) {
  if (!overlay) return;
  const auto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(overlay.scene, overlay.camera);
  renderer.autoClear = auto;
}

// { card: true } turns the unpainted border into a deckle-edged card and makes everything beyond it
// transparent (for the small frameless window; the renderer needs alpha: true).
export function createWatercolour(renderer, { card = false, level = levelFromUrl() } = {}) {
  const L = LEVELS[level];
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: { ...(card ? { CARD: '' } : {}), ...(L ? { WASH: '' } : {}) },
    uniforms: {
      tScene: { value: target.texture },
      tDepth: { value: target.depthTexture },
      tPaper: { value: paperTexture() },
      resolution: { value: size.clone() },
      paperOffset: { value: new THREE.Vector2() },
      seed: { value: 0 },
      near: { value: 0.1 },
      far: { value: 100 },
      tWash: { value: null },
      bloomAmt: { value: L?.bloom ?? 0 },
      edgeAmt: { value: L?.edge ?? 1 },
      lift: { value: L?.lift ?? 0.07 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const dir = new THREE.Vector3();

  // wash + bleed passes (level > 0)
  let wash = null;
  if (L) {
    const full = () => new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    const washT = full(), bleedT = full();
    const pass = (fragmentShader, defines, uniforms) => {
      const m = new THREE.ShaderMaterial({ vertexShader, fragmentShader, defines, uniforms, depthTest: false, depthWrite: false });
      const sc = new THREE.Scene();
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      q.frustumCulled = false;
      sc.add(q);
      return { m, sc };
    };
    const washP = pass(washShader, { RADIUS: L.radius }, { tScene: { value: target.texture }, texel: { value: new THREE.Vector2() } });
    const bleedP = pass(bleedShader, { BLEED: L.bleed.toFixed(1), BLEED_MIX: L.bleedMix.toFixed(2) }, {
      tWash: { value: washT.texture }, texel: { value: new THREE.Vector2() },
      paperOffset: material.uniforms.paperOffset, seed: material.uniforms.seed,
    });
    material.uniforms.tWash.value = bleedT.texture;
    wash = {
      render() {
        renderer.setRenderTarget(washT); renderer.render(washP.sc, postCam);
        renderer.setRenderTarget(bleedT); renderer.render(bleedP.sc, postCam);
      },
      setSize(s) {
        washT.setSize(s.x, s.y);
        bleedT.setSize(s.x, s.y);
        washP.m.uniforms.texel.value.set(1 / s.x, 1 / s.y);
        bleedP.m.uniforms.texel.value.set(1 / s.x, 1 / s.y);
      },
    };
    wash.setSize(size);
  }

  return {
    // overlay = { scene, camera }: drawn into the same target after the world, depth cleared, so it is
    // painted by the same pass but never hidden by (or clipped into) the walls.
    render(scene, camera, t, overlay) {
      const u = material.uniforms;
      u.seed.value = (Math.floor(t * BOIL_FPS) % 64) * 1.37;
      u.near.value = camera.near;
      u.far.value = camera.far;
      // Pan the paper with the camera's turn so cursor tilt moves scene and sheet together
      // (a grain glued to the screen would look like a filter on glass).
      camera.getWorldDirection(dir);
      const yaw = Math.atan2(dir.x, -dir.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      const fovY = THREE.MathUtils.degToRad(camera.fov);
      const pxPerRad = u.resolution.value.y / fovY;
      u.paperOffset.value.set((-yaw * pxPerRad) / 512, (pitch * pxPerRad) / 512);

      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderOverlay(renderer, overlay);
      wash?.render();
      renderer.setRenderTarget(null);
      renderer.render(post, postCam);
    },
    setSize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      target.setSize(s.x, s.y);
      material.uniforms.resolution.value.copy(s);
      wash?.setSize(s);
    },
  };
}
