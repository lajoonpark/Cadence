// Settings: a SETTINGS word top-right (like HOME top-left) and Cmd+, (Ctrl+, elsewhere) open a
// torn paper card in the middle of the screen. Each setting is a row of brush-stroke words; the chosen
// one is painted terracotta. Changes apply at once and are remembered (settings.js).
// Esc, clicking outside the card, or DONE closes it. While it is open the shop's keys stay quiet
// (main.js checks isOpen()).
//
//   const panel = createSettingsPanel();   panel.open() / close() / toggle() / isOpen()
//
// Shot hook: ?settings opens it.
import { FONT } from './style.js';
import { INK, HOT, PAPER, brushStroke } from './controls.js';
import { settings } from './settings.js';
import { rng } from './rand.js';

// Settings > Painting: watercolour strength (LEVELS in watercolour.js), lightest first
const PAINT = ['Faint', 'Light', 'Medium', 'Heavy'];

const CSS = `
.st-btn { position: fixed; top: 3.4vh; right: 2.6vw; z-index: 6; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: ${FONT}; color: ${PAPER}; font-size: 26px; line-height: 1; user-select: none; opacity: 0; transition: opacity .6s ease, transform .18s cubic-bezier(.3,1.6,.5,1); }
.st-btn.show { opacity: .9; }
.st-btn:hover { opacity: 1; transform: translateX(-4px) rotate(1deg); }
.st-w { position: relative; display: inline-block; border: 0; padding: 0; background: none; cursor: pointer; font-family: ${FONT};
  font-size: inherit; color: ${PAPER}; line-height: 1; transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.st-w .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.st-w .plate.hot { opacity: 0; }
.st-w:hover .plate.hot, .st-w.on .plate.hot { opacity: 1; }
.st-w:hover { transform: translateY(-2px) rotate(-1deg); }
.st-w span { position: relative; display: block; padding: .16em 1em .1em .7em; white-space: nowrap; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.st-btn .st-w span { padding: .16em .7em .1em 1em; }
.st-btn .plate { transform: scaleX(-1); }
.st-veil { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center;
  background: rgba(60,45,35,.18); opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s .3s; }
.st-veil.show { opacity: 1; visibility: visible; transition: opacity .3s ease; }
.st-card { position: relative; width: min(560px, 92vw); padding: 34px 40px 30px; color: #2b2436;
  font-family: ${FONT}; filter: drop-shadow(0 6px 10px rgba(50,35,25,.25));
  transform: translateY(18px) rotate(-1.4deg) scale(.96); transition: transform .45s cubic-bezier(.2,1.5,.4,1); }
.st-veil.show .st-card { transform: rotate(-.5deg); }
.st-paper { position: absolute; inset: 0; background: #f4ead6; }
.st-head { position: relative; font-size: 46px; margin: 0 0 18px; color: ${INK}; }
.st-row { position: relative; margin: 0 0 22px; }
.st-label { font-size: 30px; }
.st-hint { font-size: 19px; color: #7a5a40; margin: 2px 0 10px; }
.st-opts { display: flex; flex-wrap: wrap; gap: 6px 4px; font-size: 27px; }
.st-foot { position: relative; display: flex; justify-content: flex-end; font-size: 28px; }
`;

