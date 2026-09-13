import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, panIsoCamera, zoomIsoCamera } from './iso_camera.js?v=CBUST';
import { makeWarriorChip, makeWalkerChip } from './render/chips.js?v=CBUST';
import { tex } from './render/assets.js?v=CBUST';
import { UNIT_TYPES } from './battle/units.js?v=CBUST';

// The hurling challenge — a penalty-shootout minigame on a small isometric pitch,
// rendered like the battlefield: painted lines, a goal at the far end, your chosen
// strikers as billboard chips that play their strike animation, and a sliotar that
// arcs toward the posts. The power/accuracy meter and scoreboard are an HTML
// overlay. Win it and you may raise a monument. Purely a friendly match.

const SWEET = { god: 0.40, hero: 0.36, special: 0.26, seasoned: 0.24, warrior: 0.21, regular: 0.17 };
const CHALLENGER_ODDS = 0.55;
const CINE_IN = 1.2, CINE_OUT = 0.85, SET_HOLD = 1.6; // cinematic pan-in, pull-out, and the beat we settle down there before the strike
const WALK = { villager: 'villager', water: 'water_carrier', grain: 'grain_carrier', deaglan: 'market_trader', druid: 'druid' };
const GOD_KEYS = new Set(['dagda', 'morrigan', 'lugh', 'nuada', 'manannan', 'brigid', 'cuchulainn', 'fionn']);

const PITCH_W = 9, PITCH_L = 18;                 // world size (X, Z)
const SPOT_Z = 5.5, GOAL_Z = -8.2;               // striker spot; goal line (near the far edge)
const POST_X = 1.3, BAR_Y = 1.35, POST_H = 2.7;  // a smaller goal that sits in the small box

function spriteSrc(type) {
  const t = UNIT_TYPES[type];
  if (t && t.battle) return `assets/battle/${t.battle.art}/s_idle.png`;
  return `assets/walkers/${(t && t.sprite) || WALK[type] || 'villager'}/s_stand.png`;
}
function label(type) { return (UNIT_TYPES[type] && UNIT_TYPES[type].label) || type; }
function sweetFor(type) { const t = UNIT_TYPES[type]; return (t && SWEET[t.cat]) || 0.2; }
function chipFor(type) {
  const t = UNIT_TYPES[type];
  if (t && t.battle) return makeWarriorChip(t.battle.art, Math.min(t.battle.h, 2.2));
  return makeWalkerChip((t && t.sprite) || WALK[type] || 'villager', false);
}

// A transparent line overlay laid just above the grass: mown stripes + white
// markings + the goal boxes at the far (top) end, matching the world layout.
function linesTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  for (let i = 0; i < 512; i += 44) { x.fillStyle = (i / 44) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; x.fillRect(0, i, 256, 22); }
  x.strokeStyle = 'rgba(244,248,234,0.85)'; x.lineWidth = 3; x.lineJoin = 'round';
  x.strokeRect(12, 10, 232, 492);                 // sideline box
  x.beginPath(); x.moveTo(12, 256); x.lineTo(244, 256); x.stroke(); // halfway line
  x.strokeRect(88, 12, 80, 40);                   // small square at the goal
  x.strokeRect(60, 12, 136, 74);                  // large rectangle
  x.beginPath(); x.moveTo(12, 120); x.lineTo(244, 120); x.stroke(); // 45 line
  x.fillStyle = 'rgba(244,248,234,0.9)'; x.beginPath(); x.arc(128, 150, 4, 0, Math.PI * 2); x.fill(); // point spot
  const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4; return tx;
}

// A sliotar: the leather ball art, pale hide with dark seams.
function makeBall() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('assets/props/sliotar.png'), transparent: true, depthWrite: false }));
  s.scale.set(0.55, 0.55, 1); s.renderOrder = 3; s.visible = false; return s;
}

