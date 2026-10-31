import * as THREE from 'three';

const SPEED = { wander: 0.8, investigate: 2.3, hunt: 3.6 };
const HEAR = 13; // metres a noise of level 1 carries
const WALL_DAMP = 1.6; // through walls, sounds count as this much further away
const REACH = 0.9;
const LOSE_TRACK = 3; // seconds of silence before a hunt becomes a search
const v = new THREE.Vector3();

// Tape 03 "HOME": the power is out and the tape is in the VCR. The Listener is blind and
// moves toward whatever it hears. The breaker is in the garage, and it is loud.
export class Director3 {
  constructor({ world, audio, player, fx, camera }) {
    Object.assign(this, { world, audio, player, fx, camera });
    this.onCatch = () => {};
    this.onEnd = () => {};
    this.catchSound = 'shriek3';
    this.reset();
  }

  reset() {
    const { world } = this;
    this.t = 0;
    this.ended = false;
    this.lunge = null;
    this.prompt = null;
    this.message = null;
    this.messageT = 0;
    this.heartbeat = 0;
    this.whine = 0;
    this.nextCreak = 30;
    this.nextGlitch = 50;
    this.hissT = 0;
    this.say('IT CAN HEAR YOU', 5);
    const L = { pos: new THREE.Vector3(2.5, 0, 10.5), heading: 0, state: 'wander', target: null, path: [], pause: 2, lastHeard: -99, speed: 0 };
    this.L = L;
    world.listener.position.copy(L.pos);
    world.listener.rotation.set(0, 0, 0);
    world.listener.visible = true;
  }

  say(text, seconds) {
    this.message = text;
    this.messageT = seconds;
  }

  looking(target, cos) {
    v.subVectors(target, this.camera.position).normalize();
    return v.dot(this.player.forward) > cos;
  }

  // Something made a sound. Loud enough, close enough, and it comes to look.
  noise(level, pos) {
    const L = this.L;
    if (!L || this.ended) return;
    const { world } = this;
    let d = L.pos.distanceTo(v.set(pos.x, 0, pos.z));
    if (world.roomAt(L.pos.x, L.pos.z) !== world.roomAt(pos.x, pos.z)) d *= WALL_DAMP;
    if (d > level * HEAR) return;
    const close = d < 5;
    L.target = new THREE.Vector3(pos.x, 0, pos.z);
    L.path = world.route(L.pos, L.target);
    L.lastHeard = this.t;
    L.pause = 0;
    const was = L.state;
    L.state = close && level > 0.2 ? 'hunt' : (L.state === 'hunt' ? 'hunt' : 'investigate');
    if (was === 'wander' && this.t > this.hissT) {
      this.hissT = this.t + 4;
      this.audio.play('hiss', { pos: L.pos, gain: 1.3, send: 0.3, ref: 2 });
    }
    if (L.state === 'hunt' && was !== 'hunt') this.audio.play('scramble', { pos: L.pos, gain: 1.5, send: 0.4, ref: 2 });
  }

  interact() {
    const { world, audio, fx } = this;
    const hit = this.focus;
    if (!hit) return;
    if (hit === 'vcr') {
      if (!world.power) {
        audio.play('dead_buttons', { pos: world.vcr.pos, gain: 1, send: 0.3 });
        this.noise(0.3, world.vcr.pos);
        this.say('NO POWER', 2.5);
      } else if (!this.ended) {
        this.ended = true;
        audio.play('eject', { pos: world.vcr.pos, gain: 1.1, send: 0.3 });
        this.onEnd();
      }
    } else if (hit === 'breaker' && !world.power) {
      world.setPower(true);
      world.breaker.lever.position.y -= 0.12;
      audio.play('breaker', { pos: world.breaker.pos, gain: 1.6, send: 0.6, ref: 3 });
      fx.glitch = Math.max(fx.glitch, 0.6);
      this.noise(3, world.breaker.pos); // the whole house hears that
    } else if (hit === 'front') {
      audio.play('shutter_rattle', { pos: world.frontDoor.pos, gain: 0.6, send: 0.4, rate: 1.7 });
      this.noise(0.5, world.frontDoor.pos);
      this.say('LOCKED', 2);
    } else if (hit === 'tape04') {
      audio.play('pickup', { pos: world.tape04.pos, gain: 0.6, send: 0.3, rate: 1.3 });
      this.say('NOT YET', 2.5);
    } else if (hit === 'wrong' && !world.wrong.opening) {
      world.wrong.opening = true;
      audio.play('door_open', { pos: world.wrong.pos, gain: 1.1, send: 0.4 });
      this.noise(0.4, world.wrong.pos);
    }
  }

