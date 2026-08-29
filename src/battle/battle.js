import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera } from '../iso_camera.js?v=CBUST';
import { UNIT_TYPES, FORMATIONS, TALISMANS, TALISMAN_KEYS, matchup, ROUT_MISNEACH } from './units.js?v=CBUST';

const FIELD_W = 40, FIELD_H = 28;
const CLASH_DT = 0.4;       // seconds between casualty exchanges
const ENGAGE = 2.6;         // centre distance at which buíonna clash
const K = 0.9;              // global casualty rate knob
const TEAM = { player: 0x4a86ff, enemy: 0xe0563a };

// The default Cath: two mortal warhosts on a neutral field, near parity, the
// player favoured by a champion and by the Misneach their names/relics buy.
const PLAYER_HOST = [
  { type: 'ceithern', name: 'Fian of the Ford' },
  { type: 'ceithern', name: 'Men of the Oak' },
  { type: 'galloglaigh', name: 'The Hired Axes' },
  { type: 'curadh', name: 'The Hound' },
];
const ENEMY_HOST = [
  { type: 'ceithern', name: 'Reavers' },
  { type: 'ceithern', name: 'Bog-men' },
  { type: 'galloglaigh', name: 'Sea-wolves' },
  { type: 'curadh', name: 'Their Champion' },
];

let _uid = 0;

