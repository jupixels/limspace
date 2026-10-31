import * as THREE from 'three';

const STARE_MAX = 2.6; // seconds of looking at it before it comes for you
const STEP = { len: 2.6, every: 1.9, minEvery: 1.0, closest: 0.95, graceBehind: 4 };
const EXIT_LAP = 3;
const END_LOOK = 0.8;
const v = new THREE.Vector3();
const ndc = new THREE.Vector3();

// Tape 02 "VACANCY": the corridor loops. Each lap something changes. On the first lap the Occupant
// is waiting ahead. Looking at it fills a stare meter; looking away lets it step closer.
// After a few laps room 215 opens with a television inside. Eject the tape there.
export class Director2 {
  constructor({ world, audio, player, fx, camera }) {
    Object.assign(this, { world, audio, player, fx, camera });
    this.onCatch = () => {};
    this.onEnd = () => {};
    this.catchSound = 'shriek2';
    this.reset();
  }

  reset() {
    this.tvLoop?.src.stop();
    this.tvLoop = null;
    this.t = 0;
    this.lap = 0;
    this.occ = null;
    this.stare = 0;
    this.whine = 0;
    this.heartbeat = 0;
    this.prompt = null;
    this.ended = false;
    this.lunge = null;
    this.wrapped = false;
    this.nextKnock = 1e9;
    this.nextFlicker = 18;
    this.nextGlitch = 45;
    this.events = new Set();
    this.world.occupantRig?.setScare(0);
  }

  onScreen(p, margin = 0.9) {
    ndc.copy(p).project(this.camera);
    return ndc.z < 1 && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin;
  }

  looking(target, cos) {
    v.subVectors(target, this.camera.position).normalize();
    return v.dot(this.player.forward) > cos;
  }

  once(name, fn) {
    if (this.events.has(name)) return;
    this.events.add(name);
    fn();
  }

  interact() {
    if (this.canEject && !this.ended) {
      this.ended = true;
      this.audio.play('eject', { pos: this.world.tv.pos, gain: 1.1, send: 0.3 });
      this.onEnd();
    }
  }

  // Walk off either end of the segment and you're quietly put back at the other end.
  wrap() {
    const { world, player } = this;
    const half = world.SEG / 2;
    let d = 0;
    if (player.pos.z < -half) d = world.SEG;
    else if (player.pos.z > half) d = -world.SEG;
    if (!d || world.zoneAt(player.pos.x, player.pos.z) === 'room') return;
    player.pos.z += d;
    if (this.occ) this.occ.pos.z += d;
    this.lap++;
    this.wrapped = true;
  }

