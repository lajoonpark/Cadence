// The in-shop player: the suitcase drawn small in the bottom-left corner of the shop view, in an
// overlay scene that lives in camera space and is drawn after the world with the depth cleared
// (so it never clips into walls) but through the same watercolour pass (so it is painted like
// the rest). Beside it, the paper caption (title, artist, a progress line to click) and, when
// needed, the SIGN IN word. It listens to the player state, the pointer and the wheel by itself.
//
//   const player = createPlayer({ renderer, painter, music, camera })
//   player.overlay                 { scene, camera }: pass to painter.render(scene, camera, t, player.overlay)
//   player.update(dt, t)           every frame, before rendering
//   player.show(on, instant)       fades the caption in and flicks the lid open the first time
//   player.receive(disc)           a record was picked: { matrixWorld, cover } (see racks/)
//   player.over                    true while the pointer is over the case (keep racks from hovering through it)
//   player.avoidRect()             the case and its caption as a box on screen in CSS px, for the section menu to keep clear of
import * as THREE from 'three';
import { createSuitcase } from '../suitcase.js';
import { createCaption } from '../controls.js';
import { renderOverlay } from '../watercolour.js';
import { fitObject, ndcBounds } from './fit.js';
import { createFlights } from './flight.js';

// The case sits in the bottom-left corner, upright: the same three-quarter view as the small window
// (the deck seen from about 40 degrees up, the front edge level), with a small turn in toward the
// middle. The case is off to one side of the camera, so perspective already shows it from the right;
// PITCH only has to tip it to the mini's elevation, and no roll is added. Its width follows the view
// (about a quarter of it, clamped), and its top stays at or below half the view's height.
const YAW = 0.12;      // a small inward turn: the front edge tilts about 4 degrees
const PITCH = 0.5;     // tips the deck towards the viewer; with the off-axis view this is a ~40 degree elevation
const WIDTH = { share: 0.235, min: 260, max: 420 };
const TOP_LIMIT = 0.5;
const GAP = 14;        // between the case and its caption

