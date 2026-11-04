import * as THREE from 'three';
import { Grid } from './grid.js';
import { TapeDirector } from './base.js';
import { canvasTex } from './materials.js';

// TAPE 04: CLOSING TIME
// A mall after hours. The main doors are chained; the only way out is the parking
// garage, and its gate is run from the security office upstairs. The guard's keycard
// is pinned to one of the mannequins. Something blind walks the ground floor.

const MALL = { fog: [0x0c0b12, 0.024], hemi: 0.1, ambient: 0.12, bloom: [0.7, 0.72], reverb: [0.7, 0.1], ambience: ['mall_ambience', 0.35] };
const ZONES = {
  A: { ...MALL, name: 'atrium', fog: [0x0c0b12, 0.018], reverb: [0.8, 0.08], ambience: ['mall_ambience', 0.45] },
  W: { ...MALL, name: 'west concourse', floor: 'tile' },
  E: { ...MALL, name: 'east concourse', floor: 'tile' },
  N: { ...MALL, name: 'north concourse', floor: 'tile' },
  S: { ...MALL, name: 'south concourse', floor: 'tile' },
  D: { name: 'department store', floor: 'carpet', fog: [0x0d0c0c, 0.032], hemi: 0.06, ambient: 0.1, bloom: [0.7, 0.72], reverb: [0.2, 0.25], ambience: ['fluorescent_hum', 0.2] },
  F: { name: 'food court', floor: 'tile', fog: [0x0e0c0a, 0.03], hemi: 0.08, ambient: 0.12, bloom: [0.7, 0.72], reverb: [0.5, 0.15], ambience: ['fluorescent_hum', 0.2] },
  R: { name: 'arcade', floor: 'carpet', fog: [0x07060c, 0.035], hemi: 0.04, ambient: 0.08, env: 0.5, bloom: [0.9, 0.6], reverb: [0.15, 0.3], ambience: ['arcade_hum', 0.6] },
  T: { name: 'toy store', floor: 'tile', fog: [0x0e0c10, 0.035], hemi: 0.06, ambient: 0.1, bloom: [0.7, 0.72], reverb: [0.15, 0.3], ambience: ['fluorescent_hum', 0.15] },
  o: { name: 'security office', floor: 'tile', fog: [0x10120f, 0.03], hemi: 0.12, ambient: 0.25, reverb: [0.05, 0.35], ambience: ['fluorescent_hum', 0.3] },
  p: { name: 'garage ramp', floor: 'concrete', fog: [0x0c0a06, 0.045], hemi: 0.05, ambient: 0.08, env: 0.3, reverb: [0.4, 0.4], ambience: ['dark_ambience', 0.3] },
  G: { name: 'parking garage', floor: 'concrete', fog: [0x0c0a06, 0.04], hemi: 0.05, ambient: 0.08, env: 0.3, bloom: [0.6, 0.75], reverb: [0.45, 0.4], ambience: ['dark_ambience', 0.35] },
  x: { name: 'exit ramp', floor: 'concrete', fog: [0x0a0c12, 0.04], hemi: 0.06, ambient: 0.1, env: 0.3, reverb: [0.3, 0.3], ambience: ['rain_loop', 0.45] },
  O: { name: 'outside', floor: 'concrete', fog: [0x0a0e18, 0.035], hemi: 0.12, ambient: 0.15, env: 0.3, reverb: [0, 0.05], ambience: ['rain_loop', 0.8] },
};

const SOUNDS = [
  'mall_ambience', 'dark_ambience', 'muzak', 'arcade_attract', 'arcade_hum', 'tray_clatter', 'cart_roll', 'carousel_music', 'escalator_hum',
  'car_alarm', 'rain_loop', 'photo_flash', 'keycard_beep', 'lever_clunk', 'soda_loop', 'fountain', 'chair_creak',
  't4_pa1', 't4_pa2', 't4_pa3', 't4_pa4', 't4_memo1', 't4_memo2', 't4_memo3', 't4_memo4', 't4_memo5', 't4_memo6', 't4_memo7', 't4_memo8',
];

const MEMOS = [
  'night shift, first week. main doors get chained at ten. the garage gate\'s run from the security office upstairs. easy job, they said.',
  'found a tray on table nine with fresh fries on it. still warm. the mall\'s been closed for three hours.',
  'the mannequins in the department store keep ending up near the front. i move them back every night. every night they\'re a little closer to the doors.',
  'the games turn on by themselves around two. same high score on every machine. three letters.',
  'something\'s walking the halls. it doesn\'t see me. it hears me. when i hold still, it goes right past. walk soft. don\'t run.',
  'i pinned my keycard on one of the mannequins as a joke. now i can\'t find which one. they\'ve all got my jacket on.',
  'the PA keeps saying the mall is closed. i never set it to say that. it\'s not a recording. someone\'s talking.',
  'if you\'re hearing this, the gate\'s open. go up the ramp and don\'t stop. it\'ll tell you you\'re not allowed to leave. you are.',
];

// ---------- painted things ----------
const screenTexture = (hue) => canvasTex(128, 96, (g, w, h) => {
  g.fillStyle = '#05040a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${hue + Math.random() * 60}, 90%, ${50 + Math.random() * 20}%)`; g.fillRect(Math.floor(Math.random() * 16) * 8, 40 + Math.floor(Math.random() * 6) * 8, 6, 6); }
  g.font = 'bold 12px monospace';
  g.fillStyle = '#ffe25a';
  g.textAlign = 'center';
  g.fillText('HI-SCORE', w / 2, 16);
  g.fillText('999990  YOU', w / 2, 30);
}, { repeat: false });

const menuTexture = (title, color) => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#1a1410';
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.font = 'bold 34px Arial';
  g.textAlign = 'center';
  g.fillText(title, w / 2, 40);
  g.font = '14px Arial';
  g.fillStyle = '#e8dcc0';
  for (let i = 0; i < 3; i++) g.fillText('combo ' + (i + 1) + '  . . . . . .  $' + (3 + i) + '.99', w / 2, 62 + i * 13);
}, { repeat: false });

const noteTexture = () => canvasTex(256, 160, (g, w, h) => {
  g.fillStyle = '#f2eedc';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#222';
  g.font = 'bold 22px Arial';
  g.textAlign = 'center';
  g.fillText('AFTER HOURS EXIT:', w / 2, 40);
  g.fillText('PARKING GARAGE', w / 2, 70);
  g.font = '16px Arial';
  g.fillText('gate controlled from', w / 2, 104);
  g.fillText('SECURITY - LEVEL 2', w / 2, 128);
}, { repeat: false });

// ---------- props ----------
function recorder(c, x, y, z, rot, key, n) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.11), c.M.plastic));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), c.M.ledRed);
  led.position.set(0.018, 0.018, 0.04);
  g.add(led);
  g.position.set(x, y + 0.015, z);
  g.rotation.y = rot;
  c.mesh(g);
  return c.item('recording', x, y + 0.03, z, { key, mesh: g, led, voice: `t4_memo${n}`, text: MEMOS[n - 1], seconds: 10, reach: 2.2, cos: 0.75 });
}

