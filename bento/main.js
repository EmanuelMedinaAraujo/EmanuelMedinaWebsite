// Bento: theme, deep-dive dialogs, the Glücksrad tile and the mini robot arm.

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- theme ---------- */
const toggle = document.getElementById('theme-toggle');
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const stored = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
const themeListeners = [];

function setTheme(theme, persist) {
  root.dataset.theme = theme;
  if (persist) { try { localStorage.setItem('theme', theme); } catch {} }
  const dark = theme === 'dark';
  toggle.setAttribute('aria-pressed', String(dark));
  toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#0d0e10' : '#f3f1ec'));
  themeListeners.forEach(fn => fn());
}
setTheme(root.dataset.theme || 'light', false);
toggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
sysDark.addEventListener('change', e => { if (!stored()) setTheme(e.matches ? 'dark' : 'light', false); });

/* ---------- header border on scroll ---------- */
const header = document.querySelector('.top');
const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- diagram arrowheads ---------- */
document.querySelectorAll('.diagram svg').forEach((svg, i) => {
  const id = `arrow-${i}`;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--acc)"/></marker>`;
  svg.prepend(defs);
  svg.querySelectorAll('.dg-arrows path').forEach(p => p.setAttribute('marker-end', `url(#${id})`));
});

/* ---------- deep-dive dialogs ---------- */
let lastOpener = null;
function openDeep(slug, opener) {
  const dlg = document.getElementById('deep-' + slug);
  if (!dlg || dlg.open) return;
  lastOpener = opener || null;
  dlg.showModal();
  document.body.classList.add('is-locked');
  dlg.querySelector('.deep__body').scrollTop = 0;
  if (location.hash !== '#deep-' + slug) history.replaceState(null, '', '#deep-' + slug);
}
document.querySelectorAll('[data-deep]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  openDeep(a.dataset.deep, a);
}));
document.querySelectorAll('dialog.deep').forEach(dlg => {
  dlg.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
    if (location.hash.startsWith('#deep-')) history.replaceState(null, '', location.pathname + location.search);
    const fallback = document.querySelector(`[data-deep="${dlg.id.slice(5)}"]`);
    (lastOpener || fallback)?.focus({ preventScroll: true });
    lastOpener = null;
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
});
function openFromHash() {
  const m = location.hash.match(/^#deep-([\w-]+)$/);
  if (m) openDeep(m[1], null);
}
addEventListener('hashchange', openFromHash);
openFromHash();

/* ---------- Glücksrad: fair spin via crypto.getRandomValues ---------- */
const wheelSvg = document.querySelector('.wheel__svg');
const spinG = document.getElementById('wheel-spin');
const spinBtn = document.getElementById('wheel-btn');
const out = document.getElementById('wheel-out');
if (wheelSvg && spinG && spinBtn) {
  const LABELS = ['Pizza', 'Sushi', 'Burger', 'Pasta', 'Curry', 'Cook'];
  let angle = 0, spinning = false;
  const randInt = n => { // unbiased integer in [0, n)
    const buf = new Uint32Array(1), limit = 2 ** 32 - (2 ** 32 % n);
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  };
  function spin() {
    if (spinning) return;
    const i = randInt(LABELS.length);
    const jitter = randInt(41) - 20;
    // Segment i is centred at -60 + 60i degrees; the pin sits at -90.
    const want = (((-30 - 60 * i + jitter) % 360) + 360) % 360;
    const delta = ((want - angle) % 360 + 360) % 360;
    angle += delta + (reduce.matches ? 0 : 360 * 5);
    const done = () => {
      spinning = false; spinBtn.disabled = false;
      out.textContent = `Landed on ${LABELS[i]}`;
    };
    spinning = true; spinBtn.disabled = true;
    if (reduce.matches) {
      spinG.style.transition = 'none';
      spinG.style.transform = `rotate(${angle}deg)`;
      done();
      return;
    }
    out.textContent = 'Spinning…';
    spinG.style.transition = 'transform 3.4s cubic-bezier(.12,.66,.12,1)';
    spinG.style.transform = `rotate(${angle}deg)`;
    spinG.addEventListener('transitionend', done, { once: true });
  }
  spinBtn.addEventListener('click', spin);
  let start = null;
  wheelSvg.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; wheelSvg.setPointerCapture(e.pointerId); });
  wheelSvg.addEventListener('pointerup', () => { if (start) spin(); start = null; });
  wheelSvg.addEventListener('pointercancel', () => { start = null; });
}

