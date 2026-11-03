import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildShop } from './shop.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour, renderOverlay } from './watercolour.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';
import { createRack } from './racks/index.js';
import { setScreenAvoid } from './racks/common.js';
import { STATIONS, HOME, assignShelves } from './stations.js';
import { createNav, AT_HOME } from './nav.js';
import { createMenu } from './menu.js';
import { createSearch } from './search.js';
import { createSettingsPanel } from './settings-panel.js';
import { createMusic } from './music.js';
import { createPlayer } from './suitcase/player.js';
import '@fontsource/caveat-brush';

const params = new URLSearchParams(location.search);
const shotMode = params.has('shot');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: shotMode });
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
const shop = buildShop();
scene.add(shop);
// furniture that a station's rack replaces: shown until a rack stands there
const furniture = shop.userData.stationFurniture ?? {};
const timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });
// The plant room's skylight beam is a see-through open cylinder (shop.js). From inside it washes the
// whole frame in pale planes (and veils the spinner), so it is gone whenever the camera is inside the plant
// room or within ~2.5 m of its axis, and fades back in as you leave.
let skylightBeam = null;
shop.traverse((o) => {
  if (!skylightBeam && o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.material?.transparent
    && o.material.side === THREE.DoubleSide && Math.abs(o.material.opacity - 0.12) < 1e-3) skylightBeam = o;
});
const beamOpacity = skylightBeam?.material.opacity ?? 0;

// ---- where the camera is: intro -> home -> station (nav.js) ----
// ?at=home / ?at=N start settled there with no intro; ?fly=from,to,p freezes a flight at fraction p.
const stationArg = (s) => (s === 'home' ? AT_HOME : Number.isInteger(Number(s)) && Number(s) >= 0 && Number(s) < STATIONS.length ? Number(s) : null);
const flyArg = params.get('fly')?.split(',');
const flySpec = flyArg && flyArg.length === 3 && stationArg(flyArg[0]) !== null && stationArg(flyArg[1]) !== null
  ? { from: stationArg(flyArg[0]), to: stationArg(flyArg[1]), p: Number(flyArg[2]) } : null;
const startAt = flySpec ? flySpec.from : params.has('at') ? stationArg(params.get('at')) : null;
const nav = createNav({ home: HOME, stations: STATIONS, startAt });
if (flySpec) nav.freeze(flySpec.from, flySpec.to, flySpec.p);
const pinned = params.get('cam')?.split(',').map(Number); // ?cam=x,y,z,tx,ty,tz pins the camera
let curT = 0;

// ---- music: the racks, the section menus, the buttons and YouTube Music (or the fake store) ----
const music = createMusic();
let player = {};
let playingId = null;
const racks = STATIONS.map(() => null); // created when a station first gets a shelf
const placed = new Map();               // station index -> { key, title }: what each rack shows
const hoverArg = params.has('hover') ? Number(params.get('hover')) : null;

function pick(item, index, disc) {
  music.play(item);
  // the vinyl flies from the sleeve to the suitcase's platter: disc = { matrixWorld, cover }
  void index;
  if (disc) suitcase.receive(disc);
}

function ensureRack(i) {
  if (racks[i]) return racks[i];
  const st = STATIONS[i];
  const rack = createRack(st.style, { onPick: pick });
  rack.root.position.copy(st.pos);
  rack.root.rotation.y = st.rotY;
  rack.setPlaying(playingId);
  scene.add(rack.root);
  racks[i] = rack;
  return rack;
}

// the suitcase record player in the bottom-left corner (drawn in an overlay pass, subscribes to the player state itself)
const suitcase = createPlayer({ renderer, painter, music, camera });
// a hovered record never floats up underneath the suitcase or its caption
setScreenAvoid(() => suitcase.avoidRect());
const menu = createMenu({
  onGo: (i) => nav.go(i),
  onHome: () => nav.go(AT_HOME),
  // the suitcase and its caption sit bottom-left; the left menu stays above them
  getAvoid: () => suitcase.avoidRect(),
});
nav.onChange(() => menu.setCurrent(nav.at));
menu.setCurrent(nav.at);
// the search bar (Option+Cmd+S / Ctrl+Alt+S) must exist before the key handlers below are registered
const search = createSearch({ music, onPlay: (item) => music.play(item) }); // (search picks play without the flying vinyl)
// Settings (Cmd+, or the SETTINGS word): swallows keys itself while open
const settingsPanel = createSettingsPanel();
// covers that were repaired in the background: let the racks reload them
music.onArt?.((item) => racks.forEach((r) => r?.refreshArt?.(item)));
music.onState((s) => {
  player = s;
  playingId = s.adPlaying ? null : s.videoId;
  racks.forEach((r) => r?.setPlaying(playingId));
});

