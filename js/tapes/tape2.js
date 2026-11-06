import * as THREE from 'three';
import { Grid } from './grid.js';
import { TapeDirector } from './base.js';
import { canvasTex, clockTexture } from './materials.js';

// TAPE 02: DEEP END
// A children's swim lesson that never ended. The deep end keeps getting deeper;
// three valves drain it, and the only way out is the door at the bottom.

const POOL = { fog: [0xd2dcd8, 0.008], hemi: 0.16, ambient: 0.95, bloom: [0.22, 0.97], reverb: [0.6, 0.05] };
const ROOM = { fog: [0xccd6d2, 0.014], hemi: 0.16, ambient: 0.8, bloom: [0.25, 0.96], reverb: [0.2, 0.3] };
const ZONES = {
  r: { ...ROOM, name: 'lockers', floor: 'tile', ambience: ['fluorescent_hum', 0.2] },
  s: { ...ROOM, name: 'showers', floor: 'tile', reverb: [0.3, 0.4], ambience: ['fluorescent_hum', 0.15] },
  c: { ...ROOM, name: 'corridor', floor: 'tile', ambience: ['poolrooms_ambience', 0.3] },
  o: { ...ROOM, name: 'office', floor: 'tile', reverb: [0.05, 0.3], ambience: ['fluorescent_hum', 0.2] },
  L: { ...POOL, name: 'lap hall', floor: 'tile', ambience: ['poolrooms_ambience', 0.6] },
  k: { name: 'kiddie pool', floor: 'tile', fog: [0xd8c8d8, 0.015], hemi: 0.45, ambient: 0.7, bloom: [0.3, 0.92], reverb: [0.4, 0.1], ambience: ['poolrooms_ambience', 0.35] },
  t: { name: 'tube', floor: 'tile', fog: [0x2f5a78, 0.035], hemi: 0.12, ambient: 0.25, env: 0.5, reverb: [0.1, 0.55], ambience: ['pool_ambience', 0.3] },
  D: { ...POOL, name: 'deep end', floor: 'tile', ambience: ['pool_ambience', 0.6] },
  u: { name: 'flooded tunnel', floor: 'tile', fog: [0x0a2a30, 0.06], hemi: 0.03, ambient: 0.05, env: 0.1, reverb: [0.1, 0.5], ambience: ['underwater_presence', 0.6] },
  v: { name: 'valve room', floor: 'tile', fog: [0x0d1a1a, 0.05], hemi: 0.05, ambient: 0.1, env: 0.2, reverb: [0.1, 0.45], ambience: ['dark_ambience', 0.35] },
  f: { name: 'filter room', floor: 'concrete', fog: [0x141614, 0.04], hemi: 0.08, ambient: 0.15, env: 0.3, reverb: [0.2, 0.45], ambience: ['pump_hum', 0.7] },
  x: { name: 'way out', floor: 'tile', fog: [0x101818, 0.05], hemi: 0.05, ambient: 0.1, env: 0.3, reverb: [0.2, 0.5], ambience: ['dark_ambience', 0.3] },
  X: { name: 'outside', floor: 'tile', fog: [0xf4f2ec, 0.03], hemi: 1.2, ambient: 2.2, bloom: [0.6, 0.7], reverb: [0, 0.05], ambience: ['meadow_wind', 0.45] },
};

const SOUNDS = [
  'poolrooms_ambience', 'dark_ambience', 'meadow_wind', 'whistle', 'valve_turn', 'pipe_groan', 'drain_loop', 'locker_slam', 'locker_creak',
  'shower_loop', 'slide_whoosh', 'pump_hum', 'splash_small', 'wet_feet', 'ball_bump', 'kids_laugh',
  't2_memo1', 't2_memo2', 't2_memo3', 't2_memo4', 't2_memo5', 't2_memo6', 't2_memo7', 't2_memo8', 't2_pa1', 't2_pa2', 't2_pa3',
];

const MEMOS = [
  'monday. first lesson of the summer. twelve kids signed up. the water\'s warmer than it should be. the heater\'s been off for weeks.',
  'i blew the whistle for the end of class and nobody got out. they just kept swimming laps. smiling. i don\'t think they could hear me.',
  'one of the little ones asked why the deep end keeps getting deeper. i measured it after. five meters. it was two and a half last week.',
  'the lifeguard quit today. he said something was sitting in his chair when he came in. he said it waved at him.',
  'the slides go somewhere different every day. i followed one. it went down for a long time. when i came out, the tiles were a different color.',
  'there\'s a whole floor under the water. i found a valve room down here. three drain valves. if i empty the deep end, maybe they\'ll finally get out.',
  'someone is in the water with us. long arms. it only moves when nobody\'s looking at it. i keep counting the kids. there\'s always one more.',
  'you drained it. good. don\'t stop now. the door at the bottom goes up, i think. and whatever you hear behind you, don\'t look back at the water.',
];

// ---------- painted things ----------
const lockerTexture = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#6f8fa6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
  for (let i = 0; i < 6; i++) g.fillRect(30, 24 + i * 9, w - 60, 3);
  g.fillStyle = '#c8ccd0';
  g.fillRect(w - 26, h * 0.48, 8, 22);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(6, 0, 10, h);
}, { repeat: false });

const ballTexture = () => canvasTex(256, 128, (g, w, h) => {
  const cols = ['#f25a5a', '#ffffff', '#4f8ff2', '#ffffff', '#f2d23a', '#ffffff'];
  cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 6, 0, w / 6 + 1, h); });
}, { repeat: false });

// ---------- props ----------
function recorder(c, x, y, z, rot, key, n) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.13), c.M.plastic));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), c.M.ledRed);
  led.position.set(0.02, 0.014, 0.045);
  g.add(led);
  g.position.set(x, y + 0.011, z);
  g.rotation.y = rot;
  c.mesh(g);
  return c.item('recording', x, y + 0.03, z, { key, mesh: g, led, voice: `t2_memo${n}`, text: MEMOS[n - 1], seconds: 11, reach: 2.2, cos: 0.75 });
}

