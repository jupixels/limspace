import * as THREE from 'three';

const v = new THREE.Vector3();
const box = new THREE.Box3();

// Small machinery for things that happen by themselves: objects that move only
// while you aren't looking, things that roll on their own, and one-shot triggers.
export class Kit {
  constructor(dir) {
    this.dir = dir;
    this.list = [];
  }

  // is any part of this object in frame (and near enough to matter)?
  seen(obj, far = 40) {
    box.setFromObject(obj);
    if (box.isEmpty()) return false;
    box.getCenter(v);
    if (v.distanceTo(this.dir.camera.position) > far) return false;
    const pts = [v.clone(), new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z)];
    return pts.some((p) => this.dir.onScreen(p, 1.05));
  }

  distTo(obj) {
    const p = this.dir.player.pos;
    return Math.hypot(obj.position.x - p.x, obj.position.z - p.z);
  }

  // Steps through a list of poses, one step each time it's been out of sight a while.
  unseen(obj, poses, o = {}) {
    const e = {
      kind: 'unseen', obj, poses, i: 0, hidden: 0, wait: o.wait ?? 3, minDist: o.minDist ?? 5,
      sound: o.sound, gain: o.gain ?? 0.8, loop: o.loop ?? false, active: o.active ?? (() => true), onMove: o.onMove,
    };
    this.list.push(e);
    return e;
  }

  // Turns to face you whenever you look away.
  facer(obj, o = {}) {
    const e = { kind: 'facer', obj, hidden: 0, wait: o.wait ?? 1.5, minDist: o.minDist ?? 3, sound: o.sound, gain: o.gain ?? 0.5, active: o.active ?? (() => true), offset: o.offset ?? 0 };
    this.list.push(e);
    return e;
  }

  // Rolls along a path by itself once started; spins as it goes if it's round.
  roller(obj, path, o = {}) {
    const e = {
      kind: 'roller', obj, path: path.map((p) => new THREE.Vector3(...p)), seg: 0, u: 0, speed: o.speed ?? 1, running: false,
      radius: o.radius ?? 0, sound: o.sound, gain: o.gain ?? 1, handle: null, onEnd: o.onEnd, face: o.face ?? false,
    };
    e.start = () => {
      if (e.running || e.done) return;
      e.running = true;
      if (e.sound) e.handle = this.dir.audio.loop(e.sound, { pos: obj.position, gain: e.gain, send: 0.4, ref: 2, hrtf: true });
    };
    obj.position.copy(e.path[0]);
    this.list.push(e);
    return e;
  }

  // Runs once (or every time, if `repeat`) when test() comes true.
  trigger(test, run, o = {}) {
    const e = { kind: 'trigger', test, run, repeat: o.repeat ?? false, done: false, delay: o.delay ?? 0, armed: -1 };
    this.list.push(e);
    return e;
  }

  after(seconds, run) {
    const e = { kind: 'timer', left: seconds, run, done: false };
    this.list.push(e);
    return e;
  }

  update(dt) {
    const { dir } = this;
    const me = dir.player.pos;
    for (const e of this.list) {
      if (e.done) continue;
      if (e.kind === 'unseen') {
        if (!e.active()) continue;
        const hidden = !this.seen(e.obj) && this.distTo(e.obj) > e.minDist;
        e.hidden = hidden ? e.hidden + dt : 0;
        if (e.hidden < e.wait) continue;
        e.hidden = 0;
        if (e.i >= e.poses.length - 1 && !e.loop) { e.done = true; continue; }
        e.i = (e.i + 1) % e.poses.length;
        const p = e.poses[e.i];
        // a pose may be a place and a turn, or "wherever you'll find it next to you"
        const pose = typeof p === 'function' ? p(dir) : p;
        if (!pose) continue;
        if (pose.p) e.obj.position.set(...pose.p);
        if (pose.r !== undefined) e.obj.rotation.y = pose.r;
        if (pose.visible !== undefined) e.obj.visible = pose.visible;
        if (e.sound) dir.audio.play(e.sound, { pos: e.obj.position, gain: e.gain, send: 0.5, ref: 2 });
        e.onMove?.(e.i, e);
      } else if (e.kind === 'facer') {
        if (!e.active()) continue;
        const hidden = !this.seen(e.obj) && this.distTo(e.obj) > e.minDist;
        e.hidden = hidden ? e.hidden + dt : 0;
        if (e.hidden < e.wait) continue;
        e.hidden = 0;
        const want = Math.atan2(me.x - e.obj.position.x, me.z - e.obj.position.z) + e.offset;
        let d = want - e.obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.3) continue;
        e.obj.rotation.y = want;
        if (e.sound) dir.audio.play(e.sound, { pos: e.obj.position, gain: e.gain, send: 0.5, ref: 1.5 });
      } else if (e.kind === 'roller') {
        if (!e.running) continue;
        const a = e.path[e.seg], b = e.path[e.seg + 1];
        const len = a.distanceTo(b);
        const step = e.speed * dt;
        e.u += step / Math.max(len, 1e-3);
        e.obj.position.lerpVectors(a, b, Math.min(e.u, 1));
        if (e.radius) e.obj.rotateX(step / e.radius);
        if (e.face) e.obj.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (e.handle) dir.audio.setPos(e.handle.panner, e.obj.position);
        if (e.u >= 1) {
          e.u = 0;
          e.seg++;
          if (e.seg >= e.path.length - 1) {
            e.running = false;
            e.done = true;
            if (e.handle) { dir.audio.ramp(e.handle.gain.gain, 0, 0.3); const h = e.handle; setTimeout(() => h.src.stop(), 600); }
            e.onEnd?.(e);
          }
        }
      } else if (e.kind === 'trigger') {
        if (e.armed >= 0) {
          e.armed -= dt;
          if (e.armed <= 0) { e.armed = -1; e.run(dir); if (!e.repeat) e.done = true; }
          continue;
        }
        if (e.test(dir)) {
          if (e.delay > 0) e.armed = e.delay;
          else { e.run(dir); if (!e.repeat) e.done = true; }
        }
      } else if (e.kind === 'timer') {
        e.left -= dt;
        if (e.left <= 0) { e.done = true; e.run(dir); }
      }
    }
  }

  stop() {
    for (const e of this.list) if (e.handle) e.handle.src.stop();
    this.list.length = 0;
  }
}
