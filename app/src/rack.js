// Compatibility shim: main.js still imports the single rack from here. The racks now live in
// src/racks/ (one module per style, createRack(style, opts) in racks/index.js).
import { createRack as create } from './racks/index.js';
import { RACK_POS } from './racks/trough.js';
export { RACK_POS };
export function createRack(opts) {
  const rack = create('trough', opts);
  rack.root.position.copy(RACK_POS);
  return rack;
}