// a valve wheel on a pipe, facing out along `yaw`
function valve(c, x, y, z, yaw, n) {
  const M = c.M;
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 24), c.level.mats.red));
  for (const r of [0, Math.PI / 2]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.03), c.level.mats.red);
    spoke.rotation.z = r;
    wheel.add(spoke);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10).rotateX(Math.PI / 2), M.metal));
  wheel.position.z = 0.22;
  g.add(wheel);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10).rotateX(Math.PI / 2).translate(0, 0, 0.11), M.deskMetal));
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  c.mesh(g);
  const front = new THREE.Vector3(Math.sin(yaw) * 0.3, 0, Math.cos(yaw) * 0.3);
  return c.item('valve', x + front.x, y, z + front.z, { key: `v${n}`, wheel, prompt: '[E] turn the valve', reach: 2.2, cos: 0.6 });
}

function lamp(c, list, x, y, z, w, d, o = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), o.mat ?? c.M.panel);
  mesh.position.set(x, y - 0.015, z);
  c.mesh(mesh);
  const anchor = c.light(x, y - 0.5, z, { color: o.color ?? 0xf2fbff, intensity: o.intensity ?? 3, distance: o.distance ?? 12, flicker: o.flicker, on: o.on ?? true });
  const l = { mesh, anchor, x, z, on: o.on ?? true };
  if (!l.on) mesh.material = c.M.panelDead;
  list?.push(l);
  return l;
}

function setLamp(M, l, on) {
  l.anchor.on = on;
  l.mesh.material = on ? (l.onMat ?? M.panel) : M.panelDead;
}

// a little light set into a pool wall, under the water
function poolLight(c, list, x, y, z, facing) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), c.level.mats.poolLight);
  mesh.position.set(x, y, z);
  mesh.rotation.y = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[facing];
  c.mesh(mesh);
  const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[facing];
  const anchor = c.light(x + n[0] * 0.6, y, z + n[1] * 0.6, { color: 0x8fe0ff, intensity: 1.6, distance: 6 });
  const l = { mesh, anchor, x, z, onMat: c.level.mats.poolLight };
  list.push(l);
  return l;
}

// stairs: a ramp to walk on, steps to look at, and a solid block under them
function stairs(c, x1, x2, z1, z2, y0, y1, mat) {
  const n = Math.max(2, Math.round(Math.abs(y1 - y0) / 0.2));
  const len = z2 - z1, bottom = Math.min(y0, y1), up = y1 > y0;
  c.ramp(x1, x2, z1, z2, y0, y1, 'z');
  for (let i = 0; i < n; i++) {
    const za = z1 + len * i / n, zb = z1 + len * (i + 1) / n;
    const top = y0 + (y1 - y0) * (up ? i + 1 : i) / n;
    c.box(x1, x2, bottom, top, za, zb, mat);
    // solid from the side, so nobody walks into the steps from below
    if (top - bottom > 0.7) c.collide(x1, x2, za, zb, bottom, top - 0.35);
  }
}

// ---------- the floor plan ----------
function build(c, L) {
  const M = c.M;
  const mats = L.mats = {
    locker: new THREE.MeshStandardMaterial({ map: lockerTexture(), roughness: 0.5, metalness: 0 }),
    kidTile: Object.assign(M.plFloor.clone(), { color: new THREE.Color(0xf4d8e0), envFrom: M.plFloor }),
    tubeTile: Object.assign(M.plTile.clone(), { color: new THREE.Color(0x7fb2d8), envFrom: M.plTile }),
    showerTile: Object.assign(M.plTile.clone(), { color: new THREE.Color(0xd4e2de), envFrom: M.plTile }),
    red: new THREE.MeshStandardMaterial({ color: 0xc23a32, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 }),
    duck: new THREE.MeshStandardMaterial({ color: 0xf2d23a, roughness: 0.4 }),
    ball: new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35 }),
    poolLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.7, 2.3) }),
    clock: new THREE.MeshBasicMaterial({ map: clockTexture(6, 0), color: 0xcfcac0 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.35) }),
    grate: new THREE.MeshStandardMaterial({ color: 0x5a6266, roughness: 0.4, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2d4a5a, roughness: 0.95 }),
    water: Object.assign(M.water.clone(), { color: new THREE.Color(0x2fb4c6), opacity: 0.72, envMapIntensity: 0.8, envFrom: M.water }),
  };
  const meta = L.meta = { lamps: [], poolLights: [], deepLights: [], exitLamps: [], valves: [] };

  const g = new Grid(54, 50, 2);
  g.fill(2, 2, 10, 9, 'r').door(11, 5);
  g.fill(2, 11, 10, 15, 's').door(6, 10);
  g.fill(2, 17, 10, 30, 'k').door(6, 16).fill(6, 31, 7, 33, 'k');
  g.fill(4, 21, 8, 27, 'q');
  g.fill(12, 2, 13, 27, 'c').door(11, 24).door(14, 8).door(14, 9);
  g.fill(15, 2, 34, 24, 'L');
  g.fill(18, 6, 24, 15, 'h').fill(25, 6, 28, 15, 'j').fill(29, 6, 34, 15, 'p');
  g.fill(37, 2, 42, 7, 'o').door(35, 3).door(36, 3);
  g.fill(35, 10, 47, 11, 'u');
  g.fill(48, 7, 51, 14, 'v');
  g.fill(37, 15, 44, 22, 'f').door(35, 19).door(36, 19);
  g.door(20, 25).door(21, 25).fill(20, 26, 21, 28, 't').fill(22, 27, 28, 28, 't').fill(27, 29, 28, 33, 't');
  g.fill(2, 34, 29, 47, 'D');
  g.fill(14, 36, 29, 45, 'P');
  g.fill(30, 40, 40, 41, 'x').fill(41, 37, 46, 44, 'X');
  meta.grid = g;
  g.build(c, {
    r: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: 3, zone: 'r' },
    s: { floor: M.plFloor, ceil: M.plTile, wall: mats.showerTile, height: 3, zone: 's' },
    k: { floor: mats.kidTile, ceil: M.plTile, wall: M.cloudWall, height: 5, zone: 'k', doorH: 2.6 },
    q: { floor: M.plPool, ceil: M.plTile, wall: M.plPool, upper: M.cloudWall, height: 5, floorY: -0.4, zone: 'k' },
    c: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: 3.2, zone: 'c' },
    o: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: 3, zone: 'o' },
    L: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: 7, zone: 'L', doorH: 2.8 },
    h: { floor: M.plPool, ceil: M.plTile, wall: M.plPool, upper: M.plTile, height: 7, floorY: -1.2, zone: 'L' },
    j: { floor: null, ceil: M.plTile, wall: M.plPool, upper: M.plTile, height: 7, floorY: -3.4, zone: 'L' },
    p: { floor: M.plPool, ceil: M.plTile, wall: M.plPool, upper: M.plTile, height: 7, floorY: -3.4, zone: 'L' },
    u: { floor: M.plPool, ceil: M.plTile, wall: M.plPool, height: 0.4, floorY: -3.4, zone: 'u' },
    v: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: 1.2, floorY: -1.6, zone: 'v' },
    f: { floor: M.concrete, ceil: M.concrete, wall: M.concrete, height: 3, zone: 'f' },
    t: { floor: mats.tubeTile, ceil: mats.tubeTile, wall: mats.tubeTile, height: 2.6, zone: 't' },
    D: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: 10, zone: 'D', doorH: 2.8 },
    P: { floor: M.plPool, ceil: M.plTile, wall: M.plPool, upper: M.plTile, height: 10, floorY: -5, zone: 'D' },
    x: { floor: M.plFloor, ceil: M.plTile, wall: M.plTile, height: -2.4, floorY: -5, zone: 'x' },
    X: { floor: M.dreamWhite, ceil: mats.glow, wall: M.dreamWhite, height: 0, floorY: -5, zone: 'X' },
  });

  lockers(c, meta, mats);
  showers(c, meta, mats);
  kiddie(c, meta, mats);
  corridor(c, meta);
  lapHall(c, meta, mats);
  office(c, meta);
  underworld(c, meta, mats);
  filter(c, meta, mats);
  tube(c, meta, mats);
  deepEnd(c, meta, mats);
}

