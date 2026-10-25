// Reach: theme, navigation, deep-dive dialogs and the FABRIK robot arm.

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Theme ---------- */
const themeBtn = document.getElementById('theme-toggle');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

function storedTheme() {
  try { return localStorage.getItem('theme'); } catch { return null; }
}
function applyTheme(theme, persist) {
  root.dataset.theme = theme;
  if (persist) { try { localStorage.setItem('theme', theme); } catch {} }
  const dark = theme === 'dark';
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  listeners.forEach(fn => fn(theme));
}
applyTheme(root.dataset.theme || 'dark', false);
themeBtn.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
systemDark.addEventListener('change', e => { if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', false); });

/* ---------- Mobile menu ---------- */
const menuBtn = document.getElementById('menu-toggle');
const navLinks = document.getElementById('nav-links');
function setMenu(open) {
  navLinks.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuBtn.addEventListener('click', () => setMenu(!navLinks.classList.contains('is-open')));
navLinks.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && navLinks.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });
document.addEventListener('click', e => { if (navLinks.classList.contains('is-open') && !e.target.closest('.nav')) setMenu(false); });

/* ---------- Active section in nav ---------- */
const sectionLinks = [...navLinks.querySelectorAll('a')];
const spy = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    sectionLinks.forEach(a => {
      if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section[id]').forEach(s => spy.observe(s));

/* ---------- Chart reveal ---------- */
const chart = document.querySelector('.chart');
if (chart) {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { chart.classList.add('is-in'); io.disconnect(); } }, { threshold: .4 });
  io.observe(chart);
}

/* ---------- Diagram arrowheads ---------- */
document.querySelectorAll('.diagram svg').forEach((svg, i) => {
  const id = `arrow-${i}`;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--blue)"/></marker>`;
  svg.prepend(defs);
  svg.querySelectorAll('.dg-arrows path').forEach(p => p.setAttribute('marker-end', `url(#${id})`));
});

