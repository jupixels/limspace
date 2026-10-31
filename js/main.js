import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildWorld, WATER_Y } from './world.js';
import { Player } from './player.js';
import { Body } from './body.js';
import { AudioSys } from './audio.js';
import { CamcorderShader, OSD } from './camcorder.js';
import { Director } from './events.js';

// Camcorder sensors were low-res; rendering below native keeps it soft (and fast).
const PIXEL_RATIO = Math.min(devicePixelRatio, 1) * 0.8;
const REVERB = { hall: [0.6, 0.05], corridor: [0.12, 0.45], flooded: [0.12, 0.5], end: [0.2, 0.5], void: [0.7, 0.2] };
const AIR_FOG = { color: new THREE.Color(0x0c1514), density: 0.016 };
const WATER_FOG = { color: new THREE.Color(0x0a3236), density: 0.2 };
const DEATH = { hold: 1.8, staticAt: 0.6 }; // seconds from the catch to the rewind
const REWIND_TIME = 2.6;
const SETTINGS_KEY = 'limspace.settings';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PIXEL_RATIO);
renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(AIR_FOG.color.clone(), AIR_FOG.density);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 200);

const world = buildWorld(scene);
const player = new Player(camera, world);
const audio = new AudioSys();
const osd = new OSD();
const fx = { glitch: 0, tension: 0.1, nv: 0, nvOn: false, usedNv: false, battery: 100, exposure: 1, fade: 1, under: 0 };
const director = new Director({ world, audio, player, fx, camera });
let body = null;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 8 });
gtao.blendIntensity = 0.85;
// the water's reflection camera must not run again inside the AO depth/normal pass
const gtaoRender = gtao.render.bind(gtao);
gtao.render = (...args) => {
  const v = world.water.visible;
  world.water.visible = false;
  if (body) body.root.visible = false; // its hidden parts would still cast AO
  gtaoRender(...args);
  world.water.visible = v;
  if (body) body.root.visible = true;
};
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const cam = new ShaderPass(CamcorderShader);
cam.uniforms.tOSD.value = osd.texture;
composer.addPass(cam);

const U = cam.uniforms;
const setResolution = () => renderer.getDrawingBufferSize(U.resolution.value);
setResolution();

// title -> loading -> playing <-> paused; playing -> dying -> rewinding -> playing; playing -> ending -> ended
let state = 'title';
let ready = false;
let gameT = 0, realT = 0, osdTimer = 0, titleTimer = 0;
let seqT = 0, playMarker = 0, staticSound = null;
const history = []; // where you have been since the checkpoint, for the rewind
let historyT = 0;
const loops = {};
const $ = (id) => document.getElementById(id);

// textures, reflection probes, the body and every shader get ready while the title is up;
// nothing is drawn until then so the GPU isn't fighting the setup work
const prepared = (async () => {
  await world.ready;
  const compile = () => (renderer.compileAsync ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera));
  await world.bakeProbes(renderer, compile);
  try {
    body = await new Body().load('models');
    scene.add(body.root);
    body.showWholeIn(world.water);
  } catch (err) {
    console.warn('body model unavailable', err);
  }
  await compile();
  ready = true;
  if (state === 'title') $('status').textContent = 'headphones recommended';
})();
$('status').textContent = 'loading...';

// Step quality down when frames run long: AO first, then resolution, then bloom.
const quality = { level: 0, time: 0, frames: 0 };
function adaptQuality(dt) {
  quality.time += dt;
  quality.frames++;
  if (quality.time < 3) return;
  const avg = quality.time / quality.frames;
  quality.time = quality.frames = 0;
  if (avg < 1 / 40 || quality.level >= 3) return;
  quality.level++;
  if (quality.level === 1) gtao.enabled = false;
  if (quality.level === 2) {
    renderer.setPixelRatio(PIXEL_RATIO * 0.7);
    composer.setPixelRatio(PIXEL_RATIO * 0.7);
    composer.setSize(innerWidth, innerHeight);
    setResolution();
  }
  if (quality.level === 3) bloom.enabled = false;
}

// ---------- settings (kept in this browser only) ----------
const settings = { sens: 1, fx: 1, vol: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* private mode etc. */ }
function applySettings() {
  player.sensitivity = settings.sens;
  U.fxAmt.value = settings.fx;
  if (audio.master) audio.master.gain.value = 0.9 * settings.vol;
}
for (const [id, key] of [['sens', 'sens'], ['fxamt', 'fx'], ['vol', 'vol']]) {
  const el = $(id);
  el.value = settings[key];
  el.addEventListener('input', () => {
    settings[key] = parseFloat(el.value);
    applySettings();
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  });
}
applySettings();

