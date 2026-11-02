import * as THREE from 'three';
import { UNIT_TYPES, matchup } from './units.js?v=CBUST';

// The Field View: step down off the iso map and into the battle itself. A free-
// flying spectator camera soars over the live clash; tap a warrior and you take
// their body — first-person, the same controls as the Eachtra — and fight in the
// line until you fall or let them go. Every soul on the field wears a soul-orb:
// gold for gods and demigods, blue for the trained, green for the folk of the
// túath, and their rising smoke burns the same colour.

const LOOK_SENS = 0.0026;
const FLY_SPD = 11;          // free-cam metres/sec
const STRIKE_CD = 0.42;
const THROW_CD = 0.7;
const MELEE_REACH = 2.3;
const MELEE_ARC = 0.25;      // 1 - dot: a ~75° frontal cone
const SMOKE_CAP = 150;

const SKIES = ['sky_earrach', 'sky_samhradh', 'sky_fomhar', 'sky_geimhreadh'];
// orb/smoke colour by the unit's category — the three tiers the player asked for
const TIER = { god: 'gold', hero: 'gold', special: 'blue', seasoned: 'blue', warrior: 'blue', regular: 'green' };
const ORB_RGB = { gold: 0xffcf4a, blue: 0x49a6ff, green: 0x57e079 };

