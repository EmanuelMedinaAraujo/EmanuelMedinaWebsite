// Workcell UI: theme, section tracking, navigation, deep-dive dialogs.
// Independent of three.js so the page stays fully usable if WebGL fails.

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
  window.dispatchEvent(new CustomEvent('wc:theme', { detail: { dark } }));
}
setTheme(root.dataset.theme || 'light', false);
toggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
sysDark.addEventListener('change', e => { if (!stored()) setTheme(e.matches ? 'dark' : 'light', false); });

/* ---------- section tracking ---------- */
const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('#rail a, #chips a')];
const chips = document.getElementById('chips');
window.__wc = window.__wc || { t: 'mouse', id: null };

function activate(sec) {
  const id = sec.id, t = sec.dataset.t;
  if (window.__wc.id === id) return;
  window.__wc = { t, id };
  for (const a of navLinks) {
    const on = a.getAttribute('href') === '#' + id;
    a.setAttribute('aria-current', on ? 'true' : 'false');
    if (on && a.parentElement === chips) {
      const left = a.offsetLeft - (chips.clientWidth - a.offsetWidth) / 2;
      chips.scrollTo({ left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  }
  window.dispatchEvent(new CustomEvent('wc:section', { detail: { t, id } }));
}

// A section becomes active when it crosses a reading line. In the upright mobile layout the
// stage covers the bottom of the screen, so the line sits a quarter of the way into the visible text.
const band = matchMedia('(max-width: 899px) and (orientation: portrait)');
let io;
function observe() {
  if (io) io.disconnect();
  let margin = '-48% 0px -48% 0px';
  if (band.matches && root.classList.contains('gl')) {
    const top = chips.getBoundingClientRect().bottom;
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
  dlg.querySelector('.deep-body').scrollTop = 0;
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
    const sec = window.__wc.id;
    history.replaceState(null, '', sec && sec !== 'top' ? '#' + sec : location.pathname + location.search);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    opener = null;
  });
});
if (location.hash.startsWith('#deep-')) openDeep(location.hash.slice(1));
