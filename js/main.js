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
gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
gtao.blendIntensity = 0.85;
// the water's reflection camera must not run again inside the AO depth/normal pass
const gtaoRender = gtao.render.bind(gtao);
gtao.render = (...args) => {
  const v = world.water.visible;
  world.water.visible = false;
  gtaoRender(...args);
  world.water.visible = v;
};
composer.addPass(gtao);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.85));
composer.addPass(new OutputPass());
const cam = new ShaderPass(CamcorderShader);
cam.uniforms.tOSD.value = osd.texture;
composer.addPass(cam);

const U = cam.uniforms;
const setResolution = () => renderer.getDrawingBufferSize(U.resolution.value);
setResolution();

let state = 'title';
let gameT = 0, realT = 0, osdTimer = 0;
const loops = {};
const $ = (id) => document.getElementById(id);

// textures, reflection probes and the body load while the title is up
const prepared = (async () => {
  await world.ready;
  world.bakeProbes(renderer);
  try {
    body = await new Body().load('models');
    scene.add(body.root);
    body.showHeadDuring(world.water);
  } catch (err) {
    console.warn('body model unavailable', err);
  }
})();

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
  $('title').classList.add('hidden');
  state = 'playing';
  fx.glitch = 1.2;
  lock();
});

$('pause').addEventListener('click', lock);

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
  loops.breath = audio.loop('breath_calm', { gain: 0.16, send: 0 });
  loops.pant = audio.loop('breath_heavy', { gain: 0, send: 0 });
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

// ---------- main loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), 0.05));
}

function tick(dt) {
  realT += dt;

  if (state === 'playing') {
    gameT += dt;
    if (player.update(dt, gameT)) footstep();
    playerEvents();
    director.update(dt);
    if (fx.nvOn) {
      fx.battery = Math.max(0, fx.battery - dt * 0.35);
      if (fx.battery <= 0) { fx.nvOn = false; fx.glitch = 0.6; }
    }
    fx.fade = Math.max(0, fx.fade - dt * 0.6);
  } else if (state === 'title' || state === 'loading') {
    player.update(dt, realT);
  }
  if (body) body.update(state === 'playing' ? dt : 0, player);

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
    audio.setMuffled(state === 'paused' ? 500 : underwater ? 650 : 20000);
    const now = audio.ctx.currentTime;
    const set = (h, v, tc = 0.2) => h?.gain.gain.setTargetAtTime(v, now, tc);
    const exertion = THREE.MathUtils.clamp((player.running ? 0.8 : 0) + Math.max(0, fx.tension - 0.4), 0, 1);
    set(loops.drone, Math.max(0, fx.tension - 0.1) * 0.9, 0.8);
    set(loops.hiss, 0.045 + fx.nv * 0.04 + fx.glitch * 0.05, 0.1);
    set(loops.under, underwater ? 0.9 : 0, 0.08);
    set(loops.wade, player.wading && !underwater ? Math.min(player.speed / 1.05, 1) * 0.5 : 0, 0.15);
    set(loops.breath, (1 - exertion) * 0.16, 1.2);
    set(loops.pant, exertion * 0.3, 1.5);
    for (const l of world.lights) set(l.hum, l.on ? 0.22 : 0, 0.01);
  }

  U.time.value = realT;
  U.glitch.value = fx.glitch;
  U.tension.value = fx.tension;
  U.nv.value = fx.nv;
  U.underwater.value = fx.under;
  U.fade.value = state === 'playing' || state === 'paused' ? fx.fade : 0.55;
  U.paused.value = state === 'paused' ? 1 : 0;
  U.noiseAmt.value = 0.05 + Math.max(0, fx.exposure - 1) * 0.045 + fx.tension * 0.04;

  osdTimer -= dt;
  if (osdTimer <= 0 && state !== 'title') {
    osdTimer = 1 / 15;
    osd.draw({ t: gameT, recording: state === 'playing', battery: fx.battery, nv: fx.nv });
  }

  window.game?.debugCam?.(camera);
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

window.game = { world, player, fx, audio, director, renderer, camera, scene, composer, osd, tick, get body() { return body; } };