// Which shelf is on which rack. Shelves arrive in pages: later pages only fill racks that are still
// empty and never move a shelf that is already out, so nothing flickers or reshuffles. A rack is
// only repainted when its shelf really changed (same title and records = left alone).
const shelfKey = (sh) => `${sh.title}\n${sh.items.length}\n${sh.items.slice(0, 4).map((i) => i.play?.videoId ?? i.play?.playlistId ?? i.title).join(',')}`;
let shelves = [];
let shelvesLoaded = false;

function fill(i, shelf) {
  const key = shelfKey(shelf);
  if (placed.get(i)?.key === key) return;
  const rack = ensureRack(i);
  rack.setShelf(shelf);
  rack.root.visible = true;
  placed.set(i, { key, title: shelf.title });
  if (furniture[STATIONS[i].id]) furniture[STATIONS[i].id].visible = false;
}
function clearStation(i) {
  if (racks[i]) racks[i].root.visible = false;
  if (furniture[STATIONS[i].id]) furniture[STATIONS[i].id].visible = true;
  placed.delete(i);
}
function placeShelves(all, { first = false, prune = false } = {}) {
  const want = new Map(assignShelves(all).map((a) => [a.index, a.shelf]));
  if (first) {
    for (const [i, shelf] of want) fill(i, shelf);
  } else {
    const shown = new Set([...placed.values()].map((p) => p.key));
    const leftovers = [];
    for (const [i, shelf] of want) {
      if (shown.has(shelfKey(shelf))) continue;
      if (!placed.has(i)) fill(i, shelf); else leftovers.push(shelf);
    }
    for (const shelf of leftovers) {
      const free = STATIONS.findIndex((_, k) => !placed.has(k));
      if (free >= 0) fill(free, shelf);
    }
  }
  if (prune) {
    const keys = new Set(all.map(shelfKey));
    for (const [i, p] of [...placed]) if (!keys.has(p.key)) clearStation(i);
  }
  const sections = [...placed.keys()].sort((a, b) => a - b);
  nav.setSections(sections);
  menu.setSections(sections.map((i) => ({ index: i, title: placed.get(i).title })));
  menu.setCurrent(nav.at);
  // standing at a station whose shelf went away: back to the entrance
  if (prune && nav.at !== AT_HOME && !placed.has(nav.at) && !params.has('at') && !flySpec) nav.go(AT_HOME);
}

// ?shelves=8 (fake store only): pad the shelf list with copies under other titles, to try all 8 stations
const EXTRA_TITLES = ['Your library', 'Similar to Lemon Hours', 'Anything else'];
function padShelves(list) {
  const want = Number(params.get('shelves')) || 0;
  if (music.real || want <= list.length) return list;
  const out = list.slice();
  for (let k = 0; out.length < want && k < EXTRA_TITLES.length; k++) {
    const src = list[(k + 1) % list.length];
    out.push({ title: EXTRA_TITLES[k], items: src.items.slice().reverse().slice(0, 12 + k * 3) });
  }
  return out;
}

// Station preferences must win ("Quick picks" belongs on the crate table), so the shelves are placed
// ONCE, when every page is in, or when the camera first reaches home (the racks are not visible
// before that), or straight away when a ?at shot starts: whichever comes first. Anything that
// arrives after that only fills empty stations (no reshuffling).
const SHELF_PAGES = 3;
let everPlaced = false;       // the very first placement has happened
let placedThisLoad = false;   // this load has been placed (later pages then only fill free stations)
function placeFirst() {
  if (everPlaced || !shelves.length) return;
  placeShelves(padShelves(shelves), { first: true });
  everPlaced = placedThisLoad = true;
}
async function loadShelves() {
  placedThisLoad = false;
  try {
    let page = await music.shelves();
    shelves = page.shelves.slice();
    if (!everPlaced && startAt !== null) placeFirst(); // ?at shot: no intro to wait for
    for (let i = 1; i < SHELF_PAGES && page.next; i++) {
      page = await music.shelves(page.next);
      shelves.push(...page.shelves);
      if (placedThisLoad) placeShelves(padShelves(shelves));
    }
  } catch (e) {
    console.warn('could not load shelves', e);
  } finally {
    // everything is in (or the load failed part-way): place now unless the camera got home first
    if (shelves.length) {
      placeShelves(padShelves(shelves), { first: !placedThisLoad, prune: true });
      everPlaced = placedThisLoad = true;
    }
    shelvesLoaded = true;
  }
}
loadShelves();
music.onSignedIn(loadShelves);

