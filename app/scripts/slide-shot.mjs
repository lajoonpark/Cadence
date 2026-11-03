// Screenshot a station with the camera slide pinned (sightline checks).
// Usage: node scripts/slide-shot.mjs out_dir station hover slides   e.g. slides = 0.55,0:1,0 (x,y pairs split by :)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [outDir, at = '1', hover = '0', slides = '0,0'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = Number(process.env.CADENCE_PORT) || 5205;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [vw, vh] = (process.env.CADENCE_VIEWPORT || '1170x730').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const sl of slides.split(':')) {
  const [x, y] = sl.split(',').map(Number);
  await page.goto(`http://127.0.0.1:${port}/?shot&shelves=8&at=${at}&hover=${hover}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
  await page.evaluate(([x, y]) => { window.__cadenceDebug.slide = { x, y }; }, [x, y]);
  await page.evaluate(() => window.__seek(6));
  const name = `${outDir}/s${at}-h${hover}-x${x}-y${y}.jpg`;
  await page.screenshot({ path: name, type: 'jpeg', quality: 82, timeout: 240000 });
  console.log(name);
}
await browser.close();
await server.close();
