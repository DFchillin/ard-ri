import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera } from '../iso_camera.js?v=CBUST';
import { Tilemap } from '../sim/tilemap.js?v=CBUST';
import { WorldView } from '../render/world_view.js?v=CBUST';
import { makeBuildingChip } from '../render/chips.js?v=CBUST';
import { UNIT_TYPES, matchup, ROUT_MISNEACH } from './units.js?v=CBUST';

const MAP = 20;
const CLASH_DT = 0.35;
const ATTACK_RANGE = 1.7;   // reach for a blow (world units)
const AGGRO = 6;            // auto-acquire an idle unit's nearest foe within this
const KU = 1.0;            // unit-damage knob
const KB = 0.6;           // building-damage knob
const TEAM = { player: 0x4a86ff, enemy: 0xe0563a };

// The enemy ráth in the north — infrastructure you can raze — and its garrison.
const RATH = [
  { role: 'dwelling', x: 7, z: 4, w: 2, h: 2, hp: 24 },
  { role: 'dwelling', x: 11, z: 4, w: 2, h: 2, hp: 24 },
  { role: 'granary', x: 9, z: 6, w: 2, h: 2, hp: 34 },
];
const PLAYER_HOST = [ // type, tileX, tileZ  (deploy south)
  ['ceithern', 5, 15], ['ceithern', 7, 15], ['ceithern', 13, 15], ['ceithern', 15, 15],
  ['galloglaigh', 8, 16], ['galloglaigh', 12, 16], ['curadh', 10, 16],
];
const ENEMY_HOST = [ // guard the ráth
  ['ceithern', 6, 8], ['ceithern', 9, 8], ['ceithern', 12, 8], ['ceithern', 14, 8],
  ['galloglaigh', 8, 7], ['galloglaigh', 11, 7], ['curadh', 10, 9],
];

let _uid = 0;

