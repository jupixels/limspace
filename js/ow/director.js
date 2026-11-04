import * as THREE from 'three';
import { createSwimmer, createOccupant, createListener } from '../creatures.js';
import { S } from './biomes.js';

// What's written on the lost tapes. Found ones stay found.
const TAPE_LINES = [
  'you have been here before. you just don\'t remember leaving.',
  'the lights were on when we got here. nobody turned them on.',
  'mom said the pool closes at six. it is always six here.',
  'if you hear your name, don\'t answer it.',
  'i counted the doors twice. there was one more the second time.',
  'the grass is warm even at night. there is no night.',
  'someone keeps moving the chairs.',
  'it\'s okay to stay a little longer.',
  'the mall is closing. the mall has been closing for years.',
  'don\'t look at the tall one. it likes being looked at.',
  'the water is exactly as warm as you are.',
  'the hum stops when you stop listening. it never stops.',
  'there\'s a room here that looks like your bedroom. don\'t go in.',
  'we were happy here. i think.',
  'the exit sign was pointing the other way yesterday.',
  'everything here is a little bigger than you remember.',
  'you can rest. nothing here is in a hurry.',
  'it can\'t see you. it doesn\'t need to.',
  'the sky is painted. i touched it once.',
  'if the carpet is wet, keep walking.',
  'i found my old school here. every classroom was empty but warm.',
  'the phone rang and it was me, calling from later.',
  'there are no windows in the pool rooms, and yet there is a sun.',
  'it\'s the feeling of waking up from a nap at dusk.',
  'all the clocks say 2:13.',
  'some doors in the field go somewhere. most go nowhere. both are true.',
  'the music in the mall is a song you almost know.',
  'stay where the light is warm.',
  'i left a tape for you. you\'re holding it.',
  'this is not a bad place. this is just a place.',
];
const PHONE_LINES = [
  'a voice says: "the field has a door that isn\'t empty."',
  'a voice says: "you dropped something in the water."',
  'a voice says: "don\'t stay in the deep end."',
  'a voice says: "he only moves when you look away."',
  'a voice says: "walk softly in the mall."',
  'a voice says your name, then hangs up.',
];
const SPAWN_EVERY = 6;
const FIRST_COOLDOWN = 70;
const v = new THREE.Vector3();
const ndc = new THREE.Vector3();

export class ExploreDirector {
  constructor({ world, audio, player, fx, camera }) {
    Object.assign(this, { world, audio, player, fx, camera });
    this.onCatch = () => {};
    this.catchSound = 'shriek';
    this.t = 0;
    this.message = null;
    this.messageT = 0;
    this.messageLen = 1;
    this.prompt = null;
    this.heartbeat = 0;
    this.whine = 0;
    this.monster = null;
    this.cooldown = FIRST_COOLDOWN;
    this.spawnTimer = SPAWN_EVERY;
    this.nextAmbient = 15;
    this.lunge = null;
    this.rang = new Set();
    this.foundKey = `limspace.found.${world.seed}`;
    try { this.found = new Set(JSON.parse(localStorage.getItem(this.foundKey)) || []); } catch { this.found = new Set(); }
    const scene = world.scene;
    this.rigs = { swimmer: createSwimmer(), occupant: createOccupant(), listener: createListener() };
    for (const r of Object.values(this.rigs)) { r.root.visible = false; scene.add(r.root); }
    this.say('somewhere you\'ve been before', 4);
  }

  get tapesFound() { return this.found.size; }
  get linesHeard() { return new Set([...this.found].map((id) => Math.abs(hashString(id)) % TAPE_LINES.length)).size; }

  say(text, seconds) {
    this.message = text;
    this.messageT = this.messageLen = seconds;
  }

  looking(target, cos) {
    v.subVectors(target, this.camera.position).normalize();
    return v.dot(this.player.forward) > cos;
  }

  onScreen(p, margin = 0.9) {
    ndc.copy(p).project(this.camera);
    return ndc.z < 1 && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin;
  }

  blocked(x, z, r = 0.3) {
    return this.world.colliders.some((b) => b.minY < 1.5 && b.maxY > 0.3 && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);
  }