// ---------- start / pause ----------
const lock = () => renderer.domElement.requestPointerLock()?.catch?.(() => {});

$('play').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (state !== 'title') return;
  state = 'loading';
  $('play').disabled = true;
  try {
    await audio.init((p) => { $('status').textContent = `loading tape... ${Math.round(p * 100)}%`; });
    $('status').textContent = 'rewinding...';
    await Promise.all([prepared, document.fonts.load('26px VT323')]);
  } catch (err) {
    $('status').textContent = 'tape is damaged: ' + err.message;
    state = 'title';
    $('play').disabled = false;
    return;
  }
  startAmbience();
  applySettings();
  resetHistory();
  $('title').classList.add('hidden');
  state = 'playing';
  fx.glitch = 1.2;
  lock();
});

$('pause').addEventListener('click', lock);
$('pausePanel').addEventListener('click', (e) => e.stopPropagation());
$('resume').addEventListener('click', lock);
$('again').addEventListener('click', () => location.reload());

document.addEventListener('pointerlockchange', () => {
  player.locked = document.pointerLockElement === renderer.domElement;
  if (!player.locked && state === 'playing') {
    state = 'paused';
    $('pause').classList.remove('hidden');
    player.keys.clear();
  } else if (player.locked && state === 'paused') {
    state = 'playing';
    $('pause').classList.add('hidden');
    fx.glitch = Math.max(fx.glitch, 0.5);
  }
});

addEventListener('keydown', (e) => {
  if (state === 'playing' && e.code === 'KeyE' && !e.repeat) director.interact();
  if (state !== 'playing' || e.code !== 'KeyN' || e.repeat) return;
  if (!fx.nvOn && fx.battery <= 0) return;
  fx.nvOn = !fx.nvOn;
  fx.usedNv = true;
  fx.glitch = Math.max(fx.glitch, 0.3);
  audio.play('glitch', { gain: 0.1, send: 0, rate: 1.8 });
});

function startAmbience() {
  audio.play('rec_start', { gain: 0.9, send: 0 });
  loops.hiss = audio.loop('tape_hiss', { gain: 0.05, send: 0 });
  loops.drone = audio.loop('dread_drone', { gain: 0, send: 0.3 });
  loops.pool1 = audio.loop('pool_ambience', { pos: { x: 0, y: -0.2, z: -8 }, gain: 1.0, send: 0.6, ref: 5 });
  loops.pool2 = audio.loop('pool_ambience', { pos: { x: 0, y: -0.2, z: 8 }, gain: 1.0, send: 0.6, ref: 5, rate: 0.94 });
  loops.under = audio.loop('underwater', { gain: 0, send: 0 });
  loops.wade = audio.loop('wade_loop', { gain: 0, send: 0.4 });
  loops.heart = audio.loop('heartbeat', { gain: 0, send: 0 });
  for (const l of world.lights) {
    l.hum = audio.loop('fluorescent_hum', { pos: l.pos, gain: 0.22, send: 0.15, ref: 1.5, rolloff: 1.6, rate: 0.97 + Math.random() * 0.06 });
  }
}

// ---------- auto exposure ----------
const tmp = new THREE.Vector3();
function sceneLight() {
  let L = 0.12;
  for (const l of world.lights) {
    if (!l.on) continue;
    tmp.subVectors(l.pos, camera.position);
    const d2 = tmp.lengthSq();
    tmp.normalize();
    L += l.light.intensity * l.area / (d2 + 4) * (0.45 + 0.55 * Math.max(0, tmp.dot(player.forward)));
  }
  return L;
}

const pick = (...names) => names[Math.floor(Math.random() * names.length)];
const feet = () => ({ x: player.pos.x, y: Math.max(player.pos.y, WATER_Y) + 0.1, z: player.pos.z });

function footstep() {
  const zone = world.zoneAt(player.pos.x, player.pos.z);
  const crouch = player.eye < 1.3;
  const k = (player.running ? 1.5 : 1) * (crouch ? 0.4 : 1);
  const rate = 0.9 + Math.random() * 0.2;
  if (player.wading) audio.play(pick('wade_1', 'wade_2'), { pos: feet(), gain: 0.55 * k, send: 0.6, ref: 1.5, rate });
  else if (zone === 'flooded' || zone === 'end') audio.play(pick('puddle_1', 'puddle_2', 'puddle_3'), { pos: feet(), gain: 0.7 * k, send: 0.55, ref: 1.5, rate });
  else audio.play(pick('boot_1', 'boot_2'), { pos: feet(), gain: 0.55 * k, send: 0.7, ref: 1.5, rate });
}

