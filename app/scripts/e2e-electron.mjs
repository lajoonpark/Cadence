// End-to-end check of the real app against YouTube Music (no account needed; guests get ads).
// Waits for shelves, sweeps the cursor over the rack, clicks a record, checks it plays, presses buttons.
// Usage (Linux server): npm run build && xvfb-run -a node scripts/e2e-electron.mjs out_dir
import { _electron as electron } from 'playwright';
const S = process.argv[2];
const app = await electron.launch({
  cwd: '/srv/projects/Cadence/app',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--user-data-dir=${S}/ud`, '.'],
  timeout: 60000,
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let page;
for (let i = 0; i < 40 && !page; i++) {
  page = app.windows().find((w) => w.url().startsWith('file:'));
  if (!page) await new Promise((r) => setTimeout(r, 500));
}
page.on('console', (m) => log('[page]', m.text()));
page.on('pageerror', (e) => log('[pageerror]', e.message));
log('main window', page.url());
await page.waitForFunction(() => window.__cadenceDebug?.shelves.length > 0, null, { timeout: 180000 });
log('shelves', await page.evaluate(() => window.__cadenceDebug.shelves.map((s) => `${s.title}(${s.items.length})`).join(', ')));
await new Promise((r) => setTimeout(r, 14000)); // intro + walk to the rack
const vp = await page.evaluate(() => [innerWidth, innerHeight]);
log('viewport', vp);
// sweep across the rack
for (let x = 0.3; x <= 0.7; x += 0.1) {
  await page.mouse.move(vp[0] * x, vp[1] * 0.5);
  await new Promise((r) => setTimeout(r, 600));
  log('x', x.toFixed(1), 'hovered', await page.evaluate(() => window.__cadenceDebug.rack.hovered));
}
await page.mouse.move(vp[0] * 0.5, vp[1] * 0.5);
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${S}/e2e-hover.png` });
const idx = await page.evaluate(() => window.__cadenceDebug.rack.hovered);
const item = await page.evaluate((i) => window.__cadenceDebug.shelves[0].items[i], idx);
log('clicking', idx, item?.title, JSON.stringify(item?.play));
await page.mouse.click(vp[0] * 0.5, vp[1] * 0.5);
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const p = await page.evaluate(() => window.__cadenceDebug.player);
  log('state', p.videoId, p.playerState, p.adPlaying ? 'AD' : '', p.title, '-', p.artist, Math.round(p.position) + '/' + Math.round(p.duration));
  if (p.playerState === 1 && !p.adPlaying && p.videoId === item.play.videoId) break;
}
await page.screenshot({ path: `${S}/e2e-playing.png` });
// buttons
await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 1200));
log('after Space', await page.evaluate(() => window.__cadenceDebug.player.playerState));
await page.locator('.deck button').nth(1).click({ force: true }); // play/pause (the stack is always tilting, so never "stable")
await new Promise((r) => setTimeout(r, 1200));
log('after PLAY click', await page.evaluate(() => window.__cadenceDebug.player.playerState));
await page.locator('.deck button').nth(2).click({ force: true }); // skip
await new Promise((r) => setTimeout(r, 4000));
const p2 = await page.evaluate(() => window.__cadenceDebug.player);
log('after SKIP', p2.videoId, p2.title, p2.adPlaying ? 'AD' : '');
await page.screenshot({ path: `${S}/e2e-skip.png` });
await app.close();