// A hand-torn outline as a CSS polygon (same idea as the search slips).
function torn(seed, amp = 5) {
  const r = rng(seed);
  const j = () => (r() * amp).toFixed(1);
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(1)}% ${j()}px`);
  for (let i = 1; i < 6; i++) pts.push(`calc(100% - ${j()}px) ${((i / 6) * 100).toFixed(1)}%`);
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(1)}% calc(100% - ${j()}px)`);
  for (let i = 5; i > 0; i--) pts.push(`${j()}px ${((i / 6) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
}

// A word in a brush stroke. Plates are painted once the word has its real size (after fonts load).
function word(text, seed, onClick) {
  const el = document.createElement('button');
  el.className = 'st-w';
  el.tabIndex = -1;
  el.innerHTML = '<div class="plate"></div><div class="plate hot"></div><span></span>';
  el.querySelector('span').textContent = text;
  el.addEventListener('click', (e) => { e.stopPropagation(); el.blur(); onClick(); });
  let painted = '';
  el.paint = () => {
    const w = Math.ceil(el.offsetWidth), h = Math.ceil(el.offsetHeight);
    if (!w || !h || painted === `${w}x${h}`) return;
    painted = `${w}x${h}`;
    const [cold, hot] = el.querySelectorAll('.plate');
    cold.style.backgroundImage = `url(${brushStroke(w, h, INK, seed)})`;
    hot.style.backgroundImage = `url(${brushStroke(w, h, HOT, seed)})`;
  };
  return el;
}

export function createSettingsPanel() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // the SETTINGS word, top right
  const btnWrap = document.createElement('div');
  btnWrap.className = 'st-btn';
  const btn = word('SETTINGS', 17, () => toggle());
  btnWrap.appendChild(btn);
  document.body.appendChild(btnWrap);

  // the card
  const veil = document.createElement('div');
  veil.className = 'st-veil';
  veil.innerHTML = `<div class="st-card"><div class="st-paper"></div><div class="st-head">Settings</div>
    <div class="st-row"><div class="st-label">Painting</div><div class="st-hint">How much the colours run and pool, like wet paint.</div><div class="st-opts"></div></div>
    <div class="st-row"><div class="st-label">Frame rate</div><div class="st-hint">Show frames per second in the corner.</div><div class="st-opts st-fps"></div></div>
    <div class="st-foot"></div></div>`;
  document.body.appendChild(veil);
  const card = veil.querySelector('.st-card');
  card.querySelector('.st-paper').style.clipPath = torn(7);
  card.addEventListener('click', (e) => e.stopPropagation());
  veil.addEventListener('click', () => close());

  const opts = card.querySelector('.st-opts');
  const fpsOpts = card.querySelector('.st-fps');
  const paintWords = PAINT.map((label, i) => {
    const w = word(label, 23 + i * 5, () => settings.set('paint', i));
    opts.appendChild(w);
    return w;
  });
  const mark = () => paintWords.forEach((w, i) => w.classList.toggle('on', i === settings.get('paint')));
  mark();
  settings.on('paint', mark);
  const fpsWords = ['Off', 'On'].map((label, i) => {
    const w = word(label, 41 + i * 3, () => settings.set('fps', i === 1));
    fpsOpts.appendChild(w);
    return w;
  });
  const markFps = () => fpsWords.forEach((w, i) => w.classList.toggle('on', (i === 1) === !!settings.get('fps')));
  markFps();
  settings.on('fps', markFps);

  const done = word('DONE', 31, () => close());
  card.querySelector('.st-foot').appendChild(done);

  const words = [btn, ...paintWords, ...fpsWords, done];
  const paintAll = () => words.forEach((w) => w.paint());
  document.fonts?.ready.then(paintAll);
  requestAnimationFrame(paintAll);

  let openNow = false;
  function open() {
    openNow = true;
    veil.classList.add('show');
    requestAnimationFrame(paintAll);
  }
  function close() {
    openNow = false;
    veil.classList.remove('show');
  }
  function toggle() { (openNow ? close : open)(); }

  // Cmd+, on macOS (the usual Preferences key), Ctrl+, elsewhere; Esc closes. Capture phase, so it
  // runs before the shop's own key handler and can swallow keys while the card is up.
  const mac = /Mac/.test(navigator.platform);
  addEventListener('keydown', (e) => {
    if (e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation(); toggle(); return;
    }
    if (!openNow) return;
    if (e.key === 'Escape') close();
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  if (new URLSearchParams(location.search).has('settings')) open();

  return {
    open, close, toggle,
    isOpen: () => openNow,
    // the SETTINGS word shows once the intro is over (like the section buttons)
    show(on) { btnWrap.classList.toggle('show', on); if (on) requestAnimationFrame(paintAll); },
  };
}
