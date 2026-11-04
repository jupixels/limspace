import * as THREE from 'three';
import { TapeDirector } from './base.js';
import { canvasTex, clockTexture } from './materials.js';
import { createOccupant } from '../creatures.js';

// TAPE 03: RECESS
// A birthday party in a field that goes on too far, ringed by hills you never reach.
// Nobody came. Five invitations, a red balloon that knows the way, and a
// staircase up into the sky to a classroom with your name on a desk.

const ZONES = {
  m: { name: 'meadow', indoor: false, floor: 'grass', fog: [0xf0dcd6, 0.011], hemi: 1.15, ambient: 1.0, bloom: [0.3, 0.92], reverb: [0, 0.02], ambience: ['meadow_wind', 0.5] },
  h: { name: 'house', floor: 'wood', fog: [0x6a5a54, 0.02], hemi: 0.7, ambient: 0.6, bloom: [0.45, 0.85], reverb: [0.05, 0.3], ambience: ['clock', 0.25] },
  s: { name: 'classroom', floor: 'wood', fog: [0xeee6d6, 0.02], hemi: 0.7, ambient: 0.9, bloom: [0.35, 0.9], reverb: [0.05, 0.35], ambience: ['meadow_wind', 0.12] },
};

const SOUNDS = [
  'meadow_wind', 'ball_bump', 'kids_laugh', 'swing_creak', 'mgr_creak', 'party_horn', 'birthday_box', 'surprise_far', 'wind_chimes',
  'sprinkler', 'chalk_write', 'balloon_squeak', 'children_far', 'dream_door',
  't3_memo1', 't3_memo2', 't3_memo3', 't3_memo4', 't3_memo5', 't3_memo6', 't3_memo7', 't3_memo8',
];

const MEMOS = [
  'okay, is it recording? happy birthday, sweetheart! seven years old. everyone\'s going to be here at three.',
  'it\'s three thirty. they\'re just running late. that\'s okay. more cake for us, right?',
  'look at the balloon go. hold on to it, don\'t let go... oh. there it goes. it\'s okay. it knows where it\'s going.',
  'someone\'s standing at the edge of the field. tall. wearing a party hat. is that one of the dads? why aren\'t they coming closer?',
  'they only move when we\'re not looking. every time i turn the camera away, they\'re closer to the house.',
  'the doors weren\'t in the field yesterday. one of them was open this morning. i could hear the ocean behind it.',
  'i found the stairs. they go all the way up into the sky. there\'s a classroom at the top. your name is on one of the desks.',
  'if you\'re watching this, the party\'s over. you can go home now. just don\'t let them see you leave.',
];

const INVITES = [
  'you\'re invited! when: now. where: here.',
  'you\'re invited! please don\'t be late. we\'ve been waiting.',
  'you\'re invited! bring nothing. stay as long as you like.',
  'you\'re invited! everyone will be there. everyone is already there.',
  'you\'re invited! the party starts when you get here.',
];

// ---------- the ground ----------
// flat places for the things that need them: [x1, x2, z1, z2, height, blend]
const FLATS = [
  [92, 108, 162, 178, 0, 8], [44, 78, 136, 166, 0, 10], [36, 66, 46, 80, 0, 10], [132, 170, 94, 128, 0, 10],
  [154, 166, -10, 66, 0, 6], [280, 330, -20, 30, 0, 5],
];
function terrain(x, z) {
  let h = 1.8 * Math.sin(x * 0.05 + 1) * Math.cos(z * 0.04) + 1.2 * Math.sin((x - z) * 0.035) + 0.6 * Math.cos(z * 0.11 + x * 0.03);
  h += 6 * Math.exp(-((x - 110) ** 2 + (z - 100) ** 2) / 260); // the hill with the tree on it
  h += 4.5 * Math.exp(-((x - 84) ** 2 + (z - 172) ** 2) / 200); // the hill the ball comes down
  const edge = Math.min(x, z, 200 - x, 200 - z);
  if (x < 250) h += Math.min(28, Math.max(0, 16 - edge) ** 1.5 * 0.1); // the land rises into hills all round
  for (const [x1, x2, z1, z2, t, b] of FLATS) {
    const dx = Math.max(x1 - x, 0, x - x2), dz = Math.max(z1 - z, 0, z - z2);
    const k = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 0, b);
    h = t + (h - t) * k;
  }
  // the pond
  const dp = Math.hypot(x - 95, z - 128);
  h = THREE.MathUtils.lerp(-1.2, h, THREE.MathUtils.smoothstep(dp, 4, 9));
  return h;
}
const T = terrain;

// ---------- painted things ----------
const checkerTexture = (a, b) => canvasTex(64, 64, (g) => {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 16, j * 16, 16, 16); }
});

const stripeTexture = (a, b) => canvasTex(64, 64, (g) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 8, 0, 8, 64); }
});

const bannerTexture = () => canvasTex(512, 96, (g, w, h) => {
  g.fillStyle = '#f7e6ee';
  g.fillRect(0, 0, w, h);
  const cols = ['#f28aa8', '#8ac4f2', '#f2d26a', '#9ae0b0'];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 22); g.fill(); }
  g.font = 'bold 40px Georgia';
  g.textAlign = 'center';
  g.fillStyle = '#d0587e';
  g.fillText('HAPPY BIRTHDAY  ________', w / 2, 70);
}, { repeat: false });

const boardTexture = (text) => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#25392e';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 60, 3);
  if (text) {
    g.font = '42px "Comic Sans MS", cursive';
    g.textAlign = 'center';
    g.fillStyle = '#e8ece4';
    g.fillText(text, w / 2, h / 2 + 12);
  }
}, { repeat: false });

// ---------- props ----------
function recorder(c, x, y, z, rot, key, n) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.064), c.M.plastic);
  g.add(shell);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.03).rotateX(-Math.PI / 2), c.level.mats.label);
  label.position.y = 0.009;
  g.add(label);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), c.M.ledRed);
  led.position.set(0.04, 0.012, 0.02);
  g.add(led);
  g.position.set(x, y + 0.008, z);
  g.rotation.y = rot;
  c.mesh(g);
  return c.item('recording', x, y + 0.03, z, { key, mesh: g, led, voice: `t3_memo${n}`, text: MEMOS[n - 1], seconds: 10, reach: 2.2, cos: 0.75 });
}

