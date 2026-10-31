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
