import * as THREE from 'three';
import { buildWorld, updateWorld } from './world.js';
import { Squirrel } from './squirrel.js';
import { LocalPlayer, RemotePlayer } from './player.js';
import { P2P, randomCode } from './net.js';
import { sfx } from './audio.js';

// ---- Renderer / scene ----------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
const { colliders, camBlockers, canopies } = buildWorld(scene);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- UI refs -------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), role: $('role-badge'), timer: $('timer'), score: $('score'), phase: $('phase-label'),
  center: $('center-msg'), sub: $('sub-msg'), hint: $('hint'), danger: $('danger'), crosshair: $('crosshair'),
  sense: $('sense'), senseArrow: $('sense-arrow'),
  blindfold: $('blindfold'), blindCount: $('blind-count'),
  lobby: $('lobby'), joinForm: $('join-form'), lobbyStatus: $('lobby-status'), statusText: $('status-text'),
  name: $('name'), code: $('code'), join: $('join'), host: $('host'), formError: $('form-error'),
  roomInfo: $('room-info'), roomCode: $('room-code'), shareUrl: $('share-url'), copy: $('copy'),
};

let msgTimer = 0;
function banner(text, sub = '', secs = 3) {
  ui.center.textContent = text;
  ui.sub.textContent = sub;
  ui.center.classList.add('show');
  ui.sub.classList.toggle('show', !!sub);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { ui.center.classList.remove('show'); ui.sub.classList.remove('show'); }, secs * 1000);
}

// ---- Input ---------------------------------------------------------------
const keys = new Set();
let jumpQueued = false;
let tagQueued = false;
addEventListener('keydown', (e) => {
  if (e.target === ui.name) return;
  keys.add(e.code);
  if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
  if (e.code === 'KeyE') tagQueued = true;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const cam = { theta: Math.PI, pitch: 0.35, dist: 5.5, curDist: 5.5 };
canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  else tagQueued = true;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  cam.theta -= e.movementX * 0.0028;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.0028, -0.15, 1.25);
});
addEventListener('wheel', (e) => {
  cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.004, 2.5, 9);
}, { passive: true });

// ---- Players -------------------------------------------------------------
const mySquirrel = new Squirrel('You');
mySquirrel.tag.visible = false;
scene.add(mySquirrel.group);
const me = new LocalPlayer(mySquirrel, colliders);
me.frozen = true;

/** @type {Map<number, RemotePlayer>} */
const remotes = new Map();

const state = {
  myId: null, phase: 'lobby', timeLeft: 0, round: 0, role: null, wins: 0, hideTime: 25, seekTime: 90,
  players: [], joined: false, lastTick: -1, hiderPos: null, seekerPos: null, otherName: '',
};

// ---- Networking (peer-to-peer) -------------------------------------------
const net = new P2P({
  onMessage,
  onStatus(text, kind) {
    ui.statusText.textContent = text;
    if (kind === 'closed') {
      ui.lobby.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      ui.blindfold.classList.add('hidden');
      ui.lobbyStatus.classList.remove('hidden');
      ui.joinForm.classList.add('hidden');
      ui.roomInfo.classList.add('hidden');
      document.querySelector('.spinner')?.classList.add('hidden');
    }
  },
});

function onMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      state.myId = msg.id;
      state.hideTime = msg.hideTime;
      state.seekTime = msg.seekTime;
      break;
    case 'full':
      ui.statusText.textContent = 'The yard is full — only two squirrels fit!';
      ui.lobbyStatus.classList.remove('hidden');
      ui.joinForm.classList.add('hidden');
      break;
    case 'teleport':
      me.teleport(msg.pos, msg.yaw);
      cam.theta = msg.yaw + Math.PI;
      cam.pitch = 0.35;
      break;
    case 'state':
      applyState(msg);
      break;
    case 'event':
      onEvent(msg);
      break;
  }
}

