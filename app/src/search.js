// Search bar. Opens with Option+Cmd+S (macOS) or Ctrl+Alt+S: a strip of torn paper inside an indigo
// brush stroke, top centre, with the results dropping down under it as paper slips (the same paper
// as the now-playing tag in controls.js), the chosen one painted over in terracotta.
//
//   const search = createSearch({ music, onPlay });   // music.search(q) -> Promise<items>
//   search.open() / close() / toggle() / isOpen()
//
// onPlay(item) is called with the chosen song (the same item shape as a rack item), then the bar closes.
// While it is open it swallows every key (so the shop's hotkeys and Tab stay quiet) and re-grabs focus
// if anything steals it. Create it before the shop registers its own key handlers, or have those
// handlers check search.isOpen().
//
// Shot hooks (location.search): ?search=lemon opens it with that query, ?searchhl=N highlights slip N.
import { rng } from './rand.js';
import { FONT } from './style.js';
import { INK, PAPER, brushStroke } from './controls.js';
import { paintedCoverURL } from './coverpaint.js';

const HOT = '#b4503a';           // terracotta on the chosen slip
const DEBOUNCE = 250;
const MAX_SLIPS = 7;
const BAR_H = 88;
const SLIP_H = 66;

const CSS = `
.cs { position: fixed; top: 3.2vh; left: 50%; width: min(640px, 92vw); z-index: 60; transform: translateX(-50%);
  pointer-events: none; visibility: hidden; font-family: ${FONT}; user-select: none; }
.cs.show { pointer-events: auto; visibility: visible; }
.cs-bar { position: relative; height: ${BAR_H}px; opacity: 0; transform: translateY(-26px) rotate(-1.2deg) scale(.97);
  transform-origin: 20% 0; transition: opacity .28s ease, transform .45s cubic-bezier(.2,1.5,.4,1); background-size: 100% 100%; }
.cs.show .cs-bar { opacity: 1; transform: rotate(-.6deg); }
.cs-paper { position: absolute; left: 42px; right: 70px; top: 20px; bottom: 20px; background: ${PAPER}; display: flex; align-items: center;
  padding: 0 18px 0 14px; gap: 8px; }
.cs-paper svg { flex: none; width: 32px; height: 32px; margin-top: 2px; }
.cs-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 38px/1 ${FONT}; color: #2b2436; padding: 6px 0 2px;
  caret-color: ${HOT}; letter-spacing: .01em; }
.cs-input::placeholder { color: #a8957c; }
.cs-input::selection { background: rgba(180,80,58,.28); }
.cs-list { margin: -2px 0 0 18px; padding: 0; width: calc(100% - 36px); list-style: none; transition: opacity .2s; }
.cs-list.stale { opacity: .55; }
.cs-slipwrap { filter: drop-shadow(0 3px 3px rgba(50,35,25,.2)); margin-top: -1px; opacity: 0; transform: translateY(-14px) rotate(var(--r));
  animation: cs-drop .38s cubic-bezier(.2,1.4,.4,1) forwards; animation-delay: calc(var(--i) * 38ms); cursor: pointer; }
.cs:not(.show) .cs-slipwrap { animation: none; }
@keyframes cs-drop { to { opacity: 1; transform: translateY(0) rotate(var(--r)); } }
.cs-slip { position: relative; height: ${SLIP_H}px; background: #f4ead6; display: flex; align-items: center; gap: 14px;
  padding: 0 24px 0 16px; color: #2b2436; transition: color .15s; }
.cs-hl { position: absolute; inset: -2px -6px; background-size: 100% 100%; opacity: 0; transition: opacity .18s; pointer-events: none; }
.cs-slipwrap.on .cs-hl { opacity: 1; }
.cs-slipwrap.on .cs-slip { color: ${PAPER}; }
.cs-slipwrap.on .cs-a, .cs-slipwrap.on .cs-d { color: rgba(251,245,232,.85); }
.cs-cover { position: relative; flex: none; width: 46px; height: 46px; padding: 2px; background: ${PAPER}; transform: rotate(-2.5deg);
  box-shadow: 0 0 0 1px rgba(45,49,88,.25); }
.cs-cover img, .cs-cover i { display: block; width: 100%; height: 100%; object-fit: cover; background: #d9cbb2; }
.cs-txt { position: relative; flex: 1; min-width: 0; line-height: 1; }
.cs-t, .cs-a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-t { font-size: 28px; }
.cs-a { font-size: 19px; color: #7a5a40; margin-top: 3px; transition: color .15s; }
.cs-d { position: relative; flex: none; font-size: 20px; color: #7a5a40; transition: color .15s; }
.cs-note { position: relative; height: ${SLIP_H - 6}px; margin: 0 0 0 10px; display: flex; align-items: center; padding: 0 44px 0 34px;
  color: ${PAPER}; font-size: 32px; background-size: 100% 100%; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.cs-dots span { display: inline-block; animation: cs-dab 1.1s ease-in-out infinite; }
.cs-dots span:nth-child(2) { animation-delay: .18s; } .cs-dots span:nth-child(3) { animation-delay: .36s; }
@keyframes cs-dab { 0%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
`;

