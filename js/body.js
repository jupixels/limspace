import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HEAD_Y = 1.56; // head bone height for a ~1.75 m person
// The lens sits ahead of the neck so the empty collar never comes into view;
// the body slides further back as you look down.
const BACK = 0.32;
const BACK_LOOKING_DOWN = 0.2;

// Keep animations in place: the controller moves the body, not the clip.
function stripRootMotion(clip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position') || !/hip|pelvis|root/i.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}

// The player's own hazmat-suited body, visible when looking down and in reflections.
export class Body {
  async load(base) {
    const loader = new GLTFLoader();
    const [rig, walk, run, idle] = await Promise.all(
      ['hazmat', 'hazmat_walk', 'hazmat_run', 'hazmat_idle'].map((n) => loader.loadAsync(`${base}/${n}.glb`)));

    const model = this.model = rig.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.material.envMapIntensity = 0.8;
        if (o.isSkinnedMesh) this.skinned = o;
      }
      if (o.isBone && !this.head && /^head$/i.test(o.name)) this.head = o;
    });

    this.inner = new THREE.Group();
    this.inner.add(model);
    this.root = new THREE.Group();
    this.root.add(this.inner);

    this.mixer = new THREE.AnimationMixer(model);
    const act = (g) => {
      const a = this.mixer.clipAction(stripRootMotion(g.animations[0]));
      a.play();
      a.setEffectiveWeight(0);
      return a;
    };
    this.walk = act(walk);
    this.run = act(run);
    this.idle = act(idle);
    this.idle.setEffectiveWeight(1);

    // size from the posed skeleton (the bind-pose mesh bounds are unreliable): head bone to toes
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    const y = (n) => model.getObjectByName(n).getWorldPosition(new THREE.Vector3()).y;
    const toe = Math.min(y('LeftToeBase'), y('RightToeBase'));
    const s = HEAD_Y / (y('Head') - toe);
    model.scale.multiplyScalar(s);
    model.position.y = -toe * s + 0.03;
    this.hideHead(true);
    return this;
  }

  hideHead(hidden) {
    if (!this.head) return;
    this.head.scale.setScalar(hidden ? 0.001 : 1);
  }

  // Reflections should show a whole person, so the head comes back just for that render.
  showHeadDuring(reflector) {
    const orig = reflector.onBeforeRender;
    reflector.onBeforeRender = (...args) => {
      this.hideHead(false);
      this.root.updateMatrixWorld(true);
      this.skinned?.skeleton.update();
      orig.apply(reflector, args);
      this.hideHead(true);
      this.root.updateMatrixWorld(true);
      this.skinned?.skeleton.update();
    };
  }

  update(dt, player) {
    const p = player.pos;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const back = BACK + BACK_LOOKING_DOWN * THREE.MathUtils.clamp(-player.pitch / 1.2, 0, 1);
    this.root.position.set(p.x + sy * back, p.y, p.z + cy * back);
    this.root.rotation.y = player.yaw + Math.PI;
    // crouching: sink with the camera (the rig has no crouch clip)
    this.inner.position.y = player.eye - 1.62;

    const speed = player.speed;
    const wWalk = THREE.MathUtils.clamp(speed / 1.6, 0, 1) * (1 - THREE.MathUtils.clamp((speed - 2.4) / 1.2, 0, 1));
    const wRun = THREE.MathUtils.clamp((speed - 2.4) / 1.2, 0, 1);
    const blend = 1 - Math.exp(-dt * 8);
    const lerpW = (a, w) => a.setEffectiveWeight(a.getEffectiveWeight() + (w - a.getEffectiveWeight()) * blend);
    lerpW(this.walk, wWalk);
    lerpW(this.run, wRun);
    lerpW(this.idle, Math.max(0, 1 - wWalk - wRun));
    this.walk.timeScale = Math.max(0.4, speed / 1.8) * (player.wading ? 0.7 : 1);
    this.run.timeScale = Math.max(0.6, speed / 3.9);
    this.mixer.update(player.climb ? dt * 0.3 : dt);
    // the clips key Head.scale too, so hide it again after they apply
    this.hideHead(true);
  }
}
