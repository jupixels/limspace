import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { tileTextures, waterNormal, textTexture, clockTexture } from './textures.js';

const TEX_WORLD = 1.2; // metres covered by one texture repeat

// Pool water: Reflector with rippled reflections, fresnel and see-through depth.
const PoolWaterShader = {
  uniforms: {
    ...THREE.UniformsLib.fog,
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    time: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <fog_pars_fragment>
    void main() {
      vec2 p = vWorld.xz;
      vec2 w = vec2(
        sin(p.x * 1.7 + time * 0.9) + 0.6 * sin(p.y * 2.3 - time * 0.7) + 0.3 * sin((p.x + p.y) * 3.1 + time * 1.3),
        cos(p.y * 1.9 + time * 0.8) + 0.6 * cos(p.x * 2.7 - time * 0.6) + 0.3 * cos((p.x - p.y) * 3.7 + time * 1.1));
      vec4 uv = vUv;
      uv.xy += w * 0.012 * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.12 + 0.88 * pow(1.0 - max(V.y, 0.0), 4.0);
      float sparkle = pow(max(0.0, w.x * w.y * 0.25), 6.0) * 0.4;
      vec3 col = mix(color, refl, 0.2 + fres * 0.75) + sparkle;
      gl_FragColor = vec4(col, mix(0.3, 0.96, fres));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

const CAUSTIC_GLSL = /* glsl */`
  float caustic(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      vec2 q = vec2(sin(i.x + tt), cos(i.y + tt)) / inten;
      q = (step(0.0, q) * 2.0 - 1.0) * max(abs(q), 1e-4);
      c += 1.0 / max(length(p / q), 1e-3);
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }`;

function addCaustics(material, timeUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\n${CAUSTIC_GLSL}`)
      .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.rgb += caustic(vWPos.xz * 0.9 + vWPos.y * 0.3, uTime * 0.6) * vec3(0.22, 0.32, 0.34);');
  };
}

// Scale BoxGeometry UVs so the texture keeps a constant world size on every face.
function worldUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / TEX_WORLD, uv.getY(i) * dims[f][1] / TEX_WORLD);
    }
  }
  uv.needsUpdate = true;
}

export function buildWorld(scene) {
  const colliders = [];
  const lights = [];
  const time = { value: 0 };

  const mk = (opts, mat) => {
    const t = tileTextures(opts);
    return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.6, ...mat });
  };
  const M = {
    wall: mk({ base: [226, 234, 230], seed: 2 }, { roughness: 0.35 }),
    floor: mk({ base: [196, 210, 210], grout: [110, 122, 124], tiles: 10, seed: 3, dirt: 0.6 }, { roughness: 0.18 }),
    pool: mk({ base: [150, 205, 214], grout: [96, 150, 160], seed: 4, dirt: 0.2 }, { roughness: 0.3 }),
    corridor: mk({ base: [214, 222, 200], grout: [120, 126, 108], seed: 5, dirt: 0.8 }, { roughness: 0.3 }),
    wetFloor: mk({ base: [168, 180, 176], grout: [90, 100, 98], tiles: 10, seed: 6, dirt: 1 }, { roughness: 0.08 }),
    ceiling: mk({ base: [176, 178, 172], grout: [70, 72, 68], tiles: 2, groutW: 6, seed: 8, dirt: 0.5, speckle: 3000 }, { roughness: 0.9 }),
    lane: new THREE.MeshStandardMaterial({ color: 0x1d3442, roughness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc8d0d0, roughness: 0.25, metalness: 0.9 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.6 }),
    bench: new THREE.MeshStandardMaterial({ color: 0x5b6e6a, roughness: 0.5 }),
    window: new THREE.MeshStandardMaterial({ color: 0x050a12, roughness: 0.05, metalness: 0.6, emissive: 0x02060c }),
  };
  addCaustics(M.pool, time);

  function box(x1, x2, y1, y2, z1, z2, mat, collide = true) {
    const w = x2 - x1, h = y2 - y1, d = z2 - z1;
    const geo = new THREE.BoxGeometry(w, h, d);
    worldUVs(geo, w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    scene.add(m);
    if (collide) colliders.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, minY: y1, maxY: y2 });
    return m;
  }
  const block = (x1, x2, z1, z2) => colliders.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, minY: -1, maxY: 3 });

  function fixture(x, y, z, intensity, dist, rot = 0) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 2.6) });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: 0x9aa09c, roughness: 0.6 }));
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.26), mat);
    housing.position.set(x, y + 0.04, z);
    tube.position.set(x, y - 0.01, z);
    housing.rotation.y = tube.rotation.y = rot;
    scene.add(housing, tube);
    const light = new THREE.PointLight(0xe6fff2, intensity, dist, 2);
    light.position.set(x, y - 0.3, z);
    scene.add(light);
    const entry = { light, mat, base: intensity, baseColor: mat.color.clone(), pos: light.position.clone(), flicker: 0, on: true, dead: false };
    lights.push(entry);
    return entry;
  }

  // ---------- Main pool hall: x[-15,15] z[-25,25] ----------
  const H = 7;
  box(-15, 15, -0.3, 0, 15.3, 25, M.floor, false);
  box(-15, 15, -0.3, 0, -25, -15.3, M.floor, false);
  box(-15, -6.3, -0.3, 0, -15.3, 15.3, M.floor, false);
  box(6.3, 15, -0.3, 0, -15.3, 15.3, M.floor, false);
  box(-15.5, 15.5, H, H + 0.3, -25.5, 25.5, M.ceiling, false);
  box(-15.5, 15.5, 0, H, -25.5, -25, M.wall);
  box(-15.5, 15.5, 0, H, 25, 25.5, M.wall);
  box(-15.5, -15, 0, H, -25, 25, M.wall);
  box(15, 15.5, 0, H, -25, 17, M.wall);
  box(15, 15.5, 0, H, 20, 25, M.wall);
  box(15, 15.5, 3, H, 17, 20, M.wall, false);

  // pool basin: x[-6,6] z[-15,15], 2m deep
  box(-6, 6, -2.3, -2, -15, 15, M.pool, false);
  box(-6.3, -6, -2.3, 0, -15.3, 15.3, M.pool, false);
  box(6, 6.3, -2.3, 0, -15.3, 15.3, M.pool, false);
  box(-6, 6, -2.3, 0, -15.3, -15, M.pool, false);
  box(-6, 6, -2.3, 0, 15, 15.3, M.pool, false);
  block(-6.5, 6.5, -15.5, 15.5);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    box(x - 0.12, x + 0.12, -2, -1.99, -13.5, 13.5, M.lane, false);
    box(x - 0.5, x + 0.5, -2, -1.99, -13.5, -13.26, M.lane, false);
    box(x - 0.5, x + 0.5, -2, -1.99, 13.26, 13.5, M.lane, false);
  }

  const water = new Reflector(new THREE.PlaneGeometry(12, 30), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 576,
    color: 0x0f3a42,
    shader: PoolWaterShader,
    multisample: 0,
  });
  water.material.transparent = true;
  water.material.fog = true;
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.25, 0);
  scene.add(water);

  // pillars
  for (const x of [-11, 11]) for (const z of [-18, -6, 6, 18]) box(x - 0.5, x + 0.5, 0, H, z - 0.5, z + 0.5, M.wall);

  // ladders
  for (const z of [-12, 12]) {
    for (const dz of [-0.3, 0.3]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6), M.metal);
      rail.position.set(5.85, -0.6, z + dz);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6), M.metal);
      top.rotation.z = Math.PI / 2;
      top.position.set(6.15, 0.7, z + dz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7), M.metal);
      post.position.set(6.45, 0.35, z + dz);
      scene.add(rail, top, post);
    }
  }

  // lifeguard chair, empty
  box(-8.4, -8.3, 0, 2.2, 3.6, 3.7, M.paint, false);
  box(-7.7, -7.6, 0, 2.2, 3.6, 3.7, M.paint, false);
  box(-8.4, -8.3, 0, 2.2, 4.4, 4.5, M.paint, false);
  box(-7.7, -7.6, 0, 2.2, 4.4, 4.5, M.paint, false);
  box(-8.5, -7.5, 2.2, 2.3, 3.5, 4.6, M.paint, false);
  box(-8.5, -7.5, 2.3, 3.1, 4.5, 4.6, M.paint, false);
  block(-8.6, -7.4, 3.5, 4.6);

  // benches along the west wall
  for (const z of [-20, -12, 10, 20]) {
    box(-14.6, -14.1, 0, 0.45, z - 1.5, z + 1.5, M.bench);
  }

  // high night windows on the west wall
  for (const z of [-20, -12, -4, 4, 12, 20]) box(-15.01, -14.99, 4.2, 6.4, z - 2.5, z + 2.5, M.window, false);

  // depth markings and signage
  const decal = (tex, x, z, w, h, rotY = 0, y = 0.005, vertical = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3 }));
    if (vertical) { m.position.set(x, y, z); m.rotation.y = rotY; }
    else { m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(x, y, z); }
    scene.add(m);
  };
  const d1 = textTexture('1.2 M'), d2 = textTexture('2.0 M'), nd = textTexture('NO DIVING', { color: '#7a1c1c' });
  decal(d1, -7.1, 12, 1.4, 0.35, -Math.PI / 2);
  decal(d1, 7.1, 12, 1.4, 0.35, Math.PI / 2);
  decal(d2, -7.1, -12, 1.4, 0.35, -Math.PI / 2);
  decal(d2, 7.1, -12, 1.4, 0.35, Math.PI / 2);
  decal(nd, 0, 16.2, 2.6, 0.65);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.4 }));
  clock.position.set(0, 4.6, -24.98);
  scene.add(clock);

  for (const z of [-16, 0, 16]) {
    fixture(-9, H - 0.1, z, 36, 30);
    fixture(9, H - 0.1, z, 36, 30);
  }
  fixture(0, H - 0.1, -8, 30, 30, Math.PI / 2);
  fixture(0, H - 0.1, 8, 30, 30, Math.PI / 2);

  // ---------- Corridor A (dry): x[15,35] z[17,20] ----------
  box(15, 35, -0.3, 0, 17, 20, M.floor, false);
  box(15, 35, 3, 3.3, 17, 20, M.ceiling, false);
  box(15, 35.5, 0, 3, 20, 20.5, M.corridor);
  box(15.5, 32, 0, 3, 16.5, 17, M.corridor);
  fixture(21, 2.95, 18.5, 7, 14);
  fixture(29, 2.95, 18.5, 7, 14);

  // ---------- Corridor B (flooded): x[32,35] z[-5,17] ----------
  box(32, 35, -0.3, 0, -5, 17, M.wetFloor, false);
  box(32, 35, 3, 3.3, -5, 17, M.ceiling, false);
  box(31.5, 32, 0, 3, -5, 17, M.corridor);
  box(35, 35.5, 0, 3, -5, 20.5, M.corridor);
  fixture(33.5, 2.95, 9, 6, 14, Math.PI / 2);
  fixture(33.5, 2.95, 0, 6, 14, Math.PI / 2);
  for (const z of [12, 4, -2]) box(33.2, 33.8, 0, 0.004, z - 0.3, z + 0.3, M.metal, false);

  // ---------- End room (flooded): x[29,41] z[-17,-5] ----------
  box(29, 41, -0.3, 0, -17.5, -5, M.wetFloor, false);
  box(28.5, 41.5, 4, 4.3, -17.5, -4.5, M.ceiling, false);
  box(28.5, 32, 0, 4, -5, -4.5, M.corridor);
  box(35, 41.5, 0, 4, -5, -4.5, M.corridor);
  box(32, 35, 3, 4, -5, -4.5, M.corridor, false);
  box(28.5, 29, 0, 4, -17, -5, M.corridor);
  box(41, 41.5, 0, 4, -17, -5, M.corridor);
  box(28.5, 34, 0, 4, -17.5, -17, M.corridor);
  box(36, 41.5, 0, 4, -17.5, -17, M.corridor);
  box(34, 36, 2.4, 4, -17.5, -17, M.corridor, false);
  const endLight = fixture(35, 3.95, -11, 5, 16);
  endLight.unstable = true;

  // the doorway opens onto nothing at all
  block(33, 37, -18.8, -18.3);
  block(33, 34, -18.8, -17.5);
  block(36, 37, -18.8, -17.5);

  // flooded water sheet
  const wn = waterNormal();
  wn.repeat.set(3, 3);
  const shallow = new THREE.MeshStandardMaterial({
    color: 0x5f8c88, transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.2,
    normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false,
  });
  const sheetB = new THREE.Mesh(new THREE.PlaneGeometry(3, 22), shallow);
  sheetB.rotation.x = -Math.PI / 2;
  sheetB.position.set(33.5, 0.1, 6);
  const sheetE = new THREE.Mesh(new THREE.PlaneGeometry(12, 12.5), shallow);
  sheetE.rotation.x = -Math.PI / 2;
  sheetE.position.set(35, 0.1, -11.25);
  scene.add(sheetB, sheetE);

  // ---------- Inhabitants ----------
  const swimmer = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 3.2, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0x031412, fog: false }));
  swimmer.scale.set(1.1, 1, 0.5);
  swimmer.rotation.x = Math.PI / 2;
  swimmer.position.set(2.2, -1.55, -14);
  swimmer.visible = false;
  scene.add(swimmer);

  const pale = new THREE.MeshBasicMaterial({ color: 0xb8b8b8, fog: false });
  const figure = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.5, 4, 8), pale);
  body.position.y = 1.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), pale);
  head.position.set(0, 2.4, 0.04);
  head.scale.set(1, 1.25, 1);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 1.35, 4, 6), pale);
  armL.position.set(-0.26, 1.35, 0);
  armL.rotation.z = -0.06;
  const armR = armL.clone();
  armR.position.x = 0.26;
  armR.rotation.z = 0.06;
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.9, 4, 6), pale);
  legL.position.set(-0.09, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.09;
  figure.add(body, head, armL, armR, legL, legR);
  figure.position.set(35, 0, -34);
  figure.visible = false;
  scene.add(figure);

  scene.add(new THREE.HemisphereLight(0x9fc8c4, 0x1a2422, 0.18));

  function zoneAt(x, z) {
    if (x >= -15 && x <= 15 && z >= -25 && z <= 25) return 'hall';
    if (x >= 15 && x <= 35 && z >= 17 && z <= 20) return 'corridor';
    if (x >= 32 && x <= 35 && z >= -5 && z <= 17) return 'flooded';
    if (x >= 29 && x <= 41 && z >= -17 && z <= -5) return 'end';
    if (z < -17) return 'void';
    return 'corridor';
  }

  function update(dt, t) {
    time.value = t;
    water.material.uniforms.time.value = t;
    wn.offset.set(t * 0.012, t * 0.007);
    for (const l of lights) {
      let k = 1;
      if (l.dead) k = 0;
      else if (l.flicker > 0) {
        l.flicker -= dt;
        const n = Math.sin(t * 91.7 + l.pos.x) * Math.sin(t * 37.3 + l.pos.z);
        k = n > 0.1 ? 1 : 0.04;
      }
      l.on = k > 0.5;
      l.light.intensity = l.base * k;
      l.mat.color.copy(l.baseColor).multiplyScalar(Math.max(k, 0.03));
    }
  }

  return {
    colliders, lights, zoneAt, update, swimmer, figure,
    spawn: { pos: new THREE.Vector3(0, 0, 22), yaw: 0 },
    endLight,
  };
}