  interact() {
    const it = this.focus;
    if (!it) return;
    if (it.type === 'tape') {
      this.found.add(it.id);
      try { localStorage.setItem(this.foundKey, JSON.stringify([...this.found])); } catch { /* storage off */ }
      it.mesh.visible = false;
      this.audio.play('memory_chime', { gain: 1, send: 0.3 });
      const line = TAPE_LINES[Math.abs(hashString(it.id)) % TAPE_LINES.length];
      this.say(line, 6);
      this.fx.glitch = Math.max(this.fx.glitch, 0.3);
    } else if (it.type === 'phone' && it.ringing) {
      it.ringing = false;
      it.ring?.src.stop();
      this.audio.play('phone_voice', { pos: it.pos, gain: 1.2, send: 0.3, ref: 1.5 });
      this.say(PHONE_LINES[Math.abs(hashString(it.id)) % PHONE_LINES.length], 6);
    }
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
    if (was === 'wander') this.audio.play('hiss', { pos: m.pos, gain: 1.3, send: 0.3, ref: 2 });
    if (m.state === 'hunt' && was !== 'hunt') this.audio.play('scramble', { pos: m.pos, gain: 1.5, send: 0.4, ref: 2 });
  }

  update(dt) {
    const { world, player, camera, audio, fx } = this;
    this.t += dt;
    this.messageT = Math.max(0, this.messageT - dt);
    if (this.messageT <= 0) this.message = null;
    const biome = world.zoneAt(player.pos.x, player.pos.z);

    // things to pick up, phones to answer, doors to fall through
    this.focus = null;
    for (const it of world.items()) {
      if (it.type === 'tape') {
        if (this.found.has(it.id)) { if (it.mesh) it.mesh.visible = false; continue; }
        if (camera.position.distanceTo(it.pos) < 2.0 && this.looking(it.pos, 0.8)) this.focus = it;
      } else if (it.type === 'phone') {
        const d = camera.position.distanceTo(it.pos);
        if (d < 10 && !this.rang.has(it.id)) {
          this.rang.add(it.id);
          it.ringing = true;
          it.ring = audio.loop('phone_ring', { pos: it.pos, gain: 1.3, send: 0.5, ref: 2, hrtf: true });
        }
        if (it.ringing && d < 1.8 && this.looking(it.pos, 0.7)) this.focus = it;
      } else if (it.type === 'dreamDoor') {
        if (Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z) < 0.4) this.fallThrough();
      } else if (it.type === 'fountain' && !it.sound) {
        it.sound = audio.loop('fountain', { pos: it.pos, gain: 1, send: 0.4, ref: 3, hrtf: true });
      }
    }
    this.prompt = this.focus ? (this.focus.type === 'tape' ? '[E] take' : '[E] answer') : null;

    this.ambient(dt, biome);
    this.monsters(dt, biome);
    this.updateMonster(dt);