function lockers(c, meta, mats) {
  const M = c.M;
  for (let x = 4.4; x < 21.4; x += 0.6) {
    if (Math.abs(x - 13.4) < 0.05) continue; // the one that opens
    c.box(x, x + 0.6, 0, 1.9, 4, 4.55, mats.locker);
  }
  c.collide(4, 22, 4, 4.6, 0, 2);
  c.box(4.4, 21.4, 1.9, 2.0, 4, 4.6, M.plTile);
  // the locker that won't stay shut
  c.box(13.4, 14.0, 0, 1.9, 4, 4.03, M.plastic);
  const door = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.86, 0.03), mats.locker);
  leaf.position.set(0.29, 0.95, 0);
  door.add(leaf);
  door.position.set(13.41, 0, 4.57);
  c.mesh(door);
  meta.lockerDoor = door;
  // the island, back to back
  for (let x = 8; x < 18; x += 0.6) for (const z of [15, 15.55]) c.box(x, x + 0.6, 0, 1.9, z, z + 0.55, mats.locker);
  c.collide(8, 18, 15, 16.1, 0, 2);
  // benches
  for (const z of [10.5, 18.6]) {
    c.box(6.5, 19.5, 0.42, 0.48, z - 0.2, z + 0.2, M.lbWood, true);
    for (const x of [7, 13, 19]) c.box(x - 0.04, x + 0.04, 0, 0.42, z - 0.15, z + 0.15, M.deskMetal);
  }
  for (const [x, z, r] of [[9, 7, 0.5], [16, 12, 0.7], [12, 19, 0.4]]) c.decal(x, z, r, 0x6a8a90, 0.22);
  c.plane(21.95, 2.3, 12, 0.42, 0.42, 'w', mats.clock);
  c.box(5, 6.2, 1.2, 1.25, 19.6, 20, M.plastic);
  for (const [x, z] of [[8, 8], [17, 8], [8, 13], [17, 13], [12, 18]]) lamp(c, meta.lamps, x, 3, z, 1.2, 0.6, { intensity: 1.6, distance: 8 });
  recorder(c, 12.5, 0.48, 10.5, 0.6, 'r1', 1);
}

function showers(c, meta, mats) {
  const M = c.M;
  for (let x = 6; x <= 20; x += 2) c.box(x - 0.04, x + 0.04, 0, 2.0, 28.4, 32, mats.showerTile, true);
  meta.showerHeads = [];
  for (let x = 5; x <= 21; x += 2) {
    c.cyl(x, 31.7, 0.05, 0.05, 2.05, 2.4, M.metal, 8);
    c.cyl(x, 31.55, 0.09, 0.06, 2.0, 2.06, M.metal, 10);
    c.decal(x, 30.5, 0.12, 0x222a2a, 0.6);
    meta.showerHeads.push(new THREE.Vector3(x, 2, 31.55));
  }
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 2.0, 10, 1, true), c.level.mats.streamMat ??= new THREE.MeshBasicMaterial({ color: 0xbfe6ee, transparent: true, opacity: 0.25, depthWrite: false }));
  stream.position.set(15, 1.0, 31.55);
  stream.visible = false;
  c.mesh(stream);
  meta.stream = stream;
  c.box(6, 20, 0.38, 0.44, 23.6, 24.1, M.lbWood, true);
  for (const [x, z] of [[8, 26], [16, 26]]) lamp(c, meta.lamps, x, 3, z, 1.2, 0.6, { intensity: 1.4, distance: 8, flicker: x === 16 });
  for (const [x, z, r] of [[10, 29, 1.2], [18, 30, 0.9], [13, 25, 0.6]]) c.decal(x, z, r, 0x5a7a80, 0.25);
}

