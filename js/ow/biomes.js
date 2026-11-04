import * as THREE from 'three';
import { pick } from './noise.js';

export const S = 24; // chunk size, metres
export const DOOR = { a: 10.8, b: 13.2, h: 2.5 }; // every chunk edge opens here
export const BIOMES = {
  backrooms: { indoor: true, height: 2.7, wall: 'brWall', floor: 'carpet', fog: [0x2b2512, 0.05], hemi: 0.35, ambient: 0.4, bloom: [0.5, 0.82], reverb: [0.05, 0.35] },
  pool: { indoor: true, height: 5.5, wall: 'plTile', floor: 'tile', fog: [0x9cbfc2, 0.011], hemi: 0.3, ambient: 0.6, bloom: [0.25, 0.96], reverb: [0.6, 0.05] },
  meadow: { indoor: false, height: 0, wall: null, floor: 'grass', fog: [0xf0dcd6, 0.011], hemi: 1.2, ambient: 1.0, bloom: [0.3, 0.92], reverb: [0, 0.02] },
  mall: { indoor: true, height: 7, wall: 'mlWall', floor: 'tile', fog: [0x0c0b10, 0.026], hemi: 0.14, ambient: 0.15, bloom: [0.7, 0.75], reverb: [0.7, 0.1] },
};

const SHOPS = [
  ['SUNNY DAYS', '#ffcf6a'], ['VIDEO WORLD', '#6ad7ff'], ['PRETZEL STOP', '#ff9a5c'], ['TOY CASTLE', '#ff7ac8'],
  ['OPTICAL', '#9ee8a8'], ['LUCKY SHOES', '#ff6a6a'], ['CARD & GIFT', '#c9a2ff'], ['SOFT SERVE', '#ffe8f2'],
  ['ARCADE', '#7affea'], ['BOOKS', '#ffd9a8'], ['PET PALACE', '#a8ff7a'], ['PHOTO 1 HR', '#ffef7a'],
];

// ---------- backrooms: an office floor that goes on forever ----------
function backrooms(c) {
  const { M, r } = c;
  const H = BIOMES.backrooms.height, N = 6, C = S / N;
  c.box(0, S, -0.1, 0, 0, S, M.brCarpet);
  c.box(0, S, H, H + 0.15, 0, S, M.brCeiling);
  // maze: spanning tree over the cells, then knock out about half the remaining walls
  const v = Array.from({ length: N + 1 }, () => Array(N).fill(true)); // v[k][j]: wall on x = k*C, row j
  const h = Array.from({ length: N + 1 }, () => Array(N).fill(true)); // h[k][i]: wall on z = k*C, column i
  const seen = new Set();
  const stack = [[Math.floor(r() * N), Math.floor(r() * N)]];
  seen.add(stack[0].join());
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => [i + di, j + dj, di, dj])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(`${a},${b}`));
    if (!next.length) { stack.pop(); continue; }
    const [a, b, di, dj] = pick(r, next);
    if (di) v[Math.max(i, a)][j] = false; else h[Math.max(j, b)][i] = false;
    seen.add(`${a},${b}`);
    stack.push([a, b]);
  }
  for (let k = 1; k < N; k++) for (let j = 0; j < N; j++) { if (r() < 0.5) v[k][j] = false; if (r() < 0.5) h[k][j] = false; }
  // keep the four doorway approaches clear
  v[3][0] = v[3][N - 1] = h[3][0] = h[3][N - 1] = false;
  for (let k = 1; k < N; k++) {
    for (let j = 0; j < N; j++) {
      if (v[k][j]) {
        c.box(k * C - 0.1, k * C + 0.1, 0, H, j * C, (j + 1) * C, M.brWall, true);
        c.box(k * C - 0.12, k * C + 0.12, 0, 0.1, j * C + 0.12, (j + 1) * C - 0.12, M.brTrim);
      }
      if (h[k][j]) {
        c.box(j * C, (j + 1) * C, 0, H, k * C - 0.1, k * C + 0.1, M.brWall, true);
        c.box(j * C + 0.12, (j + 1) * C - 0.12, 0, 0.1, k * C - 0.12, k * C + 0.12, M.brTrim);
      }
    }
  }
  // the odd pillar where walls don't meet
  for (let a = 1; a < N; a++) {
    for (let b = 1; b < N; b++) {
      const touching = v[a][b - 1] || v[a][b] || h[b][a - 1] || h[b][a];
      if (!touching && r() < 0.3) c.box(a * C - 0.3, a * C + 0.3, 0, H, b * C - 0.3, b * C + 0.3, M.brWall, true);
    }
  }
  // a panel over every cell; a few dead, a few failing
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = (i + 0.5) * C, z = (j + 0.5) * C, dead = r() < 0.08;
      c.box(x - 0.66, x + 0.66, H - 0.03, H, z - 0.36, z + 0.36, M.housing);
      c.box(x - 0.6, x + 0.6, H - 0.04, H - 0.03, z - 0.3, z + 0.3, dead ? M.panelDead : M.panel);
      if (!dead && (i + j) % 2 === 0) c.light(x, H - 0.35, z, { color: 0xfff1c2, intensity: 4.2, distance: 9, flicker: r() < 0.1 });
      c.spot(x, z);
    }
  }
  // stains, and the occasional thing someone left
  for (let k = 0; k < 4; k++) {
    if (r() < 0.6) c.decal(r() * S, r() * S, 0.6 + r() * 1.6, 0x3d3315, 0.35);
  }
  if (r() < 0.35) {
    const x = (Math.floor(r() * N) + 0.5) * C + 0.8, z = (Math.floor(r() * N) + 0.5) * C - 0.6;
    c.box(x - 0.25, x + 0.25, 0.42, 0.5, z - 0.25, z + 0.25, M.fabric, true); // office chair
    c.box(x - 0.25, x + 0.25, 0.5, 1.0, z + 0.2, z + 0.26, M.fabric);
    c.box(x - 0.03, x + 0.03, 0, 0.42, z - 0.03, z + 0.03, M.metal);
  }
}

