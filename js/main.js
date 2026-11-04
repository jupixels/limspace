import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Player } from './player.js';
import { Body } from './body.js';
import { AudioSys } from './audio.js';
import { CamcorderShader, OSD } from './camcorder.js';
import { Level } from './tapes/level.js';
import { TAPES } from './tapes/index.js';

// Camcorder sensors were low-res; rendering below native keeps it soft (and fast).
const PIXEL_RATIO = Math.min(devicePixelRatio, 1) * 0.8;
const WATER_FOG = { color: new THREE.Color(0x0e4a50), density: 0.18 };
const DEATH = { hold: 2.1, staticAt: 1.05 }; // seconds from the catch to the hard cut, then the rewind
const REWIND_TIME = 2.6;
const REWIND_SPAN = 20; // seconds of your own path the tape runs back over
const SETTINGS_KEY = 'limspace.settings';
const TAPE_KEY = 'limspace.tape';
const DONE_KEY = 'limspace.done';
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } },
};
const playable = TAPES.filter((t) => t.level);
let tape = playable.find((t) => t.id === store.get(TAPE_KEY, 't1')) ?? playable[0];

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PIXEL_RATIO);
renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.04);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 400);

let world = new Level(scene, tape.level);
const player = new Player(camera, world);
const audio = new AudioSys();
const osd = new OSD();
const fx = { glitch: 0, tension: 0.1, nv: 0, nvOn: false, battery: 100, exposure: 1, fade: 1, under: 0 };
let director = null;
let body = null;
// the camcorder's infrared lamp: only there while night vision is on
const ir = new THREE.PointLight(0xffffff, 0, 24, 1.3);
scene.add(ir);

function makeDirector() {
  director = new tape.Director({ world, audio, player, fx, camera, tape });
  director.onCatch = onCatch;
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 8 });
gtao.blendIntensity = 0.85;
const gtaoRender = gtao.render.bind(gtao);
gtao.render = (...args) => {
  // the sky dome and the hidden parts of the body would only darken the AO
  const sky = world.sky.visible;
  world.sky.visible = false;
  if (body) body.root.visible = false;
  gtaoRender(...args);
  world.sky.visible = sky;
  if (body) body.root.visible = true;
};
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.65, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const cam = new ShaderPass(CamcorderShader);
cam.uniforms.tOSD.value = osd.texture;
composer.addPass(cam);
const U = cam.uniforms;
const setResolution = () => renderer.getDrawingBufferSize(U.resolution.value);
setResolution();

// title -> loading -> playing <-> paused; playing -> dying -> rewinding -> playing
let state = 'title';
let ready = false;
let gameT = 0, realT = 0, osdTimer = 0, titleTimer = 0, snowT = 0;
let seqT = 0, playMarker = 0, staticSound = null;
const history = []; // your path over the last stretch, for the rewind
let historyT = 0;
const loops = {};

const compile = () => (renderer.compileAsync ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera));
let prepared = (async () => {
  await world.ready;
  await world.bakeProbes(renderer, compile);
  try {
    body = await new Body().load('models');
    scene.add(body.root);
  } catch (err) {
    console.warn('body model unavailable', err);
  }
  await compile();
  ready = true;
  if (state === 'title') $('status').textContent = 'ready';
})();
$('status').textContent = 'loading...';

// another tape goes in: tear the old place down and build the new one
async function swapTape(t) {
  if (t === tape || state !== 'title') return;
  tape = t;
  store.set(TAPE_KEY, t.id);
  ready = false;
  $('status').textContent = 'loading...';
  world.dispose();
  world = new Level(scene, tape.level);
  player.world = world;
  player.colliders = world.colliders;
  player.place(world.spawn.pos.x, 0, world.spawn.pos.z, world.spawn.yaw);
  prepared = (async () => { await world.ready; await world.bakeProbes(renderer, compile); ready = true; $('status').textContent = 'ready'; })();
  renderShelf();
}

