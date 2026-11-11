// Workcell 3D stage: a 4-axis industrial arm with analytic inverse kinematics.
// If anything here fails, the page keeps working as a plain text site (no .gl class).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { band, reduceMotion, section, emit } from './wc.js';

const root = document.documentElement;
const canvas = document.getElementById('stage');
const tagLayer = document.getElementById('tags');
const lowPower = matchMedia('(max-width: 899px)').matches || matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;

// Light: a pale cell floor in a cabinet-grey hall. Dark: asphalt, with the markings in white.
const PALETTE = {
  light: { bg: 0xe7e9e5, shadow: .13, ped: 0xffffff, joint: 0x1d2023, prop: 0x2d2e31, side: 0xbfc3bd, blob: .07,
           floor: ['#f2f3f0', '#e9ebe7'], ink: '0,0,0', lane: .34, num: 0x000000, numOp: .72, acc: 0xf05a00,
           sky: 0xffffff, ground: 0xc9cdc7, hemi: .4, sun: 1.45, fill: .25, rim: 0, env: .62, exposure: .92, fog: [11, 26] },
  dark:  { bg: 0x2b2e31, shadow: .5, ped: 0xc4c8c4, joint: 0x4a4f55, prop: 0x34383c, side: 0x101112, blob: .4,
           floor: ['#202326', '#1b1d20'], ink: '255,255,255', lane: .8, num: 0xffffff, numOp: .85, acc: 0xff7a2b,
           sky: 0xb4bcc6, ground: 0x151617, hemi: .7, sun: 2.2, fill: .35, rim: .9, env: .6, exposure: 1.05, fog: [11, 24] },
};

// Adds a shadow-casting mesh to parent. pos and rot are [x, y, z] arrays.
function part(parent, geometry, material, { pos, rot } = {}) {
  const o = new THREE.Mesh(geometry, material);
  o.castShadow = o.receiveShadow = true;
  if (pos) o.position.set(...pos);
  if (rot) o.rotation.set(...rot);
  parent.add(o);
  return o;
}

/* ---------- inverse kinematics ---------- */
const H0 = .62, L1 = 1.15, L2 = 1.0, L3 = .32;

// Analytic IK: base yaw + planar 2-link solution, wrist kept pointing down.
function solveIK(T) {
  const wx = T.x, wy = T.y + L3, wz = T.z;
  const yaw = Math.atan2(-wz, wx);
  const r = Math.hypot(wx, wz), z = wy - H0;
  let d = Math.hypot(r, z);
  const reach = d <= L1 + L2 - .001;
  d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + .05, L1 + L2 - .001);
  const a1 = Math.atan2(z, r) + Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
  const a2 = -(Math.PI - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
  return { yaw, a1, a2, reach };
}
const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// A box with softened edges (w along x, h along y, d along z): sharp boxes read as placeholders.
function rbox(w, h, d, r = .012) {
  const x = w / 2 - r, y = h / 2 - r, q = Math.PI / 2, sh = new THREE.Shape();
  sh.absarc(x, y, r, 0, q); sh.absarc(-x, y, r, q, 2 * q); sh.absarc(-x, -y, r, 2 * q, 3 * q); sh.absarc(x, -y, r, 3 * q, 4 * q);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 3, curveSegments: 5 });
  g.translate(0, 0, -(d - r * 2) / 2);
  return g;
}

