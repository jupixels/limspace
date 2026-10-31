import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HEAD_Y = 1.56; // head bone height for a ~1.75 m person
const BACK = 0.2; // lens sits ahead of the body so the cut ends of the arms and legs face away from it
const ARM_HANG = 0.1; // how far the hanging arms angle out from the sides
const ARM_BONES = /^(left|right)(forearm|hand)/i;
const LEG_BONES = /^(left|right)(upleg|leg|foot|toebase)/i;
const LEG_FADE = [0.62, 0.72]; // bind-pose height band (m) where the thighs dissolve

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

// The player's own hazmat-suited body: forearms, hands and legs in first person, all of it in reflections.
export class Body {
  async load(base) {
    const loader = new GLTFLoader();
    const [rig, walk, run] = await Promise.all(
      ['hazmat', 'hazmat_walk', 'hazmat_run'].map((n) => loader.loadAsync(`${base}/${n}.glb`)));

    const model = this.model = rig.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.material.envMapIntensity = 0.8;
        if (o.isSkinnedMesh) this.skinned = o;
      }
    });
    this.maskFirstPerson();

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
    // Standing still isn't a clip: with the walk/run weights at zero the mixer blends back to
    // the rig's rest pose (straight legs), and stand() then lowers the arms to the sides.
    this.still = 1;
    this.arms = ['Left', 'Right'].map((s) => ({
      upper: model.getObjectByName(`${s}Arm`), fore: model.getObjectByName(`${s}ForeArm`),
    }));

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

  // Tag each vertex by how much it follows the forearm/hand bones and the leg bones, and
  // discard the rest in the shader unless the whole figure is wanted. Arms end in a hard cut
  // at the elbow (rarely seen); legs dissolve upward from the knee so looking down never
  // shows a cut edge at the hips.
  maskFirstPerson() {
    this.whole = { value: 0 };
    const mesh = this.skinned;
    const bones = mesh.skeleton.bones;
    const arm = bones.map((b) => ARM_BONES.test(b.name));
    const leg = bones.map((b) => LEG_BONES.test(b.name));
    const idx = mesh.geometry.attributes.skinIndex, wt = mesh.geometry.attributes.skinWeight;
    const keep = new Float32Array(idx.count * 2);
    const comps = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < idx.count; i++) {
      for (const c of comps) {
        const b = idx[c](i), w = wt[c](i);
        if (arm[b]) keep[i * 2] += w;
        if (leg[b]) keep[i * 2 + 1] += w;
      }
    }
    mesh.geometry.setAttribute('aKeep', new THREE.BufferAttribute(keep, 2));
    const mat = mesh.material;
    mat.side = THREE.DoubleSide; // the cut sleeve shows its inside rather than a hole
    mat.customProgramCacheKey = () => 'first-person-mask';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWhole = this.whole;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 aKeep;
varying vec2 vKeep;
varying float vBindY;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vKeep = aKeep;
vBindY = position.y;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vKeep;
varying float vBindY;
uniform float uWhole;`)
        .replace('void main() {', `void main() {
  if (uWhole < 0.5) {
    bool isArm = vKeep.x > 0.5, isLeg = vKeep.y > 0.5;
    if (!isArm && !isLeg) discard;
    if (isLeg && !isArm) {
      float fade = smoothstep(${LEG_FADE[0].toFixed(2)}, ${LEG_FADE[1].toFixed(2)}, vBindY);
      float dither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
      if (fade > dither) discard;
    }
  }`)
        // seen through a cut, the inside reads as solid suit rather than a hollow tube
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  if (!gl_FrontFacing) gl_FragColor.rgb = diffuseColor.rgb * 0.55;`);
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
    this.still += (Math.max(0, 1 - wWalk - wRun) - this.still) * blend;
    this.walk.timeScale = Math.max(0.4, speed / 1.8) * (player.wading ? 0.7 : 1);
    this.run.timeScale = Math.max(0.6, speed / 3.9);
    this.mixer.update(player.climb ? dt * 0.3 : dt);
    this.stand(this.still);
  }

  // Swing each upper arm (in world space, so the rig's bone axes don't matter) until the
  // arm hangs straight down, slightly out from the body, blended by how still we are.
  stand(weight) {
    if (weight < 0.001) return;
    this.root.updateMatrixWorld(true);
    const a = new THREE.Vector3(), f = new THREE.Vector3(), target = new THREE.Vector3();
    const qWorld = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qSwing = new THREE.Quaternion();
    for (const { upper, fore } of this.arms) {
      upper.getWorldPosition(a);
      fore.getWorldPosition(f);
      const dir = f.sub(a).normalize();
      // outward is the horizontal part of the current arm direction (straight out in the rest pose)
      target.set(dir.x, 0, dir.z).normalize().multiplyScalar(ARM_HANG).add(new THREE.Vector3(0, -1, 0)).normalize();
      qSwing.setFromUnitVectors(dir, target);
      upper.getWorldQuaternion(qWorld);
      upper.parent.getWorldQuaternion(qParent);
      const local = qParent.invert().multiply(qSwing.multiply(qWorld));
      upper.quaternion.slerp(local, weight);
      upper.updateMatrixWorld(true);
    }
  }
}
