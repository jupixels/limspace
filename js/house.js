import * as THREE from 'three';
import { createListener } from './creatures.js';

// Tape 03: a family house at night with the power out, built slightly wrong.
const H = 2.5;
const T = 0.15; // wall thickness
const ROOMS = {
  living: { x1: 0, x2: 7, z1: 0, z2: 6, floor: 'wood' },
  kitchen: { x1: 7, x2: 13, z1: 0, z2: 6, floor: 'tile' },
  garage: { x1: 13, x2: 18, z1: 0, z2: 6, floor: 'concrete' },
  hall: { x1: 0, x2: 14, z1: 6, z2: 8, floor: 'wood' },
  master: { x1: 0, x2: 6, z1: 8, z2: 13, floor: 'carpet' },
  kid: { x1: 6, x2: 11, z1: 8, z2: 13, floor: 'carpet' },
  bath: { x1: 11, x2: 14, z1: 8, z2: 13, floor: 'tile' },
};
// real stairs along the hall wall, up through the ceiling into an attic over the living room
const ATTIC = { x1: 3.5, x2: 7 - T / 2, z1: 2.5, z2: 6 - T / 2, floor: H + 0.12, roof: 4.9 };
const STAIR = { x0: 4.0, run: 0.32, n: 9, z1: 4.9, z2: 6 - T / 2 };
STAIR.rise = ATTIC.floor / STAIR.n;
STAIR.x1 = STAIR.x0 + STAIR.run * STAIR.n;

// doorways between rooms, as the points a creature walks through
const DOORS = [
  ['living', 'hall', 3.5, 6], ['kitchen', 'hall', 9.5, 6], ['living', 'kitchen', 7, 2.75],
  ['kitchen', 'garage', 13, 3.5], ['hall', 'master', 3, 8], ['hall', 'kid', 8.5, 8], ['hall', 'bath', 12.5, 8],
];

function worldUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a night window: deep blue, a moon smudge, mullions
const nightWindow = () => canvasTex(128, 128, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b1426');
  grad.addColorStop(1, '#03060c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(160,180,220,0.25)';
  g.beginPath(); g.arc(90, 34, 10, 0, 6.28); g.fill();
});
// the child's window looks out onto a pool hall that isn't there
const poolWindow = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#8fe0e6';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,110,120,0.6)';
  for (let i = 0; i <= w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  g.fillStyle = 'rgba(20,80,100,0.8)';
  g.fillRect(0, 84, w, 6);
});
const brick = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#5a5048';
  g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) {
    for (let c = -1; c < 4; c++) {
      g.fillStyle = `hsl(12, 32%, ${26 + Math.random() * 10}%)`;
      g.fillRect(c * 36 + (r % 2) * 18 + 2, r * 16 + 2, 32, 12);
    }
  }
});

