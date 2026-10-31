import * as THREE from 'three';
import { createOccupant } from './creatures.js';

// Tape 02: a hotel corridor with no end. One segment is built three times end to end and the
// player is shifted back by a segment whenever they walk off either end, so it loops seamlessly.
export const SEG = 48;
const W = 1.3; // corridor half-width
const H = 2.6;
const WALL = 0.2;
const DOOR = { half: 0.475, jamb: 0.07, h: 2.15 };
const DOORS = 12; // per side per segment, 4 m apart
const FIX = { first: 3, step: 6, count: SEG / 6 }; // ceiling panels at z = 3 + 6n
const MOVING_LIGHTS = 7;
const EXIT_INDEX = 7; // left door 215, at z = 6
const doorZ = (i) => (i - 5.5) * 4;
const EXIT_Z = doorZ(EXIT_INDEX);
const ROOM = { x1: -5.9, x2: -W - WALL, z1: EXIT_Z - 2.6, z2: EXIT_Z + 2.6 };

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

function doorTexture(number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 580;
  const g = c.getContext('2d');
  g.fillStyle = '#cdbf9f';
  g.fillRect(0, 0, 256, 580);
  // two recessed panels
  for (const [y, h] of [[40, 230], [310, 230]]) {
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(34, y, 188, h);
    g.fillStyle = '#c4b594';
    g.fillRect(40, y + 6, 176, h - 12);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(40, y + 6, 176, 4);
  }
  // grime along the bottom and around the handle
  const grad = g.createLinearGradient(0, 480, 0, 580);
  grad.addColorStop(0, 'rgba(60,45,25,0)');
  grad.addColorStop(1, 'rgba(60,45,25,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 480, 256, 100);
  // brass number plate
  g.fillStyle = '#7a5a22';
  g.fillRect(83, 150, 90, 44);
  g.fillStyle = '#d8b25a';
  g.fillRect(86, 153, 84, 38);
  g.fillStyle = '#2a1d08';
  g.font = 'bold 32px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 128, 173);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildHotel(scene) {
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
    wall: pbr('Wallpaper002A', 1.0, { color: 0xd8c28c, roughness: 1, envMapIntensity: 0.5 }),
    carpet: pbr('Carpet008', 1.4, { color: 0xc9a77a, roughness: 1, envMapIntensity: 0.3 }),
    ceiling: pbr('OfficeCeiling001', 1.2, { color: 0xcfc6b0, roughness: 1, envMapIntensity: 0.4 }),
    wainscot: new THREE.MeshStandardMaterial({ color: 0x6e5236, roughness: 0.55, envMapIntensity: 0.6 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3e2b1b, roughness: 0.45, envMapIntensity: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.3, metalness: 1 }),
    housing: new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.6 }),
    roomWall: pbr('Wallpaper002A', 1.0, { color: 0xa89466, roughness: 1, envMapIntensity: 0.4 }),
    roomFloor: pbr('Carpet008', 1.4, { color: 0x8a6448, roughness: 1, envMapIntensity: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3221, roughness: 0.5 }),
    sheet: new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.9 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.4 }),
  };
  const doorMats = [];
  for (let i = 0; i < DOORS; i++) {
    for (const side of [-1, 1]) {
      const n = side < 0 ? 201 + 2 * i : 202 + 2 * i;
      doorMats.push({ i, side, mat: new THREE.MeshStandardMaterial({ map: doorTexture(n), roughness: 0.6, envMapIntensity: 0.5 }) });
    }
  }
  const doorMat = (i, side) => doorMats.find((d) => d.i === i && d.side === side).mat;

  function box(x1, x2, y1, y2, z1, z2, mat, collide = false) {
    [x1, x2] = [Math.min(x1, x2), Math.max(x1, x2)];
    const w = x2 - x1, h = y2 - y1, d = z2 - z1;
    const geo = new THREE.BoxGeometry(w, h, d);
    worldUVs(geo, w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    scene.add(m);
    if (collide) colliders.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, minY: y1, maxY: y2 });
    return m;
  }

  // ---------- fixtures: emissive panels everywhere, real lights only near the player ----------
  const fixtures = Array.from({ length: FIX.count }, () => ({
    dead: false, flicker: 0, mat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 1.9) }), k: 1,
  }));
  const panelColor = fixtures[0].mat.color.clone();
  const fixtureIndex = (n) => ((n % FIX.count) + FIX.count) % FIX.count;

  // wall-mounted details along a run of wall between two door openings
  function wallRun(side, z1, z2) {
    const x = side * W;
    box(x, x + side * WALL, 0, H, z1, z2, M.wall, true);
    box(x, x - side * 0.015, 0.003, 0.95, z1 + 0.003, z2 - 0.003, M.wainscot);
    box(x, x - side * 0.035, 0.95, 1.0, z1, z2, M.trim);
    box(x, x - side * 0.025, 0, 0.12, z1, z2, M.trim);
    // a sconce halfway along
    const zm = (z1 + z2) / 2;
    if (z2 - z1 > 2) {
      box(x - side * 0.01, x - side * 0.07, 1.62, 1.66, zm - 0.05, zm + 0.05, M.brass);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.14, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.6), side: THREE.DoubleSide }));
      shade.position.set(x - side * 0.1, 1.74, zm);
      scene.add(shade);
    }
  }

  const exit = { pivot: null, block: null, open: 0, opening: false, z: EXIT_Z, pos: new THREE.Vector3(-W - 0.1, 1.1, EXIT_Z) };

  function door(side, i, oz, isExit) {
    const zc = oz + doorZ(i), x = side * W;
    const open = DOOR.half + DOOR.jamb;
    box(x, x + side * WALL, DOOR.h + DOOR.jamb, H, zc - open, zc + open, M.wall);
    box(x - side * 0.04, x + side * 0.12, 0, DOOR.h, zc - open, zc - DOOR.half, M.trim);
    box(x - side * 0.04, x + side * 0.12, 0, DOOR.h, zc + DOOR.half, zc + open, M.trim);
    box(x - side * 0.04, x + side * 0.12, DOOR.h, DOOR.h + DOOR.jamb, zc - open, zc + open, M.trim);
    const block = { minX: Math.min(x, x + side * WALL), maxX: Math.max(x, x + side * WALL), minZ: zc - open, maxZ: zc + open, minY: 0, maxY: DOOR.h };
    colliders.push(block);
    // the panel hangs from a hinge so the exit door can swing into its room
    const pivot = new THREE.Group();
    pivot.position.set(side * (W + 0.1), 0, zc - DOOR.half);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, DOOR.h, DOOR.half * 2), [M.trim, M.trim, M.trim, M.trim, doorMat(i, side), doorMat(i, side)]);
    // box faces 0/1 are +x/-x: the corridor sees the face pointing back toward the corridor
    panel.material = side < 0
      ? [doorMat(i, side), M.trim, M.trim, M.trim, M.trim, M.trim]
      : [M.trim, doorMat(i, side), M.trim, M.trim, M.trim, M.trim];
    panel.position.set(0, DOOR.h / 2, DOOR.half);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.brass);
    knob.position.set(-side * 0.04, 1.0 - DOOR.h / 2, DOOR.half * 0.75);
    panel.add(knob);
    pivot.add(panel);
    scene.add(pivot);
    if (isExit) { exit.pivot = pivot; exit.block = block; }
  }

  function segment(oz) {
    // floor, ceiling
    box(-W, W, -0.1, 0, oz - SEG / 2, oz + SEG / 2, M.carpet);
    box(-W, W, H, H + 0.1, oz - SEG / 2, oz + SEG / 2, M.ceiling);
    // walls broken by doors
    for (const side of [-1, 1]) {
      let z = oz - SEG / 2;
      for (let i = 0; i < DOORS; i++) {
        const zc = oz + doorZ(i);
        wallRun(side, z, zc - DOOR.half - DOOR.jamb);
        door(side, i, oz, oz === 0 && side < 0 && i === EXIT_INDEX);
        z = zc + DOOR.half + DOOR.jamb;
      }
      wallRun(side, z, oz + SEG / 2);
    }
    // ceiling panels
    for (let n = 0; n < FIX.count; n++) {
      const z = oz - SEG / 2 + FIX.first + n * FIX.step;
      const gn = Math.round((z - FIX.first) / FIX.step);
      box(-0.7, 0.7, H - 0.04, H, z - 0.32, z + 0.32, M.housing);
      box(-0.62, 0.62, H - 0.05, H - 0.04, z - 0.26, z + 0.26, fixtures[fixtureIndex(gn)].mat);
    }
  }
  for (const k of [-1, 0, 1]) segment(k * SEG);

  // ---------- room 215, behind the exit door ----------
  const R = ROOM;
  box(R.x1, R.x2, -0.1, 0, R.z1, R.z2, M.roomFloor);
  box(-W - WALL, -W, -0.1, 0, EXIT_Z - DOOR.half, EXIT_Z + DOOR.half, M.trim); // threshold
  box(R.x1, R.x2, H, H + 0.1, R.z1, R.z2, M.ceiling);
  box(R.x1 - WALL, R.x1, 0, H, R.z1 - WALL, R.z2 + WALL, M.roomWall, true);
  box(R.x1, R.x2, 0, H, R.z1 - WALL, R.z1, M.roomWall, true);
  box(R.x1, R.x2, 0, H, R.z2, R.z2 + WALL, M.roomWall, true);
  // bed with headboard against the back wall
  box(R.x1, R.x1 + 0.06, 0, 1.15, 6.5, 8.2, M.wood);
  box(R.x1 + 0.06, R.x1 + 2.1, 0, 0.42, 6.55, 8.15, M.wood, true);
  box(R.x1 + 0.06, R.x1 + 2.05, 0.42, 0.6, 6.6, 8.1, M.sheet);
  box(R.x1 + 0.15, R.x1 + 0.55, 0.6, 0.72, 6.75, 7.3, M.sheet);
  box(R.x1 + 0.15, R.x1 + 0.55, 0.6, 0.72, 7.45, 8.0, M.sheet);
  // nightstand and lamp
  box(R.x1, R.x1 + 0.5, 0, 0.55, R.z2 - 0.5, R.z2 - 0.02, M.wood, true);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.2, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.7), side: THREE.DoubleSide }));
  lampShade.position.set(R.x1 + 0.25, 0.85, R.z2 - 0.26);
  scene.add(lampShade);
  box(R.x1 + 0.23, R.x1 + 0.27, 0.55, 0.75, R.z2 - 0.28, R.z2 - 0.24, M.brass);
  // dresser and the television, facing the door
  box(R.x1, R.x1 + 0.55, 0, 0.8, 3.75, 5.25, M.wood, true);
  box(R.x1 + 0.05, R.x1 + 0.53, 0.8, 1.26, 4.15, 4.85, M.plastic);
  const tvCanvas = document.createElement('canvas');
  tvCanvas.width = 96;
  tvCanvas.height = 72;
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  tvTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3),
    new THREE.MeshBasicMaterial({ map: tvTex, color: new THREE.Color(1.6, 1.6, 1.7) }));
  screen.rotation.y = Math.PI / 2;
  screen.position.set(R.x1 + 0.535, 1.03, 4.5);
  scene.add(screen);
  const tv = { pos: new THREE.Vector3(R.x1 + 0.55, 1.03, 4.5), screen, on: true };

  // ---------- lights ----------
  const moving = [];
  for (let i = 0; i < MOVING_LIGHTS; i++) {
    const light = new THREE.PointLight(0xffe7c2, 5, 11, 2);
    light.position.set(0, H - 0.3, 0);
    scene.add(light);
    const entry = { region: 'corridor', light, base: 5, area: 1, pos: light.position, on: true, dead: false, flicker: 0, moving: true };
    lights.push(entry);
    moving.push(entry);
  }
  const roomLamp = new THREE.PointLight(0xffc58a, 2.2, 7, 2);
  roomLamp.position.set(R.x1 + 0.3, 1.1, R.z2 - 0.3);
  const tvLight = new THREE.PointLight(0x9fb8ff, 0, 6, 2);
  tvLight.position.set(R.x1 + 1.0, 1.05, 4.5);
  scene.add(roomLamp, tvLight);
  lights.push({ region: 'room', light: roomLamp, base: 2.2, area: 1, pos: roomLamp.position.clone(), on: true, dead: false, flicker: 0 });
  const tvEntry = { region: 'room', light: tvLight, base: 2.4, area: 1, pos: tvLight.position.clone(), on: false, dead: true, flicker: 0 };
  lights.push(tvEntry);

  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a2016, 0.15));

  // ---------- the Occupant ----------
  const occupantRig = createOccupant();
  const occupant = occupantRig.root;
  occupant.visible = false;
  scene.add(occupant);
  const occupantBlock = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 2.4, off: true };
  colliders.push(occupantBlock);

  function zoneAt(x) {
    return x < -W - 0.05 ? 'room' : 'corridor2';
  }

  async function bakeProbes(renderer, compile) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const corridorMats = [M.wall, M.carpet, M.ceiling, M.wainscot, M.trim, M.brass, M.housing, ...doorMats.map((d) => d.mat)];
    const roomMats = [M.roomWall, M.roomFloor, M.wood, M.sheet, M.plastic];
    const probes = [[new THREE.Vector3(0, 1.4, 0), corridorMats], [new THREE.Vector3(-3.7, 1.3, EXIT_Z), roomMats]];
    const placeholder = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1);
    for (const [, mats] of probes) for (const m of mats) { m.envMap = placeholder.texture; m.needsUpdate = true; }
    await compile();
    occupant.visible = false;
    placeLights(0);
    for (const [p, mats] of probes) {
      scene.position.set(-p.x, -p.y, -p.z);
      scene.updateMatrixWorld(true);
      const rt = pmrem.fromScene(scene, 0.01, 0.1, 40);
      for (const m of mats) m.envMap = rt.texture;
      await new Promise((r) => setTimeout(r, 0));
    }
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    placeholder.dispose();
    pmrem.dispose();
  }

  // the real lights take the places of the panels nearest the camera
  function placeLights(z) {
    const n0 = Math.round((z - FIX.first) / FIX.step);
    for (let m = -3; m <= 3; m++) {
      const n = n0 + m;
      const l = moving[((n % MOVING_LIGHTS) + MOVING_LIGHTS) % MOVING_LIGHTS];
      l.light.position.z = FIX.first + n * FIX.step;
      l.fixture = fixtures[fixtureIndex(n)];
    }
  }

  let tvTimer = 0;
  function update(dt, t, underwater, focus) {
    for (const f of fixtures) {
      let k = 1;
      if (f.dead) k = 0;
      else if (f.flicker > 0) {
        f.flicker -= dt;
        k = Math.sin(t * 83.1 + f.mat.id) * Math.sin(t * 29.7) > 0.05 ? 1 : 0.03;
      }
      f.k = k;
      f.mat.color.copy(panelColor).multiplyScalar(Math.max(k, 0.02));
    }
    placeLights(focus ? focus.z : 0);
    for (const l of moving) {
      const k = l.fixture ? l.fixture.k : 1;
      l.on = k > 0.5;
      l.light.intensity = l.base * k;
    }
    if (exit.opening && exit.open < 1) {
      exit.open = Math.min(1, exit.open + dt / 3.5);
      exit.pivot.rotation.y = -1.25 * THREE.MathUtils.smoothstep(exit.open, 0, 1) - 0.02 * Math.sin(t * 9) * (1 - exit.open);
      exit.block.off = exit.open > 0.4;
    }
    // the television: snow, and a cold light that pulses with it
    if (tv.on) {
      tvTimer -= dt;
      if (tvTimer <= 0) {
        tvTimer = 1 / 20;
        const g = tvCanvas.getContext('2d');
        const img = g.createImageData(96, 72);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        tvTex.needsUpdate = true;
      }
      tvEntry.dead = !exit.opening;
      tvEntry.on = !tvEntry.dead;
      tvLight.intensity = tvEntry.dead ? 0 : tvEntry.base * (0.75 + Math.random() * 0.5);
    }
  }

  function reset() {
    for (const f of fixtures) { f.dead = false; f.flicker = 0; }
    exit.opening = false;
    exit.open = 0;
    exit.pivot.rotation.y = 0;
    exit.block.off = false;
    occupant.visible = false;
    occupantBlock.off = true;
  }

  return {
    colliders, lights, fixtures, zoneAt, update, reset, ready, bakeProbes,
    groundAt: () => 0,
    inPool: () => false,
    spawn: { pos: new THREE.Vector3(0, 0, 20), yaw: 0 },
    exit, tv, room: R, occupant, occupantRig, occupantBlock,
    doorZ, SEG, W,
  };
}