// ---------- poolrooms: bright tile, warm water, daylight from nowhere ----------
function poolrooms(c) {
  const { M, r } = c;
  const H = BIOMES.pool.height;
  const pools = [];
  for (const [qx, qz] of [[0, 0], [12, 0], [0, 12], [12, 12]]) {
    if (r() < 0.85) {
      const w = 4 + 2 * Math.floor(r() * 3), d = 4 + 2 * Math.floor(r() * 3);
      const x1 = qx + 1 + 2 * Math.floor(r() * ((10 - w) / 2 + 1)), z1 = qz + 1 + 2 * Math.floor(r() * ((10 - d) / 2 + 1));
      pools.push({ x1, x2: x1 + w, z1, z2: z1 + d, deep: r() < 0.35 });
    }
  }
  const inPool = (x, z) => pools.some((p) => x >= p.x1 && x < p.x2 && z >= p.z1 && z < p.z2);
  // the floor, in strips around the pools
  for (let z = 0; z < S; z++) {
    let start = null;
    for (let x = 0; x <= S; x++) {
      const open = x < S && !inPool(x + 0.5, z + 0.5);
      if (open && start === null) start = x;
      if (!open && start !== null) { c.box(start, x, -0.2, 0, z, z + 1, M.plFloor); start = null; }
    }
  }
  for (const p of pools) {
    const floor = p.deep ? -1.45 : -0.45;
    c.box(p.x1, p.x2, floor - 0.2, floor, p.z1, p.z2, M.plPool);
    c.box(p.x1 - 0.2, p.x1, floor, -0.2, p.z1 - 0.2, p.z2 + 0.2, M.plPool);
    c.box(p.x2, p.x2 + 0.2, floor, -0.2, p.z1 - 0.2, p.z2 + 0.2, M.plPool);
    c.box(p.x1, p.x2, floor, -0.2, p.z1 - 0.2, p.z1, M.plPool);
    c.box(p.x1, p.x2, floor, -0.2, p.z2, p.z2 + 0.2, M.plPool);
    c.water(p.x1, p.x2, p.z1, p.z2, -0.08, floor, p.deep);
  }
  c.box(0, S, H, H + 0.2, 0, S, M.plCeiling);
  // skylights: strips of white glow in the ceiling, and the light that falls from them
  for (const z of [6, 18]) {
    c.box(4, 20, H - 0.02, H, z - 0.8, z + 0.8, M.skyPanel);
    for (const x of [7, 17]) c.light(x, H - 0.6, z, { color: 0xeefaff, intensity: 6, distance: 16 });
  }
  // pillars joined by beams
  for (const [x, z] of [[6, 6], [18, 6], [6, 18], [18, 18]]) {
    if (r() < 0.8) {
      c.box(x - 0.4, x + 0.4, -1.5, H, z - 0.4, z + 0.4, M.plTile, true);
      c.box(x - 0.45, x + 0.45, -0.02, 0.12, z - 0.45, z + 0.45, M.plPool);
    }
  }
  c.box(6, 18, H - 0.9, H - 0.5, 5.75, 6.25, M.plTile);
  c.box(6, 18, H - 0.9, H - 0.5, 17.75, 18.25, M.plTile);
  // tiled partitions between the quadrants, broken by tall openings, so the hall becomes rooms
  const partition = (axis, at, from, to) => {
    const gaps = [[from + 3 + Math.floor(r() * 3), 3]];
    if (to - from > 10 && r() < 0.6) gaps.push([to - 4, 2.4]);
    let u = from;
    for (const [g, gw] of [...gaps, [to, 0]]) {
      if (g > u) axis === 'x' ? c.box(at - 0.15, at + 0.15, -0.2, H, u, g, M.plTile, true) : c.box(u, g, -0.2, H, at - 0.15, at + 0.15, M.plTile, true);
      if (gw) axis === 'x' ? c.box(at - 0.15, at + 0.15, 3.6, H, g, g + gw, M.plTile) : c.box(g, g + gw, 3.6, H, at - 0.15, at + 0.15, M.plTile);
      u = g + gw;
    }
  };
  const wet = (axis, at, from, to) => pools.some((p) => (axis === 'x' ? at > p.x1 - 0.3 && at < p.x2 + 0.3 && p.z2 > from && p.z1 < to : at > p.z1 - 0.3 && at < p.z2 + 0.3 && p.x2 > from && p.x1 < to));
  for (const [axis, from, to] of [['x', 2, 10], ['x', 14, 22], ['z', 2, 10], ['z', 14, 22]]) {
    if (r() < 0.45 && !wet(axis, 12, from, to)) partition(axis, 12, from, to);
  }
  for (let x = 1; x < S; x += 3) for (let z = 1; z < S; z += 3) if (!inPool(x, z) || pools.find((p) => !p.deep && x >= p.x1 && x < p.x2 && z >= p.z1 && z < p.z2)) c.spot(x, z);
}

