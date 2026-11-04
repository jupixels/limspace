import * as THREE from 'three';
import { createSwimmer, createOccupant, createListener } from '../creatures.js';
import { Kit } from './kit.js';

const v = new THREE.Vector3();
const ndc = new THREE.Vector3();

// What every tape shares: subtitles and prompts, things to pick up, recordings
// that stay found, the kit of things that move by themselves, and the entities.
export class TapeDirector {
  constructor({ world, audio, player, fx, camera, tape }) {
    Object.assign(this, { world, audio, player, fx, camera, tape });
    this.onCatch = () => {};
    this.catchSound = 'shriek';
    this.t = 0;
    this.message = null;
    this.messageT = 0;
    this.messageLen = 1;
    this.prompt = null;
    this.objective = null;
    this.heartbeat = 0;
    this.whine = 0;
    this.calm = 0.1;
    this.monster = null;
    this.lunge = null;
    this.finished = false;
    this.kit = new Kit(this);
    this.recKey = `limspace.rec.${tape.id}`;
    try { this.found = new Set(JSON.parse(localStorage.getItem(this.recKey)) || []); } catch { this.found = new Set(); }
    this.rigs = {};
    this.sounds = [];
  }

  rig(kind) {
    if (!this.rigs[kind]) {
      const r = { occupant: createOccupant, listener: createListener, swimmer: createSwimmer }[kind]();
      r.root.visible = false;
      this.world.dynamic.add(r.root);
      this.rigs[kind] = r;
    }
    return this.rigs[kind];
  }

  get recordingsFound() { return this.world.items().filter((it) => it.type === 'recording' && this.found.has(it.id)).length; }
  get recordingsTotal() { return this.world.items().filter((it) => it.type === 'recording').length; }

  say(text, seconds = 5) {
    this.message = text;
    this.messageT = this.messageLen = seconds;
  }

  setObjective(text) {
    if (text === this.objective) return;
    this.objective = text;
  }

  looking(target, cos) {
    v.subVectors(target, this.camera.position).normalize();
    return v.dot(this.player.forward) > cos;
  }

  onScreen(p, margin = 0.9) {
    ndc.copy(p).project(this.camera);
    return ndc.z < 1 && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin;
  }

  near(x, z, r) { return Math.hypot(this.player.pos.x - x, this.player.pos.z - z) < r; }
  inRect(x1, x2, z1, z2) { const p = this.player.pos; return p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2; }
  zone() { return this.world.zoneAt(this.player.pos.x, this.player.pos.z); }

  blocked(x, z, r = 0.3) {
    return this.world.colliders.some((b) => !b.off && b.minY < 1.5 && b.maxY > 0.3 && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);
  }

  play(name, pos, o = {}) {
    return this.audio.play(name, { pos, gain: 1, send: 0.5, ref: 2, ...o });
  }

  loopAt(name, pos, o = {}) {
    const h = this.audio.loop(name, { pos, gain: 1, send: 0.4, ref: 2, ...o });
    this.sounds.push(h);
    return h;
  }

  // a recording you can play once found; it stays found across visits
  takeRecording(it) {
    this.found.add(it.id);
    try { localStorage.setItem(this.recKey, JSON.stringify([...this.found])); } catch { /* storage off */ }
    it.led && (it.led.material = this.world.M.panelDead);
    if (it.voice && this.audio.buffers[it.voice]) {
      it.playing?.src.stop();
      it.playing = this.play(it.voice, it.pos, { gain: 1.6, send: 0.25, ref: 2.5, hrtf: false });
    } else this.play('phone_voice', it.pos, { gain: 1, ref: 2 });
    this.say(it.text, it.seconds ?? 8);
    this.fx.glitch = Math.max(this.fx.glitch, 0.25);
  }

  interact() {
    const it = this.focus;
    if (!it) return;
    if (it.type === 'recording') return this.takeRecording(it);
    it.use?.(it, this);
  }

  noise(level, pos) {
    const m = this.monster;
    if (!m || m.kind !== 'listener') return;
    const d = m.pos.distanceTo(v.set(pos.x, 0, pos.z));
    if (d > level * 13) return;
    const was = m.state;
    m.target = new THREE.Vector3(pos.x, 0, pos.z);
    m.lastHeard = this.t;
    m.state = d < 5 && level > 0.2 ? 'hunt' : was === 'hunt' ? 'hunt' : 'investigate';
    if (was === 'wander') this.play('hiss', m.pos, { gain: 1.3, send: 0.3 });
    if (m.state === 'hunt' && was !== 'hunt') this.play('scramble', m.pos, { gain: 1.5, send: 0.4 });
  }

