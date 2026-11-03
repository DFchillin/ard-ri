import * as THREE from 'three';
import { UNIT_TYPES, matchup } from './units.js?v=CBUST';

// The Field View: step off the iso map and into the battle. From the plan view you
// either TAKE THE FIELD TO OBSERVE (a free-flying camera over the clash) or TAKE
// THE FIELD WITH a warrior you have chosen — double-tap one of your own on the iso
// map first — and ride them as the ENCHANTED, first-person, the Eachtra controls.
// You cannot switch bodies in the field: go back to the plan to ride another.
//
// The foe fields ONE appointed shooter (silver X underneath). It looses orbs at
// your enchanted warrior — but only while it is free: march a company onto it and
// it cannot shoot. An orb does full damage to the enchanted (yours) and to that
// shooter, but only a third to any ordinary soul — so the shootout matters, yet
// the sword still decides the day.

const LOOK_SENS = 0.0026;
const FLY_SPD = 11;
const STRIKE_CD = 0.42;
const THROW_CD = 0.7;
const MELEE_REACH = 2.3;
const MELEE_ARC = 0.25;
const SMOKE_CAP = 220;
const OCCUPY_RANGE = 2.2;     // a player within this of the shooter keeps it too busy to shoot
const ORB_WEAK = 1 / 3;       // an orb's bite on an ordinary (non-enchanted) soul
const SHOOT_MIN = 2.4, SHOOT_MAX = 34;
const SLOW_DUR = 5.0;         // seconds (real time) the ride-in plays in slow motion
const SLOW_SCALE = 0.32;      // how slow the world runs during that window

// The war-cry bank — raised in the sky as you take a body. A mix of Irish, English
// and the two woven together. (A living list — we'll keep adding to it.)
const CRIES = [
  'Fág an Bealach!',                       // ga — Clear the way!
  'Lámh Dhearg Abú!',                      // ga — The Red Hand to victory!
  'Buaidh nó Bás!',                        // ga — Victory or death!
  'Éire go deo!',                          // ga — Ireland forever!
  'Cosain an fód!',                        // ga — Hold the sod!
  'Fódla Abú!',                            // ga — up with Ireland!
  'Éirígí — tá an lá linn!',               // ga — Rise, the day is ours!
  'Ár! Ár! Ár!',                           // ga — Slaughter! Slaughter!
  'Fág an Bealach — clear the way!',       // mixed
  'Buaidh nó bás — victory or death!',     // mixed
  'For the ráth! Lámh láidir abú!',        // mixed — the strong hand to victory
  'The Mórrígan is watching — Ár!',        // mixed
  'Cú Chulainn Abú — and no step back!',   // mixed
  'Hold the sod, give no ground!',         // en
  'Blood and the Red Branch!',             // en
  'Into the spears, and never a step back!', // en
  'Let the hills remember this day!',      // en
  'Feed the ravens — forward!',            // en
];

const SKIES = ['sky_earrach', 'sky_samhradh', 'sky_fomhar', 'sky_geimhreadh'];
const TIER = { god: 'gold', hero: 'gold', special: 'blue', seasoned: 'blue', warrior: 'blue', regular: 'green' };
const ORB_RGB = { gold: 0xffcf4a, blue: 0x49a6ff, green: 0x57e079 };

function tierOf(type) { const t = UNIT_TYPES[type]; return TIER[t ? t.cat : 'regular'] || 'blue'; }
function isGod(type) { const t = UNIT_TYPES[type]; return !!t && t.cat === 'god'; }
function unitTall(type) { const t = UNIT_TYPES[type] || {}; return t.battle ? t.battle.h : t.piece ? t.piece.tall + 0.5 : 1.4; }
function labelOf(type) { return (UNIT_TYPES[type] && UNIT_TYPES[type].label) || 'warrior'; }

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
function pipTex() { // a coin-like gold pip with a dark rim — a god's life, readable on any backdrop
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,12,16,0.92)'; x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  const g = x.createRadialGradient(26, 24, 2, 32, 32, 26);
  g.addColorStop(0, '#fff2bf'); g.addColorStop(0.5, '#ffcf4a'); g.addColorStop(1, '#c98a1e');
  x.fillStyle = g; x.beginPath(); x.arc(32, 32, 23, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}
function xTex() { // a silver X — the shooter's mark on the ground
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const stroke = (col, w) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath();
    x.moveTo(30, 30); x.lineTo(98, 98); x.moveTo(98, 30); x.lineTo(30, 98); x.stroke(); };
  stroke('rgba(10,12,16,0.85)', 24);
  const g = x.createLinearGradient(30, 30, 98, 98); g.addColorStop(0, '#f6f8fb'); g.addColorStop(0.5, '#c7ccd4'); g.addColorStop(1, '#eef1f6');
  stroke(g, 14);
  return new THREE.CanvasTexture(c);
}
function ringTex() { // a bright ring — the warrior you have chosen to ride
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(10,12,16,0.7)'; x.lineWidth = 14; x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = '#ffe08a'; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
  return new THREE.CanvasTexture(c);
}

export class FieldView {
  constructor(battle) {
    this.b = battle;
    this.scene = battle.scene;
    this.active = false;
    this.aspect = window.innerWidth / window.innerHeight;
    this.cam = new THREE.PerspectiveCamera(72, this.aspect, 0.05, 700);
    this.cam.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(0, 10, 12);
    this.yaw = 0; this.pitch = -0.5;
    this.possessed = null;          // the enchanted warrior you are riding
    this._chosen = null;            // the warrior picked (double-tap) from the plan view
    this._shooter = null;           // the foe's one appointed shooter
    this._shooterCd = 0;
    this._keys = new Set();
    this._joy = null; this._look = null;
    this._strikeCd = 0; this._throwCd = 0; this._slowT = 0;
    this._shake = 0; this._flashT = 0; this._lightCd = 6 + Math.random() * 6; this._hurtT = 0;
    this._orbTex = softTex(); this._pipTex = pipTex(); this._xTex = xTex(); this._ringTex = ringTex();
    this._tipV = new THREE.Vector3();
    this._smoke = []; this._darts = []; this._eDarts = [];
    this._handlers = {};
    this._built = false;
    this._buildSword();
  }

