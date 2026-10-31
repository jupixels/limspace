import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function finish(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Square ceramic tiles with grout, colour jitter and grime. Returns colour + bump maps.
export function tileTextures({
  tiles = 8, size = 512, base = [222, 232, 229], grout = [140, 152, 150],
  jitter = 10, dirt = 0.3, groutW = 4, seed = 1, speckle = 0,
} = {}) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const b = document.createElement('canvas');
  b.width = b.height = size;
  const bg = b.getContext('2d');

  g.fillStyle = `rgb(${grout})`;
  g.fillRect(0, 0, size, size);
  bg.fillStyle = '#000';
  bg.fillRect(0, 0, size, size);

  const t = size / tiles;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const v = (r() - 0.5) * jitter;
      const x = i * t + groutW / 2, y = j * t + groutW / 2, w = t - groutW;
      g.fillStyle = `rgb(${base.map((ch) => Math.round(ch + v)).join(',')})`;
      g.fillRect(x, y, w, w);
      // glaze highlight on the upper edge of each tile
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x, y, w, w * 0.12);
      bg.fillStyle = '#bbb';
      bg.fillRect(x, y, w, w);
      bg.fillStyle = '#fff';
      bg.fillRect(x + 2, y + 2, w - 4, w - 4);
    }
  }

  for (let k = 0; k < speckle; k++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }

  for (let k = 0; k < 120 * dirt; k++) {
    const x = r() * size, y = r() * size, rad = 6 + r() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(60,58,40,${0.05 + r() * 0.08})`);
    grad.addColorStop(1, 'rgba(60,58,40,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  return { map: finish(c, true), bump: finish(b, false) };
}

// Tileable rippling-water normal map built from integer-frequency sine waves.
export function waterNormal(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const r = rng(7);
  const waves = Array.from({ length: 10 }, () => ({
    kx: Math.floor(r() * 7) - 3, ky: Math.floor(r() * 7) - 3, a: 0.3 + r(), p: r() * 6.28,
  })).filter((w) => w.kx || w.ky);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const ph = 6.2832 * (w.kx * x + w.ky * y) / size + w.p;
        const cs = Math.cos(ph) * w.a;
        dx += cs * w.kx;
        dy += cs * w.ky;
      }
      const n = new THREE.Vector3(-dx * 0.08, -dy * 0.08, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, false);
}

// Flat text decal, e.g. pool depth markings.
export function textTexture(text, { w = 512, h = 128, color = '#2a3d4a', bg = null, font = 'bold 84px Arial' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  return finish(c, true);
}

// A wall clock frozen at 2:13.
export function clockTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f0e6';
  g.beginPath(); g.arc(128, 128, 120, 0, 6.2832); g.fill();
  g.lineWidth = 10; g.strokeStyle = '#222'; g.stroke();
  g.fillStyle = '#222';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * 6.2832;
    g.fillRect(128 + Math.sin(a) * 96 - 3, 128 - Math.cos(a) * 96 - 10, 6, 20);
  }
  const hand = (a, len, wdt) => {
    g.save(); g.translate(128, 128); g.rotate(a);
    g.fillRect(-wdt / 2, -len, wdt, len + 12); g.restore();
  };
  hand((2 + 13 / 60) / 12 * 6.2832, 60, 9);
  hand(13 / 60 * 6.2832, 92, 6);
  return finish(c, true);
}