// for tests and the devtools console
window.__cadenceDebug = {
  get shelves() { return shelves; },
  get player() { return player; },
  get rack() { return racks[nav.at >= 0 ? nav.at : 0] ?? racks.find(Boolean); }, // the rack you are at
  racks,
  music,
  nav,
  menu,
  search,
  suitcase,
  get stations() { return STATIONS.map((s, i) => ({ index: i, id: s.id, style: s.style, shelf: placed.get(i)?.title ?? null })); },
  get state() { return { phase: nav.phase, at: nav.at, settled: nav.settled, flying: nav.flying, progress: nav.progress, introDone: nav.introDone, sections: nav.sections }; },
  go: (i) => nav.go(i),
  home: () => nav.go(AT_HOME),
  jump: (i) => nav.jump(i),
};

// ---- cursor tilt ----
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let pointer = null; // normalised device coords, for picking records
let cursorX01 = null; // 0..1 across the window, for the side menus
addEventListener('pointermove', (e) => {
  cursorX01 = e.clientX / innerWidth;
  tilt.tx = (e.clientX / innerWidth) * 2 - 1;
  tilt.ty = (e.clientY / innerHeight) * 2 - 1;
  // words and buttons drawn over the picture do not pick records through them
  pointer = e.target === renderer.domElement ? new THREE.Vector2(tilt.tx, -tilt.ty) : null;
});
document.addEventListener('pointerleave', () => { pointer = null; cursorX01 = null; });
const currentRack = () => (nav.settled && nav.at !== AT_HOME ? racks[nav.at] : null);
// any click during the intro skips to home
addEventListener('pointerdown', () => { if (nav.intro) nav.skipIntro(curT); });
renderer.domElement.addEventListener('click', () => { if (!nav.intro) currentRack()?.click(); });

// ---- keys ----
// Space play/pause, arrows back/skip and volume, L like, Tab / Shift+Tab next / previous section,
// Esc home. Scroll = volume. Nothing fires while typing (the search bar).
const typing = (e) => {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
const searchOpen = () => search.isOpen();
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
addEventListener('keydown', (e) => {
  if (typing(e) || searchOpen()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (nav.intro) {
    if (MODIFIER_KEYS.has(e.key)) return;
    nav.skipIntro(curT);
    if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); return; }
  }
  const cmd = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'previous', l: 'like', L: 'like' }[e.key];
  if (cmd) { e.preventDefault(); music.command(cmd); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    music.command('volume', (player.volume ?? 70) + (e.key === 'ArrowUp' ? 5 : -5));
  } else if (e.key === 'Tab') {
    e.preventDefault();
    nav.step(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    nav.go(AT_HOME);
  }
});
// scroll keeps its own running volume (player state lags a few hundred ms behind)
let wheelVol = null, wheelIdle = 0;
addEventListener('wheel', (e) => {
  if (settingsPanel.isOpen()) return;
  wheelVol = Math.min(100, Math.max(0, (wheelVol ?? player.volume ?? 70) - e.deltaY * 0.05));
  music.command('volume', wheelVol);
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelVol = null; }, 600);
}, { passive: true });

const lookM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const pinnedPose = pinned ? { pos: new THREE.Vector3(...pinned.slice(0, 3)), target: new THREE.Vector3(...pinned.slice(3, 6)) } : null;
const DOOR_OPEN = THREE.MathUtils.degToRad(105);

