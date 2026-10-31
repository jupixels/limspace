import * as THREE from 'three';

// The Swimmer: a too-long, waterlogged human shape that swims face down along the pool floor.
// Built from primitives; every limb is a pivot group so it can be posed procedurally.
// Local +Z is where its head points.
export function createSwimmer() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xc4d1cc, roughness: 0.45, emissive: 0x111a18 });
  const bruise = new THREE.MeshStandardMaterial({ color: 0x5f726e, roughness: 0.6, emissive: 0x050a09 });
  const hollow = new THREE.MeshBasicMaterial({ color: 0x020303 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x0b0d0c, roughness: 0.9, side: THREE.DoubleSide });

  const mesh = (geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    parent.add(m);
    return m;
  };
  const pivot = (parent, pos) => {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    return g;
  };
  // a limb segment lying along +Z (or -Z) from its pivot
  const segment = (parent, len, r, dir = 1, mat = skin) => {
    mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat, parent, [0, 0, dir * len / 2], [Math.PI / 2, 0, 0]);
  };

  const root = new THREE.Group();
  const body = pivot(root, [0, 0, 0]);

  // torso, flattened and narrow, with vertebrae showing through the back
  mesh(new THREE.CapsuleGeometry(0.15, 0.9, 6, 12), skin, body, [0, 0, 0], [Math.PI / 2, 0, 0], [1.1, 1, 0.62]);
  for (let i = 0; i < 9; i++) mesh(new THREE.SphereGeometry(0.03, 6, 4), bruise, body, [0, 0.085, -0.45 + i * 0.11]);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      mesh(new THREE.CapsuleGeometry(0.012, 0.16, 2, 4), bruise, body, [s * 0.1, 0.02, 0.05 + i * 0.08], [0, 0, s * 1.2]);
    }
  }
  mesh(new THREE.SphereGeometry(0.15, 10, 8), skin, body, [0, -0.01, -0.58], [0, 0, 0], [1.05, 0.6, 0.8]);

  // neck and head; the head pivot lets it look down at the floor or up at you
  const neck = pivot(body, [0, 0.01, 0.58]);
  segment(neck, 0.18, 0.045);
  const head = pivot(neck, [0, 0, 0.26]);
  mesh(new THREE.SphereGeometry(0.115, 14, 10), skin, head, [0, 0.02, 0.04], [0, 0, 0], [0.82, 0.92, 1.18]);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.036, 8, 6), hollow, head, [s * 0.043, 0.03, 0.135], [0, 0, 0], [1.05, 1.5, 0.7]);
    mesh(new THREE.SphereGeometry(0.03, 6, 4), bruise, head, [s * 0.075, -0.035, 0.1]); // sunken cheek
  }
  const jaw = pivot(head, [0, -0.05, 0.06]);
  mesh(new THREE.SphereGeometry(0.06, 10, 6), skin, jaw, [0, -0.02, 0.05], [0, 0, 0], [0.9, 0.45, 1]);
  mesh(new THREE.SphereGeometry(0.04, 8, 6), hollow, head, [0, -0.06, 0.135], [0, 0, 0], [0.7, 1.4, 0.4]); // open mouth

  // matted scalp, and long hair drifting off it in the water
  mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, head, [0, 0.025, 0.0], [-0.5, 0, 0], [0.88, 0.95, 1.2]);
  const hair = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 1.6 - Math.PI * 0.8;
    const strand = pivot(head, [Math.sin(a) * 0.09, 0.06 + Math.cos(a) * 0.03, -0.04 - Math.abs(Math.sin(a)) * 0.03]);
    const len = 0.5 + Math.random() * 0.45;
    mesh(new THREE.PlaneGeometry(0.06, len, 1, 4), hairMat, strand, [0, 0, -len / 2], [Math.PI / 2, 0, Math.random() * 0.6 - 0.3]);
    strand.userData.seed = Math.random() * 6.28;
    strand.userData.splay = Math.sin(a) * 0.5;
    hair.push(strand);
  }

  // arms reach forward past the head, ending in hands with long fingers
  const arms = [-1, 1].map((s) => {
    const shoulder = pivot(body, [s * 0.19, 0, 0.4]);
    segment(shoulder, 0.5, 0.04);
    const elbow = pivot(shoulder, [0, 0, 0.5]);
    segment(elbow, 0.5, 0.033);
    const wrist = pivot(elbow, [0, 0, 0.52]);
    mesh(new THREE.BoxGeometry(0.075, 0.018, 0.1), skin, wrist, [0, 0, 0.05]);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const knuckle = pivot(wrist, [(f - 1.5) * 0.02, 0, 0.1]);
      segment(knuckle, 0.17 + (f === 1 || f === 2 ? 0.04 : 0), 0.008);
      knuckle.rotation.y = (f - 1.5) * 0.12;
      fingers.push(knuckle);
    }
    return { s, shoulder, elbow, wrist, fingers };
  });

  // legs trail behind
  const legs = [-1, 1].map((s) => {
    const hip = pivot(body, [s * 0.09, -0.02, -0.66]);
    segment(hip, 0.58, 0.05, -1);
    const knee = pivot(hip, [0, 0, -0.58]);
    segment(knee, 0.58, 0.04, -1);
    const ankle = pivot(knee, [0, 0, -0.6]);
    mesh(new THREE.BoxGeometry(0.06, 0.03, 0.2), skin, ankle, [0, 0, -0.08]);
    return { s, hip, knee };
  });

  let phase = Math.random() * 6.28;
  let look = 0;
  let twitch = null;
  let reach = 0;
  const tmp = new THREE.Vector3();

  function pose(t) {
    const ph = phase;
    for (const a of arms) {
      // an uneven, alternating stroke: reach far forward, sweep out, drag back
      const p = ph + (a.s > 0 ? Math.PI : 0);
      const pull = Math.max(0, Math.sin(p)), glide = Math.max(0, -Math.sin(p));
      a.shoulder.rotation.set(
        THREE.MathUtils.lerp(0.25 * pull + 0.05, -0.25, reach),
        THREE.MathUtils.lerp(a.s * (0.08 + 0.85 * pull), a.s * -0.12, reach),
        0, 'YXZ');
      a.elbow.rotation.set(0.35 * pull, a.s * -0.5 * pull, 0, 'YXZ');
      a.wrist.rotation.set(0.25 * glide - 0.15, 0, 0);
      a.fingers.forEach((f, i) => { f.rotation.x = 0.25 + 0.35 * pull + reach * -0.3 + Math.sin(t * 3 + i) * 0.03; });
    }
    for (const l of legs) {
      const k = Math.sin(ph * 1.6 + (l.s > 0 ? Math.PI : 0));
      l.hip.rotation.set(0.18 * k, 0, 0);
      l.knee.rotation.set(-0.25 * (k * 0.5 + 0.5), 0, 0);
    }
    body.rotation.z = Math.sin(ph) * 0.14;
    body.position.y = Math.sin(ph * 2) * 0.03;
    neck.rotation.x = 0.15;
    jaw.rotation.x = 0.2 + 0.15 * Math.sin(t * 0.7);
    hair.forEach((h) => {
      h.rotation.x = -0.1 + Math.sin(t * 1.1 + h.userData.seed) * 0.2;
      h.rotation.y = h.userData.splay + Math.sin(t * 0.8 + h.userData.seed * 2) * 0.25;
    });
  }

  return {
    root,
    // swimming: advance the stroke by how fast it is moving
    swim(dt, speed) {
      phase += dt * (1.2 + speed * 1.1);
    },
    // a frozen limb jerks, once
    twitch() {
      const parts = [...arms.map((a) => a.elbow), ...arms.map((a) => a.wrist), head, ...legs.map((l) => l.knee)];
      twitch = { part: parts[Math.floor(Math.random() * parts.length)], t: 0.12, amt: (Math.random() - 0.5) * 0.9 };
    },
    // arms thrown forward for the grab
    setReach(v) { reach = v; },
    // weight 0 = face down to the floor, 1 = head turned up toward `target`
    update(dt, t, target, lookWeight) {
      look += (lookWeight - look) * (1 - Math.exp(-dt * 2.5));
      pose(t);
      // head: down at the floor, or turned on its neck toward the camera
      let yaw = 0, pitch = 0.9;
      if (target && look > 0.001) {
        root.updateMatrixWorld(true);
        neck.updateMatrixWorld(true);
        tmp.copy(target);
        neck.worldToLocal(tmp);
        tmp.sub(head.position);
        yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.3, 1.3);
        pitch = THREE.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -1.1, 0.9);
      }
      head.rotation.set(THREE.MathUtils.lerp(0.9, pitch, look), THREE.MathUtils.lerp(0, yaw, look), 0, 'YXZ');
      if (twitch) {
        twitch.t -= dt;
        twitch.part.rotation.z += twitch.amt * Math.max(0, twitch.t / 0.12);
        if (twitch.t <= 0) twitch = null;
      }
    },
  };
}