// ---------- the meadow: grass, a pale sky, and things that shouldn't be here ----------
function meadow(c) {
  const { M, r } = c;
  const plane = new THREE.PlaneGeometry(S, S);
  plane.rotateX(-Math.PI / 2);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * S, uv.getY(i) * S);
  plane.translate(S / 2, 0, S / 2);
  c.add(plane, M.grass);
  c.blades(480);
  const things = [door, door, wallFragment, wallFragment, lamppost, lamppost, tv, swings, slide, chair, stairs];
  const count = 2 + Math.floor(r() * 3);
  const used = [];
  for (let k = 0; k < count; k++) {
    let x, z, tries = 0;
    do { x = 3 + r() * (S - 6); z = 3 + r() * (S - 6); tries++; } while (tries < 12 && used.some(([a, b]) => Math.hypot(a - x, b - z) < 6));
    used.push([x, z]);
    pick(r, things)(c, x, z, r() * Math.PI * 2);
  }
  if (r() < 0.1) dreamDoor(c, 6 + r() * 12, 6 + r() * 12, r() * Math.PI * 2);
  for (let k = 0; k < 6; k++) c.spot(2 + r() * (S - 4), 2 + r() * (S - 4));
}

// props are built in a little local frame: (u along the facing, v across), rotated by `rot`
function framed(c, x, z, rot) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const P = (u, w) => [x + u * cs - w * sn, z + u * sn + w * cs];
  // an axis-aligned box in the prop's frame (approximated: rotations snap to quarter turns)
  const q = Math.round(rot / (Math.PI / 2)) & 3;
  const box = (u1, u2, y1, y2, w1, w2, mat, collide) => {
    const [ax, az] = P(u1, w1), [bx, bz] = P(u2, w2);
    c.box(Math.min(ax, bx), Math.max(ax, bx), y1, y2, Math.min(az, bz), Math.max(az, bz), mat, collide);
  };
  return { box, q, P };
}

