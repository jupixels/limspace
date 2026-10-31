import * as THREE from 'three';
import { WATER_Y } from './world.js';
import { SECTIONS } from './tape4.js';

const SWIM = { speed: 2.6, reach: 1.1 };
const OCC = { stareMax: 2.4, step: 2.4, every: 1.5, closest: 0.95, grace: 3.5 };
const LIS = { hear: 13, speed: { wander: 0.8, investigate: 2.4, hunt: 3.6 }, reach: 0.9, lose: 3 };
const TENSION = [0.15, 0.22, 0.3, 0.55];
const v = new THREE.Vector3();
const ndc = new THREE.Vector3();

// Tape 04 "PLAYBACK": the earlier tapes, spliced. Each piece has its monster and its rule;
// each splice is a checkpoint. At the end of the tape there's only white, and a television.
export class Director4 {
  constructor({ world, audio, player, fx, camera }) {
    Object.assign(this, { world, audio, player, fx, camera });
    this.onCatch = () => {};
    this.onEnd = () => {};
    this.catchSound = 'shriek';
    this.section = 0;
    this.reset();
  }

  // A rewind restarts the current piece of tape, not the whole thing.
  reset() {
    const w = this.world;
    this.t = 0;
    this.lunge = null;
    this.prompt = null;
    this.ended = false;
    this.wrapped = false;
    this.heartbeat = 0;
    this.whine = 0;
    this.messageT = 0;
    if (this.section === 0) this.say('PLAYBACK', 3);
    w.swimmerRig.root.position.set(0, w.poolFloor + 0.3, -15);
    this.swim = { vel: new THREE.Vector2(), heading: 0, wasSeen: true, glideIn: 0 };
    this.occ = { pos: new THREE.Vector3(0, 0, -52), unseen: 0, behind: 0, stare: 0, seen: false };
    this.lis = { pos: new THREE.Vector3(0.5, 0, -75), heading: 0, state: 'wander', target: null, pause: 2, lastHeard: -99 };
  }

  say(text, seconds) {
    this.message = text;
    this.messageT = seconds;
  }

  onScreen(p, margin = 0.9) {
    ndc.copy(p).project(this.camera);
    return ndc.z < 1 && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin;
  }

  loop(name, opts) {
    this.loops ??= {};
    this.loops[name] ??= this.audio.loop(name, { gain: 0, send: 0, ...opts });
    return this.loops[name];
  }

  enter(section) {
    const { world, audio, fx } = this;
    this.section = section;
    world.spawn.pos.set(0, 0, SECTIONS[section].entry);
    world.spawn.yaw = 0;
    this.wrapped = true; // the rewind starts from here now
    audio.play('splice', { gain: 0.9, send: 0 });
    fx.glitch = Math.max(fx.glitch, 1.3);
  }

  interact() {
    if (this.section === 3 && this.canEject && !this.ended) {
      this.ended = true;
      this.audio.play('tape_end', { gain: 1, send: 0.2 });
      this.audio.play('music_box', { gain: 0.8, send: 0.4 });
      this.onEnd();
    }
  }

  catch(rig, body, sound) {
    this.catchSound = sound;
    this.lunge = { rig, body };
    this.heartbeat = 0;
    this.whine = 0;
    this.onCatch();
  }

  update(dt) {
    const { world, player, fx, camera } = this;
    this.t += dt;
    this.wrapped = false;
    this.messageT = Math.max(0, this.messageT - dt);
    if (this.messageT <= 0) this.message = null;
    const s = world.sectionAt(player.pos.z);
    if (s > this.section) this.enter(s);

    this.heartbeat = 0;
    this.whine = 0;
    this.prompt = null;
    if (this.section === 0) this.updateSwimmer(dt);
    if (this.section === 1) this.updateOccupant(dt);
    if (this.section === 2) this.updateListener(dt);
    if (this.section === 3) this.updateLeader(dt);
    // the far-off ones in other pieces of tape still turn their heads
    if (this.section !== 1) world.occupantRig.update(dt, this.t, camera.position, 0);

    const base = TENSION[this.section] + this.heartbeat * 0.3 + this.whine * 0.5;
    fx.tension += (base - fx.tension) * (1 - Math.exp(-dt * 1.2));
    const whine = this.loop('stare_whine');
    this.audio.ramp(whine.gain.gain, this.whine * 0.9, 0.15);
  }

