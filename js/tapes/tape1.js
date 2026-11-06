import * as THREE from 'three';
import { Grid } from './grid.js';
import { TapeDirector } from './base.js';

// TAPE 01: OVERTIME
// Someone stayed late to finish a report, and the office kept going. Four fuses are
// missing from the elevator's fuse box; they are somewhere past the supply closet.

const ZONES = {
  b: { name: 'break room', floor: 'tile', fog: [0x221f1a, 0.04], hemi: 0.12, ambient: 0.5, bloom: [0.5, 0.82], reverb: [0.05, 0.3], ambience: ['fluorescent_hum', 0.25] },
  o: { name: 'office', floor: 'carpet', env: 0.6, fog: [0x1a1c22, 0.032], hemi: 0.12, ambient: 0.4, bloom: [0.5, 0.82], reverb: [0.12, 0.3], ambience: ['office_ambience', 0.5] },
  l: { name: 'lobby', floor: 'tile', fog: [0x17140f, 0.034], hemi: 0.18, ambient: 0.25, bloom: [0.55, 0.8], reverb: [0.5, 0.15], ambience: ['fluorescent_hum', 0.18] },
  e: { name: 'elevator', floor: 'tile', fog: [0x17140f, 0.03], hemi: 0.2, ambient: 0.3, reverb: [0, 0.5], ambience: ['fluorescent_hum', 0.1] },
  y: { name: 'yellow', floor: 'carpet', fog: [0x2b2512, 0.05], hemi: 0.35, ambient: 0.4, bloom: [0.5, 0.82], reverb: [0.05, 0.35], ambience: ['backrooms_buzz', 0.38] },
  w: { name: 'wet', floor: 'carpet', env: 0.6, fog: [0x23281b, 0.055], hemi: 0.22, ambient: 0.25, bloom: [0.5, 0.82], reverb: [0.2, 0.35], ambience: ['backrooms_buzz', 0.2] },
  k: { name: 'dark', floor: 'carpet', env: 0.03, fog: [0x030303, 0.085], hemi: 0.015, ambient: 0.02, bloom: [0.7, 0.7], reverb: [0.15, 0.4], ambience: ['dark_ambience', 0.6] },
  m: { name: 'maintenance', floor: 'concrete', env: 0.25, fog: [0x0e0d0b, 0.06], hemi: 0.08, ambient: 0.1, bloom: [0.6, 0.78], reverb: [0.25, 0.5], ambience: ['dark_ambience', 0.25] },
};

const SOUNDS = [
  'chair_roll', 'chair_creak', 'printer_run', 'vending_drop', 'can_roll', 'microwave_hum', 'microwave_beep', 'water_cooler',
  'elevator_open', 'elevator_close', 'elevator_move', 'fuse_insert', 'power_up', 'office_ambience', 'dark_ambience', 'door_slam', 'server_hum',
  't1_memo1', 't1_memo2', 't1_memo3', 't1_memo4', 't1_memo5', 't1_memo6', 't1_memo7', 't1_memo8', 't1_call',
];

const MEMOS = [
  'memo. 11:40 pm. the report is due at nine and everybody went home. i\'ll just finish it here.',
  '1:15. the lights on the east side keep turning off. the chairs were pushed in when i went to the printer. now they\'re all turned toward my desk.',
  'the printer started by itself. same page over and over: a floor plan of this floor, except there\'s more of it on the paper.',
  'the elevator won\'t come. no power. there\'s a fuse box in the lobby. four slots, all empty. who takes the fuses out of an elevator?',
  'there\'s a door in the supply closet. i\'ve worked here six years. there has never been a door in the supply closet.',
  'there\'s someone in here. tall. when i looked at it my ears started ringing. when i looked away, it was closer. don\'t stare. don\'t turn your back.',
  'the carpet\'s soaked. it\'s coming from above the ceiling tiles. it\'s warm, like something\'s been sleeping in it.',
  'if you\'re hearing this, you\'re me, later. put the fuses back. get in the elevator. it\'s 2:13. it\'s always 2:13.',
];

// ---------- props ----------
// a box in a prop's own frame, turned by a quarter turn count q (0..3)
function placer(c, x, z, q) {
  return (lx1, lx2, y1, y2, lz1, lz2, mat, collide) => {
    const pts = [[lx1, lz1], [lx2, lz2]].map(([u, w]) => [[u, w], [-w, u], [-u, -w], [w, -u]][q & 3]);
    c.box(x + Math.min(pts[0][0], pts[1][0]), x + Math.max(pts[0][0], pts[1][0]), y1, y2, z + Math.min(pts[0][1], pts[1][1]), z + Math.max(pts[0][1], pts[1][1]), mat, collide);
  };
}

const CHAIR = [
  [-0.32, 0.32, 0.05, 0.09, -0.04, 0.04, 'deskMetal'], [-0.04, 0.04, 0.05, 0.09, -0.32, 0.32, 'deskMetal'],
  [-0.03, 0.03, 0.09, 0.42, -0.03, 0.03, 'deskMetal'], [-0.25, 0.25, 0.42, 0.5, -0.25, 0.25, 'fabric'],
  [-0.23, 0.23, 0.56, 1.0, -0.28, -0.21, 'fabric'], [-0.03, 0.03, 0.44, 0.6, -0.27, -0.22, 'deskMetal'],
];

// a chair facing +z in its own frame
function staticChair(c, x, z, q) {
  const b = placer(c, x, z, q);
  for (const [a, b2, y1, y2, z1, z2, m] of CHAIR) b(a, b2, y1, y2, z1, z2, c.M[m]);
}

function chairObject(M) {
  const g = new THREE.Group();
  for (const [a, b, y1, y2, z1, z2, m] of CHAIR) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b - a, y2 - y1, z2 - z1), M[m]);
    mesh.position.set((a + b) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    g.add(mesh);
  }
  return g;
}

