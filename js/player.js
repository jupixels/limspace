import * as THREE from 'three';

const RADIUS = 0.3;
const BASE_FOV = 72;

// Sum of incommensurate sines: cheap smooth "handheld" noise.
const wobble = (t, s) => Math.sin(t * 1.13 + s) * 0.6 + Math.sin(t * 2.31 + s * 2.7) * 0.3 + Math.sin(t * 4.71 + s * 5.1) * 0.1;

export class Player {
  constructor(camera, colliders, spawn) {
    this.camera = camera;
    this.colliders = colliders;
    this.pos = spawn.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = this.tYaw = spawn.yaw;
    this.pitch = this.tPitch = 0;
    this.keys = new Set();
    this.eye = 1.62;
    this.zoom = this.tZoom = 1;
    this.phase = 0;
    this.lean = 0;
    this.locked = false;
    this.forward = new THREE.Vector3();

    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = 0.0021 / this.zoom;
      this.tYaw -= e.movementX * s;
      this.tPitch = THREE.MathUtils.clamp(this.tPitch - e.movementY * s, -1.35, 1.35);
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.tZoom = THREE.MathUtils.clamp(this.tZoom * (e.deltaY > 0 ? 0.85 : 1.18), 1, 6);
    }, { passive: true });
  }

  collide() {
    const p = this.pos;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.colliders) {
        if (b.maxY < 0.2 || b.minY > 1.7) continue;
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

  // Returns true on the frame a footstep lands.
  update(dt, t) {
    const k = this.keys;
    const crouch = k.has('KeyC');
    const run = (k.has('ShiftLeft') || k.has('ShiftRight')) && !crouch;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(crouch ? 1.1 : run ? 3.9 : 2.1);
    this.vel.lerp(wish, 1 - Math.exp(-dt * (wish.lengthSq() ? 7 : 9)));
    this.pos.addScaledVector(this.vel, dt);
    this.collide();

    // heavy, slightly late camera turn
    const turn = 1 - Math.exp(-dt * 11);
    this.yaw += (this.tYaw - this.yaw) * turn;
    this.pitch += (this.tPitch - this.pitch) * turn;
    this.zoom += (this.tZoom - this.zoom) * (1 - Math.exp(-dt * 4));
    this.eye += ((crouch ? 1.0 : 1.62) - this.eye) * (1 - Math.exp(-dt * 8));

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const prevStep = Math.floor(this.phase / Math.PI);
    this.phase += speed * 2.75 * dt;
    const stepped = Math.floor(this.phase / Math.PI) !== prevStep && speed > 0.4;

    const amp = Math.min(speed / 2.1, 1.7);
    const bobY = Math.cos(this.phase * 2) * 0.032 * amp + Math.sin(t * 1.4) * 0.006;
    const bobX = Math.sin(this.phase) * 0.03 * amp;
    const strafe = this.vel.x * cy - this.vel.z * sy;
    this.lean += (-strafe * 0.012 - this.lean) * (1 - Math.exp(-dt * 5));
    const shake = 0.0035 + (run ? 0.006 : 0) * amp;

    const cam = this.camera;
    cam.position.set(this.pos.x + cy * bobX, this.pos.y + this.eye + bobY, this.pos.z - sy * bobX);
    cam.rotation.set(
      this.pitch + wobble(t, 1) * shake + Math.sin(t * 1.4) * 0.003 + Math.abs(Math.sin(this.phase)) * 0.006 * amp,
      this.yaw + wobble(t, 7) * shake,
      this.lean + Math.sin(this.phase) * 0.01 * amp + wobble(t, 13) * shake * 0.6,
      'YXZ');
    cam.fov = BASE_FOV / this.zoom;
    cam.updateProjectionMatrix();
    cam.getWorldDirection(this.forward);

    this.speed = speed;
    this.running = run;
    return stepped;
  }
}
