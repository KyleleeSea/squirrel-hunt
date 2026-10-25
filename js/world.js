// Builds the pastel backyard and its collision boxes.
import * as THREE from 'three';

export const colliders = [];    // physics boxes: { min, max, climbable }
export const camBlockers = [];  // boxes the camera must not sit behind
export const canopies = [];     // { box, mats } — leaves that fade when you are inside them

const materials = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra }));
  }
  return materials.get(key);
}

function mesh(geo, color, extra) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, color, extra) {
  return mesh(new THREE.BoxGeometry(w, h, d), color, extra);
}

/** Axis-aligned collider. (cx, cz) is the center, y0 the bottom. */
export function collider(cx, y0, cz, w, h, d, opts = {}) {
  const c = {
    min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2),
    max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2),
    climbable: !!opts.climbable,
  };
  if (!opts.cameraOnly) colliders.push(c);
  camBlockers.push(c);
  return c;
}

const clouds = [];

export function buildWorld(scene) {
  // ---- Sky, fog, lights --------------------------------------------------
  scene.background = new THREE.Color(0xbfe3f7);
  scene.fog = new THREE.Fog(0xbfe3f7, 50, 130);

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x7fb565, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
  sun.position.set(28, 48, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // ---- Ground ------------------------------------------------------------
  const ground = mesh(new THREE.PlaneGeometry(220, 220), 0x8fcb74);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);

  // mowing stripes for a Human: Fall Flat style flat-shaded lawn
  for (let i = -5; i <= 5; i++) {
    if (i % 2) continue;
    const stripe = mesh(new THREE.PlaneGeometry(5.6, 58), 0x86c26c);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(i * 5.6, 0.005, 0);
    stripe.castShadow = false;
    scene.add(stripe);
  }

  // dirt path from the house to the yard
  const path = mesh(new THREE.PlaneGeometry(2.4, 20), 0xd7b98e);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 8);
  path.castShadow = false;
  scene.add(path);

  // ---- House + patio ----------------------------------------------------
  addHouse(scene, 0, 25.5);
  const patio = box(16, 0.08, 6.5, 0xdcd3c8);
  patio.position.set(0, 0.04, 18.9);
  scene.add(patio);

  // crates by the house
  addCrate(scene, 10.5, 0, 19.5, 1.1);
  addCrate(scene, 11.8, 0, 19.3, 1.1);
  addCrate(scene, 10.6, 1.1, 19.4, 1.1);
  addCrate(scene, -11.5, 0, 20, 1.0);

  // ---- Fence -------------------------------------------------------------
  addFence(scene, 29);

  // ---- Trees -------------------------------------------------------------
  const trees = [
    [-20, -6, 1.1, 0], [-9, -22, 1.25, 1], [6, -24, 1.0, 2], [21, -20, 1.15, 3],
    [24, 4, 1.0, 1], [-24, 14, 1.2, 2], [-13, 2, 0.9, 3], [15, 9, 0.95, 0],
    [2, -11, 1.05, 1], [-22, -22, 0.9, 2], [24, -8, 0.9, 3],
  ];
  for (const [x, z, s, t] of trees) addTree(scene, x, z, s, t);

  // ---- Bushes (no collision — hide inside!) ------------------------------
  const bushes = [
    [-6, -17, 1.1], [10, -3, 0.9], [-17, -14, 1.0], [18, -14, 1.1], [-26, 0, 0.9], [26, 14, 1.0],
    [-4, 10, 0.8], [8, 12, 0.85], [-22, 24, 1.0], [23, 24, 1.0], [-14, -26, 0.9], [14, -26, 1.0],
    [26, -25, 0.9], [-27, -26, 0.9], [4, 2, 0.7], [-9, -8, 0.8],
  ];
  for (const [x, z, s] of bushes) addBush(scene, x, z, s);

  // ---- Props -------------------------------------------------------------
  addPicnicTable(scene, -15, 10);
  addLog(scene, 16, -6, 0.35);
  addDoghouse(scene, 19, 15);
  addFort(scene, 8, -16);
  addSandbox(scene, -18, -16);
  addBirdbath(scene, -6, 3);
  addRock(scene, 12, -22, 1.0);
  addRock(scene, -26, 8, 0.8);
  addRock(scene, 26, -1, 0.7);
  addRock(scene, -3, -27, 1.1);
  addFlowerBed(scene, -5, 21.5, 5);
  addFlowerBed(scene, 5, 21.5, 5);
  addFlowerBed(scene, -28, -10, 3, true);
  addFlowerBed(scene, 28, 22, 3, true);
  addAcorns(scene, 60);
  addClouds(scene);

  return { colliders, camBlockers, canopies };
}