// a mannequin: smooth, faceless, posed a little differently each time
function mannequin(c, x, y, z, rot, jacket, seed) {
  const M = c.level.mats;
  const g = new THREE.Group();
  const part = (geo, mat, px, py, pz, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.set(rx, 0, rz); g.add(m); return m; };
  const skin = M.mannequin, body = jacket ? M.jacket : M.mannequin;
  part(new THREE.CylinderGeometry(0.09, 0.08, 0.82, 10), skin, -0.1, 0.42, 0);
  part(new THREE.CylinderGeometry(0.09, 0.08, 0.82, 10), skin, 0.1, 0.42, 0);
  part(new THREE.CylinderGeometry(0.17, 0.15, 0.25, 12), body, 0, 0.92, 0);
  part(new THREE.CylinderGeometry(0.21, 0.17, 0.5, 12), body, 0, 1.3, 0);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), skin, 0, 1.6, 0);
  part(new THREE.SphereGeometry(0.12, 14, 10).scale(0.85, 1.15, 0.95), skin, 0, 1.76, 0);
  const s = (k) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + 0.5;
  for (const side of [-1, 1]) {
    const arm = part(new THREE.CylinderGeometry(0.05, 0.04, 0.68, 8), jacket ? M.jacket : skin, side * 0.27, 1.22, 0, (s(side) - 0.5) * 0.9, side * (0.12 + s(side + 3) * 0.4));
    arm.translateY(-0.08);
  }
  g.position.set(x, y, z);
  g.rotation.y = rot;
  c.mesh(g);
  return g;
}

function car(c, x, z, rot, color) {
  const M = c.M, y = -4;
  const q = Math.round(rot / (Math.PI / 2)) & 1;
  const [w, l] = q ? [4.2, 1.8] : [1.8, 4.2];
  c.box(x - w / 2, x + w / 2, y + 0.3, y + 1.0, z - l / 2, z + l / 2, color, true);
  const [cw, cl] = q ? [2.2, 1.6] : [1.6, 2.2];
  c.box(x - cw / 2, x + cw / 2, y + 1.0, y + 1.5, z - cl / 2, z + cl / 2, c.level.mats.carGlass);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wx = x + dx * (w / 2 - (q ? 0.8 : 0.1)), wz = z + dz * (l / 2 - (q ? 0.1 : 0.8));
    const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12);
    wheel.rotateZ(q ? 0 : Math.PI / 2);
    if (q) wheel.rotateX(Math.PI / 2);
    wheel.translate(wx, y + 0.33, wz);
    c.add(wheel, M.plastic);
  }
}

function lamp(c, list, x, y, z, w, d, o = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), o.dead ? c.M.panelDead : (o.mat ?? c.M.panel));
  mesh.position.set(x, y - 0.015, z);
  c.mesh(mesh);
  const anchor = c.light(x, y - 0.5, z, { color: o.color ?? 0xfff0d8, intensity: o.intensity ?? 2, distance: o.distance ?? 10, flicker: o.flicker, on: !o.dead });
  const l = { mesh, anchor, x, z, onMat: o.mat ?? c.M.panel };
  list?.push(l);
  return l;
}

// a closed shop: a shutter down, a sign still lit
function shutterFront(c, x1, x2, z, facing, label, color) {
  const M = c.M, dz = facing === 's' ? 0.04 : -0.04;
  c.box(x1, x2, 0, 3.4, Math.min(z, z + dz), Math.max(z, z + dz), M.mlShutter);
  for (let y = 0.3; y < 3.4; y += 0.3) c.box(x1, x2, y, y + 0.03, Math.min(z, z + dz * 1.5), Math.max(z, z + dz * 1.5), M.metal);
  if (label) c.plane((x1 + x2) / 2, 4.0, z + dz, Math.min(4.5, x2 - x1 - 0.4), 0.6, facing, c.sign(label, color), 0.02);
}
function shutterFrontX(c, z1, z2, x, facing, label, color) {
  const M = c.M, dx = facing === 'e' ? 0.04 : -0.04;
  c.box(Math.min(x, x + dx), Math.max(x, x + dx), 0, 3.4, z1, z2, M.mlShutter);
  for (let y = 0.3; y < 3.4; y += 0.3) c.box(Math.min(x, x + dx * 1.5), Math.max(x, x + dx * 1.5), y, y + 0.03, z1, z2, M.metal);
  if (label) c.plane(x + dx, 4.0, (z1 + z2) / 2, Math.min(4.5, z2 - z1 - 0.4), 0.6, facing, c.sign(label, color), 0.02);
}

// a staircase (or a stopped escalator) along z: height y1 at z1, y2 at z2
function stairs(c, x1, x2, z1, z2, y1, y2, mat) {
  const n = Math.max(2, Math.round(Math.abs(y2 - y1) / 0.22));
  c.ramp(x1, x2, z1, z2, y1, y2, 'z');
  for (let i = 0; i < n; i++) {
    const za = z1 + (z2 - z1) * i / n, zb = z1 + (z2 - z1) * (i + 1) / n;
    const top = Math.max(y1 + (y2 - y1) * i / n, y1 + (y2 - y1) * (i + 1) / n);
    c.box(x1, x2, 0, top, za, zb, mat);
    if (top > 0.7) c.collide(x1, x2, za, zb, 0, top - 0.35);
  }
}