function kiddie(c, meta, mats) {
  const M = c.M;
  c.water(8, 18, 42, 56, -0.06, -0.4, false, c.level.mats.water);
  // the slide, painted pink, into the shallow water
  c.box(19, 21, 0, 2.6, 43, 45, M.dreamPink, true);
  c.box(19.2, 20.8, 2.6, 3.4, 43.1, 43.3, M.dreamPink);
  c.quad([19.2, 2.6, 45], [20.8, 2.6, 45], [20.8, 0.1, 50.5], [19.2, 0.1, 50.5], M.dreamPink);
  c.quad([17.6, 0.1, 50.5], [19.2, 0.1, 50.5], [19.2, -0.3, 51.5], [17.6, -0.3, 51.5], M.dreamPink);
  for (const s of [19.1, 20.8]) c.quad([s, 2.6, 45], [s, 2.95, 45], [s, 0.45, 50.5], [s, 0.1, 50.5], M.dreamWhite, [s < 20 ? -1 : 1, 0, 0]);
  c.collide(19, 21, 45, 50.5, 0, 1.2);
  // a sun on the wall, and benches for the parents who never came
  c.plane(4.02, 3.2, 48, 2.2, 2.2, 'e', c.level.mats.sunMat ??= new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g2) => {
    g2.clearRect(0, 0, 128, 128); g2.fillStyle = '#ffd98a'; g2.beginPath(); g2.arc(64, 64, 34, 0, 6.283); g2.fill();
    g2.strokeStyle = '#ffd98a'; g2.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g2.beginPath(); g2.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42); g2.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g2.stroke(); }
  }, { repeat: false }), transparent: true }));
  for (const z of [38, 60]) c.box(8, 18, 0.4, 0.46, z - 0.2, z + 0.2, M.lbWood, true);
  const duck = new THREE.Group();
  duck.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8).scale(1.2, 0.8, 1), mats.duck));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mats.duck);
  head.position.set(0, 0.14, 0.1);
  duck.add(head);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.07), mats.red);
  beak.position.set(0, 0.13, 0.2);
  duck.add(beak);
  duck.position.set(12, -0.02, 46);
  c.mesh(duck);
  meta.duck = duck;
  for (let x = 6; x <= 20; x += 5) for (let z = 37; z <= 60; z += 6) lamp(c, meta.lamps, x, 5, z, 1.2, 1.2, { intensity: 2.6, distance: 12, color: 0xfff0e8 });
  recorder(c, 19.4, 0, 53.4, 2.2, 'r3', 3);
}

function corridor(c, meta) {
  const M = c.M;
  for (let z = 7; z <= 55; z += 6) lamp(c, meta.lamps, 26, 3.2, z, 1.2, 0.6, { intensity: 1.8, distance: 9, flicker: z === 37 });
  c.box(24.05, 24.5, 0.4, 0.46, 30, 34, M.lbWood, true);
  for (const [z, r] of [[14, 0.7], [27, 0.5], [44, 0.9]]) c.decal(26, z, r, 0x5a7a80, 0.25);
}

function lapHall(c, meta, mats) {
  const M = c.M;
  meta.lapWater = c.water(36, 70, 12, 32, -0.08, -3.4, true, mats.water);
  c.ramp(50, 58, 12, 32, -1.2, -3.4, 'x');
  c.quad([50, -1.2, 12], [50, -1.2, 32], [58, -3.4, 32], [58, -3.4, 12], M.plPool);
  // lane ropes: red and white floats in lines
  for (let lane = 1; lane < 8; lane++) {
    const z = 12 + lane * 2.5;
    for (let x = 36.2, i = 0; x < 69.8; x += 0.5, i++) c.box(x, x + 0.42, -0.12, -0.04, z - 0.05, z + 0.05, i % 6 < 3 ? mats.red : mats.white);
  }
  // starting blocks along the shallow end
  for (let lane = 0; lane < 8; lane++) {
    const z = 13.25 + lane * 2.5;
    c.box(34.6, 35.6, 0, 0.72, z - 0.3, z + 0.3, M.plTile, true);
    c.box(34.5, 35.7, 0.72, 0.76, z - 0.32, z + 0.32, mats.rubber);
  }
  // the lifeguard's chair
  for (const [dx, dz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) c.box(52 + dx - 0.04, 52 + dx + 0.04, 0, 1.8, 8.6 + dz - 0.04, 8.6 + dz + 0.04, mats.white);
  c.box(51.5, 52.5, 1.8, 1.9, 8.2, 9.0, mats.white, true);
  c.box(51.5, 52.5, 1.9, 2.6, 8.2, 8.26, mats.white);
  meta.chairTop = new THREE.Vector3(52, 1.9, 8.6);
  // the bleachers, five rows nobody sits in
  for (let k = 0; k < 5; k++) {
    const z0 = 37.4 + k * 1.6, h = 0.42 * (k + 1);
    c.box(38, 66, 0, h, z0, 46, k % 2 ? M.plTile : M.plFloor);
    c.platform(38, 66, z0, 46, h, false);
  }
  recorder(c, 50.5, 2.1, 45, 0.3, 'r2', 2);
  // square tile pillars standing in the deep water, joined overhead
  for (const x of [61, 67]) for (const z of [16, 28]) {
    c.box(x - 0.5, x + 0.5, -3.4, 7, z - 0.5, z + 0.5, M.plTile, true);
    c.box(x - 0.55, x + 0.55, -0.12, 0.02, z - 0.55, z + 0.55, M.plPool);
  }
  for (const x of [61, 67]) c.box(x - 0.5, x + 0.5, 5.8, 6.4, 16, 28, M.plTile);
  // round windows high up, full of white light
  for (let x = 36; x <= 66; x += 6) { porthole(c, x, 5.2, 4.04, 's'); porthole(c, x, 5.2, 49.96, 'n'); }
  // a thin sheet of water across part of the deck, as if the pool were slowly spilling over
  c.water(30.2, 36, 6, 40, 0.05, 0, false);
  c.water(36, 70, 32.2, 36.6, 0.05, 0, false);
  // skylights and the light that falls from them
  for (const z of [9, 20, 31, 42]) {
    c.box(32, 68, 6.97, 7, z - 0.45, z + 0.45, M.skyPanel);
    for (let x = 36; x <= 64; x += 9) c.light(x, 6.2, z, { color: 0xfff6ea, intensity: 4, distance: 15 });
  }
  // lights in the pool walls
  for (let x = 40; x <= 68; x += 4) {
    poolLight(c, meta.poolLights, x, x < 50 ? -0.7 : -1.2, 12.03, 's');
    poolLight(c, meta.poolLights, x, x < 50 ? -0.7 : -1.2, 31.97, 'n');
  }
  // the ball that drifts toward you
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), mats.ball);
  ball.position.set(62, 0.12, 26);
  c.mesh(ball);
  meta.ball = ball;
  for (const [x, z, r] of [[40, 8, 0.9], [60, 34, 1.3], [33, 30, 0.7], [66, 6, 0.8]]) c.decal(x, z, r, 0x5a7a80, 0.2);
}

