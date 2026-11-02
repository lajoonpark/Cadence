// Player buttons: a stack of words in the bottom-left, each one left as bare paper inside a
// dark watercolour brush stroke (the way a painter masks out whites). The stack is turned inward,
// toward the middle of the screen, and tilts with the cursor. Idea from a game title screen
// (PLAY / CREDITS), repainted for the shop.
import { rng } from './rand.js';
import { FONT } from './style.js';

export const INK = '#2d3158';   // indigo wash
const HOT = '#b4503a';   // terracotta on hover / liked
export const PAPER = '#fbf5e8';

// One broad brush stroke as an image: layered thin washes with ragged edges, a darker wet edge,
// dry-brush streaks trailing off the end and granulation speckle.
export function brushStroke(w, h, color, seed) {
  const c = document.createElement('canvas');
  const S = 2;
  c.width = w * S; c.height = h * S;
  const g = c.getContext('2d');
  g.scale(S, S);
  const r = rng(seed);
  const walk = (n, amp) => { let v = 0; return Array.from({ length: n }, () => (v = Math.max(-amp, Math.min(amp, v + (r() - 0.5) * amp * 0.9)))); };
  const step = 6;
  const n = Math.ceil(w / step) + 1;
  const x0 = h * 0.18, x1 = w - h * 0.3;
  let last = null;
  g.fillStyle = color;
  for (let pass = 0; pass < 12; pass++) {
    const top = walk(n, 3.5), bot = walk(n, 3.5);
    const p = new Path2D();
    const sk = h * 0.16; // the stroke leans like a fast italic swipe
    p.moveTo(x0 + sk + r() * 6, 5 + top[0]);
    for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i / (n - 1)); p.lineTo(x + sk, 5 + top[i] + pass * 0.15); }
    p.quadraticCurveTo(x1 + sk + h * 0.25, h * 0.45, x1 - sk * 0.2, h - 5 + bot[n - 1]);
    for (let i = n - 1; i >= 0; i--) { const x = x0 + (x1 - x0) * (i / (n - 1)); p.lineTo(x - sk, h - 5 + bot[i] - pass * 0.15); }
    p.quadraticCurveTo(x0 - sk - h * 0.2, h * 0.55, x0 + sk + r() * 6, 5 + top[0]);
    g.globalAlpha = 0.11;
    g.fill(p);
    last = p;
  }
  // wet edge: pigment pooled where the wash dried
  g.globalAlpha = 0.35;
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  g.stroke(last);
  // dry brush streaks off the end of the stroke
  for (let i = 0; i < 9; i++) {
    const y = 8 + r() * (h - 16);
    g.globalAlpha = 0.25 + r() * 0.35;
    g.lineWidth = 0.8 + r() * 2.2;
    g.beginPath();
    g.moveTo(x1 - 20, y);
    g.lineTo(x1 + r() * h * 0.5, y + (r() - 0.5) * 3);
    g.stroke();
  }
  // granulation
  g.globalAlpha = 0.18;
  for (let i = 0; i < w * h * 0.03; i++) {
    g.fillRect(x0 + r() * (x1 - x0), 4 + r() * (h - 8), 0.6 + r() * 1.2, 0.6 + r() * 1.2);
  }
  return c.toDataURL();
}

const CSS = `
.deck { position: fixed; left: 3.5vw; bottom: 6vh; perspective: 900px; perspective-origin: 20% 50%;
  pointer-events: none; opacity: 0; transition: opacity .9s ease; user-select: none; }
.deck.show { opacity: 1; }
.deck .stack { transform-style: preserve-3d; transform-origin: 0% 50%; will-change: transform;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.deck .caption { pointer-events: auto; margin: 0 0 10px 6px; padding: 10px 22px 12px 18px; max-width: 360px;
  background: ${PAPER}; color: #2b2436; font-family: ${FONT};
  clip-path: polygon(0 6%, 18% 0, 47% 4%, 72% 0, 100% 5%, 98% 52%, 100% 96%, 66% 100%, 38% 95%, 9% 100%, 2% 60%);
  filter: drop-shadow(0 2px 0 rgba(60,40,30,.15)); transform: rotate(-1.5deg); transition: opacity .4s; }
.deck .caption .t { font-size: 30px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck .caption .a { font-size: 20px; color: #7a5a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck .caption .bar { position: relative; height: 10px; margin-top: 6px; cursor: pointer; }
.deck .caption .bar::before { content: ''; position: absolute; left: 0; right: 0; top: 4px; height: 2px; background: rgba(45,49,88,.18); border-radius: 2px; }
.deck .caption .bar i { position: absolute; left: 0; top: 2px; height: 6px; border-radius: 3px 6px 6px 3px; background: ${INK}; opacity: .85; }
.deck .caption.empty { opacity: 0; pointer-events: none; }
.deck button { pointer-events: auto; position: relative; border: 0; padding: 0; background: none; cursor: pointer;
  font-family: ${FONT}; color: ${PAPER}; line-height: 1; letter-spacing: .02em;
  transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.deck button .plate { position: absolute; inset: 0; background-size: 100% 100%; transition: opacity .25s; }
.deck button .plate.hot { opacity: 0; }
.deck button:hover .plate.hot, .deck button.on .plate.hot { opacity: 1; }
.deck button:hover { transform: translateX(6px) translateZ(18px) rotate(-1deg); }
.deck button:active { transform: translateX(4px) translateZ(4px) scale(.97); }
.deck button span { position: relative; display: block; text-shadow: 0 0 1px rgba(251,245,232,.7); }
.deck button.big span { font-size: 84px; padding: 10px 74px 6px 40px; }
.deck button.small span { font-size: 44px; padding: 6px 48px 4px 30px; }
`;

