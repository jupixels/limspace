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
    underwater: { value: 0 },
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
    uniform float time, glitch, tension, noiseAmt, nv, fade, paused, underwater;
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
      uv.x += sin(uv.y * 9.0 + time * 1.7) * 0.0006 * (1.0 + unrest * 4.0);
      uv.x += (hash(vec2(line, frame)) - 0.5) * 0.0005 * (1.0 + unrest * 6.0);

      // tracking band rolling up the frame
      float bandY = fract(-time * 0.08);
      float band = 1.0 - smoothstep(0.0, 0.03 + unrest * 0.03, abs(uv.y - bandY));
      band *= 0.08 + unrest * 1.2;
      uv.x += band * (hash(vec2(line, frame + 3.0)) - 0.5) * 0.03;

      // block displacement on glitches
      float blk = floor(uv.y * 18.0);
      float gh = hash(vec2(blk, floor(time * 14.0)));
      if (gh < glitch * 0.45) uv.x += (hash(vec2(blk, frame)) - 0.5) * 0.16 * glitch;
      if (paused > 0.5) uv.y += (hash(vec2(frame, 1.0)) - 0.5) * 0.004;
      uv += underwater * vec2(sin(uv.y * 18.0 + time * 2.1), cos(uv.x * 14.0 + time * 1.7)) * 0.005;

      vec2 duv = barrel(uv, 0.14);
      vec2 dir = duv - 0.5;
      float r = length(dir);

      // VHS: soft luma, smeared and delayed chroma
      float px = 1.0 / resolution.x;
      vec3 yiq = rgb2yiq(texture2D(tDiffuse, duv).rgb) * 0.5
        + rgb2yiq(texture2D(tDiffuse, duv - vec2(px, 0.0)).rgb) * 0.25
        + rgb2yiq(texture2D(tDiffuse, duv + vec2(px, 0.0)).rgb) * 0.25;
      vec2 chroma = vec2(0.0);
      for (int i = 0; i < 6; i++) {
        vec2 o = vec2(float(i) * 1.5 * px + 1.5 * px, 0.0);
        chroma += rgb2yiq(texture2D(tDiffuse, duv - o).rgb).yz;
      }
      yiq.yz = chroma / 6.0 * 0.95;
      vec3 col = yiq2rgb(yiq);

      // radial chromatic aberration
      float ca = 0.001 + r * 0.004 + glitch * 0.012;
      col.r = mix(col.r, texture2D(tDiffuse, duv + dir * ca).r, 0.7);
      col.b = mix(col.b, texture2D(tDiffuse, duv - dir * ca).b, 0.7);

      // underwater: murky, green-blue, light dies off fast
      col = mix(col, col * vec3(0.32, 0.72, 0.74) + vec3(0.0, 0.035, 0.045), underwater);

      // night vision: amplified mono green with IR bloom
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 nvCol = vec3(0.18, 0.85, 0.28) * pow(clamp(lum * 1.6, 0.0, 1.3), 0.9);
      col = mix(col, nvCol, nv);

      // grade: lifted blacks, faint green-cyan cast, gentle S-curve
      col = col * vec3(0.97, 1.0, 0.98) + vec3(0.01, 0.013, 0.012);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);

      // sensor/tape grain, heavier in the dark and in night vision
      float n = hash(vUv * resolution + fract(time * 7.3) * 91.0) - 0.5;
      float nAmt = noiseAmt * (1.0 + nv * 1.8) * (1.0 + (1.0 - clamp(lum * 3.0, 0.0, 1.0)) * 0.8);
      col += n * nAmt;
      col += band * (hash(vec2(vUv.x * 300.0, frame)) - 0.5) * 0.25;

      // tape dropouts: brief white streaks
      float drop = step(0.9995 - glitch * 0.02 - tension * 0.003, hash(vec2(line, frame)));
      drop *= step(hash(vec2(floor(vUv.x * 24.0), line + frame)), 0.35);
      col += drop * 0.7;

      // scanlines
      col *= 0.95 + 0.05 * sin(vUv.y * resolution.y * 1.5708);

      // vignette
      col *= 1.0 - smoothstep(0.35, 0.8, r) * 0.5;

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

export class OSD {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
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
    const m = 40;
    g.clearRect(0, 0, W, H);
    g.font = '26px VT323, monospace';
    g.textBaseline = 'top';

    // a small blinking dot is all that's left of the viewfinder
    if (s.recording && Math.floor(s.t * 1.2) % 2 === 0) {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath(); g.arc(m + 1, m + 1, 7, 0, 6.2832); g.fill();
      g.fillStyle = '#e8232a';
      g.beginPath(); g.arc(m, m, 7, 0, 6.2832); g.fill();
    }

    // night vision is the only mode that earns a readout
    if (s.nv > 0.5) {
      const bx = W - m - 40, by = m - 8;
      g.strokeStyle = '#d6ffd0'; g.lineWidth = 2;
      g.strokeRect(bx, by, 34, 15);
      g.fillStyle = '#d6ffd0';
      g.fillRect(bx + 34, by + 4, 3, 7);
      const lowBlink = s.battery < 25 && Math.floor(s.t * 2) % 2;
      if (!lowBlink) g.fillRect(bx + 3, by + 3, 28 * s.battery / 100, 9);
      this.text('IR', bx - 10, by - 4, 'right', '#d6ffd0');
    }
    this.texture.needsUpdate = true;
  }
}