    const calm = { backrooms: 0.14, pool: 0.06, meadow: 0.03, mall: 0.18 }[biome] ?? 0.1;
    const target = calm + this.heartbeat * 0.3 + this.whine * 0.5;
    fx.tension += (target - fx.tension) * (1 - Math.exp(-dt * 0.8));
  }

  // Step into a dream door and wake up somewhere else.
  fallThrough() {
    const { world, player, fx, audio } = this;
    const cx = Math.floor(player.pos.x / S) + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.floor(Math.random() * 8));
    const cz = Math.floor(player.pos.z / S) + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.floor(Math.random() * 8));
    const to = world.teleport(cx, cz);
    player.place(to.x, 0, to.z, player.yaw);
    this.despawn();
    this.wrapped = true;
    audio.play('dream_door', { gain: 1.2, send: 0.3 });
    fx.glitch = 1.6;
    fx.fade = 0.8;
    this.say('somewhere else', 3);
  }

  ambient(dt, biome) {
    const { audio, player } = this;
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = 14 + Math.random() * 22;
    const far = (d) => {
      const a = Math.random() * Math.PI * 2;
      return { x: player.pos.x + Math.cos(a) * d, y: 1, z: player.pos.z + Math.sin(a) * d };
    };
    const cue = {
      backrooms: [['light_flicker', 6], ['occupant_step', 14], ['knock', 18], ['floor_creak', 12]],
      pool: [['drip', 8], ['splash_far', 20], ['drip', 5]],
      meadow: [['children_far', 30], ['music_box', 25]],
      mall: [['elevator_ding', 25], ['distant_door', 30], ['knock', 20]],
    }[biome] ?? [];
    if (!cue.length) return;
    const [name, d] = cue[Math.floor(Math.random() * cue.length)];
    audio.play(name, { pos: far(d), gain: 1.2, send: 0.7, ref: 3, rolloff: 0.8 });
  }

  // ---------- monsters: rare, and only in their own kind of place ----------
  monsters(dt, biome) {
    if (this.monster) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = SPAWN_EVERY;
    const { player, world } = this;
    const p = player.pos;
    const pool = world.waterRect(p.x, p.z);
    if (biome === 'pool' && pool?.deep && p.y < pool.surface - 0.5 && Math.random() < 0.6) return this.spawnSwimmer(pool);
    if (Math.random() > 0.25) return;
    if (biome === 'backrooms') this.spawnAway('occupant', 13, 20);
    else if (biome === 'mall') this.spawnAway('listener', 12, 18);
    else if (biome === 'meadow') this.spawnAway('watcher', 26, 34);
  }

  spawnAway(kind, dmin, dmax) {
    const p = this.player.pos;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = dmin + Math.random() * (dmax - dmin);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (this.world.zoneAt(x, z) !== this.world.zoneAt(p.x, p.z) || this.blocked(x, z, 0.4) || this.world.waterAt(x, z) !== null) continue;
      const rig = this.rigs[kind === 'watcher' ? 'occupant' : kind];
      rig.root.visible = true;
      rig.setScare(0);
      this.monster = { kind, rig, pos: new THREE.Vector3(x, 0, z), stare: 0, unseen: 0, behind: 0, seen: false, age: 0, state: 'wander', target: null, pause: 2, lastHeard: -99, heading: 0 };
      return;
    }
  }

  spawnSwimmer(pool) {
    const rig = this.rigs.swimmer;
    const p = this.player.pos;
    const x = p.x < (pool.x1 + pool.x2) / 2 ? pool.x2 - 0.8 : pool.x1 + 0.8;
    const z = p.z < (pool.z1 + pool.z2) / 2 ? pool.z2 - 1.2 : pool.z1 + 1.2;
    rig.root.visible = true;
    rig.setScare(0);
    rig.setReach(0);
    this.monster = { kind: 'swimmer', rig, pool, pos: new THREE.Vector3(x, pool.floor + 0.3, z), vel: new THREE.Vector2(), heading: 0, age: 0, dry: 0, glide: 0 };
    this.audio.play('splash_far', { pos: this.monster.pos, gain: 1.4, send: 0.8, ref: 3 });
  }

  despawn(cool = 110 + Math.random() * 90) {
    if (this.monster) this.monster.rig.root.visible = false;
    this.monster = null;
    this.cooldown = cool;
    this.heartbeat = 0;
    this.whine = 0;
    if (this.clicks) this.audio.ramp(this.clicks.gain.gain, 0, 0.3);
  }

  afterRewind() {
    this.despawn(140);
    this.lunge = null;
    for (const r of Object.values(this.rigs)) { r.setScare(0); r.setReach?.(0); }
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
    if (dist > 40 || m.age > 150) return this.despawn();
    if (m.kind === 'occupant') return this.occupant(dt, m, dist);
    if (m.kind === 'listener') return this.listener(dt, m, dist);
    if (m.kind === 'watcher') return this.watcher(dt, m, dist);
  }

  // in the deep water it moves only while you aren't looking; climb out and it lets you go
  swimmer(dt, m, dist) {
    const { player, camera, audio } = this;
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
      if (len > 0.05) m.vel.lerp(to.multiplyScalar(Math.min(2.6, len * 2) / len), 1 - Math.exp(-dt * 3));
      rig.swim(dt, m.vel.length());
      m.glide -= dt;
      if (m.glide <= 0 && len > 0.5) { m.glide = 2 + Math.random(); audio.play('swimmer_glide', { pos: body.position, gain: 1.5, send: 0.6, ref: 3 }); }
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
    const { player, camera, audio } = this;
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
      if (m.seen && m.unseen > 1.6 && dist > 1.0) {
        m.unseen = 0;
        const dir = v.set(p.x - m.pos.x, 0, p.z - m.pos.z).normalize();
        for (const len of [2.4, 1.4, 0.7]) {
          const step = Math.min(len, dist - 0.95);
          const x = m.pos.x + dir.x * step, z = m.pos.z + dir.z * step;
          if (!this.blocked(x, z, 0.25)) {
            m.pos.set(x, 0, z);
            audio.play('occupant_step', { pos: { x, y: 0.1, z }, gain: 1.5, send: 0.5, ref: 2 });
            break;
          }
        }
      }
      // never seen for a long while: it gives up and is gone
      if (!m.seen && m.age > 60) return this.despawn();
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
        // slide along whatever's in the way
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

  // in the meadow it only stands there, far off, and is gone when you come close or look away
  watcher(dt, m, dist) {
    const { player, camera } = this;
    const rig = m.rig;
    const seen = this.onScreen(v.set(m.pos.x, 1.6, m.pos.z));
    if (seen) m.seen = true;
    m.unseen = seen ? 0 : m.unseen + dt;
    rig.root.position.copy(m.pos);
    rig.root.rotation.y = Math.atan2(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
    rig.update(dt, this.t, camera.position, 1);
    if (dist < 14 || (m.seen && m.unseen > 2.5)) this.despawn(90 + Math.random() * 60);
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

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