  update(dt) {
    const { camera, fx } = this;
    this.t += dt;
    this.messageT = Math.max(0, this.messageT - dt);
    if (this.messageT <= 0) this.message = null;

    // whatever is in reach and in front of you
    this.focus = null;
    let best = Infinity;
    for (const it of this.world.items()) {
      if (it.type === 'recording') {
        if (it.led) it.led.visible = this.found.has(it.id) || Math.sin(this.t * 4) > 0;
      } else if (!it.use || it.done || (it.ready && !it.ready(this))) continue;
      const d = camera.position.distanceTo(it.pos);
      if (d < (it.reach ?? 2) && this.looking(it.pos, it.cos ?? 0.8) && d < best) { best = d; this.focus = it; }
    }
    this.prompt = this.focus ? (this.focus.type === 'recording' ? (this.found.has(this.focus.id) ? '[E] play again' : '[E] play') : this.focus.prompt ?? '[E] use') : null;

    this.kit.update(dt);
    this.script(dt);
    this.updateMonster(dt);

    const target = this.calm + this.heartbeat * 0.3 + this.whine * 0.5;
    fx.tension += (target - fx.tension) * (1 - Math.exp(-dt * 0.8));
  }

  script() {}

  dispose() {
    this.kit.stop();
    for (const h of this.sounds) { try { h.src.stop(); } catch { /* already stopped */ } }
    for (const it of this.world.items()) it.playing?.src.stop();
    if (this.clicks) this.clicks.src.stop();
  }

  // ---------- entities ----------
  spawn(kind, x, z, extra = {}) {
    const rig = this.rig(kind);
    rig.root.visible = true;
    rig.setScare(0);
    rig.setReach?.(0);
    this.monster = { kind, rig, pos: new THREE.Vector3(x, 0, z), stare: 0, unseen: 0, behind: 0, seen: false, age: 0, state: 'wander', target: null, pause: 2, lastHeard: -99, heading: 0, ...extra };
    rig.root.position.copy(this.monster.pos);
    return this.monster;
  }