function invite(c, x, y, z, rot, n) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.008, 0.17), c.level.mats.envelope));
  const seal = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12).rotateX(-Math.PI / 2), c.M.ledRed);
  seal.position.y = 0.006;
  g.add(seal);
  g.position.set(x, y + 0.006, z);
  g.rotation.y = rot;
  c.mesh(g);
  const glow = c.light(x, y + 0.5, z, { color: 0xffc0d8, intensity: 0.8, distance: 3 });
  return c.item('invite', x, y + 0.03, z, { key: `i${n}`, mesh: g, glow, text: INVITES[n - 1], prompt: '[E] take the invitation', reach: 2.4, cos: 0.7 });
}

function lamppost(c, x, z) {
  const y = T(x, z), M = c.M;
  c.box(x - 0.06, x + 0.06, y, y + 3.4, z - 0.06, z + 0.06, M.dreamMetal, true);
  c.box(x - 0.2, x + 0.2, y + 3.4, y + 3.5, z - 0.2, z + 0.2, M.dreamMetal);
  c.box(x - 0.14, x + 0.14, y + 3.15, y + 3.4, z - 0.14, z + 0.14, M.tapeGlow);
}

function tree(c, x, z, r = 2.2, color) {
  const y = T(x, z);
  c.cyl(x, z, 0.18, 0.26, y, y + 2.6, c.level.mats.bark, 10, true);
  c.sphere(x, y + 2.6 + r * 0.7, z, r, color);
  c.sphere(x + r * 0.5, y + 2.4 + r * 0.5, z + r * 0.2, r * 0.6, color);
  c.sphere(x - r * 0.5, y + 2.5 + r * 0.4, z - r * 0.3, r * 0.6, color);
}

function cloud(c, x, y, z, s) {
  for (const [dx, dy, dz, r] of [[0, 0, 0, 1], [1.1, -0.2, 0.3, 0.75], [-1.1, -0.2, -0.2, 0.8], [0.4, 0.5, -0.4, 0.7], [-0.5, 0.3, 0.5, 0.65]]) c.sphere(x + dx * s, y + dy * s, z + dz * s, r * s, c.M.dreamWhite);
}

// a door in a frame, standing on its own; returns its leaf so it can swing
function door(c, x, z, color, solid = true, atY = null) {
  const M = c.M, y = atY ?? T(x, z);
  c.box(x - 0.62, x - 0.5, y, y + 2.3, z - 0.06, z + 0.06, M.dreamWhite, true);
  c.box(x + 0.5, x + 0.62, y, y + 2.3, z - 0.06, z + 0.06, M.dreamWhite, true);
  c.box(x - 0.62, x + 0.62, y + 2.2, y + 2.32, z - 0.06, z + 0.06, M.dreamWhite);
  const hinge = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.18, 0.05), color);
  leaf.position.set(0.5, 1.09, 0);
  hinge.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), c.M.metal);
  knob.position.set(0.88, 1.0, 0.05);
  hinge.add(knob);
  hinge.position.set(x - 0.5, y, z);
  c.mesh(hinge);
  const block = solid ? c.collide(x - 0.5, x + 0.5, z - 0.04, z + 0.04, y, y + 2.2) : null;
  return { hinge, block, x, z, y, open: 0, target: 0 };
}

// a staircase going one way along z: height y1 at z1, y2 at z2
function stairs(c, x1, x2, z1, z2, y1, y2, mat) {
  const n = Math.max(2, Math.round(Math.abs(y2 - y1) / 0.25));
  c.ramp(x1, x2, z1, z2, y1, y2, 'z');
  for (let i = 0; i < n; i++) {
    const za = z1 + (z2 - z1) * i / n, zb = z1 + (z2 - z1) * (i + 1) / n;
    const top = Math.max(y1 + (y2 - y1) * i / n, y1 + (y2 - y1) * (i + 1) / n);
    c.box(x1, x2, -0.5, top, za, zb, mat);
    if (top > 0.7) c.collide(x1, x2, za, zb, -0.5, top - 0.35);
  }
}

