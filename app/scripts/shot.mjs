// Render the scene at given times with headless Chromium. Usage: node scripts/shot.mjs out_dir t1 t2 ...
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [outDir = '/tmp/cadence-shots', ...times] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5199/?shot');
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
for (const t of (times.length ? times : ['0', '3', '5', '8'])) {
  await page.evaluate((s) => window.__seek(s), Number(t));
  const file = `${outDir}/t${t}.png`;
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
await browser.close();
await server.close();
