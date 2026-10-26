// Workcell 3D stage: a 4-axis industrial arm with analytic inverse kinematics.
// If anything here fails, the page keeps working as a plain text site (no .gl class).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.documentElement;
const canvas = document.getElementById('stage');
const tagLayer = document.getElementById('tags');
const hud = document.getElementById('hud');
const col = document.querySelector('.col');
const footer = document.querySelector('.site-footer');
const rail = document.getElementById('rail');
// "band": phones/tablets held upright; the stage is a fixed strip at the top (see styles.css).
const band = matchMedia('(max-width: 899px) and (orientation: portrait)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const lowPower = matchMedia('(max-width: 899px)').matches || matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;

const PALETTE = {
  light: { bg: 0xe9e7e2, floor: 0xe9e7e2, floorRough: 1, floorMetal: 0, ped: 0xf4f3ef, pedTop: 0x2a2a2c, ring: 0x141414, ringOp: .15, grid: 0x000000, gridOp: .05,
           sky: 0xffffff, ground: 0xbdb8ad, hemi: .6, sun: 2.2, rim: 0, env: 1, exposure: 1, fog: [9, 20] },
  dark:  { bg: 0x0f1012, floor: 0x141518, floorRough: .95, floorMetal: 0, ped: 0x2c2d32, pedTop: 0x45464d, ring: 0xffffff, ringOp: .12, grid: 0xffffff, gridOp: .035,
           sky: 0x9aa6b8, ground: 0x0b0b0c, hemi: .38, sun: 1.5, rim: 1.1, env: .4, exposure: 1.08, fog: [9, 19] },
};

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower || devicePixelRatio < 2, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('Workcell: WebGL unavailable, showing the text-only layout.', err);
    root.classList.remove('gl');
    return;
  }
  root.classList.add('gl');
  let fogBase = [9, 20], camDist = 7.2;
  const fitFog = () => { const s = camDist / 7.2; scene.fog.near = fogBase[0] * s; scene.fog.far = fogBase[1] * s; };
  let running = true, footerCovers = false, dirty = 2, raf = 0;
  function invalidate() { dirty = Math.max(dirty, 3); if (running && !raf) raf = requestAnimationFrame(frame); }
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const SEG = lowPower ? 20 : 40;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 9, 20);
  scene.background = new THREE.Color();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xbdb8ad, .6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 7, 4);
  sun.castShadow = true;
  const sm = lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.bias = -.0004;
  sun.shadow.radius = 5;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffb27a, 0);
  rim.position.set(-3, 6, -6);
  scene.add(rim);

  // floor
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.57, 96), new THREE.MeshBasicMaterial({ transparent: true }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .002;
  scene.add(ring);
  const grid = new THREE.GridHelper(12, 24);
  grid.material.transparent = true;
  grid.position.y = .001;
  scene.add(grid);

  // materials
  const ORANGE = new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: .38, metalness: .1 });
  const DARK = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: .5, metalness: .4 });
  const STEEL = new THREE.MeshStandardMaterial({ color: 0xb9b9bd, roughness: .25, metalness: .9 });
  const PED = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: .6 });
  const PEDTOP = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: .5, metalness: .4 });
  const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };

  /* ---------- robot arm ---------- */
  const H0 = .62, L1 = 1.15, L2 = 1.0, L3 = .32;
  const arm = new THREE.Group();
  scene.add(arm);
  const plinth = mesh(new THREE.CylinderGeometry(.42, .48, .12, SEG), DARK); plinth.position.y = .06; arm.add(plinth);
  const yawG = new THREE.Group(); yawG.position.y = .12; arm.add(yawG);
  const turret = mesh(new THREE.CylinderGeometry(.3, .36, .38, SEG), ORANGE); turret.position.y = .19; yawG.add(turret);
  const shoulder = new THREE.Group(); shoulder.position.y = H0 - .12; yawG.add(shoulder);
  const sj = mesh(new THREE.CylinderGeometry(.2, .2, .46, SEG), DARK); sj.rotation.x = Math.PI / 2; shoulder.add(sj);
  const upper = mesh(new THREE.BoxGeometry(L1, .22, .26), ORANGE); upper.position.x = L1 / 2; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.x = L1; shoulder.add(elbow);
  const ej = mesh(new THREE.CylinderGeometry(.16, .16, .36, SEG), DARK); ej.rotation.x = Math.PI / 2; elbow.add(ej);
  const fore = mesh(new THREE.BoxGeometry(L2, .17, .2), ORANGE); fore.position.x = L2 / 2; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.x = L2; elbow.add(wrist);
  const wj = mesh(new THREE.CylinderGeometry(.11, .11, .26, SEG), DARK); wj.rotation.x = Math.PI / 2; wrist.add(wj);
  const flange = mesh(new THREE.CylinderGeometry(.08, .08, L3 * .6, SEG), STEEL); flange.rotation.z = Math.PI / 2; flange.position.x = L3 * .3; wrist.add(flange);
  const palm = mesh(new THREE.BoxGeometry(.06, .24, .12), DARK); palm.position.x = L3 * .62; wrist.add(palm);
  const fingers = [1, -1].map(s => { const f = mesh(new THREE.BoxGeometry(.14, .035, .08), STEEL); f.position.set(L3 * .62 + .09, .07 * s, 0); wrist.add(f); return f; });

  // Analytic IK: base yaw + planar 2-link solution, wrist kept pointing down.
  function solveIK(T) {
    const W = new THREE.Vector3(T.x, T.y + L3, T.z);
    const yaw = Math.atan2(-W.z, W.x);
    const r = Math.hypot(W.x, W.z), z = W.y - H0;
    let d = Math.hypot(r, z);
    const reach = d <= L1 + L2 - .001;
    d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + .05, L1 + L2 - .001);
    const a1 = Math.atan2(z, r) + Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const a2 = -(Math.PI - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
    return { yaw, a1, a2, reach };
  }
  const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  /* ---------- exhibits ---------- */
  const R = 1.85, N = 7;
  const exhibits = [];
  const pickables = [];
  const M = (c, r = .5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  function pedestal(i, label, id, build) {
    const phi = THREE.MathUtils.degToRad(-115 + i * (230 / (N - 1)));
    const g = new THREE.Group();
    g.position.set(R * Math.sin(phi), 0, R * Math.cos(phi));
    scene.add(g);
    const p = mesh(new THREE.CylinderGeometry(.24, .27, .5, SEG), PED); p.position.y = .25; g.add(p);
    const top = mesh(new THREE.CylinderGeometry(.25, .25, .02, SEG), PEDTOP); top.position.y = .51; g.add(top);
    const item = new THREE.Group(); item.position.y = .52; g.add(item);
    build(item);
    item.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.emissive.setHex(0xff6a13); o.material.emissiveIntensity = 0; }
    });
    g.traverse(o => { if (o.isMesh) { o.userData.ex = i; pickables.push(o); } });
    const tag = document.createElement('button');
    tag.type = 'button'; tag.className = 'tag'; tag.tabIndex = -1; tag.textContent = label;
    tag.addEventListener('click', () => window.dispatchEvent(new CustomEvent('wc:goto', { detail: { id } })));
    tagLayer.appendChild(tag);
    exhibits.push({ g, item, tag, phi, id, top: .84, glow: 0 });
  }
  pedestal(0, 'VSceneCreator', 'vscenecreator', it => { // road tile
    const tile = mesh(new THREE.BoxGeometry(.36, .04, .36), M(0x2d2e31, .9)); tile.position.y = .02; it.add(tile);
    for (let k = -1; k <= 1; k++) { const d = mesh(new THREE.BoxGeometry(.02, .045, .06), M(0xf6c400, .6)); d.position.set(0, .025, k * .11); it.add(d); }
    [-.16, .16].forEach(x => { const e = mesh(new THREE.BoxGeometry(.012, .045, .36), M(0xffffff, .6)); e.position.set(x, .025, 0); it.add(e); });
    const tw = mesh(new THREE.ConeGeometry(.05, .12, 4), M(0x1d4f9c, .4)); tw.position.set(.1, .12, .1); it.add(tw);
  });
  pedestal(1, 'DYNA4', 'dyna4', it => { // car
    const body = mesh(new THREE.BoxGeometry(.34, .08, .18), M(0x1d4f9c, .35, .3)); body.position.y = .08; it.add(body);
    const cab = mesh(new THREE.BoxGeometry(.18, .07, .16), M(0xcfe3ff, .1, .2)); cab.position.set(-.02, .155, 0); it.add(cab);
    [[-.11, .09], [.11, .09], [-.11, -.09], [.11, -.09]].forEach(([x, z]) => { const w = mesh(new THREE.CylinderGeometry(.04, .04, .03, 16), M(0x111111, .8)); w.rotation.x = Math.PI / 2; w.position.set(x, .04, z); it.add(w); });
  });
  pedestal(2, 'LoveNeverDies', 'loveneverdies', it => { // padlock
    const b = mesh(new THREE.BoxGeometry(.24, .2, .1), M(0xd9a520, .25, .8)); b.position.y = .12; it.add(b);
    const sh = mesh(new THREE.TorusGeometry(.08, .02, 12, 28, Math.PI), M(0xc8c8cc, .2, 1)); sh.position.y = .22; it.add(sh);
    const kh = mesh(new THREE.CylinderGeometry(.02, .02, .11, 12), M(0x111111, .6)); kh.rotation.x = Math.PI / 2; kh.position.y = .12; it.add(kh);
  });
  pedestal(3, 'SchafPlay', 'schafplay', it => { // card fan
    [0xc0202f, 0x2d7a3a, 0xd39a12, 0x6b3c1c].forEach((c, k) => {
      const card = new THREE.Group();
      card.add(mesh(new THREE.BoxGeometry(.15, .23, .006), M(0xf7f0e1, .6)));
      const pip = mesh(new THREE.CircleGeometry(.03, 20), M(c, .5)); pip.position.z = .0035; card.add(pip);
      card.position.set((k - 1.5) * .035, .14, k * .008); card.rotation.z = -(k - 1.5) * .22; it.add(card);
    });
  });
  pedestal(4, 'Thesis', 'thesis', it => { // mini 2-link arm
    const b = mesh(new THREE.CylinderGeometry(.05, .06, .04, 20), M(0x2a2a2c)); b.position.y = .02; it.add(b);
    const l1 = new THREE.Group(); l1.position.y = .04; l1.rotation.z = .5; it.add(l1);
    const s1 = mesh(new THREE.BoxGeometry(.03, .16, .03), M(0x7fb4ff, .4)); s1.position.y = .08; l1.add(s1);
    const l2 = new THREE.Group(); l2.position.y = .16; l2.rotation.z = -1.3; l1.add(l2);
    const s2 = mesh(new THREE.BoxGeometry(.025, .13, .025), M(0x7fb4ff, .4)); s2.position.y = .065; l2.add(s2);
    const tip = mesh(new THREE.SphereGeometry(.022, 12, 12), M(0xffd23f, .3)); tip.position.y = .13; l2.add(tip);
    it.userData.spin = l1;
  });
  pedestal(5, 'FitFinder', 'fitfinder', it => { // phone
    const ph = mesh(new THREE.BoxGeometry(.15, .3, .018), M(0x111111, .3, .4)); ph.position.y = .17; ph.rotation.x = -.25; it.add(ph);
    const sc = mesh(new THREE.PlaneGeometry(.13, .27), M(0xf4ede4, .4)); sc.position.z = .0095; ph.add(sc);
    [[-.03, .06, 0xe36b3c], [.03, .06, 0x35558f], [-.03, -.03, 0xbf3a3a], [.03, -.03, 0xd8c3a5]].forEach(([x, y, c]) => { const t = mesh(new THREE.PlaneGeometry(.05, .07), M(c, .6)); t.position.set(x, y, .0005); sc.add(t); });
  });
  pedestal(6, 'Ironman 14:21:26', 'off-the-clock', it => { // medal
    const rib = mesh(new THREE.BoxGeometry(.06, .2, .01), M(0xc0202f, .7)); rib.position.set(0, .25, -.01); it.add(rib);
    const md = mesh(new THREE.CylinderGeometry(.09, .09, .02, 32), M(0xd4a72c, .25, 1)); md.rotation.x = Math.PI / 2; md.position.y = .12; it.add(md);
    const inner = mesh(new THREE.TorusGeometry(.065, .006, 8, 32), M(0xb08718, .3, 1)); inner.position.set(0, .12, .011); it.add(inner);
  });

  /* ---------- theme ---------- */
  function applyTheme(dark) {
    const P = dark ? PALETTE.dark : PALETTE.light;
    scene.background.setHex(P.bg);
    scene.fog.color.setHex(P.bg); fogBase = P.fog; fitFog();
    floorMat.color.setHex(P.floor); floorMat.roughness = P.floorRough; floorMat.metalness = P.floorMetal;
    PED.color.setHex(P.ped); PEDTOP.color.setHex(P.pedTop);
    ring.material.color.setHex(P.ring); ring.material.opacity = P.ringOp;
    grid.material.color.setHex(P.grid); grid.material.opacity = P.gridOp;
    hemi.color.setHex(P.sky); hemi.groundColor.setHex(P.ground); hemi.intensity = P.hemi;
    sun.intensity = P.sun; rim.intensity = P.rim;
    scene.environmentIntensity = P.env;
    renderer.toneMappingExposure = P.exposure;
    invalidate();
  }
  applyTheme(root.dataset.theme === 'dark');
  addEventListener('wc:theme', e => applyTheme(e.detail.dark));

  /* ---------- state & input ---------- */
  const target = new THREE.Vector3(1, 1.1, 1), goal = target.clone();
  let mode = 'mouse', active = -1, hovered = -1, grip = 0, gripGoal = 0, pointerSeen = false;
  const ndc = new THREE.Vector2(.3, -.1);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
  const tmp = new THREE.Vector3();

  function setSection(t) {
    if (t === 'mouse' || t === 'idle' || t === 'wave') { mode = t; active = -1; }
    else { mode = 'ex'; active = +t; }
    invalidate();
  }
  setSection((window.__wc && window.__wc.t) || 'mouse');
  addEventListener('wc:section', e => setSection(e.detail.t));

  // Pointer position in the canvas's normalised device coordinates.
  const toNdc = (x, y, v) => v.set(x / W * 2 - 1, -(y / H) * 2 + 1);
  function pick(clientX, clientY) {
    ray.setFromCamera(toNdc(clientX, clientY, new THREE.Vector2()), camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.ex : -1;
  }
  addEventListener('pointermove', e => {
    const over = e.target === canvas;
    if (band.matches && !over) return; // in the band layout only the stage itself steers the arm
    toNdc(e.clientX, e.clientY, ndc);
    pointerSeen = true;
    const h = over && e.pointerType === 'mouse' ? pick(e.clientX, e.clientY) : -1;
    if (h !== hovered) { hovered = h; canvas.style.cursor = h >= 0 ? 'pointer' : ''; }
    invalidate();
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (e.target !== canvas) return;
    toNdc(e.clientX, e.clientY, ndc);
    pointerSeen = true;
    invalidate();
  }, { passive: true });
  canvas.addEventListener('click', e => {
    const i = pick(e.clientX, e.clientY);
    if (i >= 0) window.dispatchEvent(new CustomEvent('wc:goto', { detail: { id: exhibits[i].id } }));
  });

  /* ---------- layout ---------- */
  // The canvas starts at the top-left of the viewport, so client coordinates map 1:1.
  let W = 0, H = 0, labelsAll = true;
  const headerH = () => document.querySelector('.site-header')?.offsetHeight || 0;
  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = band.matches ? 38 : 32;
    const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hTan = vTan * camera.aspect;
    const top = headerH();
    if (band.matches) {
      // Fit the whole cell (pedestals, arm at full reach, active label) into the strip below the header.
      const useH = (H - top) / H;
      camDist = THREE.MathUtils.clamp(Math.max(2.45 / hTan, 2.05 / (vTan * useH)), 6, 16);
      camera.setViewOffset(W, H, 0, -top / 2, W, H);
    } else {
      // Frame the cell in the free space between the text column and the section rail.
      const colRight = col ? col.getBoundingClientRect().right + 24 : W * .4;
      const railLeft = rail && getComputedStyle(rail).display !== 'none' ? rail.getBoundingClientRect().left - 16 : W - 16;
      const avail = Math.max(railLeft - colRight, W * .3);
      labelsAll = avail >= 520; // all seven labels only fit when there is room for them
      const useH = (H - top) / H;
      camDist = THREE.MathUtils.clamp(Math.max(2.55 * W / (avail * hTan), 2.15 / (vTan * useH)), 7.2, 24);
      const centre = (colRight + railLeft) / 2;
      camera.setViewOffset(W, H, -(centre - W / 2), -top / 2, W, H);
    }
    camera.updateProjectionMatrix();
    fitFog();
    invalidate();
  }
  addEventListener('resize', resize);
  band.addEventListener('change', () => requestAnimationFrame(resize));
  resize();

  /* ---------- render loop with pausing ---------- */
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); invalidate(); } });
  if (footer) new IntersectionObserver(([e]) => { footerCovers = !band.matches && e.intersectionRatio > .6; invalidate(); }, { threshold: [0, .6, 1] }).observe(footer);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; root.classList.remove('gl'); });
  addEventListener('scroll', () => invalidate(), { passive: true });
  reduce.addEventListener('change', invalidate);

  const clock = new THREE.Clock();
  let camA = .55, frameNo = 0;
  const ang = { yaw: -.8, a1: 1.2, a2: -2 };
  let lastS = solveIK(target);

  function frame() {
    raf = 0;
    if (!running || footerCovers) return;
    const still = reduce.matches;
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    const k = still ? 1 : 1 - Math.pow(.02, dt);

    // camera
    const sp = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const wantA = mode === 'ex' ? exhibits[active].phi - (band.matches ? .6 : .42) : (still ? .55 : .55 + sp * .9);
    camA = still ? wantA : angleLerp(camA, wantA, 1 - Math.pow(.15, dt));
    const ca = camA + (still ? 0 : Math.sin(t * .15) * .04);
    const s = camDist / 7.2;
    camera.position.set(Math.sin(ca) * camDist, (3.4 - (still ? 0 : sp * .6)) * s, Math.cos(ca) * camDist);
    camera.lookAt(0, .75, 0);
    camera.updateMatrixWorld();

    // arm goal
    if (mode === 'mouse') {
      if (!pointerSeen && !still) { goal.set(Math.sin(t * .6) * 1.2 + .4, 1.0 + Math.sin(t * .9) * .15, Math.cos(t * .6) * .9 + .9); }
      else {
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, tmp)) {
          const r = Math.hypot(tmp.x, tmp.z), c = THREE.MathUtils.clamp(r, .7, 2.05) / Math.max(r, 1e-3);
          goal.set(tmp.x * c, 1.0, tmp.z * c);
        }
      }
      gripGoal = 0;
    } else if (mode === 'ex') {
      const ex = exhibits[active];
      ex.g.getWorldPosition(tmp);
      goal.set(tmp.x, ex.top + .06 + (still ? 0 : Math.sin(t * 2) * .03), tmp.z);
      gripGoal = 1;
    } else if (mode === 'idle') {
      goal.set(still ? 1.2 : 1.2 + Math.sin(t * .5) * .25, 1.45, still ? 1.2 : 1.2 + Math.cos(t * .5) * .25);
      gripGoal = .3;
    } else { // wave
      goal.set(still ? .9 : Math.sin(t * 3) * .6 + .9, 1.9, .9);
      gripGoal = still ? 0 : (Math.sin(t * 6) > 0 ? 1 : 0);
    }
    target.lerp(goal, k);
    const sol = solveIK(target); lastS = sol;
    const jk = still ? 1 : .18;
    ang.yaw = angleLerp(ang.yaw, sol.yaw, jk); ang.a1 += (sol.a1 - ang.a1) * jk; ang.a2 += (sol.a2 - ang.a2) * jk;
    const w = -Math.PI / 2 - ang.a1 - ang.a2;
    yawG.rotation.y = ang.yaw; shoulder.rotation.z = ang.a1; elbow.rotation.z = ang.a2; wrist.rotation.z = w;
    grip += (gripGoal - grip) * (still ? 1 : .15);
    fingers[0].position.y = .07 - grip * .035; fingers[1].position.y = -.07 + grip * .035;

    // exhibits + labels
    const showAll = (mode === 'mouse') && !band.matches && labelsAll;
    exhibits.forEach((ex, i) => {
      const on = i === active, hot = i === hovered;
      if (!still) {
        ex.item.rotation.y += dt * (on ? 1.2 : .25);
        if (ex.item.userData.spin) ex.item.userData.spin.rotation.z = .5 + Math.sin(t * 2) * .4;
      }
      const wantY = on ? .6 : .52;
      ex.item.position.y += (wantY - ex.item.position.y) * (still ? 1 : .1);
      const wantG = on ? .14 : hot ? .2 : 0;
      if (Math.abs(ex.glow - wantG) > .002) {
        ex.glow += (wantG - ex.glow) * (still ? 1 : .15);
        ex.item.traverse(o => { if (o.isMesh) o.material.emissiveIntensity = ex.glow; });
      }
      ex.g.scale.setScalar(hot ? 1.06 : 1);
      ex.g.getWorldPosition(tmp); tmp.y = ex.top + (band.matches ? .3 : .1); tmp.project(camera);
      const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
      ex.tag.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
      ex.tag.classList.toggle('on', on || hot || showAll);
      ex.tag.classList.toggle('hot', on || hot);
    });

    if (hud && !band.matches && (frameNo++ % 4 === 0)) {
      const deg = x => (x * 180 / Math.PI).toFixed(1);
      hud.innerHTML = `<span class="cap">Joint angles, solved live</span>J1 <b>${deg(ang.yaw)}°</b> &nbsp; J2 <b>${deg(ang.a1)}°</b><br>J3 <b>${deg(ang.a2)}°</b> &nbsp; J4 <b>${deg(w)}°</b><br>${sol.reach ? 'Target in reach' : 'Target out of reach'}`;
    }

    renderer.render(scene, camera);
    window.__wcReady = true;

    // Keep animating unless reduced motion is on and the scene has settled.
    if (still) { if (--dirty > 0) raf = requestAnimationFrame(frame); }
    else raf = requestAnimationFrame(frame);
  }

  invalidate();
}

try { init(); } catch (err) { console.warn('Workcell: 3D stage failed, text-only layout in use.', err); root.classList.remove('gl'); }