const BUTTONS = [
  { id: 'signin', label: 'SIGN IN', size: 'small', indent: 0, hidden: true },
  { id: 'toggle', label: 'PLAY', size: 'big', indent: 0 },
  { id: 'next', label: 'SKIP', size: 'small', indent: 34 },
  { id: 'previous', label: 'BACK', size: 'small', indent: 14 },
  { id: 'like', label: 'LIKE', size: 'small', indent: 44 },
];

export function createControls({ onCommand, onSignIn }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const deck = document.createElement('div');
  deck.className = 'deck';
  const stack = document.createElement('div');
  stack.className = 'stack';
  deck.appendChild(stack);

  const caption = document.createElement('div');
  caption.className = 'caption empty';
  caption.innerHTML = '<div class="t"></div><div class="a"></div><div class="bar"><i></i></div>';
  stack.appendChild(caption);
  const capT = caption.querySelector('.t'), capA = caption.querySelector('.a'), capBar = caption.querySelector('.bar'), capFill = caption.querySelector('.bar i');

  const els = {};
  BUTTONS.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = b.size;
    el.style.marginLeft = `${b.indent}px`;
    if (b.hidden) el.style.display = 'none';
    el.innerHTML = `<div class="plate"></div><div class="plate hot"></div><span>${b.label}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); b.id === 'signin' ? onSignIn() : onCommand(b.id); });
    stack.appendChild(el);
    els[b.id] = el;
    el.dataset.seed = String(11 + i * 7);
  });
  document.body.appendChild(deck);

  // Plates are drawn to each button's size once the brush font has loaded (so the size is final).
  const paint = () => {
    for (const el of Object.values(els)) {
      const { width, height } = el.getBoundingClientRect();
      if (!width) continue;
      const seed = Number(el.dataset.seed);
      const [cold, hot] = el.querySelectorAll('.plate');
      cold.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), INK, seed)})`;
      hot.style.backgroundImage = `url(${brushStroke(Math.ceil(width), Math.ceil(height), HOT, seed)})`;
    }
  };
  const fontReady = (document.fonts?.load(`84px ${FONT}`) ?? Promise.resolve()).then(paint, paint);

  let duration = 0;
  capBar.addEventListener('click', (e) => {
    const b = capBar.getBoundingClientRect();
    if (duration > 0) onCommand('seek', ((e.clientX - b.left) / b.width) * duration);
  });

  const setLabel = (id, text) => {
    const span = els[id].querySelector('span');
    if (span.textContent !== text) { span.textContent = text; fontReady.then(paint); }
  };

  return {
    ready: () => fontReady,
    show(on, instant = false) {
      if (instant) deck.style.transition = 'none';
      deck.classList.toggle('show', on);
    },
    // Turned in toward the middle of the screen; tilts after the cursor. tx, ty in -1..1.
    tilt(tx, ty) {
      stack.style.transform = `rotateY(${30 + tx * 10}deg) rotateX(${-ty * 8}deg) rotateZ(${-2 - tx * 1.5}deg)`;
    },
    setState(s, { real }) {
      const signIn = real && s.ready && !s.signedIn ? '' : 'none';
      if (els.signin.style.display !== signIn) {
        els.signin.style.display = signIn;
        if (!signIn) fontReady.then(paint); // it had no size while hidden, so no plate yet
      }
      setLabel('toggle', s.playerState === 1 || s.playerState === 3 ? 'PAUSE' : 'PLAY');
      const liked = s.like === 'LIKE';
      setLabel('like', liked ? 'LIKED' : 'LIKE');
      els.like.classList.toggle('on', liked);
      const has = !!(s.title || s.adPlaying);
      caption.classList.toggle('empty', !has);
      capT.textContent = s.adPlaying ? 'A short ad…' : s.title ?? '';
      capA.textContent = s.adPlaying ? 'your record plays next' : [s.artist, s.album].filter(Boolean).join(' · ');
      duration = s.duration || 0;
      capFill.style.width = `${duration ? Math.min(100, (s.position / duration) * 100) : 0}%`;
    },
  };
}