export function updateWorld(dt) {
  for (const c of clouds) {
    c.position.x += dt * c.userData.speed;
    if (c.position.x > 120) c.position.x = -120;
  }
}

// -------------------------------------------------------------------------
function addHouse(scene, cx, cz) {
  const w = 14, d = 7, h = 4.4;
  const walls = box(w, h, d, 0xf5e2c6);
  walls.position.set(cx, h / 2, cz);
  scene.add(walls);

  // hip roof: 4-sided cone, rotated to align with the walls
  const roof = mesh(new THREE.ConeGeometry(Math.SQRT2 * (d / 2 + 0.7), 2.6, 4), 0xd9735f);
  roof.rotation.y = Math.PI / 4;
  roof.scale.x = (w / 2 + 0.7) / (d / 2 + 0.7);
  roof.position.set(cx, h + 1.3, cz);
  scene.add(roof);

  const eave = box(w + 1.2, 0.25, d + 1.2, 0xc6624f);
  eave.position.set(cx, h + 0.05, cz);
  scene.add(eave);

  const chimney = box(0.9, 1.8, 0.9, 0xb98a7b);
  chimney.position.set(cx + 4, h + 1.6, cz + 1);
  scene.add(chimney);

  const front = cz - d / 2;
  const door = box(1.3, 2.3, 0.14, 0x8c5a3c);
  door.position.set(cx, 1.15, front - 0.05);
  scene.add(door);
  const knob = mesh(new THREE.SphereGeometry(0.06, 8, 8), 0xf0c75e, { roughness: 0.4 });
  knob.position.set(cx + 0.45, 1.1, front - 0.14);
  scene.add(knob);

  for (const dx of [-4.2, 4.2]) {
    const frame = box(1.8, 1.6, 0.14, 0xffffff);
    frame.position.set(cx + dx, 2.3, front - 0.05);
    scene.add(frame);
    const glass = box(1.5, 1.3, 0.1, 0xbfe3f2, { roughness: 0.3 });
    glass.position.set(cx + dx, 2.3, front - 0.1);
    scene.add(glass);
    const sill = box(2.0, 0.14, 0.3, 0xffffff);
    sill.position.set(cx + dx, 1.45, front - 0.12);
    scene.add(sill);
  }

  collider(cx, 0, cz, w, h + 2.6, d);
}

function addCrate(scene, x, y, z, s) {
  const c = box(s, s, s, 0xdfae6e);
  c.position.set(x, y + s / 2, z);
  c.rotation.y = (Math.random() - 0.5) * 0.15;
  scene.add(c);
  const band = box(s + 0.02, s * 0.18, s + 0.02, 0xc08f55);
  band.position.set(x, y + s / 2, z);
  band.rotation.y = c.rotation.y;
  scene.add(band);
  collider(x, y, z, s, s, s);
}

function addFence(scene, half) {
  const picket = new THREE.BoxGeometry(0.14, 1.15, 0.06);
  const picketMat = mat(0xf4e6cf);
  const perSide = Math.floor((half * 2) / 0.4);
  const inst = new THREE.InstancedMesh(picket, picketMat, perSide * 4);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  let i = 0;
  for (let k = 0; k < perSide; k++) {
    const t = -half + 0.2 + k * 0.4;
    m.compose(new THREE.Vector3(t, 0.6, -half), q.identity(), new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i++, m);
    m.compose(new THREE.Vector3(t, 0.6, half), q.identity(), new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i++, m);
    m.compose(new THREE.Vector3(-half, 0.6, t), rotY, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i++, m);
    m.compose(new THREE.Vector3(half, 0.6, t), rotY, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i++, m);
  }
  scene.add(inst);

  for (const y of [0.45, 0.95]) {
    for (const side of [-1, 1]) {
      const rz = box(half * 2 + 0.2, 0.1, 0.08, 0xe9d7b8);
      rz.position.set(0, y, side * (half + 0.06));
      scene.add(rz);
      const rx = box(0.08, 0.1, half * 2 + 0.2, 0xe9d7b8);
      rx.position.set(side * (half + 0.06), y, 0);
      scene.add(rx);
    }
  }
  // tall invisible walls keep squirrels in the yard
  collider(0, 0, -half, half * 2 + 1, 8, 0.4);
  collider(0, 0, half, half * 2 + 1, 8, 0.4);
  collider(-half, 0, 0, 0.4, 8, half * 2 + 1);
  collider(half, 0, 0, 0.4, 8, half * 2 + 1);
}