  // somewhere in the same room as you, out of sight, a fair way off
  spawnAway(kind, dmin, dmax, extra = {}) {
    const p = this.player.pos, here = this.zone();
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = dmin + Math.random() * (dmax - dmin);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (this.world.zoneAt(x, z) !== here || this.blocked(x, z, 0.5) || this.world.waterAt(x, z) !== null) continue;
      if (this.onScreen(v.set(x, 1.5, z), 1.1)) continue;
      return this.spawn(kind, x, z, extra);
    }
    return null;
  }

  spawnSwimmer(pool) {
    const rig = this.rig('swimmer');
    const p = this.player.pos;
    const x = p.x < (pool.x1 + pool.x2) / 2 ? pool.x2 - 0.8 : pool.x1 + 0.8;
    const z = p.z < (pool.z1 + pool.z2) / 2 ? pool.z2 - 1.2 : pool.z1 + 1.2;
    rig.root.visible = true;
    rig.setScare(0);
    rig.setReach(0);
    this.monster = { kind: 'swimmer', rig, pool, pos: new THREE.Vector3(x, pool.floor + 0.3, z), vel: new THREE.Vector2(), heading: 0, age: 0, dry: 0, glide: 0 };
    this.play('splash_far', this.monster.pos, { gain: 1.4, send: 0.8, ref: 3 });
    return this.monster;
  }

  despawn() {
    if (this.monster) this.monster.rig.root.visible = false;
    this.monster = null;
    this.heartbeat = 0;
    this.whine = 0;
    if (this.clicks) this.audio.ramp(this.clicks.gain.gain, 0, 0.3);
  }

  afterRewind() {
    this.despawn();
    this.lunge = null;
    for (const r of Object.values(this.rigs)) { r.setScare(0); r.setReach?.(0); r.root.visible = false; }
    this.rewound?.();
  }

  catch(sound) {
    const m = this.monster;
    this.catchSound = sound;
    this.lunge = { rig: m.rig, body: m.rig.root };
    this.monster = null;
    this.heartbeat = 0;
    this.whine = 0;
    if (this.clicks) this.audio.ramp(this.clicks.gain.gain, 0, 0.05);
    this.onCatch();
  }

  updateMonster(dt) {
    const m = this.monster;
    this.heartbeat = 0;
    this.whine = 0;
    if (!m) return;
    m.age += dt;
    const p = this.player.pos;
    const dist = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
    if (m.kind === 'swimmer') return this.swimmer(dt, m, dist);
    if (m.leash && dist > m.leash) return this.despawn();
    if (m.kind === 'occupant') return this.occupant(dt, m, dist);
    if (m.kind === 'listener') return this.listener(dt, m, dist);
    if (m.kind === 'watcher') return this.watcher(dt, m, dist);
  }

  // in deep water it moves only while you aren't looking; climb out and it lets you go
  swimmer(dt, m, dist) {
    const { player, camera } = this;
    const rig = m.rig, body = rig.root, P = m.pool, p = player.pos;
    const inWater = this.world.waterRect(p.x, p.z) === P && p.y < P.surface;
    m.dry = inWater ? 0 : m.dry + dt;
    if (m.dry > 4) return this.despawn();
    const seen = this.onScreen(body.position) && dist < 20;
    const pos = new THREE.Vector2(m.pos.x, m.pos.z);
    if (!seen && inWater) {
      const goal = new THREE.Vector2(THREE.MathUtils.clamp(p.x, P.x1 + 0.6, P.x2 - 0.6), THREE.MathUtils.clamp(p.z, P.z1 + 0.6, P.z2 - 0.6));
      const to = goal.sub(pos);
      const len = to.length();
      if (len > 0.05) m.vel.lerp(to.multiplyScalar(Math.min(m.speed ?? 2.6, len * 2) / len), 1 - Math.exp(-dt * 3));
      rig.swim(dt, m.vel.length());
      m.glide -= dt;
      if (m.glide <= 0 && len > 0.5) { m.glide = 2 + Math.random(); this.play('swimmer_glide', body.position, { gain: 1.5, send: 0.6, ref: 3 }); }
    } else {
      m.vel.multiplyScalar(Math.exp(-dt * 12));
      if (seen && dist < 8 && Math.random() < dt * 0.5) rig.twitch();
    }
    pos.addScaledVector(m.vel, dt);
    m.pos.set(pos.x, P.floor + 0.3 + Math.sin(this.t * 1.3) * 0.04, pos.y);
    if (m.vel.lengthSq() > 0.01) m.heading = Math.atan2(m.vel.x, m.vel.y);
    body.position.copy(m.pos);
    body.rotation.set(0, m.heading, 0, 'YXZ');
    rig.update(dt, this.t, camera.position, seen && dist < 6 ? 1 : 0);
    this.heartbeat = inWater ? THREE.MathUtils.clamp(1 - (dist - 1.5) / 8, 0, 1) : 0;
    if (inWater && dist < 1.1) this.catch('shriek');
  }

  // looking fills its stare; looking away lets it step closer
  occupant(dt, m, dist) {
    const { player, camera } = this;
    const rig = m.rig, p = player.pos;
    const seen = dist < 26 && (this.onScreen(v.set(m.pos.x, 2.3, m.pos.z)) || this.onScreen(v.set(m.pos.x, 1.3, m.pos.z)));
    if (seen) {
      m.seen = true;
      m.stare += dt * (dist < 3 ? 2.2 : dist < 8 ? 1.4 : dist < 14 ? 1 : 0.5);
      m.unseen = 0;
      if (Math.random() < dt * 0.4) rig.twitch();
    } else {
      m.stare = Math.max(0, m.stare - dt * 0.55);
      m.unseen += dt;
      if (m.seen && m.unseen > (m.patience ?? 1.6) && dist > 1.0) {
        m.unseen = 0;
        const dir = v.set(p.x - m.pos.x, 0, p.z - m.pos.z).normalize();
        for (const len of [2.4, 1.4, 0.7]) {
          const step = Math.min(len, dist - 0.95);
          const x = m.pos.x + dir.x * step, z = m.pos.z + dir.z * step;
          if (!this.blocked(x, z, 0.25)) {
            m.pos.set(x, 0, z);
            this.play('occupant_step', { x, y: 0.1, z }, { gain: 1.5 });
            break;
          }
        }
      }
      if (!m.seen && m.age > (m.giveUp ?? 60)) return this.despawn();
      m.behind = dist < 1.1 ? m.behind + dt : 0;
    }
    rig.root.position.copy(m.pos);
    rig.root.rotation.y = Math.atan2(p.x - m.pos.x, p.z - m.pos.z);
    rig.update(dt, this.t, camera.position, dist < 16 ? 1 : 0.3);
    this.whine = Math.pow(m.stare / 2.6, 1.5);
    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1) / 7, 0, 1);
    if (m.stare >= 2.6 || m.behind > 3.5) this.catch('shriek2');
  }

  // blind; moves toward what it hears
  listener(dt, m, dist) {
    const { player, camera, audio } = this;
    const rig = m.rig, me = v.set(player.pos.x, 0, player.pos.z);
    if (m.state === 'hunt') {
      if (dist < 2.5 && player.speed > 0.6) { m.target = me.clone(); m.lastHeard = this.t; }
      if (this.t - m.lastHeard > 3) m.state = 'investigate';
    }
    if (!m.target) {
      m.pause -= dt;
      if (m.pause <= 0) {
        const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 6;
        m.target = new THREE.Vector3(m.pos.x + Math.cos(a) * d, 0, m.pos.z + Math.sin(a) * d);
        m.state = 'wander';
      }
    }
    let moving = 0;
    if (m.target) {
      const to = m.target.clone().sub(m.pos);
      const len = to.length();
      if (len < 0.2) {
        m.target = null;
        m.pause = m.state === 'wander' ? 2 + Math.random() * 3 : 3;
        if (m.state !== 'hunt') m.state = 'wander';
      } else {
        const speed = { wander: 0.8, investigate: 2.4, hunt: 3.6 }[m.state];
        const step = to.normalize().multiplyScalar(Math.min(len, speed * dt));
        if (!this.blocked(m.pos.x + step.x, m.pos.z + step.z, 0.35)) m.pos.add(step);
        else if (!this.blocked(m.pos.x + step.x, m.pos.z, 0.35)) m.pos.x += step.x;
        else if (!this.blocked(m.pos.x, m.pos.z + step.z, 0.35)) m.pos.z += step.z;
        else m.target = null;
        moving = speed;
        let d = Math.atan2(to.x, to.z) - m.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        m.heading += d * Math.min(1, dt * 6);
      }
    }
    rig.root.position.copy(m.pos);
    rig.root.rotation.set(0, m.heading, 0);
    rig.move(dt, moving);
    rig.update(dt, this.t, camera.position, dist < 6 ? 1 : 0, moving ? 0 : 1);
    if (!this.clicks) this.clicks = audio.loop('clicks', { pos: m.pos, gain: 0, send: 0.3, ref: 2, hrtf: true });
    audio.setPos(this.clicks.panner, v.set(m.pos.x, 0.7, m.pos.z));
    audio.ramp(this.clicks.gain.gain, m.state === 'wander' ? 0.6 : 1.1, 0.3);
    audio.ramp(this.clicks.src.playbackRate, m.state === 'hunt' ? 1.35 : m.state === 'investigate' ? 1.15 : 0.9, 0.3);
    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1) / 7, 0, 1);
    if (dist < 0.9) this.catch('shriek3');
  }

  // only stands there; gone when you come close or look away
  watcher(dt, m, dist) {
    const { player, camera } = this;
    const rig = m.rig;
    const seen = this.onScreen(v.set(m.pos.x, 1.6, m.pos.z));
    if (seen) m.seen = true;
    m.unseen = seen ? 0 : m.unseen + dt;
    rig.root.position.copy(m.pos);
    rig.root.rotation.y = Math.atan2(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
    rig.update(dt, this.t, camera.position, 1);
    if (dist < (m.close ?? 10) || (m.seen && m.unseen > (m.linger ?? 1.2))) { this.despawn(); m.onGone?.(); }
  }

  updateLunge(dt) {
    const l = this.lunge;
    if (!l) return;
    const { camera, player } = this;
    const { rig, body } = l;
    l.t = (l.t ?? 0) + dt;
    const rush = THREE.MathUtils.smoothstep(l.t, 0, 0.12);
    const face = camera.position.clone().addScaledVector(player.forward, 0.55 + (1 - rush) * 2.5);
    face.x += (Math.random() - 0.5) * 0.025 * rush;
    face.y += (Math.random() - 0.5) * 0.025 * rush;
    body.rotation.set(0, Math.atan2(camera.position.x - face.x, camera.position.z - face.z), 0);
    rig.setReach?.(1);
    rig.setScare(rush);
    rig.swim?.(dt, 8);
    rig.move?.(dt, 6);
    rig.update(dt, this.t + l.t, camera.position, 1, 0);
    body.updateMatrixWorld(true);
    rig.head.lookAt(camera.position);
    rig.head.rotateZ((Math.random() - 0.5) * 0.15 * rush);
    rig.head.updateMatrixWorld(true);
    body.position.add(face.sub(rig.head.getWorldPosition(new THREE.Vector3())));
  }
}
