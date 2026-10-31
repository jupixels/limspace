import * as THREE from 'three';
import { POOL_FLOOR, WATER_Y } from './world.js';

const FIGURE_STAGES = [-36, -31, -27, -24.2];
const BASE_TENSION = { hall: 0.05, corridor: 0.15, flooded: 0.25, end: 0.35, void: 0.6 };
const SWIM = { chasing: 2.3, toEdge: 3.2, reach: 1.1, wakeDelay: 1.4, lookRange: 6 };
const END_Z = -22.5; // this far into the dark, the tape runs out
const v = new THREE.Vector3();
const ndc = new THREE.Vector3();

// Paces Tape 01: arrive, find the shutter locked, take the tape from the pool, get out of the
// water before the Swimmer reaches you, then walk on into the dark.
export class Director {
  constructor({ world, audio, player, fx, camera }) {
    Object.assign(this, { world, audio, player, fx, camera });
    this.onCatch = () => {};
    this.onEnd = () => {};
    this.reset();
  }

  // Everything that a rewind undoes. Once-per-tape moments (the distant door) stay done.
  reset() {
    this.t = 0;
    this.nextDrip = 4;
    this.nextFlicker = 22;
    this.nextGlitch = 50;
    this.doorDone ??= false;
    this.tookTape = false;
    this.rattled = false;
    this.swim = null; // the one-off glide teaser
    this.lunge = null;
    this.world.swimmerRig?.setReach(0);
    this.world.swimmer.rotation.set(0, 0, 0);
    this.teased ??= false;
    this.hunt = null; // the Swimmer awake and hunting
    this.blackout = false;
    this.splashDone = false;
    this.ended = false;
    this.figStage = -1;
    this.figSeen = false;
    this.finale = 0;
    this.prevNv = false;
    this.prompt = null;
    this.heartbeat = 0;
  }

  looking(target, cos) {
    v.subVectors(target, this.camera.position).normalize();
    return v.dot(this.player.forward) > cos;
  }

  // On screen, roughly: inside the middle of the frame and not too far off.
  onScreen(p, margin = 0.85) {
    ndc.copy(p).project(this.camera);
    return ndc.z < 1 && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin && p.distanceTo(this.camera.position) < 24;
  }

  flick(l, dur) {
    l.flicker = dur;
    this.audio.play('light_flicker', { pos: l.pos, gain: 0.9, send: 0.4, rate: 0.9 + Math.random() * 0.2 });
  }

  // Called when E is pressed.
  interact() {
    const { world, audio, fx, player } = this;
    if (this.canTake === 'take') {
      this.tookTape = true;
      world.cassette.visible = false;
      audio.play('pickup', { pos: world.cassette.position, gain: 1.2, send: 0.4 });
      fx.glitch = Math.max(fx.glitch, 0.3);
      this.wake();
    } else if (this.nearShutter && !world.shutter.opening) {
      audio.play('shutter_rattle', { pos: world.shutter.pos, gain: 1.1, send: 0.7 });
      this.rattled = true;
      player.dip = Math.max(player.dip, 0.04);
    }
  }

  // Taking the tape opens the way out and wakes what lives in the water.
  wake() {
    const { world, audio, fx, camera } = this;
    world.shutter.opening = true;
    audio.play('shutter_open', { pos: world.shutter.pos, gain: 1.6, send: 1.0, ref: 4 });
    audio.play('stinger', { gain: 0.9, send: 0.5 });
    fx.tension = Math.max(fx.tension, 0.9);
    fx.glitch = Math.max(fx.glitch, 0.8);
    for (const l of world.lights) if (l.region === 'hall') l.flicker = 0.8 + Math.random() * 1.2;
    // it surfaces at whichever end of the pool is further from you
    const s = world.swimmer;
    const z0 = camera.position.z > 0 ? -13 : 13;
    s.position.set(camera.position.x > 0 ? -3 : 3, POOL_FLOOR + 0.3, z0);
    s.visible = true;
    this.swim = null;
    this.hunt = { delay: SWIM.wakeDelay, vel: new THREE.Vector2(), heading: z0 > 0 ? Math.PI : 0, glideIn: 0, wasSeen: true };
    audio.play('splash_far', { pos: s.position, gain: 1.4, send: 0.9, ref: 3 });
  }