  update(dt) {
    const { world, audio, player, fx, camera } = this;
    const t = (this.t += dt);
    this.messageT = Math.max(0, this.messageT - dt);
    if (this.messageT <= 0) this.message = null;

    // what you're looking at, within arm's reach
    const near = (p, r = 1.6) => camera.position.distanceTo(p) < r && this.looking(p, 0.75);
    this.focus = near(world.vcr.pos, 1.9) ? 'vcr' : near(world.breaker.pos) ? 'breaker'
      : near(world.frontDoor.pos) ? 'front' : near(world.wrong.pos) && !world.wrong.opening ? 'wrong'
        : near(world.tape04.pos, 1.4) ? 'tape04' : null;
    this.prompt = this.focus === 'vcr' ? (world.power ? '[E] eject' : '[E]') : this.focus === 'breaker' && !world.power ? '[E] power'
      : this.focus ? '[E]' : null;

    // the house settles: a board creaks somewhere you aren't (and it hears that too)
    if (t > this.nextCreak) {
      this.nextCreak = t + 25 + Math.random() * 25;
      const names = Object.keys(world.rooms);
      const r = world.rooms[names[Math.floor(Math.random() * names.length)]];
      const pos = { x: (r.x1 + r.x2) / 2, y: 0.1, z: (r.z1 + r.z2) / 2 };
      audio.play('floor_creak', { pos, gain: 1.2, send: 0.5, ref: 2 });
      this.noise(0.6, pos);
    }
    if (t > this.nextGlitch) {
      this.nextGlitch = t + 35 + Math.random() * 50;
      fx.glitch = Math.max(fx.glitch, 0.3 + Math.random() * 0.3);
      audio.play('glitch', { gain: 0.18, send: 0 });
    }

    this.updateListener(dt);

    const dist = this.L ? this.L.pos.distanceTo(v.set(player.pos.x, 0, player.pos.z)) : 99;
    const hunting = this.L?.state === 'hunt' ? 0.35 : this.L?.state === 'investigate' ? 0.18 : 0;
    const target = 0.12 + hunting + (world.power ? 0.05 : 0) + Math.max(0, 1 - dist / 8) * 0.3;
    fx.tension += (target - fx.tension) * (1 - Math.exp(-dt * 1.2));
  }

  updateListener(dt) {
    const L = this.L;
    if (!L) return;
    const { world, player, camera } = this;
    const rig = world.listenerRig, body = world.listener;
    const me = v.set(player.pos.x, 0, player.pos.z);
    const dist = L.pos.distanceTo(me);

    if (L.state === 'hunt') {
      // close enough to keep hearing you breathe; it loses you only if you go still and quiet
      if (dist < 2.5 && player.speed > 0.6) { L.target = me.clone(); L.path = world.route(L.pos, L.target); L.lastHeard = this.t; }
      if (this.t - L.lastHeard > LOSE_TRACK) L.state = 'investigate';
    }
    if (!L.target) {
      L.pause -= dt;
      if (L.pause <= 0) {
        // wander to somewhere in a random room
        const names = Object.keys(world.rooms).filter((n) => n !== 'garage' || world.power);
        const r = world.rooms[names[Math.floor(Math.random() * names.length)]];
        L.target = new THREE.Vector3(THREE.MathUtils.lerp(r.x1 + 0.8, r.x2 - 0.8, Math.random()), 0, THREE.MathUtils.lerp(r.z1 + 0.6, r.z2 - 0.6, Math.random()));
        L.path = world.route(L.pos, L.target);
        L.state = 'wander';
      }
    }

    let moving = 0;
    if (L.target) {
      const goal = L.path.length ? L.path[0] : L.target;
      const to = goal.clone().sub(L.pos);
      to.y = 0;
      const len = to.length();
      const speed = SPEED[L.state];
      if (len < 0.15) {
        if (L.path.length) L.path.shift();
        else {
          // arrived: stop and listen
          L.target = null;
          L.pause = L.state === 'wander' ? 2 + Math.random() * 3 : 3.5;
          if (L.state !== 'hunt') L.state = 'wander';
        }
      } else {
        const step = Math.min(len, speed * dt);
        L.pos.addScaledVector(to.normalize(), step);
        moving = speed;
        const want = Math.atan2(to.x, to.z);
        let d = want - L.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        L.heading += d * Math.min(1, dt * 6);
      }
    }
    L.speed = moving;

    body.position.copy(L.pos);
    body.rotation.set(0, L.heading, 0);
    rig.move(dt, moving);
    rig.update(dt, this.t, camera.position, dist < 6 ? 1 : 0, moving ? 0 : 1);

    // its clicking, faster when it's after something
    if (!this.clicks) this.clicks = this.audio.loop('clicks', { pos: L.pos, gain: 0, send: 0.3, ref: 2, hrtf: true });
    this.audio.setPos(this.clicks.panner, v.set(L.pos.x, 0.7, L.pos.z));
    this.audio.ramp(this.clicks.gain.gain, L.state === 'wander' ? 0.6 : 1.1, 0.3);
    this.audio.ramp(this.clicks.src.playbackRate, L.state === 'hunt' ? 1.35 : L.state === 'investigate' ? 1.15 : 0.9, 0.3);

    this.heartbeat = THREE.MathUtils.clamp(1 - (dist - 1) / 7, 0, 1);
    if (dist < REACH && player.pos.y < 0.8) { // up in the attic, it can only wait below
      this.L = null;
      this.heartbeat = 0;
      this.audio.ramp(this.clicks.gain.gain, 0, 0.05);
      this.lunge = { from: body.position.clone() };
      this.onCatch();
    }
  }

  // Jumpscare: it rears up off the floor into the lens, mouth opening around you.
  updateLunge(dt) {
    const l = this.lunge;
    if (!l) return;
    const { world, camera, player } = this;
    const body = world.listener, rig = world.listenerRig;
    l.t = (l.t ?? 0) + dt;
    const rush = THREE.MathUtils.smoothstep(l.t, 0, 0.12);
    const face = camera.position.clone().addScaledVector(player.forward, 0.62 + (1 - rush) * 2.4);
    const jolt = 0.03 * rush;
    face.x += (Math.random() - 0.5) * jolt;
    face.y += (Math.random() - 0.5) * jolt;
    body.rotation.set(0, Math.atan2(camera.position.x - face.x, camera.position.z - face.z), 0);
    rig.setScare(rush);
    rig.move(dt, 6);
    rig.update(dt, this.t + l.t, camera.position, 1, 0);
    body.updateMatrixWorld(true);
    rig.head.lookAt(camera.position);
    rig.head.rotateZ((Math.random() - 0.5) * 0.2 * rush);
    rig.head.updateMatrixWorld(true);
    const headAt = rig.head.getWorldPosition(new THREE.Vector3());
    body.position.add(face.sub(headAt));
  }
}