function applyState(s) {
  const prevPhase = state.phase;
  state.phase = s.phase;
  state.timeLeft = s.timeLeft;
  state.round = s.round;
  state.players = s.players;

  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    if (p.id === state.myId) {
      if (state.role !== p.role) { state.role = p.role; mySquirrel.setRole(p.role); }
      state.wins = p.wins;
      continue;
    }
    let r = remotes.get(p.id);
    if (!r) {
      const sq = new Squirrel(p.name, p.role);
      scene.add(sq.group);
      r = new RemotePlayer(sq);
      remotes.set(p.id, r);
    }
    r.sq.setName(p.name);
    if (r.sq.role !== p.role) r.sq.setRole(p.role);
    r.setTarget(p.pos, p.yaw, p.anim);
    r.wins = p.wins;
    state.otherName = p.name;
  }
  for (const [id, r] of remotes) {
    if (!seen.has(id)) { scene.remove(r.sq.group); remotes.delete(id); }
  }

  if (prevPhase !== s.phase) onPhaseChange(prevPhase, s.phase, s);
  updateHud();
}

function onPhaseChange(prev, phase, s) {
  const amHider = state.role === 'hider';
  ui.blindfold.classList.add('hidden');
  ui.sense.classList.remove('show');
  switch (phase) {
    case 'lobby':
      ui.lobby.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      if (state.joined) {
        ui.joinForm.classList.add('hidden');
        ui.lobbyStatus.classList.remove('hidden');
        ui.statusText.textContent = prev === 'lobby' ? 'Waiting for another squirrel…' : 'The other squirrel left. Waiting for a new one…';
      }
      break;
    case 'hide':
      ui.lobby.classList.add('hidden');
      ui.hud.classList.remove('hidden');
      if (amHider) {
        banner('You\'re the HIDER! 🌰', 'Quick, find a hiding spot before the seeker opens their eyes!', 4);
        sfx.chirp();
      } else {
        ui.blindfold.classList.remove('hidden');
        sfx.thump();
      }
      break;
    case 'seek':
      if (amHider) {
        banner('The seeker is coming! 👀', 'Stay still… or sneak to a better spot.', 3.5);
      } else {
        banner('GO FIND THAT SQUIRREL! 🔍', `Get close and press E to catch them. ${state.seekTime}s on the clock.`, 3.5);
      }
      sfx.whistle();
      break;
    case 'result': {
      const r = s.lastResult;
      if (!r) break;
      const iWon = (r.winner === state.role);
      banner(r.winner === 'seeker' ? 'FOUND! 🐿️' : 'HIDER WINS! 🌰', r.reason + (iWon ? '  You win this round!' : ''), 5.5);
      iWon ? sfx.win() : sfx.found();
      break;
    }
  }
}

function onEvent(e) {
  switch (e.name) {
    case 'tagMiss': sfx.miss(); break;
    case 'roundStart': break;
  }
}

// ---- Lobby: host or join -------------------------------------------------
function myName() {
  return ui.name.value.trim() || `Squirrel ${Math.floor(Math.random() * 90 + 10)}`;
}

function showError(text) {
  ui.formError.textContent = text;
  ui.formError.classList.toggle('hidden', !text);
  ui.host.disabled = ui.join.disabled = false;
}

function enterYard() {
  const name = myName();
  try { localStorage.setItem('squirrelName', name); } catch {}
  mySquirrel.setName(name);
  net.send({ type: 'join', name });
  state.joined = true;
}

async function hostGame() {
  showError('');
  ui.host.disabled = ui.join.disabled = true;
  ui.statusText.textContent = 'Opening the yard…';
  ui.joinForm.classList.add('hidden');
  ui.lobbyStatus.classList.remove('hidden');
  sfx.unlock();
  try {
    const code = await net.host(randomCode());
    const link = new URL(location.href);
    link.search = `?room=${code}`;
    ui.roomCode.textContent = code;
    ui.shareUrl.textContent = link.toString();
    ui.roomInfo.classList.remove('hidden');
    ui.statusText.textContent = 'Waiting for another squirrel to join…';
    enterYard();
  } catch (err) {
    ui.lobbyStatus.classList.add('hidden');
    ui.joinForm.classList.remove('hidden');
    showError(err.message);
  }
}

