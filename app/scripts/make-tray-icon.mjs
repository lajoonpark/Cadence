// Draws the menu-bar icon (a small vinyl record) as black-on-transparent PNGs.
// The "Template" suffix makes macOS tint it for light/dark menu bars.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2, ss = 4; // 4x4 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const d = Math.hypot(x + (sx + 0.5) / ss - c, y + (sy + 0.5) / ss - c) / (size / 2);
        const disc = d <= 0.92;
        const groove = d > 0.50 && d < 0.58;   // one thin groove ring left empty
        const label = d < 0.30 && d > 0.10;     // centre label ring kept solid, spindle hole empty
        const hole = d <= 0.10;
        if (disc && !hole && (!(d < 0.50) || label) && !groove) cover++;
        else if (disc && !hole && d >= 0.58) cover++;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = 0;
      raw[o + 3] = Math.round((255 * cover) / (ss * ss));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('../electron/trayTemplate.png', import.meta.url), png(22));
writeFileSync(new URL('../electron/trayTemplate@2x.png', import.meta.url), png(44));