export class Battle {
  constructor({ onVictory, onExit } = {}) {
    this.onVictory = onVictory || (() => {});
    this.onExit = onExit || (() => {});
    this.active = false; this.started = false;
    this.units = []; this.buildings = []; this.selected = new Set();
    this._clashAcc = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x243c22);
    // no fog: the whole field sits 127–150 units from the iso camera, so any near
    // fog-far would swallow it entirely.
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = createIsoCamera(13, aspect);
    this.scene.add(new THREE.HemisphereLight(0xeafbe0, 0x54683f, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(30, 60, 20); this.scene.add(sun);

    this.map = new Tilemap(MAP, 1, 9);
    this.view = new WorldView(this.scene, this.map);
    this.pickPlane = this.view.pickPlane;
    this.unitGroup = new THREE.Group(); this.scene.add(this.unitGroup);
    this.buildingGroup = new THREE.Group(); this.scene.add(this.buildingGroup);
    this.raycaster = new THREE.Raycaster();

    this._dom();
  }

  _worldOf(tx, tz) { return { x: tx - this.map.half + 0.5, z: tz - this.map.half + 0.5 }; }

  // ---- entry ----
  enter() {
    this.active = true; this.started = false;
    for (const u of this.units) this.unitGroup.remove(u.mesh);
    for (const b of this.buildings) this.buildingGroup.remove(b.chip);
    this.units = []; this.buildings = []; this.selected.clear();
    for (const d of RATH) this._spawnBuilding(d);
    for (const [t, x, z] of PLAYER_HOST) this._spawnUnit('player', t, x, z);
    for (const [t, x, z] of ENEMY_HOST) this._spawnUnit('enemy', t, x, z);
    document.getElementById('battle-ui').classList.remove('hidden');
    document.getElementById('battle-hud').classList.remove('hidden');
    document.body.classList.add('in-battle');
    this.started = true; this._updateBanner(); this._updateHud();
  }
  exit() {
    this.active = false; this.started = false;
    document.getElementById('battle-ui').classList.add('hidden');
    document.getElementById('battle-hud').classList.add('hidden');
    document.body.classList.remove('in-battle');
    this.onExit();
  }

  _spawnBuilding(d) {
    for (let dz = 0; dz < d.h; dz++) for (let dx = 0; dx < d.w; dx++) {
      const t = this.map.get(d.x + dx, d.z + dz); if (t) { t.terrain = 0; t.road = false; t.occupant = null; }
    }
    const chip = makeBuildingChip(d.role, d.w, d.h, this.map.tile);
    const cx = d.x - this.map.half + (d.w) / 2, cz = d.z - this.map.half + (d.h) / 2;
    chip.position.set(cx, 0, cz);
    const bar = makeBar(1.4); bar.position.set(cx, 2.6, cz); this.buildingGroup.add(bar);
    this.buildingGroup.add(chip);
    const b = { id: ++_uid, team: 'enemy', kind: 'building', chip, bar, pos: { x: cx, z: cz }, x: d.x, z: d.z, w: d.w, h: d.h, hp: d.hp, hp0: d.hp, dead: false };
    drawBar(bar, 1, 0x6cc551); this.buildings.push(b); return b;
  }

  _spawnUnit(team, type, tx, tz) {
    const t = UNIT_TYPES[type];
    const w = this._worldOf(tx, tz);
    const u = { id: ++_uid, team, type, kind: 'unit', hp: t.hp, hp0: t.hp, atk: t.atk, build: t.build,
      misneach: t.morale, pos: { x: w.x, z: w.z }, target: null, dead: false, routing: false,
      engagedNow: false, wasEngaged: false, cryT: 0, cd: 0 };
    const mesh = makePiece(type, team);
    mesh.position.set(w.x, 0, w.z);
    const bar = makeBar(0.7); bar.position.y = t.tall + 0.7; mesh.add(bar);
    u.mesh = mesh; u.bar = bar; u.ring = mesh.userData.ring;
    drawBar(bar, 1, 0x6cc551);
    this.unitGroup.add(mesh); this.units.push(u); return u;
  }

  _live(team) { return this.units.filter((u) => u.team === team && !u.dead && !u.routing); }

  // ---- sim ----
  update(dt) {
    if (!this.active || !this.started) return;
    dt = Math.min(dt, 0.05);
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.cd > 0) u.cd -= dt;
      if (u.cryT > 0) u.cryT -= dt;
      this._move(u, dt);
    }
    this._clashAcc += dt;
    if (this._clashAcc >= CLASH_DT) { this._clashAcc -= CLASH_DT; this._clash(); this._checkEnd(); }
    if (this.selected.size) this._updateHud();
  }

  _targetPos(u) {
    const t = u.target; if (!t) return null;
    if (t.foe) return t.foe.dead ? null : t.foe.pos;
    if (t.point) return t.point;
    return null;
  }

  _move(u, dt) {
    const spd = UNIT_TYPES[u.type].speed;
    let dest = null, isFoe = false;
    if (u.routing) {
      dest = { x: u.pos.x, z: u.team === 'player' ? this.map.half + 3 : -this.map.half - 3 };
      if (Math.abs(u.pos.z) > this.map.half + 1) { u.dead = true; this.unitGroup.remove(u.mesh); return; }
    } else {
      dest = this._targetPos(u); isFoe = !!(u.target && u.target.foe);
    }
    if (!dest) return;
    const dx = dest.x - u.pos.x, dz = dest.z - u.pos.z, dist = Math.hypot(dx, dz);
    const stop = isFoe ? ATTACK_RANGE - 0.25 : 0.25;
    if (dist > stop) {
      const step = Math.min(spd * dt, dist - stop);
      u.pos.x += (dx / dist) * step; u.pos.z += (dz / dist) * step;
      u.mesh.position.set(u.pos.x, 0, u.pos.z);
    } else if (u.target && u.target.point) { u.target = null; }
  }

  _dmgTo(att, def) {
    const charge = (!att.wasEngaged && def.wasEngaged) ? 1.5 : 1.0;
    const cry = att.cryT > 0 ? 1.25 : 1.0;
    if (def.kind === 'building') return att.build * (att.misneach / 100) * cry * KB;
    return att.atk * (att.misneach / 100) * matchup(att.type, def.type) * charge * cry * KU;
  }

  _clash() {
    const F = this._live('player'), E = this._live('enemy');
    // idle units acquire the nearest foe (units auto-guard; buildings only if ordered)
    for (const u of [...F, ...E]) {
      const dead = u.target && ((u.target.foe && (u.target.foe.dead || u.target.foe.routing)));
      if (!u.target || dead) { const n = nearest(u, u.team === 'player' ? E : F); u.target = n ? { foe: n } : null; }
    }
    for (const u of this.units) { u.wasEngaged = u.engagedNow; u.engagedNow = false; }
    // gather attacks: every unit strikes whatever enemy is within reach — the
    // nearest foe first, else an adjacent enemy building. Move orders only steer
    // approach; a unit always defends itself and hits what it collides with.
    const dmg = new Map(); const add = (t, n) => dmg.set(t, (dmg.get(t) || 0) + n);
    for (const u of [...F, ...E]) {
      const foes = u.team === 'player' ? E : F;
      let tgt = null, td = ATTACK_RANGE * ATTACK_RANGE;
      for (const o of foes) { const d = dist2(u.pos, o.pos); if (d < td) { td = d; tgt = o; } }
      if (!tgt) for (const b of this.buildings) if (!b.dead &&
        Math.abs(u.pos.x - b.pos.x) <= b.w / 2 + ATTACK_RANGE - 0.4 && Math.abs(u.pos.z - b.pos.z) <= b.h / 2 + ATTACK_RANGE - 0.4) { tgt = b; break; }
      if (tgt) { u.engagedNow = true; if (tgt.kind === 'unit') tgt.engagedNow = true; add(tgt, this._dmgTo(u, tgt)); }
    }
    // apply
    for (const [t, n] of dmg) {
      t.hp -= n;
      if (t.kind === 'unit') t._took = n;
      if (t.hp <= 0) {
        t.dead = true;
        if (t.kind === 'building') { this.buildingGroup.remove(t.chip); this.buildingGroup.remove(t.bar); }
        else { this.unitGroup.remove(t.mesh); this.selected.delete(t); }
      }
    }
    // morale upkeep — a steady drain while taking blows, worse when outnumbered
    // nearby; a champion or god steadies those around it; rally when out of it.
    for (const u of this.units) {
      if (u.dead || u.kind !== 'unit' || u.routing) continue;
      for (const a of this.units) if (a !== u && a.team === u.team && !a.dead && !a.routing && UNIT_TYPES[a.type].aura && dist2(a.pos, u.pos) < 25)
        u.misneach += UNIT_TYPES[a.type].aura * CLASH_DT * 0.7;
      if (u._took) {
        let foes = 0, friends = 0;
        for (const o of this.units) if (!o.dead && !o.routing && o.kind === 'unit' && dist2(o.pos, u.pos) < 9) (o.team === u.team ? friends++ : foes++);
        u.misneach -= 6 + Math.max(0, foes - friends) * 4;
        u._took = 0;
      } else if (!u.engagedNow) u.misneach += 5 * CLASH_DT; // rally out of the fray
      u.misneach = Math.max(0, Math.min(100, u.misneach));
      if (u.misneach < ROUT_MISNEACH && !u.routing) { u.routing = true; u.target = null; this.selected.delete(u); u.ring.visible = false; }
      drawBar(u.bar, Math.max(0, u.hp) / u.hp0, u.hp / u.hp0 > 0.5 ? 0x6cc551 : u.hp / u.hp0 > 0.25 ? 0xe0b83a : 0xe0563a);
      u.mesh.children.forEach((c) => { if (c.material && c.material.color && c !== u.ring) c.material.opacity = u.routing ? 0.5 : 1; });
    }
    for (const b of this.buildings) if (!b.dead) drawBar(b.bar, Math.max(0, b.hp) / b.hp0, b.hp / b.hp0 > 0.5 ? 0x6cc551 : 0xe0b83a);
    this._updateBanner();
  }

  _checkEnd() {
    if (!this.started) return;
    if (this._live('enemy').length === 0) { this.started = false; this.onVictory(); }
    else if (this._live('player').length === 0) { this.started = false; this._showDefeat(); }
  }

  // ---- input ----
  _screen(pos) { const v = new THREE.Vector3(pos.x, 0.4, pos.z).project(this.camera); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }; }
  _worldAt(e) {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.pickPlane)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
  _unitAt(w, team) { let best = null, bd = 0.8; for (const u of this.units) if (!u.dead && !u.routing && (!team || u.team === team)) { const d = dist2(u.pos, w); if (d < bd) { bd = d; best = u; } } return best; }
  _buildingAt(w) { for (const b of this.buildings) if (!b.dead) { const c = b.pos; if (Math.abs(w.x - c.x) <= b.w / 2 + 0.4 && Math.abs(w.z - c.z) <= b.h / 2 + 0.4) return b; } return null; }

  pointerDown(e) { if (!this.started) return; this._dragStart = { x: e.clientX, y: e.clientY }; this._dragging = false; }
  pointerMove(e) {
    if (!this._dragStart) return;
    const dx = e.clientX - this._dragStart.x, dy = e.clientY - this._dragStart.y;
    if (!this._dragging && Math.hypot(dx, dy) > 8) this._dragging = true;
    if (this._dragging) {
      const box = document.getElementById('battle-select-box');
      box.style.left = Math.min(e.clientX, this._dragStart.x) + 'px'; box.style.top = Math.min(e.clientY, this._dragStart.y) + 'px';
      box.style.width = Math.abs(dx) + 'px'; box.style.height = Math.abs(dy) + 'px'; box.classList.remove('hidden');
    }
  }
  pointerUp(e) {
    if (!this._dragStart) return;
    const start = this._dragStart; this._dragStart = null;
    document.getElementById('battle-select-box').classList.add('hidden');
    if (this._dragging) {
      this._dragging = false;
      const x0 = Math.min(e.clientX, start.x), x1 = Math.max(e.clientX, start.x), y0 = Math.min(e.clientY, start.y), y1 = Math.max(e.clientY, start.y);
      this._select(this._live('player').filter((u) => { const s = this._screen(u.pos); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }));
      return;
    }
    const w = this._worldAt(e); if (!w) return;
    const foe = this._unitAt(w, 'enemy'), friend = this._unitAt(w, 'player'), bld = this._buildingAt(w);
    if (this.selected.size && (foe || bld) ) { const tgt = foe || bld; for (const u of this.selected) if (!u.routing) u.target = { foe: tgt }; }
    else if (friend) { this._select([friend]); }
    else if (this.selected.size) { this._orderMove(w); }
  }

  _orderMove(w) {
    const arr = [...this.selected]; const n = arr.length; const cols = Math.ceil(Math.sqrt(n));
    arr.forEach((u, i) => { if (u.routing) return; const gx = (i % cols) - (cols - 1) / 2, gz = ((i / cols) | 0) - (cols - 1) / 2; u.target = { point: { x: w.x + gx * 0.9, z: w.z + gz * 0.9 } }; });
  }
  _select(list) {
    for (const u of this.selected) if (u.ring) u.ring.visible = false;
    this.selected = new Set(list);
    for (const u of this.selected) if (u.ring) u.ring.visible = true;
    this._updateHud();
  }
  battleCry() { for (const u of this.selected) if (u.cd <= 0 && !u.routing) { u.misneach = Math.min(100, u.misneach + 25); u.cryT = 4; u.cd = 12; } this._updateHud(); }

  // ---- HUD ----
  _dom() {
    document.getElementById('battle-exit').addEventListener('click', () => this.exit());
    document.getElementById('battle-cry').addEventListener('click', () => this.battleCry());
  }
  _updateHud() {
    const info = document.getElementById('battle-sel-info');
    const arr = [...this.selected];
    if (!arr.length) { info.innerHTML = '<span class="dim">Tap a unit, or drag a box to raise a band</span>'; return; }
    if (arr.length === 1) {
      const u = arr[0], t = UNIT_TYPES[u.type];
      info.innerHTML = `<b>${t.label}</b> <small>${t.ga}</small><br>Health ${Math.max(0, Math.round(u.hp))}/${u.hp0} · Misneach ${Math.round(u.misneach)}` + (u.routing ? ' · <span class="rout">routing!</span>' : '');
    } else { info.innerHTML = `<b>${arr.length} units</b> in hand — tap a foe or the ráth to strike, ground to march`; }
  }
  _updateBanner() {
    const f = this._live('player').length, e = this._live('enemy').length, r = this.buildings.filter((b) => !b.dead).length;
    document.getElementById('battle-banner').innerHTML = `Cath — rout the enemy slua &nbsp; <b>${f}</b> vs <b>${e}</b> &nbsp; · ráth <b>${r}</b>`;
  }
  _showDefeat() {
    const info = document.getElementById('battle-sel-info');
    info.innerHTML = '<span class="rout">Your slua is broken.</span> <a id="battle-retry">Try again</a>';
    document.getElementById('battle-retry').addEventListener('click', () => this.enter());
  }

  render(renderer) { renderer.render(this.scene, this.camera); }
  resize(aspect) { resizeIsoCamera(this.camera, aspect); }
}