// ---------- the floor plan ----------
function build(c, L) {
  const M = c.M;
  const mats = L.mats = {
    mannequin: new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.35, emissive: 0x1a1816 }),
    jacket: new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.8 }),
    badge: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 1.6) }),
    carGlass: new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.05, metalness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.3, metalness: 0.5 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2a3a6a, roughness: 0.3, metalness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xcfcfc8, roughness: 0.3, metalness: 0.5 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.3, metalness: 0.5 }),
    paint: new THREE.MeshBasicMaterial({ color: 0x8a8670 }),
    moon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.07, 0.12) }),
    neonPink: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.2, 0.8) }),
    neonCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 1.1, 1.3) }),
    screens: [0, 140, 280].map((h) => new THREE.MeshBasicMaterial({ map: screenTexture(h), color: new THREE.Color(1.5, 1.5, 1.5) })),
    note: new THREE.MeshBasicMaterial({ map: noteTexture(), color: 0xaaaaaa }),
    plush: new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 }),
    toys: [0xe04a4a, 0x4a8ae0, 0xf2c84a, 0x5ac08a, 0xc87ae0].map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 })),
    gate: new THREE.MeshStandardMaterial({ color: 0x6a6e70, roughness: 0.5, metalness: 0.7 }),
    rain: new THREE.MeshBasicMaterial({ color: 0x8090a8, transparent: true, opacity: 0.35, depthWrite: false }),
  };
  const meta = L.meta = { lamps: [], mannequins: [], screens: [], trays: [], garageLamps: [] };

  const g = new Grid(66, 64, 2);
  g.fill(20, 12, 39, 31, 'A');
  g.fill(4, 18, 19, 25, 'W').fill(40, 18, 55, 25, 'E').fill(26, 2, 33, 11, 'N').fill(26, 32, 33, 39, 'S');
  g.fill(4, 4, 18, 15, 'D').fill(9, 16, 14, 17, 'D');
  g.fill(4, 28, 18, 41, 'F').fill(8, 26, 15, 27, 'F');
  g.fill(41, 4, 54, 15, 'R').fill(45, 16, 49, 17, 'R');
  g.fill(41, 28, 47, 37, 'T').fill(42, 26, 45, 27, 'T');
  g.fill(28, 40, 31, 45, 'p');
  g.fill(16, 46, 47, 61, 'G');
  g.fill(48, 56, 55, 59, 'x').fill(56, 54, 63, 61, 'O');
  meta.grid = g;
  g.build(c, {
    A: { floor: M.mlFloor, ceil: mats.moon, wall: M.mlWall, base: M.mlPillar, height: 12, zone: 'A' },
    W: { floor: M.mlFloor, ceil: M.mlCeiling, wall: M.mlWall, base: M.mlPillar, height: 8, zone: 'W' },
    E: { floor: M.mlFloor, ceil: M.mlCeiling, wall: M.mlWall, base: M.mlPillar, height: 8, zone: 'E' },
    N: { floor: M.mlFloor, ceil: M.mlCeiling, wall: M.mlWall, base: M.mlPillar, height: 8, zone: 'N' },
    S: { floor: M.mlFloor, ceil: M.mlCeiling, wall: M.mlWall, base: M.mlPillar, height: 8, zone: 'S' },
    D: { floor: M.ofCarpet, ceil: M.ofCeiling, wall: M.ofWall, base: M.deskMetal, height: 6, zone: 'D' },
    F: { floor: M.ofTile, ceil: M.mlCeiling, wall: M.mlWall, base: M.mlPillar, height: 7, zone: 'F' },
    R: { floor: M.ofCarpet, ceil: M.plastic, wall: M.plastic, height: 5, zone: 'R' },
    T: { floor: M.mlFloor, ceil: M.ofCeiling, wall: M.mlWall, height: 5, zone: 'T' },
    p: { floor: null, ceil: M.concrete, wall: M.concrete, height: 3, floorY: -4, zone: 'p' },
    G: { floor: M.concrete, ceil: M.concrete, wall: M.concrete, height: -0.5, floorY: -4, zone: 'G' },
    x: { floor: null, ceil: M.concrete, wall: M.concrete, height: 2.5, floorY: -4, zone: 'x' },
    O: { floor: M.concrete, ceil: null, wall: M.concrete, height: 10, zone: 'O' },
  });

  atrium(c, meta, mats);
  concourses(c, meta, mats);
  department(c, meta, mats);
  foodCourt(c, meta, mats);
  arcade(c, meta, mats);
  toyStore(c, meta, mats);
  office(c, meta, mats);
  garage(c, meta, mats);
}

function atrium(c, meta, mats) {
  const M = c.M;
  // the fountain, still running for nobody
  c.lathe(62, 46, [[0, 0.25], [3.1, 0.25], [3.1, 0.6], [3.5, 0.6], [3.5, 0]], M.mlPlanter, 40);
  c.cyl(62, 46, 3.1, 3.1, 0.25, 0.45, M.waterBright, 40);
  c.cyl(62, 46, 0.4, 0.5, 0.45, 2.0, M.mlPlanter, 16);
  c.cyl(62, 46, 1.2, 0.8, 2.0, 2.2, M.mlPlanter, 24);
  c.cyl(62, 46, 1.0, 1.0, 2.2, 2.21, M.waterBright, 24);
  for (const [a, b] of [[3.5, 1.8], [1.8, 3.5], [2.7, 2.7]]) c.collide(62 - a, 62 + a, 46 - b, 46 + b, 0, 0.7);
  c.light(62, 0.35, 46, { color: 0x6ad0ff, intensity: 1.1, distance: 7 });
  meta.fountain = new THREE.Vector3(62, 1, 46);
  // benches, planters
  for (const [x, z, alongX] of [[58, 54.5, true], [66, 38, true], [56, 42, false], [69, 50, false]]) {
    if (alongX) c.box(x - 1.2, x + 1.2, 0, 0.45, z - 0.3, z + 0.3, M.mlBench, true);
    else c.box(x - 0.3, x + 0.3, 0, 0.45, z - 1.2, z + 1.2, M.mlBench, true);
  }
  for (const [x, z] of [[46, 30], [76, 30], [46, 58], [76, 58]]) { c.cyl(x, z, 0.9, 0.8, 0, 0.8, M.mlPlanter, 16, true); c.sphere(x, 1.6, z, 0.9, M.mlLeaf); }
  // the carousel, small, for children
  const car = new THREE.Group();
  car.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.2, 24), mats.toys[0]));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.9, 24), mats.toys[2]);
  roof.position.y = 2.9;
  car.add(roof);
  car.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8).translate(0, 1.35, 0), M.metal));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6), M.metal);
    pole.position.set(Math.cos(a) * 1.6, 1.3, Math.sin(a) * 1.6);
    car.add(pole);
    const horse = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.8), mats.toys[(i % 4) + 1]);
    horse.position.set(Math.cos(a) * 1.6, 0.9 + (i % 2) * 0.2, Math.sin(a) * 1.6);
    horse.rotation.y = -a;
    car.add(horse);
  }
  car.position.set(66, 0.1, 53);
  c.mesh(car);
  c.collide(63.8, 68.2, 50.8, 55.2, 0, 3);
  meta.carousel = { obj: car, speed: 0 };
  // the gallery: a walkway all round at the second floor, glass rails on the inside
  const Y = 5.5;
  for (const [x1, x2, z1, z2] of [[40, 80, 24, 32], [40, 80, 56, 64], [40, 48, 32, 56], [72, 80, 32, 56]]) {
    c.box(x1, x2, Y - 0.4, Y, z1, z2, M.mlFloor);
    c.platform(x1, x2, z1, z2, Y, false);
  }
  c.box(49, 53.6, Y - 0.4, Y, 32, 34, M.mlFloor);
  c.platform(49, 53.6, 32, 34, Y, false);
  const rail = (x1, x2, z1, z2) => {
    c.box(x1, x2, Y, Y + 1.05, z1, z2, M.mlGlass);
    c.box(x1 - 0.02, x2 + 0.02, Y + 1.05, Y + 1.12, z1 - 0.02, z2 + 0.02, M.metal);
    c.collide(x1, x2, z1, z2, Y - 0.1, Y + 1.2);
  };
  rail(47.95, 48.05, 32, 56);
  rail(71.95, 72.05, 32, 56);
  rail(48, 49, 31.95, 32.05);
  rail(53.6, 72, 31.95, 32.05);
  rail(48, 72, 55.95, 56.05);
  rail(49, 49.05, 32, 34);
  rail(53.55, 53.6, 32, 34);
  for (const [x, z] of [[48, 32], [48, 44], [48, 56], [72, 32], [72, 44], [72, 56], [60, 32], [60, 56]]) c.box(x - 0.35, x + 0.35, 0, Y - 0.4, z - 0.35, z + 0.35, M.mlPillar, true);
  // stopped escalators up to the gallery
  for (const [x1, x2] of [[49, 51.2], [51.4, 53.6]]) {
    stairs(c, x1, x2, 34, 50, Y, 0, M.deskMetal);
    c.quad([x1 - 0.06, Y, 34], [x1 - 0.06, Y + 1.0, 34], [x1 - 0.06, 1.0, 50], [x1 - 0.06, 0, 50], M.mlGlass, [-1, 0, 0]);
    c.quad([x2 + 0.06, Y, 34], [x2 + 0.06, 0, 50], [x2 + 0.06, 1.0, 50], [x2 + 0.06, Y + 1.0, 34], M.mlGlass, [1, 0, 0]);
    for (const xr of [x1 - 0.06, x2 + 0.06]) c.quad([xr - 0.05, Y + 1.0, 34], [xr + 0.05, Y + 1.0, 34], [xr + 0.05, 1.0, 50], [xr - 0.05, 1.0, 50], M.plastic);
  }
  meta.escalator = new THREE.Vector3(52.5, 2.5, 42);
  // what's left of the light: emergency lamps under the gallery, moonlight from above
  for (let x = 44; x <= 76; x += 8) for (const z of [28, 60]) lamp(c, meta.lamps, x, Y - 0.4, z, 0.6, 0.6, { intensity: 1.6, distance: 9, color: 0xffd0a0, flicker: x === 60 && z === 28 });
  for (const z of [36, 44, 52]) for (const x of [44, 76]) lamp(c, meta.lamps, x, Y - 0.4, z, 0.6, 0.6, { intensity: 1.4, distance: 8, color: 0xffd0a0 });
  for (const [x, z] of [[54, 38], [68, 38], [54, 50], [68, 50]]) c.light(x, 10.5, z, { color: 0x7a9ad8, intensity: 2.2, distance: 18 });
  // the second floor's shops, all shuttered
  for (const [x1, x2, label, col] of [[42, 50, 'SUNGLASS', '#ff8adc'], [68, 78, 'VIDEO', '#8affd0']]) {
    c.box(x1, x2, Y, Y + 3.2, 24.0, 24.06, M.mlShutter);
    c.plane((x1 + x2) / 2, Y + 3.7, 24.07, 4, 0.6, 's', c.sign(label, col), 0.02);
  }
  for (const [x1, x2, label, col] of [[42, 52, 'CANDLES', '#ffd08a'], [68, 78, 'MUSIC', '#8ab8ff']]) {
    c.box(x1, x2, Y, Y + 3.2, 63.94, 64, M.mlShutter);
    if (label) c.plane((x1 + x2) / 2, Y + 3.7, 63.93, 4, 0.6, 'n', c.sign(label, col), 0.02);
  }
  recorder(c, 50.5, Y, 30.2, 0.3, 'r6', 6);
}