// a round window of light, set into a wall
function porthole(c, x, y, z, facing) {
  c.plane(x, y, z, 1.5, 1.5, facing, c.level.mats.ring ??= new THREE.MeshBasicMaterial({ color: 0xcfd8d6 }), 0.01);
  const geo = new THREE.CircleGeometry(0.62, 28);
  const rot = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing];
  geo.rotateY(rot);
  const n = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[facing];
  geo.translate(x + n[0] * 0.02, y, z + n[1] * 0.02);
  c.add(geo, c.level.mats.glow);
}

function office(c, meta) {
  const M = c.M;
  c.box(76, 80, 0.74, 0.78, 6, 7.2, M.lbWood, true);
  c.box(76.1, 76.5, 0, 0.74, 6.1, 7.1, M.lbWood);
  c.box(79.5, 79.9, 0, 0.74, 6.1, 7.1, M.lbWood);
  c.cyl(77, 6.5, 0.02, 0.02, 0.78, 1.05, M.metal, 6);
  c.sphere(77, 1.08, 6.5, 0.04, M.plastic);
  c.box(78.4, 79.4, 0.78, 1.5, 6.3, 7.0, M.beige);
  c.plane(78.9, 1.15, 7.01, 0.8, 0.55, 's', c.tvStatic);
  c.box(83, 85.6, 0, 0.8, 4.2, 5.4, M.beige, true);
  c.plane(84.3, 1.2, 4.08, 1.2, 0.3, 's', c.sign('LOST & FOUND', '#e8e4d8'), 0.02);
  for (let i = 0; i < 5; i++) c.box(83.2 + i * 0.45, 83.5 + i * 0.45, 0.8, 0.84, 4.5 + (i % 2) * 0.3, 4.8 + (i % 2) * 0.3, i % 2 ? c.level.mats.red : c.level.mats.duck);
  lamp(c, meta.lamps, 80, 3, 10, 1.2, 0.6, { intensity: 1.4, distance: 7 });
  recorder(c, 77.8, 0.78, 6.8, 2.6, 'r4', 4);
}

function underworld(c, meta, mats) {
  const M = c.M;
  // the tunnel under the deep end's wall, all the way under water
  meta.tunnel = c.water(70, 96, 20, 24, -0.45, -3.4, true);
  c.roof(70, 96, 20, 24, 0.4);
  c.collide(69.9, 70.1, 20, 24, 0.35, 9);
  c.ramp(90, 96, 20, 24, -3.4, -1.6, 'x');
  c.quad([90, -3.4, 20], [90, -3.4, 24], [96, -1.6, 24], [96, -1.6, 20], M.plPool);
  for (let x = 74; x <= 90; x += 4) poolLight(c, meta.poolLights, x, -2.6, 20.03, 's');
  // the valve room, with its air
  c.water(96, 104, 14, 30, -1.5, -1.6, false);
  meta.valves.push(valve(c, 103.9, -0.6, 22, -Math.PI / 2, 2));
  c.box(97, 99, -1.6, -0.7, 28.6, 29.6, M.deskMetal, true);
  recorder(c, 98.2, -0.7, 29.1, 0.4, 'r6', 6);
  for (const z of [16, 27]) c.box(96, 104, 0.8, 1.0, z - 0.1, z + 0.1, M.metal);
  c.sphere(100, 1.05, 22, 0.07, M.tapeGlow);
  c.light(100, 0.8, 22, { color: 0x9fffb0, intensity: 1.2, distance: 7, flicker: true });
}

function filter(c, meta, mats) {
  const M = c.M;
  for (const [x, z] of [[78, 34], [84, 34], [78, 41]]) {
    c.cyl(x, z, 1.3, 1.3, 0, 2.4, M.deskMetal, 20, true);
    c.cyl(x, z, 1.35, 1.35, 2.4, 2.5, M.metal, 20);
  }
  c.box(74, 90, 2.5, 2.7, 37.4, 37.7, M.metal);
  c.box(86.6, 86.9, 0, 2.7, 30, 46, M.metal);
  c.box(86.9, 87.4, 0.6, 1.4, 38, 40, M.deskMetal, true);
  meta.valves.push(valve(c, 86.4, 1.25, 44, -Math.PI / 2, 1));
  c.box(86.6, 87.2, 0.9, 1.6, 43.7, 44.3, M.metal);
  c.box(75, 76.4, 0, 0.9, 44.4, 45.6, M.beige, true);
  recorder(c, 75.7, 0.9, 45, 1.1, 'r7', 7);
  for (const x of [77, 85]) for (const z of [33, 43]) { c.sphere(x, 2.85, z, 0.06, M.tapeGlow); c.light(x, 2.6, z, { color: 0xffc078, intensity: 1.3, distance: 7, flicker: x === 85 && z === 43 }); }
  meta.pump = new THREE.Vector3(81, 1.2, 37);
}

function tube(c, meta, mats) {
  const M = c.M;
  // ribs, as if the hall were the inside of a slide
  const rib = (x, z, alongX) => {
    const geo = new THREE.TorusGeometry(1.95, 0.07, 6, 28);
    if (!alongX) geo.rotateY(Math.PI / 2);
    geo.translate(x, 1.2, z);
    c.add(geo, mats.white);
  };
  for (let z = 52.5; z <= 56; z += 1.5) rib(42, z, true);
  for (let x = 45; x <= 54; x += 1.5) rib(x, 56, false);
  for (let z = 59; z <= 66; z += 1.5) rib(56, z, true);
  for (const [x, z, fl] of [[42, 53, false], [44, 56, true], [50, 56, false], [56, 58, false], [56, 63, true]]) {
    c.sphere(x, 2.5, z, 0.09, M.tapeGlow);
    c.light(x, 2.2, z, { color: 0xbfe8ff, intensity: 1.3, distance: 6, flicker: fl });
  }
  for (const [x, z, r] of [[42, 54, 0.8], [52, 56, 1.0], [56, 61, 0.6]]) c.decal(x, z, r, 0x2a4a60, 0.35);
  recorder(c, 49.6, 0, 55.2, 1.8, 'r5', 5);
}

