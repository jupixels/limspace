import * as THREE from 'three';

// Final pass: lens, tape, exposure noise, night vision and the viewfinder overlay.
export const CamcorderShader = {
  uniforms: {
    tDiffuse: { value: null },
    tOSD: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    glitch: { value: 0 },
    tension: { value: 0 },
    noiseAmt: { value: 0.06 },
    nv: { value: 0 },
    fade: { value: 1 },
    paused: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tOSD;
    uniform vec2 resolution;
    uniform float time, glitch, tension, noiseAmt, nv, fade, paused;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec3 rgb2yiq(vec3 c) {
      return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
    }
    vec3 yiq2rgb(vec3 c) {
      return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
    }

    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      return 0.5 + c * (1.0 + k * dot(c, c)) / (1.0 + k * 0.5);
    }

    void main() {
      vec2 uv = vUv;
      float frame = floor(time * 30.0);
      float line = floor(uv.y * 240.0);
      float unrest = tension + glitch + paused * 0.6;

      // tape warble and per-line jitter
      uv.x += sin(uv.y * 9.0 + time * 1.7) * 0.0012 * (1.0 + unrest * 3.0);
      uv.x += (hash(vec2(line, frame)) - 0.5) * 0.0011 * (1.0 + unrest * 4.0);

      // tracking band rolling up the frame
      float bandY = fract(-time * 0.08);
      float band = 1.0 - smoothstep(0.0, 0.03 + unrest * 0.03, abs(uv.y - bandY));
      band *= 0.25 + unrest * 1.2;
      uv.x += band * (hash(vec2(line, frame + 3.0)) - 0.5) * 0.03;

      // block displacement on glitches
      float blk = floor(uv.y * 18.0);
      float gh = hash(vec2(blk, floor(time * 14.0)));
      if (gh < glitch * 0.45) uv.x += (hash(vec2(blk, frame)) - 0.5) * 0.16 * glitch;
      if (paused > 0.5) uv.y += (hash(vec2(frame, 1.0)) - 0.5) * 0.004;

      vec2 duv = barrel(uv, 0.22);
      vec2 dir = duv - 0.5;
      float r = length(dir);

      // VHS: soft luma, smeared and delayed chroma
      float px = 1.0 / resolution.x;
      vec3 yiq = rgb2yiq(texture2D(tDiffuse, duv).rgb) * 0.5
        + rgb2yiq(texture2D(tDiffuse, duv - vec2(px, 0.0)).rgb) * 0.25
        + rgb2yiq(texture2D(tDiffuse, duv + vec2(px, 0.0)).rgb) * 0.25;
      vec2 chroma = vec2(0.0);
      for (int i = 0; i < 6; i++) {
        vec2 o = vec2(float(i) * 2.5 * px + 3.0 * px, 0.0);
        chroma += rgb2yiq(texture2D(tDiffuse, duv - o).rgb).yz;
      }
      yiq.yz = chroma / 6.0 * 0.85;
      vec3 col = yiq2rgb(yiq);

      // radial chromatic aberration
      float ca = 0.002 + r * 0.007 + glitch * 0.012;
      col.r = mix(col.r, texture2D(tDiffuse, duv + dir * ca).r, 0.7);
      col.b = mix(col.b, texture2D(tDiffuse, duv - dir * ca).b, 0.7);

      // night vision: amplified mono green with IR bloom
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 nvCol = vec3(0.18, 0.85, 0.28) * pow(clamp(lum * 1.6, 0.0, 1.3), 0.9);
      col = mix(col, nvCol, nv);

      // grade: lifted blacks, faint green-cyan cast, gentle S-curve
      col = col * vec3(0.96, 1.0, 0.97) + vec3(0.018, 0.022, 0.02);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);

      // sensor/tape grain, heavier in the dark and in night vision
      float n = hash(vUv * resolution + fract(time * 7.3) * 91.0) - 0.5;
      float nAmt = noiseAmt * (1.0 + nv * 1.8) * (1.0 + (1.0 - clamp(lum * 3.0, 0.0, 1.0)) * 0.8);
      col += n * nAmt;
      col += band * (hash(vec2(vUv.x * 300.0, frame)) - 0.5) * 0.25;

      // tape dropouts: brief white streaks
      float drop = step(0.999 - glitch * 0.02 - tension * 0.003, hash(vec2(line, frame)));
      drop *= step(hash(vec2(floor(vUv.x * 24.0), line + frame)), 0.35);
      col += drop * 0.7;

      // scanlines
      col *= 0.9 + 0.1 * sin(vUv.y * resolution.y * 1.5708);

      // vignette
      col *= 1.0 - smoothstep(0.3, 0.78, r) * 0.75;

      // viewfinder overlay (electronic, so no lens distortion, but still on tape)
      vec4 osd = texture2D(tOSD, uv);
      float osdR = texture2D(tOSD, uv - vec2(px * 2.0, 0.0)).a;
      col = mix(col, osd.rgb, osd.a * 0.92);
      col.r += osdR * 0.12 * (1.0 - osd.a);

      col *= 1.0 - fade;
      col = mix(col, vec3(hash(vUv * resolution + frame)), fade * 0.25);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n) => String(n).padStart(2, '0');