// the tape shelf on the title screen
function renderShelf() {
  const done = store.get(DONE_KEY, []);
  const shelf = $('shelf');
  shelf.innerHTML = '';
  for (const t of TAPES) {
    const b = document.createElement('button');
    b.className = 'tape' + (t === tape ? ' on' : '') + (t.level ? '' : ' blank');
    const recs = store.get(`limspace.rec.${t.id}`, []).length;
    b.innerHTML = `<span class="no">TAPE ${t.number}</span><span class="name">${t.title}</span>`
      + `<span class="meta">${t.level ? `${done.includes(t.id) ? '&#9632; WATCHED' : '&#9633; UNWATCHED'} &middot; ${recs}/8` : 'NOT RECORDED YET'}</span>`;
    b.title = t.blurb;
    b.disabled = !t.level;
    b.addEventListener('click', (e) => { e.stopPropagation(); swapTape(t); });
    shelf.appendChild(b);
  }
  $('blurb').textContent = tape.blurb;
}
renderShelf();
{
  // the camcorder's clock was never set: right time of night, wrong year
  const d = new Date(), h = d.getHours();
  const mon = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUN.', 'JUL.', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'][d.getMonth()];
  $('clock').innerHTML = `${h < 12 ? 'AM' : 'PM'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}<br>${mon} ${String(d.getDate()).padStart(2, '0')} 1999`;
}

// tape snow over the menus, drawn small and stretched
const snow = $('snow'), snowG = snow.getContext('2d');
snow.width = 160; snow.height = 90;
const snowImg = snowG.createImageData(160, 90);
function drawSnow() {
  const shown = state !== 'playing' && state !== 'dying' && state !== 'rewinding';
  snow.classList.toggle('off', !shown);
  if (!shown) return;
  const px = snowImg.data;
  for (let i = 0; i < px.length; i += 4) { const v = Math.random() * 255; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
  snowG.putImageData(snowImg, 0, 0);
}
function showPause() {
  const n = director.recordingsFound, total = director.recordingsTotal;
  $('pauseTape').textContent = `TAPE ${tape.number}  ${tape.title}`;
  $('found').textContent = `${n} / ${total}`;
  $('objective').textContent = director.objective ?? '-';
  const segs = $('segs');
  if (segs.children.length !== total) { segs.innerHTML = ''; for (let i = 0; i < total; i++) segs.appendChild(document.createElement('i')); }
  [...segs.children].forEach((el, i) => el.classList.toggle('on', i < n));
  $('pause').classList.remove('hidden');
}

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
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* storage off */ }
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
  lock();
  try {
    $('bar').parentElement.classList.add('on');
    await audio.init((p) => { $('status').textContent = 'loading tape...'; $('bar').style.width = `${Math.round(p * 60)}%`; });
    await audio.load(tape.sounds ?? [], (p) => { $('bar').style.width = `${Math.round(60 + p * 30)}%`; });
    $('status').textContent = 'rewinding...';
    await Promise.all([prepared, document.fonts.load('26px VT323')]);
  } catch (err) {
    $('status').textContent = 'tape is damaged: ' + err.message;
    state = 'title';
    $('play').disabled = false;
    return;
  }
  makeDirector();
  startAmbience();
  applySettings();
  resetHistory();
  $('title').classList.add('hidden');
  fx.glitch = 1.2;
  if (document.pointerLockElement === renderer.domElement) state = 'playing';
  else {
    // the lock didn't take (Safari, or the click was spent on loading): one more click starts
    state = 'paused';
    showPause();
  }
  $('bar').style.width = '100%';
});
$('endBack').addEventListener('click', (e) => { e.stopPropagation(); location.reload(); });
$('end').addEventListener('click', (e) => e.stopPropagation());

$('pause').addEventListener('click', lock);
$('pausePanel').addEventListener('click', (e) => e.stopPropagation());
$('resume').addEventListener('click', lock);
$('quit').addEventListener('click', (e) => { e.stopPropagation(); location.reload(); });

document.addEventListener('pointerlockchange', () => {
  player.locked = document.pointerLockElement === renderer.domElement;
  if (!player.locked && state === 'playing') {
    state = 'paused';
    showPause();
    player.keys.clear();
  } else if (player.locked && state === 'paused') {
    state = 'playing';
    $('pause').classList.add('hidden');
    fx.glitch = Math.max(fx.glitch, 0.5);
  }
});

