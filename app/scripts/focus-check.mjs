// Still cursor over a few spots at a rack: does the hover hold and the camera settle, or do they chase?
//   node scripts/focus-check.mjs out_dir [rack]   (SPOTS="x,y x,y", CADENCE_PORT)
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2], at = Number(process.argv[3] ?? 0), port = Number(process.env.CADENCE_PORT) || 5241;
const server = await createServer({ server: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shelves=8&at=${at}&wc=0`);
await page.waitForFunction(() => window.__cadenceDebug?.state.settled, null, { timeout: 120000 });
await page.waitForTimeout(8000);
const spots = (process.env.SPOTS || '420,560 640,450 300,640 860,500').split(' ').map((p) => p.split(',').map(Number));
for (const [x, y] of spots) {
  await page.mouse.move(x - 30, y - 10); await page.mouse.move(x, y, { steps: 5 });
  const seq = [];
  for (let i = 0; i < 40; i++) {
    seq.push(await page.evaluate(() => { const d = window.__cadenceDebug, f = d.focus; return `${d.rack.hovered}:${f.yaw.toFixed(2)}:${d.clear.x.toFixed(2)}`; }));
    await page.waitForTimeout(150);
  }
  const hs = seq.map((s) => s.split(':')[0]);
  const changes = hs.filter((h, i) => i && h !== hs[i - 1]).length;
  console.log(`spot ${x},${y} hover changes=${changes} final=${seq.at(-1)}\n  ${seq.join(' ')}`);
  await page.screenshot({ path: `${out}/at${at}-${x}-${y}.png`, timeout: 240000 });
}
await b.close(); await server.close();
