import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { waterNormal, textTexture, clockTexture } from './textures.js';

export const WATER_Y = -0.25;
export const POOL_FLOOR = -1.55;
const POOL = { x: 6, z: 15 }; // half extents of the basin interior
const STAIRS = { x1: -5.8, x2: -2.6, z0: 15, run: 0.8, rise: 0.3875, n: 4 };

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
      uv.xy += w * 0.01 * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.08 + 0.92 * pow(1.0 - max(V.y, 0.0), 5.0);
      float sparkle = pow(max(0.0, w.x * w.y * 0.25), 6.0) * 0.35;
      vec3 col = mix(color, refl, 0.15 + fres * 0.8) + sparkle;
      gl_FragColor = vec4(col, mix(0.22, 0.95, fres));
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

// Caustics only below the waterline.
function addCaustics(material, timeUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\n${CAUSTIC_GLSL}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float under = smoothstep(${WATER_Y.toFixed(2)}, ${(WATER_Y - 0.15).toFixed(2)}, vWPos.y);
        gl_FragColor.rgb += under * caustic(vWPos.xz * 0.9 + vWPos.y * 0.3, uTime * 0.6) * vec3(0.18, 0.27, 0.28);
        gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.95, 0.97), under);`);
  };
}

// Box UVs in metres; material textures carry the repeat.
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

function slotTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#c9cfcc';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#1a201f';
  for (let x = 2; x < 64; x += 8) g.fillRect(x, 3, 4, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function slatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8e9692';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    g.fillStyle = '#4a514e';
    g.fillRect(0, y, 64, 2);
    g.fillStyle = '#aab2ae';
    g.fillRect(0, y + 2, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f1ecdc';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#9c2b2b';
  g.fillRect(0, 10, 256, 4);
  g.fillStyle = '#1d1d26';
  g.font = 'italic bold 34px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TAPE 02', 128, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  RectAreaLightUniformsLib.init();
  const colliders = [];
  const lights = [];
  const time = { value: 0 };
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
    return new THREE.MeshStandardMaterial({
      map: tex('Color', true), normalMap: tex('NormalGL'), roughnessMap: tex('Roughness'), ...opts,
    });
  }

  // Three lighting regions, each later gets its own captured reflection probe.
  const hall = {
    wall: pbr('Tiles133A', 1.5, { roughness: 0.8, envMapIntensity: 0.9 }),
    deck: pbr('Tiles133A', 1.5, { roughness: 0.45, envMapIntensity: 1.1, color: 0xdfe6e4 }),
    pool: pbr('Tiles132A', 1.5, { roughness: 0.7, envMapIntensity: 0.6 }),
    trim: pbr('Tiles132A', 1.5, { roughness: 0.6, envMapIntensity: 0.9 }),
    ceiling: pbr('Tiles107', 1.6, { roughness: 1, envMapIntensity: 0.6, color: 0xd8dcd8 }),
  };
  const corr = {
    wall: pbr('Tiles107', 1.6, { roughness: 0.8, envMapIntensity: 0.9, color: 0xeef0e6 }),
    floor: pbr('Tiles133B', 1.5, { roughness: 0.55, envMapIntensity: 1 }),
    wet: pbr('Tiles133B', 1.5, { roughness: 0.2, envMapIntensity: 1.2, color: 0xc4cac6 }),
    trim: hall.trim.clone(),
    ceiling: hall.ceiling.clone(),
  };
  const end = Object.fromEntries(Object.entries(corr).map(([k, m]) => [k, m.clone()]));
  addCaustics(hall.pool, time);

  const M = {
    lane: new THREE.MeshStandardMaterial({ color: 0x14303d, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xd4dada, roughness: 0.15, metalness: 1 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.5 }),
    coping: new THREE.MeshStandardMaterial({ color: 0xf2f2ec, roughness: 0.35 }),
    bench: new THREE.MeshStandardMaterial({ color: 0x4f6964, roughness: 0.4 }),
    grate: new THREE.MeshStandardMaterial({ map: slotTexture(), roughness: 0.5 }),
    window: new THREE.MeshStandardMaterial({ color: 0x03070d, roughness: 0.02, metalness: 0.4, emissive: 0x02050a }),
    frame: new THREE.MeshStandardMaterial({ color: 0xbfc4c2, roughness: 0.4, metalness: 0.6 }),
    housing: new THREE.MeshStandardMaterial({ color: 0xc9ceca, roughness: 0.5 }),
  };
  M.grate.map.repeat.set(1, 1);

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
  const block = (x1, x2, z1, z2, y1 = -2, y2 = 3) => colliders.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, minY: y1, maxY: y2 });

  function rod(a, b, r, mat) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 12), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    scene.add(m);
    return m;
  }

  // Area lights look best but cost the most per pixel, so only the big hall gets them.
  let region = 'hall';
  function fixture(x, y, z, lum, rot = 0, len = 2.4, area = true) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 3) });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.1, 0.45), M.housing);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.35), mat);
    housing.position.set(x, y + 0.05, z);
    panel.position.set(x, y - 0.01, z);
    housing.rotation.y = panel.rotation.y = rot;
    scene.add(housing, panel);
    let light;
    if (area) {
      light = new THREE.RectAreaLight(0xeafff4, lum, len, 0.35);
      light.position.set(x, y - 0.03, z);
      light.rotation.order = 'YXZ';
      light.rotation.set(-Math.PI / 2, rot, 0);
    } else {
      lum *= len * 0.35 * 1.4;
      light = new THREE.PointLight(0xeafff4, lum, 16, 2);
      light.position.set(x, y - 0.25, z);
    }
    scene.add(light);
    const entry = { region, light, mat, base: lum, area: area ? len * 0.35 : 1, baseColor: mat.color.clone(), pos: light.position.clone(), flicker: 0, on: true, dead: false };
    lights.push(entry);
    return entry;
  }

  // wall-hugging tile bands: baseboard and a waist-high stripe
  function bands(x1, x2, z1, z2, mat) {
    box(x1, x2, 0, 0.14, z1, z2, mat, false);
    box(x1, x2, 1.05, 1.2, z1, z2, mat, false);
  }

  // ---------- Main pool hall: x[-15,15] z[-25,25] ----------
  const H = 7;
  const P = POOL;
  box(-15, 15, -0.3, 0, P.z + 0.3, 25, hall.deck, false);
  box(-15, 15, -0.3, 0, -25, -P.z - 0.3, hall.deck, false);
  box(-15, -P.x - 0.3, -0.3, 0, -P.z - 0.3, P.z + 0.3, hall.deck, false);
  box(P.x + 0.3, 15, -0.3, 0, -P.z - 0.3, P.z + 0.3, hall.deck, false);
  box(-15.5, 15.5, H, H + 0.3, -25.5, 25.5, hall.ceiling, false);
  box(-15.5, 15.5, 0, H, -25.5, -25, hall.wall);
  box(-15.5, 15.5, 0, H, 25, 25.5, hall.wall);
  box(-15.5, -15, 0, H, -25, 25, hall.wall);
  box(15, 15.5, 0, H, -25, 17, hall.wall);
  box(15, 15.5, 0, H, 20, 25, hall.wall);
  box(15, 15.5, 3, H, 17, 20, hall.wall, false);
  bands(-15, 15, -25, -24.98, hall.trim);
  bands(-15, 15, 24.98, 25, hall.trim);
  bands(-15, -14.98, -25, 25, hall.trim);
  bands(14.98, 15, -25, 17, hall.trim);
  bands(14.98, 15, 20, 25, hall.trim);
  for (const z of [-20, -12, -4, 4, 12, 20]) box(-15, 15, H - 0.45, H, z - 0.2, z + 0.2, M.paint, false);

  // basin: 1.3m of water over a tiled floor
  const F = POOL_FLOOR;
  box(-P.x, P.x, F - 0.3, F, -P.z, P.z, hall.pool, false);
  box(-P.x - 0.3, -P.x, F - 0.3, 0, -P.z - 0.3, P.z + 0.3, hall.pool, false);
  box(P.x, P.x + 0.3, F - 0.3, 0, -P.z - 0.3, P.z + 0.3, hall.pool, false);
  box(-P.x, P.x, F - 0.3, 0, -P.z - 0.3, -P.z, hall.pool, false);
  box(-P.x, P.x, F - 0.3, 0, P.z, P.z + 0.3, hall.pool, false);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    box(x - 0.12, x + 0.12, F, F + 0.004, -13.5, 13.5, M.lane, false);
    box(x - 0.5, x + 0.5, F, F + 0.004, -13.5, -13.26, M.lane, false);
    box(x - 0.5, x + 0.5, F, F + 0.004, 13.26, 13.5, M.lane, false);
    box(x - 0.12, x + 0.12, -1.1, -0.35, -P.z + 0.001, -P.z + 0.006, M.lane, false);
  }
  box(-0.4, 0.4, F, F + 0.006, -0.4, 0.4, M.lane, false);

  // rounded coping and slotted gutter around the edge
  const Y = new THREE.Vector3();
  const cop = (a, b) => rod(a, b, 0.08, M.coping);
  cop(Y.set(-P.x - 0.15, -0.02, -P.z - 0.15).clone(), new THREE.Vector3(P.x + 0.15, -0.02, -P.z - 0.15));
  cop(new THREE.Vector3(-P.x - 0.15, -0.02, P.z + 0.15), new THREE.Vector3(P.x + 0.15, -0.02, P.z + 0.15));
  cop(new THREE.Vector3(-P.x - 0.15, -0.02, -P.z - 0.15), new THREE.Vector3(-P.x - 0.15, -0.02, P.z + 0.15));
  cop(new THREE.Vector3(P.x + 0.15, -0.02, -P.z - 0.15), new THREE.Vector3(P.x + 0.15, -0.02, P.z + 0.15));
  const grate = (x1, x2, z1, z2, along) => {
    const m = box(x1, x2, 0, 0.004, z1, z2, M.grate.clone(), false);
    m.material.map = M.grate.map.clone();
    const len = along === 'x' ? x2 - x1 : z2 - z1;
    m.material.map.repeat.set(len / 0.32, 1);
    if (along === 'z') m.material.map.rotation = Math.PI / 2;
  };
  grate(-P.x - 0.6, P.x + 0.6, -P.z - 0.6, -P.z - 0.3, 'x');
  grate(-P.x - 0.6, P.x + 0.6, P.z + 0.3, P.z + 0.6, 'x');
  grate(-P.x - 0.6, -P.x - 0.3, -P.z - 0.3, P.z + 0.3, 'z');
  grate(P.x + 0.3, P.x + 0.6, -P.z - 0.3, P.z + 0.3, 'z');

  // entry stairs in the south-west corner, with rails
  const S = STAIRS;
  for (let i = 0; i < S.n; i++) {
    box(S.x1, S.x2, F, -S.rise * (i + 1), S.z0 - S.run * (i + 1), S.z0 - S.run * i, hall.pool, false);
    box(S.x1, S.x2, -S.rise * (i + 1) - 0.004, -S.rise * (i + 1) + 0.002, S.z0 - S.run * (i + 1), S.z0 - S.run * (i + 1) + 0.06, M.lane, false);
  }
  for (const x of [S.x1 + 0.15, S.x2 - 0.15]) {
    const top = new THREE.Vector3(x, 0.95, S.z0 + 0.5);
    rod(new THREE.Vector3(x, 0, S.z0 + 0.5), top, 0.03, M.metal);
    rod(top, new THREE.Vector3(x, -0.6, S.z0 - S.run * S.n + 0.4), 0.03, M.metal);
  }

  const water = new Reflector(new THREE.PlaneGeometry(P.x * 2, P.z * 2), {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 288,
    color: 0x12404a,
    shader: PoolWaterShader,
    multisample: 0,
  });
  water.material.transparent = true;
  water.material.fog = true;
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_Y, 0);
  scene.add(water);

  // seen from below, the surface is a bright wobbling ceiling
  const wn = waterNormal();
  wn.repeat.set(3, 3);
  const underside = new THREE.Mesh(new THREE.PlaneGeometry(P.x * 2, P.z * 2),
    new THREE.MeshStandardMaterial({
      color: 0x5fa8a8, emissive: 0x1d4c50, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85,
      normalMap: wn, side: THREE.BackSide, depthWrite: false,
    }));
  underside.rotation.x = -Math.PI / 2;
  underside.position.set(0, WATER_Y, 0);
  underside.visible = false;
  scene.add(underside);

  // round tiled pillars
  for (const x of [-11, 11]) {
    for (const z of [-18, -6, 6, 18]) {
      const g = new THREE.CylinderGeometry(0.45, 0.45, H, 24, 1, true);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * 0.45, uv.getY(i) * H);
      const m = new THREE.Mesh(g, hall.wall);
      m.position.set(x, H / 2, z);
      scene.add(m);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.14, 24), hall.trim);
      ring.position.set(x, 0.07, z);
      scene.add(ring);
      block(x - 0.45, x + 0.45, z - 0.45, z + 0.45, 0, H);
    }
  }

  // ladders on the east wall
  for (const z of [-12, 0, 12]) {
    for (const dz of [-0.3, 0.3]) {
      rod(new THREE.Vector3(P.x - 0.12, F + 0.2, z + dz), new THREE.Vector3(P.x - 0.12, 0.7, z + dz), 0.025, M.metal);
      rod(new THREE.Vector3(P.x - 0.12, 0.7, z + dz), new THREE.Vector3(P.x + 0.5, 0.7, z + dz), 0.025, M.metal);
      rod(new THREE.Vector3(P.x + 0.5, 0.7, z + dz), new THREE.Vector3(P.x + 0.5, 0, z + dz), 0.025, M.metal);
    }
    for (let s = 0; s < 3; s++) {
      const y = -0.5 - s * 0.32;
      box(P.x - 0.2, P.x - 0.05, y - 0.02, y, z - 0.3, z + 0.3, M.metal, false);
    }
  }

  // lifeguard chair, empty
  for (const [dx, dz] of [[-0.35, -0.45], [0.35, -0.45], [-0.35, 0.45], [0.35, 0.45]]) {
    rod(new THREE.Vector3(-8 + dx * 1.3, 0, 4 + dz * 1.3), new THREE.Vector3(-8 + dx, 2.2, 4 + dz), 0.04, M.paint);
  }
  box(-8.5, -7.5, 2.2, 2.28, 3.5, 4.5, M.paint, false);
  box(-8.5, -7.5, 2.28, 3.0, 4.45, 4.55, M.paint, false);
  for (let s = 0; s < 5; s++) box(-8.3, -7.7, 0.4 + s * 0.4, 0.44 + s * 0.4, 3.1 - s * 0.05, 3.25 - s * 0.05, M.paint, false);
  block(-8.6, -7.4, 3.4, 4.6, 0, 3);

  // benches
  for (const z of [-20, -12, 10, 20]) {
    box(-14.6, -14.1, 0.38, 0.45, z - 1.5, z + 1.5, M.bench);
    for (const dz of [-1.3, 1.3]) box(-14.5, -14.2, 0, 0.38, z + dz - 0.05, z + dz + 0.05, M.metal, false);
  }

  // high night windows with mullions
  for (const z of [-20, -12, -4, 4, 12, 20]) {
    box(-15.01, -14.99, 4.2, 6.4, z - 2.5, z + 2.5, M.window, false);
    for (const dz of [-2.5, -0.83, 0.83, 2.5]) box(-15, -14.92, 4.2, 6.4, z + dz - 0.05, z + dz + 0.05, M.frame, false);
    box(-15, -14.92, 4.15, 4.25, z - 2.5, z + 2.5, M.frame, false);
    box(-15, -14.92, 6.35, 6.45, z - 2.5, z + 2.5, M.frame, false);
    box(-15, -14.92, 5.25, 5.33, z - 2.5, z + 2.5, M.frame, false);
  }

  // markings
  const decal = (tex, x, z, w, h, rotZ = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4 }));
    m.rotation.set(-Math.PI / 2, 0, rotZ);
    m.position.set(x, 0.006, z);
    scene.add(m);
  };
  const depth = textTexture('1.3 M'), nd = textTexture('NO DIVING', { color: '#8a1f1f' });
  for (const z of [-10, 0, 10]) {
    decal(depth, -P.x - 0.95, z, 1.1, 0.28, -Math.PI / 2);
    decal(depth, P.x + 0.95, z, 1.1, 0.28, Math.PI / 2);
  }
  decal(nd, 0, P.z + 1.2, 2.4, 0.6);
  decal(nd, 0, -P.z - 1.2, 2.4, 0.6, Math.PI);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.3 }));
  clock.position.set(0, 4.6, -24.98);
  scene.add(clock);

  for (const z of [-16, 0, 16]) {
    fixture(-9, H - 0.45, z, 26);
    fixture(9, H - 0.45, z, 26);
  }
  fixture(0, H - 0.45, -8, 22, Math.PI / 2);
  fixture(0, H - 0.45, 8, 22, Math.PI / 2);

  // the hall's only exit is behind a roll-up shutter until the tape is taken from the pool
  const shutterMesh = box(15.12, 15.28, 0, 3, 17, 20, new THREE.MeshStandardMaterial({ map: slatTexture(), roughness: 0.45, metalness: 0.7 }), false);
  shutterMesh.material.map.repeat.set(1, 3 / 0.5);
  const shutterBlock = { minX: 15, maxX: 15.5, minZ: 17, maxZ: 20, minY: 0, maxY: 3 };
  colliders.push(shutterBlock);
  for (const z of [16.98, 20.02]) box(15.05, 15.35, 0, 3, z - 0.05, z + 0.05, M.frame, false);
  const shutter = { mesh: shutterMesh, block: shutterBlock, opening: false, progress: 0, pos: new THREE.Vector3(15, 1.4, 18.5) };

  // ---------- Corridor A (dry): x[15,35] z[17,20] ----------
  region = 'corridor';
  box(15, 35, -0.3, 0, 17, 20, corr.floor, false);
  box(15, 35, 3, 3.3, 17, 20, corr.ceiling, false);
  box(15, 35.5, 0, 3, 20, 20.5, corr.wall);
  box(15.5, 32, 0, 3, 16.5, 17, corr.wall);
  bands(15.5, 35, 19.98, 20, corr.trim);
  bands(15.5, 32, 17, 17.02, corr.trim);
  box(15, 15.6, 2.9, 3, 17, 20, M.frame, false);
  fixture(21, 2.98, 18.5, 9, 0, 1.6, false);
  fixture(29, 2.98, 18.5, 9, 0, 1.6, false);

  // ---------- Corridor B (flooded): x[32,35] z[-5,17] ----------
  box(32, 35, -0.3, 0, -5, 17, end.wet, false);
  box(32, 35, 3, 3.3, -5, 17, end.ceiling, false);
  box(31.5, 32, 0, 3, -5, 17, end.wall);
  box(35, 35.5, 0, 3, -5, 20.5, end.wall);
  bands(32, 32.02, -5, 17, end.trim);
  bands(34.98, 35, -5, 20, end.trim);
  fixture(33.5, 2.98, 9, 7, Math.PI / 2, 1.6, false);
  fixture(33.5, 2.98, 0, 7, Math.PI / 2, 1.6, false);
  for (const z of [12, 4, -2]) box(33.2, 33.8, 0, 0.004, z - 0.3, z + 0.3, M.grate, false);

  // ---------- End room (flooded): x[29,41] z[-17,-5] ----------
  box(29, 41, -0.3, 0, -17.5, -5, end.wet, false);
  box(28.5, 41.5, 4, 4.3, -17.5, -4.5, end.ceiling, false);
  box(28.5, 32, 0, 4, -5, -4.5, end.wall);
  box(35, 41.5, 0, 4, -5, -4.5, end.wall);
  box(32, 35, 3, 4, -5, -4.5, end.wall, false);
  box(28.5, 29, 0, 4, -17, -5, end.wall);
  box(41, 41.5, 0, 4, -17, -5, end.wall);
  box(28.5, 34, 0, 4, -17.5, -17, end.wall);
  box(36, 41.5, 0, 4, -17.5, -17, end.wall);
  box(34, 36, 2.4, 4, -17.5, -17, end.wall, false);
  bands(29, 29.02, -17, -5, end.trim);
  bands(40.98, 41, -17, -5, end.trim);
  bands(29, 34, -17.02, -17, end.trim);
  bands(36, 41, -17.02, -17, end.trim);
  const endLight = fixture(35, 3.98, -11, 6, 0, 1.6, false);
  endLight.unstable = true;

  // the doorway opens onto nothing at all
  // you can walk a few metres into it, no further
  block(33, 37, -25.5, -25);
  block(33, 34, -25.5, -17.5);
  block(36, 37, -25.5, -17.5);

  // flooded water sheet
  const shallow = new THREE.MeshStandardMaterial({
    color: 0x6f9590, transparent: true, opacity: 0.45, roughness: 0.02, metalness: 0.1,
    normalMap: wn, normalScale: new THREE.Vector2(0.25, 0.25), depthWrite: false, envMapIntensity: 1.5,
  });
  const sheetB = new THREE.Mesh(new THREE.PlaneGeometry(3, 22), shallow);
  sheetB.rotation.x = -Math.PI / 2;
  sheetB.position.set(33.5, 0.08, 6);
  const sheetE = new THREE.Mesh(new THREE.PlaneGeometry(12, 12.5), shallow);
  sheetE.rotation.x = -Math.PI / 2;
  sheetE.position.set(35, 0.08, -11.25);
  scene.add(sheetB, sheetE);

  // the next tape, lying on the pool floor
  const cassette = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.105), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.35 }));
  const labelTex = labelTexture();
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04),
    new THREE.MeshStandardMaterial({ map: labelTex, emissiveMap: labelTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.0135;
  cassette.add(shell, label);
  cassette.position.set(2.5, F + 0.013, -4);
  cassette.rotation.y = 0.5;
  cassette.scale.setScalar(1.6); // reads at a distance through the water
  scene.add(cassette);

  // ---------- Inhabitants ----------
  const swimmer = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 3.2, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0x031412, fog: false }));
  swimmer.rotation.x = Math.PI / 2;
  swimmer.scale.set(1.1, 1, 0.5);
  swimmer.position.set(2.2, F + 0.3, -14);
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

  scene.add(new THREE.HemisphereLight(0xb8d8d4, 0x2a3432, 0.12));

  function zoneAt(x, z) {
    if (x >= -15 && x <= 15 && z >= -25 && z <= 25) return 'hall';
    if (x >= 15 && x <= 35 && z >= 17 && z <= 20) return 'corridor';
    if (x >= 32 && x <= 35 && z >= -5 && z <= 17) return 'flooded';
    if (x >= 29 && x <= 41 && z >= -17 && z <= -5) return 'end';
    if (z < -17) return 'void';
    return 'corridor';
  }

  const inPool = (x, z) => Math.abs(x) < P.x && Math.abs(z) < P.z;

  function groundAt(x, z) {
    if (!inPool(x, z)) return 0;
    if (x > S.x1 && x < S.x2 && z > S.z0 - S.run * S.n) {
      const i = Math.min(S.n - 1, Math.floor((S.z0 - z) / S.run));
      return -S.rise * (i + 1);
    }
    return F;
  }

  // Bake a reflection/irradiance probe per region by rendering the scene from inside it,
  // yielding between regions so the page stays responsive while it works.
  async function bakeProbes(renderer, compile) {
    const breathe = () => new Promise((r) => setTimeout(r, 0));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const probes = [
      [new THREE.Vector3(0, 2.5, 4), [...Object.values(hall), M.coping, M.metal, M.paint, M.bench, M.frame, M.grate, M.lane, M.housing]],
      [new THREE.Vector3(25, 1.5, 18.5), Object.values(corr)],
      [new THREE.Vector3(35, 1.6, -9), [...Object.values(end), shallow]],
    ];
    // A same-sized placeholder probe lets every shader compile (off the main thread where
    // supported) in its final form; swapping in the baked probes later needs no recompile.
    const placeholder = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1);
    for (const [, mats] of probes) for (const m of mats) { m.envMap = placeholder.texture; m.needsUpdate = true; }
    await compile();
    water.visible = false;
    figure.visible = false;
    for (const [p, mats] of probes) {
      scene.position.set(-p.x, -p.y, -p.z);
      scene.updateMatrixWorld(true);
      const rt = pmrem.fromScene(scene, 0.01, 0.1, 80);
      for (const m of mats) m.envMap = rt.texture;
      await breathe();
    }
    placeholder.dispose();
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    water.visible = true;
    pmrem.dispose();
  }

  function update(dt, t, underwater) {
    time.value = t;
    if (shutter.opening && shutter.progress < 1) {
      shutter.progress = Math.min(1, shutter.progress + dt / 3.6);
      // rolls up in jerks, like a chain motor
      shutter.mesh.position.y = 1.5 + 2.9 * shutter.progress + Math.sin(t * 40) * 0.006;
      shutter.block.off = shutter.progress > 0.65;
    }
    water.material.uniforms.time.value = t;
    wn.offset.set(t * 0.012, t * 0.007);
    water.visible = !underwater;
    underside.visible = underwater;
    for (const l of lights) {
      let k = 1;
      if (l.dead) k = 0;
      else if (l.flicker > 0) {
        l.flicker -= dt;
        const n = Math.sin(t * 91.7 + l.pos.x) * Math.sin(t * 37.3 + l.pos.z);
        k = n > 0.1 ? 1 : 0.03;
      }
      l.on = k > 0.5;
      l.light.intensity = l.base * k;
      l.mat.color.copy(l.baseColor).multiplyScalar(Math.max(k, 0.03));
    }
  }

  // Back to how the tape starts: shutter down, cassette in the pool, lights on.
  function reset() {
    shutter.opening = false;
    shutter.progress = 0;
    shutter.block.off = false;
    shutter.mesh.position.y = 1.5;
    cassette.visible = true;
    swimmer.visible = false;
    figure.visible = false;
    for (const l of lights) { l.dead = false; l.flicker = 0; }
  }

  return {
    colliders, lights, zoneAt, groundAt, inPool, update, reset, swimmer, figure, water, ready, bakeProbes,
    shutter, cassette,
    spawn: { pos: new THREE.Vector3(0, 0, 22), yaw: 0 },
    endLight,
  };
}