function addTree(scene, x, z, s, tint) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkH = 3.6 * s;
  const trunk = mesh(new THREE.CylinderGeometry(0.36 * s, 0.5 * s, trunkH + 1.6 * s, 10), 0xa0714a);
  trunk.position.y = (trunkH + 1.6 * s) / 2;
  g.add(trunk);
  const greens = [0x7dbd63, 0x8fc96e, 0x6cae58, 0x9ed47f];
  const leafMat = mat(greens[tint % greens.length]).clone();
  const blobs = [
    [0, trunkH + 1.2, 0, 1.8],
    [1.0, trunkH + 0.6, 0.5, 1.25],
    [-0.9, trunkH + 0.7, -0.6, 1.3],
    [1.0, trunkH + 2.0, -0.9, 1.1],
    [-0.4, trunkH + 0.9, 1.0, 1.1],
  ];
  for (const [bx, by, bz, r] of blobs) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * s, 14, 10), leafMat);
    b.castShadow = true;
    b.receiveShadow = true;
    b.position.set(bx * s, by, bz * s);
    g.add(b);
  }
  scene.add(g);
  // Climbable trunk; its top sits inside the canopy so a squirrel up there is mostly hidden
  // (only the ears poke out of the leaves).
  collider(x, 0, z, 0.95 * s, trunkH + 2.2 * s, 0.95 * s, { climbable: true });
  canopies.push({
    box: { min: new THREE.Vector3(x - 2.6 * s, trunkH - 0.4 * s, z - 2.6 * s), max: new THREE.Vector3(x + 2.6 * s, trunkH + 3.4 * s, z + 2.6 * s) },
    mats: [leafMat],
  });
}

function addBush(scene, x, z, s) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const greens = [0x6fb060, 0x7cbd68, 0x65a456];
  const blobs = [[0, 0.7, 0, 1.0], [0.7, 0.5, 0.3, 0.75], [-0.6, 0.55, 0.4, 0.7], [0.1, 0.5, -0.7, 0.72], [-0.3, 1.1, -0.1, 0.65]];
  blobs.forEach(([bx, by, bz, r], i) => {
    const b = mesh(new THREE.SphereGeometry(r * s, 12, 9), greens[i % greens.length]);
    b.position.set(bx * s, by * s, bz * s);
    g.add(b);
  });
  // a few berries
  for (let i = 0; i < 5; i++) {
    const berry = mesh(new THREE.SphereGeometry(0.07, 6, 6), 0xe05a6a, { roughness: 0.5 });
    const a = Math.random() * Math.PI * 2;
    berry.position.set(Math.cos(a) * 0.9 * s, 0.6 * s + Math.random() * 0.6, Math.sin(a) * 0.9 * s);
    g.add(berry);
  }
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
}

function addPicnicTable(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const top = box(2.4, 0.08, 1.0, 0xd9a066);
  top.position.y = 0.76;
  g.add(top);
  for (const sx of [-1, 1]) {
    const leg = box(0.1, 0.72, 0.9, 0xc58e58);
    leg.position.set(sx * 1.0, 0.36, 0);
    leg.rotation.x = 0.0;
    g.add(leg);
    const bench = box(2.4, 0.06, 0.36, 0xd9a066);
    bench.position.set(0, 0.44, sx * 0.78);
    g.add(bench);
    for (const bx of [-1, 1]) {
      const bl = box(0.08, 0.42, 0.08, 0xc58e58);
      bl.position.set(bx * 1.0, 0.21, sx * 0.78);
      g.add(bl);
    }
  }
  scene.add(g);
  collider(x, 0.72, z, 2.4, 0.08, 1.0);
  collider(x, 0.35, z - 0.78, 2.4, 0.12, 0.36);
  collider(x, 0.35, z + 0.78, 2.4, 0.12, 0.36);
}