async function joinGame() {
  const code = ui.code.value.trim().toUpperCase();
  if (code.length !== 4) { showError('Enter the 4-letter room code from the host.'); ui.code.focus(); return; }
  showError('');
  ui.host.disabled = ui.join.disabled = true;
  ui.statusText.textContent = `Sneaking into room ${code}…`;
  ui.joinForm.classList.add('hidden');
  ui.lobbyStatus.classList.remove('hidden');
  sfx.unlock();
  try {
    await net.join(code);
    ui.statusText.textContent = 'Connected! Starting…';
    enterYard();
  } catch (err) {
    ui.lobbyStatus.classList.add('hidden');
    ui.joinForm.classList.remove('hidden');
    showError(err.message);
  }
}

ui.host.addEventListener('click', hostGame);
ui.join.addEventListener('click', joinGame);
ui.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
ui.code.addEventListener('input', () => { ui.code.value = ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
ui.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') (ui.code.value ? joinGame() : hostGame()); });
ui.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ui.shareUrl.textContent); ui.copy.textContent = 'Copied!'; }
  catch { ui.copy.textContent = 'Select & copy'; }
  setTimeout(() => (ui.copy.textContent = 'Copy'), 1500);
});
{
  try { const saved = localStorage.getItem('squirrelName'); if (saved) ui.name.value = saved; } catch {}
  const room = new URLSearchParams(location.search).get('room');
  if (room) { ui.code.value = room.toUpperCase().slice(0, 4); ui.name.focus(); }
  else ui.name.focus();
}