function deepEnd(c, meta, mats) {
  const M = c.M;
  meta.deep = c.water(28, 60, 72, 92, -0.08, -5, true, mats.water, true);
  // a way out of the water in the corner
  c.box(28, 30.4, -1.3, -1.2, 72, 74, M.plPool);
  c.platform(28, 30.4, 72, 74, -1.2, false);
  stairs(c, 28, 30.4, 74, 86, -1.2, -5, M.plPool);
  // the diving tower
  stairs(c, 4.3, 6.3, 70, 82, 0, 5, M.plTile);
  c.box(4, 12, 4.8, 5, 82, 86, M.plTile);
  c.platform(4, 12, 82, 86, 5, true);
  for (const x of [8, 11.6]) c.box(x - 0.2, x + 0.2, 0, 4.8, 85.4, 85.8, M.plTile, true);
  c.box(12, 31, 4.88, 5, 83.5, 84.5, mats.white);
  c.platform(12, 31, 83.5, 84.5, 5, false);
  c.box(11.8, 12.6, 4.2, 4.9, 83.6, 84.4, M.deskMetal);
  for (const [x1, x2, z1, z2] of [[6.3, 12, 81.95, 82.05], [4, 12, 85.95, 86.05], [6.3, 6.4, 70, 82]]) {
    c.box(x1, x2, 5, 6, z1, z2, M.metal);
    c.collide(x1, x2, z1, z2, 4.9, 6);
  }
  for (let z = 70; z < 82; z += 2) c.box(6.3, 6.4, (z - 70) * 5 / 12, (z - 70) * 5 / 12 + 1, z, z + 0.06, M.metal);
  meta.valves.push(valve(c, 9.2, 5.9, 85.9, Math.PI, 3));
  // the second lifeguard chair
  for (const [dx, dz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) c.box(24 + dx - 0.04, 24 + dx + 0.04, 0, 1.8, 94 + dz - 0.04, 94 + dz + 0.04, mats.white);
  c.box(23.5, 24.5, 1.8, 1.9, 93.6, 94.4, mats.white, true);
  c.box(23.5, 24.5, 1.9, 2.6, 94.34, 94.4, mats.white);
  meta.chair2 = new THREE.Vector3(24, 1.9, 94);
  // the drain control: three lamps, all red
  c.box(16, 19, 1.0, 2.2, 68, 68.2, M.deskMetal);
  c.plane(17.5, 2.0, 68.21, 2.4, 0.3, 's', c.sign('DRAIN CONTROL', '#e8e4d8'), 0.01);
  meta.drainLamps = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), M.ledRed);
    m.position.set(16.7 + i * 0.8, 1.5, 68.22);
    c.mesh(m);
    return m;
  });
  meta.panel = c.item('panel', 17.5, 1.5, 68.4, { prompt: '[E] read the panel', reach: 2.4, cos: 0.6 });
  // the door at the bottom, shut while there's water against it
  c.plane(59.94, -2.0, 82, 1.2, 0.3, 'w', c.sign('EXIT', '#ff5a4a'), 0.02);
  const gate = new THREE.Group();
  for (let i = 0; i < 9; i++) gate.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), mats.grate).translateZ(-1.9 + i * 0.475).translateY(1.3));
  gate.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4), mats.grate).translateY(2.55));
  gate.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4), mats.grate).translateY(0.05));
  gate.position.set(59.95, -5, 82);
  c.mesh(gate);
  meta.gate = { obj: gate, block: c.collide(59.8, 60.2, 80, 84, -5.2, -2.4), open: 0 };
  c.collide(59.8, 60.2, 80, 84, -2.4, 10);
  recorder(c, 57.6, -5, 83.2, 1.4, 'r8', 8);
  // pillars standing in the deep water, all the way down
  for (const x of [36, 52]) for (const z of [77, 87]) c.box(x - 0.6, x + 0.6, -5, 10, z - 0.6, z + 0.6, M.plTile, true);
  for (const z of [77, 87]) c.box(36, 52, 8.4, 9.2, z - 0.6, z + 0.6, M.plTile);
  for (let z = 72; z <= 92; z += 5) porthole(c, 4.04, 6.5, z, 'e');
  c.water(4.2, 27.8, 88, 95.8, 0.05, 0, false);
  // the ring that won't stay where you left it
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 10, 20).rotateX(Math.PI / 2), M.dreamPink);
  ring.position.set(44, -0.02, 80);
  c.mesh(ring);
  meta.ring = ring;
  // light: high windows, panels, and lamps in the pool walls
  for (const x of [10, 22, 34, 46, 56]) {
    c.box(x - 2, x + 2, 7.5, 9.5, 68.04, 68.1, M.skyPanel);
    c.box(x - 2, x + 2, 7.5, 9.5, 95.9, 95.96, M.skyPanel);
  }
  for (let x = 10; x <= 54; x += 11) for (const z of [74, 88]) lamp(c, meta.lamps, x, 10, z, 1.6, 1.6, { intensity: 6, distance: 20 });
  for (let x = 32; x <= 58; x += 5) {
    poolLight(c, meta.deepLights, x, -2.5, 72.03, 's');
    poolLight(c, meta.deepLights, x, -2.5, 91.97, 'n');
  }
  // the way out, dark until it's needed
  for (let x = 64; x <= 80; x += 4) lamp(c, meta.exitLamps, x, -2.4, 82, 1.0, 0.5, { intensity: 1.8, distance: 8, on: false });
  for (let x = 84; x <= 92; x += 4) for (const z of [78, 86]) c.light(x, -1, z, { color: 0xffffff, intensity: 6, distance: 14 });
}

// ---------- what happens ----------
class DeepEnd extends TapeDirector {
  constructor(o) {
    super(o);
    this.meta = this.world.meta;
    this.opened = 0;
    this.met = false;
    this.cooldown = 20;
    this.spawnTimer = 5;
    this.calm = 0.08;
    this.say('6:00 PM', 4);
    this.setObjective('the lesson is over. find a way out');
    for (const it of this.world.items()) {
      if (it.type === 'valve') it.use = (v) => this.turn(v);
      if (it.type === 'panel') it.use = () => this.readPanel();
    }
    this.kitEvents();
  }