  update(dt) {
    const { world, audio, player, fx, camera } = this;
    const t = (this.t += dt);
    const p = player.pos;
    const zone = world.zoneAt(p.x, p.z);

    if (t > this.nextDrip) {
      this.nextDrip = t + 3 + Math.random() * 7;
      const pos = zone === 'hall'
        ? { x: (Math.random() - 0.5) * 11, y: WATER_Y, z: (Math.random() - 0.5) * 28 }
        : { x: p.x + (Math.random() - 0.5) * 8, y: 0.1, z: p.z + (Math.random() - 0.5) * 8 };
      audio.play('drip', { pos, gain: 0.8, send: 0.9, rate: 0.8 + Math.random() * 0.35 });
    }

    if (t > this.nextFlicker) {
      this.nextFlicker = t + 15 + Math.random() * 25;
      const near = world.lights.filter((l) => !l.dead && l.pos.distanceTo(camera.position) < 18);
      if (near.length) this.flick(near[Math.floor(Math.random() * near.length)], 0.5 + Math.random() * 1.3);
    }
    const el = world.endLight;
    if ((zone === 'end' || zone === 'flooded') && !el.dead && el.flicker <= 0 && Math.random() < dt * 0.18) {
      this.flick(el, 0.3 + Math.random() * 0.9);
    }

    if (t > this.nextGlitch) {
      this.nextGlitch = t + 30 + Math.random() * 60;
      fx.glitch = Math.max(fx.glitch, 0.35 + Math.random() * 0.3);
      audio.play('glitch', { gain: 0.22, send: 0 });
    }

    // something far away in the building closes a door
    if (!this.doorDone && (t > 40 || this.rattled)) {
      this.doorDone = true;
      audio.play('distant_door', { pos: { x: -48, y: 3, z: -35 }, gain: 2.2, send: 1.2, ref: 8, rolloff: 0.6, delay: this.rattled ? 1.2 : 0 });
      fx.tension += 0.25;
    }

    this.updatePrompt();
    this.updateTeaser(dt, t, zone);
    this.updateHunt(dt);

    // leaving the hall with the tape: the lights behind you go out, bank by bank
    if (this.tookTape && !this.blackout && zone === 'corridor' && p.x > 18) {
      this.blackout = true;
      audio.play('lights_off', { pos: { x: 8, y: 6, z: 10 }, gain: 1.6, send: 1.0, ref: 6 });
      fx.glitch = Math.max(fx.glitch, 0.4);
      world.lights.filter((l) => l.region === 'hall').forEach((l, i) => setTimeout(() => { l.dead = true; }, 250 + i * 180));
    }

    // halfway down the flooded corridor, something gets into the water behind you
    if (this.blackout && !this.splashDone && zone === 'flooded' && p.z < 6) {
      this.splashDone = true;
      audio.play('splash_far', { pos: { x: 33.5, y: 0.2, z: 17 }, gain: 2, send: 1.0, ref: 4 });
      fx.tension = Math.max(fx.tension, 0.75);
    }

    this.updateFigure(dt, zone);

    if (!this.ended && zone === 'void' && p.z < END_Z) {
      this.ended = true;
      this.onEnd();
    }

    const base = (BASE_TENSION[zone] ?? 0.1) + (this.hunt ? 0.1 + this.heartbeat * 0.3 : 0);
    fx.tension += (base - fx.tension) * (1 - Math.exp(-dt * 0.25));
  }

