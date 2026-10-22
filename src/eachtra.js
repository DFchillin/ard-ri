import * as THREE from 'three';
import { makeWalkerChip } from './render/chips.js?v=CBUST';
import { setCamera } from './render/assets.js?v=CBUST';

// Eachtra — the Adventure. A vertical slice of the hero's-journey mode: a custom
// champion sent out from the ráth, afoot in a misty wood of the sluagh (the
// restless dead). Classic 2.5D first-person: a perspective eye, billboard foes
// drawn with the settlement's own 8-direction sprites, melee with a sword and a
// throwing spear you can take back up. Shares the cast and world of the city-builder.

const PLAY_R = 27;         // the wood holds the champion within this radius
const EYE = 1.55;          // eye height
const MOVE_SPD = 4.4;
const LOOK_SENS = 0.0026;  // drag-look radians per pixel
const SPEAR_START = 3;
const MELEE_RANGE = 2.4, MELEE_ARC = 0.6; // reach and half-angle of a sword swing
const MELEE_DMG = 34, SPEAR_DMG = 55;
// The host comes in kinds: the shuffling sluagh, and the heavier fomhóraigh brutes
// that soak more and hit harder. More kinds slot in here as their art lands.
const ENEMY_TYPES = {
  sluagh:   { art: 'sluagh',   hp: 55,  spd: 1.95, reach: 1.6, dmg: 10, h: 1.3 },
  wraith:   { art: 'sluagh',   hp: 34,  spd: 2.7,  reach: 1.5, dmg: 7,  h: 1.1 }, // a swift, frail shade (sluagh art, smaller/faster)
  fomorian: { art: 'fomorian', hp: 120, spd: 1.25, reach: 1.95, dmg: 19, h: 1.95 },
};
const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3();

export class Eachtra {
  constructor({ onClose } = {}) {
    this.onClose = onClose || (() => {});
    this.active = false;
    this.aspect = window.innerWidth / window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7c8d87);
    this.scene.fog = new THREE.Fog(0x8a9a93, 6, 40); // a pale cold mist — the dead haunt its edges
    this.camera = new THREE.PerspectiveCamera(74, this.aspect, 0.04, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight(0xc3cdc8, 0x44503f, 1.25));
    const moon = new THREE.DirectionalLight(0xd3ddde, 0.6); moon.position.set(-24, 44, 12); this.scene.add(moon);

    this.trees = [];           // {x, z, r} for collision
    this.enemies = [];
    this.spears = [];          // in-flight spears
    this.pickups = [];         // landed spears to retrieve
    this._buildWood();
    this.chipGroup = new THREE.Group(); this.scene.add(this.chipGroup);