  readPanel() {
    this.say(this.opened >= 3 ? 'all three are green.' : 'DRAIN CONTROL. three valves: filter room, below the deep end, the tower.', 6);
    if (this.opened < 3) this.setObjective(`open the drain valves ${this.opened}/3`);
  }

  turn(v) {
    v.done = true;
    this.opened++;
    this.play('valve_turn', v.pos, { gain: 1.3 });
    this.kit.after(2.2, () => this.play('pipe_groan', this.player.pos, { gain: 1.1, hrtf: false, send: 0.8 }));
    v.spin = 2.5;
    this.meta.drainLamps[this.opened - 1].material = this.world.M.ledGreen;
    if (this.opened === 1) { this.met = true; this.kit.after(6, () => this.pa('t2_pa2', '"will the last swimmer please exit the pool. the lesson is over."')); }
    if (this.opened < 3) { this.say(`${this.opened} of 3`, 3); this.setObjective(`open the drain valves ${this.opened}/3`); return; }
    this.setObjective('the deep end is draining');
    this.kit.after(3, () => this.drain());
  }

  pa(name, text) {
    this.play(name, null, { gain: 1.25, send: 0.95, radio: true });
    this.say(text, 6);
  }

  drain() {
    const { meta } = this;
    this.draining = true;
    this.drainSound = this.loopAt('drain_loop', { x: 44, y: -2, z: 82 }, { gain: 1.6, ref: 6, hrtf: false });
    if (this.monster?.kind === 'swimmer') this.despawn();
    for (const l of meta.deepLights) setLamp(this.world.M, l, true);
  }

  kitEvents() {
    const { meta, kit, world } = this;
    const M = world.M;
    kit.after(25, () => this.pa('t2_pa1', '"attention swimmers. the pool will be closing at six o\'clock. please exit the water."'));

    // a locker opens while you aren't looking, and slams when you turn away from it
    const door = meta.lockerDoor;
    kit.unseen(door, [{ r: 0 }, { r: -1.7 }, { r: 0 }], { wait: 2.5, minDist: 3, onMove: (i) => this.play(i === 1 ? 'locker_creak' : 'locker_slam', door.position, { gain: i === 1 ? 0.9 : 1.4 }), active: () => this.t > 12 });

    // a shower runs by itself, and stops when you come to it
    kit.trigger((d) => d.zone() === 's' && d.t > 20 && !d.onScreen(meta.showerHeads[5]), () => {
      meta.stream.visible = true;
      this.shower = this.loopAt('shower_loop', meta.showerHeads[5], { gain: 1, ref: 2, hrtf: true });
    });
    kit.trigger((d) => this.shower && d.near(15, 31, 2.4), () => {
      this.shower.src.stop();
      meta.stream.visible = false;
      this.play('drip', meta.showerHeads[5], { gain: 0.8 });
    });

    // in the kiddie pool, laughter, and a splash at the bottom of the slide
    kit.trigger((d) => d.zone() === 'k', () => this.play('kids_laugh', { x: 12, y: 1, z: 50 }, { gain: 1.1, send: 0.8, ref: 4 }));
    kit.trigger((d) => d.zone() === 'k' && d.found.has('t2:recording:r3') && !d.onScreen(new THREE.Vector3(18.4, 0, 51)), () => {
      this.play('slide_whoosh', { x: 20, y: 1.5, z: 47 }, { gain: 1.2 });
      this.kit.after(2.2, () => this.play('splash_small', { x: 17.5, y: 0, z: 51.5 }, { gain: 1.3 }));
    }, { delay: 1 });
    kit.unseen(meta.duck, [[12, 46], [16, 52], [10, 54], [15, 44], [9, 48]].map(([x, z]) => ({ p: [x, -0.02, z], r: Math.random() * 6 })), { wait: 3, minDist: 2.5, loop: true });

    // the lifeguard is in the chair, once, until you look away
    kit.trigger((d) => d.zone() === 'L' && d.t > 14 && !d.monster && !d.onScreen(meta.chairTop) && !d.near(52, 8.6, 12), () => {
      const m = this.spawn('occupant', 52, 8.6);
      m.kind = 'watcher';
      m.pos.y = 1.9;
      m.close = 9;
      m.linger = 0.8;
      m.onGone = () => this.play('whistle', meta.chairTop, { gain: 1.2, send: 0.8, ref: 4 });
    });
    // and again at the deep end, after the second valve
    kit.trigger((d) => d.opened >= 2 && d.zone() === 'D' && !d.monster && !d.onScreen(meta.chair2) && !d.near(24, 94, 12), () => {
      const m = this.spawn('occupant', 24, 94);
      m.kind = 'watcher';
      m.pos.y = 1.9;
      m.close = 9;
      m.linger = 0.8;
      m.onGone = () => this.play('whistle', meta.chair2, { gain: 1.2, send: 0.8, ref: 4 });
    });

    // first time in the deep end, the panel tells you what it wants
    kit.trigger((d) => d.zone() === 'D', () => { if (this.opened === 0) this.setObjective('there\'s a drain control by the deep end'); });

    // the ring on the deep water moves between glances
    kit.unseen(meta.ring, Array.from({ length: 8 }, (_, i) => () => {
      const a = i * 0.9 + Math.random();
      return { p: [44 + Math.cos(a) * 10, world.waters.includes(meta.deep) ? meta.deep.surface + 0.06 : 0, 82 + Math.sin(a) * 6] };
    }), { wait: 3, minDist: 6, loop: true, active: () => meta.deep.surface > -4.6 });

    // the pump room hums; the lights in the lap pool go out after you open the first valve
    this.loopAt('pump_hum', meta.pump, { gain: 0.8, ref: 3 });
    kit.trigger((d) => d.opened >= 1 && d.zone() === 'L', () => { this.poolOut = true; });

    // the tube: something comes down a slide inside the walls
    kit.trigger((d) => d.zone() === 't' && d.near(50, 56, 5), () => this.play('slide_whoosh', { x: 50, y: 3.5, z: 58 }, { gain: 1.3, send: 0.7 }));

    // the tunnel: the first time you're in it, you aren't alone
    kit.trigger((d) => d.zone() === 'u' && d.player.pos.y < -1, () => {
      this.met = true;
      this.kit.after(2.5, () => { if (!this.monster && this.inDeep()) this.spawnSwimmer(this.inDeep()).speed = 2.8; });
    });
  }

