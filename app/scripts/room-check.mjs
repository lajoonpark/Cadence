// How far the camera may slide at each station (sightline.js) and what it does for hovered records.
// Usage: node scripts/room-check.mjs [stations=0,...,7] [hovers=0,2,4]   (no screenshots, quick)
import { chromium } from 'playwright';
import { createServer } from 'vite';

const [list = '0,1,2,3,4,5,6,7', hovers = '0,2,4'] = process.argv.slice(2);
const port = Number(process.env.CADENCE_PORT) || 5204;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [vw, vh] = (process.env.CADENCE_VIEWPORT || '1170x730').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const f = (v) => (v ?? 0).toFixed(2);
for (const at of list.split(',').map(Number)) {
  for (const h of hovers.split(',')) {
    await page.goto(`http://127.0.0.1:${port}/?shot&shelves=8&at=${at}&hover=${h}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
    await page.evaluate(() => window.__seek(6));
    const r = await page.evaluate(() => { const d = window.__cadenceDebug; return { need: { ...d.rack.clearShift }, clear: d.clear }; });
    const room = r.clear.room;
    console.log(`station ${at} hover ${h}: room left=${f(room?.left)} down=${f(room?.down)} | need right=${f(r.need.right)} up=${f(r.need.up)} | slide x=${f(r.clear.target.x)} y=${f(r.clear.target.y)}`);
  }
}
await browser.close();
await server.close();
