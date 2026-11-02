// Where the camera is and how it gets somewhere else: the intro (street, door, walk in), HOME just
// inside the shop, and one camera spot per station (stations.js). Flights between them follow
// waypoints along the central aisle (x = 0, through the arches) so the camera never goes through a
// wall or a piece of furniture; the gallery is reached over its railing.
//
// nav.js knows nothing about three.js scenes or the DOM: update(t, dt) returns { pos, target } and
// main.js points the camera rig at it.
import * as THREE from 'three';

export const AT_HOME = -1;
// intro timeline (seconds): hold on the street, push to the door, door swings open, walk in to HOME
export const T = { hold: 0.9, push: 4.4, doorStart: 3.0, doorEnd: 4.9, enter: 7.6 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const TAU = Math.PI * 2;
const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// look direction <-> yaw / pitch (yaw 0 looks down -z, positive yaw turns left; no roll ever)
const yawOf = (d) => Math.atan2(-d.x, -d.z);
const pitchOf = (d) => Math.asin(clamp(d.y / (d.length() || 1), -1, 1));
function aimOf(from, to) {
  const d = to.clone().sub(from);
  return { yaw: yawOf(d), pitch: pitchOf(d) };
}
function targetOf(pos, yaw, pitch, out, dist = 6) {
  const c = Math.cos(pitch);
  return out.set(pos.x - Math.sin(yaw) * c * dist, pos.y + Math.sin(pitch) * dist, pos.z - Math.cos(yaw) * c * dist);
}

// ---- the intro --------------------------------------------------------------------------------

function introPose(t, home, out) {
  const push = easeInOut(clamp01((t - T.hold) / (T.push - T.hold)));
  const enter = easeInOut(clamp01((t - T.push) / (T.enter - T.push)));
  const z = lerp(lerp(19.5, 2.6, push), home.pos.z, enter);
  const y = lerp(lerp(2.3, 1.75, push), home.pos.y, enter);
  // gentle sway while walking (fades in and out so it never pops)
  const sway = Math.sin(t * 1.7) * 0.04 * smooth01(push * 8) * (1 - enter);
  out.pos.set(lerp(sway, home.pos.x, enter), y, z);
  out.target.set(lerp(0, home.target.x, enter), lerp(2.0, home.target.y, enter), lerp(z - 10, home.target.z, enter));
  return out;
}

// ---- routes -----------------------------------------------------------------------------------
// The shop is one long aisle (x = 0) with an arch in every cross wall, so a route is: leave the
// station's camera spot, reach the aisle, ride the aisle to the other station's entry, step out to
// its camera spot. Points are written in world coordinates (see shop.js for the walls).
//
// The aisle ("spine") from the street inwards. Over the crate table the camera climbs (hump) so it
// passes well above the sleeves; every other point is at eye height.
const SPINE_ORDER = ['home', 'core', 'hump', 'hallEnd', 'lounge', 'stacks', 'plants', 'plantsA', 'plantsB', 'court'];
const SPINE_FIXED = {
  hump: [0, 2.8, -5.7],
  hallEnd: [0, 1.75, -8.4],        // past the table and the bin tables; the lounge arch (z -10.5) is next
  plantsA: [1.3, 2.3, -20.9],     // the plant room has its rack in the middle: pass it on the right, above the pots
  plantsB: [1.3, 2.3, -23.0],
  court: [0.3, 1.7, -24.8],        // just inside the courtyard arch (z -24 .. -24.5)
};

// How each station reaches the aisle. `near`: for trips inside the hall; `far`: for trips deeper in.
// pts lead from the camera spot outwards to the aisle point named by join.
const P = (...p) => p;
const ATTACH = {
  table:     { near: { join: 'core', pts: [] }, far: { join: 'core', pts: [] } },
  cubby:     { near: { join: 'core', pts: [P(2.7, 1.75, -5.6), P(1.9, 1.85, -4.7)] },
               far:  { join: 'hump', pts: [P(2.6, 2.2, -6.0), P(1.0, 2.8, -4.9)] } },
  counter:   { near: { join: 'core', pts: [P(3.1, 1.8, -6.2), P(1.9, 1.85, -4.7)] },
               far:  { join: 'hump', pts: [P(2.9, 2.2, -6.9), P(1.1, 2.8, -5.0)] } },
  // up and over the railing (top rail y 3.95), then down toward the aisle
  gallery:   { near: { join: 'core', pts: [P(-3.0, 4.55, -5.4), P(-1.6, 3.1, -4.9)] },
               far:  { join: 'hump', pts: [P(-3.0, 4.55, -5.4), P(-1.2, 3.4, -4.6)] } },
  lounge:    { near: { join: 'lounge', pts: [] }, far: { join: 'lounge', pts: [] } },
  stacks:    { near: { join: 'stacks', pts: [] }, far: { join: 'stacks', pts: [] } },
  plants:    { near: { join: 'plants', pts: [] }, far: { join: 'plants', pts: [] } },
  courtyard: { near: { join: 'court', pts: [] }, far: { join: 'court', pts: [] } },
};
const HALL = new Set(['home', 'table', 'cubby', 'counter', 'gallery']);
// Straight-ish trips inside the hall that need no detour through the aisle (listed one way, used both ways).
const SHORT = {
  'home|table': [],
  'home|cubby': [P(2.2, 1.75, -2.9), P(3.0, 1.7, -4.5)],               // down the free strip between bin table and armchair
  'home|counter': [P(2.2, 1.75, -2.9), P(3.0, 1.75, -4.6), P(3.2, 1.75, -6.0)],
  'home|gallery': [P(-1.4, 2.9, -4.1), P(-3.0, 4.55, -5.5)],           // rises past the stair side, over the rail
  'cubby|counter': [],
};

const FLIGHT_TAU = 0.22;   // how long a flight that is interrupted keeps its momentum (s)
const LOOK_AHEAD = 2.4;
const PACE_MAX = 12;       // m/s: cruising pace along a straight path
const PACE_LATERAL = 25;   // m/s2 of sideways acceleration a bend may ask for
const PACE_ACCEL = 20;     // m/s2: how fast the pace may build up or drop along the path    // metres of path either side used to read the direction of travel

// ---- the controller ---------------------------------------------------------------------------

// nav = createNav({ home, stations, startAt }): startAt = null plays the intro; a station index or
// AT_HOME starts settled there (no intro, doors open).
export function createNav({ home, stations, startAt = null }) {
  const idOf = (i) => (i === AT_HOME ? 'home' : stations[i].id);
  const camOf = (i) => (i === AT_HOME ? home : stations[i].cam);
  const stationIndex = (id) => stations.findIndex((s) => s.id === id);

  // ---- routing ----
  function spinePoint(key) {
    const cam = (id) => stations[stationIndex(id)]?.cam.pos;
    switch (key) {
      case 'home': return home.pos.clone();
      case 'core': return (cam('table') ?? V(0, 1.82, -4.48)).clone();
      case 'lounge': { const c = cam('lounge'); return V(0, c?.y ?? 1.65, c?.z ?? -13); }
      case 'stacks': { const c = cam('stacks'); return V(0, c?.y ?? 1.7, c?.z ?? -17.5); }
      case 'plants': return (cam('plants') ?? V(0, 1.6, -20.3)).clone();
      default: return V(...SPINE_FIXED[key]);
    }
  }
  function spineSlice(j1, j2) {
    const a = SPINE_ORDER.indexOf(j1), b = SPINE_ORDER.indexOf(j2);
    const keys = a <= b ? SPINE_ORDER.slice(a, b + 1) : SPINE_ORDER.slice(b, a + 1).reverse();
    return keys.map(spinePoint);
  }
  const toV = (p) => V(...p);
  function dedupe(pts, eps = 0.1) {
    const out = [];
    for (const p of pts) {
      if (out.length && out[out.length - 1].distanceTo(p) < eps) { if (p === pts[pts.length - 1]) out[out.length - 1] = p; continue; }
      out.push(p);
    }
    return out;
  }
  // waypoints from station a's camera spot to station b's (indices, or AT_HOME)
  function route(a, b) {
    const A = camOf(a).pos, B = camOf(b).pos;
    if (a === b) return [A.clone()];
    const ia = idOf(a), ib = idOf(b);
    let mid;
    if (SHORT[`${ia}|${ib}`]) mid = SHORT[`${ia}|${ib}`].map(toV);
    else if (SHORT[`${ib}|${ia}`]) mid = SHORT[`${ib}|${ia}`].map(toV).reverse();
    else if ((ia !== 'home' && !ATTACH[ia]) || (ib !== 'home' && !ATTACH[ib])) mid = []; // unknown station: a straight line
    else {
      const far = !(HALL.has(ia) && HALL.has(ib));
      const at = (id) => (id === 'home' ? { join: 'home', pts: [] } : ATTACH[id][far ? 'far' : 'near']);
      const pa = at(ia), pb = at(ib);
      mid = [...pa.pts.map(toV), ...spineSlice(pa.join, pb.join), ...pb.pts.map(toV).reverse()];
    }
    return dedupe([A.clone(), ...mid, B.clone()]);
  }

  // ---- a planned flight: a smooth curve through waypoints, and where the camera looks on the way ----
  function makePlan(wps, aimFrom, aimTo, durOverride) {
    const curve = new THREE.CatmullRomCurve3(wps, false, 'centripetal');
    const len = curve.getLength();
    // a long pan (turning round to face the new rack) takes time too
    const pan = Math.abs(angleDiff(aimFrom.yaw, aimTo.yaw));
    let dur = durOverride ?? clamp(Math.max(0.9 + 0.075 * len, 0.7 + pan / 1.6), 1.2, 3.0);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), dir = new THREE.Vector3();
    const reach = LOOK_AHEAD / Math.max(len, 0.01);
    const yawEnd = aimFrom.yaw + angleDiff(aimFrom.yaw, aimTo.yaw); // pan the short way round, once

    // Slow into tight bends: the camera's pace along the path drops where the path curves sharply
    // (a hairpin from a re-route, a corner at an arch) and builds up again gently, so it never whips
    // round at full speed. pace[i] = metres/second the path allows at sample i; U[i] = share of the
    // flight's time spent before sample i.
    const N = 160;
    const pts = Array.from({ length: N + 1 }, (_, i) => curve.getPointAt(i / N));
    const ds = len / N;
    const pace = new Array(N + 1).fill(PACE_MAX);
    for (let i = 1; i < N; i++) {
      const a = pts[i].clone().sub(pts[i - 1]), b = pts[i + 1].clone().sub(pts[i]);
      const kappa = a.angleTo(b) / Math.max(0.02, (a.length() + b.length()) / 2);
      pace[i] = clamp(Math.sqrt(PACE_LATERAL / Math.max(kappa, 1e-3)), 1.5, PACE_MAX);
    }
    for (let i = 1; i <= N; i++) pace[i] = Math.min(pace[i], Math.sqrt(pace[i - 1] ** 2 + 2 * PACE_ACCEL * ds));
    for (let i = N - 1; i >= 0; i--) pace[i] = Math.min(pace[i], Math.sqrt(pace[i + 1] ** 2 + 2 * PACE_ACCEL * ds));
    const slow = pace.map((v) => PACE_MAX / v);
    const U = [0];
    for (let i = 1; i <= N; i++) U.push(U[i - 1] + (slow[i - 1] + slow[i]) / 2);
    const total = U[N];
    if (durOverride == null) dur = clamp(dur * Math.pow(total / N, 0.6), 1.2, 3.0);
    // eased progress p (0..1 of the flight's time) -> fraction s of the path
    const sOf = (p) => {
      const target = clamp01(p) * total;
      let lo = 0, hi = N;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (U[mid] <= target) lo = mid; else hi = mid; }
      const span = U[hi] - U[lo] || 1;
      return (lo + (target - U[lo]) / span) / N;
    };
    return {
      wps, curve, len, dur, aimFrom, aimTo, sOf,
      // Camera at path fraction s. The view pans smoothly from the old station's view to the new one;
      // in the middle of the trip it also turns toward the direction of travel (so it looks down the
      // aisle and through the arches), but only when that is a sensible turn: backing away from a rack
      // keeps looking at it instead of spinning round and back.
      at(s, out) {
        s = clamp01(s);
        curve.getPointAt(s, out.pos);
        const mix = smooth01(s);
        const baseYaw = lerp(aimFrom.yaw, yawEnd, mix), basePitch = lerp(aimFrom.pitch, aimTo.pitch, mix);
        curve.getPointAt(Math.min(1, s + reach), pa);
        curve.getPointAt(Math.max(0, s - reach), pb);
        dir.subVectors(pa, pb);
        const horiz = Math.hypot(dir.x, dir.z);
        const dy = horiz > 1e-4 ? angleDiff(baseYaw, yawOf(dir)) : 0;
        const compat = 1 - smooth01((Math.abs(dy) - 0.9) / 1.4);            // full up to ~50 deg off, none past ~130 deg
        const hz = smooth01((horiz - 0.2) / 0.6);
        const wYaw = smooth01(s / 0.25) * (1 - smooth01((s - 0.72) / 0.28)) * compat * hz;
        const wPitch = smooth01(s / 0.25) * (1 - smooth01((s - 0.4) / 0.6)) * compat * hz;
        // lean toward the direction of travel by at most ~35 degrees, never a snap
        out.yaw = baseYaw + 0.6 * Math.tanh(dy / 0.6) * wYaw;
        // a climb or drop does not point the camera at the ceiling: only a fraction of the slope
        out.pitch = lerp(basePitch, clamp(Math.atan2(dir.y, horiz) * 0.5, -0.3, 0.3), 0.7 * wPitch);
        return out;
      },
    };
  }

  // ---- state ----
  let phase = startAt === null ? 'intro' : 'rest'; // 'intro' | 'rest' | 'fly' | 'frozen'
  let at = startAt ?? AT_HOME;                     // where we are, or where the flight is heading
  let introDone = startAt !== null;
  let skipT = startAt === null ? null : -100;      // time the intro was skipped (door keeps opening); -100 = doors already open
  let skipFlight = false;
  let flight = null;                               // { plan, e, toId, backId, backPts, mom }
  let curT = 0;
  let tiltK = startAt === null ? 0.25 : (startAt === AT_HOME ? 1 : 0.35);
  const listeners = [];
  const pose = { pos: V(0, 1.7, 0), target: V(0, 1.7, -1), yaw: 0, pitch: 0 };
  const tmp = { pos: V(0, 0, 0), target: V(0, 0, 0), yaw: 0, pitch: 0 };
  const last = { pos: V(0, 0, 0), yaw: 0, pitch: 0, ok: false };
  const vel = V(0, 0, 0), scratch = V(0, 0, 0);
  let wYaw = 0, wPitch = 0;
  let sections = [];

  const setAim = (pos, yaw, pitch) => {
    pose.pos.copy(pos); pose.yaw = yaw; pose.pitch = pitch;
    targetOf(pos, yaw, pitch, pose.target);
  };
  const setLook = (pos, target) => {
    pose.pos.copy(pos); pose.target.copy(target);
    const a = aimOf(pos, target); pose.yaw = a.yaw; pose.pitch = a.pitch;
  };
  const setRest = (i) => setLook(camOf(i).pos, camOf(i).target);
  const aimAt = (i) => aimOf(camOf(i).pos, camOf(i).target);
  const fire = (prev) => listeners.forEach((cb) => cb(at, prev));
  const tiltFor = () => (phase === 'fly' || phase === 'frozen' ? 0.6 : at === AT_HOME ? 1 : 0.35);

  if (startAt !== null) setRest(startAt);
  else introPose(0, home, tmp), setLook(tmp.pos, tmp.target);

  // the camera's own velocity, so a flight that is interrupted can carry on a moment before turning
  function track(dt) {
    if (dt > 0 && dt < 0.2 && last.ok) {
      vel.lerp(scratch.copy(pose.pos).sub(last.pos).divideScalar(dt), 0.6);
      wYaw = lerp(wYaw, angleDiff(last.yaw, pose.yaw) / dt, 0.6);
      wPitch = lerp(wPitch, (pose.pitch - last.pitch) / dt, 0.6);
    } else { vel.set(0, 0, 0); wYaw = wPitch = 0; }
    last.pos.copy(pose.pos); last.yaw = pose.yaw; last.pitch = pose.pitch; last.ok = true;
  }

  function begin(plan, extra) {
    const mom = phase === 'rest' ? null : { v: vel.clone(), yaw: wYaw, pitch: wPitch };
    flight = { plan, e: 0, mom, ...extra };
    phase = 'fly';
  }

  // closest point on the polyline to p -> index k of the segment [wps[k], wps[k+1]]
  function segmentOf(wps, p) {
    let best = 0, bd = Infinity;
    const line = new THREE.Line3(), q = new THREE.Vector3();
    for (let k = 0; k < wps.length - 1; k++) {
      line.set(wps[k], wps[k + 1]).closestPointToPoint(p, true, q);
      const d = q.distanceTo(p);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  const pathLen = (pts) => pts.reduce((s, p, i) => s + (i ? p.distanceTo(pts[i - 1]) : 0), 0);
  // A path that doubles back on itself (out to a station and back to the aisle, or back along the
  // way it came) would turn round at full speed. Cut such loops: when a later point lies on an
  // earlier stretch of the path, jump straight there.
  function eraseLoops(pts) {
    const out = pts.slice();
    const line = new THREE.Line3(), q = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let j = 2; j < out.length; j++) {
      for (let i = 0; i < j - 1; i++) {
        line.set(out[i], out[i + 1]).closestPointToPoint(out[j], true, q);
        // on the earlier stretch, or close to it and heading back the way it came (a hairpin)
        const d = q.distanceTo(out[j]);
        a.subVectors(out[i + 1], out[i]);
        b.subVectors(out[j], out[j - 1]);
        if (d < 0.5 || (d < 1.1 && a.dot(b) < 0)) {
          const joint = q.distanceTo(out[i]) < 0.15 ? [] : q.distanceTo(out[i + 1]) < 0.15 ? [out[i + 1]] : [q.clone()];
          if (joint.length >= j - i - 1) continue; // nothing to cut
          out.splice(i + 1, j - i - 1, ...joint);
          j = i; // start over from the joint
          break;
        }
      }
    }
    return out;
  }

  function startFlight(dest) {
    const prev = at;
    const aimTo = aimAt(dest);
    const aimFrom = { yaw: pose.yaw, pitch: pose.pitch };
    if (phase === 'rest') {
      const wps = route(at, dest);
      if (wps.length < 2) return;
      at = dest;
      begin(makePlan(wps, aimFrom, aimTo), { toId: dest, backId: prev, backPts: [] });
    } else {
      // interrupted: carry on to the old destination and from there to the new one, or turn back the
      // way we came and go from there, whichever is shorter
      const here = pose.pos.clone();
      const old = flight;
      const k = segmentOf(old.plan.wps, here);
      const ahead = old.plan.wps.slice(k + 1);
      const behind = old.plan.wps.slice(0, k + 1).reverse();
      const fwd = [here, ...ahead, ...route(old.toId, dest).slice(1)];
      const back = [here, ...behind, ...old.backPts, ...route(old.backId, dest).slice(1)];
      const useFwd = pathLen(fwd) <= pathLen(back) + 0.5;
      const wps = dedupe(eraseLoops(dedupe(useFwd ? fwd : back)));
      at = dest;
      if (wps.length < 2) { flight = null; phase = 'rest'; setRest(dest); return; }
      begin(makePlan(wps, aimFrom, aimTo), { toId: dest, backId: old.backId, backPts: [...behind, ...old.backPts] });
    }
    if (at !== prev) fire(prev);
  }

  function arrive() {
    phase = 'rest';
    setRest(at);
    flight = null;
    if (skipFlight) { skipFlight = false; introDone = true; }
  }

  // ---- public ----
  function skipIntro(t = curT) {
    if (phase !== 'intro') return;
    skipT = t;
    // a quick ease from the last frame's pose, carrying the walk's own momentum for a moment
    const plan = makePlan([pose.pos.clone(), home.pos.clone()], { yaw: pose.yaw, pitch: pose.pitch }, aimOf(home.pos, home.target));
    plan.dur = clamp(0.8 + 0.04 * plan.len, 0.9, 1.6);
    flight = { plan, e: 0, mom: { v: vel.clone(), yaw: wYaw, pitch: wPitch }, toId: AT_HOME, backId: AT_HOME, backPts: [] };
    phase = 'fly';
    skipFlight = true;
    at = AT_HOME;
  }

  function go(dest) {
    if (dest === undefined || dest === null) return;
    if (phase === 'intro') { skipIntro(); return; }
    if (phase === 'frozen') return;
    if (dest === at) return;
    if (dest !== AT_HOME && (dest < 0 || dest >= stations.length)) return;
    startFlight(dest);
  }

  // next / previous section (Tab / Shift+Tab); from HOME, next goes to the first, previous to the last
  function step(dir) {
    if (!sections.length) return;
    if (phase === 'intro') { skipIntro(); return; }
    const i = sections.indexOf(at);
    let next;
    if (i < 0) next = dir > 0 ? sections[0] : sections[sections.length - 1];
    else next = sections[(i + dir + sections.length) % sections.length];
    go(next);
  }

  function jump(dest) {
    const prev = at;
    phase = 'rest'; flight = null; at = dest; introDone = true;
    if (skipT === null) skipT = -100; // doors open
    setRest(dest);
    tiltK = dest === AT_HOME ? 1 : 0.35;
    if (prev !== at) fire(prev);
  }

  // Hold a flight at path fraction p (for screenshots of mid-flight frames).
  function freeze(from, to, p) {
    const wps = route(from, to);
    const plan = makePlan(wps, aimAt(from), aimAt(to));
    phase = 'frozen'; introDone = true; at = to; skipT = skipT ?? -100;
    flight = { plan, p: clamp01(p), toId: to, backId: from, backPts: [] };
    plan.at(flight.p, tmp);
    setAim(tmp.pos, tmp.yaw, tmp.pitch);
    tiltK = 0.6;
  }

  function update(t, dt) {
    curT = t;
    if (phase === 'intro') {
      introPose(t, home, tmp);
      setLook(tmp.pos, tmp.target);
      tiltK = 0.25 + 0.75 * clamp01((t - T.push) / (T.enter - T.push));
      if (t >= T.enter - 0.3) introDone = true;
      if (t >= T.enter) { phase = 'rest'; at = AT_HOME; setRest(AT_HOME); tiltK = 1; }
    } else if (phase === 'fly') {
      flight.e += dt;
      const tau = clamp01(flight.e / flight.plan.dur);
      flight.plan.at(flight.plan.sOf(smooth01(tau)), tmp);
      if (flight.mom) {
        // keep a little of the old motion so the turn-around is not a sudden stop; gone after ~0.8 s
        const e = flight.e;
        const m = e * Math.exp(-e / FLIGHT_TAU) * (1 - smooth01((e - 0.5) / 0.3));
        tmp.pos.addScaledVector(flight.mom.v, m);
        tmp.yaw += flight.mom.yaw * m;
        tmp.pitch += flight.mom.pitch * m;
      }
      setAim(tmp.pos, tmp.yaw, tmp.pitch);
      if (skipFlight && tau > 0.6) introDone = true;
      if (tau >= 1) arrive();
      tiltK += (tiltFor() - tiltK) * (1 - Math.exp(-3 * Math.min(dt, 0.2)));
    } else if (phase === 'rest') {
      tiltK += (tiltFor() - tiltK) * (1 - Math.exp(-3 * Math.min(dt, 0.2)));
    }
    track(dt);
    return pose;
  }

  // 0..1: how far the shop door is open. It keeps opening if the intro is skipped.
  function doorOpen(t) {
    if (skipT !== null && skipT < 0) return 1;
    const base = (x) => easeInOut(clamp01((x - T.doorStart) / (T.doorEnd - T.doorStart)));
    if (skipT === null) return base(t);
    return lerp(base(skipT), 1, easeInOut(clamp01((t - skipT) / 0.6)));
  }

  return {
    update, go, step, jump, freeze, skipIntro, doorOpen,
    setSections(list) { sections = list.slice(); },
    onChange(cb) { listeners.push(cb); },
    get pose() { return pose; },
    get phase() { return phase; },
    get at() { return at; },
    get introDone() { return introDone; },
    get intro() { return phase === 'intro'; },
    get flying() { return phase === 'fly' || phase === 'frozen'; },
    get settled() { return phase === 'rest'; },        // hover is allowed only when this is true
    get tilt() { return tiltK; },                        // 0..1 strength of the cursor tilt
    get progress() { return flight ? (flight.p ?? clamp01(flight.e / flight.plan.dur)) : 1; },
    get sections() { return sections.slice(); },
    get waypoints() { return flight ? flight.plan.wps : null; },
    // for the route check and the debug console
    route, plan: (a, b) => { const w = route(a, b); return makePlan(w, aimAt(a), aimAt(b)); },
  };
}