// ---- HUD -----------------------------------------------------------------
function fmt(sec) {
  sec = Math.max(0, sec | 0);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function updateHud() {
  const amHider = state.role === 'hider';
  ui.role.textContent = amHider ? '🌰 HIDER' : state.role === 'seeker' ? '🔍 SEEKER' : '—';
  ui.role.className = 'pill ' + (state.role || '');
  ui.timer.textContent = fmt(state.timeLeft);
  ui.timer.classList.toggle('urgent', state.phase === 'seek' && state.timeLeft <= 10);
  const other = [...remotes.values()][0];
  ui.score.textContent = `${mySquirrel.name} ${state.wins} · ${other?.wins ?? 0} ${state.otherName || '…'}`;
  ui.phase.textContent = state.phase === 'hide' ? `Round ${state.round} — hiding time` : state.phase === 'seek' ? `Round ${state.round} — seeking!` : state.phase === 'result' ? 'Next round soon…' : '';
  ui.blindCount.textContent = state.timeLeft;
  ui.crosshair.className = (state.role === 'seeker' && state.phase === 'seek') ? 'seeker' : '';
  if (state.phase === 'hide' && state.timeLeft <= 5 && state.timeLeft !== state.lastTick) sfx.tick();
  state.lastTick = state.timeLeft;
}

// ---- Camera with occlusion -----------------------------------------------
const camTarget = new THREE.Vector3();
const camDir = new THREE.Vector3();
const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();

function rayBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < b.min[a] || o[a] > b.max[a]) return Infinity;
      continue;
    }
    let t1 = (b.min[a] - o[a]) / d[a], t2 = (b.max[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

function updateCamera(dt) {
  camTarget.copy(me.pos).add(new THREE.Vector3(0, 0.75, 0));
  const cp = Math.cos(cam.pitch);
  camDir.set(Math.sin(cam.theta) * cp, Math.sin(cam.pitch), Math.cos(cam.theta) * cp);
  let dist = cam.dist;
  for (const b of camBlockers) {
    const t = rayBox(camTarget, camDir, b);
    if (t < dist) dist = Math.max(0.6, t - 0.3);
  }
  // don't go under the lawn
  if (camTarget.y + camDir.y * dist < 0.25) dist = Math.max(0.6, (0.25 - camTarget.y) / camDir.y);
  cam.curDist += (dist - cam.curDist) * (dist < cam.curDist ? 1 : 1 - Math.exp(-dt * 6));
  camera.position.copy(camTarget).addScaledVector(camDir, cam.curDist);
  camera.lookAt(camTarget);
  camForward.set(-Math.sin(cam.theta), 0, -Math.cos(cam.theta));
  camRight.set(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
  mySquirrel.root.visible = cam.curDist > 0.9;

  // fade the leaves of any tree the player or camera is inside, so you can see yourself hide
  for (const c of canopies) {
    const inside = pointInBox(camTarget, c.box) || pointInBox(camera.position, c.box);
    for (const m of c.mats) {
      const target = inside ? 0.2 : 1;
      m.opacity += (target - m.opacity) * (1 - Math.exp(-dt * 8));
      m.transparent = m.opacity < 0.995;
      m.depthWrite = !m.transparent;
    }
  }
}

function pointInBox(p, b) {
  return p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;
}

// ---- Game loop -----------------------------------------------------------
let last = performance.now();
let netAcc = 0;
let heartbeat = 0;
let prevGrounded = true;
const input = { f: 0, b: 0, l: 0, r: 0, jump: false, sprint: false };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const amHider = state.role === 'hider';
  const amSeeker = state.role === 'seeker';
  me.frozen = !state.joined || state.phase === 'lobby' || state.phase === 'result' || (state.phase === 'hide' && amSeeker);
  me.cover = state.phase === 'hide' && amSeeker;
  me.baseSpeed = amSeeker ? 6.6 : 6.2;

  input.f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  input.b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  input.l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
  input.r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.jump = jumpQueued;
  jumpQueued = false;

  updateCamera(0); // forward vectors for this frame's input
  me.update(dt, input, camForward, camRight);
  if (input.jump && prevGrounded && !me.frozen) sfx.jump();
  prevGrounded = me.grounded;
  updateCamera(dt);

  for (const r of remotes.values()) r.update(dt);
  updateWorld(dt);

  // tag attempt
  if (tagQueued) {
    tagQueued = false;
    if (amSeeker && state.phase === 'seek') net.send({ type: 'tag' });
  }

  // proximity cues
  const other = [...remotes.values()][0];
  let near = Infinity;
  if (other && state.phase === 'seek') near = me.pos.distanceTo(other.pos);
  if (amHider && state.phase === 'seek') {
    const intensity = THREE.MathUtils.clamp(1 - near / 12, 0, 0.9);
    ui.danger.style.opacity = intensity.toFixed(2);
    heartbeat -= dt;
    if (near < 9 && heartbeat <= 0) { sfx.thump(); heartbeat = THREE.MathUtils.clamp(near / 9, 0.25, 1.1); }
  } else {
    ui.danger.style.opacity = 0;
  }
  if (amSeeker && state.phase === 'seek') {
    if (near <= 1.6) { ui.hint.textContent = 'Press E to CATCH!'; ui.hint.classList.add('action'); }
    else { ui.hint.textContent = 'Find the hider · E or click to catch · Shift sprint · climb trees'; ui.hint.classList.remove('action'); }
    // squirrel sense: in the last 30 seconds, an arrow points toward the hider
    if (state.timeLeft <= 30 && other) {
      ui.sense.classList.add('show');
      const dx = other.pos.x - me.pos.x, dz = other.pos.z - me.pos.z;
      const worldAng = Math.atan2(dx, dz);
      const camAng = Math.atan2(camForward.x, camForward.z);
      let rel = worldAng - camAng; // 0 = straight ahead
      ui.senseArrow.style.transform = `rotate(${(-rel - Math.PI / 2).toFixed(3)}rad)`;
    } else ui.sense.classList.remove('show');
  } else if (amHider && state.phase === 'hide') {
    ui.hint.textContent = 'Hide! Bushes, the log, the doghouse, tree tops… WASD · Space jump · Shift sprint';
    ui.hint.classList.remove('action');
  } else if (state.phase === 'seek') {
    ui.hint.textContent = 'Stay hidden! You can still sneak around. Shift to sprint if spotted!';
    ui.hint.classList.remove('action');
  } else {
    ui.hint.textContent = 'WASD move · Space jump · Shift sprint · Mouse look · Walk into trees to climb';
    ui.hint.classList.remove('action');
  }

  // network send
  netAcc += dt;
  if (netAcc >= 1 / 20 && state.joined) {
    netAcc = 0;
    net.send({ type: 'move', pos: { x: me.pos.x, y: me.pos.y, z: me.pos.z }, yaw: me.yaw, anim: me.anim });
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// debug handle for testing from the console
window.__dbg = { me, state, remotes, cam, net };