// ---------- the place ----------
function build(c, L) {
  const M = c.M;
  const mats = L.mats = {
    bark: new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.9 }),
    siding: new THREE.MeshStandardMaterial({ color: 0xcfe8dc, roughness: 0.7 }),
    paper: Object.assign(M.mlWall.clone(), { color: new THREE.Color(0xf2d8e0), envFrom: M.mlWall }),
    roof: new THREE.MeshStandardMaterial({ color: 0xb87a78, roughness: 0.8, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 0.6, emissive: 0x77736c }),
    red: new THREE.MeshStandardMaterial({ color: 0xe0404a, roughness: 0.4 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2d24a, roughness: 0.5 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x7ab0e8, roughness: 0.5 }),
    mint: new THREE.MeshStandardMaterial({ color: 0x9ae0c0, roughness: 0.5 }),
    pinkS: new THREE.MeshStandardMaterial({ color: 0xf2a8c0, roughness: 0.5 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xe8d6a8, roughness: 1 }),
    blanket: new THREE.MeshStandardMaterial({ map: checkerTexture('#e05a5a', '#f4efe6'), roughness: 0.9 }),
    hat: new THREE.MeshBasicMaterial({ map: stripeTexture('#f28aa8', '#8ac4f2') }),
    banner: new THREE.MeshBasicMaterial({ map: bannerTexture(), color: 0xdddddd }),
    envelope: new THREE.MeshStandardMaterial({ color: 0xf8c8d8, roughness: 0.6, emissive: 0x402030 }),
    label: new THREE.MeshBasicMaterial({ color: 0xf4efe0 }),
    board: new THREE.MeshBasicMaterial({ map: boardTexture(''), color: 0xbbbbbb }),
    boardText: new THREE.MeshBasicMaterial({ map: boardTexture('you can go home now'), color: 0xcccccc }),
    window: new THREE.MeshBasicMaterial({ map: M.sky.map }),
    clock: new THREE.MeshBasicMaterial({ map: clockTexture(3, 30), color: 0xcfcac0 }),
    cake: new THREE.MeshStandardMaterial({ color: 0xfbe8f0, roughness: 0.6 }),
    ceiling: new THREE.MeshBasicMaterial({ color: 0xd6ccc4 }),
  };
  const meta = L.meta = { swings: [], doors: [], lamps: [], invites: [] };
  mats.window.map = M.sky.map;

  // the ground, the grass, and the hills all round
  c.ground(-60, 260, -60, 260, M.grass, 32, 2);
  const blocked = (x, z) => (x > 43 && x < 57 && z > 55 && z < 67) || Math.hypot(x - 95, z - 128) < 7 || (x > 157 && x < 163 && z < 61);
  c.blades(0, 200, 0, 200, 16000, blocked);
  // the field ends where the hills get too steep: an edge you can feel but not see
  for (const [x1, x2, z1, z2] of [[-3, 2, -3, 203], [198, 203, -3, 203], [-3, 203, -3, 2], [-3, 203, 198, 203]]) c.collide(x1, x2, z1, z2, -5, 80);

  // where you wake up: a picnic blanket, an empty basket, a lamppost
  c.box(97.5, 101.5, 0, 0.02, 167.5, 170.5, mats.blanket);
  c.box(100.3, 101.1, 0.02, 0.4, 168, 168.6, M.dreamWood, true);
  lamppost(c, 104, 166);
  recorder(c, 98.6, 0.02, 169.6, 0.5, 'r1', 1);

  playground(c, meta, mats);
  house(c, meta, mats);
  doorsField(c, meta, mats);
  skyStairs(c, meta, mats);
  classroom(c, meta, mats);

  // the hill with the tree, the pond, the television in the grass
  tree(c, 110, 100, 2.6, M.dreamPink);
  meta.invites.push(invite(c, 111.4, T(111.4, 101.2), 101.2, 0.6, 3));
  c.water(88, 102, 121, 135, -0.3, -1.2, false);
  c.box(94.4, 95.6, 0.05, 0.15, 119, 126.5, M.dreamWood);
  c.platform(94.4, 95.6, 119, 126.5, 0.15, false);
  for (const z of [121, 124, 126.4]) for (const x of [94.5, 95.5]) c.box(x - 0.06, x + 0.06, -1.2, 0.05, z - 0.06, z + 0.06, M.dreamWood);
  meta.invites.push(invite(c, 95, 0.15, 126, 1.2, 4));
  c.box(98, 100.4, -0.35, -0.15, 129, 130.2, M.dreamWood);
  meta.tv = { pos: new THREE.Vector3(130, T(130, 160) + 0.3, 160) };
  const ty = T(130, 160);
  c.box(129.6, 130.4, ty, ty + 0.6, 159.6, 160.3, M.plastic, true);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), M.screenOff);
  screen.position.set(130, ty + 0.32, 159.58);
  screen.rotation.y = Math.PI;
  c.mesh(screen);
  meta.tv.screen = screen;
  recorder(c, 130, ty + 0.6, 160, 0.3, 'r4', 4);
  for (const [x, z] of [[70, 110], [126, 64], [176, 150], [30, 120]]) lamppost(c, x, z);
  for (const [x, z, r, col] of [[24, 30, 2.4, M.dreamPink], [180, 182, 2, M.dreamWhite], [20, 176, 2.6, M.dreamPink], [186, 70, 2.2, M.dreamWhite], [76, 96, 1.8, M.dreamPink]]) tree(c, x, z, r, col);
  // clouds hanging low around the top of the stairs, and far out over the field
  for (const [x, y, z, s] of [[150, 24, 14, 3], [172, 27, 26, 3.6], [146, 30, 34, 2.6], [168, 21, 4, 2.4], [160, 33, 18, 4], [60, 38, 40, 5], [120, 42, 150, 6], [30, 36, 100, 4.5], [180, 40, 120, 5]]) cloud(c, x, y, z, s);
  // the ball on the hill
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mats.red);
  ball.position.set(84, T(84, 172) + 0.28, 172);
  c.mesh(ball);
  meta.ball = ball;
}

function playground(c, meta, mats) {
  const M = c.M;
  // swings: three seats on chains, one of them never quite still
  for (const x of [47, 57]) for (const dz of [-1, 1]) {
    c.quad([x - 0.05, 0, 146 + dz * 1.1], [x + 0.05, 0, 146 + dz * 1.1], [x + 0.05, 2.5, 146], [x - 0.05, 2.5, 146], M.dreamMetal, [0, 0, dz]);
    c.collide(x - 0.1, x + 0.1, 146 + dz * 1.1 - 0.1, 146 + dz * 1.1 + 0.1, 0, 2.4);
  }
  c.box(47, 57, 2.45, 2.55, 145.95, 146.05, M.dreamMetal);
  for (const x of [49.5, 52, 54.5]) {
    const pivot = new THREE.Group();
    for (const s of [-0.22, 0.22]) {
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.015, 1.95, 0.015), M.dreamMetal);
      chain.position.set(s, -0.98, 0);
      pivot.add(chain);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.2), M.dreamPink);
    seat.position.y = -1.96;
    pivot.add(seat);
    pivot.position.set(x, 2.45, 146);
    c.mesh(pivot);
    meta.swings.push({ pivot, amp: 0, phase: Math.random() * 6 });
  }
  // the slide, with the first invitation at the bottom
  c.box(63.4, 64.6, 0, 1.6, 141.6, 142.8, mats.yellow, true);
  c.box(63.4, 64.6, 1.6, 1.7, 141.6, 142.8, M.dreamWhite);
  c.quad([63.5, 1.6, 142.8], [64.5, 1.6, 142.8], [64.5, 0.25, 147.5], [63.5, 0.25, 147.5], mats.blue);
  c.quad([63.5, 0.25, 147.5], [64.5, 0.25, 147.5], [64.5, 0.2, 148.3], [63.5, 0.2, 148.3], mats.blue);
  c.collide(63.4, 64.6, 142.8, 147.5, 0, 0.9);
  for (let y = 0.3; y < 1.6; y += 0.3) c.box(63.5, 64.5, y, y + 0.04, 141.4, 141.6, M.dreamMetal);
  meta.invites.push(invite(c, 64, 0, 149.1, 0.2, 1));
  // the merry-go-round turns while you aren't looking
  const mgr = new THREE.Group();
  mgr.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 24), mats.mint));
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), M.dreamMetal);
    bar.position.set(Math.cos(i * Math.PI / 2) * 1.3, 0.45, Math.sin(i * Math.PI / 2) * 1.3);
    mgr.add(bar);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.84), M.dreamMetal);
    const phi = i * Math.PI / 2 + Math.PI / 4;
    rail.position.set(Math.cos(phi) * 0.92, 0.85, Math.sin(phi) * 0.92);
    rail.rotation.y = -phi;
    mgr.add(rail);
  }
  mgr.position.set(57, 0.25, 157);
  c.mesh(mgr);
  c.collide(55.6, 58.4, 155.6, 158.4, 0, 0.5);
  c.cyl(57, 157, 0.12, 0.12, 0, 0.25, M.dreamMetal, 8);
  meta.mgr = { obj: mgr, speed: 0 };
  // the see-saw tips one way, then the other
  c.box(67.85, 68.15, 0, 0.5, 155.8, 156.2, M.dreamMetal, true);
  const saw = new THREE.Group();
  const plank = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.3), mats.pinkS);
  saw.add(plank);
  for (const s of [-1.6, 1.6]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.3), M.dreamMetal); h.position.set(s * 0.85, 0.15, 0); saw.add(h); }
  saw.position.set(68, 0.52, 156);
  saw.rotation.z = 0.25;
  c.mesh(saw);
  meta.saw = saw;
  // the sandbox, with a bucket and a tape in it
  c.box(70, 73.4, 0, 0.25, 146, 146.15, M.dreamWood, true);
  c.box(70, 73.4, 0, 0.25, 149.25, 149.4, M.dreamWood, true);
  c.box(70, 70.15, 0, 0.25, 146, 149.4, M.dreamWood, true);
  c.box(73.25, 73.4, 0, 0.25, 146, 149.4, M.dreamWood, true);
  c.box(70.15, 73.25, 0, 0.14, 146.15, 149.25, mats.sand);
  c.cyl(71.2, 147.2, 0.14, 0.1, 0.14, 0.38, mats.red, 12);
  recorder(c, 72.4, 0.14, 148.4, 1.4, 'r3', 3);
  lamppost(c, 60, 136);
}

