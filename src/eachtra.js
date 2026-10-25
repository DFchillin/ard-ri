import * as THREE from 'three';
import { makeWalkerChip, makeWarriorChip } from './render/chips.js?v=CBUST';
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
const SPEAR_START = 30; // a bandolier of throwing daggers
const MELEE_RANGE = 2.4, MELEE_ARC = 0.6; // reach and half-angle of a sword swing
const MELEE_DMG = 34, SPEAR_DMG = 55, BEAM_DMG = 30;
const BEAM_MULTI = 60, BEAM_SINGLE = 20; // ≥60% HP looses a spread of beams, ≥20% a single, below that melee only
const ROOM_H = 4.0, ROOM_WALL = 3.4; // half-extent and wall height of a cottage interior (built at the origin, shown one at a time)
// Two kinds of foe, each with its own cunning: the floating sluagh that rises,
// looses an orb and slips to cover, and the fomhórach brute that strides in and
// needs three solid hits to fell.
const ENEMY_TYPES = {
  sluagh:   { art: 'sluagh',   hp: 22,  h: 1.35 }, // frail floating caster
  fomorian: { art: 'fomorian', hits: 3, spd: 1.25, reach: 2.0, dmg: 18, h: 1.95 }, // brute — three hits to fell
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
    this._woodBg = this.scene.background; this._woodFog = this.scene.fog; // restored when leaving a cottage
    this.camera = new THREE.PerspectiveCamera(74, this.aspect, 0.04, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight(0xc3cdc8, 0x44503f, 1.25));
    const moon = new THREE.DirectionalLight(0xd3ddde, 0.6); moon.position.set(-24, 44, 12); this.scene.add(moon);

    this.trees = [];           // {x, z, r} for collision
    this.enemies = [];
    this.spears = [];          // in-flight spears
    this.pickups = [];         // landed spears to retrieve
    this._woodObjs = [];       // ground, sky, trees, cottages — hidden while indoors
    this._houses = [];         // {door:{x,z}, ang, interior index}
    this._inside = null;       // index of the cottage we're standing in, or null
    this._gibs = [];           // flying/littering death chunks
    this._gibGeo = new THREE.IcosahedronGeometry(1, 0); // unit chunk, scaled per gib
    this._buildWood();
    this._buildHouses();
    this._buildInteriors();
    this._buildRain();
    this._gibGroup = new THREE.Group(); this.scene.add(this._gibGroup); this._woodObjs.push(this._gibGroup);
    this.chipGroup = new THREE.Group(); this.scene.add(this.chipGroup);

    this.pos = new THREE.Vector3(0, 0, PLAY_R - 6);
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.spearN = SPEAR_START;
    this._swing = 0; this._meleeCd = 0; this._throwCd = 0; this._hurtFlash = 0;
    this._keys = new Set(); this._joy = null; this._look = null;
    this._dom();
    this._buildWeapon();
    this._handlers = {};
  }

  // ---- the held sword (a camera-child sprite) and its charged-blade smoke ----
  _buildWeapon() {
    this.scene.add(this.camera); // children of the camera render only if it's in the scene graph
    this._swordH = 0.74;
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat); s.center.set(0.5, 0.5); s.renderOrder = 20;
    s.scale.set(this._swordH * 0.45, this._swordH, 1);
    new THREE.TextureLoader().load('assets/weapons/fp_sword0.png?v=CBUST', (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; const im = t.image; if (im && im.width) s.scale.set(this._swordH * (im.width / im.height), this._swordH, 1); });
    this._swordBasePos = new THREE.Vector3(0.23, -0.30, -0.62);
    s.position.copy(this._swordBasePos);
    this.camera.add(s); this._sword = s;
    // soft blue puff texture for the tip smoke
    this._smokeTex = this._canvasTex((x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(165,210,255,0.95)'); g.addColorStop(0.5, 'rgba(85,150,250,0.4)'); g.addColorStop(1, 'rgba(60,120,240,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, 64, 64);
    this._smokePool = []; this._tipV = new THREE.Vector3(); this._powered = false;
  }
  _emitSmoke(tw, pvx, pvz) {
    let p = this._smokePool.find((q) => q.life <= 0);
    if (!p) {
      if (this._smokePool.length > 110) return;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._smokeTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false }));
      spr.renderOrder = 26; this.scene.add(spr); p = { spr, life: 0 }; this._smokePool.push(p);
    }
    p.spr.visible = true;
    p.spr.position.set(tw.x + (Math.random() - 0.5) * 0.07, tw.y + (Math.random() - 0.5) * 0.07, tw.z + (Math.random() - 0.5) * 0.07);
    p.vx = -pvx * 0.45 + (Math.random() - 0.5) * 0.6; // trails back against the champion's travel
    p.vz = -pvz * 0.45 + (Math.random() - 0.5) * 0.6;
    p.vy = 0.6 + Math.random() * 1.0;
    p.life = p.maxLife = 0.4 + Math.random() * 0.35;
    p.s0 = 0.09 + Math.random() * 0.07;
  }
  _updateSmoke(dt) {
    for (const p of this._smokePool) {
      if (p.life <= 0) { if (p.spr.visible) p.spr.visible = false; continue; }
      p.life -= dt;
      p.spr.position.x += p.vx * dt; p.spr.position.y += p.vy * dt; p.spr.position.z += p.vz * dt;
      const k = Math.max(0, p.life / p.maxLife);
      const sc = p.s0 * (2.0 - k * 1.0); p.spr.scale.set(sc, sc, 1); // swells as it dissipates
      p.spr.material.opacity = k * 0.6;
      if (p.life <= 0) p.spr.visible = false;
    }
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
    // the floor is terrain now: a grassy prairie shelf rises along the far (−z) side,
    // a vantage to climb and snipe down into the wooded hollow.
    const S = (PLAY_R + 14) * 2, geo = new THREE.PlaneGeometry(S, S, 72, 72); geo.rotateX(-Math.PI / 2);
    const vp = geo.attributes.position, col = new Float32Array(vp.count * 3);
    for (let i = 0; i < vp.count; i++) {
      const hy = this._heightAt(vp.getX(i), vp.getZ(i)); vp.setY(i, hy);
      // the shelf greens into open prairie grass as it climbs; the hollow stays dark mossy wood-floor
      const g = Math.min(1, hy / 4.6), n = 0.88 + Math.random() * 0.24;
      col[i * 3] = (0.42 + g * 0.26) * n; col[i * 3 + 1] = (0.46 + g * 0.30) * n; col[i * 3 + 2] = (0.30 + g * 0.08) * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true, emissive: 0x161f12 }));
    this.scene.add(ground); this._woodObjs.push(ground);
    // the sky: a brooding overcast skybox — a cold gradient with soft banks of
    // cloud drifting across the upper air, pale mist settling to the treeline.
    const skyCv = document.createElement('canvas'); skyCv.width = 1024; skyCv.height = 512;
    const sx = skyCv.getContext('2d');
    const sg = sx.createLinearGradient(0, 0, 0, 512);
    sg.addColorStop(0, '#363f49'); sg.addColorStop(0.42, '#505d66'); sg.addColorStop(0.7, '#7a8884'); sg.addColorStop(1, '#95a39b');
    sx.fillStyle = sg; sx.fillRect(0, 0, 1024, 512);
    let ss = 7; const srnd = () => { ss = (ss * 1103515245 + 12345) & 0x7fffffff; return ss / 0x7fffffff; };
    for (let i = 0; i < 70; i++) {
      const cx = srnd() * 1024, cy = srnd() * 300, rx = 1024 * (0.04 + srnd() * 0.11), ry = rx * (0.28 + srnd() * 0.22);
      const tone = 180 + ((srnd() * 45) | 0), a = 0.035 + srnd() * 0.08;
      const grd = sx.createRadialGradient(cx, cy, 1, cx, cy, rx);
      grd.addColorStop(0, `rgba(${tone},${tone + 6},${tone},${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
      sx.fillStyle = grd; sx.beginPath(); sx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); sx.fill();
    }
    const domeTex = new THREE.CanvasTexture(skyCv); domeTex.colorSpace = THREE.SRGBColorSpace; this._woodSkyTex = domeTex;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 14), new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this._dome = dome; this.scene.add(dome); this._woodObjs.push(dome);

    // billboard trees — painted forest art (assets/wood), base-anchored so each
    // plants on the ground, scattered into a wood with a wall of trees at the edge.
    const tl = new THREE.TextureLoader();
    const place = (name, x, z, worldH, collideR) => {
      const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.25, fog: true });
      const s = new THREE.Sprite(mat); s.center.set(0.5, 0); s.scale.set(worldH * 0.7, worldH, 1); s.position.set(x, this._heightAt(x, z), z);
      tl.load(`assets/wood/tree_${name}.png?v=CBUST`, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; const im = t.image; if (im && im.width) s.scale.set(worldH * (im.width / im.height), worldH, 1); });
      this.scene.add(s); this._woodObjs.push(s);
      if (collideR) this.trees.push({ x, z, r: collideR });
    };
    let seed = 90210; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = (arr) => arr[(rnd() * arr.length) | 0];
    const CANOPY = ['pine', 'oak', 'birch', 'rowan', 'willow', 'hawthorn', 'deadtree'];
    // the wall of trees — a close-packed double ring, tall, so the wood reads as
    // enclosing and you can't see out past the edge of the world
    for (let a = 0; a < Math.PI * 2; a += 0.075) {
      place(pick(CANOPY), Math.cos(a) * (PLAY_R + (rnd() - 0.5) * 1.5), Math.sin(a) * (PLAY_R + (rnd() - 0.5) * 1.5), 7 + rnd() * 2.5, 0.9);
      place(pick(CANOPY), Math.cos(a + 0.037) * (PLAY_R + 2.7 + rnd() * 1.5), Math.sin(a + 0.037) * (PLAY_R + 2.7 + rnd() * 1.5), 8 + rnd() * 2.5, 0.9);
    }
    for (let i = 0; i < 64; i++) { // the inner wood, with a loose clearing kept open in the middle
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * (PLAY_R - 8);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (x * x + z * z < 36) continue;
      const roll = rnd();
      if (roll < 0.4) place(pick(CANOPY), x, z, 6 + rnd() * 3, 0.9);
      else if (roll < 0.56) place(pick(['stump', 'log']), x, z, 1.8 + rnd() * 0.8, 1.0);
      else if (roll < 0.72) place(pick(['boulder', 'rocks']), x, z, 1.4 + rnd() * 1.0, 1.1);
      else if (roll < 0.9) place(pick(['gorse', 'bramble', 'fern']), x, z, 1.4 + rnd() * 0.7, 0);
      else place(pick(['toadstools', 'reeds']), x, z, 0.8 + rnd() * 0.4, 0);
    }
    this._scatterGroundDecals(rnd);
  }

  // Soft-edged ground patch: packed earth, fallen leaves, or dark bracken,
  // painted on a canvas and faded to transparent at the rim so it blends.
  _patchTex(kind) {
    return this._canvasTex((x, w, h) => {
      const pal = kind === 'leaf' ? [[150, 96, 40], [120, 70, 28], [168, 120, 54], [96, 58, 26]]
        : kind === 'earth' ? [[78, 60, 42], [96, 74, 50], [62, 46, 32], [108, 86, 60]]
          : [[52, 70, 36], [40, 56, 28], [66, 84, 44], [34, 46, 24]]; // bracken
      x.fillStyle = `rgb(${pal[0][0]},${pal[0][1]},${pal[0][2]})`; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { const c = pal[(Math.random() * pal.length) | 0]; x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.3 + Math.random() * 0.5})`; const s = 2 + Math.random() * (kind === 'leaf' ? 5 : 3); x.fillRect(Math.random() * w, Math.random() * h, s, s * (kind === 'leaf' ? 0.6 : 1)); }
      const m = x.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5); // fade the rim out
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.75, 'rgba(0,0,0,0.6)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = m; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
    }, 128, 128);
  }
  _scatterGroundDecals(rnd) {
    const texes = { leaf: this._patchTex('leaf'), earth: this._patchTex('earth'), bracken: this._patchTex('bracken') };
    const kinds = ['leaf', 'leaf', 'earth', 'bracken']; // leaf litter most common
    for (let i = 0; i < 64; i++) {
      const a = rnd() * Math.PI * 2, r = 3 + rnd() * (PLAY_R - 3);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const kind = kinds[(rnd() * kinds.length) | 0];
      const sz = 2.0 + rnd() * 3.5;
      const geo = new THREE.PlaneGeometry(sz, sz); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texes[kind], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
      m.position.set(x, this._heightAt(x, z) + 0.02, z); m.rotation.y = rnd() * Math.PI * 2;
      this.scene.add(m); this._woodObjs.push(m);
    }
  }

  // The floor is terrain: flat through the heart of the wood, then a grassy
  // prairie shelf swelling up along the far (−z) edge — a vantage to climb and
  // snipe down into the hollow where the host gathers.
  _heightAt(x, z) {
    const a = 8, b = 17, H = 4.6, zz = -z;
    if (zz <= a) return 0;
    if (zz >= b) return H;
    const t = (zz - a) / (b - a);
    return H * t * t * (3 - 2 * t);
  }

  // ---- rain (falls while the giant walks) ----------------------------------
  _buildRain() {
    const N = 460, R = 22, H = 16; // a column of streaks that follows the champion
    this._rainN = N; this._rainR = R; this._rainH = H;
    const pos = new Float32Array(N * 6); this._rainDrop = [];
    for (let i = 0; i < N; i++) this._rainDrop.push({ x: (Math.random() * 2 - 1) * R, z: (Math.random() * 2 - 1) * R, y: Math.random() * H, len: 0.5 + Math.random() * 0.5, spd: 20 + Math.random() * 10 });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xafc0d0, transparent: true, opacity: 0.34, fog: true, depthWrite: false });
    this._rain = new THREE.LineSegments(geo, mat); this._rain.frustumCulled = false; this._rain.visible = false;
    this.scene.add(this._rain);
  }
  _updateRain(dt) {
    if (!this._raining || this._inside !== null) { if (this._rain.visible) this._rain.visible = false; return; }
    this._rain.visible = true;
    const pos = this._rain.geometry.attributes.position.array, H = this._rainH, slant = 1.1;
    for (let i = 0; i < this._rainN; i++) {
      const d = this._rainDrop[i]; d.y -= d.spd * dt;
      if (d.y < -2) { d.y = H; d.x = (Math.random() * 2 - 1) * this._rainR; d.z = (Math.random() * 2 - 1) * this._rainR; }
      const wx = this.pos.x + d.x, wz = this.pos.z + d.z, o = i * 6;
      pos[o] = wx; pos[o + 1] = d.y + d.len; pos[o + 2] = wz;
      pos[o + 3] = wx + slant * 0.14 * d.len; pos[o + 4] = d.y; pos[o + 5] = wz;
    }
    this._rain.geometry.attributes.position.needsUpdate = true;
  }

  // ---- cottages ------------------------------------------------------------
  // Three dwellings set back in the wood — their painted fronts are billboards,
  // their doorways step you into a small interior to gather stores. The exterior
  // body is a solid obstacle; the door is a trigger a pace out toward the clearing.
  _buildHouses() {
    const tl = new THREE.TextureLoader();
    const defs = [
      { type: 'hut_round', h: 4.6, at: [-14, -5], reward: { hp: 30 } },
      { type: 'longhouse', h: 5.1, at: [15, -3], reward: { daggers: 8 } },
      { type: 'forge', h: 4.6, at: [9, 10], reward: { daggers: 6, hp: 16 } },
    ];
    defs.forEach((d, i) => {
      const [x, z] = d.at, gy = this._heightAt(x, z);
      const fl = Math.hypot(x, z) || 1, ux = -x / fl, uz = -z / fl; // unit vector toward the clearing centre
      const doorX = x + ux * 1.7, doorZ = z + uz * 1.7;
      // open a little glade: clear the wood's trees from around and in front of the cottage so it stands plain to see
      const cx = x + ux * 0.4, cz = z + uz * 0.4; // glade centred a touch toward the approach
      this._woodObjs = this._woodObjs.filter((o) => {
        if (o.isSprite && (o.position.x - cx) ** 2 + (o.position.z - cz) ** 2 < 4.0 * 4.0) { this.scene.remove(o); return false; }
        return true;
      });
      this.trees = this.trees.filter((t) => (t.x - cx) ** 2 + (t.z - cz) ** 2 > 4.0 * 4.0);
      const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.3, fog: true });
      const s = new THREE.Sprite(mat); s.center.set(0.5, 0); s.scale.set(d.h, d.h, 1); s.position.set(x, gy, z);
      tl.load(`assets/village/${d.type}.png?v=CBUST`, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; const im = t.image; if (im && im.width) s.scale.set(d.h * (im.width / im.height), d.h, 1); });
      this.scene.add(s); this._woodObjs.push(s);
      this.trees.push({ x: x - ux * 0.5, z: z - uz * 0.5, r: 1.7 }); // the solid body, behind the door
      this._houses.push({ door: { x: doorX, z: doorZ }, reward: d.reward, interior: i });
    });
  }
  _buildInteriors() {
    this._roomLight = new THREE.PointLight(0xffb06a, 0, 13); this.scene.add(this._roomLight);
    const themes = [
      { wall: ['#6a5636', '#584527'], floor: '#3c2d1c', plank: false }, // hut: wattle walls, earth floor
      { wall: ['#5a4a30', '#6d5a3a'], floor: '#5a4328', plank: true },  // longhouse: timber
      { wall: ['#6b6b70', '#55555b'], floor: '#4a4036', plank: false }, // forge: stone
    ];
    this._interiors = themes.map((th) => this._buildRoom(th));
    this._interiors.forEach((r) => (r.group.visible = false));
  }
  _wallTex(c0, c1) {
    return this._canvasTex((x, w, h) => {
      x.fillStyle = c0; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) { const g = (Math.random() * 40 - 20) | 0; x.fillStyle = `rgba(${g < 0 ? 0 : 255},${g < 0 ? 0 : 255},${g < 0 ? 0 : 230},${Math.abs(g) / 180})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      x.strokeStyle = c1; x.lineWidth = 2; x.globalAlpha = 0.5;
      for (let y = 6; y < h; y += 13) { x.beginPath(); x.moveTo(0, y + Math.sin(y) * 2); x.lineTo(w, y); x.stroke(); }
      x.globalAlpha = 1;
    }, 128, 128);
  }
  _floorTex(c, plank) {
    return this._canvasTex((x, w, h) => {
      x.fillStyle = c; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const g = 40 + (Math.random() * 40) | 0; x.fillStyle = `rgba(${g},${g - 6},${g - 16},0.5)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      if (plank) { x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 2; for (let px = 0; px < w; px += 22) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); } }
    }, 128, 128);
  }
  _buildRoom(th) {
    const g = new THREE.Group(); this.scene.add(g);
    const R = ROOM_H, WH = ROOM_WALL;
    const wallTex = this._wallTex(th.wall[0], th.wall[1]); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(3, 1.3);
    const floorTex = this._floorTex(th.floor, th.plank); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, fog: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), new THREE.MeshLambertMaterial({ map: floorTex, fog: true }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), new THREE.MeshLambertMaterial({ color: 0x1a1109, fog: true }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = WH; g.add(ceil);
    const wall = (w, px, pz, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, WH), wallMat); m.position.set(px, WH / 2, pz); m.rotation.y = ry; g.add(m); };
    wall(R * 2, 0, -R, 0);          // back
    wall(R * 2, -R, 0, Math.PI / 2); // left
    wall(R * 2, R, 0, -Math.PI / 2); // right
    const side = (R * 2 - 1.8) / 2;  // front wall, split around a doorway gap
    wall(side, -(0.9 + side / 2), R, Math.PI); wall(side, 0.9 + side / 2, R, Math.PI);
    // props — a brazier for light, a basket of stores, a spare crate
    const prop = (name, px, pz, hh) => {
      const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.3, fog: true });
      const s = new THREE.Sprite(mat); s.center.set(0.5, 0); s.scale.set(hh, hh, 1); s.position.set(px, 0, pz);
      new THREE.TextureLoader().load(`assets/interior/${name}.png?v=CBUST`, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; const im = t.image; if (im && im.width) s.scale.set(hh * (im.width / im.height), hh, 1); });
      g.add(s); return s;
    };
    prop('brazier', -R + 0.8, -R + 0.8, 2.4);
    prop('basket', R - 1.1, -R + 1.0, 1.3);
    // the stores: a basket at the back, haloed so it reads as a prize
    const supplyPos = { x: 0, z: -R + 1.3 };
    const mesh = prop('basket', supplyPos.x, supplyPos.z, 1.5);
    const glowTex = this._canvasTex((x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,225,150,0.9)'); gr.addColorStop(0.5, 'rgba(255,190,90,0.35)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(1.5, 1.5, 1); glow.position.set(supplyPos.x, 1.0, supplyPos.z + 0.05); g.add(glow);
    return { group: g, supply: { mesh, glow, pos: supplyPos, reward: null, taken: false } };
  }
  _enterHouse(i) {
    const h = this._houses[i];
    this._inside = h.interior;
    this._outPos = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    for (const o of this._woodObjs) o.visible = false;
    this.chipGroup.visible = false;
    this._interiors.forEach((r, k) => (r.group.visible = k === h.interior));
    const r = this._interiors[h.interior]; r.supply.reward = h.reward;
    this.scene.fog = new THREE.Fog(0x120b06, 3, 17); this.scene.background = new THREE.Color(0x0a0705);
    this._roomLight.position.set(-ROOM_H + 0.9, 2.0, -ROOM_H + 0.9); this._roomLight.intensity = 2.6;
    this.pos.set(0, 0, ROOM_H - 0.5); this.yaw = 0; this.pitch = -0.05;
    this._hint.textContent = 'search the dwelling for stores · walk back out through the doorway to leave';
  }
  _exitHouse() {
    const op = this._outPos || { x: 0, z: 0, yaw: 0 };
    this._inside = null; this._enterCd = 0.7;
    for (const o of this._woodObjs) o.visible = true;
    this.chipGroup.visible = true;
    this._interiors.forEach((r) => (r.group.visible = false));
    this.scene.fog = this._woodFog; this.scene.background = this._woodBg; this._roomLight.intensity = 0;
    this.pos.set(op.x, 0, op.z); this.yaw = op.yaw; this.pitch = 0;
    this._hint.textContent = 'move · drag to look · ⚔ strike · 🗡 hurl a dagger · duck into a dwelling for stores';
  }
  _takeSupply(r) {
    r.supply.taken = true; r.supply.glow.visible = false; r.supply.mesh.visible = false;
    const rw = r.supply.reward || {}; const parts = [];
    if (rw.hp) { this.hp = Math.min(100, this.hp + rw.hp); parts.push(`+${rw.hp} vigour`); this._setWeaponByHealth(); }
    if (rw.daggers) { this.spearN += rw.daggers; parts.push(`+${rw.daggers} daggers`); }
    this._setHud();
    this._hint.textContent = 'You take the stores — ' + parts.join(', ');
  }
  _updateHouses(dt) {
    if (this._enterCd > 0) this._enterCd -= dt;
    if (this._inside === null) {
      if (this._dead || this._enterCd > 0 || !this._houses.length) return;
      for (let i = 0; i < this._houses.length; i++) {
        const d = this._houses[i].door, dx = this.pos.x - d.x, dz = this.pos.z - d.z;
        if (dx * dx + dz * dz < 1.3 * 1.3) { this._enterHouse(i); break; }
      }
      return;
    }
    const r = this._interiors[this._inside];
    if (r.supply && !r.supply.taken) {
      this._glowT = (this._glowT || 0) + dt; const pul = 1 + Math.sin(this._glowT * 4) * 0.2;
      r.supply.glow.scale.set(1.5 * pul, 1.5 * pul, 1);
      const dx = this.pos.x - r.supply.pos.x, dz = this.pos.z - r.supply.pos.z;
      if (dx * dx + dz * dz < 1.5 * 1.5) this._takeSupply(r);
    }
    if (this.pos.z > ROOM_H - 0.4 && Math.abs(this.pos.x) < 1.0) this._exitHouse(); // stepped out the doorway
  }

  // ---- dialogue (a Link-style box that freezes the field while it's open) ----
  _startDialog(nodes, startId, onDone) {
    this._dlgNodes = nodes; this._dlgDone = onDone || null;
    this._dlgActive = true; this._parley = true; this._dlg.style.display = 'block';
    this._dlgGoto(startId);
  }
  _dlgGoto(id) {
    const node = this._dlgNodes[id]; if (!node) return this._endDialog();
    this._dlgNode = node;
    if (node.onShow) node.onShow();
    this._dlgName.textContent = node.speaker || ''; this._dlgName.style.display = node.speaker ? 'block' : 'none';
    this._dlgFull = node.text || ''; this._dlgShown = 0; this._dlgTyping = true;
    this._dlgText.textContent = ''; this._dlgArrow.style.opacity = '0';
    this._dlgChoices.style.display = 'none'; this._dlgChoices.innerHTML = '';
  }
  _updateDialog(dt) {
    if (!this._dlgActive || !this._dlgTyping) return;
    this._dlgShown += dt * 45; // letters per second
    const n = Math.min(this._dlgFull.length, Math.floor(this._dlgShown));
    this._dlgText.textContent = this._dlgFull.slice(0, n);
    if (n >= this._dlgFull.length) { this._dlgTyping = false; this._dlgRevealEnd(); }
  }
  _dlgRevealEnd() {
    const node = this._dlgNode;
    if (node.choices && node.choices.length) {
      this._dlgChoices.style.display = 'flex'; this._dlgChoices.innerHTML = '';
      node.choices.forEach((c, i) => {
        const b = document.createElement('div');
        b.textContent = '› ' + c.label;
        b.style.cssText = 'background:#1e2230;border:1px solid #4a5068;border-radius:7px;padding:8px 12px;font-size:15px;color:#e8e2d0;cursor:pointer';
        b.addEventListener('pointerenter', () => { b.style.background = '#2b3147'; });
        b.addEventListener('pointerleave', () => { b.style.background = '#1e2230'; });
        b.addEventListener('click', (e) => { e.stopPropagation(); this._dlgChoose(i); });
        this._dlgChoices.appendChild(b);
      });
    } else { this._dlgArrow.style.opacity = '1'; }
  }
  _dlgAdvance() {
    if (!this._dlgActive) return;
    if (this._dlgTyping) { this._dlgShown = this._dlgFull.length + 1; return; } // first tap reveals the whole line
    const node = this._dlgNode;
    if (node.choices && node.choices.length) return; // a choice must be picked
    if (node.next) this._dlgGoto(node.next); else this._endDialog();
  }
  _dlgChoose(i) {
    const node = this._dlgNode; if (!node || !node.choices) return;
    const c = node.choices[i]; if (!c) return;
    if (c.action) c.action();
    if (c.next) this._dlgGoto(c.next); else this._endDialog();
  }
  _endDialog() {
    this._dlgActive = false; this._parley = false; this._dlg.style.display = 'none';
    const cb = this._dlgDone; this._dlgDone = null; if (cb) cb();
  }

  // ---- An Mhórrígan — the phantom queen who meets the champion in the wood ----
  _spawnMorrigan() {
    const x = 0, z = -7; // she stands in the open, a little way across the clearing
    // clear a glade so no tree hides her — pull the wood back from where she'll stand
    this._woodObjs = this._woodObjs.filter((o) => { if (o.isSprite && (o.position.x - x) ** 2 + (o.position.z - z) ** 2 < 5.5 * 5.5) { this.scene.remove(o); return false; } return true; });
    this.trees = this.trees.filter((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > 5.5 * 5.5);
    const chip = makeWalkerChip('druid', true, 1.95); // the hooded Badhbh, staff in hand
    chip.position.set(x, this._heightAt(x, z) + 0.05, z);
    if (chip.material && chip.material.color) chip.material.color.setRGB(0.6, 0.58, 0.72); // cold, shadowed
    if (chip.faceWorld) chip.faceWorld(0, 1);
    this.chipGroup.add(chip);
    const auraTex = this._canvasTex((cx, w, h) => { const g = cx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(150,60,190,0.5)'); g.addColorStop(0.5, 'rgba(80,25,120,0.28)'); g.addColorStop(1, 'rgba(30,10,50,0)'); cx.fillStyle = g; cx.fillRect(0, 0, w, h); }, 64, 64);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    aura.scale.set(3.0, 3.0, 1); aura.position.set(x, this._heightAt(x, z) + 1.1, z); this.chipGroup.add(aura);
    this._morrigan = { chip, aura, x, z, t: 0, auraBase: 2.6, revealed: false };
  }
  _updateMorrigan(dt) {
    const m = this._morrigan; if (!m) return;
    m.t += dt;
    const baseY = this._heightAt(m.x, m.z) + 0.05;
    m.chip.position.y = baseY + Math.sin(m.t * 1.5) * 0.08; // she hovers a hand's breadth off the ground
    m.aura.position.y = m.chip.position.y + 1.05;
    const pul = 1 + Math.sin(m.t * 3) * 0.12; m.aura.scale.set(m.auraBase * pul, m.auraBase * pul, 1);
    if (m.chip.faceWorld) m.chip.faceWorld(this.pos.x - m.x, this.pos.z - m.z); // she turns to watch you
    if (m.chip.animate) m.chip.animate(dt, false);
  }
  _lockGazeTo(tx, ty, tz, dt) {
    const ex = this.pos.x, ez = this.pos.z, ey = this._heightAt(ex, ez) + EYE;
    const dx = tx - ex, dz = tz - ez, horiz = Math.hypot(dx, dz) || 1e-3;
    const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(ty - ey, horiz);
    let dyaw = wantYaw - this.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const k = Math.min(1, dt * 5);
    this.yaw += dyaw * k; this.pitch += (wantPitch - this.pitch) * k;
  }
  _revealMorrigan() {
    const m = this._morrigan; if (!m || m.revealed) return; m.revealed = true;
    this.chipGroup.remove(m.chip); // the hooded traveller unfolds into the raven-winged queen
    const chip = makeWarriorChip('morrigan', 2.4);
    chip.position.set(m.x, this._heightAt(m.x, m.z) + 0.05, m.z);
    if (chip.faceWorld) chip.faceWorld(0, 1);
    this.chipGroup.add(chip); m.chip = chip; m.auraBase = 4.3;
    // the sky darkens, a cold fog gathers, the rain comes on in earnest
    new THREE.TextureLoader().load('assets/sky/sky_geimhreadh.jpg?v=CBUST', (t) => { t.colorSpace = THREE.SRGBColorSpace; if (this._dome) { this._dome.material.map = t; this._dome.material.color.setRGB(0.5, 0.52, 0.6); this._dome.material.needsUpdate = true; } });
    this.scene.fog = new THREE.Fog(0x0c1016, 4, 28); this.scene.background = new THREE.Color(0x10141b);
    this._raining = true; if (this._rain) this._rain.material.opacity = 0.5;
    this._shake = 0.5;
  }
  _morriganGreet() {
    const M = 'An Mhórrígan';
    this._startDialog({
      start: { speaker: M, text: 'So. The wanderer with the borrowed spear. I have watched you from the branches, little iron.', next: 'q' },
      q: {
        speaker: M, onShow: () => this._revealMorrigan(), // the hood falls away — the Badhbh stands revealed as the sky turns
        text: 'I am Badhbh — washer at the ford, phantom queen of war. Prove the iron in you this night and I will mark you for my own. Will you take up my test?',
        choices: [
          { label: 'I will. Loose your host.', next: 'yes' },
          { label: 'Who are you to command me?', next: 'defy' },
        ],
      },
      defy: { speaker: M, text: 'Ha — teeth, as well as iron. Good. The dead do not fear the meek, but they will learn to fear you.', next: 'yes' },
      yes: { speaker: M, text: 'Then stand, champion. They come like hounds loosed. Do not fall — I so hate to be disappointed.' },
    }, 'start', null);
  }
  _morriganClose() {
    const M = 'An Mhórrígan';
    this._startDialog({
      start: { speaker: M, text: 'Still breathing. Still standing, in your own blood and theirs. You will do.', next: 'mark' },
      mark: {
        speaker: M, text: 'She lays a cold finger to your brow. It burns, then numbs — the mark will not wash away, not in water nor in years.',
        choices: [{ label: 'Accept the mark of the Badhbh.', action: () => { this.hp = 100; this.spearN += 10; this._setHud(); }, next: 'end' }],
      },
      end: { speaker: M, text: 'You are a champion now, for good or ill. Go — the road to Tír na nÓg is longer than you yet know.' },
    }, 'start', () => this._end(true));
  }

  // ---- HUD (built in JS so the slice is self-contained) --------------------
  _dom() {
    const h = document.createElement('div'); h.id = 'eachtra-hud'; this.hud = h;
    h.style.cssText = 'position:fixed;inset:0;z-index:40;display:none;font-family:inherit;color:#eee;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden';
    // damage vignette
    this._vig = document.createElement('div');
    this._vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px 40px rgba(140,10,10,0);transition:box-shadow .12s';
    h.appendChild(this._vig);
    // damage-direction flares — a red glow on the edge the blow came from
    const edge = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;pointer-events:none;opacity:0;transition:opacity .1s;' + css; h.appendChild(d); return d; };
    const red = 'rgba(210,25,25,0.75)';
    this._edgeT = edge(`left:0;right:0;top:0;height:24%;background:linear-gradient(to bottom,${red},transparent)`);
    this._edgeB = edge(`left:0;right:0;bottom:0;height:24%;background:linear-gradient(to top,${red},transparent)`);
    this._edgeL = edge(`top:0;bottom:0;left:0;width:20%;background:linear-gradient(to right,${red},transparent)`);
    this._edgeR = edge(`top:0;bottom:0;right:0;width:20%;background:linear-gradient(to left,${red},transparent)`);
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
    // the held sword is a 3D object now (see _buildWeapon), so the blue tip-smoke can live in the world and trail the champion
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
    // ---- Link-style dialogue box (bottom of the screen) ----
    this._dlg = document.createElement('div');
    this._dlg.style.cssText = 'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:min(680px,92%);background:linear-gradient(180deg,rgba(14,16,22,0.93),rgba(8,10,14,0.96));border:2px solid #b89a52;border-radius:12px;box-shadow:0 6px 28px rgba(0,0,0,.6);padding:14px 18px 16px;display:none;pointer-events:auto;cursor:pointer';
    this._dlgName = document.createElement('div');
    this._dlgName.style.cssText = 'position:absolute;top:-14px;left:16px;background:#b89a52;color:#1a140a;font-weight:800;font-size:13px;letter-spacing:.5px;padding:2px 12px;border-radius:7px;text-shadow:none';
    this._dlgText = document.createElement('div');
    this._dlgText.style.cssText = 'font-size:16px;line-height:1.5;color:#f0ead8;min-height:52px;text-shadow:0 1px 2px #000';
    this._dlgChoices = document.createElement('div');
    this._dlgChoices.style.cssText = 'display:none;flex-direction:column;gap:7px;margin-top:10px';
    this._dlgArrow = document.createElement('div');
    this._dlgArrow.textContent = '▸';
    this._dlgArrow.style.cssText = 'position:absolute;right:16px;bottom:10px;color:#b89a52;font-size:18px;opacity:0;animation:none';
    this._dlg.appendChild(this._dlgName); this._dlg.appendChild(this._dlgText); this._dlg.appendChild(this._dlgChoices); this._dlg.appendChild(this._dlgArrow);
    this._dlg.addEventListener('click', (e) => { e.stopPropagation(); this._dlgAdvance(); });
    h.appendChild(this._dlg);
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
    // fullscreen toggle (top-right), so the wood can take the whole screen on a phone
    const fs = document.createElement('button'); fs.textContent = '⛶';
    fs.style.cssText = 'position:absolute;right:10px;top:10px;width:40px;height:40px;border-radius:8px;border:1px solid #fff3;background:#0008;color:#fff;font-size:19px;touch-action:none';
    fs.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    fs.addEventListener('click', (e) => {
      e.stopPropagation(); const d = document, el = d.documentElement;
      try { if (!d.fullscreenElement && !d.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen).call(el); else (d.exitFullscreen || d.webkitExitFullscreen).call(d); } catch (_) {}
    });
    h.appendChild(fs);
    document.body.appendChild(h);
  }

  // ---- lifecycle -----------------------------------------------------------
  open(opts = {}) {
    this._onExit = opts.onExit || (() => {});
    this._result = 'quit';
    this.active = true;
    this.pos.set(0, 0, 0); this.yaw = 0; this.pitch = 0; // stand in the clear heart of the wood, the host closing from all sides
    this.hp = 100; this.spearN = SPEAR_START; this._dead = false; this._cleared = false;
    this._deathT = 0; this._deathEnded = false; this._shake = 0;
    // leave any cottage and replenish its stores for a fresh run
    this._inside = null; this._enterCd = 0;
    // clear any parley / phantom queen from a previous run
    this._parley = false; this._dlgActive = false; if (this._dlg) this._dlg.style.display = 'none';
    if (this._morrigan) { this.chipGroup.remove(this._morrigan.chip); this.chipGroup.remove(this._morrigan.aura); this._morrigan = null; }
    this._morriganPhase = null;
    this._raining = false; if (this._rain) { this._rain.visible = false; this._rain.material.opacity = 0.34; }
    for (const g of (this._gibs || [])) { this._gibGroup.remove(g.mesh); g.mesh.material.dispose(); } this._gibs = [];
    for (const p of (this._smokePool || [])) { p.life = 0; if (p.spr) p.spr.visible = false; }
    this.scene.fog = this._woodFog; this.scene.background = this._woodBg;
    if (this._roomLight) this._roomLight.intensity = 0;
    for (const o of this._woodObjs) o.visible = true;
    if (this.chipGroup) this.chipGroup.visible = true;
    for (const r of (this._interiors || [])) { r.group.visible = false; r.supply.taken = false; r.supply.mesh.visible = true; r.supply.glow.visible = true; }
    if (this._dome && this._woodSkyTex) { this._dome.material.map = this._woodSkyTex; this._dome.material.color.setRGB(1, 1, 1); this._dome.material.needsUpdate = true; } // restore the wood's own sky
    for (const e of this.enemies) this.chipGroup.remove(e.chip);
    for (const s of this.spears) this.scene.remove(s.mesh);
    for (const pk of this.pickups) this.scene.remove(pk.mesh);
    if (this._boss) this.chipGroup.remove(this._boss.chip);
    for (const p of (this._bossProj || [])) this.scene.remove(p.mesh);
    for (const bm of (this._beams || [])) this.scene.remove(bm.mesh);
    for (const ep of (this._enemyProj || [])) this.scene.remove(ep.mesh);
    this.enemies = []; this.spears = []; this.pickups = []; this._bossProj = []; this._beams = []; this._enemyProj = [];
    this._boss = null; this._bossDone = false; this._wantBoss = !!opts.boss;
    if (this._bossWrap) this._bossWrap.style.display = 'none';
    this._spawnWave(opts.enemies || 5);
    this.hud.style.display = 'block'; this._banner.style.display = 'none';
    this._exitBtn.textContent = '✕ Leave the wood';
    this._hint.textContent = 'move · drag to look · ⚔ strike (a beam flies at full health) · 🗡 hurl a dagger · climb the grassy rise to snipe down into the wood';
    this._bind(); this._setHud();
    if (opts.morrigan) { this._spawnMorrigan(); this._morriganPhase = 'fight'; this._morriganGreet(); } // she greets, then looses the host
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
    if (this._look && e.pointerId === this._look.id && !this._parley) { // the parley holds the gaze on her
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
    for (let i = 0; i < n; i++) this._spawnEnemy(Math.random() < 0.45 ? 'fomorian' : 'sluagh');
  }
  _spawnEnemy(kind) {
    const t = ENEMY_TYPES[kind];
    let a, r, px, pz; // keep the host down in the wooded hollow, not up on the prairie shelf
    for (let tries = 0; tries < 12; tries++) {
      a = Math.random() * Math.PI * 2; r = 11 + Math.random() * (PLAY_R - 15);
      px = Math.cos(a) * r; pz = Math.sin(a) * r;
      if (this._heightAt(px, pz) < 0.8) break;
    }
    const chip = makeWalkerChip(t.art, false, t.h);
    if (kind === 'fomorian') { chip._fullCycle = true; chip.faceWorld(0, 1); if (chip.animate) chip.animate(0.02, true); } // prime a walk frame so the unkeyed idle never shows
    chip.position.set(px, this._heightAt(px, pz) + (kind === 'sluagh' ? 1.0 : 0.05), pz);
    this.chipGroup.add(chip);
    const e = { chip, kind, cd: 0, dead: 0, stagger: 0, state: 'drift', t: Math.random() * 3, cast: 0, st: 0, spd: t.spd, reach: t.reach, dmg: t.dmg };
    if (kind === 'fomorian') e.hits = t.hits; else e.hp = t.hp;
    this.enemies.push(e);
  }
  _forward() { this.camera.getWorldDirection(TMP); TMP.y = 0; return TMP.normalize(); }
  _eyeY() { return (this._inside !== null ? 0 : this._heightAt(this.pos.x, this.pos.z)) + EYE; } // the champion's real eye height — rides the prairie
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
    if (!this.active || this._dead || this._parley || this._meleeCd > 0) return;
    this._meleeCd = 0.42; this._swing = 0.28;
    this._swingT = 0.2; // drives the 3D blade's downward slash in update()
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
    // the blade's reach by vigour: hale → a spread of beams, wounded → one, near death → steel alone
    if (this.hp >= BEAM_MULTI) { this._fireBeam(-0.16); this._fireBeam(0); this._fireBeam(0.16); }
    else if (this.hp >= BEAM_SINGLE) this._fireBeam(0);
  }
  _fireBeam(spread = 0) {
    const dir = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    if (spread) { const c = Math.cos(spread), s = Math.sin(spread); const x = dir.x * c + dir.z * s, z = -dir.x * s + dir.z * c; dir.x = x; dir.z = z; dir.normalize(); }
    if (!this._beamTex) { this._beamTex = new THREE.TextureLoader().load('assets/fx/orb_blue.png?v=CBUST'); this._beamTex.colorSpace = THREE.SRGBColorSpace; }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(1.0, 1.0, 1); s.material.rotation = Math.random() * Math.PI * 2; s.position.copy(this.pos); s.position.y = this._eyeY() - 0.1; s.position.addScaledVector(dir, 0.6);
    this.scene.add(s);
    this._beams.push({ mesh: s, vel: dir.multiplyScalar(34), life: 0.85, spin: Math.random() < 0.5 ? -9 : 9 });
  }
  _updateBeams(dt) {
    for (let i = this._beams.length - 1; i >= 0; i--) {
      const bm = this._beams[i]; bm.mesh.position.addScaledVector(bm.vel, dt); bm.life -= dt;
      bm.mesh.material.rotation += dt * (bm.spin || 9);
      const pul = 0.95 + Math.sin(bm.life * 26) * 0.14; bm.mesh.scale.set(pul, pul, 1); // crackling bolt
      let hit = false;
      for (const e of this.enemies) { if (e.dead) continue; if (bm.mesh.position.distanceToSquared(TMP.copy(e.chip.position).setY(e.chip.position.y + 0.9)) < 0.9 * 0.9) { this._damage(e, 30); hit = true; break; } }
      if (!hit && this._boss && this._boss.state === 'active' && bm.mesh.position.distanceToSquared(TMP.copy(this._boss.chip.position).setY(this._boss.chip.position.y + 2.0)) < 1.9 * 1.9) { this._damageBoss(30); hit = true; }
      const r2 = bm.mesh.position.x ** 2 + bm.mesh.position.z ** 2;
      if (hit || bm.life <= 0 || r2 > (PLAY_R + 2) ** 2) { this.scene.remove(bm.mesh); this._beams.splice(i, 1); }
    }
  }
  _throw() {
    if (!this.active || this._dead || this._parley || this.spearN <= 0 || this._throwCd > 0) return;
    this.spearN -= 1; this._throwCd = 0.5; this._setHud();
    const dir = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const g = this._daggerMesh();
    g.position.copy(this.pos); g.position.y = this._eyeY() - 0.15;
    this.scene.add(g);
    this.spears.push({ mesh: g, vel: dir.multiplyScalar(26), life: 2.4 });
  }
  _damage(e, amt) {
    if (e.dead) return;
    if (e.kind === 'fomorian') { // three solid hits, each staggering it a step back (one hit per stagger window)
      if (e.stagger > 0) return;
      e.hits -= 1; e.stagger = 0.4; this._flashEnemy(e);
      if (e.hits <= 0) this._kill(e);
    } else {
      e.hp -= amt; this._flashEnemy(e); if (e.chip.strike) e.chip.strike();
      if (e.hp <= 0) this._kill(e);
    }
  }
  // Doom-style death: the figure bursts apart and litters the ground a while.
  _kill(e) {
    if (e.dead) return;
    e.dead = 0.001;
    this._spawnGibs(e.chip.position, e.kind);
    this.chipGroup.remove(e.chip);
  }
  _spawnGibs(p, kind) {
    const n = 12 + (Math.random() * 7 | 0);
    const col = kind === 'sluagh' ? 0x7b4bb0 : 0x7c1111; // the sluagh spills violet ichor, the brute dark blood
    const base = (p.y || 0);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this._gibGeo, new THREE.MeshLambertMaterial({ color: col }));
      m.scale.setScalar(0.05 + Math.random() * 0.13);
      m.position.set(p.x + (Math.random() - 0.5) * 0.4, base + 0.6 + Math.random() * 0.9, p.z + (Math.random() - 0.5) * 0.4);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const ang = Math.random() * Math.PI * 2, sp = 1.6 + Math.random() * 3.4;
      this._gibGroup.add(m);
      this._gibs.push({ mesh: m, vx: Math.cos(ang) * sp, vy: 2.6 + Math.random() * 3.6, vz: Math.sin(ang) * sp, rx: (Math.random() - 0.5) * 12, rz: (Math.random() - 0.5) * 12, life: 5 + Math.random() * 2, rest: false });
    }
  }
  _updateGibs(dt) {
    for (let i = this._gibs.length - 1; i >= 0; i--) {
      const g = this._gibs[i]; g.life -= dt;
      if (!g.rest) {
        g.vy -= 15 * dt;
        g.mesh.position.x += g.vx * dt; g.mesh.position.y += g.vy * dt; g.mesh.position.z += g.vz * dt;
        g.mesh.rotation.x += g.rx * dt; g.mesh.rotation.z += g.rz * dt;
        const floor = this._heightAt(g.mesh.position.x, g.mesh.position.z) + 0.04;
        if (g.mesh.position.y <= floor) { g.mesh.position.y = floor; g.rest = true; } // comes to litter the ground
      }
      if (g.life < 1.2) { g.mesh.material.transparent = true; g.mesh.material.opacity = Math.max(0, g.life / 1.2); }
      if (g.life <= 0) { this._gibGroup.remove(g.mesh); g.mesh.material.dispose(); this._gibs.splice(i, 1); }
    }
  }
  _flashEnemy(e) { const c = e.chip.material && e.chip.material.color; if (!c) return; c.setRGB(1, 0.45, 0.45); setTimeout(() => { if (e.chip && e.chip.material) e.chip.material.color.setRGB(1, 1, 1); }, 110); }
  _hurt(amt, fromPos) {
    if (this._dead) return;
    this.hp -= amt; this._hurtFlash = 1; this._setHud();
    if (fromPos) this._damageFrom(fromPos);
    if (this.hp <= 0) { this.hp = 0; this._dead = true; this._deathT = 0; this._deathEnded = false; } // the sink plays, then _end(false)
  }
  // flare the screen edge the blow came from — top = ahead, bottom = behind, sides as they lie
  _damageFrom(pos) {
    const dx = pos.x - this.pos.x, dz = pos.z - this.pos.z, f = this._forward();
    const fd = dx * f.x + dz * f.z, rd = dx * -f.z + dz * f.x;
    const edge = Math.abs(fd) >= Math.abs(rd) ? (fd >= 0 ? this._edgeT : this._edgeB) : (rd >= 0 ? this._edgeR : this._edgeL);
    edge.style.opacity = '0.85'; clearTimeout(edge._t); edge._t = setTimeout(() => { edge.style.opacity = '0'; }, 340);
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

    this._updateDialog(dt); this._updateMorrigan(dt);
    // ---- movement ----
    if (!this._dead && !this._parley) {
      let mf = 0, ms = 0;
      if (this._keys.has('w') || this._keys.has('arrowup')) mf += 1;
      if (this._keys.has('s') || this._keys.has('arrowdown')) mf -= 1;
      if (this._keys.has('d') || this._keys.has('arrowright')) ms += 1;
      if (this._keys.has('a') || this._keys.has('arrowleft')) ms -= 1;
      if (this._joy) { mf -= this._joy.z; ms += this._joy.x; }
      const fwd = this._forward(); TMP2.set(-fwd.z, 0, fwd.x); // right = forward × up (so A/D and the stick's x aren't mirrored)
      let vx = fwd.x * mf + TMP2.x * ms, vz = fwd.z * mf + TMP2.z * ms;
      const m = Math.hypot(vx, vz);
      this._moving = m > 0.001;
      if (this._moving) {
        vx = vx / m * MOVE_SPD * dt; vz = vz / m * MOVE_SPD * dt;
        let nx = this.pos.x + vx, nz = this.pos.z + vz;
        if (this._inside !== null) { // boxed within the cottage walls
          nx = Math.max(-ROOM_H, Math.min(ROOM_H, nx)); nz = Math.max(-ROOM_H, Math.min(ROOM_H + 0.4, nz));
          this.pos.x = nx; this.pos.z = nz;
        } else {
          const rr = Math.hypot(nx, nz); if (rr > PLAY_R - 1.5) { const k = (PLAY_R - 1.5) / rr; nx *= k; nz *= k; }
          if (!this._collide(nx, this.pos.z)) this.pos.x = nx;
          if (!this._collide(this.pos.x, nz)) this.pos.z = nz;
        }
      }
    } else this._moving = false;
    if (this._parley && this._morrigan) this._lockGazeTo(this._morrigan.x, this._heightAt(this._morrigan.x, this._morrigan.z) + 1.4, this._morrigan.z, dt);
    // Doom-style head-bob: a gentle vertical lope while on the move, eased out at rest.
    this._bobT = (this._bobT || 0) + (this._moving ? dt * 9.5 : 0);
    const bobAmt = (this._bobTarget = (this._bobTarget || 0) + ((this._moving ? 1 : 0) - (this._bobTarget || 0)) * Math.min(1, dt * 6));
    const bob = Math.abs(Math.sin(this._bobT)) * 0.07 * bobAmt;
    const gh = this._inside !== null ? 0 : this._heightAt(this.pos.x, this.pos.z); // the ground underfoot — rises on the prairie, flat indoors
    let eyeY = gh + EYE + bob, roll = 0;
    if (this._dead) { // Doom death — the view sinks slowly to the ground and rolls
      this._deathT += dt; const k = Math.min(1, this._deathT / 1.7);
      eyeY = gh + EYE - (EYE - 0.34) * (k * k); roll = 0.42 * k;
      if (this._deathT >= 1.7 && !this._deathEnded) { this._deathEnded = true; this._end(false); }
    }
    this._shake = Math.max(0, (this._shake || 0) - dt * 1.6); // decaying screen shake
    let sx = 0, sz = 0;
    if (this._shake > 0) { const s = this._shake * 0.4; sx = (Math.random() - 0.5) * s; sz = (Math.random() - 0.5) * s; eyeY += (Math.random() - 0.5) * s; roll += (Math.random() - 0.5) * this._shake * 0.07; }
    this.camera.position.set(this.pos.x + sx, eyeY, this.pos.z + sz);
    this.camera.rotation.set(this.pitch, this.yaw, roll);

    // ---- held sword (a 3D sprite on the camera) + its charged blue tip-smoke ----
    if (this._sword) {
      this.camera.updateMatrixWorld();
      this._swingT = Math.max(0, (this._swingT || 0) - dt);
      const swing = this._swingT > 0 ? Math.sin((1 - this._swingT / 0.2) * Math.PI) : 0; // 0→1→0 over the slash
      this._sword.material.rotation = -0.9 * swing;
      const bp = this._swordBasePos, bobOff = -Math.abs(Math.sin(this._bobT)) * 0.03 * bobAmt;
      this._sword.position.set(bp.x + 0.03 * swing, bp.y + bobOff - 0.13 * swing, bp.z + 0.05 * swing);
      const pvx = (this.pos.x - (this._ppx ?? this.pos.x)) / Math.max(dt, 1e-3);
      const pvz = (this.pos.z - (this._ppz ?? this.pos.z)) / Math.max(dt, 1e-3);
      this._ppx = this.pos.x; this._ppz = this.pos.z;
      if (this._powered && !this._dead) { // emit from the blade tip, in world space so it trails the stride
        this._emitAcc = (this._emitAcc || 0) + dt * 46;
        this._tipV.set(bp.x - 0.05, bp.y + this._swordH * 0.52, bp.z); this.camera.localToWorld(this._tipV);
        while (this._emitAcc >= 1) { this._emitAcc -= 1; this._emitSmoke(this._tipV, pvx, pvz); }
      }
      this._updateSmoke(dt);
    }

    // ---- spears in flight ----
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const s = this.spears[i]; s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (s.mesh.position.distanceToSquared(TMP.copy(e.chip.position).setY(e.chip.position.y + 0.9)) < 0.8 * 0.8) { this._damage(e, SPEAR_DMG); hit = true; break; }
      }
      if (!hit && this._boss && this._boss.state === 'active' && s.mesh.position.distanceToSquared(TMP.copy(this._boss.chip.position).setY(this._boss.chip.position.y + 2.0)) < 1.8 * 1.8) { this._damageBoss(SPEAR_DMG); hit = true; }
      const r2 = s.mesh.position.x ** 2 + s.mesh.position.z ** 2;
      const grd = this._heightAt(s.mesh.position.x, s.mesh.position.z);
      if (hit || s.life <= 0 || s.mesh.position.y < grd + 0.1 || r2 > (PLAY_R + 2) ** 2 || this._collide(s.mesh.position.x, s.mesh.position.z)) {
        this.scene.remove(s.mesh); this.spears.splice(i, 1);
        if (!hit) { // it lands — stick it blade-down in the earth as a pickup
          const g = this._daggerMesh();
          const gx = Math.max(-PLAY_R + 2, Math.min(PLAY_R - 2, s.mesh.position.x)), gz = Math.max(-PLAY_R + 2, Math.min(PLAY_R - 2, s.mesh.position.z));
          g.position.set(gx, this._heightAt(gx, gz) + 0.32, gz);
          g.rotation.set(-Math.PI / 2 - 0.3, 0, 0.2);
          this.scene.add(g); this.pickups.push({ mesh: g });
        }
      } else { s.mesh.rotation.x += dt * 24; s.vel.y -= 9 * dt; } // tumbles end-over-end through the air
    }
    // retrieve landed spears
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.mesh.position.distanceToSquared(TMP.set(this.pos.x, pk.mesh.position.y, this.pos.z)) < 1.6 * 1.6) { this.scene.remove(pk.mesh); this.pickups.splice(i, 1); this.spearN += 1; this._setHud(); }
    }

    this._updateRain(dt);
    this._updateHouses(dt);
    if (this._inside !== null) return; // indoors: the wood is paused, the host waits outside

    this._updateGibs(dt);
    if (this._parley) return; // a parley holds the field — the host waits

    // ---- enemies ----
    let alive = 0;
    for (const e of this.enemies) {
      if (e.dead) continue; // slain — burst into gibs already, entry is swept below
      alive++;
      if (!this._dead) this._updateEnemy(e, dt);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this._boss) this._updateBoss(dt);
    this._updateBossProj(dt);
    this._updateEnemyProj(dt);
    this._updateBeams(dt);
    // the chapter clears once the wave is down AND the giant (if any) is laid low
    const waveClear = !this._dead && alive === 0 && this.enemies.every((e) => e.dead);
    if (waveClear && this._wantBoss && !this._boss && !this._bossDone) this._spawnBoss();
    else if (waveClear && this._morrigan && this._morriganPhase === 'fight') { this._morriganPhase = 'closing'; this._morriganClose(); }
    else if (waveClear && (!this._wantBoss || this._bossDone) && !this._cleared && !this._morrigan) this._end(true);
  }
  // ---- enemy brains ----
  _updateEnemy(e, dt) {
    const toP = TMP2.subVectors(this.pos, e.chip.position); toP.y = 0; const d = toP.length() || 1; toP.x /= d; toP.z /= d;
    e.cd = Math.max(0, e.cd - dt); e.t += dt;
    if (e.stagger > 0) { // reeling from a hit — knocked a step back, no attack
      e.stagger -= dt;
      const bx = e.chip.position.x - toP.x * 2.6 * dt, bz = e.chip.position.z - toP.z * 2.6 * dt;
      if (!this._collide(bx, bz)) { e.chip.position.x = bx; e.chip.position.z = bz; }
      e.chip.position.y = this._heightAt(e.chip.position.x, e.chip.position.z) + 0.05;
      if (e.chip.faceWorld) e.chip.faceWorld(toP.x, toP.z);
      return;
    }
    if (e.kind === 'fomorian') {
      if (e.chip.faceWorld) e.chip.faceWorld(toP.x, toP.z);
      if (d > e.reach) {
        const nx = e.chip.position.x + toP.x * e.spd * dt, nz = e.chip.position.z + toP.z * e.spd * dt;
        if (!this._collide(nx, nz)) { e.chip.position.x = nx; e.chip.position.z = nz; }
        e.chip.position.y = this._heightAt(e.chip.position.x, e.chip.position.z) + 0.05; // tread the slope
        if (e.chip.animate) e.chip.animate(dt, true); // strides, now that the walk cycles
      } else {
        if (e.chip.animate) e.chip.animate(dt, true); // keep striding — its idle frame carries an unkeyed background
        if (e.cd <= 0) { e.cd = 1.3; if (e.chip.strike) e.chip.strike(); this._hurt(e.dmg, e.chip.position); }
      }
      return;
    }
    this._updateSluagh(e, dt, d, toP);
  }
  // The sluagh keeps its distance: it drifts, then rises, looses an orb, and slips
  // off to cover behind the trees before stealing back into range.
  _updateSluagh(e, dt, d, toP) {
    if (e.chip.faceWorld) e.chip.faceWorld(toP.x, toP.z);
    const bob = Math.sin(e.t * 2.2) * 0.2;
    const gh = this._heightAt(e.chip.position.x, e.chip.position.z); // floats a set height over whatever lies below
    if (e.state === 'drift') {
      e.chip.position.y = gh + 1.0 + bob;
      const err = d - 11, dir = err > 0 ? 1 : -1, step = Math.min(Math.abs(err), 1.2) * 1.5 * dt * dir;
      const nx = e.chip.position.x + toP.x * step, nz = e.chip.position.z + toP.z * step;
      if (!this._collide(nx, nz)) { e.chip.position.x = nx; e.chip.position.z = nz; }
      e.cast += dt;
      if (e.cast > 2.6 + Math.random() * 1.5) { e.cast = 0; e.state = 'rise'; e.st = 0; }
    } else if (e.state === 'rise') {
      e.st += dt; e.chip.position.y = gh + 1.0 + e.st * 2.1 + bob * 0.4;
      if (e.st > 0.7) { this._sluaghCast(e); e.state = 'cover'; e.st = 0; e.cover = this._coverPoint(); }
    } else if (e.state === 'cover') {
      e.st += dt; e.chip.position.y = gh + 1.0 + Math.max(0, 1.5 - e.st * 2.2) + bob;
      const cp = e.cover;
      if (cp) { const cx = cp.x - e.chip.position.x, cz = cp.z - e.chip.position.z, cl = Math.hypot(cx, cz) || 1; const nx = e.chip.position.x + cx / cl * 2.2 * dt, nz = e.chip.position.z + cz / cl * 2.2 * dt; if (!this._collide(nx, nz)) { e.chip.position.x = nx; e.chip.position.z = nz; } }
      if (e.st > 2.0) { e.state = 'drift'; e.t = 0; }
    }
  }
  _coverPoint() { // a tree far from the champion to slip behind
    let best = null, bd = -1;
    for (let i = 0; i < 10; i++) { const t = this.trees[(Math.random() * this.trees.length) | 0]; if (!t) continue; const dp = (t.x - this.pos.x) ** 2 + (t.z - this.pos.z) ** 2; if (dp > bd && dp < (PLAY_R - 2) ** 2) { bd = dp; best = t; } }
    return best ? { x: best.x, z: best.z } : null;
  }
  _sluaghCast(e) {
    if (!this._orbTex) { this._orbTex = new THREE.TextureLoader().load('assets/fx/orb_purple.png?v=CBUST'); this._orbTex.colorSpace = THREE.SRGBColorSpace; }
    const from = e.chip.position, dir = new THREE.Vector3(this.pos.x - from.x, (this._eyeY() - 0.15) - from.y, this.pos.z - from.z).normalize();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._orbTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(0.95, 0.95, 1); s.position.copy(from); s.material.rotation = Math.random() * Math.PI * 2; this.scene.add(s);
    this._enemyProj.push({ mesh: s, vel: dir.multiplyScalar(10.5), life: 4, spin: Math.random() < 0.5 ? -7 : 7 });
  }
  _updateEnemyProj(dt) {
    for (let i = this._enemyProj.length - 1; i >= 0; i--) {
      const p = this._enemyProj[i]; p.mesh.position.addScaledVector(p.vel, dt); p.life -= dt;
      p.mesh.material.rotation += dt * (p.spin || 4);
      const pul = 0.95 + Math.sin(p.life * 18) * 0.12; p.mesh.scale.set(pul, pul, 1); // crackling pulse
      if (!this._dead && p.mesh.position.distanceToSquared(TMP.set(this.pos.x, this._eyeY() - 0.15, this.pos.z)) < 0.9 * 0.9) { this._hurt(13, p.mesh.position); this.scene.remove(p.mesh); this._enemyProj.splice(i, 1); }
      else if (p.life <= 0 || p.mesh.position.y < 0.1 || p.mesh.position.x ** 2 + p.mesh.position.z ** 2 > (PLAY_R + 3) ** 2) { this.scene.remove(p.mesh); this._enemyProj.splice(i, 1); }
    }
  }
  // ---- the giant: a Fomorian that erupts from the ground once the wave is cleared,
  // lumbers after the champion and hurls boulders until it is brought down ----
  _spawnBoss() {
    const chip = makeWalkerChip('fomorian', false, 4.6); chip._fullCycle = true; // the giant strides, too
    chip.position.set(0, -5, 0); this.chipGroup.add(chip);
    this._boss = { chip, hp: 420, maxHp: 420, state: 'rising', t: 0, cd: 2.2, mcd: 0 };
    this._bossWrap.style.display = 'block'; this._updateBossHud();
    this._hint.textContent = 'A giant of the Fomhóraigh tears itself from the earth — strike and hurl to fell it!';
    this._shake = 0.9; // the ground heaves
    this._raining = true; // the heavens open as it rises
    // a cold winter sky falls over the wood as the giant rises
    new THREE.TextureLoader().load('assets/sky/sky_geimhreadh.jpg?v=CBUST', (t) => { t.colorSpace = THREE.SRGBColorSpace; if (this._dome) { this._dome.material.map = t; this._dome.material.needsUpdate = true; } });
  }
  _updateBoss(dt) {
    const B = this._boss; if (!B || this._dead) return;
    if (B.state === 'rising') {
      B.t += dt; const k = Math.min(1, B.t / 3.4); B.chip.position.set(0, -5 + k * 5.05, 0); // a slow, ponderous emergence
      this._shake = Math.max(this._shake || 0, 0.55); // keep the earth heaving while it emerges
      if (B.chip.faceWorld) B.chip.faceWorld(this.pos.x, this.pos.z);
      if (B.chip.animate) B.chip.animate(dt, true); // strides as it tears free — never the unkeyed idle frame
      if (k >= 1) { B.state = 'active'; B.t = 0; } return;
    }
    if (B.state === 'dying') {
      B.t += dt; const k = Math.min(1, B.t / 1.5); B.chip.material.opacity = 1 - k; B.chip.position.y = 0.05 - k * 3.5;
      if (k >= 1) { this.chipGroup.remove(B.chip); this._boss = null; this._bossDone = true; this._raining = false; this._bossWrap.style.display = 'none'; } return;
    }
    TMP2.subVectors(this.pos, B.chip.position); TMP2.y = 0; const d = TMP2.length(); TMP2.normalize();
    if (d > 3.3) { B.chip.position.x += TMP2.x * 1.5 * dt; B.chip.position.z += TMP2.z * 1.5 * dt; }
    B.chip.position.y = this._heightAt(B.chip.position.x, B.chip.position.z) + 0.05; // climbs the slope after you
    if (B.chip.faceWorld) B.chip.faceWorld(TMP2.x, TMP2.z);
    if (B.chip.animate) B.chip.animate(dt, true); // always striding — its idle frame carries an unkeyed background
    B.mcd = Math.max(0, B.mcd - dt);
    if (d < 3.6 && B.mcd <= 0) { B.mcd = 1.5; if (B.chip.strike) B.chip.strike(); this._hurt(22, B.chip.position); }
    B.cd -= dt; if (B.cd <= 0) { B.cd = 2.1 + Math.random() * 0.9; this._bossLob(); }
  }
  _bossLob() {
    const from = TMP.copy(this._boss.chip.position); from.y = 3.2;
    const tx = this.pos.x, tz = this.pos.z, ty = this._eyeY() - 0.2;
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
      if (!this._dead && p.mesh.position.distanceToSquared(TMP.set(this.pos.x, this._eyeY() - 0.2, this.pos.z)) < 1.05 * 1.05) { this._hurt(16, p.mesh.position); this.scene.remove(p.mesh); this._bossProj.splice(i, 1); }
      else if (p.mesh.position.y < 0.15 || p.life <= 0) { this.scene.remove(p.mesh); this._bossProj.splice(i, 1); }
    }
  }
  _damageBoss(amt) {
    const B = this._boss; if (!B || B.state !== 'active') return;
    B.hp -= amt; if (B.chip.strike) B.chip.strike(); this._updateBossHud();
    if (B.hp <= 0) { B.state = 'dying'; B.t = 0; for (let i = 0; i < 4; i++) this._spawnGibs(TMP.copy(B.chip.position).setY(B.chip.position.y + 1.4 + i * 0.6), 'fomorian'); } // the giant comes apart
  }
  _updateBossHud() { if (this._boss) this._bossBar.style.width = Math.max(0, (this._boss.hp / this._boss.maxHp) * 100) + '%'; }
  _setHud() {
    this._hpBar.style.width = Math.max(0, this.hp) + '%';
    this._spearLbl.textContent = '🗡 × ' + this.spearN;
    this._setWeaponByHealth();
  }
  // One sword sprite throughout; its power reads only in the blue tip-smoke,
  // which kindles when the champion is hale enough to loose beams.
  _setWeaponByHealth() {
    this._powered = this.hp >= BEAM_MULTI;
  }
}
