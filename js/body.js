import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HEAD_Y = 1.56; // head bone height for a ~1.75 m person
const BACK = 0.08; // only the arms are drawn in first person, so the body can sit right under the lens
const ARM_BONES = /^(left|right)(forearm|hand)/i;

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

// The player's own hazmat-suited body: hands and forearms in first person, all of it in reflections.
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
    });
    this.maskToArms();

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
    return this;
  }

  // Tag each vertex by how much it follows the forearm/hand bones, and discard the rest
  // in the shader unless the whole figure is wanted.
  maskToArms() {
    this.whole = { value: 0 };
    const mesh = this.skinned;
    const bones = mesh.skeleton.bones;
    const arm = bones.map((b) => ARM_BONES.test(b.name));
    const idx = mesh.geometry.attributes.skinIndex, wt = mesh.geometry.attributes.skinWeight;
    const keep = new Float32Array(idx.count);
    const comps = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < idx.count; i++) {
      for (const c of comps) if (arm[idx[c](i)]) keep[i] += wt[c](i);
    }
    mesh.geometry.setAttribute('aKeep', new THREE.BufferAttribute(keep, 1));
    const mat = mesh.material;
    mat.side = THREE.DoubleSide; // the cut sleeve shows its inside rather than a hole
    mat.customProgramCacheKey = () => 'arms-mask';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWhole = this.whole;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aKeep;\nvarying float vKeep;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeep = aKeep;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKeep;\nuniform float uWhole;')
        .replace('void main() {', 'void main() {\n  if (uWhole < 0.5 && vKeep < 0.5) discard;');
    };
  }

  // The water's reflection shows the whole person.
  showWholeIn(reflector) {
    const orig = reflector.onBeforeRender;
    reflector.onBeforeRender = (...args) => {
      this.whole.value = 1;
      orig.apply(reflector, args);
      this.whole.value = 0;
    };
  }

  update(dt, player) {
    const p = player.pos;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    this.root.position.set(p.x + sy * BACK, p.y, p.z + cy * BACK);
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
  }
}
