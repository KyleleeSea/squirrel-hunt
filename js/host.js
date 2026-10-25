// Authoritative hide-and-seek game logic. Runs in the HOST's browser; the guest
// talks to it over a WebRTC data channel. Message protocol:
//   player -> host : join {name}, move {pos,yaw,anim}, tag
//   host -> player : welcome {id,...}, state {...}, teleport {pos,yaw}, event {name,...}, full

export const HIDE_TIME = 25;
export const SEEK_TIME = 90;
export const RESULT_TIME = 6;
export const TAG_RANGE = 1.6;
const SPAWNS = {
  hider:  { x: 0, y: 0, z: 0,  yaw: 0 },
  seeker: { x: 0, y: 0, z: 17, yaw: Math.PI },
};

export class GameHost {
  /** @param {(key:string, msg:object) => void} deliver sends a message to one player */
  constructor(deliver) {
    this.deliver = deliver;
    this.players = new Map(); // key -> player
    this.nextId = 1;
    this.game = { phase: 'lobby', timeLeft: 0, round: 0, lastResult: null };
    this.last = performance.now();
    this.acc = 0;
    this.timer = setInterval(() => this.tick(), 1000 / 60);
  }

  destroy() { clearInterval(this.timer); }

  addPlayer(key) {
    if (this.players.size >= 2) { this.deliver(key, { type: 'full' }); return null; }
    const id = this.nextId++;
    const p = { key, id, name: `Squirrel ${id}`, role: null, pos: { x: 0, y: 0, z: 0 }, yaw: 0, anim: 'idle', wins: 0, ready: false };
    this.players.set(key, p);
    this.deliver(key, { type: 'welcome', id, hideTime: HIDE_TIME, seekTime: SEEK_TIME });
    this.broadcast(this.snapshot());
    return p;
  }

  removePlayer(key) {
    const p = this.players.get(key);
    if (!p) return;
    this.players.delete(key);
    if (this.players.size < 2) this.toLobby();
    this.broadcast({ type: 'event', name: 'playerLeft', id: p.id });
    this.broadcast(this.snapshot());
  }

  handle(key, msg) {
    const p = this.players.get(key);
    if (!p || !msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'join':
        if (typeof msg.name === 'string' && msg.name.trim()) p.name = msg.name.trim().slice(0, 16);
        p.ready = true;
        this.broadcast(this.snapshot());
        break;
      case 'move':
        if (msg.pos && Number.isFinite(msg.pos.x) && Number.isFinite(msg.pos.y) && Number.isFinite(msg.pos.z)) {
          p.pos = { x: msg.pos.x, y: msg.pos.y, z: msg.pos.z };
        }
        if (Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
        if (typeof msg.anim === 'string') p.anim = msg.anim.slice(0, 12);
        break;
      case 'tag': {
        if (this.game.phase !== 'seek' || p.role !== 'seeker') break;
        const h = this.hider();
        if (!h) break;
        const dist = Math.hypot(h.pos.x - p.pos.x, h.pos.y - p.pos.y, h.pos.z - p.pos.z);
        if (dist <= TAG_RANGE) this.endRound('seeker', `${p.name} found ${h.name}!`);
        else this.deliver(key, { type: 'event', name: 'tagMiss' });
        break;
      }
    }
  }

  // ---- internals ---------------------------------------------------------
  broadcast(msg) { for (const p of this.players.values()) this.deliver(p.key, msg); }
  hider()  { return [...this.players.values()].find(p => p.role === 'hider'); }
  seeker() { return [...this.players.values()].find(p => p.role === 'seeker'); }

  snapshot() {
    const g = this.game;
    return {
      type: 'state', phase: g.phase, timeLeft: Math.ceil(g.timeLeft), round: g.round, lastResult: g.lastResult,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, role: p.role, pos: p.pos, yaw: p.yaw, anim: p.anim, wins: p.wins })),
    };
  }

  assignRoles(swap) {
    const list = [...this.players.values()];
    if (list.length < 2) return;
    if (swap && list[0].role) {
      for (const p of list) p.role = p.role === 'hider' ? 'seeker' : 'hider';
    } else {
      list[0].role = 'hider';
      list[1].role = 'seeker';
    }
    for (const p of list) {
      const s = SPAWNS[p.role];
      p.pos = { x: s.x, y: s.y, z: s.z };
      p.yaw = s.yaw;
      this.deliver(p.key, { type: 'teleport', pos: p.pos, yaw: p.yaw });
    }
  }

  startRound(swap) {
    this.game.round += 1;
    this.assignRoles(swap);
    this.game.phase = 'hide';
    this.game.timeLeft = HIDE_TIME;
    this.game.lastResult = null;
    this.broadcast({ type: 'event', name: 'roundStart', round: this.game.round });
    this.broadcast(this.snapshot());
  }

  endRound(winner, reason) {
    const w = winner === 'hider' ? this.hider() : this.seeker();
    if (w) w.wins += 1;
    this.game.phase = 'result';
    this.game.timeLeft = RESULT_TIME;
    this.game.lastResult = { winner, reason };
    this.broadcast({ type: 'event', name: 'roundEnd', winner, reason });
    this.broadcast(this.snapshot());
  }

  toLobby() {
    this.game.phase = 'lobby';
    this.game.timeLeft = 0;
    this.game.lastResult = null;
    for (const p of this.players.values()) p.role = null;
    this.broadcast(this.snapshot());
  }

  tick() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const g = this.game;

    if (g.phase !== 'lobby') {
      if (this.players.size < 2) { this.toLobby(); return; }
      g.timeLeft -= dt;
      if (g.timeLeft <= 0) {
        if (g.phase === 'hide') {
          g.phase = 'seek';
          g.timeLeft = SEEK_TIME;
          this.broadcast({ type: 'event', name: 'seekStart' });
        } else if (g.phase === 'seek') {
          this.endRound('hider', 'The seeker ran out of time!');
        } else if (g.phase === 'result') {
          this.startRound(true);
        }
      }
    } else if (this.players.size >= 2 && [...this.players.values()].every(p => p.ready)) {
      this.startRound(false);
    }

    this.acc += dt;
    if (this.acc >= 1 / 20) {
      this.acc = 0;
      this.broadcast(this.snapshot());
    }
  }
}