function concourses(c, meta, mats) {
  const M = c.M;
  // closed shops along every hall
  shutterFront(c, 8.4, 17.6, 36, 's', 'CLOSED', '#ff6a6a');
  shutterFront(c, 30.4, 37.6, 36, 's', 'SALE', '#ffd06a');
  shutterFront(c, 8.4, 15.6, 52, 'n', 'OPTICAL', '#8ad0ff');
  shutterFront(c, 32.4, 37.6, 52, 'n', '', '');
  shutterFront(c, 80.4, 89.6, 36, 's', 'SHOES', '#ff8adc');
  shutterFront(c, 100.4, 111.6, 36, 's', 'GIFTS', '#ffd06a');
  shutterFront(c, 96.4, 111.6, 52, 'n', 'GONE', '#d0d0d0');
  shutterFrontX(c, 6.4, 23.6, 52, 'e', 'BOOKS', '#8affb0');
  shutterFrontX(c, 6.4, 23.6, 68, 'w', 'PHONES', '#8ad0ff');
  shutterFrontX(c, 64.4, 79.6, 52, 'e', 'JEWELRY', '#ffe28a');
  shutterFrontX(c, 64.4, 79.6, 68, 'w', '', '');
  // store signs over the open ones
  c.plane(24, 7.0, 36.05, 6, 0.9, 's', c.sign('HALBROOK\'S', '#ffe8c8'), 0.02);
  c.plane(24, 7.5, 51.95, 6, 0.8, 'n', c.sign('FOOD COURT', '#ffb86a'), 0.02);
  c.plane(95, 6.5, 36.05, 7, 0.9, 's', c.sign('STARLIGHT ARCADE', '#d08aff'), 0.02);
  c.plane(88, 6.5, 51.95, 5, 0.9, 'n', c.sign('TOY BOX', '#8affd8'), 0.02);
  c.plane(60, 4.6, 79.95, 6, 0.9, 'n', c.sign('P  PARKING', '#8ab8ff'), 0.02);
  // the main doors, chained, and a note taped to them
  for (const x of [54, 58, 62, 66]) {
    c.box(x - 1.9, x + 1.9, 0, 3.2, 4.0, 4.06, M.mlGlass);
    c.box(x - 0.05, x + 0.05, 0, 3.2, 4.0, 4.12, M.metal);
  }
  c.box(52, 68, 3.2, 3.4, 4.0, 4.14, M.metal);
  for (const x of [56, 64]) for (let i = 0; i < 8; i++) c.box(x - 0.9 + i * 0.24, x - 0.75 + i * 0.24, 1.05 + (i % 2) * 0.04, 1.13 + (i % 2) * 0.04, 4.12, 4.18, M.metal);
  c.plane(60, 1.5, 4.13, 0.6, 0.38, 's', mats.note, 0.02);
  meta.entrance = c.item('sign', 60, 1.5, 4.4, { prompt: '[E] read the note', reach: 2.4, cos: 0.6 });
  c.box(58.6, 61.4, 0, 0.45, 7.6, 8.2, M.mlBench, true);
  recorder(c, 59.4, 0.45, 7.9, 0.4, 'r1', 1);
  // lights down the halls, many of them dead
  let k = 0;
  for (const [x1, x2, z] of [[10, 38, 44], [82, 110, 44]]) for (let x = x1; x <= x2; x += 7) lamp(c, meta.lamps, x, 8, z, 1.4, 0.7, { dead: (k++) % 3 === 1, flicker: k % 5 === 3, intensity: 1.8, distance: 11 });
  for (let z = 6; z <= 22; z += 6) lamp(c, meta.lamps, 60, 8, z, 1.4, 0.7, { intensity: 1.6, distance: 11, dead: z === 12 });
  for (let z = 66; z <= 78; z += 6) lamp(c, meta.lamps, 60, 8, z, 1.4, 0.7, { intensity: 1.6, distance: 11, flicker: z === 72 });
  // a photo booth that still works
  c.box(104, 106, 0, 2.4, 38.2, 40.2, mats.toys[0], true);
  c.box(104, 106, 2.4, 2.6, 38.2, 40.2, M.mlPillar);
  c.plane(105, 1.3, 40.22, 1.4, 1.9, 's', M.plastic, 0.01);
  meta.booth = new THREE.Vector3(105, 1.4, 40.8);
  meta.boothFlash = c.light(105, 1.6, 41.2, { color: 0xffffff, intensity: 0, distance: 10, on: true });
  // the cart that rolls out of nowhere
  const cart = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.9), M.metal);
  basket.position.y = 0.75;
  cart.add(basket);
  for (const [dx, dz] of [[-0.22, -0.38], [0.22, -0.38], [-0.22, 0.38], [0.22, 0.38]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8).rotateZ(Math.PI / 2), M.plastic); w.position.set(dx, 0.07, dz); cart.add(w); }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.03), M.plastic);
  handle.position.set(0, 1.05, -0.5);
  cart.add(handle);
  c.mesh(cart);
  meta.cart = cart;
}

