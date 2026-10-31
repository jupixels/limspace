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
  // pinpoint glints deep in the sockets, only lit for the scare
  const glint = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.6), fog: false });
  const glints = [];
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.036, 8, 6), hollow, head, [s * 0.043, 0.03, 0.135], [0, 0, 0], [1.05, 1.5, 0.7]);
    glints.push(mesh(new THREE.SphereGeometry(0.011, 6, 4), glint, head, [s * 0.043, 0.03, 0.16]));
    mesh(new THREE.SphereGeometry(0.03, 6, 4), bruise, head, [s * 0.075, -0.035, 0.1]); // sunken cheek
  }
  const jaw = pivot(head, [0, -0.05, 0.06]);
  mesh(new THREE.SphereGeometry(0.06, 10, 6), skin, jaw, [0, -0.02, 0.05], [0, 0, 0], [0.9, 0.45, 1]);
  const mouth = mesh(new THREE.SphereGeometry(0.04, 8, 6), hollow, head, [0, -0.06, 0.135], [0, 0, 0], [0.7, 1.4, 0.4]); // open mouth

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

  glints.forEach((g) => { g.visible = false; });
  const calmEmissive = skin.emissive.clone(), scareEmissive = new THREE.Color(0x6c837d);
  let phase = Math.random() * 6.28;
  let look = 0;
  let scare = 0;
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
    jaw.rotation.x = THREE.MathUtils.lerp(0.2 + 0.15 * Math.sin(t * 0.7), 1.05 + Math.random() * 0.12, scare);
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
    // jumpscare: jaw wide, head swollen, eyes catching the light, skin lit from nowhere
    setScare(v) {
      scare = v;
      head.scale.setScalar(1 + 0.3 * v);
      mouth.scale.set(0.7 + 0.5 * v, 1.4 + 1.6 * v, 0.4);
      mouth.position.y = -0.06 - 0.03 * v;
      glints.forEach((g) => { g.visible = v > 0.5; });
      skin.emissive.copy(calmEmissive).lerp(scareEmissive, v);
    },
    head,
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