function house(c, meta, mats) {
  const M = c.M;
  const H = 2.7;
  // walls: siding outside, wallpaper in. [x1, x2, z1, z2] runs, leaving doorways and windows
  const wall = (x1, x2, z1, z2, y1 = 0, y2 = H) => {
    const alongX = x2 - x1 > z2 - z1;
    if (alongX) { c.box(x1, x2, y1, y2, z1, z1 + 0.08, mats.siding, true); c.box(x1, x2, y1, y2, z1 + 0.08, z2, mats.paper, true); }
    else { c.box(x1, x1 + 0.08, y1, y2, z1, z2, mats.siding, true); c.box(x1 + 0.08, x2, y1, y2, z1, z2, mats.paper, true); }
  };
  const inner = (x1, x2, z1, z2, y1 = 0, y2 = H) => c.box(x1, x2, y1, y2, z1, z2, mats.paper, true);
  // the outside: north, west, east, and south with a door and a window
  wall(44, 56, 55.84, 56);
  wall(43.84, 44, 56, 66);
  c.box(56, 56.16, 0, H, 56, 66, mats.paper, true);
  c.box(56.08, 56.16, 0, H, 56, 66, mats.siding);
  const south = (x1, x2, y1 = 0, y2 = H) => { c.box(x1, x2, y1, y2, 66, 66.08, mats.paper, true); c.box(x1, x2, y1, y2, 66.08, 66.16, mats.siding, true); };
  south(44, 47);
  south(48.2, 49.5);
  south(49.5, 51.5, 0, 1.0);
  south(49.5, 51.5, 2.1, H);
  south(51.5, 56);
  south(47, 48.2, 2.15, H);
  c.box(49.5, 51.5, 1.0, 2.1, 66.06, 66.1, M.glass);
  // the inside: living room to the west, kitchen and bedroom to the east
  inner(51.92, 52.08, 56, 59);
  inner(51.92, 52.08, 60.2, 66);
  inner(51.92, 52.08, 59, 60.2, 2.15, H);
  inner(52, 53.5, 60.92, 61.08);
  inner(54.7, 56, 60.92, 61.08);
  inner(53.5, 54.7, 60.92, 61.08, 2.15, H);
  c.box(44, 56, -0.06, 0.02, 56, 66, M.lbWood);
  c.box(44, 56, H, H + 0.1, 56, 66, mats.ceiling);
  c.zone(44, 56, 56, 66, 'h');
  // the roof: a plain gable
  c.quad([43.4, H, 66.6], [56.6, H, 66.6], [56.6, 4.3, 61], [43.4, 4.3, 61], mats.roof, [0, 1, 1]);
  c.quad([43.4, H, 55.4], [43.4, 4.3, 61], [56.6, 4.3, 61], [56.6, H, 55.4], mats.roof, [0, 1, -1]);
  c.quad([44, H, 56], [44, 4.3, 61], [44, 4.3, 61], [44, H, 66], mats.roof, [-1, 0, 0]);
  c.quad([56.16, H, 56], [56.16, H, 66], [56.16, 4.3, 61], [56.16, 4.3, 61], mats.roof, [1, 0, 0]);
  // the porch, the yard, the fence
  c.box(46, 49.2, 0, 0.12, 66.16, 67.6, M.dreamWood);
  c.box(46.1, 46.25, 0, 2.6, 67.4, 67.55, M.dreamWhite, true);
  c.box(48.95, 49.1, 0, 2.6, 67.4, 67.55, M.dreamWhite, true);
  c.box(46, 49.2, 2.6, 2.7, 66.16, 67.6, M.dreamWhite);
  meta.chimes = new THREE.Vector3(47.6, 2.3, 67.4);
  for (let x = 38; x <= 62; x += 0.5) {
    if (x > 46 && x < 49.5) continue;
    c.box(x - 0.04, x + 0.04, 0, 0.9, 79.96, 80.04, M.dreamWhite);
  }
  c.box(38, 46, 0.6, 0.66, 79.94, 80.06, M.dreamWhite);
  c.box(49.5, 62, 0.6, 0.66, 79.94, 80.06, M.dreamWhite);
  c.collide(38, 46, 79.9, 80.1, 0, 1);
  c.collide(49.5, 62, 79.9, 80.1, 0, 1);
  meta.sprinkler = new THREE.Vector3(53, 0.2, 73);
  c.cyl(53, 73, 0.05, 0.08, 0, 0.18, M.dreamMetal, 8);
  // the party: a table set for guests who never came
  c.box(46.6, 49.4, 0.74, 0.79, 60.4, 61.6, M.dreamWood, true);
  for (const [x, z] of [[46.7, 60.5], [49.3, 60.5], [46.7, 61.5], [49.3, 61.5]]) c.box(x - 0.04, x + 0.04, 0, 0.74, z - 0.04, z + 0.04, M.dreamWood);
  c.box(46.6, 49.4, 0.79, 0.8, 60.4, 61.6, mats.white);
  c.cyl(48, 61, 0.3, 0.3, 0.8, 0.98, mats.cake, 20);
  c.cyl(48, 61, 0.22, 0.22, 0.98, 1.12, mats.pinkS, 20);
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; c.cyl(48 + Math.cos(a) * 0.14, 61 + Math.sin(a) * 0.14, 0.008, 0.008, 1.12, 1.2, mats.blue, 4); }
  const seats = [[46.9, 59.8, 0], [48, 59.8, 0], [49.1, 59.8, 0], [46.9, 62.2, 2], [48, 62.2, 2], [49.1, 62.2, 2]];
  for (const [x, z, q] of seats) {
    c.box(x - 0.22, x + 0.22, 0.44, 0.48, z - 0.22, z + 0.22, M.dreamWood, true);
    const bz = q ? z + 0.2 : z - 0.2;
    c.box(x - 0.22, x + 0.22, 0.48, 0.95, bz - 0.03, bz + 0.03, M.dreamWood);
    for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) c.box(x + dx - 0.02, x + dx + 0.02, 0, 0.44, z + dz - 0.02, z + dz + 0.02, M.dreamWood);
    // a hat at every place, and a balloon tied to every chair
    const hz = q ? z - 0.5 : z + 0.5;
    const hat = new THREE.ConeGeometry(0.07, 0.18, 12);
    hat.translate(x, 0.89, hz);
    c.add(hat, mats.hat);
    const col = [mats.red, mats.blue, mats.yellow, mats.mint, mats.pinkS][Math.floor(x * 7 + z) % 5];
    c.sphere(x, 2.1, bz, 0.22, col);
    c.box(x - 0.004, x + 0.004, 0.95, 1.88, bz - 0.004, bz + 0.004, mats.white);
  }
  meta.invites.push(invite(c, 47.2, 0.8, 61.25, 0.3, 2));
  c.plane(48, 2.1, 56.1, 3.4, 0.64, 's', mats.banner, 0.01);
  for (let i = 0; i < 5; i++) c.box(44.6 + i * 0.5, 45.0 + i * 0.5, 0, 0.3 + (i % 3) * 0.1, 64.2, 64.6, [mats.red, mats.blue, mats.yellow, mats.mint, mats.pinkS][i]);
  // a sofa and a television
  c.box(44.2, 45.1, 0, 0.45, 57, 59.4, mats.blue, true);
  c.box(44.2, 44.5, 0.45, 0.95, 57, 59.4, mats.blue);
  c.box(50.8, 51.8, 0, 0.5, 56.2, 56.8, M.dreamWood, true);
  c.box(50.9, 51.7, 0.5, 1.1, 56.25, 56.75, M.plastic);
  c.plane(51.3, 0.8, 56.76, 0.6, 0.44, 's', c.tvStatic);
  recorder(c, 44.8, 0.45, 58.6, 1.0, 'r2', 2);
  // the kitchen
  c.box(52.1, 55.9, 0, 0.9, 56.1, 56.7, mats.white, true);
  c.box(52.1, 55.9, 0.9, 0.95, 56.1, 56.75, mats.mint);
  c.box(55, 55.9, 0, 1.9, 57, 57.9, mats.white, true);
  c.plane(53, 1.9, 56.12, 0.4, 0.4, 's', mats.clock);
  // the bedroom: stars on the blanket, a music box on the shelf
  c.box(53.6, 55.8, 0, 0.5, 63.4, 65.8, mats.white, true);
  c.box(53.6, 55.8, 0.5, 0.56, 63.4, 65.8, mats.hat);
  c.box(53.6, 55.8, 0.56, 0.68, 65.4, 65.8, mats.white);
  c.box(52.2, 52.6, 0, 1.4, 61.4, 63, M.dreamWood, true);
  c.box(52.3, 52.6, 1.05, 1.22, 62, 62.3, mats.pinkS);
  meta.musicBox = new THREE.Vector3(52.45, 1.15, 62.15);
  recorder(c, 52.4, 1.4, 61.8, 0.2, 'r5', 5);
  // lamps
  for (const [x, z] of [[48, 61], [54, 58.5], [54, 63.5]]) {
    c.sphere(x, H - 0.12, z, 0.16, M.tapeGlow);
    meta.lamps.push(c.light(x, H - 0.4, z, { color: 0xffd8b0, intensity: 3.2, distance: 9 }));
  }
}

