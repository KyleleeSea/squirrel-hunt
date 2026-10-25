// Local player controller: AABB physics against world colliders, climbing, jumping.
import * as THREE from 'three';

const GRAVITY = 24;
const JUMP = 8.6;
const CLIMB_SPEED = 3.4;
const STEP_HEIGHT = 0.5;

export class LocalPlayer {
  constructor(squirrel, colliders) {
    this.sq = squirrel;
    this.colliders = colliders;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.prevVelH = new THREE.Vector2();
    this.yaw = 0;
    this.grounded = true;
    this.climbing = false;
    this.climbContact = null; // { normal: Vector3 }
    this.frozen = false;
    this.half = 0.28;
    this.height = 0.62;
    this.baseSpeed = 6.2;
    this.cover = false;
    this.anim = 'idle';
    this.accelLocal = new THREE.Vector2();
    this._wish = new THREE.Vector3();
    this._nudge = new THREE.Vector3();
    this.mantleLock = 0;   // brief input lock after pulling up onto a ledge
    this.lastClimb = null; // last climbable box we were on
  }

  teleport(pos, yaw) {
    this.pos.set(pos.x, pos.y, pos.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.climbing = false;
    this.climbContact = null;
    this.sq.group.position.copy(this.pos);
    this.sq.group.rotation.y = this.yaw;
  }

  overlaps(c) {
    const p = this.pos, h = this.half;
    return p.x - h < c.max.x && p.x + h > c.min.x &&
           p.y < c.max.y && p.y + this.height > c.min.y &&
           p.z - h < c.max.z && p.z + h > c.min.z;
  }

  overlapsAny() {
    for (const c of this.colliders) if (this.overlaps(c)) return true;
    return false;
  }

  moveAxis(axis, delta, wasGrounded) {
    if (delta === 0) return;
    this.pos[axis] += delta;
    for (const c of this.colliders) {
      if (!this.overlaps(c)) continue;
      if (axis === 'y') {
        if (delta < 0) { this.pos.y = c.max.y; this.grounded = true; }
        else { this.pos.y = c.min.y - this.height; }
        this.vel.y = 0;
        continue;
      }
      // try stepping up onto low obstacles
      const rise = c.max.y - this.pos.y;
      if (wasGrounded && rise > 0 && rise <= STEP_HEIGHT) {
        const saved = this.pos.y;
        this.pos.y = c.max.y + 0.001;
        if (!this.overlapsAny()) { this.grounded = true; continue; }
        this.pos.y = saved;
      }
      const sign = delta > 0 ? 1 : -1;
      this.pos[axis] = sign > 0 ? c.min[axis] - this.half : c.max[axis] + this.half;
      if (c.climbable) {
        const n = new THREE.Vector3();
        n[axis] = -sign;
        this.climbContact = { normal: n, box: c };
      }
    }
  }

  /**
   * @param {number} dt
   * @param {{f:number,b:number,l:number,r:number,jump:boolean,sprint:boolean}} input
   * @param {THREE.Vector3} camForward horizontal unit vector
   * @param {THREE.Vector3} camRight horizontal unit vector
   */
  update(dt, input, camForward, camRight) {
    const wish = this._wish.set(0, 0, 0);
    this.mantleLock = Math.max(0, this.mantleLock - dt);
    if (!this.frozen && this.mantleLock <= 0) {
      wish.addScaledVector(camForward, input.f - input.b);
      wish.addScaledVector(camRight, input.r - input.l);
      if (wish.lengthSq() > 1) wish.normalize();
    }
    const jump = input.jump && !this.frozen;
    const maxSpeed = this.baseSpeed * (input.sprint && !this.frozen ? 1.45 : 1);

    // horizontal velocity
    const accel = this.grounded || this.climbing ? 42 : 14;
    const tvx = wish.x * maxSpeed, tvz = wish.z * maxSpeed;
    this.vel.x = approach(this.vel.x, tvx, accel * dt);
    this.vel.z = approach(this.vel.z, tvz, accel * dt);

    // climbing / gravity
    const nudge = this._nudge.set(0, 0, 0);
    if (this.climbContact) {
      const n = this.climbContact.normal;
      const into = -(wish.x * n.x + wish.z * n.z);
      if (jump) {
        this.climbing = false;
        this.vel.y = JUMP * 0.9;
        this.vel.x += n.x * 4.5;
        this.vel.z += n.z * 4.5;
        this.climbContact = null;
      } else if (into > 0.3) {
        this.climbing = true;
        this.vel.y = CLIMB_SPEED;
      } else if (into < -0.3) {
        this.climbing = true;
        this.vel.y = -CLIMB_SPEED;
      } else {
        this.climbing = true;
        this.vel.y = 0;
      }
      if (this.climbing) {
        // stay pressed to the wall: strip velocity pointing away from it
        const vn = this.vel.x * n.x + this.vel.z * n.z;
        if (vn > 0) { this.vel.x -= n.x * vn; this.vel.z -= n.z * vn; }
        nudge.set(-n.x * 0.04, 0, -n.z * 0.04);
      }
    } else {
      this.climbing = false;
      this.vel.y -= GRAVITY * dt;
      if (this.grounded && jump) this.vel.y = JUMP;
    }

    // integrate
    const wasGrounded = this.grounded;
    const wasClimbing = this.climbing;
    if (this.climbContact) this.lastClimb = this.climbContact;
    this.grounded = false;
    this.climbContact = null;
    this.moveAxis('x', this.vel.x * dt + nudge.x, wasGrounded);
    this.moveAxis('z', this.vel.z * dt + nudge.z, wasGrounded);
    this.moveAxis('y', this.vel.y * dt, wasGrounded);
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.grounded = true;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    if (this.grounded) this.climbing = false;

    // Mantle: we climbed past the top edge of a box — pull up and stand on it.
    if (wasClimbing && !this.climbContact && this.lastClimb && this.vel.y > 0) {
      const b = this.lastClimb.box, n = this.lastClimb.normal;
      if (this.pos.y >= b.max.y - 0.05) {
        this.pos.y = b.max.y;
        this.pos.x = THREE.MathUtils.clamp(this.pos.x - n.x * (this.half + 0.2), b.min.x + 0.05, b.max.x - 0.05);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z - n.z * (this.half + 0.2), b.min.z + 0.05, b.max.z - 0.05);
        this.vel.set(0, 0, 0);
        this.grounded = true;
        this.climbing = false;
        this.mantleLock = 0.45;
      }
    }
    if (!this.climbing) this.lastClimb = this.climbContact;

    // facing
    if (this.climbing && this.climbContact) {
      const n = this.climbContact.normal;
      this.yaw = Math.atan2(-n.x, -n.z);
    } else if (wish.lengthSq() > 0.001) {
      this.yaw = lerpAngle(this.yaw, Math.atan2(wish.x, wish.z), 1 - Math.exp(-dt * 11));
    }

    // acceleration in local space for leaning
    const ax = (this.vel.x - this.prevVelH.x) / Math.max(dt, 1e-4);
    const az = (this.vel.z - this.prevVelH.y) / Math.max(dt, 1e-4);
    this.prevVelH.set(this.vel.x, this.vel.z);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // local right = (c, -s), local forward = (s, c)
    this.accelLocal.set(ax * c - az * s, ax * s + az * c);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.anim = this.cover ? 'cover' : this.climbing ? 'climb' : !this.grounded ? 'jump' : speed > 0.5 ? 'run' : 'idle';

    this.sq.group.position.copy(this.pos);
    this.sq.group.rotation.y = this.yaw;
    this.sq.update(dt, {
      speed, grounded: this.grounded, climbing: this.climbing, cover: this.cover,
      accel: this.accelLocal, vy: this.vel.y,
    });
  }
}