function addLog(scene, x, z, yaw) {
  const R = 1.0, L = 4.4;
  const g = new THREE.Group();
  g.position.set(x, R - 0.15, z);
  g.rotation.y = yaw;
  const outer = mesh(new THREE.CylinderGeometry(R, R, L, 18, 1, true), 0x9a6b45);
  outer.rotation.z = Math.PI / 2;
  g.add(outer);
  const inner = mesh(new THREE.CylinderGeometry(R - 0.14, R - 0.14, L, 18, 1, true), 0x5e4030, { side: THREE.BackSide });
  inner.rotation.z = Math.PI / 2;
  inner.castShadow = false;
  g.add(inner);
  for (const sx of [-1, 1]) {
    const ring = mesh(new THREE.RingGeometry(R - 0.14, R, 18), 0xc9a06c, { side: THREE.DoubleSide });
    ring.rotation.y = sx * Math.PI / 2;
    ring.position.x = sx * L / 2;
    g.add(ring);
  }
  // a bit of moss
  const moss = mesh(new THREE.SphereGeometry(0.5, 10, 8), 0x7dbd63);
  moss.position.set(0.8, 0.7, 0.3);
  moss.scale.set(1, 0.4, 1);
  g.add(moss);
  scene.add(g);

  // Colliders ignore the slight yaw (log stays walk-through-able along x)
  collider(x, 0, z - 0.85, L, 1.7, 0.4);
  collider(x, 0, z + 0.85, L, 1.7, 0.4);
  collider(x, 1.55, z, L, 0.5, 2.0);
}

function addDoghouse(scene, x, z) {
  const w = 1.9, h = 1.35, d = 1.9;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const back = box(w, h, 0.1, 0xe9b87a); back.position.set(0, h / 2, d / 2); g.add(back);
  for (const sx of [-1, 1]) {
    const side = box(0.1, h, d, 0xe9b87a); side.position.set(sx * w / 2, h / 2, 0); g.add(side);
  }
  const floor = box(w, 0.06, d, 0xc89a62); floor.position.y = 0.03; g.add(floor);
  const roof = mesh(new THREE.ConeGeometry(Math.SQRT2 * (d / 2 + 0.3), 0.9, 4), 0xd9735f);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 0.45;
  g.add(roof);
  const lintel = box(w, 0.35, 0.1, 0xe9b87a); lintel.position.set(0, h - 0.17, -d / 2); g.add(lintel);
  const bowl = mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.15, 12), 0x6fa8dc); bowl.position.set(-1.5, 0.08, -0.6); g.add(bowl);
  scene.add(g);
  collider(x, 0, z + d / 2, w, h + 0.9, 0.1);
  collider(x - w / 2, 0, z, 0.1, h + 0.9, d);
  collider(x + w / 2, 0, z, 0.1, h + 0.9, d);
  collider(x, h, z, w + 0.6, 0.9, d + 0.6);
}

function addFort(scene, x, z) {
  // A little squirrel fort: platform on posts with a ladder you can climb.
  const pw = 2.4, ph = 1.7;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.16, 3.4, 0.16, 0xc58e58);
    post.position.set(sx * (pw / 2 - 0.1), 1.7, sz * (pw / 2 - 0.1));
    g.add(post);
  }
  const deck = box(pw, 0.12, pw, 0xd9a066); deck.position.y = ph; g.add(deck);
  const roof = mesh(new THREE.ConeGeometry(Math.SQRT2 * (pw / 2 + 0.3), 1.0, 4), 0x8fb9d9);
  roof.rotation.y = Math.PI / 4; roof.position.y = 3.9; g.add(roof);
  // railing on three sides
  for (const [rx, rz, rw, rd] of [[0, pw / 2, pw, 0.08], [-pw / 2, 0, 0.08, pw], [pw / 2, 0, 0.08, pw]]) {
    const rail = box(rw, 0.08, rd, 0xc58e58); rail.position.set(rx, ph + 0.55, rz); g.add(rail);
  }
  // ladder on the -z side
  const ladder = new THREE.Group();
  ladder.position.set(0, 0, -pw / 2 - 0.12);
  for (const sx of [-1, 1]) { const r = box(0.08, ph, 0.08, 0xc58e58); r.position.set(sx * 0.3, ph / 2, 0); ladder.add(r); }
  for (let i = 1; i <= 4; i++) { const rung = box(0.7, 0.06, 0.06, 0xd9a066); rung.position.set(0, i * ph / 5, 0); ladder.add(rung); }
  g.add(ladder);
  scene.add(g);

  collider(x, ph - 0.12, z, pw, 0.12, pw);                       // deck
  collider(x, 0, z - pw / 2 - 0.12, 0.8, ph - 0.12, 0.2, { climbable: true }); // ladder
  collider(x, 3.4, z, pw + 0.6, 1.0, pw + 0.6, { cameraOnly: true });   // roof
}