    this.pos = new THREE.Vector3(0, 0, PLAY_R - 6);
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.spearN = SPEAR_START;
    this._swing = 0; this._meleeCd = 0; this._throwCd = 0; this._hurtFlash = 0;
    this._keys = new Set(); this._joy = null; this._look = null;
    this._dom();
    this._handlers = {};
  }

  // ---- world ---------------------------------------------------------------
  _canvasTex(draw, w = 128, h = 128) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
  }
  _buildWood() {
    // mossy forest floor
    const groundTex = this._canvasTex((x, w, h) => {
      x.fillStyle = '#44583a'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1100; i++) { const g = 48 + (Math.random() * 46) | 0; x.fillStyle = `rgb(${g - 10},${g + 16},${g - 8})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, 256, 256);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(24, 24);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(PLAY_R + 14, 48), new THREE.MeshLambertMaterial({ map: groundTex, emissive: 0x1a2416 }));
    ground.rotation.x = -Math.PI / 2; this.scene.add(ground);
    // overcast dome
    const domeTex = this._canvasTex((x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#45525a'); g.addColorStop(0.55, '#6a7a78'); g.addColorStop(1, '#93a19a'); // moody above, pale mist at the treeline
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, 16, 256);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(220, 20, 12), new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.scene.add(dome);

    // billboard trees — a dark pine silhouette, scattered into a wood with a ring
    // of close-packed trunks at the edge so the champion is penned in the clearing.
    const treeTex = this._canvasTex((x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.fillStyle = '#3a2a1c'; x.fillRect(w / 2 - 7, h * 0.62, 14, h * 0.38);            // trunk
      for (let i = 0; i < 3; i++) {                                                       // three stacked boughs
        const cy = h * (0.18 + i * 0.2), cw = w * (0.46 - i * 0.1);
        x.fillStyle = ['#20361f', '#2a4327', '#1b2e1a'][i];
        x.beginPath(); x.moveTo(w / 2, cy); x.lineTo(w / 2 - cw, cy + h * 0.2); x.lineTo(w / 2 + cw, cy + h * 0.2); x.closePath(); x.fill();
      }
    }, 128, 160);
    const treeMat = new THREE.SpriteMaterial({ map: treeTex, transparent: true, alphaTest: 0.3, fog: true });
    const addTree = (x, z, s) => {
      const t = new THREE.Sprite(treeMat); t.center.set(0.5, 0); t.scale.set(3.4 * s, 4.3 * s, 1); t.position.set(x, 0, z);
      this.scene.add(t); this.trees.push({ x, z, r: 0.7 * s });
    };
    let seed = 90210; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    // the wall of trees — a close-packed double ring, tall, so the wood reads as
    // enclosing and you can't see out past the edge of the world
    for (let a = 0; a < Math.PI * 2; a += 0.07) {
      addTree(Math.cos(a) * (PLAY_R + (rnd() - 0.5) * 1.5), Math.sin(a) * (PLAY_R + (rnd() - 0.5) * 1.5), 1.35 + rnd() * 0.5);
      addTree(Math.cos(a + 0.035) * (PLAY_R + 2.4 + rnd() * 1.5), Math.sin(a + 0.035) * (PLAY_R + 2.4 + rnd() * 1.5), 1.5 + rnd() * 0.5);
    }
    for (let i = 0; i < 70; i++) {                                                         // the inner wood, with a loose clearing in the middle
      const a = rnd() * Math.PI * 2, r = 5 + rnd() * (PLAY_R - 6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (x * x + z * z < 36) continue; // keep the heart of the clearing open (room to spawn and move)
      addTree(x, z, 0.7 + rnd() * 0.7);
    }
  }

  // ---- HUD (built in JS so the slice is self-contained) --------------------
  _dom() {
    const h = document.createElement('div'); h.id = 'eachtra-hud'; this.hud = h;
    h.style.cssText = 'position:fixed;inset:0;z-index:40;display:none;font-family:inherit;color:#eee;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden';
    // damage vignette
    this._vig = document.createElement('div');
    this._vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px 40px rgba(140,10,10,0);transition:box-shadow .12s';
    h.appendChild(this._vig);
    // crosshair
    const cross = document.createElement('div');
    cross.style.cssText = 'position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;opacity:.7';
    cross.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18"><g stroke="#fff" stroke-width="1.6"><line x1="9" y1="1" x2="9" y2="6"/><line x1="9" y1="12" x2="9" y2="17"/><line x1="1" y1="9" x2="6" y2="9"/><line x1="12" y1="9" x2="17" y2="9"/></g></svg>';
    h.appendChild(cross);
    // the giant's health, a broad bar across the top, shown only while it stands
    this._bossWrap = document.createElement('div');
    this._bossWrap.style.cssText = 'position:absolute;left:50%;top:44px;transform:translateX(-50%);width:76%;max-width:560px;display:none;pointer-events:none;text-align:center';
    this._bossWrap.innerHTML = '<div style="font-size:13px;color:#e8c06a;text-shadow:0 1px 3px #000;margin-bottom:3px">Fathach · the Fomorian giant</div>';
    const bw = document.createElement('div'); bw.style.cssText = 'height:12px;border:2px solid #000a;border-radius:4px;background:#2a0f0f;overflow:hidden';
    this._bossBar = document.createElement('div'); this._bossBar.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#8a2b6b,#c43a2e)'; bw.appendChild(this._bossBar);
    this._bossWrap.appendChild(bw); h.appendChild(this._bossWrap);
    // first-person sword, swung with a CSS transform
    const wc = document.createElement('canvas'); wc.width = 180; wc.height = 200;
    const x = wc.getContext('2d');
    x.fillStyle = '#6b4a2a'; x.fillRect(150, 150, 16, 50);                 // grip
    x.fillStyle = '#c9a24a'; x.fillRect(142, 138, 32, 14);                 // guard
    const bl = x.createLinearGradient(150, 140, 110, 40); bl.addColorStop(0, '#e8edf2'); bl.addColorStop(1, '#9fb0bd');
    x.fillStyle = bl; x.beginPath(); x.moveTo(150, 140); x.lineTo(166, 140); x.lineTo(150, 30); x.closePath(); x.fill(); // blade
    this._weap = wc;
    wc.style.cssText = 'position:absolute;right:6%;bottom:-14px;width:220px;height:244px;pointer-events:none;transform-origin:85% 95%;transition:transform .09s ease-out';
    h.appendChild(wc);
    // top bars
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:14px;top:12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;text-shadow:0 1px 3px #000';
    this._hpWrap = document.createElement('div'); this._hpWrap.style.cssText = 'width:190px;height:16px;border:2px solid #000a;border-radius:4px;background:#3a0d0d;overflow:hidden';
    this._hpBar = document.createElement('div'); this._hpBar.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#c43a2e,#e4b23a)'; this._hpWrap.appendChild(this._hpBar);
    this._spearLbl = document.createElement('div'); this._spearLbl.style.cssText = 'font-size:15px;font-weight:700';
    bar.appendChild(this._hpWrap); bar.appendChild(this._spearLbl); h.appendChild(bar);
    // hint + banner
    this._hint = document.createElement('div');
    this._hint.style.cssText = 'position:absolute;left:50%;bottom:92px;transform:translateX(-50%);font-size:13px;opacity:.85;text-shadow:0 1px 3px #000;pointer-events:none;text-align:center;width:90%';
    h.appendChild(this._hint);
    this._banner = document.createElement('div');
    this._banner.style.cssText = 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font-size:30px;font-weight:800;text-align:center;text-shadow:0 2px 8px #000;display:none;width:90%';
    h.appendChild(this._banner);
    // touch controls: a move stick (left) and two action buttons (right)
    this._stick = document.createElement('div');
    this._stick.style.cssText = 'position:absolute;left:30px;bottom:30px;width:120px;height:120px;border-radius:50%;background:#fff1;border:2px solid #fff3;display:none';
    this._nub = document.createElement('div');
    this._nub.style.cssText = 'position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:#fff6';
    this._stick.appendChild(this._nub); h.appendChild(this._stick);
    const mkBtn = (label, right, bottom) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = `position:absolute;right:${right}px;bottom:${bottom}px;width:76px;height:76px;border-radius:50%;border:2px solid #fff4;background:#0008;color:#fff;font-size:28px;touch-action:none;-webkit-tap-highlight-color:transparent`; h.appendChild(b); return b; };
    this._btnStrike = mkBtn('⚔', 110, 40);
    this._btnThrow = mkBtn('🗡', 30, 96);
    // exit
    const ex = document.createElement('button'); ex.textContent = '✕ Leave the wood'; this._exitBtn = ex;
    ex.style.cssText = 'position:absolute;left:50%;top:10px;transform:translateX(-50%);background:#0009;color:#fff;border:1px solid #fff3;border-radius:8px;padding:6px 14px;font-size:14px';
    ex.addEventListener('click', () => this.close()); h.appendChild(ex);
    document.body.appendChild(h);
  }

  // ---- lifecycle -----------------------------------------------------------
  open(opts = {}) {
    this._onExit = opts.onExit || (() => {});
    this._result = 'quit';
    this.active = true;
    this.pos.set(0, 0, 0); this.yaw = 0; this.pitch = 0; // stand in the clear heart of the wood, the host closing from all sides
    this.hp = 100; this.spearN = SPEAR_START; this._dead = false; this._cleared = false;
    for (const e of this.enemies) this.chipGroup.remove(e.chip);
    for (const s of this.spears) this.scene.remove(s.mesh);
    for (const pk of this.pickups) this.scene.remove(pk.mesh);
    if (this._boss) this.chipGroup.remove(this._boss.chip);
    for (const p of (this._bossProj || [])) this.scene.remove(p.mesh);
    for (const bm of (this._beams || [])) this.scene.remove(bm.mesh);
    this.enemies = []; this.spears = []; this.pickups = []; this._bossProj = []; this._beams = [];
    this._boss = null; this._bossDone = false; this._wantBoss = !!opts.boss;
    if (this._bossWrap) this._bossWrap.style.display = 'none';
    this._spawnWave(opts.enemies || 5);
    this.hud.style.display = 'block'; this._banner.style.display = 'none';
    this._exitBtn.textContent = '✕ Leave the wood';
    this._hint.textContent = 'move · drag to look · ⚔ strike (a beam flies at full health) · 🗡 hurl a dagger (walk over it to take it up)';
    this._bind(); this._setHud();
    this.onResize();
  }
  close() {
    this.active = false;
    this.hud.style.display = 'none';
    this._unbind();
    const r = this._result;
    this._onExit(r);
  }
  renderCam() { return this.camera; }
  render(renderer) { renderer.render(this.scene, this.camera); }
  onResize() {
    this.aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
  }

  // ---- input ---------------------------------------------------------------
  _bind() {
    const H = this._handlers;
    H.kd = (e) => { const k = e.key.toLowerCase(); this._keys.add(k); if (k === ' ') { this._strike(); e.preventDefault(); } if (k === 'f') this._throw(); if (k === 'escape') this.close(); };
    H.ku = (e) => this._keys.delete(e.key.toLowerCase());
    H.pd = (e) => this._pointerDown(e);
    H.pm = (e) => this._pointerMove(e);
    H.pu = (e) => this._pointerUp(e);
    H.rz = () => this.onResize();
    window.addEventListener('keydown', H.kd); window.addEventListener('keyup', H.ku);
    // All pointer events stay on the HUD and the pointer is captured on press, so a
    // touch drag (move stick / look) is delivered reliably on mobile — window-level
    // move/up miss touches once the browser hands implicit capture to the HUD.
    this.hud.addEventListener('pointerdown', H.pd);
    this.hud.addEventListener('pointermove', H.pm);
    this.hud.addEventListener('pointerup', H.pu);
    this.hud.addEventListener('pointercancel', H.pu);
    window.addEventListener('resize', H.rz);
    const btn = (b, fn) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    btn(this._btnStrike, () => this._strike());
    btn(this._btnThrow, () => this._throw());
  }
  _unbind() {
    const H = this._handlers;
    window.removeEventListener('keydown', H.kd); window.removeEventListener('keyup', H.ku);
    this.hud.removeEventListener('pointerdown', H.pd); this.hud.removeEventListener('pointermove', H.pm);
    this.hud.removeEventListener('pointerup', H.pu); this.hud.removeEventListener('pointercancel', H.pu);
    window.removeEventListener('resize', H.rz);
    this._keys.clear(); this._joy = null; this._look = null;
  }
  _pointerDown(e) {
    if (e.target === this._btnStrike || e.target === this._btnThrow) return;
    e.preventDefault();
    try { this.hud.setPointerCapture(e.pointerId); } catch (_) {} // keep this finger's moves coming to the HUD
    if (e.clientX < window.innerWidth * 0.42) { // left: the move stick springs up where you press
      this._joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, z: 0 };
      this._stick.style.display = 'block'; this._stick.style.left = (e.clientX - 60) + 'px'; this._stick.style.top = (e.clientY - 60) + 'px';
    } else { // right: look
      this._look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }
  _pointerMove(e) {
    if (this._joy && e.pointerId === this._joy.id) {
      let dx = e.clientX - this._joy.ox, dy = e.clientY - this._joy.oy; const m = Math.hypot(dx, dy) || 1, cap = 46;
      const cl = Math.min(m, cap); dx = dx / m * cl; dy = dy / m * cl;
      this._nub.style.left = (35 + dx) + 'px'; this._nub.style.top = (35 + dy) + 'px';
      this._joy.x = dx / cap; this._joy.z = dy / cap;
    }
    if (this._look && e.pointerId === this._look.id) {
      this.yaw -= (e.clientX - this._look.x) * LOOK_SENS;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - (e.clientY - this._look.y) * LOOK_SENS));
      this._look.x = e.clientX; this._look.y = e.clientY;
    }
  }
  _pointerUp(e) {
    if (this._joy && e.pointerId === this._joy.id) { this._joy = null; this._stick.style.display = 'none'; this._nub.style.left = '35px'; this._nub.style.top = '35px'; }
    if (this._look && e.pointerId === this._look.id) this._look = null;
  }

  // ---- combat --------------------------------------------------------------
  _spawnWave(n) {
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      this._spawnEnemy(roll < 0.2 ? 'fomorian' : roll < 0.48 ? 'wraith' : 'sluagh');
    }
  }
  _spawnEnemy(key) {
    const t = ENEMY_TYPES[key];
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * (PLAY_R - 14);
    const chip = makeWalkerChip(t.art, false, t.h);
    chip.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    this.chipGroup.add(chip);
    this.enemies.push({ chip, hp: t.hp, cd: 0, dead: 0, spd: t.spd, reach: t.reach, dmg: t.dmg });
  }
  _forward() { this.camera.getWorldDirection(TMP); TMP.y = 0; return TMP.normalize(); }
  _daggerMesh() { // a short thrown blade (points +z, the travel direction)
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 6), new THREE.MeshLambertMaterial({ color: 0xcfd6dc }));
    blade.position.z = 0.2; blade.rotation.x = Math.PI / 2; g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.05), new THREE.MeshLambertMaterial({ color: 0xc9a24a }));
    g.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
    grip.rotation.x = Math.PI / 2; grip.position.z = -0.13; g.add(grip);
    return g;
  }
  _strike() {
    if (!this.active || this._dead || this._meleeCd > 0) return;
    this._meleeCd = 0.42; this._swing = 0.28;
    this._weap.style.transform = 'rotate(-62deg) translate(-26px,30px)';
    setTimeout(() => { this._weap.style.transform = ''; }, 150);
    const f = this._forward().clone();
    for (const e of this.enemies) {
      if (e.dead) continue;
      TMP2.subVectors(e.chip.position, this.pos); TMP2.y = 0; const d = TMP2.length();
      if (d > MELEE_RANGE) continue;
      TMP2.normalize(); if (f.dot(TMP2) > 1 - MELEE_ARC) this._damage(e, MELEE_DMG);
    }
    if (this._boss && this._boss.state === 'active') { // the giant is a broad target, reached from a little further
      TMP2.subVectors(this._boss.chip.position, this.pos); TMP2.y = 0; const d = TMP2.length();
      if (d <= MELEE_RANGE + 1.8) { TMP2.normalize(); if (f.dot(TMP2) > 1 - MELEE_ARC) this._damageBoss(MELEE_DMG); }
    }
    if (this.hp >= 100) this._fireBeam(); // whole of heart, whole of blade — a beam flies, as it did for the old heroes
  }
  _fireBeam() {
    const dir = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    if (!this._beamTex) this._beamTex = this._canvasTex((x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(240,250,255,1)'); g.addColorStop(0.5, 'rgba(150,210,255,0.8)'); g.addColorStop(1, 'rgba(90,160,255,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h / 2, w / 2, h / 3.2, 0, 0, Math.PI * 2); x.fill();
    }, 64, 64);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(1.1, 0.5, 1); s.position.copy(this.pos); s.position.y = EYE - 0.1; s.position.addScaledVector(dir, 0.6);
    this.scene.add(s);
    this._beams.push({ mesh: s, vel: dir.multiplyScalar(34), life: 0.85 });
  }
  _updateBeams(dt) {
    for (let i = this._beams.length - 1; i >= 0; i--) {
      const bm = this._beams[i]; bm.mesh.position.addScaledVector(bm.vel, dt); bm.life -= dt;
      let hit = false;
      for (const e of this.enemies) { if (e.dead) continue; if (bm.mesh.position.distanceToSquared(TMP.copy(e.chip.position).setY(EYE - 0.1)) < 0.8 * 0.8) { this._damage(e, 30); hit = true; break; } }
      if (!hit && this._boss && this._boss.state === 'active' && bm.mesh.position.distanceToSquared(TMP.copy(this._boss.chip.position).setY(2.2)) < 1.8 * 1.8) { this._damageBoss(30); hit = true; }
      const r2 = bm.mesh.position.x ** 2 + bm.mesh.position.z ** 2;
      if (hit || bm.life <= 0 || r2 > (PLAY_R + 2) ** 2) { this.scene.remove(bm.mesh); this._beams.splice(i, 1); }
    }
  }
  _throw() {
    if (!this.active || this._dead || this.spearN <= 0 || this._throwCd > 0) return;
    this.spearN -= 1; this._throwCd = 0.5; this._setHud();
    const dir = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const g = this._daggerMesh();
    g.position.copy(this.pos); g.position.y = EYE - 0.15;
    this.scene.add(g);
    this.spears.push({ mesh: g, vel: dir.multiplyScalar(26), life: 2.4 });
  }
  _damage(e, amt) {
    e.hp -= amt; if (e.chip.strike) e.chip.strike();
    if (e.hp <= 0 && !e.dead) { e.dead = 0.001; }
  }
  _hurt(amt) {
    if (this._dead) return;
    this.hp -= amt; this._hurtFlash = 1; this._setHud();
    if (this.hp <= 0) { this.hp = 0; this._dead = true; this._end(false); }
  }
  _end(won) {
    this._cleared = won; this._result = won ? 'clear' : 'die';
    if (this._exitBtn) this._exitBtn.textContent = 'Continue ▸';
    this._banner.style.display = 'block';
    this._banner.innerHTML = won
      ? '<div style="color:#e4c76a">The wood is cleared</div><div style="font-size:15px;opacity:.85;margin-top:8px">The sluagh are laid to rest. Tap ✕ to return to the ráth.</div>'
      : '<div style="color:#d9534f">You have fallen</div><div style="font-size:15px;opacity:.85;margin-top:8px">The dead close over you. Tap ✕ to return.</div>';
  }

  // ---- step ----------------------------------------------------------------
  _collide(nx, nz) {
    for (const t of this.trees) { const dx = nx - t.x, dz = nz - t.z, rr = t.r + 0.4; if (dx * dx + dz * dz < rr * rr) return true; }
    return false;
  }
  update(dt) {
    if (!this.active) return;
    setCamera(this.camera); // the enemy billboards pick their facing frame from this eye
    this._meleeCd = Math.max(0, this._meleeCd - dt); this._throwCd = Math.max(0, this._throwCd - dt);
    if (this._hurtFlash > 0) { this._hurtFlash = Math.max(0, this._hurtFlash - dt * 2.2); this._vig.style.boxShadow = `inset 0 0 160px 40px rgba(140,10,10,${0.5 * this._hurtFlash})`; }

    // ---- movement ----
    if (!this._dead) {
      let mf = 0, ms = 0;
      if (this._keys.has('w') || this._keys.has('arrowup')) mf += 1;
      if (this._keys.has('s') || this._keys.has('arrowdown')) mf -= 1;
      if (this._keys.has('d') || this._keys.has('arrowright')) ms += 1;
      if (this._keys.has('a') || this._keys.has('arrowleft')) ms -= 1;
      if (this._joy) { mf -= this._joy.z; ms += this._joy.x; }
      const fwd = this._forward(); TMP2.set(fwd.z, 0, -fwd.x); // right = forward × up
      let vx = fwd.x * mf + TMP2.x * ms, vz = fwd.z * mf + TMP2.z * ms;
      const m = Math.hypot(vx, vz);
      this._moving = m > 0.001;
      if (this._moving) {
        vx = vx / m * MOVE_SPD * dt; vz = vz / m * MOVE_SPD * dt;
        let nx = this.pos.x + vx, nz = this.pos.z + vz;
        const rr = Math.hypot(nx, nz); if (rr > PLAY_R - 1.5) { const k = (PLAY_R - 1.5) / rr; nx *= k; nz *= k; }
        if (!this._collide(nx, this.pos.z)) this.pos.x = nx;
        if (!this._collide(this.pos.x, nz)) this.pos.z = nz;
      }
    } else this._moving = false;
    // Doom-style head-bob: a gentle vertical lope while on the move, eased out at rest.
    this._bobT = (this._bobT || 0) + (this._moving ? dt * 9.5 : 0);
    const bobAmt = (this._bobTarget = (this._bobTarget || 0) + ((this._moving ? 1 : 0) - (this._bobTarget || 0)) * Math.min(1, dt * 6));
    const bob = Math.abs(Math.sin(this._bobT)) * 0.07 * bobAmt;
    this.camera.position.set(this.pos.x, EYE + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this._weap) this._weap.style.marginBottom = (-Math.abs(Math.sin(this._bobT)) * 10 * bobAmt) + 'px'; // the blade lopes with the stride

    // ---- spears in flight ----
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const s = this.spears[i]; s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (s.mesh.position.distanceToSquared(TMP.copy(e.chip.position).setY(EYE - 0.15)) < 0.7 * 0.7) { this._damage(e, SPEAR_DMG); hit = true; break; }
      }
      if (!hit && this._boss && this._boss.state === 'active' && s.mesh.position.distanceToSquared(TMP.copy(this._boss.chip.position).setY(2.2)) < 1.7 * 1.7) { this._damageBoss(SPEAR_DMG); hit = true; }
      const r2 = s.mesh.position.x ** 2 + s.mesh.position.z ** 2;
      if (hit || s.life <= 0 || s.mesh.position.y < 0.1 || r2 > (PLAY_R + 2) ** 2 || this._collide(s.mesh.position.x, s.mesh.position.z)) {
        this.scene.remove(s.mesh); this.spears.splice(i, 1);
        if (!hit) { // it lands — stick it blade-down in the earth as a pickup
          const g = this._daggerMesh();
          g.position.set(Math.max(-PLAY_R + 2, Math.min(PLAY_R - 2, s.mesh.position.x)), 0.32, Math.max(-PLAY_R + 2, Math.min(PLAY_R - 2, s.mesh.position.z)));
          g.rotation.set(-Math.PI / 2 - 0.3, 0, 0.2);
          this.scene.add(g); this.pickups.push({ mesh: g });
        }
      } else { s.mesh.lookAt(TMP.copy(s.mesh.position).add(s.vel)); s.vel.y -= 9 * dt; }
    }
    // retrieve landed spears
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.mesh.position.distanceToSquared(TMP.set(this.pos.x, 0, this.pos.z)) < 1.6 * 1.6) { this.scene.remove(pk.mesh); this.pickups.splice(i, 1); this.spearN += 1; this._setHud(); }
    }

    // ---- enemies ----
    let alive = 0;
    for (const e of this.enemies) {
      if (e.dead) { // dying: sink and fade, then gone
        e.dead += dt; const k = Math.min(1, e.dead / 0.7);
        e.chip.material.opacity = 1 - k; e.chip.position.y = 0.05 - k * 0.5;
        if (e.dead >= 0.72) { this.chipGroup.remove(e.chip); }
        continue;
      }
      alive++;
      TMP2.subVectors(this.pos, e.chip.position); TMP2.y = 0; const d = TMP2.length(); TMP2.normalize();
      e.cd = Math.max(0, e.cd - dt);
      if (this._dead) { /* stand over the fallen */ }
      else if (d > e.reach) {
        let nx = e.chip.position.x + TMP2.x * e.spd * dt, nz = e.chip.position.z + TMP2.z * e.spd * dt;
        if (!this._collide(nx, nz)) { e.chip.position.x = nx; e.chip.position.z = nz; }
        if (e.chip.faceWorld) e.chip.faceWorld(TMP2.x, TMP2.z);
        if (e.chip.animate) e.chip.animate(dt, true);
      } else { // in reach — strike on cooldown
        if (e.chip.faceWorld) e.chip.faceWorld(TMP2.x, TMP2.z);
        if (e.chip.animate) e.chip.animate(dt, false);
        if (e.cd <= 0) { e.cd = 1.1; if (e.chip.strike) e.chip.strike(); this._hurt(e.dmg); }
      }
    }
    this.enemies = this.enemies.filter((e) => !(e.dead && e.dead >= 0.72));
    if (this._boss) this._updateBoss(dt);
    this._updateBossProj(dt);
    this._updateBeams(dt);
    // the chapter clears once the wave is down AND the giant (if any) is laid low
    const waveClear = !this._dead && alive === 0 && this.enemies.every((e) => e.dead);
    if (waveClear && this._wantBoss && !this._boss && !this._bossDone) this._spawnBoss();
    else if (waveClear && (!this._wantBoss || this._bossDone) && !this._cleared) this._end(true);
  }
  // ---- the giant: a Fomorian that erupts from the ground once the wave is cleared,
  // lumbers after the champion and hurls boulders until it is brought down ----
  _spawnBoss() {
    const chip = makeWalkerChip('fomorian', false, 4.6);
    chip.position.set(0, -5, 0); this.chipGroup.add(chip);
    this._boss = { chip, hp: 420, maxHp: 420, state: 'rising', t: 0, cd: 2.2, mcd: 0 };
    this._bossWrap.style.display = 'block'; this._updateBossHud();
    this._hint.textContent = 'A giant of the Fomhóraigh tears itself from the earth — strike and hurl to fell it!';
  }
  _updateBoss(dt) {
    const B = this._boss; if (!B || this._dead) return;
    if (B.state === 'rising') {
      B.t += dt; const k = Math.min(1, B.t / 1.7); B.chip.position.set(0, -5 + k * 5.05, 0);
      if (B.chip.faceWorld) B.chip.faceWorld(this.pos.x, this.pos.z);
      if (k >= 1) { B.state = 'active'; B.t = 0; } return;
    }
    if (B.state === 'dying') {
      B.t += dt; const k = Math.min(1, B.t / 1.5); B.chip.material.opacity = 1 - k; B.chip.position.y = 0.05 - k * 3.5;
      if (k >= 1) { this.chipGroup.remove(B.chip); this._boss = null; this._bossDone = true; this._bossWrap.style.display = 'none'; } return;
    }
    TMP2.subVectors(this.pos, B.chip.position); TMP2.y = 0; const d = TMP2.length(); TMP2.normalize();
    if (d > 3.3) { B.chip.position.x += TMP2.x * 1.5 * dt; B.chip.position.z += TMP2.z * 1.5 * dt; }
    if (B.chip.faceWorld) B.chip.faceWorld(TMP2.x, TMP2.z);
    if (B.chip.animate) B.chip.animate(dt, d > 3.3);
    B.mcd = Math.max(0, B.mcd - dt);
    if (d < 3.6 && B.mcd <= 0) { B.mcd = 1.5; if (B.chip.strike) B.chip.strike(); this._hurt(22); }
    B.cd -= dt; if (B.cd <= 0) { B.cd = 2.1 + Math.random() * 0.9; this._bossLob(); }
  }
  _bossLob() {
    const from = TMP.copy(this._boss.chip.position); from.y = 3.2;
    const tx = this.pos.x, tz = this.pos.z, ty = EYE - 0.2;
    const flat = Math.hypot(tx - from.x, tz - from.z), g = 16, t = Math.max(0.55, flat / 11);
    const vx = (tx - from.x) / t, vz = (tz - from.z) / t, vy = (ty - from.y) / t + 0.5 * g * t;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshLambertMaterial({ color: 0x6b6256 }));
    rock.position.copy(from); this.scene.add(rock);
    this._bossProj.push({ mesh: rock, vel: new THREE.Vector3(vx, vy, vz), g, life: 4 });
  }
  _updateBossProj(dt) {
    for (let i = this._bossProj.length - 1; i >= 0; i--) {
      const p = this._bossProj[i]; p.vel.y -= p.g * dt; p.mesh.position.addScaledVector(p.vel, dt); p.life -= dt;
      p.mesh.rotation.x += dt * 6; p.mesh.rotation.y += dt * 4;
      if (!this._dead && p.mesh.position.distanceToSquared(TMP.set(this.pos.x, EYE - 0.2, this.pos.z)) < 1.05 * 1.05) { this._hurt(16); this.scene.remove(p.mesh); this._bossProj.splice(i, 1); }
      else if (p.mesh.position.y < 0.15 || p.life <= 0) { this.scene.remove(p.mesh); this._bossProj.splice(i, 1); }
    }
  }
  _damageBoss(amt) {
    const B = this._boss; if (!B || B.state !== 'active') return;
    B.hp -= amt; if (B.chip.strike) B.chip.strike(); this._updateBossHud();
    if (B.hp <= 0) { B.state = 'dying'; B.t = 0; }
  }
  _updateBossHud() { if (this._boss) this._bossBar.style.width = Math.max(0, (this._boss.hp / this._boss.maxHp) * 100) + '%'; }
  _setHud() {
    this._hpBar.style.width = Math.max(0, this.hp) + '%';
    this._spearLbl.textContent = '🗡 × ' + this.spearN;
  }
}