function doorsField(c, meta, mats) {
  const M = c.M;
  const cols = [mats.pinkS, mats.blue, mats.yellow, mats.mint, M.dreamWood];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const x = 137 + i * 7 + (j % 2) * 1.5, z = 99 + j * 8;
      const special = i === 2 && j === 1;
      const d = door(c, x, z, cols[(i * 3 + j) % 5], true);
      d.special = special;
      meta.doors.push(d);
      if (!special) c.item('door', x + 0.3, d.y + 1.1, z + 0.4, { door: d, prompt: '[E] open', reach: 2.2, cos: 0.6 });
    }
  }
  recorder(c, 136.3, 0, 99.6, 0.4, 'r6', 6);
  meta.invites.push(invite(c, 166.6, 0, 123.8, 2.4, 5));
}

function skyStairs(c, meta, mats) {
  // white stairs straight up into the sky, with nothing to hold on to
  stairs(c, 158.75, 161.25, 10, 60, 25, 0, mats.white);
  c.box(157.5, 162.5, 24.8, 25, 3, 10, mats.white);
  c.platform(157.5, 162.5, 3, 10, 25, false);
  meta.skyDoor = door(c, 160, 4.5, mats.white, true, 25);
  meta.skyDoorItem = c.item('skydoor', 160, 26.1, 4.9, { prompt: '[E] open the door', reach: 2.2, cos: 0.6 });
  recorder(c, 160.9, 12.5, 35, 0.2, 'r7', 7);
  recorder(c, 158.4, 25, 8.4, 1.0, 'r8', 8);
}

