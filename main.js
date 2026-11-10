// Workcell UI: theme, section tracking, navigation, deep-dive dialogs.
// Independent of three.js so the page stays fully usable if WebGL fails.
import { band, reduceMotion, section, emit } from './wc.js';

const root = document.documentElement;

/* ---------- theme ---------- */
const toggle = document.querySelector('.theme-toggle');
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const stored = () => { try { return localStorage.getItem('theme'); } catch { return null; } };

function setTheme(theme, persist) {
  root.dataset.theme = theme;
  if (persist) { try { localStorage.setItem('theme', theme); } catch {} }
  const dark = theme === 'dark';
  toggle.setAttribute('aria-pressed', String(dark));
  toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  emit('theme', { dark });
}
setTheme(root.dataset.theme || 'light', false);
toggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
sysDark.addEventListener('change', e => { if (!stored()) setTheme(e.matches ? 'dark' : 'light', false); });

/* ---------- section tracking ---------- */
const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('#menu a, .nav a')];
// Each section belongs to the group that starts at or before it (data-group), so the
// desktop nav can mark Experience, Projects, About or Contact.
let group = null;
const groupOf = new Map(sections.map(s => [s, group = s.dataset.group ? s : group]));
const header = document.querySelector('.site-header');

function activate(sec) {
  const id = sec.id;
  if (section.id === id) return;
  section.id = id;
  section.arm = sec.dataset.arm;
  for (const s of sections) s.classList.toggle('on', s === sec);
  const g = groupOf.get(sec);
  for (const a of navLinks) {
    const to = document.getElementById(a.getAttribute('href').slice(1));
    const on = a.closest('.nav') ? !!g && groupOf.get(to) === g : to === sec;
    a.setAttribute('aria-current', on ? 'true' : 'false');
  }
  emit('section');
}

// A section becomes active when it crosses a reading line. In the upright mobile layout the
// stage covers the bottom of the screen, so the line sits a quarter of the way into the visible text.
let io;
function observe() {
  if (io) io.disconnect();
  let margin = '-35% 0px -64% 0px'; // a thin reading line a third of the way down
  if (band.matches && root.classList.contains('gl')) {
    const top = header.getBoundingClientRect().bottom;
    const bottom = document.getElementById('stage').getBoundingClientRect().top;
    const line = Math.round(top + (bottom - top) * .25);
    margin = `-${line}px 0px -${Math.max(0, innerHeight - line - 2)}px 0px`;
  }
  io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) activate(e.target);
  }, { rootMargin: margin });
  sections.forEach(s => io.observe(s));
}
observe();
let resizeT = 0;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(observe, 150); });
// Near the bottom the last section may never cross the centre line.
addEventListener('scroll', () => {
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) activate(sections[sections.length - 1]);
}, { passive: true });
activate(sections[0]);

/* ---------- menu (narrow screens) ---------- */
const menu = document.getElementById('menu');
const menuBtn = document.querySelector('.menu-btn');
function setMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); });
matchMedia('(min-width: 900px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

/* ---------- navigation ---------- */
function goTo(id, focus = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', '#' + id);
  if (focus) {
    const h = el.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
}
window.addEventListener('wc:goto', e => goTo(e.detail.id));
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]:not([data-deep])');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  if (!id || !document.getElementById(id) || id === 'main') return;
  e.preventDefault();
  goTo(id, true);
});

/* ---------- deep-dive dialogs ---------- */
let opener = null;
function openDeep(id, from) {
  const dlg = document.getElementById(id);
  if (!dlg || dlg.open) return;
  opener = from || document.activeElement;
  dlg.showModal();
  document.body.classList.add('lock');
  dlg.scrollTop = 0;
  history.replaceState(null, '', '#' + id);
}
document.querySelectorAll('[data-deep]').forEach(btn => btn.addEventListener('click', e => {
  e.preventDefault();
  openDeep(btn.dataset.deep, btn);
}));
document.querySelectorAll('dialog.deep').forEach(dlg => {
  dlg.querySelector('.close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // backdrop
  dlg.addEventListener('close', () => {
    document.body.classList.remove('lock');
    const sec = section.id;
    history.replaceState(null, '', sec && sec !== 'top' ? '#' + sec : location.pathname + location.search);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    opener = null;
  });
});
if (location.hash.startsWith('#deep-')) openDeep(location.hash.slice(1));