export class Hurling {
  constructor({ onResolve, onClose } = {}) {
    this.onResolve = onResolve || (() => {});
    this.onClose = onClose || (() => {});
    this.active = false;
    this.aspect = window.innerWidth / window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2a17);
    this.camera = createIsoCamera(9.5, this.aspect);
    this.home = { vs: 9.5, px: 0, pz: 0 };   // the resting framing (follows the player's own pan/zoom)
    this.camGoal = { ...this.home };          // what the camera is easing toward
    // A real 3D camera used only for the shot. It starts matched to the iso framing,
    // then makes one continuous cinematic move down behind the striker's shoulder,
    // looking along the pitch at the goal — so the swing reads as a smooth pan, not a
    // cut, and the billboards turn to show the strike.
    this.persp = new THREE.PerspectiveCamera(42, this.aspect, 0.1, 1000);
    this._strikeCam = false;
    this._pc = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this._pcA = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this._pcB = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this._cine = null; // { t, dur, ease, onDone }
    this.scene.add(new THREE.HemisphereLight(0xcdd8c6, 0x445536, 1.15));
    const sun = new THREE.DirectionalLight(0xf6f2e2, 1.15); sun.position.set(30, 60, 20); this.scene.add(sun);
    this._buildPitch();
    this.chipGroup = new THREE.Group(); this.scene.add(this.chipGroup);
    this.ball = makeBall(); this.scene.add(this.ball);

    // DOM
    this.screen = document.getElementById('hurling-screen');
    this.pickCard = document.getElementById('hurl-pick-card');
    this.hud = document.getElementById('hurl-hud');
    this.scoreEl = document.getElementById('hurl-score');
    this.bottom = document.getElementById('hurl-bottom');
    this.statusEl = document.getElementById('hurl-status');
    this.meterEl = document.getElementById('hurl-meter');
    this.sweetEl = document.getElementById('hurl-sweet');
    this.mkEl = document.getElementById('hurl-mk');
    this.strikeBtn = document.getElementById('hurl-strike');
    this.resultEl = document.getElementById('hurl-result');
    const close = document.getElementById('hurl-close'); if (close) close.addEventListener('click', () => this.close());
    if (this.strikeBtn) this.strikeBtn.addEventListener('click', () => this._strike());
    this._keyH = (e) => { if ((e.code === 'Space' || e.key === ' ') && this.phase === 'aim') { e.preventDefault(); this._strike(); } };