  update(dt) {
    const { world, audio, player, fx, camera } = this;
    const t = (this.t += dt);
    this.wrapped = false;
    this.wrap();
    const p = player.pos;
    const zone = world.zoneAt(p.x, p.z);
    const ahead = -Math.sign(Math.cos(player.yaw)) || -1; // which way along z you're facing

    // lap 1: a phone rings behind a door just ahead, and someone is standing in the corridor
    if (this.lap >= 1) {
      this.once('phone', () => {
        audio.play('phone_ring', { pos: { x: world.W + 0.4, y: 1.2, z: p.z + ahead * 8 }, gain: 1.6, send: 0.5, ref: 2 });
        this.nextKnock = t + 25;
      });
      this.once('occupant', () => {
        this.occ = { pos: new THREE.Vector3(0, 0, p.z + ahead * 20), unseen: 0, behind: 0, seenOnce: false };
        world.occupant.visible = true;
      });
    }
    // lap 2: the lights start to go, and something arrives on this floor
    if (this.lap >= 2) {
      this.once('dim', () => {
        world.fixtures[1].dead = true;
        world.fixtures[5].dead = true;
        audio.play('elevator_ding', { pos: { x: 0, y: 2, z: p.z - ahead * 30 }, gain: 2, send: 1, ref: 6, rolloff: 0.7 });
      });
    }
    // lap 3: room 215 has opened, and its television is on
    if (this.lap >= EXIT_LAP) {
      this.once('exit', () => {
        world.exit.opening = true;
        audio.play('door_creak', { pos: world.exit.pos, gain: 1.6, send: 0.7, ref: 3 });
        this.tvLoop = audio.loop('tv_static', { pos: world.tv.pos, gain: 0.9, send: 0.3, ref: 2, hrtf: true });
        world.fixtures[0].dead = true;
      });
    }

    if (t > this.nextKnock) {
      this.nextKnock = t + 20 + Math.random() * 25;
      const side = Math.random() < 0.5 ? -1 : 1;
      audio.play('knock', { pos: { x: side * (world.W + 0.3), y: 1.3, z: p.z + (Math.random() - 0.5) * 30 }, gain: 1.4, send: 0.6, ref: 3 });
    }
    if (t > this.nextFlicker) {
      this.nextFlicker = t + 12 + Math.random() * 20;
      const f = world.fixtures[Math.floor(Math.random() * world.fixtures.length)];
      if (!f.dead) {
        f.flicker = 0.4 + Math.random();
        audio.play('light_flicker', { pos: { x: 0, y: 2.5, z: p.z + (Math.random() - 0.5) * 12 }, gain: 0.8, send: 0.3 });
      }
    }
    if (t > this.nextGlitch) {
      this.nextGlitch = t + 30 + Math.random() * 60;
      fx.glitch = Math.max(fx.glitch, 0.35 + Math.random() * 0.3);
      audio.play('glitch', { gain: 0.2, send: 0 });
    }

    this.updateOccupant(dt, zone);

    // the television
    this.canEject = false;
    this.prompt = null;
    if (world.exit.opening && zone === 'room' && camera.position.distanceTo(world.tv.pos) < 1.8 && this.looking(world.tv.pos, END_LOOK)) {
      this.canEject = true;
      this.prompt = '[E] eject';
    }

    const base = 0.08 + Math.min(this.lap, 4) * 0.04 + (zone === 'room' ? 0.1 : 0);
    const target = Math.max(base, (this.stare / STARE_MAX) * 0.9);
    fx.tension += (target - fx.tension) * (1 - Math.exp(-dt * 1.5));
  }

