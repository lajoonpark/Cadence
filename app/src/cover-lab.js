// Dev page: each cover as it arrives (left) and painted by coverpaint.js (right).
// ?url=a,b,c to try other covers. Shots: CADENCE_PAGE=cover-lab.html node scripts/shot.mjs dir 0
import { paintCover, coverSeed } from './coverpaint.js';

const DEFAULTS = [
  'https://i.ytimg.com/vi/8KTO9jxVr3c/hqdefault.jpg',
  'https://i.ytimg.com/vi/oDriMYb5-ww/hqdefault.jpg',
  'https://i.ytimg.com/vi/r4bboojfFlM/hqdefault.jpg',
  'https://yt3.googleusercontent.com/Yiqnzq5SfMrNjf9XTAMCPadMclhC8ltAVaePndf64gdwvjaN6eEDFBw2aKRukpqxlb7rdkb27BdUFLIDfA=w512-h512-l90-rj',
];
const params = new URLSearchParams(location.search);
const urls = params.get('url')?.split(',') ?? DEFAULTS;
const SIZE = 512;

const load = (url) => new Promise((res) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = url;
});

await Promise.all(urls.map(async (url) => {
  const fig = document.createElement('figure');
  document.body.appendChild(fig);
  const img = await load(url);
  if (!img) { fig.textContent = `failed: ${url}`; return; }
  for (const painted of [false, true]) {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SIZE, SIZE);
    if (painted) paintCover(g, SIZE, coverSeed(url));
    fig.appendChild(c);
  }
}));
window.__seek = () => {};
window.__ready = true;