// The Occupant: a very tall, thin figure in hotel staff clothes with a head cocked too far.
// Feet at the origin, facing +Z.
export function createOccupant() {
  const suit = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xbdb8aa, roughness: 0.8 });
  const tie = new THREE.MeshStandardMaterial({ color: 0x4a0f12, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.45, emissive: 0x16140f });
  const hollow = new THREE.MeshBasicMaterial({ color: 0x020202 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.5 });

  const add = (geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
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
  // a segment hanging down (-Y) from its pivot
  const hang = (parent, len, r, mat) => add(new THREE.CapsuleGeometry(r, len, 4, 8), mat, parent, [0, -len / 2, 0]);

  const root = new THREE.Group();
  const body = pivot(root, [0, 0, 0]);

  // legs, too long, trouser-dark, with shoes
  for (const s of [-1, 1]) {
    const hip = pivot(body, [s * 0.09, 1.25, 0]);
    hang(hip, 0.6, 0.06, suit);
    const knee = pivot(hip, [0, -0.62, 0]);
    hang(knee, 0.58, 0.05, suit);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.26), suit, knee, [0, -0.63, 0.05]);
  }
  // torso: narrow jacket over a shirt and tie, slightly hunched
  const chest = pivot(body, [0, 1.3, 0]);
  chest.rotation.x = 0.12;
  add(new THREE.CapsuleGeometry(0.17, 0.62, 6, 10), suit, chest, [0, 0.38, 0], [0, 0, 0], [1, 1, 0.6]);
  add(new THREE.BoxGeometry(0.1, 0.52, 0.02), shirt, chest, [0, 0.44, 0.1]);
  add(new THREE.BoxGeometry(0.035, 0.4, 0.015), tie, chest, [0, 0.42, 0.115]);
  // arms hang past the knees and end in long pale fingers
  const arms = [-1, 1].map((s) => {
    const shoulder = pivot(chest, [s * 0.21, 0.72, 0]);
    hang(shoulder, 0.58, 0.045, suit);
    const elbow = pivot(shoulder, [0, -0.6, 0]);
    hang(elbow, 0.56, 0.038, suit);
    const wrist = pivot(elbow, [0, -0.6, 0]);
    add(new THREE.BoxGeometry(0.02, 0.11, 0.07), skin, wrist, [0, -0.05, 0]);
    for (let f = 0; f < 4; f++) {
      const k = pivot(wrist, [0, -0.1, (f - 1.5) * 0.017]);
      hang(k, 0.15 + (f === 1 || f === 2 ? 0.04 : 0), 0.007, skin);
      k.rotation.x = (f - 1.5) * 0.05;
    }
    shoulder.rotation.z = s * 0.08;
    return { s, shoulder, elbow, wrist };
  });
  // a long neck and a head cocked over to one side
  const neck = pivot(chest, [0, 0.78, 0.02]);
  add(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), skin, neck, [0, 0.15, 0]);
  const head = pivot(neck, [0, 0.38, 0]);
  add(new THREE.SphereGeometry(0.11, 14, 10), skin, head, [0, 0.03, 0], [0, 0, 0], [0.85, 1.3, 0.92]);
  add(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMat, head, [0, 0.06, -0.01], [-0.25, 0, 0], [0.88, 1.3, 0.96]);
  const glintMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.6), fog: false });
  const glints = [];
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.03, 8, 6), hollow, head, [s * 0.038, 0.05, 0.085], [0, 0, 0], [1, 1.25, 0.6]);
    const g = add(new THREE.SphereGeometry(0.009, 6, 4), glintMat, head, [s * 0.038, 0.05, 0.105]);
    g.visible = false;
    glints.push(g);
  }
  // the smile: a thin dark crescent far too wide for the face
  const smile = add(new THREE.TorusGeometry(0.06, 0.007, 4, 24, Math.PI), hollow, head, [0, -0.045, 0.09], [0, 0, Math.PI], [1.25, 0.6, 1]);
  const maw = add(new THREE.SphereGeometry(0.05, 10, 8), hollow, head, [0, -0.06, 0.085], [0, 0, 0], [1.3, 0.15, 0.4]);

  const calm = skin.emissive.clone(), lit = new THREE.Color(0x5c5850);
  let look = 0, scare = 0, twitch = null;
  const tilt = 0.42;
  const tmp = new THREE.Vector3();

  return {
    root,
    head,
    twitch() {
      twitch = { part: Math.random() < 0.5 ? head : arms[Math.random() < 0.5 ? 0 : 1].wrist, t: 0.15, amt: (Math.random() - 0.5) * 1.2 };
    },
    setScare(v) {
      scare = v;
      head.scale.setScalar(1 + 0.3 * v);
      glints.forEach((g) => { g.visible = v > 0.5; });
      skin.emissive.copy(calm).lerp(lit, v);
      smile.scale.set(1.25 + 0.6 * v, 0.6 + 0.3 * v, 1);
      maw.scale.set(1.3 + 0.4 * v, 0.15 + 1.6 * v, 0.4);
    },
    // the body stays utterly still; only the head follows you
    update(dt, t, target, lookWeight) {
      look += (lookWeight - look) * (1 - Math.exp(-dt * 1.5));
      let yaw = 0, pitch = 0;
      if (target && look > 0.001) {
        root.updateMatrixWorld(true);
        tmp.copy(target);
        neck.worldToLocal(tmp);
        tmp.sub(head.position);
        yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.4, 1.4);
        pitch = THREE.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.6, 0.8);
      }
      head.rotation.set(pitch * look, yaw * look, tilt * (1 - scare * 0.7), 'YXZ');
      for (const a of arms) {
        a.elbow.rotation.set(-0.05 - 0.9 * scare, 0, 0);
        a.shoulder.rotation.set(-1.2 * scare, 0, a.s * (0.08 + 0.3 * scare));
      }
      if (twitch) {
        twitch.t -= dt;
        twitch.part.rotation.z += twitch.amt * Math.max(0, twitch.t / 0.15);
        if (twitch.t <= 0) twitch = null;
      }
    },
  };
}