function department(c, meta, mats) {
  const M = c.M;
  // racks of clothes in rows, round display tables, a counter
  for (let x = 12; x <= 34; x += 5.5) {
    for (const z of [11, 17]) {
      c.box(x - 1.6, x + 1.6, 1.4, 1.45, z - 0.03, z + 0.03, M.metal);
      for (const dx of [-1.55, 1.55]) c.box(x + dx - 0.03, x + dx + 0.03, 0, 1.45, z - 0.03, z + 0.03, M.metal);
      for (let i = 0; i < 9; i++) c.box(x - 1.4 + i * 0.35, x - 1.15 + i * 0.35, 0.55, 1.38, z - 0.25, z + 0.25, mats.toys[(i + Math.floor(x)) % 5]);
      c.collide(x - 1.6, x + 1.6, z - 0.3, z + 0.3, 0, 1.5);
    }
  }
  for (const [x, z] of [[14, 24], [26, 24]]) c.cyl(x, z, 1.2, 1.2, 0, 0.5, M.mlPillar, 20, true);
  c.box(30, 37, 0, 1.0, 26, 27, M.lbWood, true);
  c.box(30, 37, 1.0, 1.04, 26, 27.1, M.mlGlass);
  recorder(c, 33, 1.04, 26.5, 0.5, 'r3', 3);
  // fitting rooms down the west wall
  for (let z = 10; z <= 28; z += 3) {
    c.box(8, 10, 0, 2.3, z - 0.04, z + 0.04, M.ofWall, true);
    c.box(9.96, 10.04, 1.9, 2.3, z, z + 3, M.metal);
    c.box(9.95, 10.0, 0.3, 1.9, z + 0.2, z + 2.8, mats.jacket);
  }
  // mannequins, everywhere, all facing the same way; and all of them wearing the guard's jacket
  const spots = [[13, 14], [18, 14], [23, 14], [29, 14], [35, 14], [14, 20], [20, 20], [26, 20], [32, 20], [14, 26.5], [26, 26.5], [20, 30], [12, 30], [34, 30], [16, 8.5], [28, 8.5]];
  spots.forEach(([x, z], i) => meta.mannequins.push({ obj: mannequin(c, x, 0, z, Math.PI + (i % 3 - 1) * 0.2, true, i), home: [x, z], floorY: 0, zone: 'D' }));
  // the one with the keycard, its badge catching the light
  const keyed = meta.mannequins[9];
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.11), mats.badge);
  badge.position.set(0.1, 1.38, 0.2);
  keyed.obj.add(badge);
  keyed.badge = badge;
  meta.keyed = keyed;
  meta.keycard = c.item('keycard', 0, 0, 0, { prompt: '[E] take the keycard', reach: 1.8, cos: 0.6 });
  for (let x = 12; x <= 34; x += 7) for (const z of [12, 22, 30]) lamp(c, meta.lamps, x, 6, z, 1.2, 0.6, { intensity: 1.2, distance: 9, dead: (x + z) % 3 === 0, flicker: x === 26 && z === 22 });
}

function foodCourt(c, meta, mats) {
  const M = c.M;
  // tables and chairs; trays still on some
  let n = 0;
  for (let x = 12; x <= 34; x += 5.5) {
    for (let z = 60; z <= 76; z += 5.5) {
      n++;
      c.cyl(x, z, 0.6, 0.6, 0.72, 0.76, M.mlBench, 16);
      c.cyl(x, z, 0.06, 0.25, 0, 0.72, M.metal, 8, true);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; c.cyl(x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, 0.22, 0.22, 0.42, 0.46, mats.toys[2], 12); c.cyl(x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, 0.03, 0.03, 0, 0.42, M.metal, 6); }
      if (n % 3 === 1) {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.025, 0.32), mats.toys[0]);
        tray.position.set(x + 0.1, 0.775, z - 0.1);
        tray.rotation.y = n;
        c.mesh(tray);
        meta.trays.push(tray);
      }
    }
  }
  recorder(c, 23.1, 0.76, 65.8, 0.7, 'r2', 2);
  // the counters along the back wall, menus still lit
  for (const [x, label, col] of [[12, 'PRETZELS', '#ffc860'], [20, 'WOK', '#ff6a5a'], [28, 'BURGERS', '#ffd84a'], [35, 'SMOOTHIE', '#8aff9a']]) {
    c.box(x - 3, x + 3, 0, 1.1, 81.6, 83.0, M.lbWood, true);
    c.box(x - 3, x + 3, 1.1, 1.15, 81.6, 83.0, M.mlGlass);
    c.plane(x, 3.2, 83.94, 5, 1.6, 'n', new THREE.MeshBasicMaterial({ map: menuTexture(label, col), color: new THREE.Color(1.3, 1.3, 1.3) }), 0.02);
    c.box(x - 3, x + 3, 0, 4.6, 83.0, 84, M.mlShutter);
  }
  meta.soda = new THREE.Vector3(35, 1.3, 82.3);
  c.box(34.2, 35.8, 1.15, 1.9, 82.0, 82.8, M.metal);
  for (let x = 12; x <= 34; x += 7) for (const z of [62, 74]) lamp(c, meta.lamps, x, 7, z, 1.2, 0.6, { intensity: 1.3, distance: 10, dead: x === 19 && z === 74 });
}

function arcade(c, meta, mats) {
  const M = c.M;
  // cabinets in rows, screens dark until it decides to wake
  for (const z of [10, 16, 22]) {
    for (let x = 85; x <= 107; x += 2.4) {
      if (z === 16 && x > 93 && x < 99) continue;
      c.box(x - 0.45, x + 0.45, 0, 1.8, z - 0.4, z + 0.4, M.plastic, true);
      c.box(x - 0.45, x + 0.45, 0.95, 1.05, z + 0.4, z + 0.6, mats.toys[Math.floor(x) % 5]);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), M.screenOff);
      scr.position.set(x, 1.45, z + 0.41);
      c.mesh(scr);
      meta.screens.push({ mesh: scr, mat: mats.screens[Math.floor(x * 3 + z) % 3] });
    }
  }
  // a claw machine, the prize still in it
  c.box(95, 97, 0, 0.9, 15.2, 16.8, M.plastic, true);
  c.box(95, 97, 0.9, 2.2, 15.2, 16.8, M.mlGlass);
  c.sphere(96, 1.1, 16, 0.22, mats.plush);
  // neon along the ceiling
  for (const [z, m] of [[7, mats.neonPink], [13, mats.neonCyan], [19, mats.neonPink], [25, mats.neonCyan]]) {
    c.box(84, 108, 4.86, 4.9, z - 0.04, z + 0.04, m);
    c.light(96, 4.4, z, { color: m === mats.neonPink ? 0xff4ab8 : 0x4ae8ff, intensity: 1.8, distance: 14 });
  }
  recorder(c, 100.2, 1.05, 22.5, 0.2, 'r4', 4);
  meta.arcade = new THREE.Vector3(96, 1.2, 16);
}

