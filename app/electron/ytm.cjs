// YouTube Music, played by a hidden music.youtube.com window. That page does the real work
// (audio, ads, queue, radio, history, likes); Cadence drives it through ytm-page.js and reads
// shelves from the same internal API the page uses.
const { BrowserWindow, app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { parseShelves, continuation } = require('./ytm-parse.cjs');

const PARTITION = 'persist:ytm'; // cookies survive restarts, so you sign in once
const HOME = 'https://music.youtube.com/';
const PAGE_JS = fs.readFileSync(path.join(__dirname, 'ytm-page.js'), 'utf8');

// Google refuses to sign in "embedded browsers"; a plain Chrome user agent (Electron's minus the
// Electron and app tokens) avoids that and makes YouTube Music serve its normal desktop site.
function chromeUserAgent() {
  return app.userAgentFallback.replace(/\s(Electron|cadence-app|Cadence)\/\S+/gi, '');
}

// Google blocks sign-in from embedded Chromium ("This browser or app may not be secure") but still
// accepts Firefox, so the sign-in window (only) presents itself as Firefox: Firefox user agent, no
// Client Hints headers, no navigator.userAgentData. Lajoon chose this on 2026-11-02, knowing it
// works around Google's embedded-browser check; the official alternative is OAuth in the system
// browser, which cannot give the web player a signed-in session.
const FIREFOX_UA = {
  darwin: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
  win32: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
}[process.platform] ?? 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

function createYtm({ onState, onSignedIn }) {
  const ua = chromeUserAgent();
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    title: 'YouTube Music (Cadence player)',
    webPreferences: { partition: PARTITION, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.webContents.setUserAgent(ua);
  win.webContents.setAudioMuted(false);
  // YouTube Music asks "leave site?" while playing; Cadence decides when to navigate.
  win.webContents.on('will-prevent-unload', (e) => e.preventDefault());
  win.webContents.on('dom-ready', () => { win.webContents.executeJavaScript(PAGE_JS).catch(() => {}); });
  // A cookie consent page (EU) needs the user once: show the window until it is accepted.
  win.webContents.on('did-navigate', (_e, url) => {
    if (/consent\.(youtube|google)\.com/.test(url)) win.show();
    else if (win.isVisible() && url.startsWith(HOME)) win.hide();
  });
  let quitting = false;
  app.on('before-quit', () => { quitting = true; });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.loadURL(HOME);

  const js = (code) => win.webContents.executeJavaScript(code, true);

  // Resolves once the page has YouTube Music's app and config, and our helpers are in.
  async function ready(timeoutMs = 30000) {
    const t0 = Date.now();
    for (;;) {
      const ok = await js(`!!(window.ytcfg && document.querySelector('ytmusic-app'))`).catch(() => false);
      if (ok) {
        if (!(await js('!!window.__cadence'))) await js(PAGE_JS);
        return;
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('YouTube Music did not load');
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const api = async (endpoint, body) => { await ready(); return js(`window.__cadence.api(${JSON.stringify(endpoint)}, ${JSON.stringify(body)})`); };

  // Home shelves ("Listen again", "Quick picks", mixes...), one page at a time: call again with
  // `next` for more (later pages come from continuations).
  async function home(next) {
    const res = await api('browse', next ? { continuation: next } : { browseId: 'FEmusic_home' });
    return { shelves: parseShelves(res), next: continuation(res) };
  }

  async function play(endpoint) {
    await ready();
    const routed = await js(`window.__cadence.navigate(${JSON.stringify(endpoint)})`).catch(() => false);
    if (routed) return;
    // Fallback: a full page load of the watch URL.
    const q = new URLSearchParams();
    if (endpoint.videoId) q.set('v', endpoint.videoId);
    if (endpoint.playlistId) q.set('list', endpoint.playlistId);
    await win.loadURL(`${HOME}watch?${q}`);
  }

  async function command(name, arg) {
    await ready();
    return js(`window.__cadence.command(${JSON.stringify(name)}, ${JSON.stringify(arg ?? null)})`);
  }

  // Poll the page 4x a second and pass state on (position moves smoothly enough for a tonearm).
  let lastSignedIn = null;
  setInterval(async () => {
    if (win.isDestroyed()) return;
    const s = await js('window.__cadence?.state()').catch(() => null);
    if (!s) return;
    onState(s);
    if (lastSignedIn === false && s.signedIn) onSignedIn?.();
    lastSignedIn = s.signedIn;
  }, 250);

  // Google sign-in in a visible window that shares the player's cookies.
  const signInIds = new Set();
  win.webContents.session.webRequest.onBeforeSendHeaders((d, cb) => {
    if (signInIds.has(d.webContentsId)) {
      for (const k of Object.keys(d.requestHeaders)) if (/^sec-ch-ua/i.test(k)) delete d.requestHeaders[k];
    }
    cb({ requestHeaders: d.requestHeaders });
  });
  function signIn(parent) {
    const w = new BrowserWindow({
      width: 480, height: 720, parent, modal: false, title: 'Sign in to YouTube Music',
      webPreferences: { partition: PARTITION, preload: path.join(__dirname, 'signin-preload.cjs') },
    });
    const id = w.webContents.id;
    signInIds.add(id);
    w.on('closed', () => signInIds.delete(id));
    w.webContents.setUserAgent(FIREFOX_UA);
    w.loadURL(`https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent(HOME)}`);
    w.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith(HOME)) {
        w.close();
        win.loadURL(HOME); // reload the player as the signed-in user
      }
    });
  }

  return { home, play, command, signIn, window: win };
}

module.exports = { createYtm };
