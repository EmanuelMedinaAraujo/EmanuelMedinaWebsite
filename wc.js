// Shared by main.js and scene.js. Must not depend on three.js: the page has to keep working if WebGL fails.

// "band": phones/tablets held upright; the stage is a fixed strip at the bottom (see styles.css).
export const band = matchMedia('(max-width: 899px) and (orientation: portrait)');
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// The section being read. `arm` is its data-arm mode, for sections without an exhibit.
export const section = { id: null, arm: undefined };

export const emit = (name, detail) => window.dispatchEvent(new CustomEvent('wc:' + name, { detail }));