function toyStore(c, meta, mats) {
  const M = c.M;
  for (const x of [85, 90]) {
    c.box(x - 0.4, x + 0.4, 0, 2.2, 58, 74, M.lbWood, true);
    for (const y of [0.3, 0.9, 1.5]) for (let z = 58.4; z < 73.6; z += 0.8) c.box(x - 0.35, x + 0.35, y, y + 0.45, z, z + 0.6, mats.toys[Math.floor(z * 3 + y * 5) % 5]);
  }
  c.sphere(94, 0.6, 62, 0.6, mats.plush);
  c.sphere(94, 1.35, 62, 0.4, mats.plush);
  for (const dx of [-0.25, 0.25]) c.sphere(94 + dx, 1.7, 62, 0.13, mats.plush);
  meta.mannequins.push({ obj: mannequin(c, 93.5, 0, 70, Math.PI, false, 40), home: [93.5, 70], floorY: 0, zone: 'T' });
  recorder(c, 89.6, 2.2, 66, 1.3, 'r5', 5);
  lamp(c, meta.lamps, 88, 5, 62, 1.2, 0.6, { intensity: 1.3, distance: 9 });
  lamp(c, meta.lamps, 88, 5, 72, 1.2, 0.6, { intensity: 1.3, distance: 9, flicker: true });
}

function office(c, meta, mats) {
  const M = c.M, Y = 5.5, H = 9;
  // a room on the gallery, glass looking down at the fountain
  c.box(54, 66, Y, H, 24, 24.2, M.ofWall, true);
  c.box(53.9, 54.1, Y, H, 24, 27, M.ofWall, true);
  c.box(53.9, 54.1, Y, H, 28.4, 31.4, M.ofWall, true);
  c.box(53.9, 54.1, Y + 2.2, H, 27, 28.4, M.ofWall);
  c.box(65.9, 66.1, Y, H, 24, 31.4, M.ofWall, true);
  c.box(54, 66, Y, Y + 1.0, 31.3, 31.5, M.ofWall, true);
  c.box(54, 66, Y + 2.4, H, 31.3, 31.5, M.ofWall, true);
  c.box(54, 66, Y + 1.0, Y + 2.4, 31.38, 31.42, M.glass, true);
  c.box(54, 66, H, H + 0.1, 24, 31.5, M.ofCeiling);
  c.box(54.1, 65.9, Y, Y + 0.02, 24, 31.3, M.ofCarpet);
  c.zone(54, 66, 24, 31.4, 'o');
  // the door, and the reader beside it
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.18, 1.4), M.deskMetal);
  door.position.set(54, Y + 1.1, 27.7);
  c.mesh(door);
  meta.officeDoor = { mesh: door, block: c.collide(53.85, 54.15, 27, 28.4, Y, Y + 2.2), open: 0 };
  c.box(53.82, 53.9, Y + 1.0, Y + 1.4, 26.3, 26.6, M.plastic);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), M.ledRed);
  led.position.set(53.81, Y + 1.32, 26.45);
  led.rotation.y = -Math.PI / 2;
  c.mesh(led);
  meta.readerLed = led;
  meta.reader = c.item('reader', 53.5, Y + 1.2, 26.45, { prompt: '[E] use the reader', reach: 2.0, cos: 0.5 });
  // desk, monitors full of empty halls, lockers, the lever
  c.box(56, 62, Y + 0.74, Y + 0.78, 24.4, 25.6, M.desk, true);
  for (let i = 0; i < 4; i++) {
    c.box(56.4 + i * 1.4, 57.6 + i * 1.4, Y + 0.78, Y + 1.7, 24.3, 24.7, M.beige);
    c.plane(57 + i * 1.4, Y + 1.25, 24.71, 1.0, 0.7, 's', c.tvStatic, 0.005);
  }
  c.box(59.2, 59.8, Y, Y + 0.45, 26.4, 27, M.fabric, true);
  for (let z = 25; z <= 30; z += 0.7) c.box(65.3, 65.9, Y, Y + 1.9, z, z + 0.65, M.deskMetal, true);
  c.cyl(61.5, 25.2, 0.03, 0.03, Y + 0.78, Y + 1.1, M.metal, 6);
  recorder(c, 60.6, Y + 0.78, 25.3, 0.4, 'r7', 7);
  // the lever for the garage gate
  c.box(55.0, 56.2, Y + 0.9, Y + 2.0, 31.18, 31.3, M.deskMetal);
  c.plane(55.6, Y + 2.25, 31.17, 1.2, 0.25, 'n', c.sign('GARAGE GATE', '#e8e4d8'), 0.01);
  const lever = new THREE.Group();
  lever.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(0, 0.25, 0), mats.toys[0]));
  lever.position.set(55.6, Y + 1.2, 31.1);
  lever.rotation.x = -0.6;
  c.mesh(lever);
  meta.lever = lever;
  meta.leverItem = c.item('lever', 55.6, Y + 1.4, 30.9, { prompt: '[E] pull the lever', reach: 2.0, cos: 0.5 });
  lamp(c, meta.lamps, 60, H, 28, 1.2, 0.6, { intensity: 2.2, distance: 9 });
}