  updatePrompt() {
    const { world, player, camera } = this;
    const c = world.cassette.position;
    this.canTake = null;
    this.nearShutter = false;
    this.prompt = null;
    if (!this.tookTape && world.inPool(player.pos.x, player.pos.z) && Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < 1.3) {
      this.canTake = camera.position.y < WATER_Y + 0.1 ? 'take' : 'duck';
      this.prompt = this.canTake === 'take' ? '[E] take' : '[C] duck';
    } else if (!world.shutter.opening && camera.position.distanceTo(world.shutter.pos) < 2.4 && this.looking(world.shutter.pos, 0.6)) {
      this.nearShutter = true;
      this.prompt = '[E]';
    }
  }

  // Before you go near the tape, a long dark shape glides along the pool floor, once.
  updateTeaser(dt, t, zone) {
    const { world, audio, fx, camera } = this;
    const s = world.swimmer;
    if (!this.swim && !this.teased && !this.hunt && t > 55 && zone === 'hall') {
      const swimming = world.inPool(camera.position.x, camera.position.z);
      const lane = (camera.position.x > 0) !== swimming ? 3 : -3;
      if (this.looking(new THREE.Vector3(lane, -1.2, 0), 0.8) && Math.abs(camera.position.z) < 22) {
        const z0 = camera.position.z > 0 ? -14 : 14;
        this.swim = { t: 0, z0, z1: -z0, lane };
        this.teased = true;
        s.position.set(lane, POOL_FLOOR + 0.3, z0);
        s.rotation.set(0, z0 > 0 ? Math.PI : 0, 0, 'YXZ');
        s.visible = true;
        this.swim.h = audio.play('underwater_presence', { pos: s.position, gain: 2.4, send: 0.8, ref: 4 });
        fx.glitch = Math.max(fx.glitch, 0.4);
        fx.tension = Math.max(fx.tension, 0.85);
      }
    }
    if (this.swim) {
      const w = this.swim;
      w.t += dt;
      const k = w.t / 7.5;
      s.position.set(w.lane + Math.sin(k * 7) * 0.35, POOL_FLOOR + 0.3 + Math.sin(k * 11) * 0.06, THREE.MathUtils.lerp(w.z0, w.z1, k));
      world.swimmerRig.swim(dt, 4);
      world.swimmerRig.update(dt, t, camera.position, 0);
      if (w.h?.panner) audio.setPos(w.h.panner, s.position);
      if (k >= 1) {
        s.visible = false;
        this.swim = null;
      }
    }
  }

