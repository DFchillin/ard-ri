import * as THREE from 'three';
import { makeWalkerChip } from './render/chips.js?v=CBUST';
import { entryRoadTile, roadPath } from './sim/roads.js?v=CBUST';

// Manhunt — the blend. The Celtic hero walks his own ráth in first person,
// sword in hand, hunting a thief who weaves store to store and makes for the
// road out. Catch him before he leaves the map. Mind your daggers: a towns-
// person cut down in the crossfire is a wound to the ráth's own commerce.

const EYE = 1.6, MOVE_SPD = 5.2; // Deasún Fathaigh already looms over the little folk at a man's height
const LOOK_SENS = 0.0026;
const MELEE_RANGE = 2.2, MELEE_ARC = 0.6, MELEE_DMG = 40, DAGGER_DMG = 55;
const BANDIT_SPD = 3.4, BANDIT_HP = 120;
const SIGHT = 7.0;            // the thief turns to fight within this range
const CASUALTY_SILVER = 25;   // a slain townsperson costs the ráth this in lost trade
const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3();

export class Manhunt {
  constructor({ scene, game, map }) {
    this.scene = scene; this.game = game; this.map = map;
    this.active = false;
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.daggerN = 12;
    this._keys = new Set(); this._joy = null; this._look = null; this._handlers = {};
    this.daggers = []; this.pickups = [];
    this._group = new THREE.Group(); this.scene.add(this._group); // bandit + markers, cleared on exit
    this._dom();
    this._buildWeapon();
  }

