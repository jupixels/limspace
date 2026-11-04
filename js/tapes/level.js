import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterials } from './materials.js';

const SECTION = 32; // geometry is merged in blocks this wide, shown only near you
const VIEW = 90;
const LIGHTS = 12;
const STEP_UP = 0.6;

// Box UVs in metres, so every material tiles at its real size.
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

// One tape's place, built once by hand from its own build script.
export class Level {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.id = def.id;
    const { M, sign, ready, bakeEnv, time } = makeMaterials();
    Object.assign(this, { M, sign, bakeEnv, time });
    this.ready = ready;
    this.zones = def.zones;
    this.zoneRects = [];
    this.colliders = [];
    this.platforms = [];
    this.bases = [];
    this.roofs = [];
    this.waters = [];
    this.anchors = [];
    this.itemList = [];
    this.sections = new Map();
    this.dynamic = new THREE.Group();
    scene.add(this.dynamic);
    this.spawn = { pos: new THREE.Vector3(...def.spawn.pos), yaw: def.spawn.yaw };
    this.terrain = def.terrain ?? null;

    const tvCanvas = document.createElement('canvas');
    tvCanvas.width = 64;
    tvCanvas.height = 48;
    this.tvCanvas = tvCanvas;
    this.tvTex = new THREE.CanvasTexture(tvCanvas);
    this.tvStatic = new THREE.MeshBasicMaterial({ map: this.tvTex, color: new THREE.Color(1.4, 1.4, 1.4) });

    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(light);
      this.lights.push({ light, base: 0, pos: light.position, on: false, anchor: null });
    }
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x403828, 0.3);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 0);
    this.sun.position.set(30, 60, 20);
    scene.add(this.hemi, this.sun);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), M.sky);
    this.sky.renderOrder = -1;
    this.sky.visible = false;
    scene.add(this.sky);
    const z0 = this.zones[def.spawn.zone];
    this.fog = { color: new THREE.Color(z0.fog[0]), density: z0.fog[1], background: new THREE.Color(0) };
    this.level = { hemi: z0.hemi, ambient: z0.ambient, sky: z0.indoor === false ? 1 : 0, bloom: [...(z0.bloom ?? [0.5, 0.82])] };
    this.level.env = z0.env ?? 1;
    this.lightTimer = 0;
    this.tvTimer = 0;
    this.buckets = new Map();
    def.build(this.ctx(), this);
    this.finish();
  }

  // ---------- the build API a tape's script uses ----------
  ctx() {
    const M = this.M;
    const self = this;
    const c = {
      M, sign: this.sign, tvStatic: this.tvStatic, level: this,
      add(geo, mat) {
        geo.computeBoundingBox();
        const b = geo.boundingBox;
        const key = `${Math.floor((b.min.x + b.max.x) / 2 / SECTION)},${Math.floor((b.min.z + b.max.z) / 2 / SECTION)}`;
        if (!self.buckets.has(key)) self.buckets.set(key, new Map());
        const m = self.buckets.get(key);
        if (!m.has(mat)) m.set(mat, []);
        m.get(mat).push(geo);
      },
      box(x1, x2, y1, y2, z1, z2, mat, collide = false) {
        const w = x2 - x1, h = y2 - y1, d = z2 - z1;
        if (w <= 0 || h <= 0 || d <= 0) return;
        if (mat) {
          const geo = new THREE.BoxGeometry(w, h, d);
          worldUVs(geo, w, h, d);
          geo.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
          c.add(geo, mat);
        }
        if (collide) return c.collide(x1, x2, z1, z2, y1, y2);
      },
      collide(x1, x2, z1, z2, y1 = 0, y2 = 3) {
        const b = { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2), minY: y1, maxY: y2 };
        self.colliders.push(b);
        return b;
      },
      cyl(x, z, rTop, rBot, y1, y2, mat, seg = 16, collide = false) {
        const geo = new THREE.CylinderGeometry(rTop, rBot, y2 - y1, seg);
        geo.translate(x, (y1 + y2) / 2, z);
        c.add(geo, mat);
        if (collide) { const r = Math.max(rTop, rBot) * 0.85; c.collide(x - r, x + r, z - r, z + r, y1, y2); }
      },
      lathe(x, z, pts, mat, seg = 32) {
        const geo = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg);
        geo.translate(x, 0, z);
        c.add(geo, mat);
      },
      sphere(x, y, z, rad, mat) {
        const geo = new THREE.SphereGeometry(rad, 14, 10);
        geo.translate(x, y, z);
        c.add(geo, mat);
      },
      // rolling ground, in tiles so far-off parts can be culled
      ground(x1, x2, z1, z2, mat, tile = 25, res = 1) {
        for (let tx = x1; tx < x2; tx += tile) {
          for (let tz = z1; tz < z2; tz += tile) {
            const w = Math.min(tile, x2 - tx), d = Math.min(tile, z2 - tz);
            const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / res), Math.ceil(d / res));
            geo.rotateX(-Math.PI / 2);
            geo.translate(tx + w / 2, 0, tz + d / 2);
            const pos = geo.attributes.position, uv = geo.attributes.uv;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), z = pos.getZ(i);
              pos.setY(i, self.terrain ? self.terrain(x, z) : 0);
              uv.setXY(i, x, -z);
            }
            geo.computeVertexNormals();
            c.add(geo, mat);
          }
        }
      },
      // tufts of grass, scattered, standing on the ground
      blades(x1, x2, z1, z2, n, skip = () => false) {
        const geo = new THREE.PlaneGeometry(0.6, 0.38);
        geo.translate(0, 0.19, 0);
        const cross = mergeGeometries([geo, geo.clone().rotateY(Math.PI / 2)]);
        const inst = new THREE.InstancedMesh(cross, M.blades, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
        let k = 0;
        for (let i = 0; i < n * 3 && k < n; i++) {
          const x = x1 + Math.random() * (x2 - x1), z = z1 + Math.random() * (z2 - z1);
          if (skip(x, z)) continue;
          const s2 = 0.5 + Math.random() * 0.7;
          p.set(x, (self.terrain ? self.terrain(x, z) : 0) - 0.02, z);
          q.setFromAxisAngle(up, Math.random() * Math.PI);
          sc.set(s2, s2 * (0.55 + Math.random() * 0.6), s2);
          inst.setMatrixAt(k++, m4.compose(p, q, sc));
        }
        inst.count = k;
        inst.frustumCulled = false;
        self.dynamic.add(inst);
      },
      // a flat picture on a wall: facing is the direction it looks out ('n','s','e','w')
      plane(x, y, z, w, h, facing, mat, off = 0.01) {
        const geo = new THREE.PlaneGeometry(w, h);
        const rot = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing];
        geo.rotateY(rot);
        const n = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[facing];
        geo.translate(x + n[0] * off, y, z + n[1] * off);
        c.add(geo, mat);
      },
      // walkable floors above the ground: flat slabs and ramps (stairs)
      platform(x1, x2, z1, z2, y, collideSides = true) {
        self.platforms.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, y0: y, y1: y, axis: null });
        if (collideSides && y > 0.5) c.collide(x1, x2, z1, z2, 0, y - 0.05);
      },
      ramp(x1, x2, z1, z2, y0, y1, axis) {
        self.platforms.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, y0, y1, axis });
      },
      // the ground itself, where it isn't at zero: sunken rooms, the bottom of a pool
      floorAt(x1, x2, z1, z2, y) { self.bases.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, y }); },
      // a ceiling you can't rise through (a flooded tunnel)
      roof(x1, x2, z1, z2, y) { self.roofs.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, y }); },
      // any four-cornered surface: a sloped pool bottom, a slide
      quad(a, b, cc, d, mat, facing = [0, 1, 0]) {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...cc);
        const n = B.clone().sub(A).cross(C.clone().sub(A));
        const pts = n.dot(new THREE.Vector3(...facing)) < 0 ? [a, d, cc, b] : [a, b, cc, d];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(pts.map((p) => [p[0] + p[1] * facing[0], p[2] + p[1] * facing[2]]).flat(), 2));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeVertexNormals();
        c.add(geo, mat);
      },
      zone(x1, x2, z1, z2, key) { self.zoneRects.push({ x1, x2, z1, z2, key }); },
      light(x, y, z, o = {}) {
        const a = { pos: new THREE.Vector3(x, y, z), color: 0xfff2d8, intensity: 3, distance: 10, ...o, seed: Math.random() * 100, on: o.on ?? true };
        self.anchors.push(a);
        return a;
      },
      water(x1, x2, z1, z2, surface, floor, deep = false, mat = M.water, dynamic = false) {
        const w = { x1, x2, z1, z2, surface, floor, deep };
        self.waters.push(w);
        const plane = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
        plane.rotateX(-Math.PI / 2);
        if (dynamic) {
          // its own mesh, so the level can fall
          w.mesh = new THREE.Mesh(plane, mat);
          w.mesh.position.set((x1 + x2) / 2, surface, (z1 + z2) / 2);
          self.dynamic.add(w.mesh);
        } else {
          plane.translate((x1 + x2) / 2, surface, (z1 + z2) / 2);
          c.add(plane, mat);
        }
        return w;
      },
      decal(x, z, size, color, alpha, y = 0.006) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(size, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.scale.set(1, 0.6 + Math.random() * 0.6, 1);
        m.position.set(x, y, z);
        self.dynamic.add(m);
        return m;
      },
      // something that moves, switches or disappears: kept out of the merged geometry
      mesh(obj) { self.dynamic.add(obj); return obj; },
      item(type, x, y, z, data = {}) {
        const it = { type, pos: new THREE.Vector3(x, y, z), id: `${self.id}:${type}:${data.key ?? self.itemList.length}`, ...data };
        self.itemList.push(it);
        return it;
      },
    };
    return c;
  }

  finish() {
    for (const [key, mats] of this.buckets) {
      const [sx, sz] = key.split(',').map(Number);
      const group = new THREE.Group();
      for (const [mat, geos] of mats) {
        const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat);
        if (geos.length > 1) geos.forEach((g) => g.dispose());
        group.add(mesh);
      }
      this.scene.add(group);
      this.sections.set(key, { group, cx: (sx + 0.5) * SECTION, cz: (sz + 0.5) * SECTION });
    }
    this.buckets = null;
    // zone rectangles, bucketed so lookups stay cheap
    this.zoneIndex = new Map();
    this.zoneRects.forEach((r, i) => {
      for (let bx = Math.floor(r.x1 / 8); bx <= Math.floor((r.x2 - 1e-6) / 8); bx++) {
        for (let bz = Math.floor(r.z1 / 8); bz <= Math.floor((r.z2 - 1e-6) / 8); bz++) {
          const k = bx * 100003 + bz;
          if (!this.zoneIndex.has(k)) this.zoneIndex.set(k, []);
          this.zoneIndex.get(k).push(i);
        }
      }
    });
  }

  dispose() {
    const own = new Set(Object.values(this.M));
    const kill = (root) => root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !own.has(o.material) && o.material !== this.tvStatic) o.material.dispose?.();
    });
    for (const s of this.sections.values()) { kill(s.group); this.scene.remove(s.group); }
    kill(this.dynamic);
    this.scene.remove(this.dynamic, this.hemi, this.sun, this.sky);
    for (const l of this.lights) this.scene.remove(l.light);
    for (const m of own) { m.map?.dispose(); m.dispose?.(); }
  }

  // ---------- where things are ----------
  zoneAt(x, z) {
    const list = this.zoneIndex?.get(Math.floor(x / 8) * 100003 + Math.floor(z / 8));
    if (list) {
      for (let j = list.length - 1; j >= 0; j--) {
        const r = this.zoneRects[list[j]];
        if (x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2) return r.key;
      }
    }
    return this.lastZone ?? this.def.spawn.zone;
  }
  zone(x, z) { return this.zones[this.zoneAt(x, z)]; }
  floorAt(x, z) { return this.zone(x, z).floor; }
  // a pool that's been drained still has a bottom, but no water
  waterRect(x, z) { return this.waters.find((w) => w.surface > w.floor + 0.03 && x >= w.x1 && x <= w.x2 && z >= w.z1 && z <= w.z2) ?? null; }
  setSurface(w, y) {
    w.surface = y;
    if (w.mesh) { w.mesh.position.y = y; w.mesh.visible = y > w.floor + 0.03; }
  }
  roofAt(x, z) {
    let r = Infinity;
    for (const b of this.roofs) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.y < r) r = b.y;
    return r;
  }
  waterAt(x, z) { return this.waterRect(x, z)?.surface ?? null; }
  inPool(x, z) { return !!this.waterRect(x, z); }

  // the highest floor under (x, z) that someone standing at height y could be on
  groundAt(x, z, y = 0) {
    // the ground: zero, unless a pool or a sunken room says otherwise
    let g = this.terrain ? this.terrain(x, z) : null;
    if (g === null) for (const w of this.waters) if (x >= w.x1 && x <= w.x2 && z >= w.z1 && z <= w.z2) g = Math.max(g ?? -Infinity, w.floor);
    for (const b of this.bases) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.y <= y + STEP_UP) g = Math.max(g ?? -Infinity, b.y);
    g ??= 0;
    for (const p of this.platforms) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      let h = p.y0;
      if (p.axis === 'x') h = p.y0 + (p.y1 - p.y0) * (x - p.minX) / (p.maxX - p.minX);
      else if (p.axis === 'z') h = p.y0 + (p.y1 - p.y0) * (z - p.minZ) / (p.maxZ - p.minZ);
      if (h <= y + STEP_UP && h > g) g = h;
    }
    return g;
  }

  items() { return this.itemList; }

  // ---------- per frame ----------
  update(dt, t, underwater, focus) {
    this.time.value = t;
    if (!focus) return;
    for (const s of this.sections.values()) s.group.visible = Math.hypot(s.cx - focus.x, s.cz - focus.z) < VIEW;

    // the real lights go to the fixtures nearest you, fading in and out as they move
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const live = this.anchors.filter((a) => a.on);
      live.sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
      const near = new Set(live.slice(0, LIGHTS));
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
      let target = a && a.on ? a.intensity * (a.dim ?? 1) : 0;
      if (a?.flicker) target *= Math.sin(t * 61 + a.seed) * Math.sin(t * 17.3 + a.seed) > -0.2 ? 1 : 0.05;
      const rate = a?.snap ? 40 : 6;
      l.light.intensity += (target - l.light.intensity) * (1 - Math.exp(-dt * rate));
      l.on = l.light.intensity > 0.3;
      l.base = l.light.intensity;
    }

    // the air changes as you move from room to room
    const Z = this.zone(focus.x, focus.z);
    const k = 1 - Math.exp(-dt * 1.5);
    this.fog.color.lerp(new THREE.Color(Z.fog[0]), k);
    this.fog.density += (Z.fog[1] - this.fog.density) * k;
    this.fog.background.copy(this.fog.color).multiplyScalar(Z.indoor === false ? 1 : 0.3);
    this.level.hemi += (Z.hemi - this.level.hemi) * k;
    this.level.ambient += (Z.ambient - this.level.ambient) * k;
    const bl = Z.bloom ?? [0.5, 0.82];
    this.level.bloom[0] += (bl[0] - this.level.bloom[0]) * k;
    this.level.bloom[1] += (bl[1] - this.level.bloom[1]) * k;
    this.level.sky += ((Z.indoor === false ? 1 : 0) - this.level.sky) * k;
    // reflections are light too: in a dark room they have to go dark with it
    const env = this.level.env + ((Z.env ?? 1) - this.level.env) * k;
    if (Math.abs(env - (this.appliedEnv ?? -1)) > 0.005) {
      this.appliedEnv = env;
      this.envBase ??= new Map(Object.values(this.M).filter((m) => m.envMapIntensity !== undefined).map((m) => [m, m.envMapIntensity]));
      for (const [m, base] of this.envBase) m.envMapIntensity = base * env;
    }
    this.level.env = env;
    this.hemi.intensity = this.level.hemi;
    this.sun.intensity = this.level.sky * 1.2;
    this.sky.position.copy(focus);
    this.sky.visible = !!this.def.sky;

    for (const it of this.itemList) if (it.spin && it.mesh) it.mesh.rotation.y += dt * 0.6;
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

  async bakeProbes(renderer, compile) {
    this.bakeEnv(renderer);
    // a tape's own copies of shared materials take their reflections from the original
    for (const m of Object.values(this.mats ?? {})) if (m.envFrom) m.envMap = m.envFrom.envMap;
    await compile();
  }
}