function garage(c, meta, mats) {
  const M = c.M;
  // the ramp down, and the gate across it
  c.floorAt(56, 64, 80, 92, -4);
  c.ramp(56, 64, 80, 92, 0, -4, 'z');
  c.quad([56, 0, 80], [56, -4, 92], [64, -4, 92], [64, 0, 80], M.concrete);
  const gate = new THREE.Group();
  gate.add(new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.08).translate(0, 1.5, 0), mats.gate));
  for (let y = 0.2; y < 3; y += 0.25) gate.add(new THREE.Mesh(new THREE.BoxGeometry(8, 0.03, 0.12).translate(0, y, 0), M.metal));
  gate.position.set(60, 0, 80.8);
  c.mesh(gate);
  meta.gate = { obj: gate, block: c.collide(56, 64, 80.6, 81.0, -1, 3.2), open: 0 };
  // pillars, painted lines, cars left overnight
  for (let x = 36; x <= 92; x += 8) for (const z of [100, 116]) c.box(x - 0.4, x + 0.4, -4, -0.5, z - 0.4, z + 0.4, M.concrete, true);
  for (let x = 34; x <= 94; x += 3) for (const [z1, z2] of [[93, 98], [118, 123]]) c.box(x - 0.05, x + 0.05, -3.99, -3.98, z1, z2, mats.paint);
  const cars = [[37.5, 95.5, mats.red], [46.5, 95.5, mats.white], [55.5, 120.5, mats.blue], [70.5, 95.5, mats.green], [82.5, 120.5, mats.white], [40.5, 120.5, mats.blue]];
  for (const [x, z, m] of cars) car(c, x, z, 0, m);
  meta.alarmCar = new THREE.Vector3(70.5, -3, 95.5);
  meta.headlights = [c.light(70.5, -3.2, 93, { color: 0xfff0c0, intensity: 0, distance: 10, on: true }), c.light(70.5, -3.2, 98, { color: 0xff3020, intensity: 0, distance: 6, on: true })];
  for (let x = 36; x <= 92; x += 8) for (const z of [104, 112]) lamp(c, meta.garageLamps, x, -0.5, z, 1.0, 0.3, { color: 0xffa050, intensity: 2.0, distance: 11, dead: (x / 8 + z) % 4 === 1, flicker: x === 60 && z === 112 });
  c.plane(95.94, -2.2, 116, 1.2, 0.35, 'w', c.sign('EXIT  >', '#8aff9a'), 0.02);
  // the way out: up into the rain
  c.floorAt(96, 112, 112, 120, -4);
  c.ramp(96, 112, 112, 120, -4, 0, 'x');
  c.quad([96, -4, 112], [96, -4, 120], [112, 0, 120], [112, 0, 112], M.concrete);
  c.box(113.2, 115.6, 0, 2.4, 108.4, 110.6, M.mlShutter, true);
  c.box(113.3, 115.5, 1.2, 2.0, 110.6, 110.64, M.mlGlass);
  c.box(112.55, 112.7, 0, 1.0, 119.4, 119.7, M.metal, true);
  c.box(112.58, 112.68, 1.0, 4.6, 119.5, 119.6, mats.toys[0]);
  recorder(c, 93.6, -4, 118.4, 0.3, 'r8', 8);
  meta.mannequins.push({ obj: mannequin(c, 92, -4, 122, -Math.PI / 2, false, 77), home: [92, 122], floorY: -4, zone: 'G' });
  // rain, falling past a streetlight
  const rain = new THREE.Group();
  for (let i = 0; i < 260; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.8), mats.rain);
    m.position.set(112 + Math.random() * 16, Math.random() * 10, 108 + Math.random() * 16);
    m.rotation.y = Math.random() * Math.PI;
    rain.add(m);
  }
  c.mesh(rain);
  meta.rain = rain;
  c.box(122, 122.15, 0, 5, 114, 114.15, M.dreamMetal, true);
  c.box(121.2, 122.15, 5, 5.12, 113.9, 114.25, M.dreamMetal);
  c.box(121.25, 121.75, 4.9, 5.0, 113.95, 114.2, M.tapeGlow);
  c.light(121.5, 4.4, 114.2, { color: 0xffc078, intensity: 4, distance: 16 });
  c.decal(118, 116, 2.5, 0x101418, 0.5);
  meta.rainPos = new THREE.Vector3(118, 1, 116);
}

// ---------- what happens ----------
class ClosingTime extends TapeDirector {
  constructor(o) {
    super(o);
    const { world } = this;
    const meta = this.meta = world.meta;
    this.calm = 0.12;
    this.hasCard = false;
    this.gateOpen = false;
    this.cooldown = 0;
    this.say('11:47 PM', 4);
    this.setObjective('the mall is closed. find a way out');
    for (const it of world.items()) {
      if (it.type === 'sign') it.use = () => { this.say('"after hours exit: parking garage. gate controlled from security, level 2."', 6); this.setObjective('the garage gate. the security office is upstairs'); };
      if (it.type === 'reader') it.use = () => this.swipe();
      if (it.type === 'keycard') { it.use = () => this.takeCard(); it.ready = () => !this.hasCard; }
      if (it.type === 'lever') { it.use = () => this.pull(); it.ready = () => !this.gateOpen && meta.officeDoor.open > 0.5; }
    }
    this.kitEvents();
    void meta;
  }

  takeCard() {
    this.hasCard = true;
    this.meta.keycard.done = true;
    this.meta.keyed.badge.visible = false;
    this.play('pickup', this.meta.keycard.pos, { gain: 1 });
    this.say('the guard\'s keycard', 3);
    this.setObjective('the security office, upstairs');
    // something heard that
    this.kit.after(5, () => this.wakeListener());
  }

  swipe() {
    const { meta } = this;
    if (!this.hasCard) {
      this.play('dead_buttons', meta.reader.pos, { gain: 1 });
      this.say('it wants a keycard', 3);
      if (!this.hasCard) this.setObjective('find the guard\'s keycard');
      return;
    }
    meta.reader.done = true;
    meta.readerLed.material = this.world.M.ledGreen;
    meta.officeDoor.target = 1;
    meta.officeDoor.block.off = true;
    this.play('keycard_beep', meta.reader.pos, { gain: 1.2 });
    this.setObjective('the gate lever');
  }

  pull() {
    const { meta } = this;
    this.gateOpen = true;
    meta.leverItem.done = true;
    meta.lever.rotation.x = 0.6;
    this.play('lever_clunk', meta.leverItem.pos, { gain: 1.3 });
    this.kit.after(1.2, () => this.play('shutter_open', { x: 60, y: 1, z: 81 }, { gain: 1.6, ref: 8, send: 0.8 }));
    this.kit.after(4, () => this.pa('t4_pa3', '"the mall is now closed. you are not allowed to leave."'));
    this.setObjective('the parking garage. the ramp out');
  }

  pa(name, text) {
    this.play(name, null, { gain: 1.2, send: 0.95 });
    this.say(text, 5);
  }

  wakeListener() {
    if (this.monster) return;
    const p = this.player.pos;
    const spots = [[60, 44], [24, 44], [96, 44], [60, 14], [60, 72], [24, 68]].map(([x, z]) => [x, z, Math.hypot(x - p.x, z - p.z)]).filter((s) => s[2] > 24).sort((a, b) => b[2] - a[2]);
    if (!spots.length) return;
    const [x, z] = spots[Math.floor(Math.random() * Math.min(2, spots.length))];
    const m = this.spawn('listener', x, z);
    m.pause = 1;
    this.play('hiss', m.pos, { gain: 1.2 });
  }

  // it only hears and reaches you on its own floor
  noise(level, pos) {
    if (this.monster && Math.abs(pos.y - this.monster.pos.y) > 2) return;
    super.noise(level, pos);
    if (this.monster?.target) this.monster.target.y = this.monster.pos.y;
  }

  listener(dt, m, dist) {
    if (Math.abs(this.player.pos.y - m.pos.y) > 2) dist = 99;
    if (m.target) m.target.y = m.pos.y;
    return super.listener(dt, m, dist);
  }