function addSandbox(scene, x, z) {
  const s = 3.2;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const sand = mesh(new THREE.BoxGeometry(s, 0.2, s), 0xf0dcae); sand.position.y = 0.1; g.add(sand);
  for (const [rx, rz, w, d] of [[0, s / 2, s + 0.2, 0.2], [0, -s / 2, s + 0.2, 0.2], [s / 2, 0, 0.2, s], [-s / 2, 0, 0.2, s]]) {
    const edge = box(w, 0.32, d, 0xd9a066); edge.position.set(rx, 0.16, rz); g.add(edge);
  }
  const bucket = mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 10), 0xf07a5a); bucket.position.set(0.6, 0.35, -0.4); g.add(bucket);
  const ball = mesh(new THREE.SphereGeometry(0.3, 12, 10), 0x6fa8dc, { roughness: 0.5 }); ball.position.set(-0.7, 0.5, 0.5); g.add(ball);
  scene.add(g);
  collider(x, 0, z + s / 2, s + 0.2, 0.32, 0.2);
  collider(x, 0, z - s / 2, s + 0.2, 0.32, 0.2);
  collider(x + s / 2, 0, z, 0.2, 0.32, s);
  collider(x - s / 2, 0, z, 0.2, 0.32, s);
  collider(x, 0, z, s, 0.2, s);
}

function addBirdbath(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const stem = mesh(new THREE.CylinderGeometry(0.12, 0.25, 0.9, 10), 0xcfcbc4); stem.position.y = 0.45; g.add(stem);
  const bowl = mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.22, 14), 0xcfcbc4); bowl.position.y = 1.0; g.add(bowl);
  const water = mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 14), 0x8fd0ec, { roughness: 0.2 }); water.position.y = 1.1; g.add(water);
  scene.add(g);
  collider(x, 0, z, 0.6, 1.1, 0.6);
}

function addRock(scene, x, z, s) {
  const r = mesh(new THREE.DodecahedronGeometry(s, 0), 0xa3a39c, { flatShading: true });
  r.position.set(x, s * 0.55, z);
  r.scale.set(1.2, 0.75, 1);
  r.rotation.set(Math.random(), Math.random(), Math.random());
  scene.add(r);
  collider(x, 0, z, s * 1.9, s * 1.1, s * 1.6);
}

function addFlowerBed(scene, x, z, len, alongZ = false) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  if (alongZ) g.rotation.y = Math.PI / 2;
  const soil = mesh(new THREE.BoxGeometry(len, 0.18, 1.0), 0x7a5236); soil.position.y = 0.09; g.add(soil);
  const colors = [0xf26d8a, 0xf7c24e, 0xfa8a5f, 0xb48ee6, 0xffffff];
  for (let i = 0; i < len * 3; i++) {
    const fx = -len / 2 + 0.2 + Math.random() * (len - 0.4);
    const fz = -0.35 + Math.random() * 0.7;
    const stem = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), 0x5ea24f); stem.position.set(fx, 0.35, fz); g.add(stem);
    const head = mesh(new THREE.SphereGeometry(0.1, 8, 6), colors[i % colors.length], { roughness: 0.6 }); head.position.set(fx, 0.55, fz); g.add(head);
  }
  scene.add(g);
}

function addAcorns(scene, n) {
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  const nut = new THREE.InstancedMesh(geo, mat(0xa86a3b), n);
  const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), mat(0x6b4a30), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 54, z = (Math.random() - 0.5) * 54;
    m.makeTranslation(x, 0.08, z); nut.setMatrixAt(i, m);
    m.makeTranslation(x, 0.17, z); cap.setMatrixAt(i, m);
  }
  nut.castShadow = cap.castShadow = true;
  scene.add(nut, cap);
}

function addClouds(scene) {
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const r = 2.5 + Math.random() * 2.5;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(0xffffff, { roughness: 1, fog: false }));
      puff.position.set((k - n / 2) * r * 1.1, Math.random() * 1.2, (Math.random() - 0.5) * 2);
      g.add(puff);
    }
    g.position.set((Math.random() - 0.5) * 200, 30 + Math.random() * 12, -40 + Math.random() * 120 - 40);
    g.userData.speed = 0.6 + Math.random() * 0.8;
    clouds.push(g);
    scene.add(g);
  }
}