    this.phase = 'idle';
  }

  _buildPitch() {
    const g = new THREE.Group(); this.scene.add(g);
    // grass: the pasture terrain tile, repeated. Load an independent copy (not the
    // shared cached one) so setting repeat/wrap here can't disturb the settlement.
    const grassTex = new THREE.TextureLoader().load('assets/terrain/tiles/pasture.png');
    grassTex.colorSpace = THREE.SRGBColorSpace;                    // tag as sRGB or it washes out to flat lime
    grassTex.magFilter = grassTex.minFilter = THREE.NearestFilter; grassTex.generateMipmaps = false;  // crisp pixel-art, matching the battlefield turf
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(4, 8);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_L),
      new THREE.MeshLambertMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = 0; grass.renderOrder = -2; g.add(grass);
    // painted lines, just above the grass
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_L),
      new THREE.MeshBasicMaterial({ map: linesTexture(), transparent: true, depthWrite: false }));
    lines.rotation.x = -Math.PI / 2; lines.position.y = 0.02; lines.renderOrder = -1; g.add(lines);
    // goal: two posts + crossbar at the goal line, sitting in the small box
    const white = new THREE.MeshLambertMaterial({ color: 0xeee6d0 });
    const post = () => new THREE.Mesh(new THREE.BoxGeometry(0.17, POST_H, 0.17), white);
    const pl = post(), pr = post();
    pl.position.set(-POST_X, POST_H / 2, GOAL_Z); pr.position.set(POST_X, POST_H / 2, GOAL_Z);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(POST_X * 2 + 0.17, 0.15, 0.15), white);
    bar.position.set(0, BAR_Y, GOAL_Z);
    g.add(pl, pr, bar);
    this._buildCrowd(g);
  }

  // A small crowd of townsfolk, single stand-frames, ringing the pitch so it looks
  // like the whole túath has turned out. Static, and they share a few textures so
  // the whole ring is cheap.
  _buildCrowd(parent) {
    const bases = ['villager', 'villager_f', 'grain_carrier', 'water_carrier', 'market_trader', 'druid'];
    const cache = new Map();
    const matFor = (base, dir) => {
      const k = base + '/' + dir;
      let m = cache.get(k);
      if (!m) { m = new THREE.SpriteMaterial({ map: tex(`assets/walkers/${base}/${dir}_stand.png`), transparent: true, alphaTest: 0.12 }); cache.set(k, m); }
      return m;
    };
    // Every supporter faces the pitch. Since the sprites billboard to the camera we
    // convey facing by the frame we pick: relative to the default vantage (corner 0,
    // looking from +x +z), folk on the near sidelines show their backs (n family) —
    // so the crowd at the bottom of the screen looks in at the field, not out at you.
    const camTo = new THREE.Vector3(1, 0, 1).normalize();
    const dirFrame = (x, z) => {
      const len = Math.hypot(x, z) || 1, nx = -x / len, nz = -z / len; // toward pitch centre
      const front = nx * camTo.x + nz * camTo.z;         // + toward camera, - away
      const side = nx * -camTo.z + nz * camTo.x;         // camera-right component
      if (front > 0.4) return side > 0.4 ? 'se' : side < -0.4 ? 'sw' : 's';
      if (front < -0.4) return side > 0.4 ? 'ne' : side < -0.4 ? 'nw' : 'n';
      return side > 0 ? 'e' : 'w';
    };
    const place = (x, z) => {
      const base = bases[(Math.random() * bases.length) | 0];
      const s = new THREE.Sprite(matFor(base, dirFrame(x, z))); s.center.set(0.5, 0); s.renderOrder = 1;
      s.scale.set(0.8, 1.0, 1); s.position.set(x + (Math.random() - 0.5) * 0.3, 0.02, z + (Math.random() - 0.5) * 0.3);
      parent.add(s);
    };
    const halfW = PITCH_W / 2 + 0.7, halfL = PITCH_L / 2 + 0.6;
    for (let r = 0; r < 2; r++) {
      const ox = halfW + r * 0.85, oz = halfL + r * 0.85;
      for (let z = -halfL; z <= halfL; z += 0.95) { place(-ox, z); place(ox, z); }        // sidelines
      for (let x = -halfW; x <= halfW; x += 0.95) { place(x, -oz); place(x, oz); }          // ends
    }
  }

  // --- lifecycle ---
  open(roster, hosted) {
    this.avail = this._shooters(roster, hosted);
    this.picks = []; this.pScore = 0; this.cScore = 0; this.round = 0;
    this.active = true; this.phase = 'pick';
    this.aspect = window.innerWidth / window.innerHeight; this._resetCam();
    this.screen.classList.remove('hidden');
    document.body.classList.add('in-hurling');
    this.hud.classList.add('hidden'); this.bottom.classList.add('hidden'); this.resultEl.classList.add('hidden');
    this.pickCard.classList.remove('hidden');
    window.addEventListener('keydown', this._keyH);
    this._renderPick();
  }
  close() {
    this.active = false; this.phase = 'idle';
    window.removeEventListener('keydown', this._keyH);
    this.screen.classList.add('hidden');
    document.body.classList.remove('in-hurling');
    this._clearChips();
    this.onClose();
  }
  resize(aspect) {
    this.aspect = aspect;
    resizeIsoCamera(this.camera, aspect);
    this.persp.aspect = aspect; this.persp.updateProjectionMatrix();
    // Re-frame to fit the new screen shape (e.g. the phone turned portrait ↔ landscape),
    // easing there rather than snapping — but never yank the camera mid-shot.
    if (this.active && !this._strikeCam) { const vs = this._fitViewSize(aspect); this.home = { vs, px: 0, pz: 0 }; this.camGoal = { ...this.home }; }
  }
  renderCam() { return this._strikeCam ? this.persp : this.camera; }
  render(renderer) { renderer.render(this.scene, this.renderCam()); }

  // --- camera: drag to scroll, wheel/± to zoom, and a smooth ease each frame ---
  _resetCam() {
    const c = this.camera; c.userData.dir = 0; c.userData.pan.x = 0; c.userData.pan.z = 0;
    panIsoCamera(c, 0, 0); // reapply the pose at pan 0 and refresh matrices
    const vs = this._fitViewSize(this.aspect);
    c.userData.viewSize = vs; resizeIsoCamera(c, this.aspect);
    this.home = { vs, px: 0, pz: 0 }; this.camGoal = { ...this.home };
  }
  // Zoom the iso camera so the whole pitch, goal and crowd fit the current aspect.
  // Portrait phones need a far wider view than landscape or the pitch runs off-screen,
  // so we project the pitch's extreme points into camera space and size to enclose them.
  _fitViewSize(aspect) {
    const c = this.camera, saved = { x: c.userData.pan.x, z: c.userData.pan.z };
    c.userData.pan.x = 0; c.userData.pan.z = 0; panIsoCamera(c, 0, 0); c.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(c.matrixWorld).invert(), p = new THREE.Vector3();
    // Fit the playing area + goal (not the outer crowd) so the strikers stay as large
    // as possible; the decorative crowd is allowed to bleed off the screen edges.
    const ex = PITCH_W / 2 + 0.6, ez = PITCH_L / 2 + 0.8, pts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { pts.push([sx * ex, 0, sz * ez], [sx * ex, 1.7, sz * ez]); }
    pts.push([0, POST_H, GOAL_Z], [POST_X, POST_H, GOAL_Z], [-POST_X, POST_H, GOAL_Z]);
    let u = 0, v = 0;
    for (const q of pts) { p.set(q[0], q[1], q[2]).applyMatrix4(inv); u = Math.max(u, Math.abs(p.x)); v = Math.max(v, Math.abs(p.y)); }
    c.userData.pan.x = saved.x; c.userData.pan.z = saved.z; panIsoCamera(c, 0, 0);
    return Math.max(3.5, Math.min(38, Math.max(v, u / aspect) * 1.03));
  }
  pointerDown(e) { this._drag = { x: e.clientX, y: e.clientY }; }
  pointerMove(e) { if (!this._drag) return; this._pan(e.clientX - this._drag.x, e.clientY - this._drag.y); this._drag = { x: e.clientX, y: e.clientY }; }
  pointerUp() { this._drag = null; }
  zoom(factor) { zoomIsoCamera(this.camera, factor, this.aspect); this.home.vs = this.camGoal.vs = this.camera.userData.viewSize; }
  _pan(dx, dy) {
    const cam = this.camera;
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const wpp = (2 * cam.userData.viewSize) / window.innerHeight;
    const mx = -dx * wpp, my = dy * wpp;
    panIsoCamera(cam, r.x * mx + f.x * my, r.z * mx + f.z * my);
    const p = cam.userData.pan; this.home = { vs: cam.userData.viewSize, px: p.x, pz: p.z }; this.camGoal = { ...this.home };
  }
  // A perspective pose that reproduces the current iso framing, so the cinematic
  // move can begin from exactly what the player is already looking at (no cut).
  _isoMatchPose() {
    const c = this.camera; c.updateMatrixWorld(true);
    const pos = c.position.clone();
    const look = new THREE.Vector3(c.userData.pan.x, 0, c.userData.pan.z);
    const fov = 2 * Math.atan(c.userData.viewSize / pos.distanceTo(look)) * 180 / Math.PI;
    return { pos, look, fov };
  }
  // The over-the-shoulder pose: low behind the shooter and a little to one side (a
  // slight azimuth offset gives the shot depth and reads the angle to the goal),
  // looking along the pitch at the posts.
  _otsPose(shooter) {
    const side = this._camSide || 1;
    // Well off to one side and a little higher, looking at the goal centre. Perspective
    // then parallaxes the near striker into the corner of frame (even a tall god only
    // takes the corner), keeping a clear sightline to the posts and the ball's flight.
    return { pos: new THREE.Vector3(shooter.x * 0.5 + side * 2.9, 2.15, shooter.z + 2.7), look: new THREE.Vector3(0, BAR_Y + 0.35, GOAL_Z + 1.6), fov: 42 };
  }
  _startCine(from, to, dur, onDone) {
    this._pcA.pos.copy(from.pos); this._pcA.look.copy(from.look); this._pcA.fov = from.fov;
    this._pcB.pos.copy(to.pos); this._pcB.look.copy(to.look); this._pcB.fov = to.fov;
    this._pc.pos.copy(from.pos); this._pc.look.copy(from.look); this._pc.fov = from.fov;
    this._applyPersp();
    this._cine = { t: 0, dur, onDone: onDone || null };
  }
  _stepCine(dt) {
    const cn = this._cine; if (!cn) return;
    cn.t = Math.min(cn.dur, cn.t + dt);
    const x = cn.t / cn.dur, e = x * x * (3 - 2 * x); // smoothstep ease-in-out
    this._pc.pos.lerpVectors(this._pcA.pos, this._pcB.pos, e);
    this._pc.look.lerpVectors(this._pcA.look, this._pcB.look, e);
    this._pc.fov = this._pcA.fov + (this._pcB.fov - this._pcA.fov) * e;
    this._applyPersp();
    if (cn.t >= cn.dur) { this._cine = null; if (cn.onDone) cn.onDone(); }
  }
  _applyPersp() {
    this.persp.position.copy(this._pc.pos); this.persp.lookAt(this._pc.look);
    if (Math.abs(this.persp.fov - this._pc.fov) > 0.001) { this.persp.fov = this._pc.fov; this.persp.updateProjectionMatrix(); }
  }
  // Begin the shot: switch to the 3D camera matched to the iso view, then pan smoothly
  // down behind the shooter. `onArrive` fires once the pan settles (then we take the shot).
  _beginStrikeCam(shooter, onArrive) {
    this._strikeCam = true;
    const from = this._isoMatchPose();
    this.persp.fov = from.fov; this.persp.updateProjectionMatrix();
    this._startCine(from, this._otsPose(shooter), CINE_IN, onArrive);
  }
  // Pull the 3D camera back to the iso framing, then hand control to the ortho camera.
  _endStrikeCam() {
    const from = { pos: this._pc.pos.clone(), look: this._pc.look.clone(), fov: this._pc.fov };
    this._startCine(from, this._isoMatchPose(), CINE_OUT, () => { this._strikeCam = false; });
  }

  _applyCam(dt) {
    if (this._strikeCam) { this._stepCine(dt); return; }
    const cam = this.camera, g = this.camGoal, k = Math.min(1, dt * 4.2);
    if (Math.abs(g.vs - cam.userData.viewSize) > 0.01) { cam.userData.viewSize += (g.vs - cam.userData.viewSize) * k; resizeIsoCamera(cam, this.aspect); }
    const p = cam.userData.pan, dx = (g.px - p.x) * k, dz = (g.pz - p.z) * k;
    if (Math.abs(dx) > 0.0004 || Math.abs(dz) > 0.0004) panIsoCamera(cam, dx, dz);
  }

  _clearChips() {
    for (const c of this.chipGroup.children.slice()) this.chipGroup.remove(c);
    this.team = null; this.challenger = null; this.ball.visible = false;
  }

  _shooters(roster, hosted) {
    const out = [];
    for (const k in (roster || {})) if (roster[k] > 0 && UNIT_TYPES[k]) out.push(k);
    for (const k in (hosted || {})) if (hosted[k] && UNIT_TYPES[k] && !out.includes(k)) out.push(k);
    if (!out.length) out.push('villager');
    return out;
  }

  // --- team selection (HTML card over the pitch) ---
  _renderPick() {
    const slots = this.picks.map((k, i) =>
      `<div class="hurl-slot"><img src="${spriteSrc(k)}" alt=""><span>${label(k)}</span><button class="hurl-drop" data-i="${i}">✕</button></div>`).join('') +
      Array.from({ length: 3 - this.picks.length }, () => `<div class="hurl-slot empty">—</div>`).join('');
    const opts = this.avail.map((k) =>
      `<button class="hurl-pick${GOD_KEYS.has(k) ? ' god' : ''}" data-k="${k}" ${this.picks.length >= 3 ? 'disabled' : ''}>` +
      `<img src="${spriteSrc(k)}" alt=""><span>${label(k)}</span><em>${Math.round(sweetFor(k) * 100)}%</em></button>`).join('');
    this.pickCard.innerHTML =
      `<h3>The Challenge of the Field</h3>` +
      `<p class="hurl-sub">A wandering band of hurlers has thrown down a challenge. Field three strikers — gods and heroes have the surest eye (a wider sweet spot).</p>` +
      `<div class="hurl-team">${slots}</div>` +
      `<div class="hurl-roster">${opts}</div>` +
      `<button id="hurl-start" class="continue-btn" ${this.picks.length === 3 ? '' : 'disabled'}>Take the field ▸</button>`;
    this.pickCard.querySelectorAll('.hurl-pick').forEach((b) => b.addEventListener('click', () => {
      if (this.picks.length < 3) { this.picks.push(b.dataset.k); this._renderPick(); }
    }));
    this.pickCard.querySelectorAll('.hurl-drop').forEach((b) => b.addEventListener('click', () => { this.picks.splice(+b.dataset.i, 1); this._renderPick(); }));
    const start = this.pickCard.querySelector('#hurl-start');
    if (start) start.addEventListener('click', () => { if (this.picks.length === 3) this._startMatch(); });
  }

  _startMatch() {
    this.pickCard.classList.add('hidden');
    this.hud.classList.remove('hidden'); this.bottom.classList.remove('hidden');
    // place the three strikers on the pitch: a bench, plus a spot for whoever shoots
    this.team = this.picks.map((type, i) => {
      const chip = chipFor(type); chip.position.set((i - 1) * 2.0, 0.05, SPOT_Z + 1.8);
      chip.renderOrder = 2; // draw the players above the field, never behind it
      if (chip.faceWorld) chip.faceWorld(0, -1);
      this.chipGroup.add(chip); return { type, chip };
    });
    this.challenger = chipFor('villager'); this.challenger.position.set(0, 0.05, SPOT_Z);
    this.challenger.renderOrder = 2;
    if (this.challenger.material) this.challenger.material.color.setHex(0xe0563a);
    this.challenger.visible = false; this.chipGroup.add(this.challenger);
    this.round = 0; this._nextRound();
  }

  // --- shootout flow ---
  _nextRound() {
    if (this.round >= 3 && this.pScore !== this.cScore) return this._finish();
    const type = this.picks[this.round % this.picks.length];
    const shaky = this._shaky(this.round);
    // bring this striker to the spot; others to the bench
    this.team.forEach((m, i) => { m.chip.visible = true; m.chip.position.set((i - 1) * 2.0, 0.05, SPOT_Z + 1.8); if (m.chip.faceWorld) m.chip.faceWorld(0, -1); });
    this.striker = this.team[this.round % this.team.length].chip;
    this.striker.position.set(0, 0.05, SPOT_Z); if (this.striker.faceWorld) this.striker.faceWorld(0, -1);
    this.challenger.visible = false;
    this._updateScore();
    this.sw = sweetFor(type) * (shaky ? 0.66 : 1);
    this.swC = 0.25 + Math.random() * 0.5;
    this.sweetEl.style.left = (this.swC - this.sw / 2) * 100 + '%';
    this.sweetEl.style.width = this.sw * 100 + '%';
    this.mkT = 0; this.mkDir = 1; this.mkSpeed = shaky ? 1.45 : 0.95; this.shaky = shaky;
    this.bottom.classList.remove('hidden'); this.strikeBtn.classList.remove('hidden'); this.meterEl.classList.remove('hidden');
    this._status(`${label(type)} steps up — ${shaky ? 'and this one is to win it. Steady…' : 'time your strike.'} Stop it in the green.`);
    this.phase = 'aim';
  }
  _shaky(idx) { if (idx >= 3) return true; return Math.abs(this.pScore - this.cScore) <= 1 && (3 - idx - 1) <= 1; }

  _strike() {
    if (this.phase !== 'aim') return;
    const hit = Math.abs(this.mkT - this.swC) <= this.sw / 2;
    this.meterEl.classList.add('hidden'); this.strikeBtn.classList.add('hidden');
    this.striker.faceWorld && this.striker.faceWorld(0, -1);
    this._pendingHit = hit; this._shooter = this.striker; this._shooterPos = this.striker.position;
    this._camSide = Math.random() < 0.5 ? -1 : 1; // view a little off to one side for perspective
    // cinematic pan from the iso view down behind the shoulder, THEN take the shot
    this._status('The field falls quiet — line up the shot…');
    this._beginStrikeCam(this.striker.position, () => { this._hold = SET_HOLD; this.phase = 'set'; });
    this.phase = 'cine';
  }

  _challengerShoot() {
    this.striker && (this.striker.visible = false);
    // keep the current striker's team on the bench, bring the challenger to the spot
    this.challenger.visible = true; this.challenger.position.set(0, 0.05, SPOT_Z);
    if (this.challenger.faceWorld) this.challenger.faceWorld(0, -1);
    this._pendingHit = Math.random() < CHALLENGER_ODDS;
    this._shooter = this.challenger; this._shooterPos = this.challenger.position; this._replying = true;
    this._camSide = Math.random() < 0.5 ? -1 : 1;
    this._status('The challenger steps up to reply…');
    this._beginStrikeCam(this.challenger.position, () => { this._hold = SET_HOLD; this.phase = 'set'; });
    this.phase = 'cine';
  }

  // the pan has settled — swing the hurley, then the ball launches a beat later
  _release() {
    if (this._shooter && this._shooter.strike) this._shooter.strike();
    this._launchIn = 0.3; this.phase = 'wind';
  }

  _launchBall() {
    const hit = this._pendingHit;
    const from = this._shooterPos;
    let target;
    if (hit) target = new THREE.Vector3((Math.random() - 0.5) * (POST_X - 0.4), BAR_Y + 1.3, GOAL_Z - 0.4);
    else if (Math.random() < 0.5) target = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (POST_X + 0.8), BAR_Y + 0.4, GOAL_Z);
    else target = new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.6, GOAL_Z + 3.2);
    this._ballFrom = new THREE.Vector3(from.x, 1.3, from.z - 0.3);
    this._ballTo = target; this._ballT = 0; this._ballDur = 1.15; this._ballPeak = 2.6;
    this.ball.visible = true; this.ball.position.copy(this._ballFrom);
    this.phase = 'fly';
  }
  _stepBall(dt) {
    this._ballT += dt / this._ballDur;
    const t = Math.min(this._ballT, 1);
    const p = this._ballFrom.clone().lerp(this._ballTo, t);
    p.y += this._ballPeak * 4 * t * (1 - t);
    this.ball.position.copy(p);
    this.ball.material.rotation += dt * 8;
    if (this._ballT >= 1) { this.ball.visible = false; this._onLand(); }
  }
  _onLand() {
    const hit = this._pendingHit;
    this._endStrikeCam(); // cut back to the wide iso pitch view
    if (this._replying) { if (hit) this.cScore++; this._replying = false; this._updateScore(); this._status(hit ? 'Over the bar — a point to them.' : 'Wide! No score to the challengers.'); this._gap = 1.1; this._after = () => { this.round++; this._nextRound(); }; }
    else { if (hit) this.pScore++; this._updateScore(); this._status(hit ? 'OVER THE BAR — a point!' : 'Wide! It drifts past the post.'); this._gap = 0.9; this._after = () => this._challengerShoot(); }
    this.phase = 'gap';
  }

  _finish() {
    const won = this.pScore > this.cScore;
    this.bottom.classList.add('hidden');
    this.resultEl.classList.remove('hidden');
    this.resultEl.innerHTML =
      `<h3>${won ? '🏆 The Field is Yours' : 'The Day is Theirs'}</h3>` +
      `<p class="hurl-sub">Final: You ${this.pScore} – ${this.cScore} Them. ` +
      (won ? 'The wandering band bows to your strikers. Raise a monument to the day — while it stands, the harvest comes in a fifth more plentiful.'
           : 'The challengers take the honours and move on. Field a surer team when the next band comes calling.') + `</p>` +
      `<button id="hurl-done" class="continue-btn">${won ? 'Claim your monument ▸' : 'Back to the ráth'}</button>`;
    this.resultEl.querySelector('#hurl-done').addEventListener('click', () => { this.onResolve(won); this.close(); });
    this.phase = 'done';
  }

  _updateScore() { if (this.scoreEl) this.scoreEl.innerHTML = `Round ${Math.min(this.round + 1, 4)} &nbsp;·&nbsp; You <b>${this.pScore}</b> – <b>${this.cScore}</b> Them`; }
  _status(t) { if (this.statusEl) this.statusEl.textContent = t; }

  // --- driven by the main render loop while active ---
  update(dt) {
    if (!this.active) return;
    this._applyCam(dt);
    for (const c of this.chipGroup.children) if (c.animate) c.animate(dt, false);
    if (this.phase === 'aim') {
      this.mkT += this.mkDir * this.mkSpeed * dt;
      if (this.mkT >= 1) { this.mkT = 1; this.mkDir = -1; } else if (this.mkT <= 0) { this.mkT = 0; this.mkDir = 1; }
      const j = this.shaky ? (Math.random() - 0.5) * 0.04 : 0;
      this.mkEl.style.left = Math.max(0, Math.min(1, this.mkT + j)) * 100 + '%';
    } else if (this.phase === 'set') {
      this._hold -= dt; if (this._hold <= 0) this._release();
    } else if (this.phase === 'wind') {
      this._launchIn -= dt; if (this._launchIn <= 0) this._launchBall();
    } else if (this.phase === 'fly') {
      this._stepBall(dt);
    } else if (this.phase === 'gap') {
      this._gap -= dt; if (this._gap <= 0) { const f = this._after; this._after = null; this.phase = 'idle2'; if (f) f(); }
    }
  }
}