function classroom(c, meta, mats) {
  const M = c.M;
  const x0 = 300, x1 = 312, z0 = 0, z1 = 10, H = 3;
  c.box(x0, x1, -0.06, 0.02, z0, z1, M.lbWood);
  c.box(x0, x1, H, H + 0.1, z0, z1, mats.ceiling);
  c.box(x0 - 0.15, x0, 0, H, z0, z1, mats.paper, true);
  c.box(x1, x1 + 0.15, 0, H, z0, z1, mats.paper, true);
  c.box(x0, x1, 0, H, z0 - 0.15, z0, mats.paper, true);
  c.box(x0, x1, 0, H, z1, z1 + 0.15, mats.paper, true);
  c.zone(x0, x1, z0, z1, 's');
  // windows full of sky
  for (const z of [2.5, 5, 7.5]) {
    c.plane(x1 - 0.01, 1.7, z, 1.6, 1.4, 'w', mats.window, 0);
    c.box(x1 - 0.05, x1, 0.98, 1.02, z - 0.85, z + 0.85, mats.white);
  }
  // the board, the teacher's desk, the clock
  meta.board = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), mats.board);
  meta.board.position.set(306, 1.7, z0 + 0.02);
  c.mesh(meta.board);
  c.box(305, 307.4, 0, 0.78, 1.4, 2.2, M.dreamWood, true);
  c.plane(310, 2.5, z0 + 0.02, 0.4, 0.4, 's', mats.clock);
  // desks in rows; one of them is yours
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 4; k++) {
      const x = 302.2 + k * 2.4, z = 4 + r * 1.8;
      c.box(x - 0.4, x + 0.4, 0.68, 0.72, z - 0.28, z + 0.28, M.dreamWood, true);
      for (const [dx, dz] of [[-0.36, -0.24], [0.36, -0.24], [-0.36, 0.24], [0.36, 0.24]]) c.box(x + dx - 0.02, x + dx + 0.02, 0, 0.68, z + dz - 0.02, z + dz + 0.02, M.dreamMetal);
      c.box(x - 0.2, x + 0.2, 0.4, 0.44, z + 0.45, z + 0.85, M.dreamWood);
    }
  }
  const mine = [307.0, 0, 7.6];
  const hat = new THREE.ConeGeometry(0.07, 0.18, 12);
  hat.translate(mine[0] + 0.2, 0.81, mine[2]);
  c.add(hat, mats.hat);
  c.box(mine[0] - 0.18, mine[0] + 0.08, 0.72, 0.73, mine[2] - 0.1, mine[2] + 0.06, mats.label);
  meta.deskItem = c.item('desk', mine[0], 0.8, mine[2] + 0.3, { prompt: '[E] sit down', reach: 2.2, cos: 0.5 });
  c.light(303, 2.6, 5, { color: 0xfff4e0, intensity: 2.2, distance: 9 });
  c.light(309, 2.6, 5, { color: 0xfff4e0, intensity: 2.2, distance: 9 });
  c.box(305.6, 306.6, 0, 2.2, z1 - 0.05, z1, mats.white);
}