function recorder(c, x, y, z, rot, key, n) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.13), c.M.plastic);
  g.add(body);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), c.M.ledRed);
  led.position.set(0.02, 0.014, 0.045);
  g.add(led);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.04), c.M.metal);
  grille.position.set(0, 0.012, -0.03);
  g.add(grille);
  g.position.set(x, y + 0.011, z);
  g.rotation.y = rot;
  c.mesh(g);
  return c.item('recording', x, y + 0.03, z, { key, mesh: g, led, voice: `t1_memo${n}`, text: MEMOS[n - 1], seconds: 11, reach: 2.2, cos: 0.75 });
}

function fuse(c, x, y, z, n) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), c.M.fuse);
  tube.rotation.z = Math.PI / 2;
  g.add(tube);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), c.M.metal);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s * 0.09;
    g.add(cap);
  }
  g.position.set(x, y + 0.04, z);
  c.mesh(g);
  const glow = c.light(x, y + 0.25, z, { color: 0xffa040, intensity: 0.7, distance: 2.6 });
  return c.item('fuse', x, y + 0.05, z, { key: `f${n}`, mesh: g, glow, prompt: '[E] take fuse', reach: 2.2, cos: 0.7 });
}

function lamp(c, list, x, y, z, w = 1.2, d = 0.6, o = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), o.dead ? c.M.panelDead : c.M.panel);
  mesh.position.set(x, y - 0.015, z);
  c.mesh(mesh);
  const anchor = c.light(x, y - 0.45, z, { color: o.color ?? 0xfff2d8, intensity: o.intensity ?? 2.4, distance: o.distance ?? 9, flicker: o.flicker, on: !o.dead });
  const l = { mesh, anchor, x, z };
  list?.push(l);
  return l;
}

function setLamp(c, l, on) {
  l.anchor.on = on;
  l.mesh.material = on ? c.M.panel : c.M.panelDead;
}

// ---------- the floor plan ----------
function build(c, L) {
  const M = c.M;
  const meta = L.meta = { lamps: [], officeLamps: [], facers: [], leds: [], doors: {} };
  const g = new Grid(64, 48, 2);
  g.fill(2, 15, 6, 20, 'b').door(7, 17);
  g.fill(8, 2, 29, 33, 'o');
  g.fill(12, 35, 23, 42, 'l').door(17, 34).door(18, 34);
  g.fill(15, 43, 15, 43, 'e');
  g.door(24, 41).fill(25, 41, 62, 41, 'm');
  g.fill(40, 43, 46, 46, 'm').door(43, 42);
  g.fill(31, 1, 62, 27, 'y').door(30, 12);
  g.fill(35, 28, 36, 29, 'y').fill(48, 28, 48, 29, 'y');
  g.fill(31, 30, 50, 39, 'w');
  g.fill(52, 30, 62, 39, 'k').door(51, 34).door(60, 40);
  // the yellow: hand-drawn halls that don't add up
  g.wallV(34, 1, 9).wallV(34, 15, 27).wallH(9, 35, 42).wallH(15, 35, 40).wallV(42, 3, 9).wallH(3, 36, 50);
  g.wallV(46, 5, 13).wallH(7, 49, 55).wallH(13, 49, 55).wallV(49, 7, 13).wallV(55, 7, 13).door(52, 13);
  g.wallV(58, 1, 4).wallV(58, 6, 16).wallH(17, 47, 52).wallH(17, 54, 58).wallH(22, 50, 55).wallH(22, 57, 62);
  g.wallV(46, 16, 20).wallV(46, 22, 27).wallH(25, 48, 60);
  for (const [cc, rr] of [[37, 18], [40, 18], [43, 18], [37, 21], [40, 21], [43, 21], [37, 24], [40, 24], [43, 24]]) g.set(cc, rr, '#');
  // the dark: shelving in rows
  meta.grid = g;
  g.build(c, {
    b: { floor: M.ofTile, ceil: M.ofCeiling, wall: M.ofWall, base: M.brTrim, height: 2.7, zone: 'b' },
    o: { floor: M.ofCarpet, ceil: M.ofCeiling, wall: M.ofWall, base: M.deskMetal, height: 2.9, zone: 'o' },
    l: { floor: M.lbFloor, ceil: M.ofCeiling, wall: M.lbWood, base: M.deskMetal, height: 4.2, zone: 'l', doorH: 3.0 },
    e: { floor: M.lbWood, ceil: M.elevator, wall: M.elevator, height: 2.6, zone: 'e', door: false },
    y: { floor: M.brCarpet, ceil: M.brCeiling, wall: M.brWall, base: M.brTrim, height: 2.7, zone: 'y' },
    w: { floor: M.wetCarpet, ceil: M.brCeiling, wall: M.brWall, base: M.brTrim, height: 2.7, zone: 'w' },
    k: { floor: M.brCarpet, ceil: M.brCeiling, wall: M.brWall, base: M.brTrim, height: 2.5, zone: 'k' },
    m: { floor: M.concrete, ceil: M.concrete, wall: M.concrete, height: 2.6, zone: 'm' },
  });

  breakRoom(c, meta);
  office(c, meta);
  lobby(c, meta);
  yellow(c, meta, g);
  wet(c, meta);
  dark(c, meta);
  maintenance(c, meta);
}