  // ---- lifecycle ----------------------------------------------------------
  onBattleStart() {
    this._buildSky();
    this._buildSurround();
    this._buildWeather();
    this._dom();
    this._ensureOrbs();
    this._pickShooter();
    this._applyAtmosphere(false);
    this._showPlanButtons(true);
  }
  _applyAtmosphere(on) {
    if (this._dome) this._dome.visible = on;
    if (this._surround) this._surround.visible = on;
    if (this._rain) this._rain.visible = on && this._weather !== 'clear';
    this.scene.fog = on ? this._fog : (this._origFog || null);
    this.scene.background = on ? new THREE.Color(0x9fb4c2) : (this._origBg || new THREE.Color(0x1d2a19));
  }
  reset() { this._clearOrbs(); this._clearSmoke(); this._clearDarts(); this._clearEnemyFire(); this._clearMarkers(); this._chosen = null; this._updateRideLabel(); if (this.active) this._leaveField(); }
  teardown() {
    if (this.active) this._leaveField();
    this._clearOrbs(); this._clearSmoke(); this._clearDarts(); this._clearEnemyFire(); this._clearMarkers();
    this._applyAtmosphere(false);
    this._showPlanButtons(false);
    if (this._returnBtn) this._returnBtn.style.display = 'none';
    if (this._hud) this._hud.style.display = 'none';
  }

  // ---- entering / leaving the field ---------------------------------------
  observe() { if (!this.active) this._enterField(); this.release('silent'); this._setMode('free'); }
  ride() {
    if (!this._chosen || this._chosen.dead) { this._toast('Double-tap one of your warriors on the map to choose who you ride with.'); return; }
    if (!this.active) this._enterField();
    this.possess(this._chosen);
  }
  _enterField() {
    this.active = true;
    this.scene.add(this.cam); // so the held sword (a camera child) renders
    this._ensureOrbs();
    this.pos.set(0, 10, this.b.map.half + 3); this.yaw = 0; this.pitch = -0.55;
    this._applyAtmosphere(true);
    this._hud.style.display = 'block';
    this._showPlanButtons(false);
    if (this._returnBtn) this._returnBtn.style.display = 'block';
    const sb = document.getElementById('battle-sidebar'); if (sb) sb.style.visibility = 'hidden';
    const mc = document.getElementById('map-controls'); if (mc) mc.style.visibility = 'hidden';
    this._bindKeys();
    this._setMode('free');
  }
  _leaveField() {
    this.release('silent');
    this.active = false;
    this.scene.remove(this.cam);
    this._applyAtmosphere(false);
    this._clearEnemyFire();
    if (this._hud) this._hud.style.display = 'none';
    if (this._returnBtn) this._returnBtn.style.display = 'none';
    this._showPlanButtons(true);
    const sb = document.getElementById('battle-sidebar'); if (sb) sb.style.visibility = '';
    const mc = document.getElementById('map-controls'); if (mc) mc.style.visibility = '';
    this._unbindKeys();
    this._slowT = 0;
    if (this._cryEl) this._cryEl.style.display = 'none';
    this._joy = this._look = null;
    if (this._stick) this._stick.style.display = 'none';
  }

  // ---- choosing a rider (from the iso plan view) --------------------------
  chooseRider(u) {
    if (!u || u.dead || u.team !== 'player') return;
    this._chosen = u;
    this._updateRideLabel();
    this.updateMarkers();
    this._toast(`${labelOf(u.type)} will answer your enchantment.`);
  }

  // ---- possession ---------------------------------------------------------
  possess(u) {
    if (!u || u.dead || u.team !== 'player') return;
    this.release('silent');
    this.possessed = u; u.possessed = true;
    const spr = u.mesh.userData.spr; if (spr) spr.visible = false; // first person
    if (this._sword) this._sword.visible = true;
    this._setUnitOrbVisible(u, false);
    this.yaw = Math.atan2(-(u._dx || 0), -(u._dz || -1)) || 0;
    this.pitch = 0; // gaze to the horizon, not down
    this.pos.set(u.pos.x, unitTall(u.type) * 0.92, u.pos.z); // enter exactly at their eye, from frame one
    this.cam.position.copy(this.pos); this.cam.rotation.set(this.pitch, this.yaw, 0);
    this._slowT = SLOW_DUR; // the ride-in runs in slow motion
    this._setMode('possess');
    this._showCry();
    this._banner(`Enchanted — you ride ${labelOf(u.type)}.`, ORB_RGB[tierOf(u.type)]);
  }
  release(mode) {
    const u = this.possessed; if (!u) { if (mode && mode !== 'silent') this._setMode('free'); return; }
    this.possessed = null; u.possessed = false; this._slowT = 0;
    if (this._sword) this._sword.visible = false;
    const spr = u.mesh.userData.spr; if (spr && !u.dead) spr.visible = true;
    if (!u.dead) { this._setUnitOrbVisible(u, true); this.pos.set(u.pos.x, unitTall(u.type) * 0.95 + 0.3, u.pos.z); }
    if (this.active && mode && mode !== 'silent') {
      this._setMode('free');
      if (mode === 'fallen') this._banner('Your enchanted warrior has fallen — return to the plan to ride another.', 0xe0563a);
    }
  }

  // ---- per-frame ----------------------------------------------------------
  update(dt, inBattle) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    if (this._strikeCd > 0) this._strikeCd -= dt;
    if (this._throwCd > 0) this._throwCd -= dt;
    if (this.possessed && this.possessed.dead) this.release('fallen');

    if (this.possessed && inBattle) this._driveUnit(this.possessed, dt);
    else this._flyCam(dt);