function approach(v, target, maxDelta) {
  const d = target - v;
  if (Math.abs(d) <= maxDelta) return target;
  return v + Math.sign(d) * maxDelta;
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

/** Remote player with smoothing and animation inferred from motion. */
export class RemotePlayer {
  constructor(squirrel) {
    this.sq = squirrel;
    this.target = new THREE.Vector3();
    this.targetYaw = 0;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.anim = 'idle';
    this.prev = new THREE.Vector3();
    this.speed = 0;
    this.first = true;
    this.accel = new THREE.Vector2();
  }

  setTarget(p, yaw, anim) {
    this.target.set(p.x, p.y, p.z);
    this.targetYaw = yaw;
    this.anim = anim;
    if (this.first) { this.pos.copy(this.target); this.yaw = yaw; this.first = false; }
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    this.prev.copy(this.pos);
    this.pos.lerp(this.target, k);
    this.yaw = lerpAngle(this.yaw, this.targetYaw, k);
    const inst = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / Math.max(dt, 1e-4);
    this.speed += (inst - this.speed) * (1 - Math.exp(-dt * 8));
    this.sq.group.position.copy(this.pos);
    this.sq.group.rotation.y = this.yaw;
    this.sq.update(dt, {
      speed: this.speed,
      grounded: this.anim !== 'jump' && this.anim !== 'climb',
      climbing: this.anim === 'climb',
      cover: this.anim === 'cover',
      accel: this.accel,
      vy: 0,
    });
  }
}
