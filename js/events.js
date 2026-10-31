import * as THREE from 'three';

const FIGURE_STAGES = [-34, -28, -23, -19.6];
const BASE_TENSION = { hall: 0.05, corridor: 0.15, flooded: 0.25, end: 0.35, void: 0.55 };
const v = new THREE.Vector3();

// Scripted and random scares for tape segment 1.
export class Director {
  constructor({ world, audio, player, fx, camera }) {
    Object.assign(this, { world, audio, player, fx, camera });
    this.t = 0;
    this.nextDrip = 4;
    this.nextFlicker = 18;
    this.nextGlitch = 50;
    this.doorDone = false;
    this.swim = null;
    this.swimDone = false;
    this.figStage = -1;
    this.figSeen = false;
    this.finale = 0;
    this.prevNv = false;
    this.nearDark = 0;
  }

  looking(target, cos) {
    v.subVectors(target, this.camera.position).normalize();
    return v.dot(this.player.forward) > cos;
  }

  flick(l, dur) {
    l.flicker = dur;
    this.audio.play('light_flicker', { pos: l.pos, gain: 0.9, send: 0.4, rate: 0.9 + Math.random() * 0.2 });
  }

  update(dt) {
    const { world, audio, player, fx, camera } = this;
    const t = (this.t += dt);
    const p = player.pos;
    const zone = world.zoneAt(p.x, p.z);

    if (t > this.nextDrip) {
      this.nextDrip = t + 3 + Math.random() * 7;
      const pos = zone === 'hall'
        ? { x: (Math.random() - 0.5) * 11, y: -0.25, z: (Math.random() - 0.5) * 28 }
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
    if (!this.doorDone && t > 38) {
      this.doorDone = true;
      audio.play('distant_door', { pos: { x: -48, y: 3, z: -35 }, gain: 2.2, send: 1.2, ref: 8, rolloff: 0.6 });
      fx.tension += 0.25;
    }

    this.updateSwimmer(dt, t, zone);
    this.updateFigure(dt, zone);

    const base = BASE_TENSION[zone] ?? 0.1;
    fx.tension += (base - fx.tension) * (1 - Math.exp(-dt * 0.25));
  }

  // A long dark shape glides along the bottom of the pool, once.
  updateSwimmer(dt, t, zone) {
    const { world, audio, fx, camera } = this;
    const s = world.swimmer;
    if (!this.swim && !this.swimDone && t > 55 && zone === 'hall') {
      const lane = camera.position.x > 0 ? 3 : -3;
      if (this.looking(new THREE.Vector3(lane, -1.5, 0), 0.8) && Math.abs(camera.position.z) < 22) {
        const z0 = camera.position.z > 0 ? -14 : 14;
        this.swim = { t: 0, z0, z1: -z0, lane };
        s.position.set(lane, -1.55, z0);
        s.visible = true;
        this.swim.h = audio.play('underwater_presence', { pos: s.position, gain: 2.4, send: 0.8, ref: 4 });
        audio.play('underwater_presence', { pos: s.position, gain: 1.6, send: 0.9, ref: 4, rate: 0.75, delay: 3.2 });
        fx.glitch = Math.max(fx.glitch, 0.4);
        fx.tension = Math.max(fx.tension, 0.85);
      }
    }
    if (this.swim) {
      const w = this.swim;
      w.t += dt;
      const k = w.t / 7.5;
      s.position.set(w.lane + Math.sin(k * 7) * 0.35, -1.55 + Math.sin(k * 11) * 0.06, THREE.MathUtils.lerp(w.z0, w.z1, k));
      s.rotation.z = Math.cos(k * 7) * 0.15;
      if (w.h?.panner) audio.setPos(w.h.panner, s.position);
      if (k >= 1) {
        s.visible = false;
        this.swim = null;
        this.swimDone = true;
      }
    }
  }

  // Beyond the end-room doorway there is nothing. Night vision shows otherwise.
  updateFigure(dt, zone) {
    const { world, audio, fx, camera } = this;
    const fig = world.figure;
    const nearVoid = zone === 'end' || zone === 'void';
    const nvOn = fx.nvOn;
    const doorway = new THREE.Vector3(35, 1.2, -17.5);

    if (nearVoid && camera.position.z < -10 && this.looking(doorway, 0.85)) this.nearDark += dt;
    else this.nearDark = Math.max(0, this.nearDark - dt);
    fx.hint = !fx.usedNv && this.nearDark > 4 && Math.floor(this.nearDark * 1.5) % 2 === 0 ? '[N] NIGHT' : null;

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
        audio.play('glitch', { gain: 0.9, send: 0.2 });
        audio.play('dread_drone', { gain: 1.2, send: 0.6, rate: 0.6 });
        world.endLight.dead = true;
        setTimeout(() => { world.endLight.dead = false; }, 3500);
        this.figStage = FIGURE_STAGES.length;
        fig.visible = false;
      }
    }
  }
}
