import * as THREE from 'three';
import { WATER_Y } from './world.js';

const RADIUS = 0.3;
const BASE_FOV = 72;
const STEP = 0.45;
const GRAVITY = 13;

// Sum of incommensurate sines: cheap smooth "handheld" noise.
const wobble = (t, s) => Math.sin(t * 1.13 + s) * 0.6 + Math.sin(t * 2.31 + s * 2.7) * 0.3 + Math.sin(t * 4.71 + s * 5.1) * 0.1;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.colliders = world.colliders;
    this.pos = world.spawn.pos.clone();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.yaw = this.tYaw = world.spawn.yaw;
    this.pitch = this.tPitch = 0;
    this.keys = new Set();
    this.eye = 1.62;
    this.camY = this.pos.y + this.eye;
    this.zoom = this.tZoom = 1;
    this.phase = 0;
    this.lean = 0;
    this.dip = 0;
    this.climb = null;
    this.locked = false;
    this.frozen = false; // no input or physics (caught, rewinding)
    this.sensitivity = 1;
    this.forward = new THREE.Vector3();
    this.events = [];

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' && !e.repeat && !this.frozen) this.jumpQueued = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.frozen) return;
      const s = 0.0021 * this.sensitivity / this.zoom;
      this.tYaw -= e.movementX * s;
      this.tPitch = THREE.MathUtils.clamp(this.tPitch - e.movementY * s, -0.95, 1.35); // can't look straight down
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.tZoom = THREE.MathUtils.clamp(this.tZoom * (e.deltaY > 0 ? 0.85 : 1.18), 1, 6);
    }, { passive: true });
  }

  // Put the player somewhere directly (checkpoints, tape rewind).
  place(x, y, z, yaw, pitch = 0) {
    this.pos.set(x, y, z);
    this.yaw = this.tYaw = yaw;
    this.pitch = this.tPitch = pitch;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.climb = null;
    this.camY = y + this.eye;
  }

  // Highest floor under the player's footprint.
  support(x, z) {
    const g = this.world.groundAt;
    const r = RADIUS * 0.9;
    return Math.max(g(x, z), g(x + r, z), g(x - r, z), g(x, z + r), g(x, z - r));
  }

  get waterDepth() {
    return this.world.inPool(this.pos.x, this.pos.z) ? WATER_Y - this.pos.y : 0;
  }

  collide() {
    const p = this.pos;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.colliders) {
        if (b.off || b.maxY < p.y + 0.2 || b.minY > p.y + 1.7) continue;
        const cx = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
        const cz = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = (RADIUS - d) / d;
          p.x += dx * push;
          p.z += dz * push;
        } else {
          const opts = [[b.minX - RADIUS - p.x, 0], [b.maxX + RADIUS - p.x, 0], [0, b.minZ - RADIUS - p.z], [0, b.maxZ + RADIUS - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += opts[0][0];
          p.z += opts[0][1];
        }
      }
    }
  }

  // Horizontal move that treats any rise above STEP as a wall (the pool edge, from inside).
  move(dx, dz) {
    const p = this.pos;
    const ok = (x, z) => this.support(x, z) - p.y <= STEP;
    if (ok(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; return true; }
    let moved = false;
    if (ok(p.x + dx, p.z)) { p.x += dx; moved = true; }
    if (ok(p.x, p.z + dz)) { p.z += dz; moved = true; }
    return moved;
  }

  // From inside the pool, haul yourself onto the deck in front of you.
  tryClimb() {
    const p = this.pos;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const d of [0.6, 0.9, 1.2]) {
      const tx = p.x + fx * d, tz = p.z + fz * d;
      const g = this.support(tx, tz);
      if (g - p.y > STEP && g - p.y < 1.8 && !this.world.inPool(tx, tz)) {
        this.climb = { t: 0, from: p.clone(), to: new THREE.Vector3(tx, g, tz) };
        this.vel.set(0, 0, 0);
        this.events.push('climb');
        return true;
      }
    }
    return false;
  }

  update(dt, t) {
    const k = this.keys;
    const p = this.pos;
    let stepped = false;

    if (this.frozen) {
      this.vel.set(0, 0, 0);
      this.jumpQueued = false;
    } else if (this.climb) {
      const c = this.climb;
      c.t += dt / 1.1;
      const u = Math.min(c.t, 1);
      const up = THREE.MathUtils.smoothstep(u, 0, 0.6), over = THREE.MathUtils.smoothstep(u, 0.45, 1);
      p.set(THREE.MathUtils.lerp(c.from.x, c.to.x, over), THREE.MathUtils.lerp(c.from.y, c.to.y, up), THREE.MathUtils.lerp(c.from.z, c.to.z, over));
      if (u >= 1) { this.climb = null; this.grounded = true; this.vy = 0; }
      this.jumpQueued = false;
    } else {
      const depth = this.waterDepth;
      const wading = depth > 0.5;
      const crouch = k.has('KeyC');
      const run = (k.has('ShiftLeft') || k.has('ShiftRight')) && !crouch && !wading;
      const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);

      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const wish = new THREE.Vector3(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
      let speed = crouch ? 1.1 : run ? 3.9 : 2.1;
      if (wading) speed *= 0.5;
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
      const accel = this.grounded ? (wading ? 3 : 7) : 1.5;
      this.vel.lerp(wish, 1 - Math.exp(-dt * accel));

      if (!this.move(this.vel.x * dt, this.vel.z * dt)) this.vel.multiplyScalar(0.5);
      this.collide();

      if (this.jumpQueued) {
        this.jumpQueued = false;
        if (wading && this.tryClimb()) { /* climbing */ }
        else if (this.grounded) {
          this.vy = wading ? 2.2 : 4.3;
          this.grounded = false;
          this.events.push('jump');
        }
      }

      // vertical: gravity, water drag, landing, step up/down
      const ground = this.support(p.x, p.z);
      if (!this.grounded || p.y - ground > STEP) {
        this.grounded = false;
        const wasAbove = p.y > WATER_Y - 0.1;
        const inWater = this.world.inPool(p.x, p.z) && p.y < WATER_Y;
        this.vy -= GRAVITY * (inWater ? 0.35 : 1) * dt;
        if (inWater) this.vy *= Math.exp(-dt * 3);
        p.y += this.vy * dt;
        if (wasAbove && this.world.inPool(p.x, p.z) && p.y < WATER_Y - 0.1 && this.vy < -2) {
          this.events.push('splash');
          this.dip = Math.min(0.5, -this.vy * 0.08);
        }
        if (p.y <= ground) {
          if (this.vy < -2.5 && depthAt(this, ground) < 0.5) {
            this.events.push('land');
            this.dip = Math.min(0.35, -this.vy * 0.05);
          }
          p.y = ground;
          this.vy = 0;
          this.grounded = true;
        }
      } else {
        p.y += (ground - p.y) * (1 - Math.exp(-dt * 14));
      }

      this.eye += ((crouch ? 1.0 : 1.62) - this.eye) * (1 - Math.exp(-dt * 8));
      this.running = run;
      this.wading = wading;
    }

    // heavy, slightly late camera turn
    const turn = 1 - Math.exp(-dt * 11);
    this.yaw += (this.tYaw - this.yaw) * turn;
    this.pitch += (this.tPitch - this.pitch) * turn;
    this.zoom += (this.tZoom - this.zoom) * (1 - Math.exp(-dt * 4));
    this.dip *= Math.exp(-dt * 5);

    const speed = this.climb ? 0 : Math.hypot(this.vel.x, this.vel.z);
    const prevStep = Math.floor(this.phase / Math.PI);
    this.phase += speed * (this.wading ? 3.4 : 2.75) * dt;
    stepped = this.grounded && Math.floor(this.phase / Math.PI) !== prevStep && speed > 0.3;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const amp = Math.min(speed / 2.1, 1.7) * (this.grounded ? 1 : 0.2);
    const bobY = Math.cos(this.phase * 2) * 0.032 * amp + Math.sin(t * 1.4) * 0.006 + (this.wading ? Math.sin(t * 0.9) * 0.02 : 0);
    const bobX = Math.sin(this.phase) * 0.03 * amp;
    const strafe = this.vel.x * cy - this.vel.z * sy;
    this.lean += (-strafe * 0.012 - this.lean) * (1 - Math.exp(-dt * 5));
    const shake = 0.0035 + (this.running ? 0.006 : 0) * amp + (this.climb ? 0.01 : 0);

    // camera height follows the body smoothly so steps and landings don't snap
    const targetY = p.y + this.eye - this.dip;
    this.camY += (targetY - this.camY) * (1 - Math.exp(-dt * (this.grounded ? 18 : 40)));

    const cam = this.camera;
    cam.position.set(p.x + cy * bobX, this.camY + bobY, p.z - sy * bobX);
    cam.rotation.set(
      this.pitch + wobble(t, 1) * shake + Math.sin(t * 1.4) * 0.003 + Math.abs(Math.sin(this.phase)) * 0.006 * amp - this.dip * 0.3,
      this.yaw + wobble(t, 7) * shake,
      this.lean + Math.sin(this.phase) * 0.01 * amp + wobble(t, 13) * shake * 0.6,
      'YXZ');
    cam.fov = BASE_FOV / this.zoom;
    cam.updateProjectionMatrix();
    cam.getWorldDirection(this.forward);

    this.speed = speed;
    return stepped;
  }
}

function depthAt(player, y) {
  return player.world.inPool(player.pos.x, player.pos.z) ? WATER_Y - y : 0;
}