addEventListener('keydown', (e) => {
  if (state !== 'playing' || e.repeat) return;
  if (e.code === 'KeyE') director.interact();
  if (e.code !== 'KeyN') return;
  if (!fx.nvOn && fx.battery <= 0) return;
  fx.nvOn = !fx.nvOn;
  fx.glitch = Math.max(fx.glitch, 0.3);
  audio.play('glitch', { gain: 0.1, send: 0, rate: 1.8 });
});

function startAmbience() {
  audio.play('rec_start', { gain: 0.9, send: 0 });
  loops.hiss = audio.loop('tape_hiss', { gain: 0.05, send: 0 });
  loops.drone = audio.loop('dread_drone', { gain: 0, send: 0.3 });
  loops.under = audio.loop('underwater', { gain: 0, send: 0 });
  loops.wade = audio.loop('wade_loop', { gain: 0, send: 0.4 });
  loops.heart = audio.loop('heartbeat', { gain: 0, send: 0 });
  loops.whine = audio.loop('stare_whine', { gain: 0, send: 0 });
  // one bed of sound per room, crossfaded as you move between them
  loops.beds = {};
  for (const z of Object.values(world.zones)) {
    const name = z.ambience?.[0];
    if (name && !loops.beds[name]) loops.beds[name] = audio.loop(name, { gain: 0, send: 0 });
  }
}

// ---------- auto exposure ----------
const tmp = new THREE.Vector3();
function sceneLight() {
  let L = 0.12 + world.ambientLevel();
  for (const l of world.lights) {
    if (!l.on) continue;
    tmp.subVectors(l.pos, camera.position);
    const d2 = tmp.lengthSq();
    tmp.normalize();
    L += l.light.intensity / (d2 + 4) * (0.45 + 0.55 * Math.max(0, tmp.dot(player.forward)));
  }
  return L;
}

const pick = (...names) => names[Math.floor(Math.random() * names.length)];
const feet = () => ({ x: player.pos.x, y: Math.max(player.pos.y, world.waterAt(player.pos.x, player.pos.z) ?? player.pos.y) + 0.1, z: player.pos.z });

function footstep() {
  const crouch = player.eye < 1.3;
  const k = (player.running ? 1.5 : 1) * (crouch ? 0.4 : 1);
  const rate = 0.9 + Math.random() * 0.2;
  const depth = player.waterDepth;
  const floor = world.floorAt(player.pos.x, player.pos.z);
  if (player.wading) audio.play(pick('wade_1', 'wade_2'), { pos: feet(), gain: 0.55 * k, send: 0.6, ref: 1.5, rate });
  else if (depth > 0.02) audio.play(pick('puddle_1', 'puddle_2', 'puddle_3'), { pos: feet(), gain: 0.7 * k, send: 0.55, ref: 1.5, rate });
  else if (floor === 'grass') audio.play(pick('grass_1', 'grass_2'), { pos: feet(), gain: 0.55 * k, send: 0.1, ref: 1.5, rate });
  else if (floor === 'concrete') audio.play(pick('boot_1', 'boot_2'), { pos: feet(), gain: 0.65 * k, send: 0.8, ref: 1.5, rate: rate * 0.9 });
  else if (floor === 'carpet') audio.play(pick('carpet_1', 'carpet_2'), { pos: feet(), gain: 0.6 * k, send: 0.3, ref: 1.5, rate });
  else audio.play(pick('boot_1', 'boot_2'), { pos: feet(), gain: 0.55 * k, send: 0.7, ref: 1.5, rate });
  director.noise((player.running ? 1 : crouch ? 0.08 : 0.42) * (floor === 'carpet' ? 0.6 : 1), player.pos);
}

function playerEvents() {
  for (const ev of player.events) {
    if (ev === 'splash') { audio.play('splash_in', { pos: feet(), gain: 1.2, send: 0.8, ref: 2 }); fx.glitch = Math.max(fx.glitch, 0.35); }
    if (ev === 'land') { audio.play('land', { pos: feet(), gain: 0.7, send: 0.6, ref: 1.5 }); director.noise(0.9, player.pos); }
    if (ev === 'climb') audio.play('climb_out', { pos: feet(), gain: 0.9, send: 0.5, ref: 1.5 });
  }
  player.events.length = 0;
}