function door(c, x, z, rot) {
  const { M, r } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  f.box(-0.55, -0.45, 0, 2.3, -0.06, 0.06, M.dreamWhite, true);
  f.box(0.45, 0.55, 0, 2.3, -0.06, 0.06, M.dreamWhite, true);
  f.box(-0.55, 0.55, 2.2, 2.3, -0.06, 0.06, M.dreamWhite);
  if (r() < 0.6) f.box(-0.45, 0.45, 0, 2.2, -0.03, 0.03, r() < 0.5 ? M.dreamPink : M.dreamWood, true); // closed, leading nowhere
  else f.box(0.42, 0.46, 0, 2.2, 0.06, 0.95, M.dreamWood); // ajar
}

function dreamDoor(c, x, z, rot) {
  const { M } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  f.box(-0.55, -0.45, 0, 2.3, -0.06, 0.06, M.dreamWhite, true);
  f.box(0.45, 0.55, 0, 2.3, -0.06, 0.06, M.dreamWhite, true);
  f.box(-0.55, 0.55, 2.2, 2.3, -0.06, 0.06, M.dreamWhite);
  f.box(-0.45, 0.45, 0, 2.2, -0.01, 0.01, M.voidDoor);
  const [tx, tz] = f.P(0, 0);
  c.item('dreamDoor', tx, 1.1, tz);
}

function wallFragment(c, x, z, rot) {
  const { M, r } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  if (r() < 0.5) {
    f.box(-2, 2, 0, 3, -0.08, 0.08, M.cloudWall, true);
  } else {
    // with a window looking out onto more of the same
    f.box(-2, -0.7, 0, 3, -0.08, 0.08, M.cloudWall, true);
    f.box(0.7, 2, 0, 3, -0.08, 0.08, M.cloudWall, true);
    f.box(-0.7, 0.7, 0, 1.0, -0.08, 0.08, M.cloudWall, true);
    f.box(-0.7, 0.7, 2.2, 3, -0.08, 0.08, M.cloudWall);
    f.box(-0.72, 0.72, 0.98, 1.04, -0.11, 0.11, M.dreamWhite);
  }
  f.box(-2, 2, 0, 0.12, -0.1, 0.1, M.dreamWhite);
}

function lamppost(c, x, z) {
  const { M } = c;
  c.box(x - 0.06, x + 0.06, 0, 3.4, z - 0.06, z + 0.06, M.dreamMetal, true);
  c.box(x - 0.2, x + 0.2, 3.4, 3.5, z - 0.2, z + 0.2, M.dreamMetal);
  c.box(x - 0.14, x + 0.14, 3.15, 3.4, z - 0.14, z + 0.14, M.tapeGlow);
}

function tv(c, x, z, rot) {
  const { M } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  f.box(-0.35, 0.35, 0, 0.55, -0.3, 0.3, M.plastic, true);
  f.box(-0.28, 0.28, 0.1, 0.48, 0.3, 0.31, c.tvStatic);
}

function swings(c, x, z, rot) {
  const { M } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  for (const u of [-1.6, 1.6]) for (const w of [-0.5, 0.5]) f.box(u - 0.05, u + 0.05, 0, 2.4, w - 0.05, w + 0.05, M.dreamMetal, true);
  f.box(-1.6, 1.6, 2.35, 2.45, -0.05, 0.05, M.dreamMetal);
  for (const u of [-0.7, 0.7]) {
    f.box(u - 0.25, u + 0.25, 0.5, 0.55, -0.12, 0.12, M.dreamPink);
    for (const s of [-0.22, 0.22]) f.box(u + s - 0.01, u + s + 0.01, 0.55, 2.35, -0.01, 0.01, M.dreamMetal);
  }
}

function slide(c, x, z, rot) {
  const { M } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  f.box(-1.2, -0.6, 0, 1.6, -0.4, 0.4, M.dreamPink, true);
  for (let i = 0; i < 6; i++) f.box(-0.6 + i * 0.4, -0.2 + i * 0.4, 0, 1.5 - i * 0.25, -0.35, 0.35, M.dreamPink);
}

function chair(c, x, z) {
  const { M } = c;
  c.box(x - 0.22, x + 0.22, 0.42, 0.47, z - 0.22, z + 0.22, M.dreamWood, true);
  c.box(x - 0.22, x + 0.22, 0.47, 1.0, z + 0.18, z + 0.22, M.dreamWood);
  for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) c.box(x + dx - 0.02, x + dx + 0.02, 0, 0.42, z + dz - 0.02, z + dz + 0.02, M.dreamWood);
}