function tierOf(type) { const t = UNIT_TYPES[type]; return TIER[t ? t.cat : 'regular'] || 'blue'; }
function unitTall(type) { const t = UNIT_TYPES[type] || {}; return t.battle ? t.battle.h : t.piece ? t.piece.tall + 0.5 : 1.4; }

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
    this.possessed = null;
    this._keys = new Set();
    this._joy = null; this._look = null; this._tapCand = null;
    this._strikeCd = 0; this._throwCd = 0;
    this._shake = 0; this._flashT = 0; this._lightCd = 6 + Math.random() * 6;
    this._orbTex = softTex();
    this._smoke = []; this._darts = [];
    this._eDarts = []; this._shooters = []; this._hurtT = 0; // the foe's return fire
    this._handlers = {};
    this._built = false;
  }

  // ---- lifecycle ----------------------------------------------------------
  onBattleStart() {
    this._buildSky();
    this._buildSurround();
    this._buildWeather();
    this._dom();
    this._ensureOrbs();
    this._applyAtmosphere(false); // sky/fog belong to the field view only — never the iso map
    this._toggleBtn.style.display = 'block';
  }
  // The sky dome, fog and weather live on the shared scene, but must only show
  // under the perspective field camera — the orthographic iso view washes to the
  // fog colour otherwise (the "everything went white" bug). Toggle them with the view.
  _applyAtmosphere(on) {
    if (this._dome) this._dome.visible = on;
    if (this._surround) this._surround.visible = on;
    if (this._rain) this._rain.visible = on && this._weather !== 'clear';
    this.scene.fog = on ? this._fog : (this._origFog || null);
    this.scene.background = on ? new THREE.Color(0x9fb4c2) : (this._origBg || new THREE.Color(0x1d2a19));
  }
  reset() { this._clearOrbs(); this._clearSmoke(); this._clearDarts(); this._clearEnemyFire(); if (this.active) this._leaveField(); }
  teardown() {
    if (this.active) this._leaveField();
    this._clearOrbs(); this._clearSmoke(); this._clearDarts(); this._clearEnemyFire();
    this._applyAtmosphere(false);
    if (this._toggleBtn) this._toggleBtn.style.display = 'none';
    if (this._hud) this._hud.style.display = 'none';
  }

  toggle() { this.active ? this._leaveField() : this._enterField(); }
  _enterField() {
    this.active = true;
    this._ensureOrbs();
    // start the free-cam above the player's side, gazing toward the foe
    this.pos.set(0, 10, this.b.map.half + 3); this.yaw = 0; this.pitch = -0.55;
    this._applyAtmosphere(true);
    this._hud.style.display = 'block';
    this._toggleBtn.innerHTML = '🗺 Battle map';
    const sb = document.getElementById('battle-sidebar'); if (sb) sb.style.visibility = 'hidden';
    const mc = document.getElementById('map-controls'); if (mc) mc.style.visibility = 'hidden'; // iso rotate/zoom do nothing here
    this._bindKeys();
    this._setMode('free');
  }
  _leaveField() {
    this.release('silent');
    this.active = false;
    this._applyAtmosphere(false);
    this._clearEnemyFire();
    if (this._hud) this._hud.style.display = 'none';
    if (this._toggleBtn) this._toggleBtn.innerHTML = '⚔ Enter the field';
    const sb = document.getElementById('battle-sidebar'); if (sb) sb.style.visibility = '';
    const mc = document.getElementById('map-controls'); if (mc) mc.style.visibility = '';
    this._unbindKeys();
    this._joy = this._look = this._tapCand = null;
    if (this._stick) this._stick.style.display = 'none';
  }

  // ---- possession ---------------------------------------------------------
  possess(u) {
    if (!u || u.dead || u.team !== 'player') return;
    this.release('silent');
    this.possessed = u; u.possessed = true;
    const spr = u.mesh.userData.spr; if (spr) spr.visible = false; // first person: step inside the body
    if (u._orb) u._orb.visible = false;
    this.yaw = Math.atan2(-(u._dx || 0), -(u._dz || -1)) || 0;
    this._setMode('possess');
    this._banner(`You take ${UNIT_TYPES[u.type].label} — fight!`, ORB_RGB[tierOf(u.type)]);
  }
  release(mode) {
    const u = this.possessed; if (!u) { if (mode !== 'silent') this._setMode('free'); return; }
    this.possessed = null; u.possessed = false;
    const spr = u.mesh.userData.spr; if (spr && !u.dead) spr.visible = true;
    if (u._orb && !u.dead) u._orb.visible = true;
    if (!u.dead) { this.pos.set(u.pos.x, unitTall(u.type) * 0.95 + 0.3, u.pos.z); } // step out where they stood
    if (this.active && mode !== 'silent') { this._setMode('free'); if (mode === 'fallen') this._banner('Your vessel has fallen. Choose another.', 0xe0563a); }
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

  // ---- combat -------------------------------------------------------------
  _strike() {
    const u = this.possessed; if (!u || u.dead || this._strikeCd > 0) return;
    this._strikeCd = STRIKE_CD;
    const spr = u.mesh.userData.spr; if (spr && spr.strike) spr.strike();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let best = null, bd = MELEE_REACH * MELEE_REACH;
    for (const o of this.b.units) {
      if (o.dead || o.team === u.team) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = dx * dx + dz * dz;
      if (d > bd) continue;
      const dn = Math.hypot(dx, dz) || 1;
      if ((dx / dn) * fwd.x + (dz / dn) * fwd.z < 1 - MELEE_ARC - 0.5) continue; // roughly in front
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) { for (const bl of this.b.buildings) if (!bl.dead && bl.team !== u.team) { const dx = bl.pos.x - u.pos.x, dz = bl.pos.z - u.pos.z; if (dx * dx + dz * dz < (MELEE_REACH + 1) * (MELEE_REACH + 1)) { best = bl; break; } } }
    if (best) {
      const mult = best.kind === 'building' ? 2.4 : matchup(u.type, best.type);
      const killed = this.b._applyHit(best, u.atk * mult * 1.1);
      this._hitSpark(best.pos.x, (best.kind === 'building' ? 0.8 : unitTall(best.type || 'villager') * 0.5), best.pos.z, killed);
    }
  }
  _throw() {
    const u = this.possessed; if (!u || u.dead || this._throwCd > 0) return;
    this._throwCd = THROW_CD;
    const spr = u.mesh.userData.spr; if (spr && spr.strike) spr.strike();
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
          const killed = this.b._applyHit(o, d.u.atk * matchup(d.u.type, o.type) * 1.2);
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

  // ---- the foe fires back -------------------------------------------------
  // So a possessed archer isn't picking a host apart untouched: a handful of the
  // enemy are told off as shooters (at least one), and they loose back at you
  // whenever you fight from range. They home a little, so standing off is no safe.
  _updateEnemyFire(dt, inBattle) {
    const u = this.possessed;
    if (!inBattle || !u || u.dead) { if (this._shooters.length) this._shooters = []; this._updateEnemyDarts(dt, false); return; }
    this._shooters = this._shooters.filter((s) => s.u && !s.u.dead && !s.u.company.routing);
    const live = this.b.units.filter((x) => x.team === 'enemy' && !x.dead && !x.company.routing);
    const want = Math.max(1, Math.round(live.length / 5));
    if (this._shooters.length < want && live.length) {
      const have = new Set(this._shooters.map((s) => s.u));
      const pool = live.filter((x) => !have.has(x));
      for (let i = this._shooters.length; i < want && pool.length; i++) {
        const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        this._shooters.push({ u: pick, cd: 0.8 + Math.random() * 1.6 });
      }
    }
    for (const s of this._shooters) {
      s.cd -= dt; if (s.cd > 0) continue;
      const dx = u.pos.x - s.u.pos.x, dz = u.pos.z - s.u.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.2 || d > 30) { s.cd = 0.6; continue; } // in melee it swings instead; too far, it holds
      s.cd = 1.6 + Math.random() * 1.8;
      this._fireEnemy(s.u);
    }
    this._updateEnemyDarts(dt, true);
  }
  _fireEnemy(shooter) {
    const u = this.possessed; if (!u) return;
    const eye = unitTall(shooter.type) * 0.7;
    const tx = u.pos.x, ty = unitTall(u.type) * 0.75, tz = u.pos.z;
    const dir = new THREE.Vector3(tx - shooter.pos.x, ty - eye, tz - shooter.pos.z).normalize();
    const mat = new THREE.SpriteMaterial({ map: this._orbTex, color: 0xff5a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.scale.set(0.5, 0.5, 1);
    s.position.set(shooter.pos.x, eye, shooter.pos.z);
    this.scene.add(s);
    const dmg = UNIT_TYPES[shooter.type].atk * matchup(shooter.type, u.type) * 0.55;
    this._eDarts.push({ s, dir, life: 2.2, spd: 17, dmg });
    const spr = shooter.mesh.userData.spr; if (spr && spr.strike) spr.strike();
  }
  _updateEnemyDarts(dt, inBattle) {
    const u = this.possessed;
    for (let i = this._eDarts.length - 1; i >= 0; i--) {
      const d = this._eDarts[i]; d.life -= dt;
      if (inBattle && u && !u.dead) { // gentle homing so standing still is deadly, dodging works
        const tx = u.pos.x, ty = unitTall(u.type) * 0.75, tz = u.pos.z;
        const want = new THREE.Vector3(tx - d.s.position.x, ty - d.s.position.y, tz - d.s.position.z).normalize();
        d.dir.lerp(want, Math.min(1, 2.0 * dt)).normalize();
      }
      d.s.position.addScaledVector(d.dir, d.spd * dt);
      let hit = false;
      if (inBattle && u && !u.dead) {
        const dx = u.pos.x - d.s.position.x, dy = unitTall(u.type) * 0.75 - d.s.position.y, dz = u.pos.z - d.s.position.z;
        if (dx * dx + dy * dy + dz * dz < 0.9 * 0.9) {
          const killed = this.b._applyHit(u, d.dmg);
          this._hurtT = 0.5; this._shake = Math.max(this._shake, killed ? 0.9 : 0.5);
          for (let k = 0; k < 4; k++) this._spawnSmoke(u.pos.x, unitTall(u.type) * 0.6, u.pos.z, tierOf(u.type), true);
          hit = true;
        }
      }
      if (hit || d.life <= 0 || d.s.position.y < -0.5) { this.scene.remove(d.s); d.s.material.dispose(); this._eDarts.splice(i, 1); }
    }
  }
  _clearEnemyFire() { for (const d of this._eDarts) { this.scene.remove(d.s); d.s.material.dispose(); } this._eDarts = []; this._shooters = []; }

  // ---- soul-orbs ----------------------------------------------------------
  _ensureOrbs() {
    for (const u of this.b.units) {
      if (u.dead || u._orb) continue;
      const tier = tierOf(u.type);
      const mat = new THREE.SpriteMaterial({ map: this._orbTex, color: ORB_RGB[tier], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const orb = new THREE.Sprite(mat);
      const big = UNIT_TYPES[u.type].cat === 'god' || UNIT_TYPES[u.type].cat === 'hero';
      orb.userData.sz = big ? 0.85 : 0.42; orb.scale.setScalar(orb.userData.sz);
      orb.userData.tier = tier; orb.renderOrder = 24;
      this.scene.add(orb); u._orb = orb;
      if (this.possessed === u) orb.visible = false;
    }
  }
  _updateOrbs(dt) {
    this._orbT = (this._orbT || 0) + dt;
    for (const u of this.b.units) {
      const orb = u._orb; if (!orb) continue;
      if (u.dead) { this.scene.remove(orb); orb.material.dispose(); u._orb = null; continue; }
      const h = unitTall(u.type);
      orb.position.set(u.pos.x, h + 0.55 + Math.sin(this._orbT * 2 + u.id) * 0.08, u.pos.z);
      orb.material.opacity = 0.72 + Math.sin(this._orbT * 3 + u.id) * 0.18;
    }
  }
  _clearOrbs() { for (const u of this.b.units) if (u._orb) { this.scene.remove(u._orb); u._orb.material.dispose(); u._orb = null; } }

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
    this._fog = new THREE.Fog(wintry ? 0xaab6c0 : 0xc3cbb6, 24, 170); // held, applied only in the field view
  }
  // Frame the battlefield so it doesn't read as a chessboard floating in the sky:
  // a pasture apron running out to the horizon, a band of tall trees ringing the
  // pitch, and a low shrub fringe hiding the lip. Field-view only (toggled with
  // the atmosphere), built once.
  _buildSurround() {
    if (this._surround) return;
    const g = new THREE.Group(); g.visible = false; this._surround = g; this.scene.add(g);
    const half = this.b.map.half;
    const tl = new THREE.TextureLoader();
    // ground apron: sits just below the battlefield tiles so theirs always win,
    // and runs far enough to fall into the fog at the horizon
    const grass = tl.load('assets/terrain/tiles/pasture.png?v=CBUST');
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(70, 70); grass.colorSpace = THREE.SRGBColorSpace;
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshLambertMaterial({ map: grass, fog: true }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.25; g.add(apron);
    // one shared billboard material per species, so hundreds of trees are cheap
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
    // a deep band of tall trees around the pitch (square ring: never on the field)
    for (let i = 0; i < 200; i++) {
      let x, z, tries = 0;
      do { x = (Math.random() * 2 - 1) * R; z = (Math.random() * 2 - 1) * R; } while (Math.max(Math.abs(x), Math.abs(z)) < half + 1.4 && ++tries < 8);
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 1.4) continue;
      const back = Math.max(Math.abs(x), Math.abs(z)) - half; // taller the further out
      addProp(x, z, canopy[(Math.random() * canopy.length) | 0], 4.5 + Math.random() * 3.5 + back * 0.12, 0.72);
    }
    // a low shrub fringe hugging the very edge to hide the drop-off lip
    for (let i = 0; i < 120; i++) {
      const edge = half + 0.4 + Math.random() * 1.8;
      const along = (Math.random() * 2 - 1) * (half + 1.5);
      const side = Math.floor(Math.random() * 4);
      const x = side === 0 ? along : side === 1 ? along : (side === 2 ? -edge : edge);
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
    // lightning when it storms
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
    try { t.setPointerCapture(e.pointerId); } catch (_) {} // capture on the canvas (the event target) so drags keep coming
    if (e.clientX < window.innerWidth * 0.42) {
      this._joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, z: 0 };
      this._stick.style.display = 'block'; this._stick.style.left = (e.clientX - 60) + 'px'; this._stick.style.top = (e.clientY - 60) + 'px';
      this._nub.style.left = '35px'; this._nub.style.top = '35px';
    } else {
      this._look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      this._tapCand = { x: e.clientX, y: e.clientY, t: performance.now() };
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
      const tap = this._tapCand;
      const quick = tap && (performance.now() - tap.t) < 320 && this._look.moved < 10;
      this._look = null; this._tapCand = null;
      if (quick && !this.possessed) this._tapPossess(tap.x, tap.y);
    }
  }
  _tapPossess(px, py) {
    const ndc = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    const ray = this.b.raycaster; ray.setFromCamera(ndc, this.cam);
    const hit = ray.intersectObject(this.b.pickPlane)[0]; if (!hit) return;
    let best = null, bd = 2.0 * 2.0;
    for (const u of this.b.units) {
      if (u.dead || u.team !== 'player' || u.company.routing) continue;
      const dx = u.pos.x - hit.point.x, dz = u.pos.z - hit.point.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = u; }
    }
    if (best) this.possess(best); else this._banner('No warrior of yours there — tap one of your own.', 0xd8d2c0);
  }

  _bindKeys() {
    const H = this._handlers;
    H.kd = (e) => {
      const k = e.key.toLowerCase(); this._keys.add(k);
      if (k === 'v') { this.toggle(); e.preventDefault(); }
      else if (k === 'escape' || k === 'r') { if (this.possessed) this.release('eject'); }
      else if (k === ' ') { if (this.possessed) { this._strike(); e.preventDefault(); } }
      else if (k === 'f') { if (this.possessed) this._throw(); }
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
    this._hint.textContent = poss ? '' : 'Fly the field — tap one of your own to take their body';
    this._hint.style.opacity = poss ? '0' : '0.9';
  }

  // ---- DOM ----------------------------------------------------------------
  _dom() {
    if (this._built) return; this._built = true;
    const mkToggle = () => {
      const b = document.createElement('button'); b.id = 'field-toggle';
      b.innerHTML = '⚔ Enter the field';
      b.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:62;background:#13110bdd;color:#f2e6c8;border:1px solid #b89a52;border-radius:9px;padding:7px 15px;font:600 14px Georgia,serif;cursor:pointer;display:none';
      b.addEventListener('click', () => this.toggle());
      document.body.appendChild(b); return b;
    };
    this._toggleBtn = mkToggle();

    const h = document.createElement('div'); h.id = 'field-hud';
    // pointer-events:none so look/move/tap fall through to the canvas (which owns
    // the pointer listeners); only the buttons below re-enable pointer-events.
    h.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;color:#eee;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;pointer-events:none';
    this._hud = h;
    this._flash = document.createElement('div');
    this._flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:#eaf0ff;opacity:0';
    h.appendChild(this._flash);
    this._hurt = document.createElement('div'); // red edge-glow when the foe's fire lands on you
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

    // move stick (springs up where you press, left half)
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
  _banner(text, color) {
    if (!this._bannerEl) return;
    this._bannerEl.textContent = text;
    this._bannerEl.style.color = color ? '#' + color.toString(16).padStart(6, '0') : '#f2e6c8';
    this._bannerEl.style.display = 'block';
    clearTimeout(this._bannerTo);
    this._bannerTo = setTimeout(() => { if (this._bannerEl) this._bannerEl.style.display = 'none'; }, 2200);
  }
}