// A hand-torn paper outline: jittered points along all four edges, as a CSS polygon.
function torn(seed, amp = 3) {
  const r = rng(seed);
  const j = () => (r() * amp).toFixed(1);
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(1)}% ${j()}px`);
  for (let i = 1; i < 4; i++) pts.push(`calc(100% - ${j()}px) ${((i / 4) * 100).toFixed(1)}%`);
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(1)}% calc(100% - ${j()}px)`);
  for (let i = 3; i > 0; i--) pts.push(`${j()}px ${((i / 4) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
}

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

// A tiny brushed magnifying glass, in indigo.
const GLASS = `<svg viewBox="0 0 32 32" fill="none" stroke="${INK}" stroke-linecap="round"><circle cx="13" cy="13" r="8.5" stroke-width="3.2"/><path d="M19.5 19.5 L28 28" stroke-width="4.2"/><path d="M9 11 Q10.5 8 13.5 7.5" stroke-width="1.6" opacity=".5"/></svg>`;

export function createSearch({ music, onPlay }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'cs';
  root.innerHTML = `<div class="cs-bar"><div class="cs-paper">${GLASS}<input class="cs-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="search songs" aria-label="Search songs"></div></div><ul class="cs-list"></ul>`;
  document.body.appendChild(root);
  const bar = root.querySelector('.cs-bar');
  const paper = root.querySelector('.cs-paper');
  const input = root.querySelector('.cs-input');
  const list = root.querySelector('.cs-list');
  paper.style.clipPath = torn(5, 4);

  // Brush strokes are drawn to the final size once the brush font is in (sizes follow the window).
  let strokes = {};
  const paintStrokes = () => {
    const w = Math.ceil(bar.getBoundingClientRect().width || 0);
    if (!w || strokes.w === w) return;
    const slipW = Math.ceil(list.getBoundingClientRect().width || w - 36);
    strokes = { w, bar: brushStroke(w, BAR_H, INK, 21), hl: brushStroke(slipW + 12, SLIP_H + 4, HOT, 33), note: brushStroke(slipW - 10, SLIP_H - 6, INK, 47) };
    bar.style.backgroundImage = `url(${strokes.bar})`;
    root.style.setProperty('--hl', `url(${strokes.hl})`);
    root.style.setProperty('--note', `url(${strokes.note})`);
  };
  const fontReady = (document.fonts?.load(`38px ${FONT}`) ?? Promise.resolve()).then(paintStrokes, paintStrokes);
  new ResizeObserver(() => fontReady.then(paintStrokes)).observe(root);

  // ---- state -----------------------------------------------------------------
  let isOpen = false;
  let seq = 0;            // bumped on every keystroke and every search: a response only counts if it is still the latest
  let timer = 0;
  let shown = [];         // items on the slips
  let shownFor = null;    // the query those items answer
  let hl = -1;
  let pendingEnter = false;
  const cache = new Map();

  function setHl(i) {
    hl = i;
    [...list.children].forEach((el, k) => el.classList.toggle('on', k === i));
  }

  function note(html) {
    list.className = 'cs-list';
    list.innerHTML = `<li class="cs-slipwrap" style="--i:0;--r:-.6deg"><div class="cs-note" style="background-image:var(--note)">${html}</div></li>`;
  }

  function render(items) {
    shown = items.slice(0, MAX_SLIPS);
    list.className = 'cs-list';
    list.innerHTML = '';
    if (!shown.length) { note('nothing found'); hl = -1; return; }
    shown.forEach((item, i) => {
      const r = rng(100 + i * 17);
      const li = document.createElement('li');
      li.className = 'cs-slipwrap';
      li.style.setProperty('--i', i);
      li.style.setProperty('--r', `${((r() - 0.5) * 1.8).toFixed(2)}deg`);
      li.style.marginLeft = `${Math.round((r() - 0.5) * 14)}px`;
      li.style.marginRight = `${Math.round(r() * 12)}px`;
      const slip = document.createElement('div');
      slip.className = 'cs-slip';
      slip.style.clipPath = torn(200 + i * 13, 4.5);
      slip.innerHTML = '<div class="cs-hl" style="background-image:var(--hl)"></div><div class="cs-cover"></div><div class="cs-txt"><div class="cs-t"></div><div class="cs-a"></div></div><div class="cs-d"></div>';
      const cover = slip.querySelector('.cs-cover');
      if (item.art) {
        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.onerror = () => { cover.innerHTML = '<i></i>'; };
        cover.innerHTML = '<i></i>'; // blank paper until the painted copy is ready
        paintedCoverURL(item.art).then((src) => { img.src = src; cover.replaceChildren(img); });
      } else cover.innerHTML = '<i></i>';
      slip.querySelector('.cs-t').textContent = item.title;
      slip.querySelector('.cs-a').textContent = [item.subtitle, item.album && item.album !== item.title ? item.album : ''].filter(Boolean).join(' · ');
      slip.querySelector('.cs-d').textContent = mmss(item.duration);
      li.appendChild(slip);
      li.addEventListener('mouseenter', () => setHl(i));
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keep the typing focus
      li.addEventListener('click', () => pick(i));
      list.appendChild(li);
    });
    setHl(-1);
  }

  function pick(i) {
    const item = shown[i];
    if (!item) return;
    close();
    onPlay(item);
  }

  function apply(items, q) {
    shownFor = q;
    render(items);
    if (pendingEnter) { pendingEnter = false; if (shown.length) pick(0); }
  }

  async function run() {
    const q = input.value.trim();
    if (!q) { shown = []; shownFor = null; list.innerHTML = ''; pendingEnter = false; return; }
    if (cache.has(q)) { seq++; apply(cache.get(q), q); return; }
    const mine = ++seq;
    if (!shown.length) note(`looking<span class="cs-dots"><span>.</span><span>.</span><span>.</span></span>`);
    try {
      const items = await music.search(q);
      if (mine !== seq) return; // typed on since: this answer is for an older query
      cache.set(q, items);
      apply(items, q);
    } catch (e) {
      if (mine !== seq) return;
      console.warn('[cadence] search failed', e);
      pendingEnter = false;
      note('could not search');
    }
  }

  // ---- input -----------------------------------------------------------------
  input.addEventListener('input', () => {
    seq++;
    clearTimeout(timer);
    pendingEnter = false;
    if (!input.value.trim()) { run(); return; }
    if (shown.length) list.classList.add('stale');
    timer = setTimeout(run, DEBOUNCE);
  });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the shop never sees keys typed here
    if (isToggle(e)) return; // handled by the window listener below
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHl(hl < 0 ? (d > 0 ? 0 : shown.length - 1) : (hl + d + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      if (shownFor === q && shown.length) pick(hl >= 0 ? hl : 0);
      else { pendingEnter = true; clearTimeout(timer); run(); } // play the top result as soon as it arrives
    }
  });
  for (const type of ['keyup', 'keypress']) input.addEventListener(type, (e) => e.stopPropagation());
  // Anything that steals the focus while the bar is open (a click on the painting) hands it back.
  input.addEventListener('blur', () => { if (isOpen) setTimeout(() => isOpen && document.hasFocus() && input.focus({ preventScroll: true }), 0); }); // not when the whole window lost focus (switching apps)

  // ---- open / close ------------------------------------------------------------
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function isToggle(e) {
    return e.code === 'KeyS' && e.altKey && (isMac ? e.metaKey : e.ctrlKey); // Option changes e.key on a Mac, so e.code
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    fontReady.then(paintStrokes);
    root.classList.add('show');
    input.focus({ preventScroll: true });
    input.select();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(timer);
    seq++; // answers still on their way are dropped
    pendingEnter = false;
    root.classList.remove('show');
    input.blur();
  }

  // The hotkey, in the capture phase so nothing in the shop sees it. While open, any key that is not
  // going to the input (focus lost) is swallowed too.
  window.addEventListener('keydown', (e) => {
    if (isToggle(e)) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) (isOpen ? close : open)();
    } else if (isOpen && e.target !== input) {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    }
  }, true);
  // A click anywhere outside the bar puts it away (the click still reaches the shop).
  window.addEventListener('pointerdown', (e) => { if (isOpen && !root.contains(e.target)) close(); }, true);

  // ---- screenshot hooks ----------------------------------------------------------
  const params = new URLSearchParams(location.search);
  if (params.has('search')) {
    input.value = params.get('search');
    open();
    run().then(() => { if (params.has('searchhl')) setHl(Number(params.get('searchhl'))); });
  }

  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, ready: () => fontReady };
}