/* ---------- exhibits ---------- */
// One per section, placed around the arm in this order.
// Props in the dark graphite colour share its hex so the theme can lighten them at night.
const GRAPHITE = 0x2d2e31, graphite = [];
const M = (c, r = .5, m = 0) => {
  const mat = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  if (c === GRAPHITE) graphite.push(mat);
  return mat;
};
const EXHIBITS = [
  { id: 'vscenecreator', label: 'VSceneCreator', build(it) { // road tile
    part(it, rbox(.3, .045, .3, .01), M(0x2d2e31, .9), { pos: [0, .0225, 0] });
    for (let k = -1; k <= 1; k++) part(it, new THREE.BoxGeometry(.032, .047, .06), M(0xf6f3ec, .6), { pos: [0, .025, k * .095] });
    [-.12, .12].forEach(x => part(it, new THREE.BoxGeometry(.018, .047, .3), M(0xf6f3ec, .6), { pos: [x, .025, 0] }));
    part(it, new THREE.ConeGeometry(.05, .13, 20), M(0xff6a13, .45), { pos: [.065, .11, .07] });
    part(it, new THREE.CylinderGeometry(.062, .062, .012, 20), M(0xff6a13, .45), { pos: [.065, .051, .07] });
  } },
  { id: 'dyna4', label: 'DYNA4', build(it) { // car
    part(it, rbox(.36, .085, .18, .028), M(0xd3d5d9, .32, .55), { pos: [0, .082, 0] });
    part(it, rbox(.19, .075, .155, .026), M(0x2d2e31, .15, .4), { pos: [-.025, .155, 0] });
    [[-.11, .09], [.11, .09], [-.11, -.09], [.11, -.09]].forEach(([x, z]) => part(it, new THREE.CylinderGeometry(.042, .042, .034, 24), M(0x16171a, .8), { pos: [x, .042, z], rot: [Math.PI / 2, 0, 0] }));
  } },
  { id: 'loveneverdies', label: 'LoveNeverDies', build(it) { // padlock
    part(it, rbox(.24, .2, .1, .024), M(0x2d2e31, .4, .5), { pos: [0, .1, 0] });
    part(it, new THREE.TorusGeometry(.075, .02, 14, 32, Math.PI), M(0xc8c8cc, .2, 1), { pos: [0, .2, 0] });
    part(it, new THREE.CylinderGeometry(.022, .022, .108, 20), M(0xff6a13, .5), { pos: [0, .1, 0], rot: [Math.PI / 2, 0, 0] });
  } },
  { id: 'schafplay', label: 'SchafPlay', build(it) { // card fan
    [0xff6a13, 0x2d2e31, 0x2d2e31, 0x2d2e31].forEach((c, k) => {
      const card = new THREE.Group();
      part(card, new THREE.BoxGeometry(.158, .238, .004), M(0x2d2e31, .6), { pos: [0, 0, -.002] });
      part(card, new THREE.BoxGeometry(.15, .23, .006), M(0xf2ece0, .6));
      part(card, new THREE.CircleGeometry(.03, 20), M(c, .5), { pos: [0, 0, .0035] });
      card.position.set((k - 1.5) * .035, .16, k * .008); card.rotation.z = -(k - 1.5) * .22; it.add(card);
    });
  } },
  { id: 'thesis', label: 'Bachelor thesis', build(it) { // mini 2-link arm
    part(it, new THREE.CylinderGeometry(.05, .06, .04, 20), M(0x2a2a2c), { pos: [0, .02, 0] });
    const l1 = new THREE.Group(); l1.position.y = .04; l1.rotation.z = .5; it.add(l1);
    part(l1, new THREE.BoxGeometry(.03, .16, .03), M(0xff6a13, .4), { pos: [0, .08, 0] });
    const l2 = new THREE.Group(); l2.position.y = .16; l2.rotation.z = -1.3; l1.add(l2);
    part(l2, new THREE.BoxGeometry(.025, .13, .025), M(0xff6a13, .4), { pos: [0, .065, 0] });
    part(l2, new THREE.SphereGeometry(.022, 12, 12), M(0xc4c6ca, .3, .8), { pos: [0, .13, 0] });
    it.userData.spin = l1;
  } },
  { id: 'fitfinder', label: 'FitFinder', build(it) { // phone
    const ph = part(it, rbox(.15, .3, .02, .009), M(0x16171a, .3, .4), { pos: [0, .17, 0], rot: [-.25, 0, 0] });
    const sc = part(ph, new THREE.PlaneGeometry(.132, .28), M(0xf4ede4, .4), { pos: [0, 0, .0105] });
    [[-.03, .06, 0xff6a13], [.03, .06, 0x8a8b92], [-.03, -.03, 0x8a8b92], [.03, -.03, 0xc4c6ca]].forEach(([x, y, c]) => part(sc, new THREE.PlaneGeometry(.05, .07), M(c, .6), { pos: [x, y, .0005] }));
  } },
  { id: 'pose', label: '6D object pose estimation', build(it) { // a cube with its three axes, like a transform gizmo
    const g = new THREE.Group(); g.position.y = .085; g.rotation.set(0, -.6, 0); it.add(g);
    part(g, rbox(.13, .13, .13, .012), M(0xc9a57c, .7));
    [[0xff6a13, [0, 0, -Math.PI / 2]], [GRAPHITE, [0, 0, 0]], [0x9a9ba3, [Math.PI / 2, 0, 0]]].forEach(([c, r]) => {
      const ax = new THREE.Group(); ax.rotation.set(...r); g.add(ax);
      part(ax, new THREE.CylinderGeometry(.013, .013, .22, 12), M(c, .45), { pos: [0, .11, 0] });
      part(ax, new THREE.ConeGeometry(.032, .07, 16), M(c, .45), { pos: [0, .25, 0] });
    });
  } },
  { id: 'education', label: 'Education', build(it) { // graduation cap
    part(it, new THREE.CylinderGeometry(.075, .085, .07, 24), M(0x2d2e31, .6), { pos: [0, .05, 0] });
    part(it, new THREE.BoxGeometry(.24, .014, .24), M(0x2d2e31, .55), { pos: [0, .092, 0], rot: [0, Math.PI / 4, 0] });
    part(it, new THREE.CylinderGeometry(.012, .012, .01, 12), M(0xff6a13, .4), { pos: [0, .104, 0] });
    part(it, new THREE.BoxGeometry(.008, .09, .008), M(0xff6a13, .5), { pos: [.11, .055, 0] });
  } },
  { id: 'off-the-clock', label: 'Ironman', build(it) { // medal on a V of ribbon
    const ribbon = M(0xff6a13, .7), coin = M(0xd0d1d6, .32, .85);
    [-1, 1].forEach(k => part(it, new THREE.BoxGeometry(.05, .2, .008), ribbon, { pos: [k * .042, .29, -.008], rot: [0, 0, -k * .42] }));
    part(it, new THREE.CylinderGeometry(.092, .092, .024, 40), coin, { pos: [0, .115, 0], rot: [Math.PI / 2, 0, 0] });
    part(it, new THREE.TorusGeometry(.082, .009, 10, 40), coin, { pos: [0, .115, .012] });
    part(it, new THREE.CylinderGeometry(.03, .03, .03, 24), ribbon, { pos: [0, .115, 0], rot: [Math.PI / 2, 0, 0] });
  } },
];

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('Workcell: WebGL unavailable, showing the text-only layout.', err);
    root.classList.remove('gl');
    return;
  }
  root.classList.add('gl');
  let fogBase = [11, 26], camDist = 7.2;
  const fitFog = () => { const s = camDist / 7.2; scene.fog.near = fogBase[0] * s; scene.fog.far = fogBase[1] * s; };
  let running = true, dirty = 2, raf = 0;
  function invalidate() { dirty = Math.max(dirty, 3); if (running && !raf) raf = requestAnimationFrame(frame); }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const SEG = lowPower ? 28 : 56;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 11, 26);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xbdb8ad, .6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(2, 8.5, 2.6);
  sun.castShadow = true;
  const sm = lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 1, far: 20 });
  sun.shadow.bias = -.0002;
  sun.shadow.radius = 9;
  sun.shadow.blurSamples = lowPower ? 10 : 18;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff1e4, .3);
  fill.position.set(-5, 3, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffb27a, 0);
  rim.position.set(-3, 6, -6);
  scene.add(rim);

  /* ---------- turntable ---------- */
  // A painted disc: degree ticks on the rim, the track the stations stand on and each station's
  // number on the floor in front of it. Drawn on a canvas so both themes stay crisp.
  const TABLE = 2.72, R = 2;
  const stationPhi = i => (i - 4) * STEP; // evenly round the ring, station 05 at the front
  const STEP = Math.PI * 2 / EXHIBITS.length;
  const floorCv = document.createElement('canvas');
  floorCv.width = floorCv.height = lowPower ? 1024 : 2048;
  const floorTex = new THREE.CanvasTexture(floorCv);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  let P = PALETTE.light;
  function paintFloor() {
    const N = floorCv.width, c = N / 2, u = c / TABLE, g = floorCv.getContext('2d');
    const ink = a => `rgba(${P.ink},${a})`;
    g.clearRect(0, 0, N, N);
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, P.floor[0]); grad.addColorStop(1, P.floor[1]);
    g.fillStyle = grad; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    const circle = (r, w, a, dash = []) => { g.beginPath(); g.setLineDash(dash); g.arc(c, c, r * u, 0, Math.PI * 2); g.lineWidth = w * u; g.strokeStyle = ink(a); g.stroke(); g.setLineDash([]); };
    circle(TABLE - .014, .028, P.lane * .8);   // rim, a solid edge line
    circle(R, .03, P.lane, [.2 * u, .4 * u]);   // station track, marked like a lane: one on, two off
    circle(.78, .008, .2, [.05 * u, .05 * u]);  // keep-out zone round the base
    for (let d = 0; d < 360 && !band.matches; d += 3) { // degree ticks (too fine for the phone strip)
      const major = d % 15 === 0, a = THREE.MathUtils.degToRad(d);
      const r0 = (TABLE - (major ? .13 : .09)) * u, r1 = (TABLE - .045) * u;
      g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c + Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * r1, c + Math.cos(a) * r1);
      g.lineWidth = (major ? .012 : .007) * u; g.strokeStyle = ink(major ? .34 : .2); g.stroke();
    }
    floorTex.needsUpdate = true;
  }
  // Station numbers lie on the floor beside each station and turn with the camera,
  // so they read the right way up from anywhere. The plane is deeper than the glyphs are tall to undo
  // the squash of looking at the floor from above.
  const numerals = EXHIBITS.map((_, i) => {
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = floorTex.anisotropy;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.46, .44), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = .005; m.renderOrder = 1;
    scene.add(m);
    return { m, mat, cv, tex, text: String(i + 1).padStart(2, '0') };
  });
  function paintNumerals() {
    for (const n of numerals) {
      const g = n.cv.getContext('2d');
      g.clearRect(0, 0, 192, 96);
      g.font = '600 88px "Barlow Condensed", ui-sans-serif, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(n.text, 96, 52);
      n.tex.needsUpdate = true;
    }
  }
  paintNumerals();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(TABLE, 128), new THREE.MeshBasicMaterial({ map: floorTex, toneMapped: false, fog: false }));
  disc.rotation.x = -Math.PI / 2;
  scene.add(disc);
  const SIDE = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false });
  const side = new THREE.Mesh(new THREE.CylinderGeometry(TABLE, TABLE, .07, 128, 1, true), SIDE);
  side.position.y = -.035;
  scene.add(side);
  const floorMat = new THREE.ShadowMaterial({ depthWrite: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(TABLE, 96), floorMat); // shadows stay on the turntable
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = .002;
  floor.receiveShadow = true;
  scene.add(floor);
  // A soft pool of shade under the disc, so it sits on something.
  const blobCv = document.createElement('canvas'); blobCv.width = blobCv.height = 256;
  { const g = blobCv.getContext('2d'), gr = g.createRadialGradient(128, 128, 84, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.4, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const BLOB = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCv), transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(TABLE * 2.16, TABLE * 2.16), BLOB);
  blob.rotation.x = -Math.PI / 2; blob.position.set(-.12, -.08, -.16); blob.renderOrder = -1;
  scene.add(blob);

  // materials
  const ORANGE = new THREE.MeshPhysicalMaterial({ color: 0xff6a13, roughness: .46, metalness: 0, clearcoat: .55, clearcoatRoughness: .35, envMapIntensity: .8 });
  const DARK = new THREE.MeshStandardMaterial({ color: 0x26272b, roughness: .48, metalness: .35 });
  const STEEL = new THREE.MeshStandardMaterial({ color: 0xc2c3c8, roughness: .28, metalness: .9 });
  const PED = new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: .72 });
  const GRIP = new THREE.MeshStandardMaterial({ color: 0xa4a6ad, roughness: .35, metalness: .7 });
  const HALO = new THREE.MeshBasicMaterial({ color: 0xff6a13, side: THREE.DoubleSide, toneMapped: false });

  /* ---------- geometry helpers ---------- */
  const lathe = pts => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), SEG);
  // A cylinder with rounded rims, centred, axis along y.
  function drum(r, len, b = .022) {
    const h = len / 2, pts = [[0, -h]], q = Math.PI / 2;
    for (let i = 0; i <= 4; i++) pts.push([r - b + Math.sin(i / 4 * q) * b, -h + b - Math.cos(i / 4 * q) * b]);
    for (let i = 0; i <= 4; i++) pts.push([r - b + Math.cos(i / 4 * q) * b, h - b + Math.sin(i / 4 * q) * b]);
    pts.push([0, h]);
    return lathe(pts);
  }
  // An arm link: a tapered, bevelled slab from one joint (origin) to the next (len along x).
  function link(len, r1, r2, depth, bev = .028) {
    const a = Math.asin((r1 - r2) / len), q = Math.PI / 2, sh = new THREE.Shape();
    sh.absarc(0, 0, r1 - bev, q - a, 3 * q + a, false);
    sh.absarc(len, 0, r2 - bev, -q + a, q - a, false);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: lowPower ? 3 : 5, curveSegments: SEG / 2 });
    g.translate(0, 0, -(depth - bev * 2) / 2);
    return g;
  }

  /* ---------- robot arm ---------- */
  const SIDEWAYS = [Math.PI / 2, 0, 0]; // lays a drum along the joint axis
  const arm = new THREE.Group();
  scene.add(arm);
  part(arm, lathe([[0, 0], [.5, 0], [.5, .035], [.485, .06], [.41, .085], [.37, .12], [0, .12]]), DARK);
  const yawG = new THREE.Group(); yawG.position.y = .12; arm.add(yawG);
  part(yawG, lathe([[0, 0], [.34, 0], [.34, .03], [.325, .055], [.3, .075], [.265, .3], [.24, .36], [.2, .4], [0, .4]]), ORANGE);
  const shoulder = new THREE.Group(); shoulder.position.y = H0 - .12; yawG.add(shoulder);
  part(shoulder, drum(.21, .4), DARK, { rot: SIDEWAYS });
  part(shoulder, drum(.115, .44, .012), STEEL, { rot: SIDEWAYS });
  part(shoulder, link(L1, .175, .135, .24), ORANGE);
  const elbow = new THREE.Group(); elbow.position.x = L1; shoulder.add(elbow);
  part(elbow, drum(.165, .32), DARK, { rot: SIDEWAYS });
  part(elbow, drum(.09, .355, .012), STEEL, { rot: SIDEWAYS });
  part(elbow, link(L2, .13, .095, .19), ORANGE);
  const wrist = new THREE.Group(); wrist.position.x = L2; elbow.add(wrist);
  part(wrist, drum(.115, .245), DARK, { rot: SIDEWAYS });
  part(wrist, drum(.06, .27, .01), STEEL, { rot: SIDEWAYS });
  part(wrist, drum(.075, L3 * .6, .012), STEEL, { pos: [L3 * .3, 0, 0], rot: [0, 0, Math.PI / 2] });
  part(wrist, drum(.1, .03, .008), DARK, { pos: [L3 * .5, 0, 0], rot: [0, 0, Math.PI / 2] });
  part(wrist, rbox(.06, .24, .12, .014), GRIP, { pos: [L3 * .62, 0, 0] });
  const fingers = [1, -1].map(s => part(wrist, rbox(.14, .035, .08, .008), STEEL, { pos: [L3 * .62 + .09, .07 * s, 0] }));

  /* ---------- exhibit pedestals ---------- */
  const PED_H = .12, RISE = 2.4; // the active station's plinth rises to RISE times its height
  const pedGeo = lathe([[0, 0], [.285, 0], [.285, .012], [.275, .024], [.268, PED_H - .012], [.256, PED_H], [0, PED_H]]);
  const exhibits = [];
  const tmpV = new THREE.Vector3();
  const pickables = [];
  EXHIBITS.forEach(({ id, label, build }, i) => {
    const phi = stationPhi(i);
    const g = new THREE.Group();
    g.position.set(R * Math.sin(phi), 0, R * Math.cos(phi));
    scene.add(g);
    const ped = part(g, pedGeo, PED);
    const item = new THREE.Group(); item.position.y = PED_H; g.add(item);
    build(item);
    // The active station gets an orange ring round its foot instead of tinting the prop.
    const halo = new THREE.Mesh(new THREE.RingGeometry(.315, .352, SEG), HALO);
    halo.rotation.x = -Math.PI / 2; halo.position.y = .004; halo.visible = false; g.add(halo);
    g.traverse(o => { if (o.isMesh) { o.userData.ex = i; pickables.push(o); } });
    const tag = document.createElement('button');
    tag.type = 'button'; tag.className = 'tag'; tag.tabIndex = -1;
    tag.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i>${label}`;
    tag.addEventListener('click', () => emit('goto', { id }));
    tagLayer.appendChild(tag);
    const h = new THREE.Box3().setFromObject(item).getSize(tmpV).y; // unscaled prop height
    exhibits.push({ g, ped, item, halo, tag, phi, id, h, rise: 1, box: {} });
  });

  /* ---------- theme ---------- */
  let active = -1;
  function applyTheme(dark) {
    P = dark ? PALETTE.dark : PALETTE.light;
    scene.fog.color.setHex(P.bg); fogBase = P.fog; fitFog();
    floorMat.opacity = P.shadow; BLOB.opacity = P.blob; SIDE.color.setHex(P.side);
    PED.color.setHex(P.ped); DARK.color.setHex(P.joint);
    graphite.forEach(m => m.color.setHex(P.prop));
    hemi.color.setHex(P.sky); hemi.groundColor.setHex(P.ground); hemi.intensity = P.hemi;
    sun.intensity = P.sun; fill.intensity = P.fill; rim.intensity = P.rim;
    scene.environmentIntensity = P.env;
    renderer.toneMappingExposure = P.exposure;
    paintFloor();
    invalidate();
  }
  applyTheme(root.dataset.theme === 'dark');
  // The floor numbers use the site's mono face; repaint once it has loaded.
  document.fonts?.load('600 16px "Barlow Condensed"').then(() => { paintNumerals(); invalidate(); }).catch(() => {});
  addEventListener('wc:theme', e => applyTheme(e.detail.dark));

  /* ---------- state & input ---------- */
  const target = new THREE.Vector3(1, 1.1, 1), goal = target.clone();
  let mode = 'mouse', hovered = -1, grip = 0, gripGoal = 0, pointerSeen = false;
  const ndc = new THREE.Vector2(.3, -.1);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
  const tmp = new THREE.Vector3();

  function syncSection() {
    active = exhibits.findIndex(ex => ex.id === section.id);
    mode = active >= 0 ? 'ex' : section.arm || 'mouse';
    invalidate();
  }
  syncSection();
  addEventListener('wc:section', syncSection);

  // Pointer position in the canvas's normalised device coordinates.
  const toNdc = (x, y, v) => v.set((x - cx) / W * 2 - 1, -((y - cy) / H) * 2 + 1);
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
    if (i >= 0) emit('goto', { id: exhibits[i].id });
  });

  /* ---------- layout ---------- */
  // cx/cy: the canvas's offset in the viewport (it sits at the bottom in the band layout).
  let W = 0, H = 0, cx = 0, cy = 0;
  const headerH = () => document.querySelector('.site-header')?.offsetHeight || 0;
  const heroCard = document.querySelector('.hero .card');
  const wideCards = [...document.querySelectorAll('.sec.wide > .card')];
  const slots = wideCards.map(c => c.querySelector('.cell-slot'));
  const open = { x: 0, y: 0, d: 7.2 }, dock = { x: 0, y: 0, d: 7.2 }; // where the cell's centre sits on screen, and how far the camera is
  let dockK = 0, dockWant = 0, closeD = 5, slot = null, hTan = .46;
  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    const rect = canvas.getBoundingClientRect(); cx = rect.left; cy = rect.top;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = band.matches ? 20 : 32;
    const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    hTan = vTan * camera.aspect;
    const top = headerH();
    if (band.matches) {
      // Whole cell in the strip when nothing is active; a close view of the active station otherwise.
      open.d = THREE.MathUtils.clamp(Math.max(3.2 / hTan, 1.45 / vTan), 3, 30);
      closeD = Math.max(1.7 / hTan, 1.1 / vTan);
      open.x = W / 2; open.y = H / 2;
    } else {
      // Open: the cell fills the free space right of the text column.
      const colRight = (heroCard ? heroCard.getBoundingClientRect().right : W * .4) + 44, right = W - Math.max(24, W * .05);
      const avail = Math.max(right - colRight, W * .3), useH = (H - top) / H;
      open.d = THREE.MathUtils.clamp(Math.max(2.24 * W / (avail * hTan), 1.9 / (vTan * useH)), 4.8, 26);
      open.x = (colRight + right) / 2; open.y = H * .4 + top / 2;
    }
    checkDock();
    frameCell();
    invalidate();
  }
  // Applies the framing between open (0) and docked (1).
  function frameCell() {
    const e = dockK * dockK * (3 - 2 * dockK);
    const x = open.x + (dock.x - open.x) * e, y = open.y + (dock.y - open.y) * e;
    camDist = 1 / (1 / open.d + (1 / dock.d - 1 / open.d) * e);
    camera.setViewOffset(W, H, W / 2 - x, H / 2 - y, W, H);
    camera.updateProjectionMatrix();
    fitFog();
  }
  // A section with pictures takes the page's width, so the cell parks in the slot beside that section's
  // title and scrolls with it. It comes back out once no such section crosses the space it stands in.
  function checkDock() {
    dockWant = 0;
    if (band.matches || innerWidth < 1181) { slot = null; Object.assign(dock, open); return; }
    const zoneTop = headerH() + 40, zoneBottom = innerHeight * .8;
    wideCards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.top < zoneBottom && r.bottom > zoneTop) dockWant = 1;
      if (r.top < innerHeight && r.bottom > zoneTop) slot = slots[i]; // the lowest one in view
    });
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    dock.x = r.left + r.width / 2; dock.y = r.top + r.height * .5; dock.d = 2.45 * W / (r.width * hTan);
  }
  addEventListener('scroll', checkDock, { passive: true });
  addEventListener('resize', resize);
  band.addEventListener('change', () => requestAnimationFrame(() => { paintFloor(); resize(); }));
  resize(); dockK = dockWant; frameCell();

  /* ---------- render loop with pausing ---------- */
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); invalidate(); } });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; root.classList.remove('gl'); });
  addEventListener('scroll', () => invalidate(), { passive: true });
  reduceMotion.addEventListener('change', invalidate);

  const clock = new THREE.Clock();
  let camA = 0, camLook = 0, near = 0;
  const focus = new THREE.Vector3(), view = new THREE.Vector3(); // on phones the camera centres between arm and active exhibit
  const ang = { yaw: -.8, a1: 1.2, a2: -2, wrist: 0 };

  function updateCamera(t, dt, still) {
    const sp = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const k = still ? 1 : 1 - Math.pow(.05, dt);
    if (dockK !== dockWant || dockK > 0) { // glide between the open and the docked framing; the slot moves with the page
      dockK = still || Math.abs(dockWant - dockK) < .002 ? dockWant : dockK + (dockWant - dockK) * (1 - Math.pow(.001, dt));
      frameCell();
    }
    const ex = mode === 'ex', strip = band.matches;
    // With no station active the camera looks in through the gap at the back of the ring, so the arm hides none of them.
    // With one active, that station comes to the front right and the far side of the view falls between two stations.
    const wantA = ex ? exhibits[active].phi - (strip ? .5 : STEP) : 0;
    camA = still ? wantA : angleLerp(camA, wantA, 1 - Math.pow(.15, dt));
    camLook = camA + (still ? 0 : Math.sin(t * .15) * .04);
    // The phone strip moves in on the active station: its prop, its neighbours and the gripper coming down.
    near += ((strip && ex ? 1 : 0) - near) * k;
    if (strip && ex) focus.copy(exhibits[active].g.position).multiplyScalar(.55); else focus.set(0, 0, 0); // between the arm and its station, so both stay in the strip
    view.lerp(focus, k);
    const d = strip ? camDist + (closeD - camDist) * near : camDist, s = d / 7.2;
    const lookY = strip ? .75 - .3 * near : .42;
    const high = strip ? 1.15 + (lookY + closeD * .3 - 1.15) * near : (5.5 - (still ? 0 : sp * .4)) * s;
    camera.position.set(view.x + Math.sin(camLook) * d, high, view.z + Math.cos(camLook) * d);
    camera.lookAt(view.x, lookY, view.z);
    camera.updateMatrixWorld();
  }

  // Sets where the gripper is heading and how far it is closed.
  function updateGoal(t, still) {
    if (mode === 'mouse') {
      if (!pointerSeen) { const a = camA + .55 + (still ? 0 : Math.sin(t * .5) * .06); goal.set(Math.sin(a) * .95, 1 + (still ? 0 : Math.sin(t * .8) * .04), Math.cos(a) * .95); }
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
      goal.set(tmp.x, PED_H * RISE + ex.h * 1.9 + .1 + (still ? 0 : Math.sin(t * 2) * .01), tmp.z); // clear air above the presented prop
      gripGoal = .75;
    } else { // contact: hold still in a relaxed home pose, raised over the turntable
      goal.set(Math.sin(camA - .55) * .95, 1, Math.cos(camA - .55) * .95);
      gripGoal = 0;
    }
  }

  // Moves the joints towards the goal and returns the IK solution.
  function updateArm(dt, still) {
    target.lerp(goal, still ? 1 : 1 - Math.pow(.004, dt));
    const sol = solveIK(target);
    const jk = still ? 1 : 1 - Math.pow(1e-5, dt);
    ang.yaw = angleLerp(ang.yaw, sol.yaw, jk); ang.a1 += (sol.a1 - ang.a1) * jk; ang.a2 += (sol.a2 - ang.a2) * jk;
    ang.wrist = -Math.PI / 2 - ang.a1 - ang.a2;
    yawG.rotation.y = ang.yaw; shoulder.rotation.z = ang.a1; elbow.rotation.z = ang.a2; wrist.rotation.z = ang.wrist;
    grip += (gripGoal - grip) * (still ? 1 : 1 - Math.pow(1e-4, dt));
    fingers[0].position.y = .07 - grip * .035; fingers[1].position.y = -.07 + grip * .035;
    return sol;
  }

  function updateExhibits(t, dt, still) {
    exhibits.forEach((ex, i) => {
      const on = i === active, hot = i === hovered;
      if (still) ex.item.rotation.y = camA + (on ? 0 : Math.sin(i * 1.7) * .35); // props still face the viewer
      else {
        const face = camA + (on ? 0 : Math.sin(t * .4 + i * 1.7) * .5);
        ex.item.rotation.y = angleLerp(ex.item.rotation.y, face, 1 - Math.pow(.05, dt));
        if (ex.item.userData.spin) ex.item.userData.spin.rotation.z = .5 + Math.sin(t * 2) * .4;
      }
      ex.halo.visible = on || hot;
      ex.item.scale.setScalar(on ? 1.9 : 1.2);
      ex.rise = still ? (on ? RISE : 1) : ex.rise + ((on ? RISE : 1) - ex.rise) * (1 - Math.pow(.002, dt));
      ex.ped.scale.y = ex.rise; ex.item.position.y = PED_H * ex.rise;
      if (on) tmp.set(Math.sin(ex.phi) * (TABLE + .04), 0, Math.cos(ex.phi) * (TABLE + .04)); else { ex.g.getWorldPosition(tmp); tmp.y = 0; }
      tmp.project(camera);
      const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
      ex.tag.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,${on ? 14 : 30}px)`;
      ex.tag.classList.toggle('on', hot || (on && band.matches));
      const n = numerals[i], gp = ex.g.position;
      // Outwards for stations near the viewer, sideways for those at the back: never onto a neighbour.
      let ox = Math.sin(ex.phi) + Math.sin(camLook), oz = Math.cos(ex.phi) + Math.cos(camLook);
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      n.m.rotation.z = camLook;
      n.m.position.x = gp.x + ox * .5; n.m.position.z = gp.z + oz * .5;
      n.mat.color.setHex(on ? P.acc : P.num);
      ex.tag.classList.toggle('cur', on);
      // Where this station sits on screen, to tell below whether it covers another station's number.
      const sx = v => (v.x + 1) / 2 * W, sy = v => (1 - v.y) / 2 * H, b = ex.box;
      tmp.copy(n.m.position).project(camera); b.nx = sx(tmp); b.ny = sy(tmp);
      tmp.set(gp.x + Math.cos(camLook) * .33, 0, gp.z - Math.sin(camLook) * .33).project(camera); const edge = sx(tmp);
      tmp.set(gp.x, 0, gp.z).project(camera); b.x = sx(tmp); b.half = Math.abs(edge - b.x);
      tmp.set(gp.x, ex.item.position.y + ex.h * ex.item.scale.x, gp.z).project(camera); b.top = sy(tmp);
      tmp.set(gp.x + Math.sin(camLook) * .3, 0, gp.z + Math.cos(camLook) * .3).project(camera); b.bottom = sy(tmp);
      b.dist = camera.position.distanceToSquared(gp);
    });
    // A number that a nearer station half covers reads as a glitch, so it fades out instead.
    exhibits.forEach((ex, i) => {
      const a = ex.box, n = numerals[i], on = i === active;
      const nw = a.half * .45, nh = a.half * .2;
      const covered = exhibits.some(o => o !== ex && o.box.dist < a.dist && Math.abs(a.nx - o.box.x) < o.box.half + nw && a.ny + nh > o.box.top && a.ny - nh < o.box.bottom);
      const want = covered || band.matches || (dockK > .5 && !on) ? 0 : on ? 1 : P.numOp; // the strip's chip names the station; the docked cell shows only the active number
      n.mat.opacity = still ? want : n.mat.opacity + (want - n.mat.opacity) * (1 - Math.pow(.01, dt));
    });
  }


  function frame() {
    raf = 0;
    if (!running) return;
    const still = reduceMotion.matches;
    const dt = Math.min(clock.getDelta(), .1), t = clock.elapsedTime;

    updateCamera(t, dt, still);
    updateGoal(t, still);
    const sol = updateArm(dt, still);
    updateExhibits(t, dt, still);

    renderer.render(scene, camera);
    window.__wcReady = true;

    // Keep animating unless reduced motion is on and the scene has settled.
    if (still) { if (--dirty > 0) raf = requestAnimationFrame(frame); }
    else raf = requestAnimationFrame(frame);
  }

  invalidate();
}

try { init(); } catch (err) { console.warn('Workcell: 3D stage failed, text-only layout in use.', err); root.classList.remove('gl'); }