  kitEvents() {
    const { meta, kit, world } = this;
    this.muzak = this.loopAt('muzak', null, { gain: 0.3, send: 0.9 });
    this.loopAt('fountain', meta.fountain, { gain: 1, ref: 3 });
    this.loopAt('soda_loop', meta.soda, { gain: 0.7, ref: 2 });
    this.carouselSound = this.loopAt('carousel_music', meta.carousel.obj.position, { gain: 0, ref: 4 });
    this.loopAt('rain_loop', meta.rainPos, { gain: 1.2, ref: 6 });
    kit.after(30, () => this.pa('t4_pa1', '"attention shoppers. the mall is now closed. please make your way to the nearest exit."'));
    kit.after(150, () => this.pa('t4_pa2', '"security to the atrium, please. security to the atrium."'));

    // the arcade wakes up when you walk in
    kit.trigger((d) => d.zone() === 'R', () => {
      meta.screens.forEach((s, i) => this.kit.after(0.15 * i, () => { s.mesh.material = s.mat; }));
      this.play('arcade_attract', meta.arcade, { gain: 1.2, ref: 4 });
    }, { delay: 1.5 });

    // a tray slides off a table while you're looking elsewhere
    kit.trigger((d) => d.zone() === 'F' && meta.trays.some((t) => !this.kit.seen(t)), () => {
      const t = meta.trays.find((tr) => !this.kit.seen(tr));
      t.position.y = 0.02;
      t.position.x += 0.6;
      t.rotation.z = 0.15;
      this.play('tray_clatter', t.position, { gain: 1.2 });
    }, { delay: 2 });

    // a cart rolls across the west hall
    const cart = meta.cart;
    cart.position.set(12, 0, 38);
    const roll = kit.roller(cart, [[12, 0, 38], [13, 0, 44], [15, 0, 50]], { speed: 0.9, sound: 'cart_roll', gain: 1.1, face: true });
    kit.trigger((d) => d.zone() === 'W' && d.player.pos.x > 26 && !d.onScreen(cart.position), () => roll.start());

    // the photo booth takes your picture
    kit.trigger((d) => d.near(meta.booth.x, meta.booth.z, 3.5), () => {
      this.play('photo_flash', meta.booth, { gain: 1.3 });
      meta.boothFlash.intensity = 30;
      this.fx.glitch = Math.max(this.fx.glitch, 0.5);
      this.kit.after(0.15, () => { meta.boothFlash.intensity = 0; });
    });

    // the escalator starts by itself the first time you're upstairs
    kit.trigger((d) => d.player.pos.y > 4, () => { this.loopAt('escalator_hum', meta.escalator, { gain: 1, ref: 3 }); });

    // the garage: a car alarm, and its lights
    kit.trigger((d) => d.zone() === 'G', () => {
      this.alarm = this.play('car_alarm', meta.alarmCar, { gain: 1.4, ref: 5 });
      this.alarmT = 5;
    }, { delay: 5 });
  }

  script(dt) {
    const { meta, world, player } = this;
    const zone = this.zone();
    this.calm = { A: 0.12, D: 0.2, R: 0.16, F: 0.14, G: 0.24, p: 0.2, x: 0.18, O: 0.05, o: 0.08 }[zone] ?? 0.14;
    const t = this.t;

    // the music drifts slower the longer you stay
    this.audio.ramp(this.muzak.src.playbackRate, 1 - Math.min(0.18, t / 900) + Math.sin(t * 0.3) * 0.015, 1);

    // the carousel turns while you aren't looking at it
    const car = meta.carousel;
    const seen = this.kit.seen(car.obj, 40);
    car.speed += ((seen ? 0 : 0.7) - car.speed) * (1 - Math.exp(-dt * (seen ? 2 : 0.5)));
    car.obj.rotation.y += car.speed * dt;
    this.audio.ramp(this.carouselSound.gain.gain, car.speed * 1.2, 0.3);

    // the mannequins come a little nearer every time you look away
    for (const mq of meta.mannequins) {
      const o = mq.obj;
      const dist = Math.hypot(o.position.x - player.pos.x, o.position.z - player.pos.z);
      if (dist > 22 || Math.abs(player.pos.y - mq.floorY) > 2) { mq.hidden = 0; continue; }
      if (this.kit.seen(o, 30)) { mq.hidden = 0; continue; }
      mq.hidden = (mq.hidden ?? 0) + dt;
      if (mq.hidden < (mq.wait ??= 2 + Math.random() * 3) || dist < 2.4) continue;
      mq.hidden = 0;
      mq.wait = 2 + Math.random() * 3;
      const step = Math.min(1.3, dist - 2.2);
      const x = o.position.x + (player.pos.x - o.position.x) / dist * step, z = o.position.z + (player.pos.z - o.position.z) / dist * step;
      if (this.blocked(x, z, 0.35) || world.zoneAt(x, z) !== mq.zone) continue;
      o.position.x = x;
      o.position.z = z;
      o.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
      if (Math.random() < 0.4) this.play('chair_creak', o.position, { gain: 0.5, rate: 0.7 });
    }
    // the keycard goes wherever its mannequin goes
    if (!this.hasCard) meta.keyed.badge.getWorldPosition(meta.keycard.pos);

    // the office door slides
    const od = meta.officeDoor;
    od.open += ((od.target ?? 0) - od.open) * (1 - Math.exp(-dt * 3));
    od.mesh.position.z = 27.7 - od.open * 1.35;
    // the garage gate rises
    const gate = meta.gate;
    if (this.gateOpen && gate.open < 1) {
      gate.open = Math.min(1, gate.open + dt * 0.3);
      gate.obj.position.y = gate.open * 3;
      gate.block.off = gate.open > 0.7;
    }
    // the car alarm's lights
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      const on = Math.sin(t * 14) > 0 && this.alarmT > 0;
      for (const l of meta.headlights) l.intensity = on ? 4 : 0;
    }
    // rain
    for (const d of meta.rain.children) { d.position.y -= dt * 9; if (d.position.y < 0) d.position.y += 10; }

    // the Listener comes back after a while
    if (this.hasCard && !this.monster && !this.leaving) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && player.pos.y < 2 && player.pos.y > -1) { this.cooldown = 30; this.wakeListener(); }
    }

    // out into the rain: the tape ends
    if (zone === 'O' && player.pos.x > 116 && this.leaving === undefined) {
      this.leaving = 0;
      this.holdFade = true;
      this.setObjective(null);
      if (this.monster) this.despawn();
      this.pa('t4_pa4', '"thank you for shopping with us. please drive safely."');
    }
    if (this.leaving !== undefined) {
      this.leaving += dt;
      if (this.leaving > 3) this.fx.fade = Math.min(1, (this.leaving - 3) / 3);
      if (this.leaving > 6.5) this.finished = true;
    }
  }

  rewound() { this.cooldown = 25; }
}

export const TAPE4 = {
  id: 't4',
  number: '04',
  title: 'CLOSING TIME',
  blurb: 'a mall after hours. the doors are chained. walk softly.',
  sounds: SOUNDS,
  level: { id: 't4', zones: ZONES, spawn: { pos: [58, 0, 53.6], yaw: 0.25, zone: 'A' }, build },
  Director: ClosingTime,
};