function breakRoom(c, meta) {
  const M = c.M;
  // counter, cupboards, fridge, microwave, coffee
  c.box(4.2, 10.4, 0, 0.9, 30, 30.65, M.beige, true);
  c.box(4.2, 10.4, 0.9, 0.95, 30, 30.7, M.desk);
  c.box(4.2, 10.4, 1.6, 2.3, 30, 30.4, M.beige);
  c.box(10.6, 11.6, 0, 1.9, 30, 30.75, M.beige, true);
  c.box(10.62, 10.64, 1.0, 1.7, 30.75, 30.78, M.deskMetal);
  c.box(6.0, 6.55, 0.95, 1.27, 30.05, 30.45, M.beige);
  c.plane(6.2, 1.11, 30.45, 0.3, 0.2, 's', M.screenOff);
  const micro = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), M.fuse);
  micro.position.set(6.2, 1.11, 30.47);
  micro.visible = false;
  c.mesh(micro);
  meta.microwave = { glow: micro, pos: new THREE.Vector3(6.25, 1.1, 30.3) };
  c.box(8.6, 8.85, 0.95, 1.3, 30.1, 30.35, M.plastic);
  // the vending machine and the water cooler
  c.box(4.05, 4.95, 0, 1.9, 36, 37.2, M.deskMetal, true);
  c.plane(4.95, 1.2, 36.6, 1.0, 1.1, 'e', M.mlGlowLit);
  c.box(4.95, 5.0, 0.15, 0.4, 36.2, 37.0, M.plastic);
  meta.vending = new THREE.Vector3(5.1, 0.25, 36.6);
  c.box(13.3, 13.7, 0, 0.9, 40.9, 41.3, M.beige, true);
  c.cyl(13.5, 41.1, 0.16, 0.16, 0.9, 1.35, M.glass, 14);
  meta.cooler = new THREE.Vector3(13.5, 1.1, 41.1);
  // table and chairs
  c.box(8.2, 9.8, 0.72, 0.76, 36.4, 37.4, M.desk, true);
  for (const [x, z] of [[8.4, 36.6], [9.6, 36.6], [8.4, 37.2], [9.6, 37.2]]) c.box(x - 0.03, x + 0.03, 0, 0.72, z - 0.03, z + 0.03, M.deskMetal);
  staticChair(c, 8.6, 35.9, 0);
  staticChair(c, 9.5, 38.0, 2);
  staticChair(c, 7.4, 37.0, 3);
  // a television on a bracket, showing nothing
  c.box(13.6, 14, 1.9, 2.4, 33, 33.8, M.plastic);
  c.plane(13.6, 2.15, 33.4, 0.66, 0.4, 'w', c.tvStatic);
  meta.tv = new THREE.Vector3(13.5, 2.1, 33.4);
  c.plane(9, 2.0, 41.9, 0.42, 0.42, 'n', M.clock);
  c.plane(4.1, 1.6, 33, 0.7, 0.95, 'e', M.posterB);
  lamp(c, meta.lamps, 7, 2.7, 35, 1.2, 0.6, { intensity: 1.5 });
  lamp(c, meta.lamps, 11, 2.7, 38, 1.2, 0.6, { intensity: 1.5, flicker: true });
  recorder(c, 9.3, 0.76, 36.8, 0.4, 'r1', 1);
}

function cubicles(c, meta) {
  const M = c.M;
  const facerSpots = new Set(['0,0,1', '1,1,2', '2,0,0', '0,2,3', '2,3,1', '1,2,0']);
  const xs = [18.5, 30.5, 42.5], zs = [19, 27, 36.6, 44.6];
  xs.forEach((x0, bi) => zs.forEach((z0, bj) => {
    const H = 1.35;
    // the spine and the dividers
    c.box(x0, x0 + 9.6, 0, H, z0 + 2.37, z0 + 2.43, M.cubicle, true);
    for (let i = 0; i <= 4; i++) c.box(x0 + i * 2.4 - 0.03, x0 + i * 2.4 + 0.03, 0, H, z0 + 0.6, z0 + 4.2, M.cubicle, true);
    c.box(x0 - 0.04, x0 + 9.64, H, H + 0.04, z0 + 2.35, z0 + 2.45, M.cubicleTrim);
    for (let i = 0; i <= 4; i++) c.box(x0 + i * 2.4 - 0.05, x0 + i * 2.4 + 0.05, H, H + 0.04, z0 + 0.6, z0 + 4.2, M.cubicleTrim);
    for (let i = 0; i < 4; i++) {
      for (const row of [0, 1]) {
        const cx = x0 + i * 2.4 + 1.2;
        const sz = row ? 1 : -1; // desk sits against the spine; row 0 is the north side
        const dz1 = z0 + 2.4 + (row ? 0.03 : -0.73), dz2 = z0 + 2.4 + (row ? 0.73 : -0.03);
        c.box(cx - 1.05, cx + 1.05, 0.72, 0.75, dz1, dz2, M.desk, true);
        c.box(cx - 1.0, cx - 0.96, 0, 0.72, dz1, dz2, M.deskMetal);
        c.box(cx + 0.96, cx + 1.0, 0, 0.72, dz1, dz2, M.deskMetal);
        const mz = z0 + 2.4 + sz * 0.25;
        c.box(cx - 0.21, cx + 0.21, 0.75, 1.12, mz - 0.17, mz + 0.17, M.beige);
        const lit = ((i * 7 + bi * 3 + bj * 5 + row) % 5) === 0;
        c.plane(cx, 0.95, mz + sz * 0.17, 0.34, 0.26, row ? 's' : 'n', lit ? M.screenOn : M.screenOff, 0.005);
        if (lit) c.light(cx, 1.0, mz + sz * 0.6, { color: 0x7da0ff, intensity: 0.35, distance: 2.5 });
        c.box(cx - 0.22, cx + 0.22, 0.75, 0.77, mz + sz * 0.33 - 0.08, mz + sz * 0.33 + 0.08, M.plastic);
        if ((i + bj + row) % 3 === 0) c.box(cx + 0.5, cx + 0.8, 0.75, 0.77, mz + sz * 0.2 - 0.11, mz + sz * 0.2 + 0.11, M.paper);
        const chairZ = z0 + 2.4 + sz * 1.4;
        if (facerSpots.has(`${bi},${bj},${i}`) && row === 0) {
          const ch = chairObject(M);
          ch.position.set(cx, 0, chairZ);
          ch.rotation.y = row ? Math.PI : 0;
          c.mesh(ch);
          meta.facers.push(ch);
        } else staticChair(c, cx, chairZ, row ? 2 : 0);
        if (bi === 1 && bj === 1 && i === 2 && row === 0) {
          // the desk phone
          c.box(cx - 0.75, cx - 0.5, 0.75, 0.82, mz - 0.1, mz + 0.1, M.plastic);
          meta.deskPhone = new THREE.Vector3(cx - 0.62, 0.85, mz);
        }
        if (bi === 1 && bj === 0 && i === 1 && row === 1) recorder(c, cx + 0.45, 0.75, mz + 0.1, 2.6, 'r2', 2);
      }
    }
  }));
}

