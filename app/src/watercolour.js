// Screen pass that turns the rendered scene into a watercolour painting:
// wobbling edges, colour bleed, darker wet edges, pigment granulating in the paper tooth,
// a high-key paper tint and an unpainted ragged border.
import * as THREE from 'three';
import { paperTexture } from './paint.js';

const BOIL_FPS = 8; // edges re-wobble at a hand-drawn frame rate instead of every frame

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

  // darks are glazes, not black: lift them and lean them cool (violet-brown)
  float dark = 1.0 - smoothstep(0.08, 0.45, lum(col));
  col = mix(col, col * 0.75 + vec3(0.17, 0.13, 0.18), dark * 0.75);

  // 4. paper: granulation settles in the valleys, more so for denser (darker) pigment
  vec2 paperUv = (gl_FragCoord.xy / 512.0) + paperOffset;
  float h = texture2D(tPaper, paperUv).r;
  h = smoothstep(0.35, 0.95, h);
  float density = 1.0 - lum(col);
  col *= 1.0 - (1.0 - h) * (0.12 + 0.4 * density);

  // 5. watercolour is transparent: lift toward the paper and calm the saturation a touch
  vec3 paper = vec3(0.985, 0.965, 0.93);
  col = mix(col, paper, 0.07);
  col = mix(vec3(lum(col)), col, 1.08);

  // low-frequency blooms (uneven wash density) in screen space, very gentle
  col *= mix(0.95, 1.04, fbm(q * 2.2 + 3.0));

  // 6. unpainted ragged border, like a painting that stops short of the sheet edge
  vec2 e = min(vUv, 1.0 - vUv) * vec2(aspect, 1.0);
  float border = min(e.x, e.y) + (fbm(q * 9.0 + seed * 0.3) - 0.5) * 0.05;
  float paint = smoothstep(0.0, 0.045, border);
  vec3 paperShade = paper * (0.94 + 0.06 * h);
  col = mix(paperShade, col, paint);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWatercolour(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tScene: { value: target.texture },
      tDepth: { value: target.depthTexture },
      tPaper: { value: paperTexture() },
      resolution: { value: size.clone() },
      paperOffset: { value: new THREE.Vector2() },
      seed: { value: 0 },
      near: { value: 0.1 },
      far: { value: 100 },
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

  return {
    render(scene, camera, t) {
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
      renderer.setRenderTarget(null);
      renderer.render(post, postCam);
    },
    setSize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      target.setSize(s.x, s.y);
      material.uniforms.resolution.value.copy(s);
    },
  };
}