export class Battle {
  constructor({ onVictory, onExit } = {}) {
    this.onVictory = onVictory || (() => {});
    this.onExit = onExit || (() => {});
    this.active = false;
    this.started = false;
    this.bands = [];
    this.selected = new Set();
    this._clashAcc = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a5238);
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = createIsoCamera(18, aspect);
    this.scene.add(new THREE.HemisphereLight(0xeafbe0, 0x54683f, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(30, 60, 20); this.scene.add(sun);

    this.scene.add(this._buildField());
    this.raycaster = new THREE.Raycaster();
    this.unitGroup = new THREE.Group();
    this.scene.add(this.unitGroup);

    this._dom();
  }

  _buildField() {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W + 24, FIELD_H + 24),
      new THREE.MeshLambertMaterial({ color: 0x5f8049 })
    );
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);
    this.ground = ground;
    // a river seam across the middle, marking the two hosts' ground
    const seam = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W + 24, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x2f5a74, transparent: true, opacity: 0.8 })
    );
    seam.rotation.x = -Math.PI / 2; seam.position.y = 0.02;
    g.add(seam);
    return g;
  }

  // ---- muster + entry ----
  enter() {
    this.active = true;
    this.started = false;
    for (const b of this.bands) this.unitGroup.remove(b.group);
    this.bands = []; this.selected.clear();
    let n = 0;
    for (const d of PLAYER_HOST) this._spawn('player', d, -12 + n++ * 8, 9);
    n = 0;
    for (const d of ENEMY_HOST) this._spawn('enemy', d, -12 + n++ * 8, -9);
    document.getElementById('battle-ui').classList.remove('hidden');
    document.body.classList.add('in-battle');
    this._renderMuster();
    document.getElementById('muster-overlay').classList.remove('hidden');
  }

  exit() {
    this.active = false; this.started = false;
    document.getElementById('battle-ui').classList.add('hidden');
    document.getElementById('muster-overlay').classList.add('hidden');
    document.getElementById('battle-hud').classList.add('hidden');
    document.body.classList.remove('in-battle');
    this.onExit();
  }

  _spawn(team, d, x, z) {
    const t = UNIT_TYPES[d.type];
    const b = {
      id: ++_uid, team, type: d.type, name: d.name, talisman: 'none', form: 'wall',
      count: t.count, count0: t.count, misneach: t.morale, pos: { x, z }, target: null,
      routing: false, dead: false, engagedNow: false, wasEngaged: false, cryT: 0, cd: 0,
    };
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.25, 24),
      new THREE.MeshBasicMaterial({ color: TEAM[team], transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    group.add(ring);
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    spr.center.set(0.5, 0); spr.scale.set(2.6, 3.25, 1); spr.position.y = 0.1;
    group.add(spr);
    b.group = group; b.ring = ring; b.canvas = cv; b.tex = tex; b.spr = spr;
    this._drawToken(b);
    this.unitGroup.add(group);
    this.bands.push(b);
    return b;
  }

  _drawToken(b) {
    const x = b.canvas.getContext('2d');
    const t = UNIT_TYPES[b.type];
    x.clearRect(0, 0, 128, 160);
    const tint = b.team === 'player' ? '#37568f' : '#a5433a';
    x.fillStyle = b.routing ? '#4a4a4a' : tint;
    roundRect(x, 8, 6, 112, 120, 12); x.fill();
    x.lineWidth = b.selected ? 6 : 3;
    x.strokeStyle = b.selected ? '#ffe08a' : (b.team === 'player' ? '#7fa8ff' : '#e08a76');
    roundRect(x, 8, 6, 112, 120, 12); x.stroke();
    x.textAlign = 'center'; x.fillStyle = '#fff';
    x.font = '46px serif'; x.fillText(t.glyph, 64, 54);
    x.font = 'bold 30px sans-serif'; x.fillText(b.count, 64, 92);
    x.font = '13px sans-serif'; x.fillStyle = '#e8dcc0';
    x.fillText(fit(x, b.name, 108), 64, 116);
    // Misneach bar
    const m = Math.max(0, Math.min(100, b.misneach)) / 100;
    x.fillStyle = '#222'; roundRect(x, 14, 132, 100, 12, 5); x.fill();
    x.fillStyle = m > 0.5 ? '#6cc551' : m > 0.25 ? '#e0b83a' : '#e0563a';
    roundRect(x, 14, 132, 100 * m, 12, 5); x.fill();
    b.tex.needsUpdate = true;
  }

  // ---- sim ----
  startCath() {
    document.getElementById('muster-overlay').classList.add('hidden');
    document.getElementById('battle-hud').classList.remove('hidden');
    this.started = true;
    this._updateBanner();
  }

  update(dt) {
    if (!this.active || !this.started) return;
    dt = Math.min(dt, 0.05);
    for (const b of this.bands) {
      if (b.dead) continue;
      if (b.cd > 0) b.cd -= dt;
      if (b.cryT > 0) b.cryT -= dt;
      this._move(b, dt);
    }
    this._clashAcc += dt;
    if (this._clashAcc >= CLASH_DT) { this._clashAcc -= CLASH_DT; this._clash(); this._checkEnd(); }
    // keep tokens facing camera handled by Sprite; refresh selected HUD live
    if (this.selected.size) this._updateHud();
  }

  _alive(team) { return this.bands.filter((b) => b.team === team && !b.dead); }
  _fighting(team) { return this.bands.filter((b) => b.team === team && !b.dead && !b.routing); }

  _move(b, dt) {
    const spd = UNIT_TYPES[b.type].speed * FORMATIONS[b.form].speed;
    let dest = null;
    if (b.routing) {
      dest = { x: b.pos.x, z: b.team === 'player' ? 18 : -18 }; // flee to your back edge
      if (Math.abs(b.pos.z) >= 17) { b.dead = true; this.unitGroup.remove(b.group); return; }
    } else if (b.target && b.target.enemy && !b.target.enemy.dead) {
      dest = b.target.enemy.pos;
    } else if (b.target && b.target.point) {
      dest = b.target.point;
    }
    if (!dest) return;
    const dx = dest.x - b.pos.x, dz = dest.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const stop = (b.target && b.target.enemy) ? ENGAGE - 0.3 : 0.3;
    if (dist > stop) {
      const step = Math.min(spd * dt, dist - stop);
      b.pos.x += (dx / dist) * step; b.pos.z += (dz / dist) * step;
      b.pos.x = Math.max(-FIELD_W / 2, Math.min(FIELD_W / 2, b.pos.x));
      b.group.position.set(b.pos.x, 0, b.pos.z);
    } else if (b.target && b.target.point) {
      b.target = null; // reached the marched-to point
    }
  }

  _power(b, foe) {
    const t = UNIT_TYPES[b.type], f = FORMATIONS[b.form], tal = TALISMANS[b.talisman];
    const charge = (!b.wasEngaged && foe.wasEngaged) ? 1.6 : 1.0; // a timely charge into a busy foe
    const cry = b.cryT > 0 ? 1.25 : 1.0;
    return b.count * (b.misneach / 100) * t.atk * f.atk * tal.atk * matchup(b.type, foe.type) * charge * cry;
  }

  _clash() {
    const F = this._fighting('player'), E = this._fighting('enemy');
    // simple enemy AI: any idle enemy marches at the nearest living foe
    for (const e of E) if (!e.target || (e.target.enemy && e.target.enemy.dead)) {
      const near = nearest(e, F); if (near) e.target = { enemy: near };
    }
    // player bands attack-move: once a foe falls, press on to the next nearest
    for (const f of F) if (f.target && f.target.enemy && f.target.enemy.dead) {
      const near = nearest(f, E); f.target = near ? { enemy: near } : null;
    }
    // who is engaged with whom this tick
    for (const b of this.bands) { b.wasEngaged = b.engagedNow; b.engagedNow = false; }
    const pairs = [];
    for (const f of F) for (const e of E) {
      if (dist2(f.pos, e.pos) <= ENGAGE * ENGAGE) { pairs.push([f, e]); f.engagedNow = e.engagedNow = true; }
    }
    // compute casualties simultaneously
    const dmg = new Map();
    const add = (b, n) => dmg.set(b, (dmg.get(b) || 0) + n);
    for (const [f, e] of pairs) {
      const toE = this._power(f, e) / (UNIT_TYPES[e.type].tough * FORMATIONS[e.form].tough * TALISMANS[e.talisman].tough) * K;
      const toF = this._power(e, f) / (UNIT_TYPES[f.type].tough * FORMATIONS[f.form].tough * TALISMANS[f.talisman].tough) * K;
      add(e, toE); add(f, toF);
    }
    for (const b of this.bands) {
      if (b.dead || b.routing) continue;
      const took = dmg.get(b) || 0;
      if (took > 0) {
        b.count -= took;
        const lostFrac = took / b.count0;
        b.misneach -= lostFrac * 140 / FORMATIONS[b.form].hold;
      }
      // aura from nearby friendly champions/gods
      for (const a of this.bands) if (a !== b && a.team === b.team && !a.dead && UNIT_TYPES[a.type].aura && dist2(a.pos, b.pos) < 36)
        b.misneach += UNIT_TYPES[a.type].aura * CLASH_DT * 0.5;
      b.misneach += TALISMANS[b.talisman].regen * CLASH_DT;
      if (!b.engagedNow) b.misneach += 3 * CLASH_DT; // rally when out of the fray
      b.misneach = Math.max(0, Math.min(100, b.misneach));
      if (b.count <= 0) { b.dead = true; this.unitGroup.remove(b.group); this.selected.delete(b); continue; }
      if (b.misneach < ROUT_MISNEACH && !b.routing) { b.routing = true; b.target = null; this.selected.delete(b); }
      this._drawToken(b);
    }
    this._updateBanner();
  }

  _checkEnd() {
    if (!this.started) return;
    if (this._fighting('enemy').length === 0) {
      this.started = false;
      this.onVictory();
    } else if (this._fighting('player').length === 0) {
      this.started = false;
      this._showDefeat();
    }
  }

  // ---- input (delegated from main when active) ----
  _screen(pos) {
    const v = new THREE.Vector3(pos.x, 0.4, pos.z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
  _worldAt(e) {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.ground)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
  _bandAt(w, team) {
    let best = null, bd = 4;
    for (const b of this.bands) if (!b.dead && (!team || b.team === team)) {
      const d = dist2(b.pos, w); if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  pointerDown(e) {
    if (!this.started) return;
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._dragging = false;
  }
  pointerMove(e) {
    if (!this._dragStart) return;
    const dx = e.clientX - this._dragStart.x, dy = e.clientY - this._dragStart.y;
    if (!this._dragging && Math.hypot(dx, dy) > 8) this._dragging = true;
    if (this._dragging) {
      const box = document.getElementById('battle-select-box');
      const x = Math.min(e.clientX, this._dragStart.x), y = Math.min(e.clientY, this._dragStart.y);
      box.style.left = x + 'px'; box.style.top = y + 'px';
      box.style.width = Math.abs(dx) + 'px'; box.style.height = Math.abs(dy) + 'px';
      box.classList.remove('hidden');
    }
  }
  pointerUp(e) {
    if (!this._dragStart) return;
    const start = this._dragStart; this._dragStart = null;
    document.getElementById('battle-select-box').classList.add('hidden');
    if (this._dragging) {
      this._dragging = false;
      const x0 = Math.min(e.clientX, start.x), x1 = Math.max(e.clientX, start.x);
      const y0 = Math.min(e.clientY, start.y), y1 = Math.max(e.clientY, start.y);
      this._select(this._alive('player').filter((b) => {
        const s = this._screen(b.pos); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
      }));
      return;
    }
    // a tap: order if we have a selection, else select one
    const w = this._worldAt(e); if (!w) return;
    const foe = this._bandAt(w, 'enemy');
    const friend = this._bandAt(w, 'player');
    if (this.selected.size && (foe || !friend)) {
      for (const b of this.selected) { if (b.routing) continue; b.target = foe ? { enemy: foe } : { point: { x: w.x, z: w.z } }; }
    } else if (friend) {
      this._select([friend]);
    }
  }

  _select(list) {
    for (const b of this.selected) { b.selected = false; this._drawToken(b); }
    this.selected = new Set(list);
    for (const b of this.selected) { b.selected = true; this._drawToken(b); }
    this._updateHud();
  }

  setFormation(form) { for (const b of this.selected) { b.form = form; this._drawToken(b); } this._updateHud(); }
  battleCry() { for (const b of this.selected) if (b.cd <= 0 && !b.routing) { b.misneach = Math.min(100, b.misneach + 20); b.cryT = 4; b.cd = 12; this._drawToken(b); } this._updateHud(); }

  // ---- HUD / DOM ----
  _dom() {
    document.getElementById('battle-exit').addEventListener('click', () => this.exit());
    document.getElementById('muster-go').addEventListener('click', () => this.startCath());
    document.querySelectorAll('#battle-actions [data-form]').forEach((btn) =>
      btn.addEventListener('click', () => this.setFormation(btn.dataset.form)));
    document.getElementById('battle-cry').addEventListener('click', () => this.battleCry());
  }

  _renderMuster() {
    const list = document.getElementById('muster-list');
    list.innerHTML = '';
    for (const b of this.bands.filter((x) => x.team === 'player')) {
      const t = UNIT_TYPES[b.type];
      const row = document.createElement('div'); row.className = 'muster-row';
      const opts = TALISMAN_KEYS.map((k) => `<option value="${k}">${TALISMANS[k].label}</option>`).join('');
      row.innerHTML =
        `<span class="m-glyph">${t.glyph}</span>` +
        `<span class="m-type">${t.label}<small>${t.count} · ${t.ga}</small></span>` +
        `<input class="m-name" value="${b.name}" maxlength="22" />` +
        `<select class="m-tal">${opts}</select>`;
      row.querySelector('.m-name').addEventListener('input', (e) => { b.name = e.target.value || b.name; });
      row.querySelector('.m-tal').addEventListener('change', (e) => {
        b.talisman = e.target.value; b.misneach = Math.min(100, UNIT_TYPES[b.type].morale + TALISMANS[b.talisman].morale);
      });
      list.appendChild(row);
    }
  }

  _updateHud() {
    const info = document.getElementById('battle-sel-info');
    const arr = [...this.selected];
    if (!arr.length) { info.innerHTML = '<span class="dim">Draw a box to choose a buíon</span>'; return; }
    if (arr.length === 1) {
      const b = arr[0], t = UNIT_TYPES[b.type];
      info.innerHTML = `<b>${b.name}</b> · ${t.label} <small>×${b.count}</small><br>` +
        `Misneach ${Math.round(b.misneach)} · ${FORMATIONS[b.form].label}` + (b.routing ? ' · <span class="rout">routing!</span>' : '');
    } else {
      info.innerHTML = `<b>${arr.length} buíonna</b> chosen`;
    }
  }

  _updateBanner() {
    const f = this._fighting('player').length, e = this._fighting('enemy').length;
    document.getElementById('battle-banner').innerHTML = `Cath — rout the enemy slua &nbsp; <b>${f}</b> vs <b>${e}</b>`;
  }

  _showDefeat() {
    const info = document.getElementById('battle-sel-info');
    info.innerHTML = '<span class="rout">Your slua is broken.</span> <a id="battle-retry">Try again</a>';
    document.getElementById('battle-retry').addEventListener('click', () => this.enter());
  }

  render(renderer) { renderer.render(this.scene, this.camera); }
  resize(aspect) { resizeIsoCamera(this.camera, aspect); }
}

function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function fit(x, s, max) { while (x.measureText(s).width > max && s.length > 1) s = s.slice(0, -1); return s; }
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
function nearest(b, list) { let best = null, bd = Infinity; for (const o of list) { const d = dist2(b.pos, o.pos); if (d < bd) { bd = d; best = o; } } return best; }
