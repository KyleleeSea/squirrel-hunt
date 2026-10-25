// Procedural low-poly squirrel with floppy Human: Fall Flat-style animation.
import * as THREE from 'three';

const PALETTE = {
  hider:  { fur: 0xcf6b3a, dark: 0xa8512b, belly: 0xf6dfbd },
  seeker: { fur: 0x8e8e9c, dark: 0x6d6d7c, belly: 0xe9e9ef },
  none:   { fur: 0xb5804f, dark: 0x8d5f38, belly: 0xf1dcbb },
};

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...extra });
}

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

export class Squirrel {
  constructor(name = 'Squirrel', role = null) {
    this.group = new THREE.Group();     // positioned/yawed by the controller
    this.root = new THREE.Group();      // bob + lean applied here
    this.group.add(this.root);

    this.furMat = std(PALETTE.none.fur);
    this.darkMat = std(PALETTE.none.dark);
    this.bellyMat = std(PALETTE.none.belly);
    this.inkMat = std(0x2b2320, { roughness: 0.4 });
    this.whiteMat = std(0xffffff, { roughness: 0.3 });

    this.time = Math.random() * 10;
    this.phase = 0;
    this.lean = new THREE.Vector2();
    this.smoothSpeed = 0;
    this.coverAmt = 0;
    this.climbAmt = 0;
    this.airAmt = 0;

    this.#build();
    this.setRole(role);
    this.setName(name);
  }

  #build() {
    const r = this.root;

