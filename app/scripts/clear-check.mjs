// The camera making room for lifted records (racks/common.js clearShift): hover record N at every
// station, print how far the camera moved, and save a JPG per station.
// Usage: node scripts/clear-check.mjs out_dir [hover=0] [stations=0,1,...]   (CADENCE_VIEWPORT=1170x730)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [outDir = '/tmp/cadence-clear', hover = '0', list = '0,1,2,3,4,5,6,7'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = Number(process.env.CADENCE_PORT) || 5203;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [vw, vh] = (process.env.CADENCE_VIEWPORT || '1170x730').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const at of list.split(',').map(Number)) {
  await page.goto(`http://127.0.0.1:${port}/?shot&shelves=8&at=${at}&hover=${hover}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  await page.evaluate(() => window.__seek(6));
  const r = await page.evaluate(() => { const d = window.__cadenceDebug; return { shift: { ...d.rack.clearShift }, clear: d.clear }; });
  console.log(`station ${at}: need x=${r.shift.x.toFixed(3)} y=${r.shift.y.toFixed(3)} m, camera`, r.clear.camera.map((v) => v.toFixed(3)).join(','));
  await page.screenshot({ path: `${outDir}/station${at}.jpg`, type: 'jpeg', quality: 82, timeout: 180000 });
}
await browser.close();
await server.close();