export function buildHouse(scene) {
  const colliders = [];
  const lights = [];
  const manager = new THREE.LoadingManager();
  const ready = new Promise((res, rej) => { manager.onLoad = res; manager.onError = (u) => rej(new Error('failed to load ' + u)); });
  const loader = new THREE.TextureLoader(manager);
  function pbr(id, size, opts = {}) {
    const tex = (m, srgb) => {
      const t = loader.load(`textures/${id}_${m}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / size, 1 / size);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return new THREE.MeshStandardMaterial({ map: tex('Color', true), normalMap: tex('NormalGL'), roughnessMap: tex('Roughness'), ...opts });
  }
  const M = {
    wall: pbr('Wallpaper002A', 1.0, { color: 0xb3b892, roughness: 1, envMapIntensity: 0.4 }),
    ceiling: pbr('Wallpaper002A', 1.4, { color: 0xd9d4c4, roughness: 1, envMapIntensity: 0.3 }),
    wood: pbr('WoodFloor051', 1.6, { roughness: 0.7, envMapIntensity: 0.6 }),
    carpet: pbr('Carpet008', 1.4, { color: 0x8c8a9a, roughness: 1, envMapIntensity: 0.2 }),
    tile: pbr('Tiles133B', 1.5, { roughness: 0.5, envMapIntensity: 0.7 }),
    concrete: pbr('Concrete034', 2, { roughness: 0.9, envMapIntensity: 0.3 }),
    garageWall: pbr('Concrete034', 2, { color: 0xb8b2a8, roughness: 0.95, envMapIntensity: 0.3 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3d2a1c, roughness: 0.55 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: 0.6 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 }),
    blanket: new THREE.MeshStandardMaterial({ color: 0x6b7a8c, roughness: 0.95 }),
    kidBlanket: new THREE.MeshStandardMaterial({ color: 0xc46a5a, roughness: 0.95 }),
    counter: new THREE.MeshStandardMaterial({ color: 0xcfc7b0, roughness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8c9090, roughness: 0.4, metalness: 0.8 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.4 }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.2 }),
    curtain: new THREE.MeshStandardMaterial({ color: 0x5e3b34, roughness: 1, side: THREE.DoubleSide }),
  };
  const floorMat = { wood: M.wood, carpet: M.carpet, tile: M.tile, concrete: M.concrete };

  function box(x1, x2, y1, y2, z1, z2, mat, collide = false) {
    [x1, x2] = [Math.min(x1, x2), Math.max(x1, x2)];
    [z1, z2] = [Math.min(z1, z2), Math.max(z1, z2)];
    const w = x2 - x1, h = y2 - y1, d = z2 - z1;
    const geo = new THREE.BoxGeometry(w, h, d);
    worldUVs(geo, w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    scene.add(m);
    if (collide) colliders.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, minY: y1, maxY: y2 });
    return m;
  }

  // walls along x (constant z) run full length; walls along z stop at their faces
  function wallX(z, x1, x2, gaps = [], mat = M.wall) {
    let x = x1;
    for (const [g1, g2] of [...gaps, [x2, x2]]) {
      if (g1 > x) box(x, g1, 0, H, z - T / 2, z + T / 2, mat, true);
      if (g2 > g1) box(g1, g2, 2.1, H, z - T / 2, z + T / 2, mat);
      x = g2;
    }
  }
  function wallZ(x, z1, z2, gaps = [], mat = M.wall) {
    let z = z1 + T / 2;
    for (const [g1, g2] of [...gaps, [z2 - T / 2, z2 - T / 2]]) {
      if (g1 > z) box(x - T / 2, x + T / 2, 0, H, z, g1, mat, true);
      if (g2 > g1) box(x - T / 2, x + T / 2, 2.1, H, g1, g2, mat);
      z = g2;
    }
  }

  // ---------- shell ----------
  for (const r of Object.values(ROOMS)) box(r.x1, r.x2, -0.1, 0, r.z1, r.z2, floorMat[r.floor]);
  // ceiling, with the stairwell cut out of it
  box(0, 18, H, H + 0.1, 0, STAIR.z1, M.ceiling);
  box(0, 18, H, H + 0.1, STAIR.z2, 13, M.ceiling);
  box(0, STAIR.x0, H, H + 0.1, STAIR.z1, STAIR.z2, M.ceiling);
  box(ATTIC.x2, 18, H, H + 0.1, STAIR.z1, STAIR.z2, M.ceiling);
  wallX(0, 0, 13, [[1, 2]]);
  wallX(0, 13, 18, [], M.garageWall);
  wallX(6, 0, 13, [[3, 4], [9, 10]]);
  wallX(6, 13, 18, [], M.garageWall);
  wallX(8, 0, 14, [[2.5, 3.5], [8, 9], [12, 13]]);
  wallX(13, 0, 14);
  wallZ(0, 0, 13);
  wallZ(7, 0, 6, [[2, 3.5]]);
  // kitchen / garage: papered on one side, bare block on the other
  for (const [x1, x2, mat] of [[13 - T / 2, 13, M.wall], [13, 13 + T / 2, M.garageWall]]) {
    box(x1, x2, 0, H, T / 2, 3, mat, true);
    box(x1, x2, 0, H, 4, 6 - T / 2, mat, true);
    box(x1, x2, 2.1, H, 3, 4, mat);
  }
  wallZ(18, 0, 6, [], M.garageWall);
  wallZ(14, 6, 13, [[6.5, 7.5]]);
  wallZ(6, 8, 13);
  wallZ(11, 8, 13);

  // front door: locked
  const frontDoor = box(1, 2, 0, 2.1, -0.02, 0.03, M.darkWood, true);
  box(1.75, 1.8, 0.95, 1.05, 0.03, 0.07, M.metal);
  // the hall ends in a door onto bare brick
  box(14 - 0.06, 14 + 0.06, 0, 2.1, 6.5, 7.5, new THREE.MeshStandardMaterial({ map: brick(), roughness: 0.9 }), true);
  const wrongPivot = new THREE.Group();
  wrongPivot.position.set(14 - T / 2 - 0.03, 0, 6.5);
  const wrongDoor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.1, 1), M.paint);
  wrongDoor.position.set(0, 1.05, 0.5);
  const wrongKnob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.metal);
  wrongKnob.position.set(-0.04, 0, 0.38);
  wrongDoor.add(wrongKnob);
  wrongPivot.add(wrongDoor);
  scene.add(wrongPivot);
  const wrong = { pivot: wrongPivot, open: 0, opening: false, pos: new THREE.Vector3(13.85, 1.1, 7) };

  // windows (painted on the inside face, with frames and curtains)
  function windowOn(axis, at, c1, c2, y1, y2, tex, glow = 1) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(glow, glow, glow) });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(c2 - c1, y2 - y1), mat);
    if (axis === 'z') { pane.position.set((c1 + c2) / 2, (y1 + y2) / 2, at); if (at > 6.5) pane.rotation.y = Math.PI; }
    scene.add(pane);
    const inward = at > 6.5 ? -1 : 1;
    const f = (a1, a2, b1, b2) => box(a1, a2, b1, b2, at, at + inward * 0.05, M.paint);
    f(c1 - 0.06, c1, y1 - 0.06, y2 + 0.06); f(c2, c2 + 0.06, y1 - 0.06, y2 + 0.06);
    f(c1, c2, y1 - 0.06, y1); f(c1, c2, y2, y2 + 0.06); f((c1 + c2) / 2 - 0.02, (c1 + c2) / 2 + 0.02, y1, y2);
    for (const cx of [c1 - 0.3, c2 + 0.05]) box(cx, cx + 0.25, 0.7, 2.35, at + inward * 0.06, at + inward * 0.1, M.curtain);
  }
  windowOn('z', T / 2 + 0.001, 4, 5.2, 1.0, 2.0, nightWindow());
  windowOn('z', T / 2 + 0.001, 9, 10.5, 1.2, 2.0, nightWindow());
  windowOn('z', 13 - T / 2 - 0.001, 2, 3.4, 1.0, 2.0, nightWindow());
  windowOn('z', 13 - T / 2 - 0.001, 7.2, 8.6, 1.0, 2.0, poolWindow(), 1.6);

  // ---------- living room ----------
  box(2.0, 3.4, 0, 0.5, 0.1, 0.6, M.darkWood, true); // TV stand
  box(2.25, 3.15, 0.5, 1.15, 0.12, 0.62, M.plastic); // CRT
  box(2.35, 3.05, 0.3, 0.4, 0.45, 0.62, M.plastic); // VCR on the shelf
  const vcrLight = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x220000 }));
  vcrLight.position.set(2.9, 0.35, 0.625);
  scene.add(vcrLight);
  box(1.2, 3.6, 0, 0.45, 3.1, 3.95, M.fabric, true); // couch
  box(1.2, 3.6, 0.45, 0.95, 3.75, 3.95, M.fabric);
  box(1.2, 1.4, 0.45, 0.7, 3.1, 3.95, M.fabric);
  box(3.4, 3.6, 0.45, 0.7, 3.1, 3.95, M.fabric);
  box(1.9, 2.9, 0, 0.4, 1.6, 2.2, M.darkWood, true); // coffee table
  // stairs up along the hall wall, starting by the hall doorway
  const S = STAIR;
  for (let i = 0; i < S.n; i++) box(S.x0 + S.run * i, S.x0 + S.run * (i + 1), 0, S.rise * (i + 1), S.z1, S.z2, M.darkWood);
  // a rail on the open side
  for (const [x, y] of [[S.x0 + 0.1, 0.25], [S.x1 - 0.1, ATTIC.floor]]) box(x - 0.025, x + 0.025, y, y + 0.95, S.z1 + 0.02, S.z1 + 0.07, M.darkWood);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, Math.hypot(S.x1 - S.x0 - 0.2, ATTIC.floor - 0.25)), M.darkWood);
  rail.position.set((S.x0 + S.x1) / 2, (0.25 + ATTIC.floor) / 2 + 0.95, S.z1 + 0.045);
  rail.rotation.set(0, Math.PI / 2, 0);
  rail.rotateX(-Math.atan2(ATTIC.floor - 0.25, S.x1 - S.x0 - 0.2));
  scene.add(rail);

  // ---------- the attic ----------
  const A = ATTIC;
  M.attic = new THREE.MeshStandardMaterial({ color: 0x4e3d2e, roughness: 0.95 });
  M.box = new THREE.MeshStandardMaterial({ color: 0x8a6e4a, roughness: 0.95 });
  box(A.x1, A.x2, H + 0.1, A.floor, A.z1, S.z1, M.attic);
  box(A.x1, S.x0, H + 0.1, A.floor, S.z1, A.z2, M.attic);
  box(A.x1 - T / 2, 7 + T / 2, A.floor, A.roof, A.z1 - T, A.z1, M.attic, true);
  box(A.x1 - T, A.x1, A.floor, A.roof, A.z1, A.z2, M.attic, true);
  box(A.x2, 7 + T / 2, A.floor, A.roof, A.z1, 6 + T / 2, M.attic, true);
  box(A.x1 - T, A.x2, A.floor, A.roof, A.z2, 6 + T / 2, M.attic, true);
  box(A.x1 - T, 7 + T / 2, A.roof, A.roof + 0.1, A.z1 - T, 6 + T / 2, M.attic);
  for (let x = A.x1 + 0.4; x < A.x2; x += 0.8) box(x - 0.05, x + 0.05, A.roof - 0.15, A.roof, A.z1, A.z2, M.darkWood); // rafters
  // boxes, and a camera on a tripod, pointed at the top of the stairs
  box(A.x1 + 0.1, A.x1 + 0.7, A.floor, A.floor + 0.5, A.z1 + 0.1, A.z1 + 0.8, M.box, true);
  box(A.x1 + 0.15, A.x1 + 0.6, A.floor + 0.5, A.floor + 0.85, A.z1 + 0.2, A.z1 + 0.65, M.box);
  box(A.x1 + 0.8, A.x1 + 1.3, A.floor, A.floor + 0.4, A.z1 + 0.1, A.z1 + 0.6, M.box, true);
  box(A.x2 - 0.8, A.x2 - 0.1, A.floor, A.floor + 0.6, A.z1 + 0.1, A.z1 + 0.7, M.box, true);
  const tripod = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35), M.metal);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.18, 0.66, Math.sin(a) * 0.18);
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    tripod.add(leg);
  }
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.24), M.plastic);
  camBody.position.y = 1.36;
  tripod.add(camBody);
  tripod.position.set(5.0, A.floor, 3.75);
  tripod.lookAt(S.x1 - 0.2, A.floor, 5.4);
  scene.add(tripod);
  const tripodLed = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2) }));
  tripodLed.position.set(0.04, 1.4, 0.12);
  tripod.add(tripodLed);
  colliders.push({ minX: 4.8, maxX: 5.2, minZ: 3.55, maxZ: 3.95, minY: A.floor, maxY: A.floor + 1.5 });
  // a cassette on the boxes: the next tape, not this one
  const tape04 = new THREE.Group();
  tape04.add(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.105), M.plastic));
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 64, (g) => {
      g.fillStyle = '#efe9d8'; g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#1d1d26'; g.font = 'italic bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TAPE 04', 128, 34);
    }), roughness: 0.6,
  }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.0135;
  tape04.add(label);
  tape04.position.set(A.x1 + 0.38, A.floor + 0.865, A.z1 + 0.42);
  tape04.rotation.y = 0.3;
  scene.add(tape04);
  // floor lamp
  box(0.45, 0.55, 0, 1.5, 5.2, 5.3, M.metal);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.3, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0x302820, side: THREE.DoubleSide }));
  lampShade.position.set(0.5, 1.55, 5.25);
  scene.add(lampShade);
  // the television's screen shows the room, from the corner, live
  const feed = new THREE.WebGLRenderTarget(320, 240);
  const feedCam = new THREE.PerspectiveCamera(62, 4 / 3, 0.1, 30);
  feedCam.position.set(0.35, 2.3, 5.65);
  feedCam.lookAt(3.6, 0.7, 1.6);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ map: feed.texture, color: new THREE.Color(1.3, 1.4, 1.3) }));
  screen.position.set(2.7, 0.83, 0.625);
  scene.add(screen);
  const cornerCam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), M.plastic);
  cornerCam.position.copy(feedCam.position);
  cornerCam.lookAt(3.6, 0.7, 1.6);
  scene.add(cornerCam);
  const camLed = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2) }));
  camLed.position.copy(feedCam.position).add(new THREE.Vector3(0.03, -0.03, -0.05));
  scene.add(camLed);

  // ---------- kitchen ----------
  box(7.1, 12.9, 0, 0.9, 0.08, 0.7, M.paint, true);
  box(7.1, 12.9, 0.9, 0.94, 0.08, 0.72, M.counter);
  box(7.1, 8.8, 1.5, 2.2, 0.08, 0.45, M.paint);
  box(10.7, 12.9, 1.5, 2.2, 0.08, 0.45, M.paint);
  box(12.05, 12.9, 0, 1.85, 4.6, 5.85, M.porcelain, true); // fridge
  box(9.0, 10.4, 0, 0.74, 2.6, 3.6, M.darkWood, true); // table
  for (const [x, z] of [[8.6, 3.1], [10.8, 3.1]]) box(x - 0.2, x + 0.2, 0, 0.45, z - 0.2, z + 0.2, M.darkWood);

  // ---------- garage ----------
  box(17.3, 17.9, 0, 0.9, 1, 4, M.darkWood, true); // workbench
  box(13.6, 14.4, 0, 1.8, 4.6, 5.8, M.metal, true); // shelves
  for (let i = 0; i < 8; i++) box(14, 17.6, 0.1 + i * 0.27, 0.1 + i * 0.27 + 0.24, T / 2, T / 2 + 0.05, M.metal); // roll door slats
  box(15.2, 15.8, 1.1, 1.8, 6 - T / 2 - 0.12, 6 - T / 2, M.metal); // breaker panel
  const breakerLever = box(15.45, 15.55, 1.35, 1.55, 6 - T / 2 - 0.17, 6 - T / 2 - 0.12, M.plastic);
  const breaker = { pos: new THREE.Vector3(15.5, 1.45, 5.75), lever: breakerLever };

  // ---------- bedrooms, bath ----------
  box(0.15, 2.15, 0, 0.5, 10.8, 12.85, M.darkWood, true);
  box(0.2, 2.1, 0.5, 0.7, 10.85, 12.8, M.blanket);
  box(0.08, 0.15, 0, 1.2, 10.8, 12.85, M.darkWood);
  box(4.6, 5.85, 0, 1.0, 12.3, 12.85, M.darkWood, true);
  box(9.0, 10.85, 0, 0.42, 11.55, 12.85, M.paint, true);
  box(9.05, 10.8, 0.42, 0.55, 11.6, 12.8, M.kidBlanket);
  box(6.3, 6.9, 0, 0.5, 8.5, 9.2, M.kidBlanket, true); // toy chest
  box(11.2, 13.85, 0, 0.6, 12.1, 12.85, M.porcelain, true); // tub
  box(13.3, 13.85, 0, 0.85, 9.0, 9.7, M.porcelain, true); // sink

  // ---------- lights (dead until the breaker) ----------
  function lamp(x, y, z, color, base, glowMesh, alwaysOn = false) {
    const light = new THREE.PointLight(color, alwaysOn ? base : 0, 9, 2);
    light.position.set(x, y, z);
    scene.add(light);
    const entry = { light, base, area: 1, pos: light.position.clone(), on: alwaysOn, dead: !alwaysOn, flicker: 0, silent: true, glow: glowMesh, alwaysOn };
    lights.push(entry);
    return entry;
  }
  const dome = (x, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222220 }));
    m.rotation.x = Math.PI;
    m.position.set(x, H, z);
    scene.add(m);
    return m;
  };
  const roomLights = [
    lamp(0.5, 1.5, 5.25, 0xffc890, 3, lampShade),
    lamp(10, 2.3, 3, 0xfff0d8, 4, dome(10, 3)),
    lamp(7, 2.3, 7, 0xffe2b8, 3, dome(7, 7)),
    lamp(15.5, 2.3, 3, 0xfff4e0, 4, dome(15.5, 3)),
  ];
  lamp(2.7, 0.85, 1.1, 0x9fc4c8, 0.8, null, true); // the television's glow
  lamp(7.9, 1.5, 12.4, 0x8fe0e6, 1.6, null, true); // the impossible pool outside
  const moon = new THREE.DirectionalLight(0x7088b8, 0.22);
  moon.position.set(4, 6, -6);
  scene.add(moon, new THREE.HemisphereLight(0x50607a, 0x100c08, 0.06));
  const glowOn = new THREE.Color(1.8, 1.4, 1.0), glowOff = new THREE.Color(0x222220);

  // ---------- the Listener ----------
  const listenerRig = createListener();
  const listener = listenerRig.root;
  scene.add(listener);

  const roomAt = (x, z) => {
    for (const [name, r] of Object.entries(ROOMS)) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return name;
    return null;
  };

  // room-to-room route as a list of doorway points (breadth first; the house is small)
  function route(from, to) {
    const a = roomAt(from.x, from.z), b = roomAt(to.x, to.z);
    if (!a || !b || a === b) return [];
    const prev = { [a]: null };
    const queue = [a];
    while (queue.length) {
      const r = queue.shift();
      if (r === b) break;
      for (const d of DOORS) {
        const next = d[0] === r ? d[1] : d[1] === r ? d[0] : null;
        if (next && !(next in prev)) { prev[next] = { r, d }; queue.push(next); }
      }
    }
    const pts = [];
    for (let r = b; prev[r]; r = prev[r].r) pts.unshift(new THREE.Vector3(prev[r].d[2], 0, prev[r].d[3]));
    return pts;
  }

  let power = false;
  function setPower(on) {
    power = on;
    for (const l of roomLights) { l.dead = !on; l.flicker = on ? 0.8 : 0; }
    vcrLight.material.color.set(on ? 0xff2200 : 0x220000);
  }

  async function bakeProbes(renderer, compile) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const mats = Object.values(M);
    const placeholder = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1);
    for (const m of mats) { m.envMap = placeholder.texture; m.needsUpdate = true; }
    await compile();
    // bake with the lights on, so surfaces keep some sheen in the dark
    for (const l of roomLights) l.light.intensity = l.base;
    listener.visible = false;
    scene.position.set(-7, -1.3, -4);
    scene.updateMatrixWorld(true);
    const rt = pmrem.fromScene(scene, 0.02, 0.1, 30);
    for (const m of mats) m.envMap = rt.texture;
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    listener.visible = true;
    for (const l of roomLights) l.light.intensity = 0;
    placeholder.dispose();
    pmrem.dispose();
  }

  let feedTimer = 0;
  // the corner camera: rendered into the television, with the player's whole body in shot
  function renderFeed(renderer, body, camera, dt) {
    feedTimer -= dt;
    if (feedTimer > 0 || camera.position.distanceTo(screen.position) > 9) return;
    feedTimer = 1 / 15;
    const prevTarget = renderer.getRenderTarget();
    if (body) body.whole.value = 1;
    renderer.setRenderTarget(feed);
    renderer.render(scene, feedCam);
    renderer.setRenderTarget(prevTarget);
    if (body) body.whole.value = 0;
  }

  function update(dt, t) {
    for (const l of lights) {
      let k = l.dead ? 0 : 1;
      if (!l.dead && l.flicker > 0) {
        l.flicker -= dt;
        k = Math.sin(t * 71.3 + l.pos.x * 3) * Math.sin(t * 23.1) > 0.1 ? 1 : 0.05;
      }
      l.on = k > 0.5;
      l.light.intensity = l.base * k;
      if (l.glow) l.glow.material.color.copy(k > 0.5 ? glowOn : glowOff);
    }
    camLed.visible = Math.floor(t * 1.5) % 2 === 0;
    if (wrong.opening && wrong.open < 1) {
      wrong.open = Math.min(1, wrong.open + dt / 1.2);
      wrong.pivot.rotation.y = -1.3 * THREE.MathUtils.smoothstep(wrong.open, 0, 1); // swings out into the hall
    }
  }

  function reset() {
    setPower(false);
    for (const l of roomLights) l.flicker = 0;
    wrong.opening = false;
    wrong.open = 0;
    wrong.pivot.rotation.y = 0;
    listenerRig.setScare(0);
  }

  return {
    colliders, lights, update, reset, ready, bakeProbes, renderFeed, setPower,
    get power() { return power; },
    zoneAt: (x, z) => roomAt(x, z) ?? 'hall',
    floorAt: (x, z) => ROOMS[roomAt(x, z)]?.floor ?? 'wood',
    // ground depends on height too: under the attic is the living room floor
    groundAt(x, z, y = 0) {
      const S = STAIR, A = ATTIC;
      if (x >= S.x0 && x <= A.x2 && z >= S.z1 && z <= S.z2) {
        return S.rise * (Math.min(S.n - 1, Math.floor((x - S.x0) / S.run)) + 1);
      }
      if (y > 1.5 && x >= A.x1 && x <= A.x2 && z >= A.z1 && z <= A.z2) return A.floor;
      return 0;
    },
    tape04: { pos: new THREE.Vector3(3.88, ATTIC.floor + 0.88, 2.92) },
    inPool: () => false,
    roomAt, route, rooms: ROOMS,
    spawn: { pos: new THREE.Vector3(1.5, 0, 1.3), yaw: Math.PI },
    vcr: { pos: new THREE.Vector3(2.7, 0.4, 0.62) },
    frontDoor: { pos: new THREE.Vector3(1.5, 1.1, 0.05), mesh: frontDoor },
    breaker, wrong,
    clockPos: new THREE.Vector3(6.5, 1.8, 0.3),
    listener, listenerRig,
  };
}