  inDeep() {
    const p = this.player.pos, w = this.world.waterRect(p.x, p.z);
    return w && w.deep && p.y < w.surface - 0.5 ? w : null;
  }

  // wet footprints on dry tile, leading up to where you're standing
  footprints() {
    const p = this.player.pos, f = this.player.forward;
    const back = new THREE.Vector3(-f.x, 0, -f.z).normalize();
    const side = new THREE.Vector3(-back.z, 0, back.x);
    const prints = [];
    for (let i = 0; i < 9; i++) {
      const d = 10 - i * 0.95;
      const x = p.x + back.x * d + side.x * (i % 2 ? 0.14 : -0.14), z = p.z + back.z * d + side.z * (i % 2 ? 0.14 : -0.14);
      if (this.blocked(x, z, 0.1) || this.world.waterAt(x, z) !== null || this.world.zoneAt(x, z) !== this.zone()) continue;
      prints.push([x, z]);
    }
    if (prints.length < 4) return false;
    prints.forEach(([x, z], i) => this.kit.after(i * 0.32, () => {
      const m = this.world.ctx().decal(x, z, 0.09, 0x3a5a62, 0.55, 0.007);
      m.scale.set(0.7, 1.4, 1);
      m.rotation.z = Math.atan2(back.x, back.z);
      this.kit.after(30, () => { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); });
    }));
    this.play('wet_feet', { x: prints[0][0], y: 0.1, z: prints[0][1] }, { gain: 1, ref: 2 });
    return true;
  }

  script(dt) {
    const { meta, world, player } = this;
    const zone = this.zone();
    this.calm = { L: 0.06, D: 0.1, k: 0.05, t: 0.16, u: 0.35, v: 0.25, f: 0.15, x: 0.22, X: 0 }[zone] ?? 0.08;

    // valves spin as they open
    for (const v of meta.valves) if (v.spin > 0) { v.spin -= dt; v.wheel.rotation.z -= dt * 5; }

    // footprints, now and then, where it's dry
    this.printT = (this.printT ?? 30) - dt;
    if (this.printT <= 0 && ['L', 'D', 'c'].includes(zone) && player.speed > 0.5 && !this.inDeep()) this.printT = this.footprints() ? 40 + Math.random() * 30 : 5;

    // the beach ball comes your way, but only while you aren't looking at it
    const ball = meta.ball;
    if (zone === 'L' && !this.kit.seen(ball) && !world.waterRect(player.pos.x, player.pos.z)) {
      const w = meta.lapWater;
      const tx = THREE.MathUtils.clamp(player.pos.x, w.x1 + 0.5, w.x2 - 0.5), tz = THREE.MathUtils.clamp(player.pos.z, w.z1 + 0.5, w.z2 - 0.5);
      const dx = tx - ball.position.x, dz = tz - ball.position.z, d = Math.hypot(dx, dz);
      if (d > 0.6) {
        const step = Math.min(d, dt * 0.7);
        ball.position.x += dx / d * step;
        ball.position.z += dz / d * step;
        ball.rotation.x += step / 0.3 * Math.sign(dz);
        ball.rotation.z -= step / 0.3 * Math.sign(dx);
      } else if (!this.ballBumped) { this.ballBumped = true; this.play('ball_bump', ball.position, { gain: 1 }); }
    }
    ball.position.y = 0.12 + Math.sin(this.t * 1.3) * 0.02;

    // lap pool lights going out one by one
    if (this.poolOut && zone === 'L') {
      this.outT = (this.outT ?? 2) - dt;
      if (this.outT <= 0) {
        this.outT = 2.5;
        const l = meta.poolLights.find((p) => p.anchor.on && p.z < 40 && p.x > 36);
        if (l) { setLamp(world.M, l, false); this.play('light_flicker', { x: l.x, y: -0.5, z: l.z }, { gain: 0.5 }); }
      }
    }

    // draining: the deep end empties, the gate at the bottom opens
    if (this.draining) {
      const w = meta.deep;
      world.setSurface(w, Math.max(w.floor, w.surface - dt * 0.17));
      this.audio.ramp(this.drainSound.gain.gain, w.surface > w.floor + 0.2 ? 1.6 : 0, 1);
      if (w.surface <= w.floor + 0.25 && !this.drained) {
        this.drained = true;
        this.play('shutter_open', { x: 60, y: -4, z: 82 }, { gain: 1.3 });
        for (const l of meta.exitLamps) setLamp(world.M, l, true);
        this.setObjective('go down. the door at the bottom');
        this.kit.after(3, () => this.pa('t2_pa3', '"thank you for swimming with us today. please come again."'));
      }
    }
    const gate = meta.gate;
    if (this.drained && gate.open < 1) {
      gate.open = Math.min(1, gate.open + dt * 0.4);
      gate.obj.position.y = -5 + gate.open * 2.5;
      gate.block.off = gate.open > 0.8;
    }

    // out: the white room at the top of the stairs
    if (zone === 'X' && this.leaving === undefined) {
      this.leaving = 0;
      this.holdFade = true;
      this.setObjective(null);
      if (this.monster) this.despawn();
    }
    if (this.leaving !== undefined) {
      this.leaving += dt;
      if (this.leaving > 3) this.fx.fade = Math.min(1, (this.leaving - 3) / 3);
      if (this.leaving > 6.5) this.finished = true;
      return;
    }

    // the Swimmer: in deep water, now and then, once it knows you're here
    if (this.monster || !this.met || this.draining) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 5;
    const w = this.inDeep();
    if (!w || Math.random() > 0.5) return;
    this.spawnSwimmer(w).speed = 2.8;
    this.cooldown = 30;
  }

  rewound() { this.cooldown = 25; }
}

export const TAPE2 = {
  id: 't2',
  number: '02',
  title: 'DEEP END',
  blurb: 'a swim lesson that never ended. the deep end keeps getting deeper.',
  sounds: SOUNDS,
  level: { id: 't2', zones: ZONES, spawn: { pos: [8, 0, 9], yaw: -Math.PI / 2, zone: 'r' }, build },
  Director: DeepEnd,
};