function playerEvents() {
  for (const ev of player.events) {
    if (ev === 'splash') { audio.play('splash_in', { pos: feet(), gain: 1.2, send: 0.8, ref: 2 }); fx.glitch = Math.max(fx.glitch, 0.35); }
    if (ev === 'land') audio.play('land', { pos: feet(), gain: 0.7, send: 0.6, ref: 1.5 });
    if (ev === 'climb') audio.play('climb_out', { pos: feet(), gain: 0.9, send: 0.5, ref: 1.5 });
  }
  player.events.length = 0;
}

// ---------- caught, rewind, end of tape ----------
director.onCatch = () => {
  state = 'dying';
  seqT = 0;
  player.frozen = true;
  fx.glitch = 1.5;
  fx.tension = 1;
  audio.play('catch', { gain: 1.5, send: 0.5 });
};

director.onEnd = () => {
  state = 'ending';
  seqT = 0;
  player.frozen = true;
  document.exitPointerLock?.();
  audio.play('stinger', { gain: 0.8, send: 0.6, rate: 0.8 });
};

function resetHistory() {
  history.length = 0;
  const p = player.pos;
  history.push({ x: p.x, y: p.y, z: p.z, yaw: player.yaw, pitch: player.pitch });
}

function recordHistory(dt) {
  historyT -= dt;
  if (historyT > 0) return;
  historyT = 0.1;
  history.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch });
  if (history.length > 3000) history.splice(1, 1); // keep the checkpoint itself
}

function updateSequences(dt) {
  seqT += dt;
  if (state === 'dying') {
    // dragged under: the view sinks and tips, then the signal dies
    player.dip = Math.min(0.9, seqT * 0.9);
    player.tPitch += (-0.7 - player.tPitch) * Math.min(1, dt * 3);
    player.update(dt, gameT += dt);
    U.staticAmt.value = THREE.MathUtils.smoothstep(seqT, DEATH.staticAt, DEATH.staticAt + 0.5);
    if (!staticSound && seqT > DEATH.staticAt) staticSound = audio.play('static', { gain: 0.5, send: 0 });
    if (seqT >= DEATH.hold) {
      state = 'rewinding';
      seqT = 0;
      audio.play('rewind', { gain: 0.9, send: 0 });
    }
  } else if (state === 'rewinding') {
    // the tape literally runs back along the path you took
    const u = Math.min(seqT / REWIND_TIME, 1);
    const f = (1 - u * u * (3 - 2 * u)) * (history.length - 1);
    const i = Math.floor(f), k = f - i;
    const a = history[i], b = history[Math.min(history.length - 1, i + 1)];
    player.place(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, a.yaw + (b.yaw - a.yaw) * k, a.pitch + (b.pitch - a.pitch) * k);
    player.dip = 0;
    player.update(dt, gameT);
    U.staticAmt.value = Math.max(0, 1 - seqT / 0.35);
    U.rewind.value = 1;
    if (staticSound && seqT > 0.35) { staticSound.src.stop(); staticSound = null; }
    if (u >= 1) {
      world.reset();
      director.reset();
      const sp = world.spawn;
      player.place(sp.pos.x, sp.pos.y, sp.pos.z, sp.yaw);
      player.frozen = false;
      fx.nvOn = false;
      fx.glitch = 0.8;
      fx.tension = 0.2;
      U.rewind.value = 0;
      playMarker = 2.5;
      resetHistory();
      state = player.locked ? 'playing' : 'paused';
      if (state === 'paused') $('pause').classList.remove('hidden');
    }
  } else if (state === 'ending') {
    U.staticAmt.value = THREE.MathUtils.smoothstep(seqT, 0.8, 2.2);
    if (!staticSound && seqT > 0.9) staticSound = audio.play('static', { gain: 0.45, send: 0 });
    if (seqT > 2.8) {
      state = 'ended';
      staticSound?.src.stop();
      staticSound = null;
      audio.play('eject', { gain: 0.9, send: 0 });
      audio.setMuffled(300);
      $('end').classList.remove('hidden');
    }
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), 0.05));
}