    this._placeCam(dt);
    this._updateSword(dt);
    this._updateOrbs(dt);
    this._emitSmoke(dt, inBattle);
    this._updateSmoke(dt);
    this._updateDarts(dt, inBattle);
    this._updateEnemyFire(dt, inBattle);
    this._updateWeather(dt);
    if (this._hurtT > 0) { this._hurtT -= dt; if (this._hurt) this._hurt.style.opacity = String(Math.max(0, this._hurtT * 2.4)); }
    else if (this._hurt && this._hurt.style.opacity !== '0') this._hurt.style.opacity = '0';
  }

  _flyCam(dt) {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0, mz = 0, my = 0;
    if (this._joy) { mx += this._joy.x; mz += -this._joy.z; }
    if (this._keys.has('w') || this._keys.has('arrowup')) mz += 1;
    if (this._keys.has('s') || this._keys.has('arrowdown')) mz -= 1;
    if (this._keys.has('a') || this._keys.has('arrowleft')) mx -= 1;
    if (this._keys.has('d') || this._keys.has('arrowright')) mx += 1;
    if (this._keys.has(' ') || this._keys.has('e') || this._rise) my += 1;
    if (this._keys.has('shift') || this._keys.has('q') || this._fall) my -= 1;
    this.pos.addScaledVector(fwd, mz * FLY_SPD * dt);
    this.pos.addScaledVector(right, mx * FLY_SPD * dt);
    this.pos.y = Math.max(1.2, Math.min(60, this.pos.y + my * FLY_SPD * dt));
    const lim = this.b.map.half + 8;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
  }

  _driveUnit(u, dt) {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0, mz = 0;
    if (this._joy) { mx += this._joy.x; mz += -this._joy.z; }
    if (this._keys.has('w') || this._keys.has('arrowup')) mz += 1;
    if (this._keys.has('s') || this._keys.has('arrowdown')) mz -= 1;
    if (this._keys.has('a') || this._keys.has('arrowleft')) mx -= 1;
    if (this._keys.has('d') || this._keys.has('arrowright')) mx += 1;
    const spd = UNIT_TYPES[u.type].speed * 0.5 * this.b._terrainFactor(u.pos.x, u.pos.z);
    const dx = (fwd.x * mz + right.x * mx), dz = (fwd.z * mz + right.z * mx);
    const m = Math.hypot(dx, dz);
    u._moving = m > 0.05;
    if (u._moving) {
      const lim = this.b.map.half - 0.4;
      u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x + (dx / m) * spd * dt));
      u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z + (dz / m) * spd * dt));
    }
    u.mesh.position.set(u.pos.x, 0, u.pos.z);
    const spr = u.mesh.userData.spr;
    if (spr) { u._dx = fwd.x; u._dz = fwd.z; if (spr.faceWorld) spr.faceWorld(fwd.x, fwd.z); if (spr.animate) spr.animate(dt, u._moving); }
  }

  _placeCam(dt) {
    if (this._shake > 0) this._shake = Math.max(0, this._shake - dt * 2.2);
    if (this.possessed && !this.possessed.dead) {
      const u = this.possessed;
      this.pos.set(u.pos.x, unitTall(u.type) * 0.92, u.pos.z);
    }
    const sx = this._shake ? (Math.random() - 0.5) * this._shake * 0.4 : 0;
    const sy = this._shake ? (Math.random() - 0.5) * this._shake * 0.4 : 0;
    this.cam.position.copy(this.pos);
    this.cam.rotation.set(this.pitch + sy, this.yaw + sx, 0);
  }

  renderCam() { return this.cam; }
  resize(aspect) { this.aspect = aspect; this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
  // The battle asks this each frame for its time scale: the ride-in window slows the
  // whole world; look stays real-time (it isn't dt-driven), so it reads as bullet-time.
  consumeSlowmo(realDt) {
    if (this._slowT > 0 && this.possessed && !this.possessed.dead) { this._slowT -= realDt; return SLOW_SCALE; }
    this._slowT = 0; return 1;
  }

  // ---- the held, smoking blade -------------------------------------------
  _buildSword() {
    this._swordH = 0.74;
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.center.set(0.5, 0.5); s.renderOrder = 20; s.visible = false;
    s.scale.set(this._swordH * 0.45, this._swordH, 1);
    new THREE.TextureLoader().load('assets/weapons/fp_sword0.png?v=CBUST', (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; const im = t.image; if (im && im.width) s.scale.set(this._swordH * (im.width / im.height), this._swordH, 1); });
    this._swordBasePos = new THREE.Vector3(0.23, -0.30, -0.62);
    s.position.copy(this._swordBasePos);
    this.cam.add(s); this._sword = s;
  }
  _updateSword(dt) {
    const s = this._sword; if (!s) return;
    const on = !!(this.possessed && !this.possessed.dead);
    s.visible = on;
    if (!on) return;
    this.cam.updateMatrixWorld();
    this._swingT = Math.max(0, (this._swingT || 0) - dt);
    const swing = this._swingT > 0 ? Math.sin((1 - this._swingT / 0.22) * Math.PI) : 0;
    s.material.rotation = -0.95 * swing;
    const bp = this._swordBasePos;
    s.position.set(bp.x + 0.04 * swing, bp.y - 0.14 * swing, bp.z + 0.06 * swing);
    // the enchanted blade smokes in the rider's own colour
    const tier = tierOf(this.possessed.type);
    this._bladeAcc = (this._bladeAcc || 0) + dt * 24;
    this._tipV.set(bp.x - 0.03, bp.y + this._swordH * 0.5, bp.z); this.cam.localToWorld(this._tipV);
    while (this._bladeAcc >= 1) { this._bladeAcc -= 1; this._spawnSmoke(this._tipV.x, this._tipV.y, this._tipV.z, tier, false); }
  }

  // ---- combat -------------------------------------------------------------
  // An orb's damage: full against the enchanted (your rider) and against the foe's
  // appointed shooter — their duel is a real one — but only a third against any
  // ordinary soul, so orbs can't scythe down a host.
  _orbHit(target, base) {
    const full = target === this.possessed || target === this._shooter;
    return this.b._applyHit(target, base * (full ? 1 : ORB_WEAK));
  }
  _strike() {
    const u = this.possessed; if (!u || u.dead || this._strikeCd > 0) return;
    this._strikeCd = STRIKE_CD; this._swingT = 0.22;
    const spr = u.mesh.userData.spr; if (spr && spr.strike) spr.strike();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let best = null, bd = MELEE_REACH * MELEE_REACH;
    for (const o of this.b.units) {
      if (o.dead || o.team === u.team) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = dx * dx + dz * dz;
      if (d > bd) continue;
      const dn = Math.hypot(dx, dz) || 1;
      if ((dx / dn) * fwd.x + (dz / dn) * fwd.z < 1 - MELEE_ARC - 0.5) continue;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) { for (const bl of this.b.buildings) if (!bl.dead && bl.team !== u.team) { const dx = bl.pos.x - u.pos.x, dz = bl.pos.z - u.pos.z; if (dx * dx + dz * dz < (MELEE_REACH + 1) * (MELEE_REACH + 1)) { best = bl; break; } } }
    if (best) { // the sword bites in full — this is how a host is cleared
      const mult = best.kind === 'building' ? 2.4 : matchup(u.type, best.type);
      const killed = this.b._applyHit(best, u.atk * mult * 1.1);
      this._hitSpark(best.pos.x, (best.kind === 'building' ? 0.8 : unitTall(best.type || 'villager') * 0.5), best.pos.z, killed);
    }
  }
  _throw() {
    const u = this.possessed; if (!u || u.dead || this._throwCd > 0) return;
    this._throwCd = THROW_CD; this._swingT = 0.18;
    const dir = new THREE.Vector3(-Math.sin(this.yaw), Math.sin(this.pitch) * 0.5, -Math.cos(this.yaw)).normalize();
    const mat = new THREE.SpriteMaterial({ map: this._orbTex, color: ORB_RGB[tierOf(u.type)], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.scale.set(0.5, 0.5, 1);
    const eye = unitTall(u.type) * 0.8;
    s.position.set(u.pos.x + dir.x, eye + dir.y, u.pos.z + dir.z);
    this.scene.add(s);
    this._darts.push({ s, u, dir, life: 1.4, spd: 26 });
  }
  _updateDarts(dt, inBattle) {
    for (let i = this._darts.length - 1; i >= 0; i--) {
      const d = this._darts[i]; d.life -= dt;
      d.s.position.addScaledVector(d.dir, d.spd * dt);
      let hit = false;
      if (inBattle) for (const o of this.b.units) {
        if (o.dead || o.team === d.u.team) continue;
        const dx = o.pos.x - d.s.position.x, dz = o.pos.z - d.s.position.z;
        if (dx * dx + dz * dz < 0.9 * 0.9) {
          const killed = this._orbHit(o, d.u.atk * matchup(d.u.type, o.type) * 1.2);
          this._hitSpark(o.pos.x, unitTall(o.type) * 0.5, o.pos.z, killed); hit = true; break;
        }
      }
      if (hit || d.life <= 0 || d.s.position.y < 0) { this.scene.remove(d.s); d.s.material.dispose(); this._darts.splice(i, 1); }
    }
  }
  _hitSpark(x, y, z, big) {
    this._shake = Math.max(this._shake, big ? 0.8 : 0.35);
    for (let i = 0; i < (big ? 10 : 5); i++) this._spawnSmoke(x, y, z, big ? 'gold' : 'blue', true);
  }
  _clearDarts() { for (const d of this._darts) { this.scene.remove(d.s); d.s.material.dispose(); } this._darts = []; }

  // ---- the foe's one appointed shooter ------------------------------------
  _pickShooter() {
    this._shooter = null;
    const live = this.b.units.filter((x) => x.team === 'enemy' && !x.dead && !x.company.routing);
    if (!live.length) return;
    this._shooter = live[Math.floor(Math.random() * live.length)]; // a randomer among the host stands as their shooter
    this._shooterCd = 1.4 + Math.random() * 1.6;
  }
  _shooterOccupied() {
    const s = this._shooter; if (!s) return true;
    for (const o of this.b.units) if (o.team === 'player' && !o.dead && !o.company.routing) {
      const dx = o.pos.x - s.pos.x, dz = o.pos.z - s.pos.z; if (dx * dx + dz * dz < OCCUPY_RANGE * OCCUPY_RANGE) return true;
    }
    return false;
  }
  _updateEnemyFire(dt, inBattle) {
    const u = this.possessed;
    if (this._shooter && (this._shooter.dead || this._shooter.company.routing)) this._shooter = null;
    if (inBattle && u && !u.dead && this._shooter) {
      this._shooterCd -= dt;
      if (this._shooterCd <= 0) {
        const dx = u.pos.x - this._shooter.pos.x, dz = u.pos.z - this._shooter.pos.z, d = Math.hypot(dx, dz);
        if (this._shooterOccupied() || d < SHOOT_MIN || d > SHOOT_MAX) this._shooterCd = 0.5; // held: busy, or no clean shot
        else { this._shooterCd = 1.9 + Math.random() * 1.8; this._fireShooter(); }
      }
    }
    this._updateEnemyDarts(dt, inBattle);
  }
  _fireShooter() {
    const sh = this._shooter, u = this.possessed; if (!sh || !u) return;
    const eye = unitTall(sh.type) * 0.7;
    const ty = unitTall(u.type) * 0.75;
    const dir = new THREE.Vector3(u.pos.x - sh.pos.x, ty - eye, u.pos.z - sh.pos.z).normalize();
    const gold = isGod(sh.type);
    const mat = new THREE.SpriteMaterial({ map: this._orbTex, color: gold ? 0xffd34a : 0xff5a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.scale.set(gold ? 0.62 : 0.5, gold ? 0.62 : 0.5, 1);
    s.position.set(sh.pos.x, eye, sh.pos.z);
    this.scene.add(s);
    this._eDarts.push({ s, dir, life: 2.4, spd: 18, atk: UNIT_TYPES[sh.type].atk, shType: sh.type });
    const spr = sh.mesh.userData.spr; if (spr && spr.strike) spr.strike();
  }
  _updateEnemyDarts(dt, inBattle) {
    const u = this.possessed;
    for (let i = this._eDarts.length - 1; i >= 0; i--) {
      const d = this._eDarts[i]; d.life -= dt;
      if (inBattle && u && !u.dead) { // it homes toward the enchanted — but the shot still travels a line
        const ty = unitTall(u.type) * 0.75;
        const want = new THREE.Vector3(u.pos.x - d.s.position.x, ty - d.s.position.y, u.pos.z - d.s.position.z).normalize();
        d.dir.lerp(want, Math.min(1, 1.8 * dt)).normalize();
      }
      d.s.position.addScaledVector(d.dir, d.spd * dt);
      // anyone of your own standing in the line takes the orb first — screen your
      // enchanted warrior with your bodies and the shot never reaches them.
      let hitU = null, hd = 0.95 * 0.95;
      if (inBattle) for (const o of this.b.units) {
        if (o.dead || o.team !== 'player') continue;
        const dx = o.pos.x - d.s.position.x, dy = unitTall(o.type) * 0.65 - d.s.position.y, dz = o.pos.z - d.s.position.z;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < hd) { hd = dd; hitU = o; }
      }
      if (hitU) {
        const killed = this._orbHit(hitU, d.atk * matchup(d.shType, hitU.type)); // enchanted → full; a screen → only a third
        if (hitU === u) { this._hurtT = 0.55; this._shake = Math.max(this._shake, killed ? 0.95 : 0.55); }
        for (let k = 0; k < 5; k++) this._spawnSmoke(hitU.pos.x, unitTall(hitU.type) * 0.6, hitU.pos.z, tierOf(hitU.type), true);
      }
      if (hitU || d.life <= 0 || d.s.position.y < -0.5) { this.scene.remove(d.s); d.s.material.dispose(); this._eDarts.splice(i, 1); }
    }
  }
  _clearEnemyFire() { for (const d of this._eDarts) { this.scene.remove(d.s); d.s.material.dispose(); } this._eDarts = []; }

  // ---- ground markers (shown in both views during the battle) -------------
  _flatDecal(tex, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 5; return m;
  }
  updateMarkers() {
    // the foe's appointed shooter — a silver X underfoot
    if (this._shooter && (this._shooter.dead || this._shooter.company.routing)) this._shooter = null;
    if (this._shooter) {
      if (!this._xMarker) { this._xMarker = this._flatDecal(this._xTex, 2.1); this.scene.add(this._xMarker); }
      this._xMarker.visible = true; this._xMarker.position.set(this._shooter.pos.x, 0.08, this._shooter.pos.z);
    } else if (this._xMarker) this._xMarker.visible = false;
    // the warrior you have chosen to ride — a gold ring
    if (this._chosen && this._chosen.dead) { this._chosen = null; this._updateRideLabel(); }
    if (this._chosen) {
      if (!this._ringMarker) { this._ringMarker = this._flatDecal(this._ringTex, 1.4); this.scene.add(this._ringMarker); }
      this._ringMarker.visible = true; this._ringMarker.position.set(this._chosen.pos.x, 0.07, this._chosen.pos.z);
    } else if (this._ringMarker) this._ringMarker.visible = false;
  }
  _clearMarkers() {
    for (const k of ['_xMarker', '_ringMarker']) { const m = this[k]; if (m) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this[k] = null; } }
  }

  // ---- soul-orbs ----------------------------------------------------------
  // Ordinary folk wear a single tier-coloured soul-orb. Gods wear up to three gold
  // orbs that wink out as their life fails: three while hale, one when low, none
  // when all but spent — the same read as the gods in the Eachtra.
  _ensureOrbs() {
    for (const u of this.b.units) {
      if (u.dead) continue;
      if (isGod(u.type)) {
        if (u._orbs) continue;
        u._orbs = [0, 1, 2].map(() => {
          // a rimmed gold coin (normal blend, drawn over everything) so a god's life reads on any backdrop
          const mat = new THREE.SpriteMaterial({ map: this._pipTex, transparent: true, opacity: 1, depthWrite: false, depthTest: false, fog: false });
          const s = new THREE.Sprite(mat); s.scale.setScalar(0.55); s.renderOrder = 25; this.scene.add(s); return s;
        });
        u._orbsHidden = (this.possessed === u);
      } else {
        if (u._orb) continue;
        const tier = tierOf(u.type);
        const mat = new THREE.SpriteMaterial({ map: this._orbTex, color: ORB_RGB[tier], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        const orb = new THREE.Sprite(mat);
        orb.userData.sz = (UNIT_TYPES[u.type].cat === 'hero') ? 0.85 : 0.42; orb.scale.setScalar(orb.userData.sz);
        orb.renderOrder = 24; this.scene.add(orb); u._orb = orb;
        if (this.possessed === u) orb.visible = false;
      }
    }
  }
  _setUnitOrbVisible(u, vis) { if (u._orbs) u._orbsHidden = !vis; else if (u._orb) u._orb.visible = vis; }
  _updateOrbs(dt) {
    this._orbT = (this._orbT || 0) + dt;
    for (const u of this.b.units) {
      if (u._orbs) {
        if (u.dead) { for (const s of u._orbs) { this.scene.remove(s); s.material.dispose(); } u._orbs = null; continue; }
        const h = unitTall(u.type), frac = Math.max(0, u.hp) / u.hp0;
        const n = frac > 0.66 ? 3 : frac > 0.33 ? 2 : frac > 0.12 ? 1 : 0; // high→3, low→1, very low→0
        const bob = Math.sin(this._orbT * 2 + u.id) * 0.06;
        for (let i = 0; i < 3; i++) {
          const s = u._orbs[i]; s.visible = !u._orbsHidden && i < n;
          s.position.set(u.pos.x + (i - 1) * 0.46, h + 0.4 + bob, u.pos.z); // a tight row just above the god's head, below the name tag
        }
        continue;
      }
      const orb = u._orb; if (!orb) continue;
      if (u.dead) { this.scene.remove(orb); orb.material.dispose(); u._orb = null; continue; }
      const h = unitTall(u.type);
      orb.position.set(u.pos.x, h + 0.55 + Math.sin(this._orbT * 2 + u.id) * 0.08, u.pos.z);
      orb.material.opacity = 0.72 + Math.sin(this._orbT * 3 + u.id) * 0.18;
    }
  }
  _clearOrbs() {
    for (const u of this.b.units) {
      if (u._orb) { this.scene.remove(u._orb); u._orb.material.dispose(); u._orb = null; }
      if (u._orbs) { for (const s of u._orbs) { this.scene.remove(s); s.material.dispose(); } u._orbs = null; }
    }
  }

  // ---- tinted smoke -------------------------------------------------------
  _emitSmoke(dt, inBattle) {
    for (const u of this.b.units) {
      if (u.dead) continue;
      const tier = tierOf(u.type);
      const base = tier === 'gold' ? 0.32 : tier === 'blue' ? 0.95 : 1.7;
      const iv = (this.possessed === u) ? 0.22 : base;
      u._smT = (u._smT || Math.random() * iv) - dt;
      if (u._smT <= 0) { u._smT = iv; this._spawnSmoke(u.pos.x, unitTall(u.type) * 0.5, u.pos.z, tier, false); }
    }
  }
  _spawnSmoke(x, y, z, tier, burst) {
    if (this._smoke.length >= SMOKE_CAP) return;
    const mat = new THREE.SpriteMaterial({ map: this._orbTex, color: ORB_RGB[tier], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.2;
    s.position.set(x + Math.cos(a) * r, y + Math.random() * 0.2, z + Math.sin(a) * r);
    s.renderOrder = 23; this.scene.add(s);
    this._smoke.push({ s, age: 0, life: burst ? 0.45 + Math.random() * 0.3 : 0.7 + Math.random() * 0.6,
      vy: (burst ? 1.4 : 0.6) * (0.7 + Math.random() * 0.6), sz0: burst ? 0.18 : 0.22, grow: burst ? 1.6 : 2.0, op: burst ? 0.9 : 0.5 });
  }
  _updateSmoke(dt) {
    for (let i = this._smoke.length - 1; i >= 0; i--) {
      const e = this._smoke[i]; e.age += dt;
      if (e.age >= e.life) { this.scene.remove(e.s); e.s.material.dispose(); this._smoke.splice(i, 1); continue; }
      e.s.position.y += e.vy * dt; e.vy *= (1 - 0.5 * dt);
      const t = e.age / e.life;
      e.s.material.opacity = Math.sin(Math.PI * t) * e.op;
      e.s.scale.setScalar(e.sz0 * (1 + (e.grow - 1) * t));
    }
  }
  _clearSmoke() { for (const e of this._smoke) { this.scene.remove(e.s); e.s.material.dispose(); } this._smoke = []; }

  // ---- sky & weather ------------------------------------------------------
  _buildSky() {
    if (this._origFog === undefined) { this._origFog = this.scene.fog || null; this._origBg = this.scene.background || null; }
    if (!this._dome) {
      this._dome = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 14), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, color: 0x9fb4c2 }));
      this._dome.visible = false; this.scene.add(this._dome);
    }
    const sky = SKIES[Math.floor(Math.random() * SKIES.length)];
    new THREE.TextureLoader().load(`assets/sky/${sky}.jpg?v=CBUST`, (t) => { t.colorSpace = THREE.SRGBColorSpace; this._dome.material.map = t; this._dome.material.color.setHex(0xffffff); this._dome.material.needsUpdate = true; });
    this._sky = sky;
    const wintry = sky === 'sky_geimhreadh';
    this._fog = new THREE.Fog(wintry ? 0xaab6c0 : 0xc3cbb6, 24, 170);
  }
  _buildSurround() {
    if (this._surround) return;
    const g = new THREE.Group(); g.visible = false; this._surround = g; this.scene.add(g);
    const half = this.b.map.half;
    const tl = new THREE.TextureLoader();
    const grass = tl.load('assets/terrain/tiles/pasture.png?v=CBUST');
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(70, 70); grass.colorSpace = THREE.SRGBColorSpace;
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshLambertMaterial({ map: grass, fog: true }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.25; g.add(apron);
    const mats = {};
    const matOf = (name) => {
      if (!mats[name]) {
        const m = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.3, fog: true });
        tl.load(`assets/wood/tree_${name}.png?v=CBUST`, (t) => { t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.needsUpdate = true; });
        mats[name] = m;
      }
      return mats[name];
    };
    const addProp = (x, z, name, h, aspect) => {
      const s = new THREE.Sprite(matOf(name)); s.center.set(0.5, 0);
      s.scale.set(h * (aspect || 0.75), h, 1); s.position.set(x, -0.1, z); g.add(s);
    };
    const R = half + 22;
    const canopy = ['oak', 'pine', 'birch', 'rowan', 'hawthorn', 'willow'];
    const fringe = ['gorse', 'bramble', 'fern', 'reeds', 'hawthorn'];
    for (let i = 0; i < 200; i++) {
      let x, z, tries = 0;
      do { x = (Math.random() * 2 - 1) * R; z = (Math.random() * 2 - 1) * R; } while (Math.max(Math.abs(x), Math.abs(z)) < half + 1.4 && ++tries < 8);
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 1.4) continue;
      const back = Math.max(Math.abs(x), Math.abs(z)) - half;
      addProp(x, z, canopy[(Math.random() * canopy.length) | 0], 4.5 + Math.random() * 3.5 + back * 0.12, 0.72);
    }
    for (let i = 0; i < 120; i++) {
      const edge = half + 0.4 + Math.random() * 1.8;
      const along = (Math.random() * 2 - 1) * (half + 1.5);
      const side = Math.floor(Math.random() * 4);
      const x = side === 2 ? -edge : side === 3 ? edge : along;
      const z = side === 0 ? -edge : side === 1 ? edge : along;
      addProp(x, z, fringe[(Math.random() * fringe.length) | 0], 1.1 + Math.random() * 1.3, 0.9);
    }
  }
  _buildWeather() {
    this._weather = Math.random() < 0.45 ? (this._sky === 'sky_geimhreadh' ? 'snow' : 'rain') : 'clear';
    if (!this._rain) {
      const N = 900, R = 40, H = 32;
      this._rainN = N; this._rainR = R; this._rainH = H; this._drop = [];
      const pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) this._drop.push({ x: (Math.random() * 2 - 1) * R, z: (Math.random() * 2 - 1) * R, y: Math.random() * H, len: 0.4 + Math.random() * 0.5, spd: 18 + Math.random() * 10 });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this._rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbcc8d4, transparent: true, opacity: 0.32, fog: true, depthWrite: false }));
      this._rain.frustumCulled = false; this._rain.visible = false; this.scene.add(this._rain);
    }
    this._rain.material.color.setHex(this._weather === 'snow' ? 0xffffff : 0xbcc8d4);
    this._rain.material.opacity = this._weather === 'snow' ? 0.8 : 0.32;
  }
  _updateWeather(dt) {
    if (this._rain && this._rain.visible) {
      const pos = this._rain.geometry.attributes.position.array, H = this._rainH;
      const snow = this._weather === 'snow', slant = snow ? 0.4 : 1.0, fall = snow ? 0.22 : 1.0;
      for (let i = 0; i < this._rainN; i++) {
        const d = this._drop[i]; d.y -= d.spd * fall * dt;
        if (d.y < -2) { d.y = H; d.x = this.pos.x + (Math.random() * 2 - 1) * this._rainR; d.z = this.pos.z + (Math.random() * 2 - 1) * this._rainR; }
        const o = i * 6;
        pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
        pos[o + 3] = d.x + (snow ? (Math.random() - 0.5) * 0.3 : 0.4); pos[o + 4] = d.y - d.len * (snow ? 2 : 6); pos[o + 5] = d.z + slant * 0.2;
      }
      this._rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this._weather === 'rain') {
      this._lightCd -= dt;
      if (this._lightCd <= 0) { this._lightCd = 5 + Math.random() * 8; this._flashT = 0.18; this._shake = Math.max(this._shake, 0.4); }
    }
    if (this._flashT > 0) { this._flashT -= dt; if (this._flash) this._flash.style.opacity = String(Math.max(0, this._flashT * 3.2)); }
    else if (this._flash && this._flash.style.opacity !== '0') this._flash.style.opacity = '0';
  }

  // ---- input --------------------------------------------------------------
  pointerDown(e) {
    const t = e.target;
    if (t && t.closest && t.closest('button')) return;
    e.preventDefault();
    try { t.setPointerCapture(e.pointerId); } catch (_) {}
    if (e.clientX < window.innerWidth * 0.42) {
      this._joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, z: 0 };
      this._stick.style.display = 'block'; this._stick.style.left = (e.clientX - 60) + 'px'; this._stick.style.top = (e.clientY - 60) + 'px';
      this._nub.style.left = '35px'; this._nub.style.top = '35px';
    } else {
      this._look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) };
    }
  }
  pointerMove(e) {
    if (this._joy && e.pointerId === this._joy.id) {
      let dx = e.clientX - this._joy.ox, dy = e.clientY - this._joy.oy; const m = Math.hypot(dx, dy) || 1, cap = 46;
      const cl = Math.min(m, cap); dx = dx / m * cl; dy = dy / m * cl;
      this._nub.style.left = (35 + dx) + 'px'; this._nub.style.top = (35 + dy) + 'px';
      this._joy.x = dx / cap; this._joy.z = dy / cap;
    }
    if (this._look && e.pointerId === this._look.id) {
      const ddx = e.clientX - this._look.x, ddy = e.clientY - this._look.y;
      this._look.moved += Math.abs(ddx) + Math.abs(ddy);
      this.yaw -= ddx * LOOK_SENS;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - ddy * LOOK_SENS));
      this._look.x = e.clientX; this._look.y = e.clientY;
    }
  }
  pointerUp(e) {
    if (this._joy && e.pointerId === this._joy.id) { this._joy = null; this._stick.style.display = 'none'; }
    if (this._look && e.pointerId === this._look.id) {
      const l = this._look; this._look = null;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (this.possessed && l.moved < 10 && (now - l.t) < 300) this._throw(); // a quick tap/click looses the orb
    }
  }

  _bindKeys() {
    const H = this._handlers;
    H.kd = (e) => {
      const k = e.key.toLowerCase(); this._keys.add(k);
      if (k === 'v' || k === 'escape') { this._leaveField(); e.preventDefault(); }
      else if (k === 'r') { if (this.possessed) this.release('eject'); }
      else if (k === ' ') { if (this.possessed) { this._throw(); e.preventDefault(); } } // space looses the orb
      else if (k === 'f') { if (this.possessed) this._strike(); }                        // f swings the sword
    };
    H.ku = (e) => this._keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', H.kd); window.addEventListener('keyup', H.ku);
  }
  _unbindKeys() { const H = this._handlers; if (H.kd) window.removeEventListener('keydown', H.kd); if (H.ku) window.removeEventListener('keyup', H.ku); this._keys.clear(); }

  _setMode(mode) {
    this._mode = mode;
    const poss = mode === 'possess';
    this._btnStrike.style.display = poss ? 'flex' : 'none';
    this._btnThrow.style.display = poss ? 'flex' : 'none';
    this._btnRelease.style.display = poss ? 'flex' : 'none';
    this._btnUp.style.display = poss ? 'none' : 'flex';
    this._btnDown.style.display = poss ? 'none' : 'flex';
    this._cross.style.display = poss ? 'block' : 'none';
    this._hint.textContent = poss ? '' : 'Observing — fly freely. Return to the plan to ride a warrior.';
    this._hint.style.opacity = poss ? '0' : '0.9';
  }

  // ---- DOM ----------------------------------------------------------------
  _dom() {
    if (this._built) return; this._built = true;
    const topBtn = (id, left, html) => {
      const b = document.createElement('button'); b.id = id; b.innerHTML = html;
      b.style.cssText = `position:fixed;top:10px;left:${left};transform:translateX(-50%);z-index:62;background:#13110bdd;color:#f2e6c8;border:1px solid #b89a52;border-radius:9px;padding:7px 15px;font:600 14px Georgia,serif;cursor:pointer;display:none`;
      document.body.appendChild(b); return b;
    };
    this._observeBtn = topBtn('field-observe', 'calc(50% - 96px)', '👁 Observe the field');
    this._rideBtn = topBtn('field-ride', 'calc(50% + 96px)', '⚔ Ride — pick a warrior');
    this._returnBtn = topBtn('field-return', '50%', '🗺 Battle map');
    this._observeBtn.addEventListener('click', () => this.observe());
    this._rideBtn.addEventListener('click', () => this.ride());
    this._returnBtn.addEventListener('click', () => this._leaveField());
    this._toastEl = document.createElement('div');
    this._toastEl.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:62;background:#0b0e14e8;color:#f2e6c8;border:1px solid #6b5a30;border-radius:8px;padding:6px 13px;font:13px Georgia,serif;display:none;max-width:86%;text-align:center';
    document.body.appendChild(this._toastEl);
    // the war-cry, raised high in the sky as you take a body
    this._cryEl = document.createElement('div');
    this._cryEl.style.cssText = 'position:fixed;top:11%;left:50%;transform:translateX(-50%);z-index:61;pointer-events:none;display:none;opacity:0;width:92%;text-align:center;font:800 clamp(28px,6vw,54px) Georgia,serif;color:#ffe49a;text-shadow:0 2px 10px #000,0 0 26px rgba(255,180,60,0.55);letter-spacing:.5px';
    document.body.appendChild(this._cryEl);

    const h = document.createElement('div'); h.id = 'field-hud';
    h.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;color:#eee;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;pointer-events:none';
    this._hud = h;
    this._flash = document.createElement('div');
    this._flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:#eaf0ff;opacity:0';
    h.appendChild(this._flash);
    this._hurt = document.createElement('div');
    this._hurt.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;box-shadow:inset 0 0 150px 45px rgba(190,20,20,0.9)';
    h.appendChild(this._hurt);
    this._cross = document.createElement('div');
    this._cross.style.cssText = 'position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;pointer-events:none;opacity:.7;display:none';
    this._cross.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16"><g stroke="#fff" stroke-width="1.6"><line x1="8" y1="1" x2="8" y2="5"/><line x1="8" y1="11" x2="8" y2="15"/><line x1="1" y1="8" x2="5" y2="8"/><line x1="11" y1="8" x2="15" y2="8"/></g></svg>';
    h.appendChild(this._cross);
    this._hint = document.createElement('div');
    this._hint.style.cssText = 'position:absolute;left:50%;bottom:30px;transform:translateX(-50%);font:13px Georgia,serif;opacity:.9;text-shadow:0 1px 3px #000;pointer-events:none;text-align:center;width:90%';
    h.appendChild(this._hint);
    this._bannerEl = document.createElement('div');
    this._bannerEl.style.cssText = 'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font:800 26px Georgia,serif;text-align:center;text-shadow:0 2px 8px #000;display:none;width:90%;pointer-events:none';
    h.appendChild(this._bannerEl);

    this._stick = document.createElement('div');
    this._stick.style.cssText = 'position:absolute;width:120px;height:120px;border-radius:50%;background:#fff1;border:2px solid #fff3;display:none;pointer-events:none';
    this._nub = document.createElement('div');
    this._nub.style.cssText = 'position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:#fff6';
    this._stick.appendChild(this._nub); h.appendChild(this._stick);

    const mkBtn = (label, css, fn) => {
      const b = document.createElement('button'); b.innerHTML = label;
      b.style.cssText = 'position:absolute;border-radius:50%;border:2px solid #fff4;background:#0008;color:#fff;display:none;align-items:center;justify-content:center;touch-action:none;-webkit-tap-highlight-color:transparent;pointer-events:auto;' + css;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
      h.appendChild(b); return b;
    };
    this._btnStrike = mkBtn('⚔', 'right:108px;bottom:40px;width:76px;height:76px;font-size:28px', () => this._strike());
    this._btnThrow = mkBtn('🗡', 'right:30px;bottom:96px;width:66px;height:66px;font-size:24px', () => this._throw());
    this._btnRelease = mkBtn('⤴', 'right:30px;bottom:176px;width:56px;height:56px;font-size:22px', () => this.release('eject'));
    this._btnUp = mkBtn('▲', 'right:36px;bottom:112px;width:60px;height:60px;font-size:22px', () => {});
    this._btnDown = mkBtn('▼', 'right:36px;bottom:40px;width:60px;height:60px;font-size:22px', () => {});
    const hold = (btn, set) => { btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); set(true); }); const off = (e) => { if (e) e.stopPropagation(); set(false); }; btn.addEventListener('pointerup', off); btn.addEventListener('pointerleave', off); btn.addEventListener('pointercancel', off); };
    hold(this._btnUp, (v) => this._rise = v);
    hold(this._btnDown, (v) => this._fall = v);

    document.body.appendChild(h);
  }
  _showPlanButtons(show) {
    if (this._observeBtn) this._observeBtn.style.display = show ? 'block' : 'none';
    if (this._rideBtn) this._rideBtn.style.display = show ? 'block' : 'none';
  }
  _updateRideLabel() { if (this._rideBtn) this._rideBtn.innerHTML = this._chosen ? `⚔ Ride with ${labelOf(this._chosen.type)}` : '⚔ Ride — pick a warrior'; }
  _showCry() {
    if (!this._cryEl) return;
    this._lastCry = this._cryEl.textContent = CRIES[Math.floor(Math.random() * CRIES.length)];
    this._cryEl.style.transition = 'none'; this._cryEl.style.opacity = '0'; this._cryEl.style.display = 'block';
    requestAnimationFrame(() => { if (this._cryEl) { this._cryEl.style.transition = 'opacity .45s, transform .45s'; this._cryEl.style.opacity = '1'; } });
    clearTimeout(this._cryTo); clearTimeout(this._cryHideTo);
    this._cryTo = setTimeout(() => { if (this._cryEl) this._cryEl.style.opacity = '0'; }, 4500);
    this._cryHideTo = setTimeout(() => { if (this._cryEl) this._cryEl.style.display = 'none'; }, 5100);
  }
  _toast(text) {
    if (!this._toastEl) return;
    this._toastEl.textContent = text; this._toastEl.style.display = 'block';
    clearTimeout(this._toastTo); this._toastTo = setTimeout(() => { if (this._toastEl) this._toastEl.style.display = 'none'; }, 2600);
  }
  _banner(text, color) {
    if (!this._bannerEl) return;
    this._bannerEl.textContent = text;
    this._bannerEl.style.color = color ? '#' + color.toString(16).padStart(6, '0') : '#f2e6c8';
    this._bannerEl.style.display = 'block';
    clearTimeout(this._bannerTo);
    this._bannerTo = setTimeout(() => { if (this._bannerEl) this._bannerEl.style.display = 'none'; }, 2200);
  }
}