// A chess-piece: team-coloured base + body, a type-shaped head, a hidden select ring.
function makePiece(type, team) {
  const t = UNIT_TYPES[type];
  const g = new THREE.Group();
  const col = TEAM[team];
  const mat = (c, o) => new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: o || 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 16), mat(darken(col, 0.5)));
  base.position.y = 0.08; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, t.tall * 0.7, 16), mat(col));
  body.position.y = 0.16 + t.tall * 0.35; g.add(body);
  let head;
  if (type === 'ceithern') head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 16), mat(col));
  else if (type === 'galloglaigh') head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), mat(col));
  else if (type === 'curadh') head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat(t.color));
  else head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 16), mat(t.color)); // dia spire
  head.position.y = 0.16 + t.tall * 0.7 + 0.16; g.add(head);
  if (type === 'curadh' || type === 'dia') { const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: t.color })); glow.position.y = head.position.y + 0.3; g.add(glow); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 24), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; g.add(ring);
  g.userData.ring = ring;
  return g;
}
function darken(hex, f) { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return ((r * f) << 16) | ((g * f) << 8) | (b * f); }

function makeBar(worldW) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 10;
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(worldW, worldW * 10 / 64, 1); s.userData.cv = cv; s.userData.tex = tex;
  return s;
}
function drawBar(sprite, frac, color) {
  const cv = sprite.userData.cv, x = cv.getContext('2d');
  x.clearRect(0, 0, 64, 10); x.fillStyle = '#000'; x.globalAlpha = 0.55; x.fillRect(0, 0, 64, 10); x.globalAlpha = 1;
  x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(1, 1, 62 * Math.max(0, Math.min(1, frac)), 8);
  sprite.userData.tex.needsUpdate = true;
}
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
function nearest(u, list) { let best = null, bd = AGGRO * AGGRO; for (const o of list) { const d = dist2(u.pos, o.pos); if (d < bd) { bd = d; best = o; } } return best; }
