import * as THREE from 'three';

function canvasTex(w, h, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// the mono-yellow wallpaper: faint vertical pattern, water stains, sun-bleached seams
const backroomsPaper = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c9b46a';
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = 'rgba(120,98,40,0.10)';
    g.fillRect(x, 0, 2, h);
    for (let y = 8; y < h; y += 32) {
      g.fillStyle = 'rgba(110,90,30,0.12)';
      g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 12, y + 6); g.lineTo(x + 8, y + 12); g.lineTo(x + 4, y + 6); g.fill();
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(90,70,20,0.16)');
    grad.addColorStop(1, 'rgba(90,70,20,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
});

// a pastel sky with soft clouds, wrapped on the inside of a dome
const skyTexture = () => canvasTex(1024, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#5d8edb');
  grad.addColorStop(0.3, '#86aeea');
  grad.addColorStop(0.45, '#bccff3');
  grad.addColorStop(0.5, '#f5d3dc');
  grad.addColorStop(0.54, '#f8e0d2');
  grad.addColorStop(1, '#f8e0d2');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * w, y = 110 + Math.random() * 125, r = 14 + Math.random() * 46;
    for (let k = 0; k < 6; k++) {
      const cx = x + (Math.random() - 0.5) * r * 2.2, cy = y + (Math.random() - 0.5) * r * 0.5;
      const cr = r * (0.5 + Math.random() * 0.6);
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0, 'rgba(255,252,250,0.5)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
    }
  }
}, { repeat: false });

const grassGround = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9cc27e';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const l = 52 + Math.random() * 20;
    g.fillStyle = `hsl(${80 + Math.random() * 22}, ${30 + Math.random() * 16}%, ${l}%)`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 5);
  }
});

const grassBlades = () => canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 22; i++) {
    const x = 6 + Math.random() * (w - 12), lean = (Math.random() - 0.5) * 26, top = 10 + Math.random() * 50;
    g.strokeStyle = `hsl(${78 + Math.random() * 24}, ${32 + Math.random() * 16}%, ${54 + Math.random() * 16}%)`;
    g.lineWidth = 2 + Math.random() * 3;
    g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.stroke();
  }
}, { repeat: false });

const cloudPaper = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9fc6ee';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * 86 + 40 + (Math.floor(i / 3) % 2) * 40, y = Math.floor(i / 3) * 86 + 40;
    g.fillStyle = '#ffffff';
    for (const [dx, dy, r] of [[0, 0, 16], [16, 4, 13], [-16, 4, 13], [8, -8, 12], [-8, -8, 11]]) {
      g.beginPath(); g.arc(x + dx, y + dy, r, 0, 6.28); g.fill();
    }
  }
});

const signTexture = (text, color) => canvasTex(512, 96, (g, w, h) => {
  g.fillStyle = '#0b0b10';
  g.fillRect(0, 0, w, h);
  g.font = 'bold 54px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 2);
}, { repeat: false });

// Caustics swim across pool floors.
const CAUSTIC = /* glsl */`
  float caustic(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      vec2 q = vec2(sin(i.x + tt), cos(i.y + tt)) / 0.005;
      q = (step(0.0, q) * 2.0 - 1.0) * max(abs(q), 1e-4);
      c += 1.0 / max(length(p / q), 1e-3);
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }`;
function withCaustics(mat, time) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\n${CAUSTIC}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb += caustic(vWPos.xz * 0.9, uTime * 0.6) * vec3(0.2, 0.3, 0.32);');
  };
  mat.customProgramCacheKey = () => 'caustics';
  return mat;
}