function office(c, meta) {
  const M = c.M;
  cubicles(c, meta);
  // the manager's office: glass to the floor, a real desk, the first fuse in the drawer
  for (const [z1, z2] of [[4, 12.6], [13.8, 16]]) {
    c.box(27.95, 28.05, 0, 2.9, z1, z2, M.glass, true);
    c.box(27.9, 28.1, 0, 0.08, z1, z2, M.glassFrame);
    c.box(27.9, 28.1, 2.82, 2.9, z1, z2, M.glassFrame);
  }
  c.box(27.9, 28.1, 2.2, 2.9, 12.6, 13.8, M.ofWall);
  c.box(16, 28.1, 0, 2.9, 15.92, 16.08, M.ofWall, true);
  c.box(18.5, 21.5, 0.74, 0.79, 7.5, 8.6, M.lbWood, true);
  c.box(18.6, 19.2, 0, 0.74, 7.6, 8.5, M.lbWood);
  c.box(20.8, 21.4, 0, 0.74, 7.6, 8.5, M.lbWood);
  staticChair(c, 20, 6.8, 0);
  staticChair(c, 19.4, 10.0, 2);
  staticChair(c, 20.6, 10.0, 2);
  c.box(16.1, 16.6, 0, 1.9, 5, 7.4, M.lbWood, true);
  c.plane(16.08, 1.6, 12, 0.7, 0.95, 'e', M.posterA);
  c.cyl(26.8, 5, 0.22, 0.18, 0, 0.45, M.mlPlanter, 12, true);
  c.sphere(26.8, 0.85, 5, 0.42, M.mlLeaf);
  recorder(c, 19.1, 0.79, 8.1, 1.2, 'r4', 4);
  meta.fuse1 = fuse(c, 20.9, 0.79, 7.8, 1);
  // the printer room
  c.box(47.92, 48.08, 0, 2.9, 4, 12, M.ofWall, true);
  c.box(48, 50.4, 0, 2.9, 11.92, 12.08, M.ofWall, true);
  c.box(51.6, 60, 0, 2.9, 11.92, 12.08, M.ofWall, true);
  c.box(50.4, 51.6, 2.2, 2.9, 11.92, 12.08, M.ofWall);
  c.box(52, 53.4, 0, 1.0, 5.6, 6.6, M.beige, true);
  c.box(52.1, 53.3, 1.0, 1.2, 5.7, 6.5, M.beige);
  c.box(52.2, 53.2, 0.8, 0.82, 6.6, 7.0, M.plastic);
  meta.printer = new THREE.Vector3(52.7, 0.95, 6.8);
  c.box(56, 59.8, 0, 0.9, 4.1, 4.8, M.beige, true);
  for (let i = 0; i < 6; i++) c.box(56.3 + i * 0.5, 56.6 + i * 0.5, 0.9, 0.95 + (i % 3) * 0.04, 4.2, 4.6, M.paper);
  recorder(c, 58.7, 0.9, 4.45, 0.2, 'r3', 3);
  // the supply closet, and the door that wasn't there before
  c.box(53.92, 54.08, 0, 2.9, 20, 27.2, M.ofWall, true);
  c.box(53.92, 54.08, 0, 2.9, 28.4, 30, M.ofWall, true);
  c.box(53.92, 54.08, 2.2, 2.9, 27.2, 28.4, M.ofWall);
  c.box(54, 60, 0, 2.9, 19.92, 20.08, M.ofWall, true);
  c.box(54, 60, 0, 2.9, 29.92, 30.08, M.ofWall, true);
  for (const z of [21, 29]) c.box(55, 59.6, 0, 2.0, z - 0.4, z + 0.4, M.deskMetal, true);
  for (const z of [21, 29]) for (const y of [0.4, 1.0, 1.6]) for (let i = 0; i < 4; i++) c.box(55.2 + i * 1.1, 55.9 + i * 1.1, y, y + 0.3, z - 0.3, z + 0.25, M.beige);
  recorder(c, 58.4, 0, 25.6, 0.7, 'r5', 5);
  for (const z of [24, 25.92]) c.box(59.85, 60, 0, 2.2, z, z + 0.08, M.brTrim);
  c.box(59.85, 60, 2.12, 2.2, 24, 26, M.brTrim);
  // the conference room behind glass
  for (const [z1, z2] of [[54, 56], [57.2, 68]]) {
    c.box(29.95, 30.05, 0, 2.9, z1, z2, M.glass, true);
    c.box(29.9, 30.1, 0, 0.08, z1, z2, M.glassFrame);
    c.box(29.9, 30.1, 2.82, 2.9, z1, z2, M.glassFrame);
  }
  c.box(29.9, 30.1, 2.2, 2.9, 56, 57.2, M.ofWall);
  c.box(16, 30, 0, 2.9, 53.95, 54.05, M.glass, true);
  c.box(16, 30, 0, 0.08, 53.9, 54.1, M.glassFrame);
  c.box(19, 27, 0.72, 0.77, 59.5, 62.5, M.lbWood, true);
  for (let i = 0; i < 5; i++) { staticChair(c, 19.8 + i * 1.6, 58.6, 0); staticChair(c, 19.8 + i * 1.6, 63.4, 2); }
  c.plane(16.08, 1.5, 61, 2.4, 1.2, 'e', M.dreamWhite);
  c.plane(16.09, 1.5, 61, 2.2, 1.0, 'e', M.paper);
  // posters, a clock, plants, the water of an office
  c.plane(16.08, 1.6, 26, 0.7, 0.95, 'e', M.posterC);
  c.plane(36, 2.1, 4.02, 0.42, 0.42, 's', M.clock);
  for (const [x, z] of [[17, 18], [58.6, 52], [17, 50], [46.5, 66.6]]) { c.cyl(x, z, 0.22, 0.18, 0, 0.45, M.mlPlanter, 12, true); c.sphere(x, 0.85, z, 0.42, M.mlLeaf); }
  for (const [x, z] of [[42, 14], [44, 14], [46, 14]]) c.box(x - 0.45, x + 0.45, 0, 1.3, z - 0.3, z + 0.3, M.deskMetal, true);
  // the lights, every one of them on its own switch
  for (let x = 19; x <= 57; x += 6) for (let z = 7; z <= 64; z += 6) lamp(c, meta.officeLamps, x, 2.9, z);
}