  updateOccupant(dt, zone) {
    const o = this.occ;
    const { world, audio, player, camera, fx } = this;
    const rig = world.occupantRig, body = world.occupant;
    if (!o) { this.whine = 0; this.heartbeat = 0; return; }

    const p = player.pos;
    const head = v.set(o.pos.x, 2.3, o.pos.z);
    const dist = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
    // from inside the room you can only see it through the doorway
    const inRoom = zone === 'room';
    const occInRoom = o.pos.x < -world.W;
    const lineOfSight = inRoom === occInRoom || Math.abs(o.pos.z - world.exit.z) < 1.2;
    const seen = lineOfSight && dist < 26 && (this.onScreen(head) || this.onScreen(v.set(o.pos.x, 1.3, o.pos.z)));

    if (seen) {
      o.seenOnce = true;
      // far away it takes a while to notice you looking; up close it's almost instant
      this.stare += dt * (dist < 3 ? 2.2 : dist < 8 ? 1.4 : dist < 14 ? 1 : 0.5);
      if (Math.random() < dt * 0.4) rig.twitch();
      o.unseen = 0;
    } else {
      this.stare = Math.max(0, this.stare - dt * 0.55);
      o.unseen += dt;
      const every = Math.max(STEP.minEvery, STEP.every - this.lap * 0.15);
      if (o.unseen >= every && o.seenOnce) {
        o.unseen = 0;
        this.stepToward();
      }
    }
    // standing right behind you, unseen, for too long
    if (!seen && dist <= STEP.closest + 0.1) o.behind += dt;
    else o.behind = 0;

    body.position.copy(o.pos);
    body.rotation.y = Math.atan2(p.x - o.pos.x, p.z - o.pos.z);
    rig.update(dt, this.t, camera.position, dist < 16 ? 1 : 0.3);
    const blk = world.occupantBlock;
    blk.off = false;
    blk.minX = o.pos.x - 0.2; blk.maxX = o.pos.x + 0.2;
    blk.minZ = o.pos.z - 0.2; blk.maxZ = o.pos.z + 0.2;

    this.whine = Math.pow(this.stare / STARE_MAX, 1.5);
    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1) / 7, 0, 1);
    fx.glitch = Math.max(fx.glitch, this.whine * 0.25 * Math.random());

    if (this.stare >= STARE_MAX || o.behind > STEP.graceBehind) {
      this.occ = null;
      this.stare = 0;
      this.whine = 0;
      this.heartbeat = 0;
      blk.off = true;
      this.lunge = { from: body.position.clone() };
      this.onCatch();
    }
  }

  // It never moves while watched; out of sight it takes one long stride toward you.
  // Between the corridor and room 215 it has to pass through the doorway.
  stepToward() {
    const o = this.occ;
    const { world, audio, player } = this;
    const p = player.pos;
    const W = world.W, dz = world.exit.z;
    const youIn = world.zoneAt(p.x, p.z) === 'room';
    const itIn = o.pos.x < -W;
    const goal = new THREE.Vector3(p.x, 0, p.z);
    let chasing = true;
    if (youIn !== itIn) {
      const doorSide = itIn ? -W - 0.7 : -W + 0.35;
      const atDoor = Math.abs(o.pos.z - dz) < 0.45 && Math.abs(o.pos.x - doorSide) < 0.4;
      goal.set(atDoor ? (itIn ? -W + 0.35 : -W - 0.7) : doorSide, 0, dz);
      chasing = false;
    }
    const dir = goal.sub(o.pos);
    dir.y = 0;
    const len = dir.length();
    const step = Math.min(STEP.len, chasing ? len - STEP.closest : len);
    if (step <= 0.05) return;
    o.pos.addScaledVector(dir.normalize(), step);
    if (o.pos.x < -W) o.pos.x = THREE.MathUtils.clamp(o.pos.x, world.room.x1 + 0.3, -W - 0.3);
    else o.pos.x = THREE.MathUtils.clamp(o.pos.x, -W + 0.3, W - 0.3);
    audio.play('occupant_step', { pos: { x: o.pos.x, y: 0.1, z: o.pos.z }, gain: 1.5, send: 0.5, ref: 2, rate: 0.85 + Math.random() * 0.15 });
  }

  // Jumpscare: its face in the lens, smile tearing open.
  updateLunge(dt) {
    const l = this.lunge;
    if (!l) return;
    const { world, camera, player } = this;
    const body = world.occupant, rig = world.occupantRig;
    l.t = (l.t ?? 0) + dt;
    const rush = THREE.MathUtils.smoothstep(l.t, 0, 0.12);
    const face = camera.position.clone().addScaledVector(player.forward, 0.5 + (1 - rush) * 2.6);
    const jolt = 0.025 * rush;
    face.x += (Math.random() - 0.5) * jolt;
    face.y += (Math.random() - 0.5) * jolt;
    body.rotation.set(0, Math.atan2(camera.position.x - face.x, camera.position.z - face.z), 0);
    rig.setScare(rush);
    rig.update(dt, this.t + l.t, camera.position, 1);
    body.updateMatrixWorld(true);
    rig.head.lookAt(camera.position);
    rig.head.rotateZ((Math.random() - 0.5) * 0.15 * rush);
    rig.head.updateMatrixWorld(true);
    const headAt = rig.head.getWorldPosition(new THREE.Vector3());
    body.position.add(face.sub(headAt));
  }
}