    // body
    this.body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.26, 6, 14), this.furMat));
    this.body.position.y = 0.42;
    this.body.rotation.x = -0.18;
    r.add(this.body);

    const belly = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), this.bellyMat));
    belly.scale.set(1, 1.35, 0.7);
    belly.position.set(0, 0.4, 0.15);
    r.add(belly);

    // head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.76, 0.09);
    r.add(this.head);
    const skull = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 12), this.furMat));
    this.head.add(skull);
    const snout = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), this.bellyMat));
    snout.scale.set(1, 0.85, 1);
    snout.position.set(0, -0.05, 0.17);
    this.head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), this.inkMat);
    nose.position.set(0, -0.025, 0.265);
    this.head.add(nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), this.inkMat);
      eye.position.set(sx * 0.1, 0.05, 0.155);
      this.head.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), this.whiteMat);
      glint.position.set(sx * 0.112, 0.067, 0.188);
      this.head.add(glint);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), this.bellyMat);
      cheek.position.set(sx * 0.1, -0.06, 0.13);
      this.head.add(cheek);
      const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.15, 8), this.furMat));
      ear.position.set(sx * 0.12, 0.22, -0.01);
      ear.rotation.z = -sx * 0.25;
      this.head.add(ear);
      const earIn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), this.bellyMat);
      earIn.position.set(sx * 0.12, 0.21, 0.02);
      earIn.rotation.z = -sx * 0.25;
      this.head.add(earIn);
    }

    // arms (pivot at shoulder)
    this.arms = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.17, 0.56, 0.1);
      const geo = new THREE.CapsuleGeometry(0.05, 0.16, 4, 8);
      geo.translate(0, -0.12, 0);
      const arm = shadowed(new THREE.Mesh(geo, this.furMat));
      g.add(arm);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), this.darkMat);
      paw.position.y = -0.22;
      g.add(paw);
      g.userData.side = sx;
      r.add(g);
      this.arms.push(g);
    }

    // legs (pivot at hip)
    this.legs = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.13, 0.24, -0.02);
      const geo = new THREE.CapsuleGeometry(0.07, 0.12, 4, 8);
      geo.translate(0, -0.1, 0);
      const leg = shadowed(new THREE.Mesh(geo, this.furMat));
      g.add(leg);
      const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), this.darkMat));
      foot.position.set(0, -0.21, 0.06);
      g.add(foot);
      r.add(g);
      this.legs.push(g);
    }

    // tail: chain of joints curving up and over
    this.tailJoints = [];
    const radii = [0.11, 0.16, 0.2, 0.225, 0.215, 0.18, 0.12];
    let parent = new THREE.Group();
    parent.position.set(0, 0.2, -0.18);
    r.add(parent);
    this.tailBase = parent;
    for (let i = 0; i < radii.length; i++) {
      const j = new THREE.Group();
      j.userData.base = -1.05 + i * 0.44;
      j.rotation.x = j.userData.base;
      const seg = shadowed(new THREE.Mesh(new THREE.SphereGeometry(radii[i], 10, 8), i >= radii.length - 2 ? this.bellyMat : this.furMat));
      seg.position.y = 0.19;
      j.add(seg);
      parent.add(j);
      const next = new THREE.Group();
      next.position.y = 0.19;
      j.add(next);
      this.tailJoints.push(j);
      parent = next;
    }

    // name tag
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512; this.tagCanvas.height = 128;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthTest: false, transparent: true }));
    this.tag.scale.set(1.6, 0.4, 1);
    this.tag.position.y = 1.35;
    this.group.add(this.tag);
  }

  setRole(role) {
    this.role = role;
    const p = PALETTE[role] || PALETTE.none;
    this.furMat.color.setHex(p.fur);
    this.darkMat.color.setHex(p.dark);
    this.bellyMat.color.setHex(p.belly);
    this.#drawTag();
  }

  setName(name) {
    if (this.name === name) return;
    this.name = name;
    this.#drawTag();
  }

  #drawTag() {
    const ctx = this.tagCanvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    const label = `${this.name || ''}${this.role === 'hider' ? ' 🌰' : this.role === 'seeker' ? ' 🔍' : ''}`;
    ctx.font = '700 56px Fredoka, Nunito, sans-serif';
    const w = Math.min(500, ctx.measureText(label).width + 50);
    ctx.fillStyle = this.role === 'hider' ? 'rgba(217,112,74,0.9)' : this.role === 'seeker' ? 'rgba(120,120,135,0.9)' : 'rgba(255,247,234,0.9)';
    ctx.beginPath();
    ctx.roundRect(256 - w / 2, 20, w, 88, 44);
    ctx.fill();
    ctx.fillStyle = this.role ? '#fff7ea' : '#3b3340';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 66);
    this.tagTex.needsUpdate = true;
  }

  /**
   * @param {number} dt
   * @param {{speed:number, grounded:boolean, climbing:boolean, cover:boolean, accel:THREE.Vector2, vy:number}} s
   */
  update(dt, s) {
    this.time += dt;
    const t = this.time;
    const k = 1 - Math.exp(-dt * 10);

    this.smoothSpeed += (s.speed - this.smoothSpeed) * k;
    const run = Math.min(this.smoothSpeed / 6, 1.4);
    this.phase += dt * (3 + this.smoothSpeed * 2.2);

    this.coverAmt += ((s.cover ? 1 : 0) - this.coverAmt) * k;
    this.climbAmt += ((s.climbing ? 1 : 0) - this.climbAmt) * k;
    this.airAmt += ((!s.grounded && !s.climbing ? 1 : 0) - this.airAmt) * k;

    // lean into acceleration, with idle sway
    const targetLean = new THREE.Vector2(
      THREE.MathUtils.clamp(-s.accel.x * 0.035, -0.4, 0.4),
      THREE.MathUtils.clamp(s.accel.y * 0.035, -0.4, 0.4) + run * 0.18,
    );
    this.lean.lerp(targetLean, 1 - Math.exp(-dt * 7));
    this.root.rotation.z = this.lean.x + Math.sin(t * 1.3) * 0.025;
    this.root.rotation.x = this.lean.y + Math.sin(t * 1.7) * 0.02 + this.climbAmt * 0.35;
    const ground = s.grounded ? 1 : 0;
    this.root.position.y = Math.abs(Math.sin(this.phase)) * 0.07 * run * ground + Math.sin(t * 2.5) * 0.008;

    // body breathing
    const breath = 1 + Math.sin(t * 2.6) * 0.02;
    this.body.scale.set(breath, 1, breath);

    // head: look around when idle, nod with stride when running
    this.head.rotation.y = Math.sin(t * 0.7) * 0.25 * (1 - run) + Math.sin(this.phase * 0.5) * 0.08 * run;
    this.head.rotation.x = Math.sin(this.phase * 2) * 0.05 * run - this.climbAmt * 0.4 - this.coverAmt * 0.2;

    // legs
    const stride = Math.sin(this.phase);
    const legAmp = 0.95 * run * ground + 0.9 * this.climbAmt;
    this.legs[0].rotation.x = stride * legAmp + this.airAmt * 0.7 - this.climbAmt * 0.6;
    this.legs[1].rotation.x = -stride * legAmp + this.airAmt * 0.7 - this.climbAmt * 0.6;

    // arms: hang forward, swing with stride, reach up when climbing, cover eyes when covering
    for (const arm of this.arms) {
      const sx = arm.userData.side;
      const swing = (sx > 0 ? -stride : stride) * 0.55 * run * ground;
      let rx = -1.25 + swing - this.airAmt * 0.6;
      let rz = sx * 0.15;
      // climbing: alternate reaching
      const reach = Math.sin(this.phase + (sx > 0 ? 0 : Math.PI)) * 0.4;
      rx = THREE.MathUtils.lerp(rx, -2.7 + reach, this.climbAmt);
      rz = THREE.MathUtils.lerp(rz, sx * 0.5, this.climbAmt);
      // covering eyes
      rx = THREE.MathUtils.lerp(rx, -2.55, this.coverAmt);
      rz = THREE.MathUtils.lerp(rz, -sx * 0.55, this.coverAmt);
      arm.rotation.x = rx;
      arm.rotation.z = rz;
    }

    // tail: wave, streams back when running, droops when climbing/airborne
    for (let i = 0; i < this.tailJoints.length; i++) {
      const j = this.tailJoints[i];
      const wave = Math.sin(t * 3.4 - i * 0.75) * 0.13 * (1 - run * 0.4);
      const stream = -run * 0.22 * (i < 4 ? 1 : 0.4);
      const drop = -(this.climbAmt + this.airAmt) * 0.25;
      j.rotation.x = j.userData.base + wave + stream + drop;
      j.rotation.z = Math.sin(t * 2.1 - i * 0.5) * 0.06;
    }
    this.tailBase.rotation.z = Math.sin(t * 1.1) * 0.08;
  }
}
