import * as THREE from 'three';

const ARM_LENGTH = 0.46; // elbow to fingertip, metres
const FOV = 60;

// Copy the triangles of one forearm+glove out of the bind-pose (T-pose) mesh into a rigid piece,
// re-centred on the elbow and pointing down -Z.
function cutArm(mesh, side) {
  const geo = mesh.geometry;
  const bones = mesh.skeleton.bones.map((b) => new RegExp(`^${side}(forearm|hand)`, 'i').test(b.name));
  const idx = geo.attributes.skinIndex, wt = geo.attributes.skinWeight, pos = geo.attributes.position;
  const comps = ['getX', 'getY', 'getZ', 'getW'];
  const keep = (i) => comps.reduce((s, c) => s + (bones[idx[c](i)] ? wt[c](i) : 0), 0) > 0.5;

  const tris = [];
  const index = geo.index ? geo.index.array : null;
  const n = index ? index.length : pos.count;
  for (let t = 0; t < n; t += 3) {
    const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
    if (keep(a) && keep(b) && keep(c)) tris.push(a, b, c);
  }

  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const src = geo.attributes[name];
    if (!src) continue;
    // read through the accessor: glTF attributes may be interleaved
    const arr = new Float32Array(tris.length * src.itemSize);
    tris.forEach((v, i) => { for (let k = 0; k < src.itemSize; k++) arr[i * src.itemSize + k] = src[comps[k]](v); });
    out.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
  }

  // In the T-pose the arm lies along X; the end nearest the body is the elbow.
  out.computeBoundingBox();
  const bb = out.boundingBox;
  const outward = Math.abs(bb.max.x) > Math.abs(bb.min.x) ? 1 : -1;
  const elbowX = outward > 0 ? bb.min.x : bb.max.x;
  const len = bb.max.x - bb.min.x;
  out.translate(-elbowX, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  out.scale(ARM_LENGTH / len, ARM_LENGTH / len, ARM_LENGTH / len);
  out.rotateY(outward * Math.PI / 2); // arm axis -> -Z
  return out;
}

// First-person hands: two rigid forearms drawn in their own scene on top of the world.
export class ViewArms {
  constructor(bodyMesh) {
    const src = bodyMesh.material;
    const mat = new THREE.MeshStandardMaterial({
      map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap,
      roughness: src.roughness, metalness: src.metalness, side: THREE.DoubleSide,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.01, 5);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    // which cut lands on screen-left depends on the model's handedness; sort by that afterwards
    const pieces = ['left', 'right'].map((s) => new THREE.Mesh(cutArm(bodyMesh, s), mat));
    this.arms = pieces.map((m) => {
      const pivot = new THREE.Group();
      pivot.add(m);
      this.rig.add(pivot);
      return pivot;
    });

    this.hemi = new THREE.HemisphereLight(0xe6f4f0, 0x2a3230, 1);
    this.key = new THREE.DirectionalLight(0xeafff4, 1);
    this.key.position.set(0.3, 1, 0.4);
    this.scene.add(this.hemi, this.key);

    this.sway = new THREE.Vector2();
    this.lift = 0;
    this.t = 0;
    this.pose();
  }

  // Each forearm runs from an elbow below the frame to a hand floating in front of the lens,
  // rolled so the back of the glove faces up and slightly inward.
  pose({ elbow = [0.27, -0.38, -0.3], hand = [0.11, -0.03, -0.55], roll = 0.5 } = {}) {
    const fwd = new THREE.Vector3(0, 0, -1), axis = new THREE.Vector3(0, 0, 1);
    this.arms.forEach((arm, i) => {
      const s = i === 0 ? -1 : 1;
      const e = new THREE.Vector3(s * elbow[0], elbow[1], elbow[2]);
      const dir = new THREE.Vector3(s * hand[0], hand[1], hand[2]).sub(e).normalize();
      arm.quaternion.setFromUnitVectors(fwd, dir).multiply(new THREE.Quaternion().setFromAxisAngle(axis, s * roll));
      arm.position.copy(e);
      arm.userData.base = e;
    });
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt, player, light) {
    this.t += dt;
    const t = this.t;
    const amp = Math.min(player.speed / 2.1, 1.7) * (player.grounded ? 1 : 0.3);
    const k = 1 - Math.exp(-dt * 8);

    // lag behind turns, like holding your arms out while looking around
    const dyaw = THREE.MathUtils.clamp((player.tYaw - player.yaw) * 0.3, -0.06, 0.06);
    const dpitch = THREE.MathUtils.clamp((player.tPitch - player.pitch) * 0.3, -0.05, 0.05);
    this.sway.x += (dyaw - this.sway.x) * k;
    this.sway.y += (-dpitch - this.sway.y) * k;

    // raise the hands to the ledge while climbing; let them float a little in the water
    const liftTarget = player.climb ? 0.14 : player.wading ? 0.03 : 0;
    this.lift += (liftTarget - this.lift) * k;

    this.rig.position.set(
      this.sway.x + Math.sin(player.phase) * 0.012 * amp,
      this.sway.y + this.lift - Math.abs(Math.cos(player.phase)) * 0.014 * amp + Math.sin(t * 1.4) * 0.004,
      0);
    this.rig.rotation.z = Math.sin(player.phase) * 0.02 * amp;
    // arms counter-swing slightly as you walk
    this.arms.forEach((arm, i) => {
      arm.position.copy(arm.userData.base);
      arm.position.z += (i === 0 ? 1 : -1) * Math.sin(player.phase) * 0.02 * amp;
    });

    this.hemi.intensity = 0.9 * light;
    this.key.intensity = 1.4 * light;
  }
}