// ---------- what happens ----------
class Recess extends TapeDirector {
  constructor(o) {
    super(o);
    const { world } = this;
    const meta = this.meta = world.meta;
    this.got = 0;
    this.calm = 0.04;
    this.guests = [];
    this.say('3:30 PM', 4);
    this.setObjective('follow the balloon');
    for (const it of world.items()) {
      if (it.type === 'invite') it.use = (iv) => this.takeInvite(iv);
      if (it.type === 'door') it.use = (d) => this.peek(d.door);
      if (it.type === 'skydoor') it.use = () => this.knock();
      if (it.type === 'desk') it.use = (d) => this.sit(d);
    }
    void meta;
    // the balloon that knows where it's going
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14).scale(1, 1.15, 1), world.mats.red));
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 8).rotateX(Math.PI), world.mats.red);
    knot.position.y = -0.42;
    b.add(knot);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.006, 1.6, 0.006), world.mats.white);
    string.position.y = -1.26;
    b.add(string);
    b.position.set(102, 2.8, 166);
    world.dynamic.add(b);
    this.balloon = b;
    this.kitEvents();
  }

  takeInvite(iv) {
    iv.done = true;
    iv.mesh.visible = false;
    iv.glow.on = false;
    this.got++;
    this.play('pickup', iv.pos, { gain: 1 });
    this.say(`"${iv.text}" (${this.got} of 5)`, 5);
    this.setObjective(this.got < 5 ? `invitations ${this.got}/5` : 'the stairs. the door at the top');
    if (this.got === 2) this.kit.after(4, () => this.inviteGuests());
    if (this.got === 4 && this.meta) this.play('surprise_far', { x: 50, y: 1.5, z: 61 }, { gain: 1.4, send: 0.8, ref: 6 });
  }

  peek(d) {
    if (d.target) return;
    d.target = 1;
    d.block.off = true;
    this.play('door_creak', { x: d.x, y: d.y + 1, z: d.z }, { gain: 1 });
    this.kit.after(3.5, () => { d.target = 0; d.block.off = false; this.play('door_creak', { x: d.x, y: d.y + 1, z: d.z }, { gain: 0.7, rate: 1.3 }); });
    if (Math.random() < 0.5) this.say('nothing behind it but more field', 3);
  }

  knock() {
    if (this.got < 5) { this.say('it won\'t open. invitations only.', 3.5); this.play('knock', this.meta.skyDoorItem.pos, { gain: 1 }); return; }
    // through the door, into a classroom somewhere else
    this.meta.skyDoorItem.done = true;
    this.play('dream_door', null, { gain: 1.2 });
    this.fx.glitch = 1.6;
    this.fx.fade = 0.9;
    this.player.place(306, 0, 8.9, 0, 0);
    this.wrapped = true;
    for (const g of this.guests) g.rig.root.visible = false;
    this.guests.length = 0;
    this.balloon.visible = false;
    this.setObjective('sit down');
    this.kit.after(2.5, () => {
      this.play('chalk_write', { x: 306, y: 1.7, z: 0.4 }, { gain: 1.2 });
      this.kit.after(3.8, () => { this.meta.board.material = this.world.mats.boardText; });
    });
  }

  sit(d) {
    d.done = true;
    this.player.place(307, 0, 8.05, 0, -0.2);
    this.player.frozen = true;
    this.player.eye = 1.15;
    this.leaving = 0;
    this.holdFade = true;
    this.setObjective(null);
    this.play('birthday_box', null, { gain: 0.8 });
  }

  // the Guests: tall, in party hats, at the far edges; they move only when unseen
  inviteGuests() {
    for (let i = 0; i < 3; i++) {
      const rig = createOccupant();
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 14), this.world.mats.hat);
      hat.position.set(0, 0.2, 0);
      rig.head.add(hat);
      this.world.dynamic.add(rig.root);
      const g = { rig, pos: new THREE.Vector3(), unseen: 0 };
      this.placeGuest(g, 55 + i * 8);
      this.guests.push(g);
    }
    this.play('party_horn', this.guests[0].pos, { gain: 1.3, send: 0.8, ref: 8 });
  }

  placeGuest(g, dist) {
    const p = this.player.pos;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const x = THREE.MathUtils.clamp(p.x + Math.cos(a) * dist, 8, 192), z = THREE.MathUtils.clamp(p.z + Math.sin(a) * dist, 8, 192);
      const y = this.world.groundAt(x, z, 50);
      if (this.blocked(x, z, 0.5) || this.onScreen(new THREE.Vector3(x, y + 1.5, z), 1.1)) continue;
      g.pos.set(x, y, z);
      break;
    }
    g.rig.root.visible = true;
    g.rig.setScare(0);
  }

  kitEvents() {
    const { meta, kit, world } = this;
    // sounds of the place: chimes on the porch, a sprinkler, the music box, the swings
    this.loopAt('wind_chimes', meta.chimes, { gain: 0.8, ref: 3 });
    this.loopAt('sprinkler', meta.sprinkler, { gain: 0.7, ref: 3 });
    this.loopAt('birthday_box', meta.musicBox, { gain: 0.55, ref: 2 });
    this.swingSound = this.loopAt('swing_creak', meta.swings[1].pivot.position, { gain: 0, ref: 3 });
    this.mgrSound = this.loopAt('mgr_creak', meta.mgr.obj.position, { gain: 0, ref: 3 });
    meta.swings[1].amp = 0.55;

    // laughter from the playground the first time you come near it
    kit.trigger((d) => d.near(60, 150, 22), () => this.play('kids_laugh', { x: 52, y: 1, z: 150 }, { gain: 1, send: 0.6, ref: 6 }));
    // and the other swings start while you look away
    kit.trigger((d) => d.near(52, 146, 14) && !d.onScreen(meta.swings[0].pivot.position), () => { meta.swings[0].amp = 0.4; meta.swings[2].amp = 0.3; }, { delay: 2 });

    // the see-saw tips between glances
    kit.unseen(meta.saw, [{ r: 0 }, { r: 0 }], { wait: 2.5, minDist: 4, loop: true, onMove: () => { meta.saw.rotation.z = -meta.saw.rotation.z; this.play('floor_creak', meta.saw.position, { gain: 0.6 }); } });

    // the ball rolls down the hill to you
    kit.trigger((d) => d.near(84, 160, 16) && !d.onScreen(meta.ball.position), () => {
      const p = this.player.pos, s = meta.ball.position;
      const path = [];
      for (let i = 0; i <= 12; i++) {
        const x = THREE.MathUtils.lerp(s.x, p.x - 1, i / 12), z = THREE.MathUtils.lerp(s.z, p.z - 1, i / 12);
        path.push([x, world.groundAt(x, z, 40) + 0.28, z]);
      }
      const r = kit.roller(meta.ball, path, { speed: 2.4, radius: 0.28, face: true, onEnd: () => this.play('ball_bump', meta.ball.position, { gain: 1.2 }) });
      r.start();
    });

    // the television in the grass turns on as you come
    kit.trigger((d) => d.near(130, 160, 11), () => {
      meta.tv.screen.material = world.tvStatic;
      this.loopAt('tv_static', meta.tv.pos, { gain: 0.6, ref: 2 });
    });

    // one of the doors in the field opens while you aren't looking; through it is somewhere else
    const sd = meta.doors.find((d) => d.special);
    kit.unseen(sd.hinge, [{ r: 0 }, { r: -1.4 }], { wait: 3, minDist: 6, loop: true, onMove: (i) => { sd.open = i; sd.block.off = i === 1; this.play('door_creak', sd.hinge.position, { gain: 1.1 }); } });
    this.lastSide = null;

    // the house, after you leave it with its invitation: a shout of surprise, then the lamps go out
    kit.trigger((d) => d.found.size >= 0 && meta.invites.find((i) => i.key === 'i2').done && d.zone() === 'm' && !d.near(50, 61, 9), () => {
      this.play('surprise_far', { x: 48, y: 1.2, z: 61 }, { gain: 1.5, send: 0.7, ref: 5 });
      for (const l of meta.lamps) l.on = false;
    }, { delay: 3 });

    // something tall at the far edge, once, before it's been invited
    kit.trigger((d) => d.t > 45 && d.got < 2 && !d.monster, () => {
      const spots = [[176, 178], [22, 26], [186, 60], [30, 186], [120, 16]].filter(([x, z]) => !this.near(x, z, 50) && !this.onScreen(new THREE.Vector3(x, T(x, z) + 1.5, z), 1.1));
      if (!spots.length) return;
      const [x, z] = spots[0];
      const m = this.spawn('occupant', x, z);
      m.kind = 'watcher';
      m.close = 30;
      m.linger = 1.5;
      m.pos.y = T(x, z);
    });
  }

  script(dt) {
    const { meta, world, player, camera } = this;
    const zone = this.zone();
    this.calm = zone === 'h' ? 0.1 : zone === 's' ? 0.02 : 0.04 + this.guests.length * 0.04;
    const t = this.t;

    // swings, the merry-go-round, the doors
    for (const s of meta.swings) s.pivot.rotation.x = Math.sin(t * 1.7 + s.phase) * s.amp;
    this.audio.ramp(this.swingSound.gain.gain, meta.swings[1].amp > 0 ? 0.8 : 0, 0.3);
    const mgr = meta.mgr;
    const mgrSeen = this.kit.seen(mgr.obj, 50);
    mgr.speed += ((mgrSeen ? 0 : 0.9) - mgr.speed) * (1 - Math.exp(-dt * (mgrSeen ? 2.5 : 0.4)));
    mgr.obj.rotation.y += mgr.speed * dt;
    this.audio.ramp(this.mgrSound.gain.gain, mgr.speed * 1.1, 0.2);
    for (const d of meta.doors) {
      if (d.special) continue;
      d.open += (d.target - d.open) * (1 - Math.exp(-dt * 4));
      d.hinge.rotation.y = -d.open * 1.4;
    }

    // walking through the open door takes you to the top of the hill
    const sd = meta.doors.find((d) => d.special);
    if (sd.open) {
      const side = Math.sign(player.pos.z - sd.z);
      const inFrame = Math.abs(player.pos.x - sd.x) < 0.5;
      if (this.lastSide !== null && side !== this.lastSide && inFrame) {
        this.play('dream_door', null, { gain: 1.1 });
        this.fx.glitch = 1.4;
        this.fx.fade = 0.7;
        player.place(108.5, world.groundAt(108.5, 104, 40), 104, -2.4, 0);
        this.wrapped = true;
        sd.open = 0;
        sd.hinge.rotation.y = 0;
        sd.block.off = false;
        this.say('the sound of the ocean, then nothing', 4);
      }
      this.lastSide = side;
    }

    // the balloon: it leads to the nearest invitation still waiting, and waits for you
    const b = this.balloon;
    if (b.visible) {
      const waiting = meta.invites.filter((i) => !i.done);
      let goal;
      if (waiting.length) {
        const next = waiting.reduce((a, c) => (c.pos.distanceTo(player.pos) < a.pos.distanceTo(player.pos) ? c : a));
        goal = next.pos.clone().add(new THREE.Vector3(0, 2.6, 0));
      } else if (player.pos.distanceTo(new THREE.Vector3(160, 0, 62)) > 10 && !this.ascending) goal = new THREE.Vector3(160, 3, 64);
      else { this.ascending = true; goal = new THREE.Vector3(160, 48, 0); }
      const near = b.position.distanceTo(camera.position) < 16 || this.ascending;
      const to = goal.clone().sub(b.position);
      if (near && to.length() > 0.3) {
        const step = Math.min(to.length(), dt * (this.ascending ? 1.6 : 2.4));
        b.position.addScaledVector(to.normalize(), step);
        if (!this.squeakT || t - this.squeakT > 12) { this.squeakT = t; this.play('balloon_squeak', b.position, { gain: 0.6, ref: 2 }); }
      }
      b.position.y += Math.sin(t * 1.6) * 0.004;
      b.rotation.z = Math.sin(t * 1.1) * 0.08;
      if (b.position.y > 46) b.visible = false;
    }

    // the Guests
    let nearest = Infinity;
    for (const g of this.guests) {
      const dist = Math.hypot(g.pos.x - player.pos.x, g.pos.z - player.pos.z);
      nearest = Math.min(nearest, dist);
      const seen = this.onScreen(new THREE.Vector3(g.pos.x, g.pos.y + 2.2, g.pos.z), 1.0) || this.onScreen(new THREE.Vector3(g.pos.x, g.pos.y + 1.0, g.pos.z), 1.0);
      if (seen) { g.unseen = 0; if (dist < 12 && Math.random() < dt * 0.3) g.rig.twitch(); }
      else {
        g.unseen += dt;
        if (g.unseen > 1.3 && dist > 1.0) {
          g.unseen = 0;
          const dir = new THREE.Vector3(player.pos.x - g.pos.x, 0, player.pos.z - g.pos.z).normalize();
          for (const [len, turn] of [[2.0, 0], [1.6, 0.6], [1.6, -0.6], [1.0, 1.2], [1.0, -1.2]]) {
            const step = Math.min(len, dist - 0.9);
            const dx = dir.x * Math.cos(turn) - dir.z * Math.sin(turn), dz = dir.x * Math.sin(turn) + dir.z * Math.cos(turn);
            const x = g.pos.x + dx * step, z = g.pos.z + dz * step;
            if (this.blocked(x, z, 0.3)) continue;
            g.pos.set(x, world.groundAt(x, z, g.pos.y + 1), z);
            if (Math.random() < 0.18) this.play('party_horn', g.pos, { gain: 1.1, send: 0.5, ref: 3 });
            else this.play('occupant_step', g.pos, { gain: 1.2 });
            break;
          }
        }
      }
      g.rig.root.position.copy(g.pos);
      g.rig.root.rotation.y = Math.atan2(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
      g.rig.update(dt, t, camera.position, dist < 18 ? 1 : 0.3);
      if (dist < 1.1 && !this.lunge) {
        this.monster = { kind: 'guest', rig: g.rig, pos: g.pos };
        this.catch('shriek2');
        break;
      }
    }
    this.guestHeart = this.guests.length ? THREE.MathUtils.clamp(1 - (nearest - 2) / 14, 0, 1) : 0;

    // sitting down at your desk: the tape runs out
    if (this.leaving !== undefined) {
      this.leaving += dt;
      if (this.leaving > 3) this.fx.fade = Math.min(1, (this.leaving - 3) / 3.5);
      if (this.leaving > 7) this.finished = true;
    }
  }

  updateMonster(dt) {
    super.updateMonster(dt);
    this.heartbeat = Math.max(this.heartbeat, this.guestHeart ?? 0);
  }

  // after a rewind, the guests are back out at the edges
  rewound() {
    for (const g of this.guests) { this.placeGuest(g, 45); g.rig.setScare(0); }
  }
}

export const TAPE3 = {
  id: 't3',
  number: '03',
  title: 'RECESS',
  blurb: 'a birthday party in a field that goes on too far. nobody came.',
  sounds: SOUNDS,
  level: { id: 't3', zones: ZONES, sky: true, terrain, spawn: { pos: [100, 0, 171.5], yaw: 1.08, zone: 'm' }, build },
  Director: Recess,
};