function tick(dt) {
  if (!ready) return;
  realT += dt;

  if (state === 'playing') {
    gameT += dt;
    if (player.update(dt, gameT)) footstep();
    playerEvents();
    director.update(dt);
    recordHistory(dt);
    playMarker = Math.max(0, playMarker - dt);
    if (fx.nvOn) {
      fx.battery = Math.max(0, fx.battery - dt * 0.35);
      if (fx.battery <= 0) { fx.nvOn = false; fx.glitch = 0.6; }
    }
    fx.fade = Math.max(0, fx.fade - dt * 0.6);
  } else if (state === 'title' || state === 'loading') {
    player.update(dt, realT);
  } else if (state === 'dying' || state === 'rewinding' || state === 'ending') {
    updateSequences(dt);
  }
  if (body) body.update(state === 'playing' || state === 'rewinding' ? dt : 0, player);

  const underwater = camera.position.y < WATER_Y && world.inPool(camera.position.x, camera.position.z);
  fx.under = underwater ? 1 : 0;
  world.update(dt, realT, underwater);
  const fog = underwater ? WATER_FOG : AIR_FOG;
  scene.fog.color.copy(fog.color);
  scene.fog.density = fog.density;

  fx.glitch = Math.max(0, fx.glitch - dt * 1.1);
  fx.nv += ((fx.nvOn ? 1 : 0) - fx.nv) * (1 - Math.exp(-dt * 12));
  const target = THREE.MathUtils.clamp(Math.pow(0.9 / sceneLight(), 0.55), 0.5, 2.2);
  fx.exposure += (target - fx.exposure) * (1 - Math.exp(-dt * 0.8));
  renderer.toneMappingExposure = fx.exposure * (1 + fx.nv * 0.8);

  if (audio.ctx && state !== 'loading') {
    audio.setListener(camera, player.forward);
    const zone = world.zoneAt(player.pos.x, player.pos.z);
    audio.setReverb(...(REVERB[zone] ?? REVERB.corridor));
    audio.setZoomMotor(state === 'playing' ? (player.tZoom - player.zoom) * 3 : 0);
    if (state !== 'ended') audio.setMuffled(state === 'paused' ? 500 : underwater ? 650 : 20000);
    const set = (h, v, tc = 0.2) => h && audio.ramp(h.gain.gain, v, tc);
    set(loops.drone, Math.max(0, fx.tension - 0.1) * 0.9, 0.8);
    set(loops.hiss, 0.045 + fx.nv * 0.04 + fx.glitch * 0.05, 0.1);
    set(loops.under, underwater ? 0.9 : 0, 0.08);
    set(loops.wade, player.wading && !underwater ? Math.min(player.speed / 1.05, 1) * 0.5 : 0, 0.15);
    set(loops.heart, state === 'playing' ? director.heartbeat * 0.8 : 0, 0.4);
    for (const l of world.lights) set(l.hum, l.on ? 0.22 : 0, 0.01);
  }

  U.time.value = realT;
  U.glitch.value = fx.glitch;
  U.tension.value = fx.tension;
  U.nv.value = fx.nv;
  U.underwater.value = fx.under;
  U.fade.value = state === 'playing' || state === 'paused' ? fx.fade : 0.55;
  U.paused.value = state === 'paused' ? 1 : 0;
  U.noiseAmt.value = (0.03 + Math.max(0, fx.exposure - 1) * 0.03) * settings.fx + fx.tension * 0.04;
  if (state === 'playing' || state === 'paused') U.staticAmt.value = 0;

  osdTimer -= dt;
  if (osdTimer <= 0 && state !== 'title') {
    osdTimer = 1 / 15;
    osd.draw({
      t: gameT, recording: state === 'playing', battery: fx.battery, nv: fx.nv,
      mode: state === 'rewinding' ? 'rew' : playMarker > 0 ? 'play' : 'rec',
      prompt: state === 'playing' ? director.prompt : null,
    });
  }

  window.game?.debugCam?.(camera);
  // the title only needs a slow, dim backdrop
  if (state === 'title' || state === 'loading') {
    titleTimer -= dt;
    if (titleTimer > 0) return;
    titleTimer = 1 / 12;
  }
  if (state === 'playing') adaptQuality(dt);
  if (state === 'ended') return;
  composer.render(dt);
}
frame();

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  setResolution();
  osd.resize(camera.aspect);
});

window.game = { world, player, fx, audio, director, renderer, camera, scene, composer, osd, tick, quality, get body() { return body; } };
