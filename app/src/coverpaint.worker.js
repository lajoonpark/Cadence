// Paints covers off the main thread: the blur filters in paintCover cost several ms per cover, and a
// shelf's worth arrives at once, usually just as the intro starts pushing in.
//   in:  { id, url, size, level }
//   out: { id, bitmap, color: [r, g, b] | null } (bitmap transferred), or { id, error }
import { paintCover, coverSeed } from './coverpaint.js';

self.onmessage = async ({ data: { id, url, size, level } }) => {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const img = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d');
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    let color = null;
    if (size <= 256) { // spine colour: the 8x8 average, as averageColor() in racks/common.js
      const a = new OffscreenCanvas(8, 8).getContext('2d');
      a.drawImage(img, 0, 0, 8, 8);
      const d = a.getImageData(0, 0, 8, 8).data;
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
      const n = d.length / 4;
      color = [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
    }
    img.close();
    paintCover(g, size, coverSeed(url), level);
    const bitmap = c.transferToImageBitmap();
    self.postMessage({ id, bitmap, color }, [bitmap]);
  } catch (e) {
    self.postMessage({ id, error: String(e?.message ?? e) });
  }
};