function lobby(c, meta) {
  const M = c.M;
  // reception
  c.box(26, 32, 0, 1.1, 72, 73.2, M.lbWood, true);
  c.box(25.9, 32.1, 1.1, 1.15, 71.9, 73.3, M.desk);
  staticChair(c, 29, 74.2, 2);
  c.plane(29, 1.6, 70.02, 1.6, 0.45, 's', c.sign('NORTHGATE  HOLDINGS', '#e8d9b0'), 0.02);
  c.plane(36, 3.1, 70.02, 0.5, 0.5, 's', M.clock);
  meta.clock = new THREE.Vector3(36, 3.1, 70.1);
  // waiting chairs and plants
  for (let i = 0; i < 4; i++) staticChair(c, 46.9, 73 + i * 0.9, 1);
  for (const [x, z] of [[25, 84.8], [47, 84.8], [47, 71]]) { c.cyl(x, z, 0.3, 0.24, 0, 0.6, M.mlPlanter, 12, true); c.sphere(x, 1.15, z, 0.55, M.mlLeaf); }
  // the fuse box
  c.box(24, 24.25, 1.0, 1.9, 77.3, 78.7, M.deskMetal, true);
  meta.slots = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.18), M.fuseDead);
    m.position.set(24.28, 1.3 + (i % 2) * 0.28, 77.7 + Math.floor(i / 2) * 0.6);
    c.mesh(m);
    meta.slots.push(m);
  }
  c.plane(24.26, 1.75, 78, 0.6, 0.16, 'e', c.sign('ELEVATOR', '#d8d8d8'), 0.01);
  meta.fuseBox = c.item('fusebox', 24.3, 1.45, 78, { prompt: '[E] put the fuses in', reach: 2.0, cos: 0.6 });
  // the elevators: one real, one that never was
  meta.elevators = [];
  for (const [x0, real] of [[30, true], [40, false]]) {
    c.box(x0 - 0.3, x0, 0, 2.6, 85.85, 86, M.elevator);
    c.box(x0 + 2, x0 + 2.3, 0, 2.6, 85.85, 86, M.elevator);
    c.box(x0 - 0.3, x0 + 2.3, 2.45, 2.75, 85.85, 86, M.elevator);
    c.plane(x0 + 1, 3.0, 85.86, 0.5, 0.18, 'n', c.sign(real ? 'B1' : '--', '#ff6a3a'), 0.01);
    c.box(x0 + 2.55, x0 + 2.75, 1.0, 1.4, 85.95, 86, M.elevator);
    const btn = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), M.panelDead);
    btn.position.set(x0 + 2.65, 1.2, 85.94);
    btn.rotation.y = Math.PI;
    c.mesh(btn);
    const panels = [0, 1].map((s) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1, 2.45, 0.06), M.elevator);
      p.position.set(x0 + 0.5 + s, 1.225, 85.88);
      c.mesh(p);
      return p;
    });
    const block = c.collide(x0, x0 + 2, 85.8, 86.0, 0, 3);
    if (!real) c.box(x0, x0 + 2, 0, 2.45, 85.99, 86.0, M.concrete);
    const e = { x0, real, panels, block, btn, open: 0, target: 0 };
    meta.elevators.push(e);
    c.item('callbutton', x0 + 2.65, 1.2, 85.9, { elevator: e, prompt: '[E] call', reach: 1.8, cos: 0.6 });
  }
  // inside the car
  lamp(c, meta.lamps, 31, 2.6, 87, 0.8, 0.8, { intensity: 1.6, distance: 4, dead: true });
  meta.carLamp = meta.lamps[meta.lamps.length - 1];
  c.box(31.5, 31.85, 1.0, 1.5, 87.95, 88, M.deskMetal);
  // downlights
  for (let x = 27; x <= 45; x += 6) for (const z of [74, 81]) lamp(c, meta.lamps, x, 4.2, z, 0.5, 0.5, { intensity: 3.2, distance: 11, color: 0xffd8a8 });
}

function yellow(c, meta, g) {
  const M = c.M;
  // panels in the ceiling every two cells; a few dead, a few that won't settle
  let k = 0;
  for (const [x, z, cc, rr] of g.cells('y')) {
    if (cc % 2 || rr % 2) continue;
    k++;
    const dead = k % 13 === 5, flicker = k % 9 === 4;
    lamp(c, meta.lamps, x, 2.7, z, 1.2, 0.6, { dead, flicker, intensity: 2.2, distance: 8.5 });
  }
  // stains, an old chair, scraps of office that came along
  for (const [x, z, r] of [[72, 12, 1.2], [90, 40, 0.8], [110, 30, 1.6], [64, 44, 0.9], [100, 52, 1.1], [120, 10, 1.3]]) c.decal(x, z, r, 0x3b2e10, 0.35);
  const stray = chairObject(M);
  stray.position.set(66.5, 0, 24.5);
  stray.rotation.y = -Math.PI / 2;
  c.mesh(stray);
  meta.stray = stray;
  recorder(c, 80.6, 0, 44.5, 1.0, 'r6', 6);
  meta.fuse2 = fuse(c, 105, 0, 21, 2);
  c.box(103.6, 106.4, 0, 0.75, 20.4, 21.6, M.desk, true);
  meta.fuse2.mesh.position.y = 0.79;
  meta.fuse2.pos.y = 0.8;
}

