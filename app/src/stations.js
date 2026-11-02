// The sections of the shop. Each YouTube Music home shelf ("Quick picks", "Listen again"...) gets
// one station: a spot in the shop with its own kind of record rack and a place for the camera to
// stand while you browse it. Shelves YouTube always sends have a fixed home; the rest fill the
// free stations in order.
//
// pos / rotY place the rack (its front faces local +z). cam is in WORLD coordinates.
// Rack agents tune their own row; nav.js owns how the camera gets there.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const H = Math.PI / 2;

export const HOME = { pos: v(0, 1.75, -2.2), target: v(0, 1.6, -12) };

export const STATIONS = [
  { id: 'table', style: 'trough', room: 'hall', pos: v(0, 0, -5.6), rotY: 0,
    cam: { pos: v(0, 1.82, -4.48), target: v(0, 0.98, -5.72) }, prefer: /quick picks/i },
  { id: 'cubby', style: 'cubby', room: 'hall', pos: v(5.2, 0, -6.4), rotY: -H,
    cam: { pos: v(3.4, 1.55, -6.4), target: v(5.2, 1.1, -6.4) }, prefer: /listen again/i },
  { id: 'gallery', style: 'floorlean', room: 'gallery', pos: v(-5.2, 3.03, -6.0), rotY: H,
    cam: { pos: v(-3.85, 4.35, -6.0), target: v(-5.2, 3.3, -6.0) }, prefer: /forgotten/i },
  { id: 'counter', style: 'easel', room: 'hall', pos: v(4.0, 1.08, -8.85), rotY: 0,
    cam: { pos: v(4.0, 1.75, -7.3), target: v(4.0, 1.35, -8.85) }, prefer: /album|release/i },
  { id: 'lounge', style: 'wall', room: 'lounge', pos: v(3.22, 0, -13), rotY: -H,
    cam: { pos: v(1.0, 1.6, -13), target: v(3.2, 1.5, -13) }, prefer: /mix/i },
  { id: 'stacks', style: 'tall', room: 'stacks', pos: v(3.05, 0, -17.5), rotY: -H,
    cam: { pos: v(0.5, 1.7, -17.5), target: v(3.0, 1.5, -17.5) }, prefer: /library|playlist/i },
  { id: 'plants', style: 'spinner', room: 'plants', pos: v(0, 0, -22), rotY: 0,
    cam: { pos: v(0, 1.6, -20.3), target: v(0, 1.0, -22) }, prefer: /similar|recommended|because/i },
  { id: 'courtyard', style: 'crates', room: 'courtyard', pos: v(2.0, 0, -27.2), rotY: -0.4,
    cam: { pos: v(1.2, 1.7, -25.4), target: v(2.0, 0.5, -27.2) }, prefer: null },
];

// shelves -> [{ station, shelf }] in station order (only stations that got a shelf).
export function assignShelves(shelves) {
  const taken = new Map(); // station index -> shelf
  const rest = [];
  for (const shelf of shelves) {
    const i = STATIONS.findIndex((s, k) => !taken.has(k) && s.prefer?.test(shelf.title));
    if (i >= 0) taken.set(i, shelf);
    else rest.push(shelf);
  }
  STATIONS.forEach((_, k) => { if (!taken.has(k) && rest.length) taken.set(k, rest.shift()); });
  return STATIONS.map((station, k) => ({ station, index: k, shelf: taken.get(k) })).filter((a) => a.shelf);
}