// The Listener: a pale, eyeless thing on four long limbs, knees higher than its back.
// It finds you by sound. Feet at the origin, facing +Z. Limbs are re-posed every frame.
export function createListener() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9c5ba, roughness: 0.5, emissive: 0x15130f });
  const bruise = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 0.6 });
  const hollow = new THREE.MeshBasicMaterial({ color: 0x030202 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xe8e2cc, roughness: 0.3, emissive: 0x2a2820 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  root.add(body);
  const add = (geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    parent.add(m);
    return m;
  };

  add(new THREE.CapsuleGeometry(0.16, 0.85, 6, 12), skin, body, [0, 0, 0], [Math.PI / 2, 0, 0], [1.05, 1, 0.7]);
  for (let i = 0; i < 10; i++) add(new THREE.SphereGeometry(0.028, 6, 4), bruise, body, [0, 0.105, -0.5 + i * 0.105]);
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.012, 0.18, 2, 4), bruise, body, [s * 0.11, 0.03, 0.05 + i * 0.07], [0, 0, s * 1.15]);
  }
  // neck and an eyeless head that is mostly mouth
  add(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), skin, body, [0, 0.02, 0.58], [Math.PI / 2 - 0.3, 0, 0]);
  const head = new THREE.Group();
  head.position.set(0, 0.05, 0.78);
  body.add(head);
  add(new THREE.SphereGeometry(0.13, 16, 12), skin, head, [0, 0.02, 0], [0, 0, 0], [0.85, 0.72, 1.35]);
  const mouth = add(new THREE.SphereGeometry(0.07, 12, 8), hollow, head, [0, -0.04, 0.15], [0, 0, 0], [1.1, 0.7, 0.45]);
  const teeth = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    teeth.push(add(new THREE.ConeGeometry(0.011, 0.05, 4), tooth, head, [Math.cos(a) * 0.065, -0.04 + Math.sin(a) * 0.04, 0.17], [Math.PI / 2 - Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]));
  }

  // limbs: unit cylinders stretched between joints each frame
  const seg = (r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 1, 8), skin);
    root.add(m);
    return m;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const span = (m, a, b) => {
    const d = new THREE.Vector3().subVectors(b, a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  const limbs = [
    { s: -1, z: 0.32, front: true, off: 0 }, { s: 1, z: 0.32, front: true, off: Math.PI },
    { s: -1, z: -0.38, front: false, off: Math.PI }, { s: 1, z: -0.38, front: false, off: 0 },
  ].map((l) => ({ ...l, upper: seg(0.04), lower: seg(0.032), fingers: l.front ? [seg(0.008), seg(0.008), seg(0.008)] : [] }));

  let phase = 0, scare = 0, look = 0;
  const A = new THREE.Vector3(), K = new THREE.Vector3(), F = new THREE.Vector3(), tmp = new THREE.Vector3();
  // in a dark house the scare has to be lit from somewhere: the skin itself
  const calm = skin.emissive.clone(), lit = new THREE.Color(0xb0ab9e);

  return {
    root,
    head,
    // advance the crawl by how fast it moves
    move(dt, speed) { phase += dt * (1.5 + speed * 3.2); },
    twitch() {},
    setScare(v) {
      scare = v;
      skin.emissive.copy(calm).lerp(lit, v);
      head.scale.setScalar(1 + 0.35 * v);
      mouth.scale.set(1.1 + 0.25 * v, 0.7 + 0.5 * v, 0.45);
      teeth.forEach((t, i) => {
        const a = (i / 10) * Math.PI * 2;
        t.position.set(Math.cos(a) * 0.065 * (1 + 0.2 * v), -0.04 + Math.sin(a) * 0.04 * (1 + 0.5 * v), 0.17);
      });
    },
    update(dt, t, target, lookWeight, listening = 0) {
      look += (lookWeight - look) * (1 - Math.exp(-dt * 3));
      const stride = 0.22;
      // rear up for the scare
      body.rotation.x = -0.85 * scare;
      body.position.y = 0.62 + Math.sin(phase * 2) * 0.03 + 0.45 * scare;
      body.rotation.z = Math.sin(phase) * 0.06;
      // listening: sharp little head-cocks
      const cock = listening * Math.sign(Math.sin(t * 1.7)) * 0.35 * (Math.sin(t * 6.3) > 0.6 ? 1 : 0.6);
      let yaw = 0, pitch = 0;
      if (target && look > 0.001) {
        root.updateMatrixWorld(true);
        tmp.copy(target);
        body.worldToLocal(tmp);
        tmp.sub(head.position);
        yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.2, 1.2) * look;
        pitch = THREE.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.9, 0.9) * look;
      }
      head.rotation.set(pitch, yaw, cock, 'YXZ');
      root.updateMatrixWorld(true);
      for (const l of limbs) {
        const p = phase + l.off;
        const lift = Math.max(0, Math.cos(p)) * 0.12;
        A.set(l.s * (l.front ? 0.17 : 0.15), 0, l.z);
        A.applyEuler(body.rotation).add(body.position);
        F.set(l.s * 0.58, lift, l.z + (l.front ? 0.25 : -0.12) + Math.sin(p) * stride);
        if (l.front && scare > 0) F.lerp(tmp.set(l.s * 0.35, 1.35, 0.95), scare); // arms thrown up and out
        K.addVectors(A, F).multiplyScalar(0.5);
        K.x += l.s * 0.18;
        K.y = Math.max(A.y, F.y) + 0.38;
        span(l.upper, A, K);
        span(l.lower, K, F);
        l.fingers.forEach((f, i) => {
          tmp.set(F.x + l.s * (i - 1) * 0.06, F.y, F.z + 0.16 + (1 - Math.abs(i - 1)) * 0.04);
          span(f, F, tmp);
        });
      }
    },
  };
}