export class OSD {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.start = new Date(1997, 9, 31, 2, 13, 7).getTime();
    this.resize(innerWidth / innerHeight);
  }

  resize(aspect) {
    this.canvas.width = 960;
    this.canvas.height = Math.round(960 / aspect);
    // GPU storage is immutable once allocated, so a new size needs a fresh upload
    this.texture.dispose();
  }

  text(s, x, y, align = 'left', color = '#f2f2f2') {
    const g = this.g;
    g.textAlign = align;
    g.fillStyle = '#000';
    g.fillText(s, x + 2, y + 2);
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  draw(s) {
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    const m = 48, fs = 38;
    g.clearRect(0, 0, W, H);
    g.font = `${fs}px VT323, monospace`;
    g.textBaseline = 'top';

    if (s.paused) {
      this.text('❙❙ PAUSE', m, m);
    } else if (s.recording) {
      if (Math.floor(s.t * 1.2) % 2 === 0) {
        g.fillStyle = '#000';
        g.beginPath(); g.arc(m + 14, m + 17, 12, 0, 6.2832); g.fill();
        g.fillStyle = '#e8232a';
        g.beginPath(); g.arc(m + 12, m + 15, 12, 0, 6.2832); g.fill();
      }
      this.text('REC', m + 34, m);
    }
    this.text('SP', m, m + fs + 6);

    // battery
    const bx = W - m - 70, by = m + 6;
    g.fillStyle = '#000';
    g.fillRect(bx + 2, by + 2, 62, 26); g.fillRect(bx + 66, by + 10, 6, 10);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 3;
    g.strokeRect(bx, by, 62, 26);
    g.fillStyle = '#f2f2f2';
    g.fillRect(bx + 63, by + 8, 5, 10);
    const bars = Math.ceil(s.battery / 25);
    const lowBlink = s.battery < 25 && Math.floor(s.t * 2) % 2;
    if (!lowBlink) for (let i = 0; i < bars; i++) g.fillRect(bx + 5 + i * 14, by + 5, 11, 16);

    if (s.nv > 0.5) this.text('NIGHT  ◐', W - m, m + fs + 6, 'right', '#d6ffd0');

    // tape counter and timestamp
    const sec = Math.floor(s.t);
    this.text(`${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`, m, H - m - fs);
    const d = new Date(this.start + s.t * 1000);
    const h = d.getHours();
    this.text(`${h < 12 ? 'AM' : 'PM'} ${h % 12 || 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, W - m, H - m - fs * 2 - 4, 'right');
    this.text(`${MONTHS[d.getMonth()]}.${pad(d.getDate())} ${d.getFullYear()}`, W - m, H - m - fs, 'right');

    // zoom bar while zooming
    if (s.zoomShow > 0) {
      g.globalAlpha = Math.min(1, s.zoomShow);
      const zx = W / 2 - 150, zy = H - m - fs + 8;
      this.text('W', zx - 30, zy - 8);
      this.text('T', zx + 312, zy - 8);
      g.fillStyle = '#000'; g.fillRect(zx + 2, zy + 10, 300, 4);
      g.fillStyle = '#f2f2f2'; g.fillRect(zx, zy + 8, 300, 4);
      const p = (s.zoom - 1) / 5;
      g.fillRect(zx + p * 290, zy, 10, 20);
      g.globalAlpha = 1;
    }

    if (s.hint) this.text(s.hint, W / 2, H / 2 + 120, 'center', '#f2f2f2');
    this.texture.needsUpdate = true;
  }
}