/* ---------- mini 2-joint arm (analytic inverse kinematics) ---------- */
const canvas = document.getElementById('arm');
const tile = canvas?.closest('.tile');
if (canvas && tile) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, L1 = 0, L2 = 0, base = { x: 0, y: 0 };
  let colors = {}, visible = false, raf = 0, lastPointer = -1e9;
  const target = { x: 0, y: 0 }, goal = { x: 0, y: 0 };
  const hint = tile.querySelector('.arm__hint');

  function readColors() {
    const cs = getComputedStyle(tile);
    colors = { acc: cs.getPropertyValue('--acc').trim(), ink: cs.getPropertyValue('--ink').trim(), mute: cs.getPropertyValue('--mute').trim(), tile: cs.getPropertyValue('--tile').trim(), line: cs.getPropertyValue('--line2').trim() };
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    base = { x: W * .5, y: H * .9 };
    L1 = Math.min(W * .25, H * .44); L2 = L1 * .86;
    if (!target.x) { goal.x = target.x = base.x + L1 * .9; goal.y = target.y = base.y - L1 * 1.1; }
    draw();
  }
  function solve(tx, ty) {
    let dx = tx - base.x, dy = ty - base.y;
    let d = Math.hypot(dx, dy);
    const max = L1 + L2 - .5, min = Math.abs(L1 - L2) + 2;
    if (d > max || d < min) { const k = Math.min(Math.max(d, min), max) / (d || 1); dx *= k; dy *= k; d = Math.hypot(dx, dy); }
    const a = Math.atan2(dy, dx);
    const b = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const t1 = a - b; // elbow up on screen
    const elbow = { x: base.x + Math.cos(t1) * L1, y: base.y + Math.sin(t1) * L1 };
    return { elbow, hand: { x: base.x + dx, y: base.y + dy } };
  }
  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // reach circle
    ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(base.x, base.y, L1 + L2, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    // floor
    ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(12, base.y + 6); ctx.lineTo(W - 12, base.y + 6); ctx.stroke();
    const { elbow, hand } = solve(target.x, target.y);
    // target
    ctx.strokeStyle = colors.mute; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(goal.x, goal.y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(goal.x - 11, goal.y); ctx.lineTo(goal.x + 11, goal.y); ctx.moveTo(goal.x, goal.y - 11); ctx.lineTo(goal.x, goal.y + 11); ctx.stroke();
    // links
    ctx.lineCap = 'round'; ctx.strokeStyle = colors.acc;
    ctx.lineWidth = Math.max(8, L1 * .16);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(elbow.x, elbow.y); ctx.stroke();
    ctx.lineWidth = Math.max(6, L1 * .12);
    ctx.beginPath(); ctx.moveTo(elbow.x, elbow.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    // base
    ctx.fillStyle = colors.ink;
    ctx.beginPath(); ctx.moveTo(base.x - 22, base.y + 6); ctx.lineTo(base.x - 13, base.y - 6); ctx.lineTo(base.x + 13, base.y - 6); ctx.lineTo(base.x + 22, base.y + 6); ctx.closePath(); ctx.fill();
    // joints
    for (const [p, r] of [[base, 8], [elbow, 7], [hand, 5]]) {
      ctx.fillStyle = colors.tile; ctx.strokeStyle = colors.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  let last = performance.now();
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    const t = now / 1000;
    if (now - lastPointer > 2500 && !reduce.matches) {
      const R = L1 + L2;
      goal.x = base.x + Math.sin(t * .7) * R * .75;
      goal.y = base.y - R * (.55 + .28 * Math.sin(t * 1.13));
    }
    const k = reduce.matches ? 1 : 1 - Math.pow(.0015, dt);
    target.x += (goal.x - target.x) * k; target.y += (goal.y - target.y) * k;
    draw();
    if (visible && !document.hidden && !reduce.matches) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  tile.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    goal.x = e.clientX - r.left; goal.y = Math.min(e.clientY - r.top, base.y - 4);
    lastPointer = performance.now();
    if (hint) hint.style.opacity = '0';
    kick();
  }, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  reduce.addEventListener('change', kick);
  new ResizeObserver(resize).observe(canvas);
  themeListeners.push(() => { readColors(); draw(); });
  readColors(); resize();
}