function wet(c, meta) {
  const M = c.M;
  const murk = new THREE.MeshStandardMaterial({ color: 0x3d3a22, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0.3, depthWrite: false, envMapIntensity: 1.3 });
  murk.envMap = M.brWall.envMap;
  c.water(62, 102, 60, 80, 0.1, 0, false, murk);
  for (let x = 68; x <= 96; x += 8) for (const z of [64, 74]) c.box(x - 0.4, x + 0.4, 0, 2.7, z - 0.4, z + 0.4, M.brWall, true);
  let k = 0;
  for (let x = 64; x <= 100; x += 4) {
    for (let z = 62; z <= 78; z += 4) {
      k++;
      if (k % 3 === 0) { c.box(x - 0.6, x + 0.6, 2.69, 2.7, z - 0.6, z + 0.6, M.black); continue; } // a missing tile
      lamp(c, meta.lamps, x, 2.7, z, 1.2, 0.6, { dead: k % 4 === 1, flicker: k % 5 === 2, intensity: 1.8, distance: 8 });
    }
  }
  recorder(c, 70.5, 0.12, 72.5, 2.2, 'r7', 7);
  c.box(69.8, 71.2, 0, 0.12, 72, 73, M.beige);
  meta.recorder7Lift = true;
  meta.fuse3 = fuse(c, 98.5, 0, 77.5, 3);
  const floater = chairObject(M);
  c.mesh(floater);
  meta.floater = floater;
}

function dark(c, meta) {
  const M = c.M;
  // shelving in rows, servers along the far wall
  for (const z of [63, 68, 73, 78]) {
    for (const [x1, x2] of [[106, 112], [114, 120]]) {
      if (z === 68 && x1 === 106) continue; // the way in
      c.box(x1, x2, 0, 2.1, z - 0.4, z + 0.4, M.deskMetal, true);
      for (const y of [0.3, 0.9, 1.5]) for (let x = x1 + 0.2; x < x2 - 0.5; x += 0.9) c.box(x, x + 0.7, y, y + 0.4, z - 0.35, z + 0.3, M.beige);
    }
  }
  meta.servers = [];
  for (let z = 61.5; z <= 78.5; z += 1.4) {
    c.box(124.8, 126, 0, 2.1, z - 0.6, z + 0.6, M.plastic, true);
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), i % 3 ? M.ledGreen : M.ledRed);
      led.position.set(124.79, 0.4 + i * 0.28, z - 0.4 + (i % 2) * 0.5);
      led.rotation.y = -Math.PI / 2;
      c.mesh(led);
      meta.leds.push(led);
    }
  }
  meta.serverPos = new THREE.Vector3(124.5, 1, 70);
  meta.darkLamp = lamp(c, null, 121, 2.5, 64.2, 0.6, 0.6, { flicker: true, intensity: 1.4, distance: 6 });
  c.box(120.2, 122, 0, 0.9, 63.6, 64.6, M.deskMetal, true);
  meta.fuse4 = fuse(c, 121.1, 0.9, 64.1, 4);
  recorder(c, 117.2, 0, 75.8, 0.8, 'r8', 8);
}

function maintenance(c, meta) {
  const M = c.M;
  // pipes overhead, caged bulbs, the boiler
  c.box(50, 126, 2.25, 2.4, 83.4, 83.6, M.metal);
  c.box(50, 126, 2.35, 2.45, 82.4, 82.55, M.deskMetal);
  for (let x = 54; x <= 124; x += 9) {
    c.sphere(x, 2.42, 83, 0.07, M.tapeGlow);
    c.light(x, 2.2, 83, { color: 0xffc070, intensity: 1.5, distance: 7, flicker: x === 90 });
  }
  c.cyl(87, 90, 1.4, 1.4, 0, 2.3, M.deskMetal, 20, true);
  c.cyl(87, 90, 0.3, 0.3, 2.3, 3.0, M.metal, 10);
  c.light(84, 2.2, 92, { color: 0xff8040, intensity: 1.2, distance: 6 });
  c.sphere(84, 2.5, 92, 0.07, M.tapeGlow);
}

// ---------- what happens ----------
class Overtime extends TapeDirector {
  constructor(o) {
    super(o);
    const { world } = this;
    const meta = this.meta = world.meta;
    this.carried = 0;
    this.inserted = 0;
    this.power = false;
    this.met = false;
    this.cooldown = 0;
    this.spawnTimer = 8;
    this.seenLobby = false;
    this.calm = 0.12;
    this.say('2:13 AM', 4);
    this.setObjective('find a way out');

    for (const it of world.items()) {
      if (it.type === 'fuse') it.use = (f) => this.takeFuse(f);
      if (it.type === 'fusebox') {
        it.ready = () => this.carried > 0;
        it.use = () => this.insertFuses();
      }
      if (it.type === 'callbutton') it.use = (b) => this.call(b.elevator);
    }
    this.kitEvents();
  }

  takeFuse(f) {
    f.done = true;
    f.mesh.visible = false;
    f.glow.on = false;
    this.carried++;
    this.got = (this.got ?? 0) + 1;
    this.play('pickup', f.pos, { gain: 1 });
    this.say(`fuse (${this.got} of 4)`, 3);
    this.setObjective(`fuses ${this.got}/4. the fuse box is in the lobby`);
    this.onFuse?.(f.key);
  }

  insertFuses() {
    const { meta } = this;
    while (this.carried > 0) {
      meta.slots[this.inserted].material = this.world.M.fuse;
      this.inserted++;
      this.carried--;
    }
    this.play('fuse_insert', meta.fuseBox.pos, { gain: 1.3 });
    if (this.inserted < 4) {
      this.say(`${this.inserted} of 4`, 3);
      this.setObjective(`fuses ${this.inserted}/4 in the box. find the rest`);
      return;
    }
    meta.fuseBox.done = true;
    this.setObjective(null);
    this.powerUp();
  }

  call(e) {
    if (e.real && this.power) { this.openElevator(e); return; }
    this.play('dead_buttons', e.btn.position, { gain: 1 });
    if (!this.power) {
      this.say('no power', 2.5);
      if (this.got === undefined) this.setObjective('the elevator needs power. check the fuse box');
    }
  }

  openElevator(e) {
    if (e.target === 1) return;
    e.target = 1;
    e.block.off = true;
    this.play('elevator_ding', e.btn.position, { gain: 1.2 });
    this.play('elevator_open', e.btn.position, { gain: 1.1, delay: 0.4 });
  }

  closeElevator(e) {
    e.target = 0;
    e.block.off = false;
    this.play('elevator_close', e.btn.position, { gain: 1.1 });
  }