// ---------- caught, then the tape runs back a little ----------
function onCatch() {
  state = 'dying';
  seqT = 0;
  player.frozen = true;
  fx.glitch = 0.7;
  fx.tension = 1;
  audio.play(director.catchSound ?? 'shriek', { gain: 2.2, send: 0.15 });
  audio.play('catch', { gain: 1.2, send: 0.4 });
}

// ---------- the end of a tape ----------
function endTape() {
  state = 'ended';
  const done = store.get(DONE_KEY, []);
  if (!done.includes(tape.id)) store.set(DONE_KEY, [...done, tape.id]);
  player.keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  audio.play('tape_end', { gain: 0.9, send: 0 });
  $('endTitle').textContent = `END OF TAPE ${tape.number}`;
  $('endName').textContent = tape.title;
  $('endRecs').textContent = `recordings found ${director.recordingsFound} / ${director.recordingsTotal}`;
  $('end').classList.remove('hidden');
}

function resetHistory() {
  history.length = 0;
  history.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch });
}

function recordHistory(dt) {
  historyT -= dt;
  if (historyT > 0) return;
  historyT = 0.1;
  history.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch });
  if (history.length > REWIND_SPAN * 10) history.shift();
}

function updateSequences(dt) {
  seqT += dt;
  if (state === 'dying') {
    player.update(dt, gameT += dt);
    director.updateLunge(dt);
    const shake = seqT < DEATH.staticAt ? 0.045 * Math.min(1, seqT / 0.1) : 0;
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.rotation.z += (Math.random() - 0.5) * shake * 2.5;
    fx.glitch = Math.max(fx.glitch, seqT < DEATH.staticAt ? 0.35 + Math.random() * 0.4 : 0);
    U.staticAmt.value = seqT < DEATH.staticAt ? 0 : 1;
    if (!staticSound && seqT > DEATH.staticAt) staticSound = audio.play('static', { gain: 0.5, send: 0 });
    if (seqT >= DEATH.hold) {
      state = 'rewinding';
      seqT = 0;
      director.afterRewind();
      audio.play('rewind', { gain: 0.9, send: 0 });
    }
  } else if (state === 'rewinding') {
    // the tape runs back along the path you took, a little way
    const u = Math.min(seqT / REWIND_TIME, 1);
    const f = (1 - u * u * (3 - 2 * u)) * (history.length - 1);
    const i = Math.floor(f), k = f - i;
    const a = history[i], b = history[Math.min(history.length - 1, i + 1)];
    player.place(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, a.yaw + (b.yaw - a.yaw) * k, a.pitch + (b.pitch - a.pitch) * k);
    player.update(dt, gameT);
    U.staticAmt.value = Math.max(0, 1 - seqT / 0.35);
    U.rewind.value = 1;
    if (staticSound && seqT > 0.35) { staticSound.src.stop(); staticSound = null; }
    if (u >= 1) {
      player.frozen = false;
      fx.glitch = 0.8;
      fx.tension = 0.2;
      U.rewind.value = 0;
      playMarker = 2.5;
      resetHistory();
      state = player.locked ? 'playing' : 'paused';
      if (state === 'paused') showPause();
    }
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  if ((snowT = (snowT + 1) % 3) === 0) drawSnow();
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
    if (director.finished) endTape();
    recordHistory(dt);
    playMarker = Math.max(0, playMarker - dt);
    if (fx.nvOn) {
      fx.battery = Math.max(0, fx.battery - dt * 0.35);
      if (fx.battery <= 0) { fx.nvOn = false; fx.glitch = 0.6; }
    } else fx.battery = Math.min(100, fx.battery + dt * 0.1);
    if (!director.holdFade) fx.fade = Math.max(0, fx.fade - dt * 0.6);
  } else if (state === 'title' || state === 'loading') {
    player.update(dt, realT);
  } else if (state === 'dying' || state === 'rewinding') {
    updateSequences(dt);
  }
  if (body) body.update(state === 'playing' || state === 'rewinding' ? dt : 0, player);

  const surface = world.waterAt(camera.position.x, camera.position.z);
  const underwater = surface !== null && camera.position.y < surface;
  fx.under = underwater ? 1 : 0;
  world.update(dt, realT, underwater, camera.position);
  const fog = underwater ? WATER_FOG : world.fogAt(camera.position);
  scene.fog.color.copy(fog.color);
  scene.fog.density = fog.density * (underwater ? 1 : 1 - 0.6 * fx.nv);
  scene.background.copy(underwater ? WATER_FOG.color : fog.background);

  fx.glitch = Math.max(0, fx.glitch - dt * 1.1);
  fx.nv += ((fx.nvOn ? 1 : 0) - fx.nv) * (1 - Math.exp(-dt * 12));
  const target = THREE.MathUtils.clamp(Math.pow(0.9 / sceneLight(), 0.55), 0.45, 2.2);
  fx.exposure += (target - fx.exposure) * (1 - Math.exp(-dt * 0.8));
  ir.position.copy(camera.position).addScaledVector(player.forward, 0.3);
  ir.intensity = fx.nv * 4.5;
  renderer.toneMappingExposure = (fx.nv > 0.01 ? THREE.MathUtils.lerp(fx.exposure, 1.1, fx.nv) : fx.exposure) * (1 + fx.nv * 0.5);
  [bloom.strength, bloom.threshold] = world.level.bloom;

  if (audio.ctx && director && state !== 'loading') {
    audio.setListener(camera, player.forward);
    const Z = world.zone(player.pos.x, player.pos.z);
    audio.setReverb(...(Z.reverb ?? [0.1, 0.3]));
    audio.setZoomMotor(state === 'playing' ? (player.tZoom - player.zoom) * 3 : 0);
    audio.setMuffled(state === 'paused' ? 500 : underwater ? 650 : 20000);
    const set = (h, v, tc = 0.2) => h && audio.ramp(h.gain.gain, v, tc);
    set(loops.drone, Math.max(0, fx.tension - 0.1) * 0.9, 0.8);
    set(loops.hiss, 0.045 + fx.nv * 0.04 + fx.glitch * 0.05, 0.1);
    set(loops.under, underwater ? 0.9 : 0, 0.08);
    set(loops.wade, player.wading && !underwater ? Math.min(player.speed / 1.05, 1) * 0.5 : 0, 0.15);
    set(loops.heart, state === 'playing' ? director.heartbeat * 0.8 : 0, 0.4);
    set(loops.whine, state === 'playing' ? director.whine * 0.9 : 0, 0.15);
    for (const [name, h] of Object.entries(loops.beds ?? {})) set(h, Z.ambience?.[0] === name ? Z.ambience[1] * (state === 'ended' ? 0 : 1) : 0, 1.2);
  }

  U.time.value = realT;
  U.glitch.value = fx.glitch;
  U.tension.value = fx.tension;
  U.nv.value = fx.nv;
  U.underwater.value = fx.under;
  U.fade.value = state === 'title' || state === 'loading' ? 0.55 : state === 'ended' ? 1 : fx.fade;
  U.paused.value = state === 'paused' ? 1 : 0;
  U.noiseAmt.value = (0.03 + Math.max(0, fx.exposure - 1) * 0.03) * settings.fx + fx.tension * 0.04;
  if (state === 'playing' || state === 'paused') U.staticAmt.value = 0;

  osdTimer -= dt;
  if (osdTimer <= 0 && director && state !== 'title' && state !== 'loading') {
    osdTimer = 1 / 15;
    osd.draw({
      t: gameT, recording: state === 'playing', battery: fx.battery, nv: fx.nv,
      mode: state === 'rewinding' ? 'rew' : playMarker > 0 ? 'play' : 'rec',
      prompt: state === 'playing' ? director.prompt : null,
      message: state === 'playing' ? director.message : null,
      messageA: Math.min(1, (director.messageLen - director.messageT) / 0.6, director.messageT / 1.2),
      objective: state === 'playing' ? director.objective : null,
    });
  }

  window.game?.debugCam?.(camera);
  if (state === 'title' || state === 'loading') {
    titleTimer -= dt;
    if (titleTimer > 0) return;
    titleTimer = 1 / 12;
  }
  if (state === 'playing') adaptQuality(dt);
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

window.game = { get world() { return world; }, player, fx, audio, get director() { return director; }, renderer, camera, scene, composer, osd, tick, quality, get body() { return body; } };