/* ---------- Deep-dive dialogs ---------- */
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
document.querySelectorAll('[data-deep]').forEach(btn => btn.addEventListener('click', () => openDeep(btn.dataset.deep, btn)));
document.querySelectorAll('dialog.deep').forEach(dlg => {
  dlg.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
    if (location.hash.startsWith('#deep-')) history.replaceState(null, '', location.pathname + location.search);
    const fallback = document.querySelector(`[data-deep="${dlg.id.slice(5)}"]`);
    (lastOpener || fallback)?.focus({ preventScroll: true });
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

/* ---------- FABRIK robot arm ---------- */
const canvas = document.getElementById('arm');
const frame = canvas?.parentElement;
const readout = document.getElementById('readout');

if (canvas && frame) {
  const ctx = canvas.getContext('2d');
  const RATIOS = [.34, .3, .23, .13];          // segment lengths as share of reach
  let W = 0, H = 0, dpr = 1, reach = 0, lens = [];
  let base = { x: 0, y: 0 };
  let joints = [];
  const target = { x: 0, y: 0 }, goal = { x: 0, y: 0 };
  let lastInput = -1e9, running = false, visible = true, raf = 0, frameCount = 0;
  let colors = {};

  function readColors() {
    const cs = getComputedStyle(root);
    colors = {
      line: cs.getPropertyValue('--arm-line').trim(),
      fill: cs.getPropertyValue('--arm-fill').trim(),
      dim: cs.getPropertyValue('--arm-dim').trim(),
      accent: cs.getPropertyValue('--accent').trim(),
      mute: cs.getPropertyValue('--mute').trim(),
    };
  }

  function resize() {
    const r = frame.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    reach = Math.min(H * .86, W * .78);
    lens = RATIOS.map(k => k * reach);
    base = { x: W * .5, y: H - 18 };
    joints = [{ ...base }];
    let y = base.y;
    for (const l of lens) { y -= l; joints.push({ x: base.x + 0.001, y }); }
    const home = idlePoint(0);
    target.x = goal.x = home.x; target.y = goal.y = home.y;
    draw(solve(target));
  }

  function idlePoint(t) {
    return {
      x: base.x + Math.cos(t * .55) * reach * .5,
      y: base.y - reach * .6 + Math.sin(t * .9) * reach * .2,
    };
  }

  // FABRIK: returns whether the target is within reach.
  function solve(t) {
    const total = lens.reduce((a, b) => a + b, 0);
    const d = Math.hypot(t.x - base.x, t.y - base.y);
    if (d >= total) {
      for (let i = 0; i < lens.length; i++) {
        const dd = Math.hypot(t.x - joints[i].x, t.y - joints[i].y) || 1e-6, k = lens[i] / dd;
        joints[i + 1] = { x: (1 - k) * joints[i].x + k * t.x, y: (1 - k) * joints[i].y + k * t.y };
      }
      return false;
    }
    for (let it = 0; it < 10; it++) {
      joints[joints.length - 1] = { x: t.x, y: t.y };
      for (let i = joints.length - 2; i >= 0; i--) {
        const dd = Math.hypot(joints[i + 1].x - joints[i].x, joints[i + 1].y - joints[i].y) || 1e-6, k = lens[i] / dd;
        joints[i] = { x: (1 - k) * joints[i + 1].x + k * joints[i].x, y: (1 - k) * joints[i + 1].y + k * joints[i].y };
      }
      joints[0] = { ...base };
      for (let i = 0; i < joints.length - 1; i++) {
        const dd = Math.hypot(joints[i + 1].x - joints[i].x, joints[i + 1].y - joints[i].y) || 1e-6, k = lens[i] / dd;
        joints[i + 1] = { x: (1 - k) * joints[i].x + k * joints[i + 1].x, y: (1 - k) * joints[i].y + k * joints[i + 1].y };
      }
      if (Math.hypot(joints[joints.length - 1].x - t.x, joints[joints.length - 1].y - t.y) < .5) break;
    }
    return true;
  }

  function draw(ok) {
    ctx.clearRect(0, 0, W, H);
    const total = lens.reduce((a, b) => a + b, 0);

    // reach envelope
    ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.strokeStyle = colors.dim;
    ctx.beginPath(); ctx.arc(base.x, base.y, total, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);

    // ground
    ctx.strokeStyle = colors.dim; ctx.beginPath(); ctx.moveTo(base.x - 60, base.y + 10); ctx.lineTo(base.x + 60, base.y + 10); ctx.stroke();
    for (let x = -56; x <= 56; x += 10) { ctx.beginPath(); ctx.moveTo(base.x + x, base.y + 10); ctx.lineTo(base.x + x - 6, base.y + 16); ctx.stroke(); }

    // target crosshair
    ctx.strokeStyle = ok ? colors.accent : colors.mute; ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.arc(goal.x, goal.y, 11, 0, Math.PI * 2);
    ctx.moveTo(goal.x - 19, goal.y); ctx.lineTo(goal.x - 6, goal.y); ctx.moveTo(goal.x + 6, goal.y); ctx.lineTo(goal.x + 19, goal.y);
    ctx.moveTo(goal.x, goal.y - 19); ctx.lineTo(goal.x, goal.y - 6); ctx.moveTo(goal.x, goal.y + 6); ctx.lineTo(goal.x, goal.y + 19);
    ctx.stroke();

    // links
    const s = reach / 420;
    for (let i = 0; i < joints.length - 1; i++) {
      const a = joints[i], b = joints[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const w = Math.max(4, (13 - i * 2.6) * s + 3);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.fillStyle = colors.fill; ctx.strokeStyle = colors.line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-w, -w, len + 2 * w, 2 * w, w); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = colors.dim; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.restore();
    }
    // joints
    joints.forEach((j, i) => {
      const end = i === joints.length - 1;
      ctx.fillStyle = colors.fill; ctx.strokeStyle = end ? colors.accent : colors.line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(j.x, j.y, i === 0 ? 11 : end ? 5 : 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    // readout (throttled)
    if (readout && frameCount++ % 6 === 0) {
      let prev = -Math.PI / 2;
      const out = [];
      for (let i = 0; i < joints.length - 1; i++) {
        const a = Math.atan2(joints[i + 1].y - joints[i].y, joints[i + 1].x - joints[i].x);
        let rel = (a - prev) * 180 / Math.PI;
        rel = ((rel + 540) % 360) - 180;
        out.push(`θ${i + 1} ${rel.toFixed(1).padStart(6, ' ')}°`);
        prev = a;
      }
      readout.textContent = out.join('\n');
    }
  }

  function setGoalFromClient(cx, cy) {
    const r = canvas.getBoundingClientRect();
    goal.x = cx - r.left; goal.y = cy - r.top;
    lastInput = performance.now();
  }

  function tick(now) {
    if (!running) return;
    if (now - lastInput > 2500) {
      const p = idlePoint(now / 1000);
      goal.x += (p.x - goal.x) * .04; goal.y += (p.y - goal.y) * .04;
    }
    target.x += (goal.x - target.x) * .14; target.y += (goal.y - target.y) * .14;
    draw(solve(target));
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduceMotion.matches || !visible || document.hidden) return;
    running = true; raf = requestAnimationFrame(tick);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function renderStatic() {
    const p = { x: base.x + reach * .42, y: base.y - reach * .55 };
    goal.x = target.x = p.x; goal.y = target.y = p.y;
    draw(solve(target));
  }

  readColors();
  resize();
  listeners.add(() => { readColors(); if (!running) draw(solve(target)); });

  new ResizeObserver(() => { resize(); if (reduceMotion.matches) renderStatic(); }).observe(frame);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(frame);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) { stop(); renderStatic(); } else start(); });

  // Mouse anywhere in the hero; touch only while touching the drawing (keeps page scroll natural).
  const hero = frame.closest('.hero');
  hero.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') setGoalFromClient(e.clientX, e.clientY); });
  frame.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') setGoalFromClient(e.clientX, e.clientY); });
  frame.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') setGoalFromClient(e.clientX, e.clientY); });

  if (reduceMotion.matches) renderStatic(); else start();
}