  // ---- hero's sword (a camera-child sprite) --------------------------------
  _buildWeapon() {
    this.scene.add(this.camera);
    this._swordH = 0.78; // the giant's blade
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.center.set(0.5, 0.5); s.renderOrder = 20;
    s.scale.set(this._swordH * 0.45, this._swordH, 1);
    new THREE.TextureLoader().load('assets/weapons/fp_sword0.png?v=CBUST', (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; const im = t.image; if (im && im.width) s.scale.set(this._swordH * (im.width / im.height), this._swordH, 1); });
    this._swordBasePos = new THREE.Vector3(0.23, -0.30, -0.62); s.position.copy(this._swordBasePos);
    this.camera.add(s); this._sword = s; s.visible = false;
  }
  _daggerMesh() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 6), new THREE.MeshLambertMaterial({ color: 0xcfd6dc }));
    blade.position.z = 0.2; blade.rotation.x = Math.PI / 2; g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.05), new THREE.MeshLambertMaterial({ color: 0xc9a24a })); g.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
    grip.rotation.x = Math.PI / 2; grip.position.z = -0.13; g.add(grip);
    return g;
  }

  // ---- HUD ----------------------------------------------------------------
  _dom() {
    const h = document.createElement('div'); h.id = 'manhunt-hud'; this.hud = h;
    h.style.cssText = 'position:fixed;inset:0;z-index:40;display:none;font-family:inherit;color:#eee;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden';
    this._vig = document.createElement('div');
    this._vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px 40px rgba(140,10,10,0);transition:box-shadow .12s';
    h.appendChild(this._vig);
    const cross = document.createElement('div');
    cross.style.cssText = 'position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;opacity:.7';
    cross.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18"><g stroke="#fff" stroke-width="1.6"><line x1="9" y1="1" x2="9" y2="6"/><line x1="9" y1="12" x2="9" y2="17"/><line x1="1" y1="9" x2="6" y2="9"/><line x1="12" y1="9" x2="17" y2="9"/></g></svg>';
    h.appendChild(cross);
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:14px;top:12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;text-shadow:0 1px 3px #000';
    this._hpWrap = document.createElement('div'); this._hpWrap.style.cssText = 'width:190px;height:16px;border:2px solid #000a;border-radius:4px;background:#3a0d0d;overflow:hidden';
    this._hpBar = document.createElement('div'); this._hpBar.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#c43a2e,#e4b23a)'; this._hpWrap.appendChild(this._hpBar);
    this._lbl = document.createElement('div'); this._lbl.style.cssText = 'font-size:15px;font-weight:700';
    bar.appendChild(this._hpWrap); bar.appendChild(this._lbl); h.appendChild(bar);
    // mission line (top centre)
    this._mission = document.createElement('div');
    this._mission.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);background:#0009;border:1px solid #b8524a;border-radius:8px;padding:6px 14px;font-size:14px;font-weight:700;color:#f0c24a;text-shadow:0 1px 2px #000;pointer-events:none;text-align:center;max-width:80%';
    h.appendChild(this._mission);
    this._hint = document.createElement('div');
    this._hint.style.cssText = 'position:absolute;left:50%;bottom:92px;transform:translateX(-50%);font-size:13px;opacity:.85;text-shadow:0 1px 3px #000;pointer-events:none;text-align:center;width:90%';
    h.appendChild(this._hint);
    this._banner = document.createElement('div');
    this._banner.style.cssText = 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font-size:28px;font-weight:800;text-align:center;text-shadow:0 2px 8px #000;display:none;width:90%';
    h.appendChild(this._banner);
    // touch stick + buttons
    this._stick = document.createElement('div');
    this._stick.style.cssText = 'position:absolute;left:30px;bottom:30px;width:120px;height:120px;border-radius:50%;background:#fff1;border:2px solid #fff3;display:none';
    this._nub = document.createElement('div'); this._nub.style.cssText = 'position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:#fff6';
    this._stick.appendChild(this._nub); h.appendChild(this._stick);
    const mkBtn = (label, right, bottom) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = `position:absolute;right:${right}px;bottom:${bottom}px;width:76px;height:76px;border-radius:50%;border:2px solid #fff4;background:#0008;color:#fff;font-size:28px;touch-action:none;-webkit-tap-highlight-color:transparent`; h.appendChild(b); return b; };
    this._btnStrike = mkBtn('⚔', 110, 40); this._btnThrow = mkBtn('🗡', 30, 96);
    this._exitBtn = document.createElement('button'); this._exitBtn.textContent = '✕ Call it off';
    this._exitBtn.style.cssText = 'position:absolute;left:50%;top:10px;transform:translateX(-50%);display:none;background:#0009;color:#fff;border:1px solid #fff4;border-radius:8px;padding:6px 14px;font-size:14px;cursor:pointer';
    h.appendChild(this._exitBtn);
    document.body.appendChild(h);
  }
  _setHud() { this._hpBar.style.width = Math.max(0, this.hp) + '%'; this._lbl.textContent = '🗡 × ' + this.daggerN + '   ·   fallen folk: ' + this._casualties; }

  // ---- lifecycle ----------------------------------------------------------
  enter(opts = {}) {
    this._onExit = opts.onExit || (() => {});
    this.active = true; this.hp = 100; this.daggerN = 12; this._casualties = 0; this._over = false;
    this._sword.visible = true;
    // stand the hero at the heart of the ráth
    const m = this.map, c = m.tileToWorld((m.size / 2) | 0, (m.size / 2) | 0);
    this.pos.set(c.x, 0, c.z); this.yaw = 0; this.pitch = 0;
    this._shake = 0.9; this._stepCount = 0; this._lastPhase = 0; // the earth shudders as the giant takes the field
    this._spawnBandit();
    this.hud.style.display = 'block';
    this._mission.textContent = 'An imperial soldier is plundering the ráth — run him down before he reaches the road out!';
    this._hint.textContent = 'move · drag to look · ⚔ strike · 🗡 hurl a dagger · mind the townsfolk';
    this._exitBtn.style.display = this._isTouch() ? 'none' : 'block';
    // name the defender — Deasún Fathaigh, the faceless giant kept to guard the ráth
    this._banner.innerHTML = '<div style="color:#cdb36a">Deasún Fathaigh</div><div style="font-size:14px;opacity:.85;margin-top:6px">the ráth\'s giant takes the field — the ground trembles at his tread</div>';
    this._banner.style.display = 'block';
    setTimeout(() => { if (this.active && !this._over) this._banner.style.display = 'none'; }, 2900);
    this._bind(); this._setHud(); this.onResize();
  }
  exit(result = 'off') {
    this.active = false; this.hud.style.display = 'none'; this._sword.visible = false;
    this._unbind();
    for (const d of this.daggers) this.scene.remove(d.mesh); this.daggers = [];
    for (const p of this.pickups) this.scene.remove(p.mesh); this.pickups = [];
    if (this._bandit) { this._group.remove(this._bandit.chip); if (this._bandit.marker) this._group.remove(this._bandit.marker); this._bandit = null; }
    const cb = this._onExit; this._onExit = null; if (cb) cb(result);
  }
  renderCam() { return this.camera; }
  render(renderer) { renderer.render(this.scene, this.camera); }
  onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
  _isTouch() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  // ---- the thief ----------------------------------------------------------
  _spawnBandit() {
    const chip = makeWalkerChip('man_at_arms', false, 1.05); // an imperial man-at-arms, plundering the ráth
    const m = this.map;
    // start at a store if there is one, else the map entrance
    const stores = this._stores();
    const startTile = stores.length ? (entryRoadTile(m, stores[0]) || { x: stores[0].x, z: stores[0].z }) : { x: m.size - 2, z: 2 };
    const w = m.tileToWorld(startTile.x, startTile.z); chip.position.set(w.x, 0.05, w.z);
    this._group.add(chip);
    // a red chevron so the hunter can mark him across the ráth
    const mk = this._makeMarker(); mk.position.set(w.x, 2.4, w.z); this._group.add(mk);
    this._bandit = { chip, marker: mk, hp: BANDIT_HP, tile: startTile, state: 'loot', path: null, pi: 0, wait: 0, lootLeft: Math.min(4, stores.length), engageT: 0, dead: 0 };
    this._routeToNextStore();
  }
  _makeMarker() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 48; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(220,40,40,0.95)'; x.beginPath(); x.moveTo(24, 6); x.lineTo(42, 30); x.lineTo(6, 30); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,220,220,0.9)'; x.fillRect(20, 30, 8, 12);
    const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, fog: false })); s.renderOrder = 15; s.scale.set(0.7, 0.7, 1);
    return s;
  }
  _stores() { return this.game.buildings.filter((b) => !b.building && (b.def.role === 'granary' || b.def.role === 'market')); }
  _tileCenter(t) { const w = this.map.tileToWorld(t.x, t.z); return new THREE.Vector3(w.x, 0, w.z); }
  _setPath(toTile) {
    const b = this._bandit, from = this.map.worldToTile(b.chip.position.x, b.chip.position.z) || b.tile;
    const path = roadPath(this.map, from, toTile);
    b.path = (path && path.length) ? path : [from, toTile]; // fall back to a straight run if no road links them
    b.pi = 0;
  }
  _routeToNextStore() {
    const b = this._bandit, stores = this._stores();
    if (b.lootLeft > 0 && stores.length) {
      // the nearest store he hasn't just looted
      let best = null, bd = Infinity;
      for (const s of stores) { const t = entryRoadTile(this.map, s) || { x: s.x, z: s.z }; const d = (t.x - b.tile.x) ** 2 + (t.z - b.tile.z) ** 2; if (d > 0.1 && d < bd) { bd = d; best = t; } }
      if (best) { b.target = best; b.state = 'loot'; this._setPath(best); return; }
    }
    this._routeToExit();
  }
  _routeToExit() { const b = this._bandit; b.state = 'flee'; b.target = this.game.entrance; this._setPath(this.game.entrance); this._mission.textContent = 'He breaks for the road out — cut him off!'; }

  // ---- input --------------------------------------------------------------
  _bind() {
    const H = this._handlers;
    H.kd = (e) => { const k = e.key.toLowerCase(); this._keys.add(k); if (k === ' ') this._strike(); if (k === 'f' || k === 'e') this._throw(); };
    H.ku = (e) => this._keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', H.kd); window.addEventListener('keyup', H.ku);
    H.pd = (e) => this._pointerDown(e); H.pm = (e) => this._pointerMove(e); H.pu = (e) => this._pointerUp(e);
    this.hud.addEventListener('pointerdown', H.pd); this.hud.addEventListener('pointermove', H.pm);
    window.addEventListener('pointerup', H.pu);
    this._btnStrike.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._strike(); });
    this._btnThrow.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._throw(); });
    this._exitBtn.addEventListener('click', (e) => { e.stopPropagation(); this.exit('off'); });
  }
  _unbind() {
    const H = this._handlers;
    window.removeEventListener('keydown', H.kd); window.removeEventListener('keyup', H.ku);
    this.hud.removeEventListener('pointerdown', H.pd); this.hud.removeEventListener('pointermove', H.pm);
    window.removeEventListener('pointerup', H.pu);
    this._keys.clear(); this._joy = null; this._look = null;
  }
  _pointerDown(e) {
    if (e.target === this._btnStrike || e.target === this._btnThrow || e.target === this._exitBtn) return;
    if (e.clientX < window.innerWidth * 0.4 && e.clientY > window.innerHeight * 0.45) {
      this._stick.style.display = 'block'; this._stick.style.left = (e.clientX - 60) + 'px'; this._stick.style.top = (e.clientY - 60) + 'px';
      this._joy = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, z: 0 };
    } else { this._look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
  }
  _pointerMove(e) {
    if (this._joy && e.pointerId === this._joy.id) {
      const dx = e.clientX - this._joy.cx, dy = e.clientY - this._joy.cy, cap = 46, l = Math.hypot(dx, dy) || 1, s = Math.min(1, l / cap);
      this._nub.style.left = (35 + (dx / l) * cap * s) + 'px'; this._nub.style.top = (35 + (dy / l) * cap * s) + 'px';
      this._joy.x = (dx / l) * s; this._joy.z = (dy / l) * s;
    }
    if (this._look && e.pointerId === this._look.id) {
      this.yaw -= (e.clientX - this._look.x) * LOOK_SENS;
      this.pitch = Math.max(-1.0, Math.min(1.0, this.pitch - (e.clientY - this._look.y) * LOOK_SENS));
      this._look.x = e.clientX; this._look.y = e.clientY;
    }
  }
  _pointerUp(e) {
    if (this._joy && e.pointerId === this._joy.id) { this._joy = null; this._stick.style.display = 'none'; this._nub.style.left = '35px'; this._nub.style.top = '35px'; }
    if (this._look && e.pointerId === this._look.id) this._look = null;
  }
  _forward() { this.camera.getWorldDirection(TMP); TMP.y = 0; return TMP.normalize(); }
  _blocked(wx, wz) { const t = this.map.worldToTile(wx, wz); if (!t) return true; const c = this.map.get(t.x, t.z); return !!(c && c.blocked); }

  // ---- attacks ------------------------------------------------------------
  _strike() {
    if (!this.active || this._over || this._meleeCd > 0) return;
    this._meleeCd = 0.4; this._swingT = 0.2;
    const f = this._forward().clone(), b = this._bandit;
    if (b && !b.dead) { TMP2.subVectors(b.chip.position, this.pos); TMP2.y = 0; const d = TMP2.length(); if (d <= MELEE_RANGE) { TMP2.normalize(); if (f.dot(TMP2) > 1 - MELEE_ARC) this._woundBandit(MELEE_DMG); } }
  }
  _throw() {
    if (!this.active || this._over || this.daggerN <= 0 || this._throwCd > 0) return;
    this._throwCd = 0.3; this.daggerN -= 1; this._setHud();
    const g = this._daggerMesh(); const dir = this.camera.getWorldDirection(new THREE.Vector3()).normalize(); // aim where you look — down at the small folk
    g.position.copy(this.pos); g.position.y = EYE - 0.2; g.position.addScaledVector(dir, 0.7);
    const vel = dir.multiplyScalar(28);
    this.scene.add(g); this.daggers.push({ mesh: g, vel, life: 2.2 });
  }
  _woundBandit(amt) {
    const b = this._bandit; if (!b || b.dead) return;
    b.hp -= amt; this._flash(b.chip);
    b.state = 'engage'; b.engageT = 2.2; // a hit turns him on you
    if (b.hp <= 0) { b.dead = 0.001; this._end(true); }
  }
  _flash(chip) { const c = chip.material && chip.material.color; if (!c) return; const r = c.r, g = c.g, bl = c.b; c.setRGB(1, 0.4, 0.4); setTimeout(() => { if (chip.material) chip.material.color.setRGB(r, g, bl); }, 110); }
  _hurt(amt) { if (this._over) return; this.hp -= amt; this._hurtFlash = 1; this._setHud(); if (this.hp <= 0) { this.hp = 0; this._end(false, 'beaten'); } }
  _killBystander(w) {
    if (!w || w.done || w === this._bandit) return;
    w.done = true; if (w.sprite) this.game.walkerGroup.remove(w.sprite);
    this._casualties += 1; this.game.silver = Math.max(0, this.game.silver - CASUALTY_SILVER);
    this._mission.textContent = `A townsperson felled in the crossfire — −${CASUALTY_SILVER} silver in lost trade (${this._casualties} fallen).`;
    this._setHud();
  }

  // ---- step ---------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    this._meleeCd = Math.max(0, (this._meleeCd || 0) - dt); this._throwCd = Math.max(0, (this._throwCd || 0) - dt);
    if (this._hurtFlash > 0) { this._hurtFlash = Math.max(0, this._hurtFlash - dt * 2.2); this._vig.style.boxShadow = `inset 0 0 160px 40px rgba(140,10,10,${0.5 * this._hurtFlash})`; }

    // movement
    if (!this._over) {
      let mf = 0, ms = 0;
      if (this._keys.has('w') || this._keys.has('arrowup')) mf += 1;
      if (this._keys.has('s') || this._keys.has('arrowdown')) mf -= 1;
      if (this._keys.has('d') || this._keys.has('arrowright')) ms += 1;
      if (this._keys.has('a') || this._keys.has('arrowleft')) ms -= 1;
      if (this._joy) { mf -= this._joy.z; ms += this._joy.x; }
      const fwd = this._forward(); TMP2.set(-fwd.z, 0, fwd.x);
      let vx = fwd.x * mf + TMP2.x * ms, vz = fwd.z * mf + TMP2.z * ms;
      const mag = Math.hypot(vx, vz); this._moving = mag > 0.001;
      if (this._moving) {
        vx = vx / mag * MOVE_SPD * dt; vz = vz / mag * MOVE_SPD * dt;
        if (!this._blocked(this.pos.x + vx, this.pos.z)) this.pos.x += vx;
        if (!this._blocked(this.pos.x, this.pos.z + vz)) this.pos.z += vz;
      }
    } else this._moving = false;

    // camera + sword
    this._bobT = (this._bobT || 0) + (this._moving ? dt * 9 : 0);
    const bobAmt = (this._bobTarget = (this._bobTarget || 0) + ((this._moving ? 1 : 0) - (this._bobTarget || 0)) * Math.min(1, dt * 6));
    const bob = Math.abs(Math.sin(this._bobT)) * 0.06 * bobAmt;
    // the ground trembles under the giant's first few strides
    const phase = Math.floor(this._bobT / Math.PI);
    if (this._moving && phase !== this._lastPhase) { this._lastPhase = phase; this._stepCount = (this._stepCount || 0) + 1; if (this._stepCount <= 4) this._shake = Math.max(this._shake || 0, 0.6); }
    this._shake = Math.max(0, (this._shake || 0) - dt * 1.8);
    let sx = 0, sy = 0, roll = 0;
    if (this._shake > 0) { const s = this._shake * 0.34; sx = (Math.random() - 0.5) * s; sy = (Math.random() - 0.5) * s; roll = (Math.random() - 0.5) * this._shake * 0.05; }
    this.camera.position.set(this.pos.x + sx, EYE + bob + sy, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, roll);
    this.camera.updateMatrixWorld();
    if (this._sword) { this._swingT = Math.max(0, (this._swingT || 0) - dt); const sw = this._swingT > 0 ? Math.sin((1 - this._swingT / 0.2) * Math.PI) : 0; this._sword.material.rotation = -0.9 * sw; const bp = this._swordBasePos; this._sword.position.set(bp.x + 0.03 * sw, bp.y - Math.abs(Math.sin(this._bobT)) * 0.03 * bobAmt - 0.13 * sw, bp.z + 0.05 * sw); }

    this._updateDaggers(dt);
    this._updateBandit(dt);
  }

  _updateDaggers(dt) {
    for (let i = this.daggers.length - 1; i >= 0; i--) {
      const d = this.daggers[i]; d.life -= dt; d.mesh.position.addScaledVector(d.vel, dt); d.vel.y -= 9 * dt; d.mesh.rotation.x += dt * 22;
      let hit = false;
      const b = this._bandit;
      if (b && !b.dead && d.mesh.position.distanceToSquared(TMP.copy(b.chip.position).setY(b.chip.position.y + 0.5)) < 0.8 * 0.8) { this._woundBandit(DAGGER_DMG); hit = true; }
      if (!hit) { // a stray blade among the townsfolk
        for (const w of this.game.walkers) {
          if (!w || w.done || !w.sprite || w.tag === 'stroll') continue;
          if (d.mesh.position.distanceToSquared(TMP.copy(w.sprite.position).setY(w.sprite.position.y + 0.5)) < 0.7 * 0.7) { this._killBystander(w); hit = true; break; }
        }
      }
      if (hit || d.life <= 0 || d.mesh.position.y < 0.1) {
        this.scene.remove(d.mesh); this.daggers.splice(i, 1);
        if (!hit && d.mesh.position.y < 0.3) { const g = this._daggerMesh(); g.position.set(d.mesh.position.x, 0.3, d.mesh.position.z); g.rotation.set(-Math.PI / 2 - 0.3, 0, 0.2); this.scene.add(g); this.pickups.push({ mesh: g }); }
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) { const pk = this.pickups[i]; if (pk.mesh.position.distanceToSquared(TMP.set(this.pos.x, pk.mesh.position.y, this.pos.z)) < 1.5 * 1.5) { this.scene.remove(pk.mesh); this.pickups.splice(i, 1); this.daggerN += 1; this._setHud(); } }
  }

  _updateBandit(dt) {
    const b = this._bandit; if (!b) return;
    if (b.dead) { b.dead += dt; const k = Math.min(1, b.dead / 0.7); b.chip.material.opacity = 1 - k; b.chip.position.y = 0.05 - k * 0.4; b.marker.visible = false; if (b.dead >= 0.72) { this._group.remove(b.chip); this._group.remove(b.marker); } return; }
    b.marker.position.set(b.chip.position.x, 2.4 + Math.sin((this._bobT || 0) * 2) * 0.1, b.chip.position.z);
    const toHero = TMP2.set(this.pos.x - b.chip.position.x, 0, this.pos.z - b.chip.position.z); const distHero = toHero.length();

    // he turns to fight when the hunter is close
    if (b.state !== 'engage' && distHero < SIGHT) { b.state = 'engage'; b.engageT = 2.0; }

    if (b.state === 'engage') {
      b.engageT -= dt;
      if (b.chip.faceWorld) b.chip.faceWorld(toHero.x, toHero.z);
      if (distHero > 1.8) { const n = toHero.clone().normalize(); const nx = b.chip.position.x + n.x * BANDIT_SPD * 0.9 * dt, nz = b.chip.position.z + n.z * BANDIT_SPD * 0.9 * dt; if (!this._blocked(nx, nz)) { b.chip.position.x = nx; b.chip.position.z = nz; } if (b.chip.animate) b.chip.animate(dt, true); }
      else { if (b.chip.animate) b.chip.animate(dt, false); b.atkCd = (b.atkCd || 0) - dt; if (b.atkCd <= 0) { b.atkCd = 1.2; if (b.chip.strike) b.chip.strike(); this._hurt(12); } }
      if (b.engageT <= 0 && distHero > SIGHT * 0.9) { b.tile = this.map.worldToTile(b.chip.position.x, b.chip.position.z) || b.tile; this._routeToNextStore(); } // broke contact — back to the run
      b.chip.position.y = 0.05; return;
    }

    // loot / flee: follow the road path
    if (!b.path || b.pi >= b.path.length) { if (b.state === 'flee') { this._end(false, 'escaped'); return; } b.wait -= dt; if (b.wait <= 0) { b.lootLeft -= 1; b.tile = this.map.worldToTile(b.chip.position.x, b.chip.position.z) || b.tile; this._routeToNextStore(); } b.chip.position.y = 0.05; if (b.chip.animate) b.chip.animate(dt, false); return; }
    const tgt = this._tileCenter(b.path[b.pi]); const to = TMP.set(tgt.x - b.chip.position.x, 0, tgt.z - b.chip.position.z); const dd = to.length();
    if (dd < 0.25) { b.pi += 1; if (b.pi >= b.path.length && b.state === 'loot') { b.wait = 1.4; this._mission.textContent = 'He ransacks a store — close the distance!'; } }
    else { const n = to.normalize(); b.chip.position.x += n.x * BANDIT_SPD * dt; b.chip.position.z += n.z * BANDIT_SPD * dt; if (b.chip.faceWorld) b.chip.faceWorld(n.x, n.z); if (b.chip.animate) b.chip.animate(dt, true); }
    b.chip.position.y = 0.05;
  }

  _end(won, how) {
    if (this._over) return; this._over = true;
    if (won) { this._banner.innerHTML = '<div style="color:#8fd18f">The soldier is cut down!</div><div style="font-size:15px;opacity:.9;margin-top:8px">The ráth\'s goods are recovered.' + (this._casualties ? ` But ${this._casualties} fell in the chase.` : '') + '</div>'; }
    else if (how === 'beaten') { this._banner.innerHTML = '<div style="color:#d9534f">You are beaten</div><div style="font-size:15px;opacity:.9;margin-top:8px">The soldier slips away in the confusion.</div>'; this.game.cattle = Math.max(0, this.game.cattle - 5); }
    else { this._banner.innerHTML = '<div style="color:#d9534f">The soldier escapes</div><div style="font-size:15px;opacity:.9;margin-top:8px">He makes the road with your cattle — −5 head.</div>'; this.game.cattle = Math.max(0, this.game.cattle - 5); }
    this._banner.style.display = 'block';
    this._exitBtn.style.display = 'block'; this._exitBtn.textContent = '✕ Done';
  }
}