export function createPlayer({ renderer, painter, music, camera }) {
  const scene = new THREE.Scene();
  const ocam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
  const overlay = { scene, camera: ocam, render: (r = renderer) => renderOverlay(r, overlay) };

  const suitcase = createSuitcase({ music, ground: 'paper', big: true });   // bigger controls: the case is small
  const place = new THREE.Group();               // puts the case in camera space
  place.rotation.set(PITCH, YAW, 0, 'XYZ');   // swivel about the case's own upright, then tip it towards the viewer
  place.add(suitcase.root);
  scene.add(place);
  const flights = createFlights({ scene, suitcase, camera, view: ocam });
  const points = suitcase.fitPoints();

  const caption = createCaption({ variant: 'shop', onSeek: (s) => music.command('seek', s), onSignIn: () => music.signIn() });

  let shown = false, opened = false;
  place.visible = false;
  suitcase.close({ instant: true });

  // ---- where it goes: lower-left, width from the view, top below TOP_LIMIT of the height ----
  let aspect = 0, fov = 0, viewH = 0;
  let box = { x0: -1, x1: -0.6, y0: -0.9, y1: -0.4 };     // the case's wanted box, NDC
  let caseRect = null;                                     // where it ended up, CSS px
  const centre = new THREE.Vector2();
  function layout() {
    const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight;
    ocam.fov = camera.fov; ocam.aspect = camera.aspect; ocam.near = camera.near; ocam.far = camera.far;
    ocam.updateProjectionMatrix();
    const margin = 0.055 * H + 4;                          // the painter leaves a ragged paper border round the picture
    const wpx = Math.min(WIDTH.max, Math.max(WIDTH.min, WIDTH.share * W));
    const hpx = Math.max(120, (1 - TOP_LIMIT) * H - margin);
    box = { x0: -1 + (2 * margin) / W, x1: -1 + (2 * (margin + wpx)) / W, y0: -1 + (2 * margin) / H, y1: -1 + (2 * (margin + hpx)) / H };
    fitObject({ object: place, points, camera: ocam, rect: box });
    centre.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    aspect = camera.aspect; fov = camera.fov; viewH = H;
    const b = ndcBounds(points, place, ocam);
    caseRect = {
      left: ((b.x0 + 1) / 2) * W, right: ((b.x1 + 1) / 2) * W,
      top: ((1 - b.y1) / 2) * H, bottom: ((1 - b.y0) / 2) * H,
    };
    // the caption sits just right of the case, its bottom edge level with the case's
    caption.dock({ left: caseRect.right + GAP, bottom: H - caseRect.bottom, maxWidth: Math.min(440, W - caseRect.right - GAP - margin) });
  }
  layout();

  music.onState((s) => {
    suitcase.setState(s);
    caption.setState(s, { real: music.real });
  });

  // ---- pointer: window-level and in the capture phase, so a press on the case never reaches the racks ----
  const ndc = new THREE.Vector2();
  let pointer = null;        // last pointer position in NDC
  let over = false;
  let swallowClick = false;
  const onCanvas = (e) => e.target === renderer.domElement;
  const toNdc = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    return ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  const cursor = () => { if (onCanvasLast) renderer.domElement.style.cursor = suitcase.cursor(); };
  let onCanvasLast = false;
  addEventListener('pointermove', (e) => {
    onCanvasLast = onCanvas(e) || suitcase.dragging;
    pointer = toNdc(e).clone();
    if (!shown) return;
    if (suitcase.dragging) { suitcase.pointerDrag(ndc, ocam); cursor(); return; }
    if (!onCanvasLast) { suitcase.hover(null); over = false; return; }
    over = suitcase.hover(ndc, ocam).over;
    cursor();
  }, true);
  addEventListener('pointerdown', (e) => {
    swallowClick = false;      // a drag that ended elsewhere never produced a click
    if (!shown || !onCanvas(e)) return;
    if (suitcase.pointerDown(toNdc(e), ocam)) { swallowClick = true; e.stopPropagation(); }
    cursor();
  }, true);
  addEventListener('pointerup', () => { suitcase.pointerUp(); cursor(); }, true);
  addEventListener('pointercancel', () => suitcase.pointerUp(), true);
  addEventListener('blur', () => suitcase.pointerUp());   // released outside the window: do not leave a drag stuck
  addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); } }, true);
  document.addEventListener('pointerleave', () => { pointer = null; over = false; suitcase.hover(null); });
  // scroll over the case = volume (the shop's own scroll-for-volume keeps working elsewhere)
  addEventListener('wheel', (e) => {
    if (!shown || !over || !onCanvas(e)) return;
    suitcase.wheel(e.deltaY, e.deltaMode);
    e.stopPropagation();
  }, { capture: true, passive: true });

  let lastWall = performance.now();
  function update(dt, t) {
    // wall-clock step: a slow frame must not stretch a flight (the record would hang in mid-air under software rendering)
    const now = performance.now();
    dt = Math.min(1, Math.max(dt, (now - lastWall) / 1000));
    lastWall = now;
    if (camera.aspect !== aspect || camera.fov !== fov || (renderer.domElement.clientHeight || innerHeight) !== viewH) layout();
    if (pointer) {
      // lean toward the cursor, relative to where the case sits (the whole screen is its range)
      suitcase.lean((pointer.x - centre.x) / 1.6, -(pointer.y - centre.y) / 1.3);
      caption.tilt(pointer.x, -pointer.y);
    }
    suitcase.update(dt);
    flights.update(dt);
    caption.setScrub(suitcase.scrubbing ? suitcase.progress : null);
  }

  return {
    overlay,
    suitcase,
    update,
    receive: (disc) => flights.receive(disc),
    // The caption and case appear together; the lid flicks open the first time (instant for screenshots).
    show(on, instant = false) {
      shown = on;
      place.visible = on;
      caption.show(on, instant);
      if (on && !opened) { opened = true; suitcase.open({ instant }); }
    },
    // The room the player takes on screen, in CSS px (a DOMRect-like box): the case and its caption, for
    // the section menu to keep clear of.
    avoidRect() {
      const c = caption.rect();
      const left = caseRect.left, bottom = caseRect.bottom;
      const right = Math.max(caseRect.right, c?.right ?? 0), top = Math.min(caseRect.top, c?.top ?? Infinity);
      return { left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top };
    },
    get over() { return over || suitcase.dragging; },
    get flying() { return flights.active; },
    flightDuration: flights.duration,
    freezeFlight: (p) => flights.freezeAt(p),
    flights,
    ready: () => Promise.all([suitcase.ready(), caption.ready()]),
  };
}