  // Awake, it only moves while you aren't looking. In the water it comes for you;
  // on the deck it waits at the edge nearest you.
  updateHunt(dt) {
    const h = this.hunt;
    if (!h) { this.heartbeat = 0; return; }
    const { world, audio, player, camera, fx } = this;
    const s = world.swimmer;
    const p = player.pos;
    const inWater = world.inPool(p.x, p.z) && p.y < WATER_Y;

    const target = new THREE.Vector2(
      THREE.MathUtils.clamp(p.x, -5.4, 5.4),
      THREE.MathUtils.clamp(p.z, -14.4, 14.4));
    const pos = new THREE.Vector2(s.position.x, s.position.z);
    const dist = pos.distanceTo(new THREE.Vector2(p.x, p.z));
    const seen = this.onScreen(s.position) && !(fx.nv < 0.5 && dist > 14);

    h.delay -= dt;
    const rig = world.swimmerRig;
    if (!seen && h.delay <= 0) {
      const speed = inWater ? SWIM.chasing : SWIM.toEdge;
      const to = target.clone().sub(pos);
      const len = to.length();
      if (len > 0.05) h.vel.lerp(to.multiplyScalar(Math.min(speed, len * 2) / len), 1 - Math.exp(-dt * 3));
      rig.swim(dt, h.vel.length());
      h.glideIn -= dt;
      if (h.glideIn <= 0 && len > 0.5) {
        h.glideIn = 2.2 + Math.random();
        audio.play('swimmer_glide', { pos: s.position, gain: 1.6, send: 0.6, ref: 3 });
      }
    } else {
      h.vel.multiplyScalar(Math.exp(-dt * 12)); // seen: it stops dead
      if (seen && dist < 10 && Math.random() < dt * 0.5) rig.twitch();
    }
    // close and watched, it turns its face up to you
    rig.update(dt, this.t, camera.position, seen && dist < SWIM.lookRange ? 1 : 0);
    // the moment you look back and it's closer than before
    if (seen && !h.wasSeen && dist < 7) {
      fx.glitch = Math.max(fx.glitch, 0.25 + (7 - dist) * 0.05);
      audio.play('glitch', { gain: 0.12, send: 0, rate: 0.8 });
    }
    h.wasSeen = seen;

    pos.addScaledVector(h.vel, dt);
    s.position.x = pos.x;
    s.position.z = pos.y;
    s.position.y = POOL_FLOOR + 0.3 + Math.sin(this.t * 1.3) * 0.04;
    if (h.vel.lengthSq() > 0.01) h.heading = Math.atan2(h.vel.x, h.vel.y);
    s.rotation.set(0, h.heading, 0, 'YXZ');

    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1.5) / 8, 0, 1) * (inWater ? 1 : 0.4);
    if (inWater && dist < SWIM.reach && h.delay <= 0) {
      this.hunt = null;
      this.heartbeat = 0;
      this.lunge = { from: s.position.clone() };
      this.onCatch();
    }
  }

  // The grab: it rears up out of its glide and throws itself at the lens.
  updateLunge(dt) {
    const l = this.lunge;
    if (!l) return;
    const { world, camera, player } = this;
    const s = world.swimmer, rig = world.swimmerRig;
    l.t = (l.t ?? 0) + dt;
    const k = THREE.MathUtils.smoothstep(l.t, 0, 0.35);
    const goal = camera.position.clone().addScaledVector(player.forward, 0.45);
    goal.y -= 0.25;
    s.position.lerpVectors(l.from, goal, k);
    v.subVectors(camera.position, s.position);
    s.rotation.set(-Math.atan2(v.y, Math.hypot(v.x, v.z)) * k, Math.atan2(v.x, v.z), 0, 'YXZ');
    rig.setReach(k);
    rig.swim(dt, 6);
    rig.update(dt, this.t + l.t, camera.position, 1);
  }

  // Beyond the end-room doorway there is nothing. Night vision shows otherwise.
  updateFigure(dt, zone) {
    const { world, audio, fx, camera } = this;
    const fig = world.figure;
    const nearVoid = zone === 'end' || zone === 'void';
    const nvOn = fx.nvOn;

    if (nvOn && !this.prevNv && nearVoid && this.figStage < FIGURE_STAGES.length) {
      this.figStage++;
      this.figSeen = false;
      if (this.figStage < FIGURE_STAGES.length) fig.position.set(35, 0, FIGURE_STAGES[this.figStage]);
    }
    this.prevNv = nvOn;

    const present = this.figStage >= 0 && this.figStage < FIGURE_STAGES.length;
    fig.visible = present && fx.nv > 0.6;
    if (!present) return;
    fig.lookAt(camera.position.x, 0, camera.position.z);

    if (fig.visible && !this.figSeen && this.looking(v.copy(fig.position).setY(1.6), 0.93)) {
      this.figSeen = true;
      fx.tension = Math.max(fx.tension, 0.6 + this.figStage * 0.12);
      audio.play('glitch', { gain: 0.15 + this.figStage * 0.08, send: 0, rate: 0.7 });
      if (this.figStage === FIGURE_STAGES.length - 1) this.finale = 1.4;
    }

    if (this.finale > 0) {
      this.finale -= dt;
      if (this.finale <= 0) {
        fx.glitch = 1.6;
        fx.tension = 1;
        audio.play('stinger', { gain: 1.1, send: 0.4 });
        world.endLight.dead = true;
        setTimeout(() => { world.endLight.dead = false; }, 3500);
        this.figStage = FIGURE_STAGES.length;
        fig.visible = false;
      }
    }
  }
}