let lastT = 0;
let hoverOn = -1;
let pickDone = false;
function frame(t, dtOverride, draw = true) {
  // wall-clock time: a slow frame rate must not stretch flights, so allow a long step (nav and racks cope)
  const dt = dtOverride ?? Math.min(0.25, Math.max(0, t - lastT));
  lastT = curT = t;
  timeOfDay.update(t);
  const pose = nav.update(t, dt);
  if (!everPlaced && nav.introDone) placeFirst(); // the camera reached home before the last page came in
  const c = pinnedPose ?? pose;
  rig.position.copy(c.pos);
  if (skylightBeam) {
    const d = Math.hypot(c.pos.x - skylightBeam.position.x, c.pos.z - skylightBeam.position.z);
    // metres beyond the plant room's z range (0 inside it)
    const outside = c.pos.z > -20 ? c.pos.z + 20 : c.pos.z < -24.2 ? -24.2 - c.pos.z : 0;
    const f = THREE.MathUtils.smoothstep(d, 2.5, 3.5) * THREE.MathUtils.smoothstep(outside, 0, 1.2);
    skylightBeam.material.opacity = beamOpacity * f;
    skylightBeam.visible = f > 0.01;
  }
  // Matrix4.lookAt uses the camera convention (looks down -z); Object3D.lookAt on a group would face the other way.
  rig.quaternion.setFromRotationMatrix(lookM.lookAt(c.pos, c.target, UP));
  for (const { pivot, side } of street.leaves) pivot.rotation.y = side * -nav.doorOpen(t) * DOOR_OPEN;
  tilt.x += (tilt.tx - tilt.x) * 0.06;
  tilt.y += (tilt.ty - tilt.y) * 0.06;
  // gentle tilt at home, calmer at a rack so records stay put under the cursor
  const k = nav.tilt;
  camera.rotation.order = 'YXZ';
  camera.rotation.set(-tilt.y * 0.09 * k, -tilt.x * 0.2 * k, 0);
  rig.updateMatrixWorld();

  // ?hover=N holds record N up on the rack you are at (a pinned ?cam counts as the table)
  const hoverAt = pinnedPose && nav.at === AT_HOME ? 0 : nav.settled ? nav.at : -1;
  if (hoverArg !== null && hoverAt !== hoverOn) {
    if (racks[hoverOn]) racks[hoverOn].forceHover = null;
    hoverOn = hoverAt;
  }
  if (hoverArg !== null && racks[hoverOn] && hoverOn >= 0) racks[hoverOn].forceHover = hoverArg;
  // only the rack you are standing at reacts to the cursor, and only once the flight has settled
  racks.forEach((rack, i) => {
    if (!rack || !rack.root.visible) return;
    const active = (nav.settled && nav.at === i) || (!!pinnedPose && i === hoverAt);
    // the cursor over the suitcase does not pick records through it
    rack.update(dt, camera, active && !suitcase.over ? pointer : null, active);
  });

  const ui = nav.introDone || !!pinnedPose;
  suitcase.show(ui, shotMode); // the lid flicks open the first time, when the intro reaches home
  suitcase.update(dt, t);
  menu.show(ui, shotMode);
  settingsPanel.show(ui);
  menu.tilt(tilt.x, tilt.y);
  // at a station (or flying to one) the side words step back so the racks stay reachable
  menu.update(dt, cursorX01, !pinnedPose && nav.at !== AT_HOME);
  if (!draw) return;
  if (painter) painter.render(scene, camera, t, suitcase.overlay);
  else { renderer.render(scene, camera); renderOverlay(renderer, suitcase.overlay); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Deterministic time for screenshots: ?shot, then window.__seek(seconds).
if (shotMode) {
  // let shelves, covers and fonts arrive, then settle all animation (big dt) before the frame is captured
  const waitFor = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50)); };
  window.__seek = async (t) => {
    await waitFor(() => shelvesLoaded, 20000);
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([suitcase.ready(), menu.ready(), ...racks.map((r) => r?.ready())]);
    menu.relayout();
    frame(t, 10);
    await new Promise((r) => setTimeout(r, 100)); // tag and sign textures are drawn a tick later
    await Promise.all(racks.map((r) => r?.ready()));
    frame(t, 10);
    // ?at=0&hover=4&pick=0.5: click the held-up record, then freeze the vinyl's flight into the suitcase at that fraction
    if (params.has('pick')) {
      if (!pickDone) {
        pickDone = true;
        racks[hoverOn]?.click();
        for (let k = 0; k < 600 && !suitcase.flying; k++) frame(t, 0.02, false); // let the slide-out play, no drawing
        await new Promise((r) => setTimeout(r, 100));
      }
      suitcase.freezeFlight(Number(params.get('pick')));
      frame(t, 0.0001);
    }
    return true;
  };
  window.__ready = true;
} else {
  const start = performance.now() - (Number(params.get('t')) || 0) * 1000;
  renderer.setAnimationLoop(() => frame((performance.now() - start) / 1000));
}