function stairs(c, x, z, rot) {
  const { M } = c;
  const f = framed(c, x, z, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
  for (let i = 0; i < 7; i++) f.box(-0.6, 0.6, 0, 0.3 * (i + 1), i * 0.35, (i + 1) * 0.35, M.dreamWhite, true);
}

// ---------- the mall after hours ----------
function mall(c) {
  const { M, r, sign } = c;
  const H = BIOMES.mall.height;
  c.box(0, S, -0.1, 0, 0, S, M.mlFloor);
  c.box(0, S, H, H + 0.2, 0, S, M.mlCeiling);
  for (const [x1, x2, z1, z2] of [[9, 15, 0, S], [0, S, 9, 15]]) c.box(x1, x2, H - 0.01, H, z1, z2, M.mlSkylight);
  for (let u = 2; u < S; u += 2) {
    c.box(9, 15, H - 0.05, H - 0.01, u - 0.04, u + 0.04, M.mlShutter);
    c.box(u - 0.04, u + 0.04, H - 0.05, H - 0.01, 9, 15, M.mlShutter);
  }
  // four blocks of shops, fronts facing the corridors
  for (const [bx, bz] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
    c.box(bx, bx + 8, 0, H, bz, bz + 8, M.mlWall, true);
    const faces = [];
    faces.push(bx === 0 ? ['x', bx + 8, 1] : ['x', bx, -1]);
    faces.push(bz === 0 ? ['z', bz + 8, 1] : ['z', bz, -1]);
    for (const [axis, at, out] of faces) {
      const [label, color] = pick(r, SHOPS);
      const shut = r();
      const lo = (axis === 'x' ? bz : bx) + 0.8, hi = lo + 6.4;
      const o = (d) => at + out * d;
      const lit = r() < 0.6;
      // a face of the block: (u along the face, y, depth out from it)
      const F = (u1, u2, y1, y2, d1, d2, mat, collide) => (axis === 'x'
        ? c.box(o(d1) < o(d2) ? o(d1) : o(d2), o(d1) < o(d2) ? o(d2) : o(d1), y1, y2, u1, u2, mat, collide)
        : c.box(u1, u2, y1, y2, o(d1) < o(d2) ? o(d1) : o(d2), o(d1) < o(d2) ? o(d2) : o(d1), mat, collide));
      F(lo, hi, 0.4, 3.3, 0, 0.03, M.mlGlass);
      F(lo + 0.1, hi - 0.1, 0.5, 3.2, 0, 0.02, lit ? M.mlGlowLit : M.mlGlow);
      F(lo, hi, 3.6, 4.3, 0, 0.06, sign(label, color));
      if (shut < 0.45) F(lo, hi, shut < 0.2 ? 0.05 : 1.6, 3.3, 0.03, 0.08, M.mlShutter);
      // pillars either side, then the second floor: a balcony rail and dark upper windows
      F(lo - 0.6, lo - 0.1, 0, H, 0, 0.35, M.mlPillar, true);
      F(hi + 0.1, hi + 0.6, 0, H, 0, 0.35, M.mlPillar, true);
      F(lo - 0.8, hi + 0.8, 4.55, 4.75, 0, 0.9, M.mlPillar);
      F(lo - 0.8, hi + 0.8, 5.55, 5.62, 0.8, 0.86, M.mlShutter);
      for (let u = lo - 0.6; u <= hi + 0.6; u += 0.5) F(u - 0.02, u + 0.02, 4.75, 5.55, 0.82, 0.85, M.mlShutter);
      F(lo, hi, 4.9, 6.4, 0, 0.02, r() < 0.3 ? M.mlGlowLit : M.mlGlass);
    }
  }
  // the plaza: a fountain or a planter, and benches nobody sits on
  if (r() < 0.55) {
    // a round basin turned on a lathe: outer wall, rim, inner wall, floor
    c.lathe(12, 12, [[0, 0.25], [2.35, 0.25], [2.35, 0.55], [2.6, 0.55], [2.6, 0]], M.mlPlanter, 40);
    c.cyl(12, 12, 2.35, 2.35, 0.25, 0.42, M.waterBright, 40);
    c.cyl(12, 12, 0.35, 0.45, 0.42, 1.6, M.mlPlanter, 16);
    c.cyl(12, 12, 1.0, 0.7, 1.6, 1.75, M.mlPlanter, 24);
    c.cyl(12, 12, 0.85, 0.85, 1.75, 1.76, M.waterBright, 24);
    for (const [a, b] of [[2.6, 1.4], [1.4, 2.6], [2.1, 2.1]]) c.collide(12 - a, 12 + a, 12 - b, 12 + b, 0, 0.6);
    c.item('fountain', 12, 1, 12);
  } else {
    c.box(10, 14, 0, 0.7, 10, 14, M.mlPlanter, true);
    c.box(10.1, 13.9, 0.7, 0.75, 10.1, 13.9, M.mlSoil);
    c.cyl(12, 12, 0.12, 0.18, 0.7, 3.4, M.mlBench, 10);
    for (const [dx, y, dz, rr] of [[0, 3.8, 0, 1.3], [0.7, 3.4, 0.3, 0.9], [-0.6, 3.5, -0.4, 0.9], [0.2, 4.4, -0.3, 0.8]]) c.sphere(12 + dx, y, 12 + dz, rr, M.mlLeaf);
  }
  for (const [x, z, along] of [[12, 3.5, 'x'], [12, 20.5, 'x'], [3.5, 12, 'z'], [20.5, 12, 'z']]) {
    if (r() < 0.7) {
      if (along === 'x') c.box(x - 1, x + 1, 0, 0.45, z - 0.25, z + 0.25, M.mlBench, true);
      else c.box(x - 0.25, x + 0.25, 0, 0.45, z - 1, z + 1, M.mlBench, true);
    }
  }
  for (const [x, z] of [[12, 4], [4, 12], [20, 12], [12, 20], [12, 12]]) {
    c.box(x - 0.5, x + 0.5, H - 0.07, H - 0.02, z - 0.5, z + 0.5, M.panel);
    c.light(x, H - 1, z, { color: 0xffd6a0, intensity: 4.5, distance: 14, flicker: r() < 0.15 });
    c.spot(x + 1.5, z + 1.5);
  }
}

export const BUILDERS = { backrooms, pool: poolrooms, meadow, mall };

// Walls along a chunk's own north and west edges, wherever an indoor space ends.
export function buildEdge(c, edge, self, other) {
  const A = BIOMES[self], B = BIOMES[other];
  const { M, r } = c;
  const wall = (u1, u2, y1, y2, mat, collide) => (edge === 'n'
    ? c.box(u1, u2, y1, y2, -0.1, 0.1, mat, collide)
    : c.box(-0.1, 0.1, y1, y2, u1, u2, mat, collide));
  if (self === other) {
    if (self !== 'backrooms') return;
    // the maze carries on across the seam
    for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3 && r() < 0.35) wall(i * 4, i * 4 + 4, 0, A.height, M.brWall, true);
    return;
  }
  if (!A.indoor && !B.indoor) return;
  const h = Math.max(A.height, B.height);
  // each face wears the paper of the side it faces; out in the open, buildings are pale cloud-papered blocks
  const face = (bi) => M[bi.indoor ? bi.wall : 'cloudWall'];
  const out = A.indoor && B.indoor ? (h === A.height ? A : B) : null;
  const slab = (u1, u2, y1, y2, collide) => {
    for (const [d1, d2, bi] of [[0, 0.1, out ?? A], [-0.1, 0, out ?? B]]) {
      if (edge === 'n') c.box(u1, u2, y1, y2, d1, d2, face(bi), collide);
      else c.box(d1, d2, y1, y2, u1, u2, face(bi), collide);
    }
  };
  slab(0, DOOR.a, 0, h, true);
  slab(DOOR.b, S, 0, h, true);
  slab(DOOR.a, DOOR.b, DOOR.h, h, false);
  // the open side gets a cornice, so the wall reads as a building and not a backdrop
  if (!A.indoor || !B.indoor) {
    const d = A.indoor ? [-0.25, -0.1] : [0.1, 0.25];
    if (edge === 'n') c.box(0, S, h - 0.3, h, d[0], d[1], M.dreamWhite);
    else c.box(d[0], d[1], h - 0.3, h, 0, S, M.dreamWhite);
    for (const [u1, u2] of [[0, DOOR.a], [DOOR.b, S]]) {
      if (edge === 'n') c.box(u1, u2, 0, 0.25, d[0], d[1], M.dreamWhite, true);
      else c.box(d[0], d[1], 0, 0.25, u1, u2, M.dreamWhite, true);
    }
  }
}