// Grass sways a little.
function withSway(mat, time) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        float sway = sin(uTime * 1.3 + wp.x * 0.35 + wp.z * 0.25) * 0.12 * uv.y;
        transformed.x += sway;
        transformed.z += sway * 0.5;`);
  };
  mat.customProgramCacheKey = () => 'sway';
  return mat;
}

export function makeMaterials() {
  const manager = new THREE.LoadingManager();
  const ready = new Promise((res, rej) => { manager.onLoad = res; manager.onError = (u) => rej(new Error('failed to load ' + u)); });
  const loader = new THREE.TextureLoader(manager);
  const time = { value: 0 };
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
  const paper = backroomsPaper();
  paper.repeat.set(1 / 1.6, 1 / 1.6);
  const sky = skyTexture();
  const ground = grassGround();
  ground.repeat.set(1 / 4, 1 / 4);
  const cloud = cloudPaper();
  cloud.repeat.set(1 / 1.5, 1 / 1.5);

  const M = {
    // backrooms
    brWall: new THREE.MeshStandardMaterial({ map: paper, roughness: 0.95, color: 0xffffff }),
    brCarpet: pbr('Carpet008', 1.4, { color: 0xb9a35e, roughness: 1 }),
    brCeiling: pbr('OfficeCeiling001', 1.2, { color: 0xd8cfa4, roughness: 1 }),
    brTrim: new THREE.MeshStandardMaterial({ color: 0x8a7a3e, roughness: 0.8 }),
    // poolrooms
    plTile: pbr('Tiles133A', 1.5, { roughness: 0.35, color: 0xe6eeee, envMapIntensity: 0.55 }),
    plFloor: pbr('Tiles133A', 1.5, { roughness: 0.2, color: 0xe9f0f0, envMapIntensity: 0.55 }),
    plPool: withCaustics(pbr('Tiles132A', 1.5, { roughness: 0.4, color: 0xbfe6ea }), time),
    plCeiling: pbr('Tiles107', 1.6, { roughness: 0.9, color: 0xf2f2ee }),
    water: new THREE.MeshStandardMaterial({ color: 0x5cc0c8, transparent: true, opacity: 0.55, roughness: 0.03, metalness: 0.15, depthWrite: false, envMapIntensity: 1.4 }),
    waterBright: new THREE.MeshStandardMaterial({ color: 0x4a8a90, roughness: 0.02, metalness: 0.3, envMapIntensity: 1.6 }),
    // meadow (unlit, so daylight there doesn't leak indoors)
    grass: new THREE.MeshBasicMaterial({ map: ground, color: 0xe2ecd0 }),
    blades: withSway(new THREE.MeshBasicMaterial({ map: grassBlades(), alphaTest: 0.45, side: THREE.DoubleSide, color: 0xe8f0d8 }), time),
    sky: new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
    cloudWall: new THREE.MeshBasicMaterial({ map: cloud }),
    dreamWhite: new THREE.MeshBasicMaterial({ color: 0xf4efe6 }),
    dreamWood: new THREE.MeshBasicMaterial({ color: 0xc9a27a }),
    dreamPink: new THREE.MeshBasicMaterial({ color: 0xf2b9c8 }),
    dreamMetal: new THREE.MeshBasicMaterial({ color: 0x9aa6b0 }),
    voidDoor: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    // mall
    mlFloor: pbr('Tiles107', 1.6, { roughness: 0.12, color: 0xe7dcc8, envMapIntensity: 1.2 }),
    mlWall: pbr('Wallpaper002A', 1.4, { color: 0xe6e0d4, roughness: 0.9 }),
    mlCeiling: pbr('OfficeCeiling001', 1.2, { color: 0xb8b4aa, roughness: 1 }),
    mlGlass: new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.02, metalness: 0.6, envMapIntensity: 1.4 }),
    mlShutter: new THREE.MeshStandardMaterial({ color: 0x7c8286, roughness: 0.5, metalness: 0.7 }),
    mlGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.045, 0.04) }),
    mlGlowLit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.95, 0.72) }),
    mlPillar: pbr('Wallpaper002A', 1.4, { color: 0xd2cbbd, roughness: 0.8 }),
    mlSoil: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }),
    mlBench: new THREE.MeshStandardMaterial({ color: 0x3b2f27, roughness: 0.6 }),
    mlPlanter: new THREE.MeshStandardMaterial({ color: 0x8c7a66, roughness: 0.8 }),
    mlLeaf: new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.8 }),
    mlSkylight: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.008, 0.01, 0.018) }),
    // shared
    panel: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.15, 1.85) }),
    panelDead: new THREE.MeshBasicMaterial({ color: 0x3a372e }),
    skyPanel: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 2.9) }),
    housing: new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8bfc2, roughness: 0.3, metalness: 0.9 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: 0.4 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x4d4a52, roughness: 0.95 }),
    tapeGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) }),
  };
  const signs = {};
  const sign = (text, color) => (signs[text] ??= new THREE.MeshBasicMaterial({ map: signTexture(text, color), color: new THREE.Color(2.6, 2.6, 2.6) }));

  // Per-space reflection maps, from painted gradients (no scene capture needed as chunks stream in).
  function bakeEnv(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = (top, mid, bottom) => {
      const t = canvasTex(256, 128, (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, top);
        grad.addColorStop(0.5, mid);
        grad.addColorStop(1, bottom);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        // a band of bright panels overhead
        g.fillStyle = top;
        for (let x = 0; x < w; x += 32) g.fillRect(x, 6, 18, 10);
      }, { repeat: false });
      t.mapping = THREE.EquirectangularReflectionMapping;
      return pmrem.fromEquirectangular(t).texture;
    };
    const backrooms = env('#fff6c0', '#b8a35a', '#5a4c22');
    const pool = env('#ffffff', '#cfe9ea', '#8fb8bc');
    const mall = env('#ffe2b0', '#2a2622', '#0b0a09');
    for (const m of [M.brWall, M.brCarpet, M.brCeiling, M.brTrim]) m.envMap = backrooms;
    for (const m of [M.plTile, M.plFloor, M.plPool, M.plCeiling, M.water]) m.envMap = pool;
    for (const m of [M.mlFloor, M.mlWall, M.mlCeiling, M.mlGlass, M.mlShutter, M.mlBench, M.mlPlanter, M.mlLeaf, M.mlPillar, M.mlSoil, M.waterBright]) m.envMap = mall;
    for (const m of [M.housing, M.metal, M.plastic, M.fabric]) m.envMap = backrooms;
    pmrem.dispose();
  }

  return { M, sign, ready, bakeEnv, time };
}
