const FILES = [
  'pool_ambience', 'fluorescent_hum', 'tape_hiss', 'rec_start', 'drip',
  'distant_door', 'underwater_presence', 'dread_drone', 'light_flicker', 'glitch',
  'boot_1', 'boot_2', 'puddle_1', 'puddle_2', 'puddle_3', 'wade_1', 'wade_2', 'wade_loop',
  'splash_in', 'underwater', 'climb_out', 'breath_calm', 'breath_heavy', 'land',
];

export class AudioSys {
  async init(onProgress) {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.send = ctx.createGain();
    // a vast tiled hall and a tight corridor; zone crossfades between them
    this.verbs = {};
    for (const [name, sec, decay] of [['hall', 5.0, 2.4], ['small', 1.5, 3.2]]) {
      const conv = ctx.createConvolver();
      conv.buffer = this.impulse(sec, decay);
      const wet = ctx.createGain();
      wet.gain.value = 0;
      this.send.connect(conv).connect(wet).connect(this.master);
      this.verbs[name] = wet;
    }

    this.buffers = {};
    let done = 0;
    await Promise.all(FILES.map(async (f) => {
      const res = await fetch(`audio/${f}.mp3`);
      this.buffers[f] = await ctx.decodeAudioData(await res.arrayBuffer());
      onProgress?.(++done / FILES.length);
    }));
    this.makeZoomMotor();
  }

  impulse(sec, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // sparse early reflections, then a dense tail
        const early = i < rate * 0.08 && Math.random() < 0.004 ? 2 : 0;
        d[i] = ((Math.random() * 2 - 1) + early) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  chain(src, { pos, gain = 1, send = 0.5, ref = 2, rolloff = 1.2 }) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    let out = g, panner = null;
    if (pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = ref;
      panner.rolloffFactor = rolloff;
      panner.maxDistance = 200;
      this.setPos(panner, pos);
      out = g.connect(panner);
    }
    out.connect(this.dry);
    const s = ctx.createGain();
    s.gain.value = send;
    out.connect(s).connect(this.send);
    return { gain: g, panner, src };
  }

  setPos(panner, p) {
    if (panner.positionX) {
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
    } else panner.setPosition(p.x, p.y, p.z);
  }

  play(name, opts = {}) {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = opts.rate ?? 1;
    const h = this.chain(src, opts);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
    return h;
  }

  loop(name, opts = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = true;
    src.playbackRate.value = opts.rate ?? 1;
    const h = this.chain(src, opts);
    src.start(this.ctx.currentTime, Math.random() * src.buffer.duration);
    return h;
  }

  // Synth servo whine for the zoom rocker.
  makeZoomMotor() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 4;
    this.zoomGain = ctx.createGain();
    this.zoomGain.gain.value = 0;
    osc.connect(bp).connect(this.zoomGain).connect(this.master);
    osc.start();
    this.zoomOsc = osc;
  }

  setZoomMotor(rate) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.zoomGain.gain.setTargetAtTime(Math.min(Math.abs(rate) * 0.03, 0.035), t, 0.03);
    this.zoomOsc.frequency.setTargetAtTime(160 + Math.abs(rate) * 60, t, 0.05);
  }

  setListener(cam, fwd) {
    const l = this.ctx.listener, p = cam.position;
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  setReverb(hall, small) {
    const t = this.ctx.currentTime;
    this.verbs.hall.gain.setTargetAtTime(hall, t, 0.6);
    this.verbs.small.gain.setTargetAtTime(small, t, 0.6);
  }

  setMuffled(cutoff) {
    if (!this.ctx || this.cutoff === cutoff) return;
    this.cutoff = cutoff;
    this.muffle.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.12);
  }
}