  // the lights go, then everything comes back at once
  powerUp() {
    const { meta, kit, world } = this;
    const all = [...meta.officeLamps, ...meta.lamps.filter((l) => world.zoneAt(l.x, l.z) === 'l')];
    for (const l of all) setLamp(this.ctx, l, false);
    this.play('lights_off', this.player.pos, { gain: 1.2 });
    this.fx.glitch = 0.5;
    kit.after(1.6, () => this.play('power_up', this.player.pos, { gain: 1.3, hrtf: false }));
    all.forEach((l, i) => kit.after(2.2 + (i % 17) * 0.09 + Math.random() * 0.6, () => setLamp(this.ctx, l, true)));
    kit.after(4.5, () => {
      this.power = true;
      setLamp(this.ctx, meta.carLamp, true);
      meta.elevators[0].btn.material = world.M.ledGreen;
      this.openElevator(meta.elevators[0]);
      this.setObjective('take the elevator');
    });
  }

  get ctx() { return { M: this.world.M }; }

  kitEvents() {
    const { meta, kit, world } = this;
    const M = world.M;

    // the chairs in the cubicles turn to watch you
    for (const ch of meta.facers) kit.facer(ch, { wait: 1.4, minDist: 3.5, sound: 'chair_creak', gain: 0.55 });

    // one rolls across the aisle in front of you
    const roller = chairObject(M);
    roller.rotation.y = 0.3;
    world.dynamic.add(roller);
    const roll = kit.roller(roller, [[41.3, 0, 27.2], [41.4, 0, 33.5], [41.9, 0, 38.6]], { speed: 1.3, sound: 'chair_roll', gain: 1.1 });
    kit.trigger((d) => d.inRect(24, 39, 32, 37) && d.t > 8, () => roll.start());

    // the printer, the moment you come near it
    kit.trigger((d) => d.near(meta.printer.x, meta.printer.z, 7), () => {
      this.play('printer_run', meta.printer, { gain: 1.3 });
      for (let i = 0; i < 4; i++) {
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.003, 0.3), M.paper);
        world.dynamic.add(sheet);
        const r = kit.roller(sheet, [[52.7, 0.83, 6.7], [52.7, 0.83, 7.1], [52.4 + i * 0.25, 0.01 + i * 0.004, 7.6 + i * 0.18]], { speed: 0.9 });
        kit.after(0.8 + i * 1.0, () => r.start());
      }
    });

    // the desk phone rings once you've heard what's on the second recording
    kit.trigger((d) => d.found.size >= 2 && d.near(meta.deskPhone.x, meta.deskPhone.z, 9), () => {
      this.phoneRing = this.loopAt('phone_ring', meta.deskPhone, { gain: 1.2, send: 0.5, hrtf: true });
      world.items().push(this.phoneItem = { type: 'phone', pos: meta.deskPhone, prompt: '[E] answer', reach: 2.2, cos: 0.6, use: (it) => {
        it.done = true;
        this.phoneRing.src.stop();
        this.play('t1_call', meta.deskPhone, { gain: 1.5, send: 0.2, hrtf: false, radio: true });
        this.say('"you\'re still at the office? it\'s late. everyone else went home a long time ago. you should go home too."', 9);
      } });
    });
    kit.trigger((d) => d.phoneItem && !d.phoneItem.done && !d.near(meta.deskPhone.x, meta.deskPhone.z, 16), () => {
      this.phoneRing.src.stop();
      this.phoneItem.done = true;
    });

    // the microwave starts while you're out of the room, and is done when you come back
    const inBreak = (d) => d.inRect(4, 14, 30, 42);
    let lastIn = 0;
    kit.trigger((d) => { if (inBreak(d)) lastIn = d.t; return d.found.size >= 1 && d.t - lastIn > 25; }, () => {
      meta.microwave.glow.visible = true;
      this.microHum = this.loopAt('microwave_hum', meta.microwave.pos, { gain: 0.8, ref: 1.5 });
    });
    kit.trigger((d) => this.microHum && d.near(meta.microwave.pos.x, meta.microwave.pos.z, 4), () => {
      this.microHum.src.stop();
      meta.microwave.glow.visible = false;
      this.play('microwave_beep', meta.microwave.pos, { gain: 1, ref: 1.5 });
    });

    // the vending machine gives you something, and it rolls to your feet
    kit.trigger((d) => d.got >= 1 && inBreak(d), () => {
      this.play('vending_drop', meta.vending, { gain: 1.2 });
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12), M.ledRed);
      can.rotation.z = Math.PI / 2;
      const p = this.player.pos;
      const to = [THREE.MathUtils.clamp(p.x - 0.8, 5.5, 13), 0.033, THREE.MathUtils.clamp(p.z, 31, 41)];
      const holder = new THREE.Group();
      holder.add(can);
      world.dynamic.add(holder);
      const r = kit.roller(holder, [[5.1, 0.033, 36.6], to], { speed: 0.9, sound: 'can_roll', gain: 1, radius: 0.033, face: true });
      kit.after(0.7, () => r.start());
    }, { delay: 2 });

    // the water cooler swallows when you aren't looking at it
    kit.trigger((d) => d.near(meta.cooler.x, meta.cooler.z, 7) && !d.onScreen(meta.cooler) && Math.random() < 0.0008, () => this.play('water_cooler', meta.cooler, { gain: 1 }), { repeat: true });

    // after the first fuse, the office lights start going out behind you
    kit.trigger((d) => d.got >= 1 && d.zone() === 'o', () => { this.blackout = true; this.play('lights_off', this.player.pos, { gain: 0.8 }); });
    // and something tall is standing at the end of the aisle, once
    kit.trigger((d) => d.got >= 1 && d.inRect(28, 40, 30, 38) && !d.monster, () => {
      const m = this.spawn('occupant', 54.5, 34.2);
      m.kind = 'watcher';
      m.close = 12;
      m.linger = 0.7;
    });

    // the second elevator has somewhere to be
    kit.trigger((d) => d.zone() === 'l', () => {
      this.seenLobby = true;
      if (this.got === undefined) this.setObjective('the elevator. call it');
      const e = meta.elevators[1];
      kit.after(3, () => this.openElevator(e));
      kit.after(7.5, () => this.closeElevator(e));
      this.loopAt('clock', meta.clock, { gain: 0.5, ref: 1.5 });
    });

    // a chair follows you through the yellow, one look-away at a time
    kit.unseen(meta.stray, Array.from({ length: 60 }, () => (d) => {
      const p = d.player.pos, s = meta.stray.position;
      const dist = Math.hypot(p.x - s.x, p.z - s.z);
      if (dist < 4) return null;
      const step = Math.min(dist - 3, 2.2 + Math.random() * 1.6);
      const x = s.x + (p.x - s.x) / dist * step, z = s.z + (p.z - s.z) / dist * step;
      if (d.blocked(x, z, 0.4) || world.zoneAt(x, z) !== 'y') return null;
      return { p: [x, 0, z], r: Math.atan2(p.x - x, p.z - z) + (Math.random() - 0.5) * 0.6 };
    }), { wait: 2.5, minDist: 5, sound: 'chair_creak', gain: 0.7, loop: true, active: () => this.zone() === 'y' });

    // the floating chair drifts across the flood
    const f = meta.floater;
    f.rotation.z = 0.25;
    const drift = kit.roller(f, [[66, 0.06, 62], [80, 0.06, 70], [92, 0.06, 66], [100, 0.06, 78], [70, 0.06, 78], [66, 0.06, 62]], { speed: 0.25 });
    drift.start();
    drift.onEnd = () => { drift.done = false; drift.seg = 0; drift.u = 0; drift.start(); };

    // the dark: a phone on the far wall when you take its fuse
    this.loopAt('server_hum', meta.serverPos, { gain: 0.7, ref: 2 });
    this.onFuse = (key) => {
      if (key === 'f2') { this.met = true; this.cooldown = 0; this.spawnTimer = 3; }
      if (key === 'f4') kit.after(1.5, () => this.play('phone_ring', { x: 106, y: 1, z: 79 }, { gain: 1.2 }));
    };
  }

  script(dt) {
    const { meta, world, player } = this;
    const zone = this.zone();
    this.calm = { b: 0.1, o: 0.12, l: 0.1, e: 0.08, y: 0.16, w: 0.2, k: 0.32, m: 0.22 }[zone] ?? 0.15;

    // lights going out behind you in the office
    if (this.blackout && !this.power) {
      this.blackT = (this.blackT ?? 0) - dt;
      if (this.blackT <= 0) {
        this.blackT = 0.5 + Math.random() * 0.7;
        const on = meta.officeLamps.filter((l) => l.anchor.on);
        if (on.length > meta.officeLamps.length * 0.45) {
          const behind = on.filter((l) => {
            const dx = l.x - player.pos.x, dz = l.z - player.pos.z;
            return Math.hypot(dx, dz) > 6 && dx * player.forward.x + dz * player.forward.z < 0;
          });
          const l = behind[Math.floor(Math.random() * behind.length)];
          if (l) { setLamp(this.ctx, l, false); if (Math.random() < 0.4) this.play('light_flicker', { x: l.x, y: 2.8, z: l.z }, { gain: 0.6 }); }
        }
      }
    }

    // server lights
    if (Math.random() < dt * 8) { const led = meta.leds[Math.floor(Math.random() * meta.leds.length)]; led.visible = !led.visible; }

    // elevator doors slide
    for (const e of meta.elevators) {
      e.open += (e.target - e.open) * (1 - Math.exp(-dt * 2.2));
      e.panels[0].position.x = e.x0 + 0.5 - e.open * 0.95;
      e.panels[1].position.x = e.x0 + 1.5 + e.open * 0.95;
    }

    // the end: step into the car and it takes you down
    const car = meta.elevators[0];
    if (this.power && this.leaving === undefined && car.open > 0.9 && this.inRect(30.2, 31.8, 86.3, 87.8)) {
      this.leaving = 0;
      this.holdFade = true;
      this.setObjective(null);
      // it's standing in the lobby, watching you go
      const m = this.spawn('occupant', 31, 77.5);
      m.kind = 'statue';
    }
    if (this.leaving !== undefined) {
      // the doors wait until you turn around to see it
      if (!this.closing && (player.forward.z < -0.6 || this.leaving > 6)) {
        this.closing = true;
        this.closeAt = this.leaving;
        this.kit.after(1.4, () => this.closeElevator(car));
        this.kit.after(3.8, () => this.loopAt('elevator_move', { x: 31, y: 1.5, z: 87 }, { gain: 1.2, hrtf: false }));
      }
      this.leaving += dt;
      if (this.monster?.kind === 'statue') {
        const r = this.monster.rig;
        r.root.position.copy(this.monster.pos);
        r.root.rotation.y = Math.atan2(player.pos.x - this.monster.pos.x, player.pos.z - this.monster.pos.z);
        r.update(dt, this.t, this.camera.position, 1);
      }
      const since = this.closing ? this.leaving - this.closeAt : 0;
      if (since > 4.5) this.fx.fade = Math.min(1, (since - 4.5) / 3);
      if (since > 8 && !this.finished) this.finished = true;
      return;
    }

    // the tall one, in the yellow and the places past it
    if (this.monster || !this.met) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 7;
    if (!['y', 'w', 'k'].includes(zone)) return;
    if (Math.random() > (zone === 'k' ? 0.6 : 0.35)) return;
    const m = this.spawnAway('occupant', 13, 20, { leash: 45, giveUp: 80 });
    if (m) this.cooldown = 50 + Math.random() * 40;
  }

  updateMonster(dt) {
    if (this.monster?.kind === 'statue') return;
    super.updateMonster(dt);
  }

  rewound() { this.cooldown = 40; }
}

export const TAPE1 = {
  id: 't1',
  number: '01',
  title: 'OVERTIME',
  blurb: 'an office at 2:13 am. the elevator needs four fuses.',
  sounds: SOUNDS,
  level: { id: 't1', zones: ZONES, spawn: { pos: [9, 0, 39.5], yaw: -0.93, zone: 'b' }, build },
  Director: Overtime,
};
