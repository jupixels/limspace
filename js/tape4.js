import * as THREE from 'three';
import { createSwimmer, createOccupant, createListener } from './creatures.js';

// Tape 04 "PLAYBACK": short pieces of the first three tapes spliced end to end along -Z,
// then the tape's white leader. Each splice is a checkpoint.
const FLOOR = -1.55; // pool floor (water surface is the shared WATER_Y)
export const SECTIONS = [
  { name: 'pool4', z1: 0, z2: -26, entry: -1 }, // entry: where a rewind puts you
  { name: 'hotel4', z1: -28, z2: -60, entry: -29 },
  { name: 'house4', z1: -62, z2: -80, entry: -63 },
  { name: 'leader', z1: -82, z2: -140, entry: -83 },
];
const POOL = { x: 2.6, z1: -3, z2: -23, run: 0.4, rise: 0.3875 };
const HOTEL_W = 1.3, HOUSE_W = 4;
const DOOR = 0.65; // half-width of the splice doorways

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
  draw(c.getContext('2d'), w, h, c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTape4(scene) {
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
    tile: pbr('Tiles133A', 1.5, { roughness: 0.5 }),
    poolTile: pbr('Tiles132A', 1.5, { roughness: 0.6 }),
    deck: pbr('Tiles133B', 1.5, { roughness: 0.4 }),
    wallpaper: pbr('Wallpaper002A', 1.0, { color: 0xd8c28c, roughness: 1 }),
    carpet: pbr('Carpet008', 1.4, { color: 0xc9a77a, roughness: 1 }),
    ceilingTile: pbr('OfficeCeiling001', 1.2, { color: 0xcfc6b0, roughness: 1 }),
    houseWall: pbr('Wallpaper002A', 1.0, { color: 0xb3b892, roughness: 1 }),
    wood: pbr('WoodFloor051', 1.6, { roughness: 0.7 }),
    plaster: pbr('Wallpaper002A', 1.4, { color: 0xd9d4c4, roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3e2b1b, roughness: 0.45 }),
    door: new THREE.MeshStandardMaterial({ color: 0xcdbf9f, roughness: 0.6 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9, emissive: 0x9a9a96 }),
    housing: new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.6 }),
  };

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
  function light(x, y, z, color, base, dist = 12) {
    const l = new THREE.PointLight(color, base, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
    const e = { light: l, base, area: 1, pos: l.position.clone(), on: true, dead: false, flicker: 0, silent: true };
    lights.push(e);
    return e;
  }
  const panel = (x, y, z, w, d) => {
    box(x - w / 2 - 0.05, x + w / 2 + 0.05, y, y + 0.06, z - d / 2 - 0.05, z + d / 2 + 0.05, M.housing);
    box(x - w / 2, x + w / 2, y - 0.01, y, z - d / 2, z + d / 2, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.2) }));
  };
  // a wall across z with a doorway in the middle
  const endWall = (z, w, h, mat, back = 1) => {
    box(-w - 0.2, -DOOR, 0, h, z, z + back * 0.2, mat, true);
    box(DOOR, w + 0.2, 0, h, z, z + back * 0.2, mat, true);
    box(-DOOR, DOOR, 2.2, h, z, z + back * 0.2, mat);
  };
  // the black splice between two pieces of tape
  const splice = (z1, z2) => {
    box(-DOOR - 0.2, -DOOR, 0, 2.2, z1, z2, M.black, true);
    box(DOOR, DOOR + 0.2, 0, 2.2, z1, z2, M.black, true);
    box(-DOOR, DOOR, 2.2, 2.4, z1, z2, M.black);
    box(-DOOR, DOOR, -0.1, 0, z1, z2, M.black);
  };

  // ---------- 1: the pool, one long chest-deep lane ----------
  const P = POOL;
  box(-P.x, P.x, -0.3, 0, 0, P.z1, M.deck);
  box(-P.x, P.x, -0.3, 0, P.z2, -26, M.deck);
  box(-P.x, P.x, FLOOR - 0.3, FLOOR, P.z1, P.z2, M.poolTile);
  for (const s of [-1, 1]) box(s * P.x, s * (P.x + 0.2), FLOOR - 0.3, 5, 0.2, -26, M.tile, true);
  box(-P.x - 0.2, P.x + 0.2, 0, 5, 0, 0.2, M.tile, true);
  box(-P.x - 0.2, P.x + 0.2, 5, 5.2, 0.2, -26, M.plaster);
  endWall(-26, P.x, 5, M.tile, -1);
  for (let i = 0; i < 4; i++) {
    const top = -P.rise * (i + 1);
    box(-P.x, P.x, FLOOR, top, P.z1 - P.run * i, P.z1 - P.run * (i + 1), M.poolTile);
    box(-P.x, P.x, FLOOR, top, P.z2 + P.run * i, P.z2 + P.run * (i + 1), M.poolTile);
  }
  box(-P.x, P.x, -1.1, -0.95, P.z1 - 0.001, P.z1 - 0.005, M.trim); // depth mark
  const wn = canvasTex(64, 64, (g) => { g.fillStyle = '#7fb7b4'; g.fillRect(0, 0, 64, 64); });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(P.x * 2, P.z1 - P.z2),
    new THREE.MeshStandardMaterial({ map: wn, color: 0x2b6f78, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, depthWrite: false }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.25, (P.z1 + P.z2) / 2);
  scene.add(water);
  const underside = water.clone();
  underside.material = water.material.clone();
  underside.material.side = THREE.BackSide;
  underside.material.opacity = 0.8;
  underside.visible = false;
  scene.add(underside);
  for (const z of [-4, -13, -22]) { panel(0, 4.94, z, 0.5, 2.2); light(0, 4.6, z, 0xdff6f0, 10, 16); }

  splice(-26.2, -27.8);

  // ---------- 2: the corridor, straight this time ----------
  const W = HOTEL_W;
  box(-W, W, -0.1, 0, -28, -60, M.carpet);
  box(-W, W, 2.6, 2.7, -28, -60, M.ceilingTile);
  for (const s of [-1, 1]) {
    box(s * W, s * (W + 0.2), 0, 2.6, -28, -60, M.wallpaper, true);
    box(s * W, s * (W - 0.015), 0, 0.95, -28, -60, M.trim);
    for (let z = -31; z > -59; z -= 4) {
      box(s * (W - 0.01), s * (W - 0.05), 0, 2.15, z - 0.48, z + 0.48, M.door);
      box(s * (W - 0.01), s * (W - 0.06), 0, 2.2, z - 0.55, z - 0.48, M.trim);
      box(s * (W - 0.01), s * (W - 0.06), 0, 2.2, z + 0.48, z + 0.55, M.trim);
    }
  }
  endWall(-28, W, 2.6, M.wallpaper);
  endWall(-60, W, 2.6, M.wallpaper, -1);
  for (const z of [-33, -41, -49, -57]) { panel(0, 2.6, z, 1.2, 0.5); light(0, 2.3, z, 0xffe7c2, 4.5, 9); }

  splice(-60.2, -61.8);

  // ---------- 3: the house, a dark living room ----------
  const H = HOUSE_W;
  box(-H, H, -0.1, 0, -62, -80, M.wood);
  box(-H, H, 2.5, 2.6, -62, -80, M.plaster);
  for (const s of [-1, 1]) box(s * H, s * (H + 0.2), 0, 2.5, -62, -80, M.houseWall, true);
  endWall(-62, H, 2.5, M.houseWall);
  endWall(-80, H, 2.5, M.houseWall, -1);
  box(-3.2, -1.2, 0, 0.45, -66, -66.9, M.fabric, true);
  box(-3.2, -1.2, 0.45, 0.95, -66.7, -66.9, M.fabric);
  box(1.5, 3.2, 0, 0.5, -71, -72.2, M.plastic, true);
  const tvScreenTex = canvasTex(96, 72, (g) => { g.fillStyle = '#556'; g.fillRect(0, 0, 96, 72); });
  const houseTv = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: tvScreenTex, color: new THREE.Color(1.4, 1.4, 1.5) }));
  houseTv.position.set(2.35, 0.8, -71);
  scene.add(houseTv);
  box(2.0, 2.7, 0.5, 1.05, -71.05, -71.6, M.plastic);
  box(-3.5, -2.6, 0, 0.75, -76, -77.2, M.trim, true);
  light(2.35, 0.9, -70.4, 0x9fc4c8, 1.2, 6);
  light(-3.4, 1.5, -64, 0xffc890, 0.9, 6);
  const moon = new THREE.DirectionalLight(0x7088b8, 0.18);
  moon.position.set(4, 6, -60);
  scene.add(moon);

  splice(-80.2, -81.8);

  // ---------- 4: the leader, white and endless ----------
  box(-30, 30, -0.1, 0, -82, -150, M.white);
  colliders.push({ minX: -7, maxX: -6.8, minZ: -150, maxZ: -82, minY: 0, maxY: 3 });
  colliders.push({ minX: 6.8, maxX: 7, minZ: -150, maxZ: -82, minY: 0, maxY: 3 });
  colliders.push({ minX: -7, maxX: 7, minZ: -142, maxZ: -141.8, minY: 0, maxY: 3 });
  // the last television, on a little table
  box(-0.35, 0.35, 0, 0.6, -132.3, -132.9, M.trim, true);
  box(-0.32, 0.32, 0.6, 1.05, -132.35, -132.85, M.plastic);
  const endCanvas = document.createElement('canvas');
  endCanvas.width = 160;
  endCanvas.height = 120;
  const endTex = new THREE.CanvasTexture(endCanvas);
  endTex.colorSpace = THREE.SRGBColorSpace;
  const endScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.37), new THREE.MeshBasicMaterial({ map: endTex, color: new THREE.Color(1.5, 1.5, 1.5) }));
  endScreen.position.set(0, 0.83, -132.34);
  scene.add(endScreen);
  const leaderLight = light(0, 6, -110, 0xffffff, 1, 1);
  leaderLight.light.intensity = 0;
  leaderLight.pos.set(0, 1.6, -110);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.35));

  // ---------- inhabitants ----------
  const swimmerRig = createSwimmer();
  swimmerRig.root.position.set(0, FLOOR + 0.3, -15);
  swimmerRig.root.rotation.set(0, 0, 0);
  scene.add(swimmerRig.root);
  const occupantRig = createOccupant();
  occupantRig.root.position.set(0, 0, -52);
  scene.add(occupantRig.root);
  const listenerRig = createListener();
  listenerRig.root.position.set(0, 0, -75);
  scene.add(listenerRig.root);
  // in the white they're only watching
  const witnesses = [createSwimmer(), createOccupant(), createListener()];
  witnesses[0].root.position.set(-4.5, 0.3, -104);
  witnesses[0].root.rotation.y = Math.PI * 0.85;
  witnesses[1].root.position.set(4.8, 0, -114);
  witnesses[2].root.position.set(-3.6, 0, -124);
  witnesses.forEach((w) => scene.add(w.root));
  const occupantBlock = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 2.4, off: true };
  colliders.push(occupantBlock);

  const inPool = (x, z) => Math.abs(x) < P.x && z < P.z1 && z > P.z2;
  function groundAt(x, z) {
    if (!inPool(x, z)) return 0;
    if (z > P.z1 - P.run * 4) return -P.rise * (Math.min(3, Math.floor((P.z1 - z) / P.run)) + 1);
    if (z < P.z2 + P.run * 4) return -P.rise * (Math.min(3, Math.floor((z - P.z2) / P.run)) + 1);
    return FLOOR;
  }
  const sectionAt = (z) => SECTIONS.findIndex((s) => z <= s.z1 + 0.01 && z >= s.z2 - 2);

  async function bakeProbes(renderer, compile) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const mats = Object.values(M).filter((m) => m.isMeshStandardMaterial);
    const placeholder = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1);
    for (const m of mats) { m.envMap = placeholder.texture; m.needsUpdate = true; }
    await compile();
    scene.position.set(0, -1.5, 13);
    scene.updateMatrixWorld(true);
    const rt = pmrem.fromScene(scene, 0.02, 0.1, 30);
    for (const m of mats) { m.envMap = rt.texture; m.envMapIntensity = 0.6; }
    M.white.envMapIntensity = 0;
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    placeholder.dispose();
    pmrem.dispose();
  }

  let screenT = 0;
  function update(dt, t, underwater, focus) {
    water.visible = !underwater;
    underside.visible = underwater;
    // televisions: snow; the last one shows the title through it
    screenT -= dt;
    if (screenT <= 0) {
      screenT = 1 / 15;
      for (const [tex, w, h, title] of [[tvScreenTex, 96, 72, false], [endTex, 160, 120, true]]) {
        const g = tex.image.getContext('2d');
        const img = g.createImageData(w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * (title ? 120 : 255);
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        if (title) {
          g.fillStyle = 'rgba(240,240,240,0.9)';
          g.font = '22px VT323, monospace';
          g.textAlign = 'center';
          g.fillText('L I M S P A C E', w / 2, h / 2 + 6);
        }
        tex.needsUpdate = true;
      }
    }
    for (const l of lights) {
      let k = l.dead ? 0 : 1;
      if (!l.dead && l.flicker > 0) {
        l.flicker -= dt;
        k = Math.sin(t * 77.1 + l.pos.z) * Math.sin(t * 21.3) > 0.1 ? 1 : 0.05;
      }
      l.on = k > 0.5;
      if (l !== leaderLight) l.light.intensity = l.base * k;
    }
    // the witnesses turn their heads to follow you
    for (const w of witnesses) w.update(dt, t, focus, focus && focus.z < -90 ? 1 : 0);
  }

  function reset() {
    for (const l of lights) { l.dead = false; l.flicker = 0; }
    for (const r of [swimmerRig, occupantRig, listenerRig]) r.setScare(0);
    swimmerRig.setReach?.(0);
    occupantBlock.off = true;
  }

  return {
    colliders, lights, update, reset, ready, bakeProbes, groundAt, inPool,
    zoneAt: (x, z) => SECTIONS[Math.max(0, sectionAt(z))].name,
    floorAt: (x, z) => ['tile', 'carpet', 'wood', 'tile'][Math.max(0, sectionAt(z))],
    sectionAt,
    // the leader is white all the way out
    fogAt: (p) => (p.z < -81 ? { color: new THREE.Color(0xe8e8e4), density: 0.035, background: new THREE.Color(0xe8e8e4) } : null),
    spawn: { pos: new THREE.Vector3(0, 0, -1), yaw: 0 },
    pool: P, poolFloor: FLOOR,
    swimmerRig, occupantRig, listenerRig, occupantBlock,
    endTv: { pos: new THREE.Vector3(0, 0.83, -132.34) },
    houseBounds: { x: HOUSE_W - 0.6, z1: -63.5, z2: -78.5 },
  };
}
