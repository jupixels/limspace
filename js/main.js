import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { AudioSys } from './audio.js';
import { CamcorderShader, OSD } from './camcorder.js';
import { Director } from './events.js';

// Camcorder sensors were low-res; rendering below native keeps it soft (and fast).
const PIXEL_RATIO = Math.min(devicePixelRatio, 1) * 0.8;
const REVERB = { hall: [0.6, 0.05], corridor: [0.12, 0.45], flooded: [0.12, 0.5], end: [0.2, 0.5], void: [0.7, 0.2] };

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PIXEL_RATIO);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x0c1514, 0.021);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 200);

const world = buildWorld(scene);
const player = new Player(camera, world.colliders, world.spawn);
const audio = new AudioSys();
const osd = new OSD();
const fx = { glitch: 0, tension: 0.1, nv: 0, nvOn: false, usedNv: false, battery: 100, exposure: 1, fade: 1, hint: null, zoomShow: 0 };
const director = new Director({ world, audio, player, fx, camera });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.82);
composer.addPass(bloom);
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

// ---------- start / pause ----------
const $ = (id) => document.getElementById(id);
const lock = () => renderer.domElement.requestPointerLock()?.catch?.(() => {});

$('play').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (state !== 'title') return;
  state = 'loading';
  $('play').disabled = true;
  try {
    await audio.init((p) => { $('status').textContent = `loading tape... ${Math.round(p * 100)}%`; });
    await document.fonts.load('38px VT323');
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
    audio.setMuffled(true);
    player.keys.clear();
  } else if (player.locked && state === 'paused') {
    state = 'playing';
    $('pause').classList.add('hidden');
    audio.setMuffled(false);
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
    L += l.light.intensity / (d2 + 4) * (0.45 + 0.55 * Math.max(0, tmp.dot(player.forward)));
  }
  return L;
}

function footstep() {
  const zone = world.zoneAt(player.pos.x, player.pos.z);
  const wet = zone === 'flooded' || zone === 'end';
  const crouch = player.eye < 1.3;
  const gain = (wet ? 0.55 : 0.5) * (player.running ? 1.5 : 1) * (crouch ? 0.35 : 1);
  audio.play(wet ? 'step_water' : 'step_tile', {
    pos: { x: player.pos.x, y: 0.1, z: player.pos.z }, gain, send: 0.75, ref: 1.5, rate: 0.88 + Math.random() * 0.22,
  });
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
    director.update(dt);
    if (fx.nvOn) {
      fx.battery = Math.max(0, fx.battery - dt * 0.35);
      if (fx.battery <= 0) { fx.nvOn = false; fx.glitch = 0.6; }
    }
    fx.fade = Math.max(0, fx.fade - dt * 0.6);
  } else if (state === 'title' || state === 'loading') {
    player.update(dt, realT);
  }
  world.update(dt, realT);

  fx.glitch = Math.max(0, fx.glitch - dt * 1.1);
  fx.nv += ((fx.nvOn ? 1 : 0) - fx.nv) * (1 - Math.exp(-dt * 12));
  const target = THREE.MathUtils.clamp(Math.pow(1.4 / sceneLight(), 0.55), 0.55, 2.6);
  fx.exposure += (target - fx.exposure) * (1 - Math.exp(-dt * 0.8));
  renderer.toneMappingExposure = fx.exposure * (1 + fx.nv * 0.8);

  const zoomRate = player.tZoom - player.zoom;
  if (Math.abs(zoomRate) > 0.01) fx.zoomShow = 2;
  else fx.zoomShow = Math.max(0, fx.zoomShow - dt);

  if (audio.ctx && state !== 'loading') {
    audio.setListener(camera, player.forward);
    const zone = world.zoneAt(player.pos.x, player.pos.z);
    audio.setReverb(...(REVERB[zone] ?? REVERB.corridor));
    audio.setZoomMotor(state === 'playing' ? zoomRate * 3 : 0);
    const now = audio.ctx.currentTime;
    loops.drone?.gain.gain.setTargetAtTime(Math.max(0, fx.tension - 0.1) * 0.9, now, 0.8);
    loops.hiss?.gain.gain.setTargetAtTime(0.045 + fx.nv * 0.04 + fx.glitch * 0.05, now, 0.1);
    for (const l of world.lights) l.hum?.gain.gain.setTargetAtTime(l.on ? 0.22 : 0, now, 0.01);
  }

  U.time.value = realT;
  U.glitch.value = fx.glitch;
  U.tension.value = fx.tension;
  U.nv.value = fx.nv;
  U.fade.value = state === 'playing' || state === 'paused' ? fx.fade : 0.55;
  U.paused.value = state === 'paused' ? 1 : 0;
  U.noiseAmt.value = 0.05 + Math.max(0, fx.exposure - 1) * 0.045 + fx.tension * 0.04;

  osdTimer -= dt;
  if (osdTimer <= 0 && state !== 'title') {
    osdTimer = 1 / 15;
    osd.draw({
      t: gameT, recording: state === 'playing', paused: state === 'paused', battery: fx.battery,
      nv: fx.nv, zoom: player.zoom, zoomShow: fx.zoomShow, hint: fx.hint,
    });
  }

  composer.render(dt);
}
frame();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  setResolution();
  osd.resize(camera.aspect);
});

window.game = { world, player, fx, audio, director, renderer, camera, scene, composer, osd, tick };