  // 1: in the water it moves only while you aren't looking. Out of the water, it waits.
  updateSwimmer(dt) {
    const { world, player, camera, audio } = this;
    const rig = world.swimmerRig, body = rig.root, h = this.swim;
    const p = player.pos;
    const inWater = world.inPool(p.x, p.z) && p.y < WATER_Y;
    const pos = new THREE.Vector2(body.position.x, body.position.z);
    const dist = pos.distanceTo(new THREE.Vector2(p.x, p.z));
    const seen = this.onScreen(body.position) && dist < 22;
    if (!seen && inWater) {
      const P = world.pool;
      const goal = new THREE.Vector2(THREE.MathUtils.clamp(p.x, -P.x + 0.6, P.x - 0.6), THREE.MathUtils.clamp(p.z, P.z2 + 1.4, P.z1 - 1.4));
      const to = goal.sub(pos);
      const len = to.length();
      if (len > 0.05) h.vel.lerp(to.multiplyScalar(Math.min(SWIM.speed, len * 2) / len), 1 - Math.exp(-dt * 3));
      rig.swim(dt, h.vel.length());
      h.glideIn -= dt;
      if (h.glideIn <= 0 && len > 0.5) {
        h.glideIn = 2 + Math.random();
        audio.play('swimmer_glide', { pos: body.position, gain: 1.5, send: 0.6, ref: 3 });
      }
    } else {
      h.vel.multiplyScalar(Math.exp(-dt * 12));
      if (seen && dist < 8 && Math.random() < dt * 0.5) rig.twitch();
    }
    pos.addScaledVector(h.vel, dt);
    body.position.set(pos.x, world.poolFloor + 0.3 + Math.sin(this.t * 1.3) * 0.04, pos.y);
    if (h.vel.lengthSq() > 0.01) h.heading = Math.atan2(h.vel.x, h.vel.y);
    body.rotation.set(0, h.heading, 0, 'YXZ');
    rig.update(dt, this.t, camera.position, seen && dist < 6 ? 1 : 0);
    this.heartbeat = inWater ? THREE.MathUtils.clamp(1 - (dist - 1.5) / 8, 0, 1) : 0;
    if (inWater && dist < SWIM.reach) this.catch(rig, body, 'shriek');
  }

