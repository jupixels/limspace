import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, rng, chunkSeed } from './noise.js';
import { makeMaterials } from './materials.js';
import { S, BIOMES, BUILDERS, buildEdge } from './biomes.js';

const LOAD_R = 2; // chunks kept around the player in each direction
const DROP_R = 3;
const REGION = 4; // spaces cluster into regions about this many chunks across
const ORDER = ['backrooms', 'pool', 'meadow', 'mall'];
const LIGHTS = 12;

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

// An endless dream, generated a chunk at a time around wherever you are.
export class OpenWorld {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    const { M, sign, ready, bakeEnv, time } = makeMaterials();
    Object.assign(this, { M, sign, bakeEnv, time });
    this.ready = ready;
    this.chunks = new Map();
    this.queue = [];
    this.colliders = [];
    this.lights = [];
    this.spawn = { pos: new THREE.Vector3(S / 2 + 2, 0, S / 2 + 2), yaw: 0 };

    // a shared, animated "static" for every television out there
    const tvCanvas = document.createElement('canvas');
    tvCanvas.width = 64;
    tvCanvas.height = 48;
    this.tvCanvas = tvCanvas;
    this.tvTex = new THREE.CanvasTexture(tvCanvas);
    this.tvStatic = new THREE.MeshBasicMaterial({ map: this.tvTex, color: new THREE.Color(1.4, 1.4, 1.4) });

    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(light);
      this.lights.push({ light, base: 0, area: 1, pos: light.position, on: false, silent: true, moving: true, anchor: null, target: 0 });
    }
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x403828, 0.3);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 0);
    this.sun.position.set(30, 60, 20);
    scene.add(this.hemi, this.sun);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), M.sky);
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    this.fog = { color: new THREE.Color(BIOMES.backrooms.fog[0]), density: BIOMES.backrooms.fog[1], background: new THREE.Color(0) };
    this.level = { hemi: 0.35, ambient: 0.4, sky: 0, bloom: [0.5, 0.82] };
    this.lightTimer = 0;
    this.tvTimer = 0;
  }

  // ---------- where things are ----------
  biomeAt(cx, cz) {
    if (cx === 0 && cz === 0) return 'backrooms'; // everyone wakes up in the office
    const rx = Math.floor(cx / REGION), rz = Math.floor(cz / REGION);
    let best = Infinity, biome = 'backrooms';
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const gx = rx + i, gz = rz + j;
        const px = (gx + hash2(gx, gz, this.seed + 11)) * REGION, pz = (gz + hash2(gx, gz, this.seed + 23)) * REGION;
        const d = (px - cx - 0.5) ** 2 + (pz - cz - 0.5) ** 2;
        if (d < best) { best = d; biome = ORDER[Math.floor(hash2(gx, gz, this.seed + 37) * ORDER.length)]; }
      }
    }
    return biome;
  }

  chunkAt(x, z) {
    return this.chunks.get(`${Math.floor(x / S)},${Math.floor(z / S)}`);
  }

  zoneAt(x, z) { return this.chunkAt(x, z)?.biome ?? this.biomeAt(Math.floor(x / S), Math.floor(z / S)); }
  floorAt(x, z) { return BIOMES[this.zoneAt(x, z)].floor; }

  waterRect(x, z) {
    const c = this.chunkAt(x, z);
    return c?.waters.find((w) => x >= w.x1 && x <= w.x2 && z >= w.z1 && z <= w.z2) ?? null;
  }
  waterAt(x, z) { return this.waterRect(x, z)?.surface ?? null; }
  inPool(x, z) { return !!this.waterRect(x, z); }
  groundAt(x, z) { return this.waterRect(x, z)?.floor ?? 0; }

  items() {
    const out = [];
    for (const c of this.chunks.values()) out.push(...c.items);
    return out;
  }

  // ---------- building ----------
  build(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return this.chunks.get(key);
    const biome = this.biomeAt(cx, cz);
    const x0 = cx * S, z0 = cz * S;
    const r = rng(chunkSeed(cx, cz, this.seed));
    const buckets = new Map();
    const group = new THREE.Group();
    const chunk = { key, cx, cz, biome, group, colliders: [], anchors: [], waters: [], items: [], spots: [] };
    const M = this.M;
    const ctx = {
      M, r, sign: this.sign, tvStatic: this.tvStatic,
      add: (geo, mat) => {
        geo.translate(x0, 0, z0);
        if (!buckets.has(mat)) buckets.set(mat, []);
        buckets.get(mat).push(geo);
      },
      box: (x1, x2, y1, y2, z1, z2, mat, collide = false) => {
        const w = x2 - x1, h = y2 - y1, d = z2 - z1;
        if (w <= 0 || h <= 0 || d <= 0) return;
        const geo = new THREE.BoxGeometry(w, h, d);
        worldUVs(geo, w, h, d);
        geo.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        ctx.add(geo, mat);
        if (collide) chunk.colliders.push({ minX: x0 + x1, maxX: x0 + x2, minZ: z0 + z1, maxZ: z0 + z2, minY: y1, maxY: y2 });
      },
      cyl: (x, z, rTop, rBot, y1, y2, mat, seg = 16) => {
        const geo = new THREE.CylinderGeometry(rTop, rBot, y2 - y1, seg);
        geo.translate(x, (y1 + y2) / 2, z);
        ctx.add(geo, mat);
      },
      lathe: (x, z, pts, mat, seg = 32) => {
        const geo = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg);
        geo.translate(x, 0, z);
        ctx.add(geo, mat);
      },
      sphere: (x, y, z, rad, mat) => {
        const geo = new THREE.SphereGeometry(rad, 14, 10);
        geo.translate(x, y, z);
        ctx.add(geo, mat);
      },
      collide: (x1, x2, z1, z2, y1, y2) => chunk.colliders.push({ minX: x0 + x1, maxX: x0 + x2, minZ: z0 + z1, maxZ: z0 + z2, minY: y1, maxY: y2 }),
      light: (x, y, z, o) => chunk.anchors.push({ pos: new THREE.Vector3(x0 + x, y, z0 + z), ...o, seed: r() * 100 }),
      spot: (x, z) => chunk.spots.push([x0 + x, z0 + z]),
      water: (x1, x2, z1, z2, surface, floor, deep) => {
        chunk.waters.push({ x1: x0 + x1, x2: x0 + x2, z1: z0 + z1, z2: z0 + z2, surface, floor, deep });
        const plane = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
        plane.rotateX(-Math.PI / 2);
        plane.translate((x1 + x2) / 2, surface, (z1 + z2) / 2);
        ctx.add(plane, M.water);
      },
      decal: (x, z, size, color, alpha) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(size, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.scale.set(1, 0.6 + r() * 0.6, 1);
        m.position.set(x0 + x, 0.006, z0 + z);
        group.add(m);
      },
      blades: (n) => {
        const geo = new THREE.PlaneGeometry(0.6, 0.38);
        geo.translate(0, 0.19, 0);
        const cross = mergeGeometries([geo, geo.clone().rotateY(Math.PI / 2)]);
        const inst = new THREE.InstancedMesh(cross, M.blades, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          const k = 0.5 + r() * 0.7;
          p.set(x0 + r() * S, 0, z0 + r() * S);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
          s.set(k, k * (0.55 + r() * 0.6), k);
          inst.setMatrixAt(i, m4.compose(p, q, s));
        }
        inst.frustumCulled = false;
        group.add(inst);
      },
      item: (type, x, y, z, data = {}) => chunk.items.push({ type, pos: new THREE.Vector3(x0 + x, y, z0 + z), chunk: key, id: `${this.seed}:${key}:${type}:${chunk.items.length}`, ...data }),
    };

    BUILDERS[biome](ctx);
    const north = this.biomeAt(cx, cz - 1), west = this.biomeAt(cx - 1, cz);
    buildEdge(ctx, 'n', biome, north);
    buildEdge(ctx, 'w', biome, west);
    this.dress(ctx, chunk, r);

    for (const [mat, geos] of buckets) {
      const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat);
      geos.forEach((g) => g.dispose());
      group.add(mesh);
    }
    this.scene.add(group);
    this.chunks.set(key, chunk);
    this.collidersDirty = true;
    return chunk;
  }

  // the rare things worth finding: lost tapes, and telephones that ring
  dress(ctx, chunk, r) {
    if (!chunk.spots.length) return;
    const spot = () => chunk.spots.splice(Math.floor(r() * chunk.spots.length), 1)[0];
    if (r() < 0.2 && !(chunk.cx === 0 && chunk.cz === 0)) {
      const [x, z] = spot();
      const tape = new THREE.Group();
      tape.add(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.105), this.M.plastic));
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), this.M.tapeGlow);
      label.rotation.x = -Math.PI / 2;
      label.position.y = 0.0135;
      tape.add(label);
      tape.position.set(x, 0.02, z);
      tape.rotation.y = r() * Math.PI;
      tape.scale.setScalar(1.5);
      chunk.group.add(tape);
      chunk.items.push({ type: 'tape', pos: tape.position, mesh: tape, id: `${this.seed}:${chunk.key}:tape` });
    }
    if ((chunk.biome === 'backrooms' || chunk.biome === 'mall') && r() < 0.12 && chunk.spots.length) {
      const [x, z] = spot();
      const phone = new THREE.Group();
      phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), this.M.metal));
      const set = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), this.M.plastic);
      set.position.y = 0.52;
      phone.add(set);
      phone.position.set(x, 0.45, z);
      chunk.group.add(phone);
      chunk.colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, minY: 0, maxY: 1.1 });
      chunk.items.push({ type: 'phone', pos: new THREE.Vector3(x, 1, z), mesh: phone, id: `${this.seed}:${chunk.key}:phone` });
    }
  }

  drop(key) {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const it of c.items) { it.sound?.src.stop(); it.ring?.src.stop(); }
    c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isMesh && o.material?.transparent && o.material.opacity < 1 && !Object.values(this.M).includes(o.material)) o.material.dispose(); });
    this.scene.remove(c.group);
    this.chunks.delete(key);
    this.collidersDirty = true;
  }

  // Build everything near (x, z) right now: on start, and after waking somewhere new.
  prime(x, z) {
    const cx = Math.floor(x / S), cz = Math.floor(z / S);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) this.build(cx + i, cz + j);
    this.stream(x, z);
  }

  stream(x, z) {
    const cx = Math.floor(x / S), cz = Math.floor(z / S);
    const want = [];
    for (let i = -LOAD_R; i <= LOAD_R; i++) {
      for (let j = -LOAD_R; j <= LOAD_R; j++) {
        const key = `${cx + i},${cz + j}`;
        if (!this.chunks.has(key)) want.push([cx + i, cz + j, i * i + j * j]);
      }
    }
    want.sort((a, b) => a[2] - b[2]);
    this.queue = want;
    for (const [key, c] of this.chunks) {
      if (Math.abs(c.cx - cx) > DROP_R || Math.abs(c.cz - cz) > DROP_R) this.drop(key);
    }
  }

  // ---------- per frame ----------
  update(dt, t, underwater, focus) {
    this.time.value = t;
    if (!focus) return;
    // one new chunk per frame, nearest first
    this.stream(focus.x, focus.z);
    if (this.queue.length) { const [cx, cz] = this.queue.shift(); this.build(cx, cz); }
    if (this.collidersDirty) {
      this.colliders.length = 0;
      for (const c of this.chunks.values()) this.colliders.push(...c.colliders);
      this.collidersDirty = false;
    }

    // the real lights go to the fixtures nearest you, fading in and out as they move
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const anchors = [];
      for (const c of this.chunks.values()) for (const a of c.anchors) anchors.push(a);
      anchors.sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
      const near = new Set(anchors.slice(0, LIGHTS));
      for (const l of this.lights) if (l.anchor && !near.has(l.anchor)) l.anchor = null;
      for (const a of near) {
        if (this.lights.some((l) => l.anchor === a)) continue;
        const free = this.lights.find((l) => !l.anchor && l.light.intensity < 0.05) ?? this.lights.find((l) => !l.anchor);
        if (!free) break;
        free.anchor = a;
        free.light.position.copy(a.pos);
        free.light.color.setHex(a.color);
        free.light.distance = a.distance;
      }
    }
    for (const l of this.lights) {
      const a = l.anchor;
      let target = a ? a.intensity : 0;
      if (a?.flicker) target *= Math.sin(t * 61 + a.seed) * Math.sin(t * 17.3 + a.seed) > -0.2 ? 1 : 0.05;
      l.light.intensity += (target - l.light.intensity) * (1 - Math.exp(-dt * 6));
      l.on = l.light.intensity > 0.3;
      l.base = l.light.intensity;
    }

    // the air changes as you cross from one kind of place into another
    const B = BIOMES[this.zoneAt(focus.x, focus.z)];
    const k = 1 - Math.exp(-dt * 1.5);
    this.fog.color.lerp(new THREE.Color(B.fog[0]), k);
    this.fog.density += (B.fog[1] - this.fog.density) * k;
    this.fog.background.copy(this.fog.color).multiplyScalar(B.indoor ? 0.3 : 1);
    this.level.hemi += (B.hemi - this.level.hemi) * k;
    this.level.ambient += (B.ambient - this.level.ambient) * k;
    this.level.bloom[0] += (B.bloom[0] - this.level.bloom[0]) * k;
    this.level.bloom[1] += (B.bloom[1] - this.level.bloom[1]) * k;
    this.level.sky += ((B.indoor ? 0 : 1) - this.level.sky) * k;
    this.hemi.intensity = this.level.hemi;
    this.sun.intensity = this.level.sky * 1.2;
    this.sky.position.copy(focus);
    this.sky.visible = true;
    this.M.sky.color.setScalar(0.6 + 0.4 * this.level.sky);

    for (const it of this.items()) if (it.type === 'tape' && it.mesh) it.mesh.rotation.y += dt * 0.6;
    this.tvTimer -= dt;
    if (this.tvTimer <= 0) {
      this.tvTimer = 1 / 15;
      const g = this.tvCanvas.getContext('2d');
      const img = g.createImageData(64, 48);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.tvTex.needsUpdate = true;
    }
  }

  fogAt() { return this.fog; }
  ambientLevel() { return this.level.ambient; }
  reset() {}

  async bakeProbes(renderer, compile) {
    this.bakeEnv(renderer);
    this.prime(this.spawn.pos.x, this.spawn.pos.z);
    await compile();
  }

  // Wake up somewhere else entirely.
  teleport(cx, cz) {
    this.prime(cx * S + S / 2, cz * S + S / 2);
    const c = this.chunks.get(`${cx},${cz}`);
    const spot = c.spots.length ? c.spots[Math.floor(Math.random() * c.spots.length)] : [cx * S + S / 2, cz * S + S / 2];
    return new THREE.Vector3(spot[0], 0, spot[1]);
  }
}