  // 2: looking fills its stare; looking away lets it step closer.
  updateOccupant(dt) {
    const { world, player, camera, audio } = this;
    const rig = world.occupantRig, body = rig.root, o = this.occ;
    const p = player.pos;
    const dist = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
    const done = p.z < SECTIONS[1].z2 + 1.5; // past it and at the far door: it lets you go
    const seen = !done && dist < 26 && (this.onScreen(v.set(o.pos.x, 2.3, o.pos.z)) || this.onScreen(v.set(o.pos.x, 1.3, o.pos.z)));
    if (seen) {
      o.seen = true;
      o.stare += dt * (dist < 3 ? 2.2 : dist < 8 ? 1.4 : dist < 14 ? 1 : 0.5);
      o.unseen = 0;
      if (Math.random() < dt * 0.4) rig.twitch();
    } else if (!done) {
      o.stare = Math.max(0, o.stare - dt * 0.55);
      o.unseen += dt;
      if (o.seen && o.unseen > OCC.every && dist > OCC.closest + 0.05) {
        o.unseen = 0;
        const dir = v.set(p.x - o.pos.x, 0, p.z - o.pos.z);
        const step = Math.min(OCC.step, dist - OCC.closest);
        o.pos.addScaledVector(dir.normalize(), step);
        o.pos.x = THREE.MathUtils.clamp(o.pos.x, -0.95, 0.95);
        audio.play('occupant_step', { pos: { x: o.pos.x, y: 0.1, z: o.pos.z }, gain: 1.5, send: 0.5, ref: 2 });
      }
      o.behind = dist <= OCC.closest + 0.1 ? o.behind + dt : 0;
    }
    body.position.copy(o.pos);
    body.rotation.y = Math.atan2(p.x - o.pos.x, p.z - o.pos.z);
    rig.update(dt, this.t, camera.position, dist < 16 ? 1 : 0.3);
    const blk = world.occupantBlock;
    blk.off = false;
    blk.minX = o.pos.x - 0.2; blk.maxX = o.pos.x + 0.2;
    blk.minZ = o.pos.z - 0.2; blk.maxZ = o.pos.z + 0.2;
    this.whine = Math.pow(o.stare / OCC.stareMax, 1.5);
    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1) / 7, 0, 1);
    if (o.stare >= OCC.stareMax || o.behind > OCC.grace) {
      blk.off = true;
      this.catch(rig, body, 'shriek2');
    }
  }

  // Footsteps are reported here; only the Listener cares.
  noise(level, pos) {
    if (this.section !== 2) return;
    const L = this.lis;
    const d = L.pos.distanceTo(v.set(pos.x, 0, pos.z));
    if (d > level * LIS.hear) return;
    const was = L.state;
    L.target = new THREE.Vector3(pos.x, 0, pos.z);
    L.lastHeard = this.t;
    L.state = d < 5 && level > 0.2 ? 'hunt' : was === 'hunt' ? 'hunt' : 'investigate';
    if (was === 'wander') this.audio.play('hiss', { pos: L.pos, gain: 1.3, send: 0.3, ref: 2 });
    if (L.state === 'hunt' && was !== 'hunt') this.audio.play('scramble', { pos: L.pos, gain: 1.5, send: 0.4, ref: 2 });
  }

  // 3: it can't see. It sits by the only way out, listening.
  updateListener(dt) {
    const { world, player, camera } = this;
    const rig = world.listenerRig, body = rig.root, L = this.lis, B = world.houseBounds;
    const me = v.set(player.pos.x, 0, player.pos.z);
    const dist = L.pos.distanceTo(me);
    if (L.state === 'hunt') {
      if (dist < 2.5 && player.speed > 0.6) { L.target = me.clone(); L.lastHeard = this.t; }
      if (this.t - L.lastHeard > LIS.lose) L.state = 'investigate';
    }
    if (!L.target) {
      L.pause -= dt;
      if (L.pause <= 0) {
        // it keeps close to the far door
        L.target = new THREE.Vector3(THREE.MathUtils.randFloat(-B.x, B.x), 0, THREE.MathUtils.randFloat(-77.5, -72));
        L.state = 'wander';
      }
    }
    let moving = 0;
    if (L.target) {
      L.target.x = THREE.MathUtils.clamp(L.target.x, -B.x, B.x);
      L.target.z = THREE.MathUtils.clamp(L.target.z, B.z2, B.z1);
      const to = L.target.clone().sub(L.pos);
      const len = to.length();
      if (len < 0.15) {
        L.target = null;
        L.pause = L.state === 'wander' ? 2 + Math.random() * 3 : 3;
        if (L.state !== 'hunt') L.state = 'wander';
      } else {
        const speed = LIS.speed[L.state];
        L.pos.addScaledVector(to.normalize(), Math.min(len, speed * dt));
        moving = speed;
        let d = Math.atan2(to.x, to.z) - L.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        L.heading += d * Math.min(1, dt * 6);
      }
    }
    body.position.copy(L.pos);
    body.rotation.set(0, L.heading, 0);
    rig.move(dt, moving);
    rig.update(dt, this.t, camera.position, dist < 6 ? 1 : 0, moving ? 0 : 1);
    const clicks = this.loop('clicks', { pos: L.pos, ref: 2, hrtf: true });
    this.audio.setPos(clicks.panner, v.set(L.pos.x, 0.7, L.pos.z));
    this.audio.ramp(clicks.gain.gain, player.pos.z > -81 ? (L.state === 'wander' ? 0.6 : 1.1) : 0, 0.3);
    this.audio.ramp(clicks.src.playbackRate, L.state === 'hunt' ? 1.35 : L.state === 'investigate' ? 1.15 : 0.9, 0.3);
    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1) / 7, 0, 1);
    if (dist < LIS.reach) {
      this.audio.ramp(clicks.gain.gain, 0, 0.05);
      this.catch(rig, body, 'shriek3');
    }
  }

  // 4: the leader. White, quiet, watched. A television at the end.
  updateLeader(dt) {
    const { world, player, camera } = this;
    const tone = this.loop('void_tone');
    this.audio.ramp(tone.gain.gain, 0.6, 1.5);
    if (this.loops.clicks) this.audio.ramp(this.loops.clicks.gain.gain, 0, 0.5);
    const tv = world.endTv.pos;
    const d = camera.position.distanceTo(tv);
    this.whine = THREE.MathUtils.clamp(1 - (d - 2) / 30, 0, 1) * 0.35; // the picture is coming apart
    v.subVectors(tv, camera.position).normalize();
    this.canEject = d < 1.8 && v.dot(player.forward) > 0.75;
    this.prompt = this.canEject ? '[E] eject' : null;
  }

  // Whichever one caught you, its face goes into the lens.
  updateLunge(dt) {
    const l = this.lunge;
    if (!l) return;
    const { camera, player } = this;
    const { rig, body } = l;
    l.t = (l.t ?? 0) + dt;
    const rush = THREE.MathUtils.smoothstep(l.t, 0, 0.12);
    const face = camera.position.clone().addScaledVector(player.forward, 0.55 + (1 - rush) * 2.5);
    const jolt = 0.025 * rush;
    face.x += (Math.random() - 0.5) * jolt;
    face.y += (Math.random() - 0.5) * jolt;
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
