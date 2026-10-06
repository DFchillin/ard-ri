import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, rotateIsoCamera, zoomIsoCamera, panIsoCamera, cameraDirLabel } from './iso_camera.js?v=CBUST';
import { Tilemap, TERRAIN_INFO } from './sim/tilemap.js?v=CBUST';
import { WorldView } from './render/world_view.js?v=CBUST';
import { BUILDINGS } from './data/buildings.js?v=CBUST';
import { Game } from './sim/game.js?v=CBUST';
import { Walker } from './sim/walkers.js?v=CBUST';
import { UI } from './ui.js?v=CBUST';
import { MONTHS_EN, SEASONS, seasonOfMonth, FESTIVALS } from './sim/calendar.js?v=CBUST';
import { setCamera } from './render/assets.js?v=CBUST';
import { Battle } from './battle/battle.js?v=CBUST';
import { Hurling } from './hurling.js?v=CBUST';
import { Sparring } from './sparring.js?v=CBUST';
import { ISLAND, KINGDOMS, NEIGHBOURS, kingdomById, OVERSEAS, overseasById } from './data/kingdoms.js?v=CBUST';
import { CODEX } from './data/codex.js?v=CBUST';
import { UNIT_TYPES } from './battle/units.js?v=CBUST';
import { GOODS, HOSTING, HOST_ORDER, canHost, reqText } from './data/trade.js?v=CBUST';
import { LEVELS, levelById } from './data/levels.js?v=CBUST';

const DAYS_PER_MONTH = 6;
const SECONDS_PER_DAY = 2.6; // real seconds per in-game day at 1×
const ECON_TICK = 0.45;      // economy step

const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1418);
scene.fog = new THREE.Fog(0x0b1418, 70, 175);

let aspect = window.innerWidth / window.innerHeight;
const camera = createIsoCamera(15, aspect);
setCamera(camera); // walkers face by screen direction

// --- Siúlóid: a first-person stroll through the ráth (a living screensaver) ---
// A perspective camera wanders the road network at eye level; buildings and folk
// (billboard sprites) turn to face it as you pass. Tap folk to inspect them.
const walkCam = new THREE.PerspectiveCamera(74, aspect, 0.05, 1000);
const _tmpV = new THREE.Vector3();
const walk = {
  active: false, follow: null, _hx: 0, _hz: 1, _first: false,
  _cp: new THREE.Vector3(), _cl: new THREE.Vector3(),
  // Townsfolk worth following: anyone abroad with a name (never the risen dead).
  _followable() { return game.walkers.filter((w) => w && !w.done && w.sprite && w.person && w.tag !== 'risen'); },
  _pickFollow(after) {
    const list = this._followable(); if (!list.length) return null;
    if (after) { const i = list.indexOf(after); if (i >= 0) return list[(i + 1) % list.length]; }
    const c = game.map.tileToWorld((game.map.size / 2) | 0, (game.map.size / 2) | 0);
    list.sort((a, b) => a.sprite.position.distanceToSquared(c) - b.sprite.position.distanceToSquared(c));
    return list[0];
  },
  cycle() { const n = this._pickFollow(this.follow); if (n) { this.follow = n; this._first = true; this._updateName(); } },
  _nearestRoad(cx, cz) {
    const m = game.map; let best = null, bd = Infinity;
    for (let z = 0; z < m.size; z++) for (let x = 0; x < m.size; x++) {
      const t = m.get(x, z); if (!t || !t.road) continue;
      const d = (x - cx) ** 2 + (z - cz) ** 2; if (d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  },
  // Once the folk you were following finish their errands, send out Deaglán or
  // Somhairlín from the builder's house to simply wander the roads — a tireless
  // subject so the stroll runs on like a screensaver. Only one at a time; cleared
  // when the stroll ends.
  _releaseRoamer() {
    const live = game.walkers.find((w) => w && w.tag === 'stroll' && !w.done);
    if (live) return live;
    const house = game.buildings.find((b) => b.key === 'builder_house' && !b.building);
    const c = house ? game._center(house) : game.map.tileToWorld((game.map.size / 2) | 0, (game.map.size / 2) | 0);
    const ct = game.map.worldToTile(c.x, c.z) || { x: (game.map.size / 2) | 0, z: (game.map.size / 2) | 0 };
    const start = this._nearestRoad(ct.x, ct.z); if (!start) return null;
    const who = Math.random() < 0.5
      ? { type: 'somhairlin', name: 'Somhairlín', roleEn: 'the Master Builder', roleGa: 'saor' }
      : { type: 'deaglan', name: 'Deaglán', roleEn: 'the Road-maker', roleGa: 'bóthaire' };
    const person = { name: who.name, roleEn: who.roleEn, roleGa: who.roleGa, female: false, phraseGa: '', phraseEn: '' };
    const w = new Walker(game.map, start, { type: who.type, steps: 999999, speed: 1.9, person });
    w.tag = 'stroll';
    game.walkers.push(w); game.walkerGroup.add(w.sprite);
    return w;
  },
  _updateName() {
    const el = document.getElementById('walk-name'); if (!el) return;
    const p = this.follow && this.follow.person;
    const roam = this.follow && this.follow.tag === 'stroll';
    el.innerHTML = p
      ? `<b>${p.nick ? `${p.name} ‘${p.nick}’` : p.name}</b><span>${p.roleEn} · ${roam ? 'roaming the ráth' : 'tap to follow another'}</span>`
      : `<b>Nobody abroad</b><span>waiting for folk…</span>`;
  },
  enter() {
    let w = this._pickFollow(null);
    if (!w) w = this._releaseRoamer(); // nobody abroad — send out a roamer so the stroll still runs
    if (!w) { flashNotice('🚶 Lay a road through your ráth first — there is nowhere to stroll yet.'); return; }
    this.follow = w; this._first = true;
    this.active = true;
    this._setSky(true);
    // Tuck away the build-mode markers (road-alert "!" and inspect dots) — they
    // billboard and would float in the sky over a scenic stroll.
    for (const b of game.buildings) {
      if (b.alert) { b._alertWas = b.alert.visible; b.alert.visible = false; }
      if (b.dot) { b._dotWas = b.dot.visible; b.dot.visible = false; }
    }
    document.getElementById('ui-overlay').classList.add('in-walk');
    this._updateName();
    ui.hideInspect();
  },
  // Swap the flat settlement sky for a clearing: a gradient skydome (blue overhead
  // fading to a green haze of trees at the horizon) plus fog that closes the ground
  // into that haze — so at eye level the ráth reads as a clearing ringed by forest,
  // not a grey void. A real dome mesh (not a background texture) renders the same on
  // every screen shape and device.
  _skyDome: null,
  _setSky(on) {
    if (on) {
      if (!this._skyDome) {
        const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
        const x = cv.getContext('2d');
        const g = x.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0.0, '#8ec5ea'); g.addColorStop(0.38, '#a9d4ee'); g.addColorStop(0.56, '#cfe6ef');
        g.addColorStop(0.66, '#aec489'); g.addColorStop(0.76, '#86a65c'); g.addColorStop(1.0, '#5c7d40');
        x.fillStyle = g; x.fillRect(0, 0, 16, 256);
        const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, fog: false, depthWrite: false });
        this._skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), mat);
        this._skyDome.renderOrder = -10;
        scene.add(this._skyDome);
      }
      this._skyDome.visible = true;
      this._buildScenery(); this._scenery.visible = true;
      const sk = SEASON_SKY[curSeason] || SEASON_SKY.earrach;
      this._skyDome.material.color.setHex(sk.tint); // tint the dome to the season's mood
      this._savedFog = { color: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far };
      scene.fog.color.setHex(sk.fog); scene.fog.near = 7; scene.fog.far = 58;
    } else {
      if (this._skyDome) this._skyDome.visible = false;
      if (this._scenery) this._scenery.visible = false;
      if (this._savedFog) { scene.fog.color.setHex(this._savedFog.color); scene.fog.near = this._savedFog.near; scene.fog.far = this._savedFog.far; this._savedFog = null; }
    }
  },
  // Low-poly hills and cone-trees ringing the ráth, drawn once in Three.js geometry.
  // They sit out past the settlement and are fog-affected, so they read as hazy green
  // forest and rolling hills beyond the clearing — real depth under the skydome.
  _scenery: null,
  _buildScenery() {
    if (this._scenery) return;
    const g = new THREE.Group();
    let seed = 1337; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
    const leafMats = [0x3f6b32, 0x4c7a38, 0x37602c, 0x567f3f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const hillMats = [0x4a6b3a, 0x3e5c32, 0x56763f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.42, 2.0, 5);
    const coneGeo = new THREE.ConeGeometry(2.0, 4.2, 7);
    // Trees sit out past the ráth's ground plane, so sink them below the horizon:
    // the trunks drop out of sight and only the canopies crown the treeline.
    const TREE_SINK = -3.4;
    const tree = (x, z, s) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.0 * s; trunk.scale.setScalar(s);
      const leaf = new THREE.Mesh(coneGeo, leafMats[(rnd() * leafMats.length) | 0]); leaf.position.y = (2.0 + 1.4) * s; leaf.scale.setScalar(s);
      const leaf2 = new THREE.Mesh(coneGeo, leafMats[(rnd() * leafMats.length) | 0]); leaf2.position.y = (2.0 + 2.6) * s; leaf2.scale.setScalar(s * 0.72);
      t.add(trunk, leaf, leaf2); t.position.set(x, TREE_SINK, z); g.add(t);
    };
    // trees ring the clearing in copses — smaller trees, bunched into stands with
    // gaps between, rather than an even picket line.
    for (let c = 0; c < 26; c++) {
      const a = rnd() * Math.PI * 2, r = 30 + rnd() * 26; // copse centre, radius 30–56
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const n = 5 + ((rnd() * 7) | 0);
      for (let i = 0; i < n; i++) {
        const x = cx + (rnd() - 0.5) * 7, z = cz + (rnd() - 0.5) * 7, s = 0.45 + rnd() * 0.5;
        tree(x, z, s);
      }
    }
    // rolling hills further out, bigger now, rising well above the tree-line
    for (let i = 0; i < 24; i++) {
      const a = rnd() * Math.PI * 2, r = 54 + rnd() * 34; // radius 54–88
      const w = 18 + rnd() * 26, h = 12 + rnd() * 18;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(w, h, 8), hillMats[(rnd() * hillMats.length) | 0]);
      hill.position.set(Math.cos(a) * r, -2, Math.sin(a) * r); g.add(hill);
    }
    g.visible = false; this._scenery = g; scene.add(g);
  },
  exit() {
    this.active = false;
    this._setSky(false);
    for (const b of game.buildings) {
      if (b.alert && b._alertWas !== undefined) { b.alert.visible = b._alertWas; b._alertWas = undefined; }
      if (b.dot && b._dotWas !== undefined) { b.dot.visible = b._dotWas; b._dotWas = undefined; }
    }
    // Send the stroll-only roamer(s) home: they exist for the screensaver, not the ráth.
    for (let i = game.walkers.length - 1; i >= 0; i--) {
      const w = game.walkers[i];
      if (w && w.tag === 'stroll') { game.walkerGroup.remove(w.sprite); if (w.dispose) w.dispose(); game.walkers.splice(i, 1); }
    }
    this.follow = null;
    document.getElementById('ui-overlay').classList.remove('in-walk');
  },
  update(dt) {
    // Follow one subject for their whole path. When they finish their errand (or
    // leave), send out Deaglán/Somhairlín to roam the roads and follow them on —
    // a tireless subject so the stroll runs like a screensaver.
    if (!this.follow || this.follow.done || !game.walkers.includes(this.follow)) {
      this.follow = this._releaseRoamer() || this._pickFollow(null);
      this._first = true; this._updateName();
      if (!this.follow) return;
    }
    const p = this.follow.sprite.position;
    // Heading from the walker's own facing (world); hold the last one while they stand.
    const s = this.follow.sprite, hl = Math.hypot(s._dx || 0, s._dz || 0);
    if (hl > 0.0001) { this._hx = s._dx / hl; this._hz = s._dz / hl; }
    // Chase pose: behind and a little to one side, so the walker reads as a 3/4 back
    // view (the diagonal facings that carry real stride art) rather than a flat spine.
    const rx = -this._hz, rz = this._hx; // heading turned 90° → camera-side offset
    const DIST = 2.7, SIDE = 1.15, HEIGHT = 1.55, HEAD = 0.78, AHEAD = 1.3;
    const cx = p.x - this._hx * DIST + rx * SIDE, cz = p.z - this._hz * DIST + rz * SIDE;
    const tx = p.x + this._hx * AHEAD, tz = p.z + this._hz * AHEAD;
    if (this._first) { this._cp.set(cx, HEIGHT, cz); this._cl.set(tx, HEAD, tz); this._first = false; }
    else {
      const k = Math.min(1, dt * 3.2);
      this._cp.lerp(_tmpV.set(cx, HEIGHT, cz), k);
      this._cl.lerp(_tmpV.set(tx, HEAD, tz), k);
    }
    walkCam.position.copy(this._cp);
    walkCam.lookAt(this._cl);
    if (this._skyDome) this._skyDome.position.set(this._cp.x, 0, this._cp.z); // sky travels with you
  },
};
// Show the pegman only when a settlement with roads is on screen; the exit button
// only while strolling.
function updateWalkBtn() {
  const peg = document.getElementById('walk-btn'), ex = document.getElementById('walk-exit');
  const inSettlement = titleScreenEl.classList.contains('hidden') && !battle.active && !hurling.active && !sparring.active;
  const hasRoads = !!(game.map && game.map.tiles && game.map.tiles.some((t) => t && t.road));
  if (peg) peg.classList.toggle('hidden', !(inSettlement && !walk.active && hasRoads));
  if (ex) ex.classList.toggle('hidden', !walk.active);
}
document.getElementById('walk-btn')?.addEventListener('click', () => walk.enter());
document.getElementById('walk-exit')?.addEventListener('click', () => walk.exit());
document.getElementById('walk-name')?.addEventListener('click', () => walk.cycle());

const hemi = new THREE.HemisphereLight(0xd6f0cf, 0x40602f, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xdfffcf, 1.8);
sun.position.set(40, 70, 20);
scene.add(sun);
// Seasonal accent: a coloured light from a different corner each season.
const accent = new THREE.DirectionalLight(0x8fe06a, 2.4);
scene.add(accent);
scene.add(accent.target);
const SEASON_ACCENT = {
  earrach:    { color: 0x8fe06a, pos: [-45, 42, -45] },
  samhradh:   { color: 0xffd166, pos: [45, 42, -45] },
  fomhar:     { color: 0xff8a4a, pos: [45, 42, 45] },
  geimhreadh: { color: 0x8fbfff, pos: [-45, 42, 45] },
};
// The stroll's sky takes the mood of the season: a tint multiplied over the blue→
// green skydome, and a matching haze for the fog where ground meets the treeline.
const SEASON_SKY = {
  earrach:    { tint: 0xeafff0, fog: 0x9fbf72 }, // spring — fresh green
  samhradh:   { tint: 0xfff3d6, fog: 0xbcc877 }, // summer — warm gold
  fomhar:     { tint: 0xffe1ba, fog: 0xc2a46a }, // autumn — amber
  geimhreadh: { tint: 0xd6e4f2, fog: 0xbcc8c4 }, // winter — cold and pale
};

// The ráth-land is randomised once, then it is your homeland — the same seed
// (and the buildings on it) return every session. Read the seed before the map.
const _savedCampaign = (() => { try { return JSON.parse(localStorage.getItem('ardri_campaign') || '{}'); } catch (e) { return {}; } })();
const _mapSeed = _savedCampaign.mapSeed != null ? _savedCampaign.mapSeed : (Math.random() * 0x7fffffff) | 0;
const map = new Tilemap(32, 1, _mapSeed);
const view = new WorldView(scene, map);
const game = new Game(map, scene);
// Somhairlín has raised a great work — announce it and refresh the stats/menu.
game.onBuilt = (inst) => {
  flashNotice(`🔨 Somhairlín has raised your ${inst.def.label}.`); pushStats(); saveSettlement();
  if (inst.def.needsWin) { campaign.monumentWon = false; ui.hurlWon = false; saveCampaign(); } // one monument per hurling win — win again to raise another
  if (inst.def.unique || inst.def.needsWin) ui.refreshBuildMenu();
};
// A family turned out of a home leaves bitter — and takes value with them. The
// sim has already docked the silver; here we drive off the cow and announce it.
game.onEvict = ({ name, reason, silver, cow }) => {
  const tookCow = cow && campaign.cattle > 0;
  if (tookCow) setCattle(campaign.cattle - 1);
  pushStats(); saveSettlement();
  const took = [silver ? `🪙 ${silver} silver` : null, tookCow ? '🐄 a cow' : null].filter(Boolean).join(' and ');
  const how = reason === 'evicted' ? 'is turned out of a home that can no longer hold them' : 'abandons your ráth, unfed and unwatered';
  flashNotice(`😠 The ${name} family ${how}${took ? ` — and takes ${took} in spite` : ''}. Keep your homes fed and prospering, ${leaderName()}.`);
};

const sim = { speed: 1 };
const cal = { day: 5, month: 0 }; // open in the last days of winter, a breath before Imbolc
let curSeason = seasonOfMonth(cal.month);
let tool = null;
let savedSpeed = null;
let started = false;
const titleScreenEl = document.getElementById('title-screen');
let missionDone = false;

const ui = new UI({
  onTool: (kind) => { cancelPending(); tool = kind; if (!(tool === 'road' || BUILDINGS[tool])) preview.visible = false; game.showInspectDots(kind === 'inspect'); },
  onSpeed: (s) => { sim.speed = s; savedSpeed = null; },
  onRotate: (d) => { if (sparring.active) return; if (hurling.active) { rotateIsoCamera(hurling.camera, d); return; } if (battle.active) { battle.rotate(d); return; } ui.setCompass(rotateIsoCamera(camera, d)); },
  onZoom: (f) => { if (sparring.active) return; if (hurling.active) { hurling.zoom(f); return; } if (battle.active) { battle.zoom(f); return; } zoomIsoCamera(camera, f, aspect); },
  onInspectClose: () => { _inspectDwelling = null; resumeGame(); },
  onFestivalContinue: () => { if (battleWon) { battleWon = false; battle.exit(); } else resumeGame(); },
  onStartMission: (n) => startMission(n),
  onPlaceConfirm: () => confirmBuild(),
  onPlaceCancel: () => cancelPending(),
  onPlaceAlt: () => altRoute(),
  onLedger: () => showLedger(),
  onAdvisors: () => showAdvisors(),
});
// Lets the build menu hide a unique building (the homestead) once one is raised.
ui.builtCount = (role) => game.count(role);

// Grain stores hold barley from fields and apples from orchards in one pool — name
// the goods for what the settlement actually grows, so apples get their due.
function hasOrchard() { return game.buildings.some((b) => b.def.produce === 'apples'); }
function storeGoods() { return hasOrchard() ? 'food' : 'grain'; } // once orchards stand, barley and apples pool as one "food"
function showAdvisors() {
  const B = game.buildings;
  const sum = (role, key) => B.reduce((n, b) => n + (b.def.role === role ? (b[key] || 0) : 0), 0);
  const fields = game.count('farm');
  const ripe = B.filter((b) => b.def.role === 'farm' && b.ripe).length;
  const st = game.standing();
  const spearmen = Math.floor(game.folk / 2);
  const strength = spearmen + Math.floor(game.cattle / 4) + Math.floor(game.silver / 50);
  const host = strength < 6 ? 'a lone champion'
    : strength < 14 ? 'a cattle-raiding party'
    : strength < 28 ? 'a túath war-band'
    : strength < 48 ? 'a great host'
    : 'an army fit for the High King';
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const html =
    `<h3>Trusted Advisors</h3><div class="role">Counsel at your ear</div>` +
    `<div class="advisor"><h4>🌾 An Rechtaire · the Steward</h4><table class="ledger">` +
      row('Fields sown', fields + (ripe ? ` · ${ripe} ripe` : '')) +
      row(hasOrchard() ? 'Food in store' : 'Grain in store', sum('granary', 'stock')) +
      row('At market', sum('market', 'stock')) +
      row('Wells', game.count('well')) +
    `</table></div>` +
    `<div class="advisor"><h4>📜 An tOllamh · the Poet</h4><table class="ledger">` +
      row('Folk', game.folk) +
      row('Content', `${game.folkContent()} / ${game.folk}`) +
      row('Cultured', `${game.culturedFolk()} / ${game.folk}`) +
      row('Shrines', game.count('altar')) +
      `<tr class="net"><td>Standing</td><td>${st.title} · ${st.score}</td></tr>` +
    `</table></div>` +
    `<div class="advisor"><h4>⚔️ An Toísech · the War-Leader</h4><table class="ledger">` +
      row('Cattle', game.cattle) +
      row('Silver', `🪙 ${game.silver}`) +
      row('Fighting folk', spearmen) +
      row('Colonies', campaign.colonies.length ? campaign.colonies.map((c) => c.name).join(', ') : '—') +
      `<tr class="net"><td>War-band</td><td>${host}</td></tr>` +
    `</table></div>` +
    `<p class="fest-note">The Toísech reckons your strength from folk, cattle and silver — the raid-wealth of a Gaelic king.</p>`;
  ui.showInspect(html, false);
}

function showLedger() {
  const festivalToday = cal.day === 1 && !!FESTIVALS[cal.month];
  const rent = game.dailyRent(festivalToday);
  const wages = game.dailyWages();
  const net = rent - wages;
  const content = game.folkContent();
  const st = game.standing();
  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const html =
    `<h3>The Ledger</h3><div class="role">Rents &amp; wages, each day</div>` +
    `<table class="ledger">` +
    `<tr><td>Treasury</td><td>🪙 ${game.silver}</td></tr>` +
    `<tr><td>Rents in</td><td class="pos">+${rent}</td></tr>` +
    `<tr><td>Wages out</td><td class="neg">−${wages}</td></tr>` +
    `<tr class="net"><td>Net / day</td><td class="${net >= 0 ? 'pos' : 'neg'}">${sign(net)}</td></tr>` +
    `<tr><td>Folk content</td><td>${content} / ${game.folk}</td></tr>` +
    `<tr><td>Folk cultured</td><td>${st.cultured} / ${game.folk}</td></tr>` +
    `<tr class="net"><td>Standing</td><td>${st.title} · ${st.score}</td></tr>` +
    `</table>` +
    (festivalToday ? `<p class="fest-note">Festival today — content folk pay a generous bonus.</p>` : '') +
    (game.broke ? `<p class="fest-note broke">The cauldron runs dry — public folk go unpaid.</p>` : '');
  ui.showInspect(html, false);
}

let battleWon = false;
const battle = new Battle({
  onVictory: (info) => {
    battleWon = true;
    if (info && info.cattle) setCattle(campaign.cattle + info.cattle);
    let sub = (info && info.sub) || `The enemy slua is broken and flees the field. Ériu will remember this cath, ${leaderName()}.`;
    if (campaign._newColony) { sub += ` And a new Dál is planted in ${campaign._newColony} — your rule now reaches to the far side of the island.`; campaign._newColony = null; }
    ui.showFestival({ name: campaign._colonyWin ? 'A New Dál' : 'Victory!', emoji: campaign._colonyWin ? '🏴' : '🏆', sub });
    campaign._colonyWin = false;
  },
  onDefeat: (info) => {
    battleWon = false;
    const sub = (info && info.sub) || 'Your slua is broken and scattered.';
    ui.showFestival({ name: 'Defeat', emoji: '💀', sub: `${sub} The day is lost, ${leaderName()} — but a ráth can be raised again.`, onDone: () => { battle.exit(); } });
  },
  onTruce: (cattle) => {
    if (battle.scenario === 'menace') { const rem = battle.menaceRemainingHp(); if (rem != null) { campaign.menaceHp = rem > 0 ? rem : UNIT_TYPES.fomor.hp; saveCampaign(); } } // his wounds persist even if you withdraw
    battle.exit();
    if (cattle) setCattle(campaign.cattle - cattle);
    ui.showFestival({ name: 'A Truce', emoji: '🕊️', sub: `You paid a bóruma of ${cattle} cattle and withdrew. No blood was shed this day — though the foe remembers your silver.` });
  },
  onExit: () => { ui.showTitle(); refreshCampaignButton(); },
  onResolve: ({ won, roster, fallen, ransack }) => {
    campaign.ghosts = roster.ghost || 0;
    const r = { ...roster }; delete r.ghost; delete r.somhairlin; delete r.deaglan; campaign.roster = r; // the craftsfolk are signature folk, granted fresh each muster — never banked or lost for good
    for (const f of fallen) campaign.fallen.push({ type: f.type, name: DEAD_NAMES[(Math.random() * DEAD_NAMES.length) | 0], season: curSeason });
    const overseas = campaign._overseas ? overseasById(battle.scenario) : null; // a raid across the sea
    if (won && (battle.scenario === 'attack' || overseas)) {
      campaign.raidsWon = (campaign.raidsWon || 0) + 1; // a won foray advances the map-era chapters and the crown
      if (overseas) {
        setCattle(campaign.cattle + overseas.plunderCattle);
        if (overseas.plunderSilver) { game.silver += overseas.plunderSilver; pushStats(); saveSettlement(); }
        for (const gk of overseas.spoils) campaign.goods[gk] = (campaign.goods[gk] || 0) + 1;
        campaign._looted = overseas.spoils[0];
        const spoilStr = overseas.spoils.map((g) => `${GOODS[g].icon} ${GOODS[g].label}`).join(', ');
        flashNotice(`⛵ ${overseas.en} is plundered! Home come 🐄 ${overseas.plunderCattle}${overseas.plunderSilver ? `, 🪙 ${overseas.plunderSilver} silver` : ''} and ${spoilStr}.`);
      } else {
        setCattle(campaign.cattle + 8 + ((Math.random() * 8) | 0)); // plunder driven home from a won raid
        if (Math.random() < 0.5) { const gk = Object.keys(GOODS)[(Math.random() * Object.keys(GOODS).length) | 0]; campaign.goods[gk] = (campaign.goods[gk] || 0) + 1; campaign._looted = gk; } // and sometimes foreign spoils
        if (campaign._raidFar && campaign.target && !isColony(campaign.target)) { const k = foundColony(campaign.target); if (k) { campaign._newColony = k.en; campaign._colonyWin = true; } }
      }
      // Four won raids make you Ard Rí. The grand proclamation is the level-7
      // narrative; here we hold the crown as a real, loseable state — and a raid
      // won while the crown is contested wins it straight back.
      if (campaign.raidsWon >= ARDRI_RAIDS && !campaign.ardRi) {
        campaign.ardRi = true; campaign.everArdRi = true;
        if (campaign.crownContested) { campaign.crownContested = false; flashNotice('👑 The crown is yours once more — Ériu names you Ard Rí again.'); }
      }
    }
    if (campaign.ardRi) campaign.everArdRi = true; // once crowned, the longships may always sail
    // A defeat while you wear the crown reopens the contest: the sub-kings stir,
    // and you are High King no longer until you prove your strength with a raid.
    if (!won && campaign.ardRi && (battle.scenario === 'attack' || battle.scenario === 'defend' || overseas)) {
      campaign.ardRi = false; campaign.crownContested = true;
      flashNotice('⚔ A defeat, and the sub-kings rise — the battle for the crown is back. Win a raid abroad to reclaim your High Kingship.');
    }
    if (won && battle.scenario === 'menace') { campaign._menaceRepelled = true; game.clearMenace(); saveSettlement(); } // the menace is thrown back, the blight lifts
    if (battle.scenario === 'menace') { // carry the Ollphéist's wounds to the next fight; reset to full once he is slain
      const rem = battle.menaceRemainingHp();
      if (rem != null) { campaign.menaceHp = rem > 0 ? rem : UNIT_TYPES.fomor.hp; saveCampaign();
        if (rem > 0 && !won) flashNotice(`☠️ You could not finish him — but the Ollphéist bleeds. ${Math.round(rem)}/${UNIT_TYPES.fomor.hp} of his strength remains. Muster again and end him.`); }
    }
    if (ransack) {
      const lost = Math.floor(campaign.cattle / 2) + 6; setCattle(campaign.cattle - lost); campaign._ransacked = lost;
      if (campaign.colonies.length && Math.random() < 0.5) { const gone = campaign.colonies.splice((Math.random() * campaign.colonies.length) | 0, 1)[0]; campaign._ransacked = lost; flashNotice(`🏴 While you fought at home, ${gone.name} threw off your yoke.`); }
    }
    campaign._raidFar = false; campaign._overseas = false;
    saveCampaign();
  },
});

function startMission(n) {
  n = String(n);
  if (n === '1') { startCampaign(); return; }           // the raid & be-raided loop on the map of Ériu
  if (n === '2') {
    started = true;
    if (campaign._ransacked) { const lost = campaign._ransacked; campaign._ransacked = 0; saveCampaign(); triggerFestival({ name: 'The Ráth Ransacked', emoji: '🔥', sub: `The raiders drove off ${lost} head of cattle and put the ráth to the torch, ${leaderName()}. Rebuild what was burned, and remember the fallen at your altars.` }); }
    else triggerFestival(FESTIVALS[1]);
    return;
  } // sandbox / rebuild a settlement
  if (n === '3') { enterBattle('attack'); return; }     // sandbox: a pitched battle to test the field
}

// The Campaign hub is your own ráth: build and hold it here. Ride out to raid
// from the 🗺 map when you choose, and raiders answer in their own time.
function startCampaign() {
  if (!campaign.home) { openKingdomMap('choose', 'intro'); return; } // first pick a home, then the opening tale
  enterSettlement(); // raiders you provoked now give you warning — see the countdown banner; the defence fires when it runs out
}
// Drop into the standing ráth — the clock starts because the title is hidden.
function enterSettlement() { closeKingdomMap(); if (titleScreenEl) titleScreenEl.classList.add('hidden'); updateMenaceButton(); updateRaidBanner(); game.setHurlChallenge(campaign.hurlChallenge); game.setSparChallenge(campaign.sparChallenge); game.deadWalk = (cal.month === 10); }

// --- Raiders give warning now: a provoked war-band marches on your ráth after a
// short countdown, so you can muster and ready your defences before they arrive.
const RAID_WARNING_DAYS = 12; // two months' grace
let _raidBannerEl = null;
function updateRaidBanner() {
  const n = campaign.raidIn || 0;
  if (!_raidBannerEl) { _raidBannerEl = document.createElement('div'); _raidBannerEl.id = 'raid-banner'; document.getElementById('ui-overlay').appendChild(_raidBannerEl); }
  if (n > 0) { _raidBannerEl.innerHTML = `⚔ Raiders on the march — <b>${n}</b> day${n === 1 ? '' : 's'} to muster and ready the ráth`; _raidBannerEl.classList.add('show'); }
  else _raidBannerEl.classList.remove('show');
}
function scheduleRaid() { campaign.raidIn = RAID_WARNING_DAYS; campaign.nextIsDefend = false; saveCampaign(); updateRaidBanner(); }

// A brief, non-blocking banner for seasonal news (colony tribute, revolts).
let _noticeEl = null, _noticeT = 0;
function flashNotice(msg) {
  if (!_noticeEl) { _noticeEl = document.createElement('div'); _noticeEl.id = 'notice-toast'; document.getElementById('ui-overlay').appendChild(_noticeEl); }
  _noticeEl.innerHTML = msg; _noticeEl.classList.add('show');
  clearTimeout(_noticeT); _noticeT = setTimeout(() => _noticeEl.classList.remove('show'), 4200);
}

// --- Colonies: land won by raiding further afield (a Dál Riata), sending tribute home ---
const NEIGHBOURS_OF = (id) => NEIGHBOURS[id] || [];

// A named rival lord for each over-kingdom. One is always "rising" — his host
// grows, notices name him, and he is the one whose war-band comes to the gate.
const RIVALS = {
  ailech: 'Muirchertach Mac Lochlainn', ulaid: 'Eochaid of the Ulaid', airgialla: 'Donnchadh Ua Cerbaill',
  connacht: 'Ruaidrí Ua Conchobair', breifne: 'Tigernán Ua Ruairc', mide: 'Murchad Ua Máel Sechlainn',
  laigin: 'Diarmait Mac Murchada', tuadmumu: 'Toirdelbach Ua Briain', desmumu: 'Cormac Mac Carthaig',
};
function heldRegions() { const held = new Set(); if (campaign.home) held.add(campaign.home); for (const c of (campaign.colonies || [])) held.add(c.region); return held; }
function rivalFor(id) { const k = kingdomById(id); return k ? { id, name: RIVALS[id] || `the lord of ${k.en}`, region: k.en } : null; }
// Raise up a rising rival in a province you do not hold, and name him.
function riseRival() {
  const held = heldRegions();
  const pool = KINGDOMS.filter((k) => !held.has(k.id));
  if (!pool.length) return null;
  campaign.rival = rivalFor(pool[(Math.random() * pool.length) | 0].id);
  saveCampaign();
  return campaign.rival;
}
function isColony(region) { return campaign.colonies.some((c) => c.region === region); }
function foundColony(region) {
  if (isColony(region)) return null;
  const k = kingdomById(region);
  campaign.colonies.push({ region, name: k.en, seasons: 0, folk: 0, settlement: null });
  saveCampaign();
  return k;
}
// Each turn of the year, the colonies render their tribute to the homestead.
function colonyFolk(c) { return campaign.active === c.region ? game.folk : (c.folk || 0); }
function collectColonyTribute() {
  if (!campaign.colonies.length) return;
  // A distant Dál may throw off your rule on its own over the turn of the year —
  // a thriving, well-settled colony is harder to lose than a thinly-held one, and
  // one you hold in person (you are there this season) never revolts.
  const revolted = campaign.colonies.filter((c) => campaign.active !== c.region && Math.random() < (colonyFolk(c) >= 10 ? 0.05 : 0.12));
  for (const c of revolted) { const i = campaign.colonies.indexOf(c); if (i >= 0) campaign.colonies.splice(i, 1); flashNotice(`🏴 ${c.name} has thrown off your yoke and returned to its own kings — a Dál lost.`); }
  if (!campaign.colonies.length) { saveCampaign(); return; }
  let cattle = 0; const goods = []; let small = 0;
  for (const c of campaign.colonies) {
    c.seasons = (c.seasons || 0) + 1;
    const folk = colonyFolk(c);
    const cows = Math.floor(folk / 10); // a cow in tribute for every ten who settle there
    cattle += cows;
    if (!cows) small += 1;
    if (folk >= 10 && Math.random() < 0.4) { const gk = Object.keys(GOODS)[(Math.random() * Object.keys(GOODS).length) | 0]; campaign.goods[gk] = (campaign.goods[gk] || 0) + 1; goods.push(GOODS[gk].icon); }
  }
  if (cattle) setCattle(campaign.cattle + cattle);
  saveCampaign();
  if (cattle || goods.length) flashNotice(`🏴 Tribute from your colonies: 🐄 ${cattle}${goods.length ? ' · ' + goods.join(' ') : ''}`);
  else if (small) flashNotice('🏴 Your colonies are yet too small to render tribute — build them up past ten souls (open the 🗺 map and enter one).');
}

// Each turn of the year the ráth raises fresh levy to replace the fallen: the
// growing settlement feeds the war-band, so losses in battle are made good over
// a few seasons instead of draining it to nothing. The levy (villagers) regrows
// toward an establishment scaled to the town's size; the city's own paid hands
// (water/grain/druid) are retrained toward their keep. Earned veterans
// (warriors, seasoned, curadh) are NOT free — they come only from won battles.
function replenishWarband() {
  if (!campaign.roster || !game.folk) return;
  const levyCap = Math.max(6, Math.min(16, Math.floor(game.folk / 4))); // about a quarter of the folk stand as levy, 6–16
  const cur = campaign.roster.villager || 0;
  let raised = 0;
  if (cur < levyCap) {
    raised = Math.min(levyCap - cur, Math.max(1, Math.floor(game.folk / 10))); // recruits trained this season
    campaign.roster.villager = cur + raised;
  }
  const base = { water: 3, grain: 3, druid: 2 }; // the settlement's own paid hands, retrained toward their keep
  let retrained = 0;
  for (const k in base) if ((campaign.roster[k] || 0) < base[k]) { campaign.roster[k] = (campaign.roster[k] || 0) + 1; retrained++; }
  if (raised || retrained) { saveCampaign(); flashNotice(`⚔ The ráth raises ${raised} fresh levy${retrained ? ` and retrains ${retrained} hands` : ''} — your war-band is made good.`); }
}

// --- Campaign: a home kingdom and your battle livery, kept per device ---
const CAMPAIGN_KEY = 'ardri_campaign';
const DEFAULT_ROSTER = { villager: 6, water: 3, grain: 3, druid: 2, warrior: 3, seasoned: 2, curadh: 1 }; // deaglan/somhairlín are signature folk granted at muster, not banked; heroes/gods are hosted and summoned
let campaign = Object.assign({ leader: null, home: null, livery: ['#2f5fc0', '#eae2c8'], roster: { ...DEFAULT_ROSTER }, ghosts: 0, fallen: [], cattle: 0, mapSeed: _mapSeed, settlement: null, level: 1, doneObjectives: [] }, _savedCampaign);
if (!campaign.roster) campaign.roster = { ...DEFAULT_ROSTER };
if (!campaign.fallen) campaign.fallen = [];
if (!campaign.pendingRise) campaign.pendingRise = []; // souls committed to the next Samhain rite
if (!campaign.level) campaign.level = 1;
if (!campaign.doneObjectives) campaign.doneObjectives = [];
if (!campaign.goods) campaign.goods = {};
if (!campaign.hosted) campaign.hosted = {};
if (!campaign.colonies) campaign.colonies = []; // Dál Riata-style holdings won by raiding further afield — each a full ráth of its own
if (!campaign.active) campaign.active = 'home'; // which settlement is loaded: 'home' or a colony's region id
if (campaign.yearsElapsed == null) campaign.yearsElapsed = 0; // festivals are announced only for the first three years
if (campaign.raidIn == null) campaign.raidIn = 0; // days until a provoked war-band arrives (0 = none pending)
if (campaign.hurlChallenge == null) campaign.hurlChallenge = false; // a wandering band waits at the hurling field
if (campaign.sparChallenge == null) campaign.sparChallenge = false; // a roaming champion waits at the wrestling green
if (campaign.monumentWon == null) campaign.monumentWon = false; // won the hurling challenge → may raise a monument
if (campaign.menaceHp == null) campaign.menaceHp = UNIT_TYPES.fomor.hp; // the Ollphéist's remaining HP, carried between menace battles until he is slain
const ARDRI_RAIDS = 4; // four won raids make you Ard Rí
if (campaign.ardRi == null) campaign.ardRi = (campaign.raidsWon || 0) >= ARDRI_RAIDS; // do we currently wear the High Kingship
if (campaign.crownContested == null) campaign.crownContested = false; // lost the crown in battle — win a raid to reclaim
if (campaign.everArdRi == null) campaign.everArdRi = campaign.ardRi; // once proclaimed, the longships may sail beyond Ériu even if the crown is later contested
const FLEET_COST = 8; // cattle to launch a fleet across the sea
ui.hurlWon = campaign.monumentWon; // the monument is a build-menu prize
// --- The hurling challenge: a wandering band, a shootout of points, a monument ---
const hurling = new Hurling({
  onResolve: (won) => {
    campaign.hurlChallenge = false; game.setHurlChallenge(false);
    if (won) { campaign.monumentWon = true; ui.hurlWon = true; ui.refreshBuildMenu(); flashNotice('🏆 The field is yours! Raise a Monument from the Culture menu — while it stands the harvest is a fifth more plentiful.'); }
    saveCampaign();
  },
  onClose: () => { resumeGame(); },
});
function openHurling() {
  pauseGame(); ui.hideInspect();
  const roster = { ...campaign.roster };
  roster.deaglan = Math.max(1, roster.deaglan || 0);                 // the path-maker always fields a hurley
  if (game.countBuilt('builder_house') > 0) roster.somhairlin = Math.max(1, roster.somhairlin || 0); // Somhairlín plays while her House stands
  hurling.open(roster, campaign.hosted);
}
const HURL_CHANCE = 1 / 3; // one in three each season a band comes calling (this runs on the season turn)
function maybeHurlChallenge() {
  if (campaign.hurlChallenge || !game.hurlingField()) return;
  if (Math.random() < HURL_CHANCE) {
    campaign.hurlChallenge = true; game.setHurlChallenge(true); saveCampaign();
    flashNotice('🏑 A wandering band of hurlers waits at your field, spoiling for a challenge. Tap the hurling field to meet them.');
  }
}

// --- The sparring bout: a roaming champion, three corner-called rounds, a monument ---
const sparring = new Sparring({
  onResolve: (won) => {
    campaign.sparChallenge = false; game.setSparChallenge(false);
    if (won) { campaign.monumentWon = true; ui.hurlWon = true; ui.refreshBuildMenu(); flashNotice('🏆 The bout is yours! Raise a Monument from the Culture menu — while it stands the harvest is a fifth more plentiful.'); }
    saveCampaign();
  },
  onClose: () => { resumeGame(); },
});
function openSparring() {
  pauseGame(); ui.hideInspect();
  const roster = { ...campaign.roster };
  roster.deaglan = Math.max(1, roster.deaglan || 0);
  if (game.countBuilt('builder_house') > 0) roster.somhairlin = Math.max(1, roster.somhairlin || 0);
  sparring.open(roster, campaign.hosted, { grit: campaign.raidsWon || 0 });
}
const SPAR_CHANCE = 1 / 3; // one in three each season a champion comes calling
function maybeSparChallenge() {
  if (campaign.sparChallenge || !game.wrestlingGreen()) return;
  if (Math.random() < SPAR_CHANCE) {
    campaign.sparChallenge = true; game.setSparChallenge(true); saveCampaign();
    flashNotice('🤼 A roaming champion waits at your wrestling green, calling out the túath. Tap the green to corner a fighter.');
  }
}
if (campaign.nextIsDefend) { campaign.raidIn = campaign.raidIn || 12; campaign.nextIsDefend = false; } // migrate old instant-defend saves to the countdown
for (const c of campaign.colonies) { if (c.folk == null) c.folk = 0; if (c.settlement === undefined) c.settlement = null; } // fields for buildable colonies
if (campaign.raidsWon == null) campaign.raidsWon = 0; // won raids drive the map-era chapter unlocks (levels 4+)
for (const h of ['cuchulainn', 'fionn', 'lugh', 'nuada', 'manannan', 'brigid', 'dagda', 'morrigan']) delete campaign.roster[h]; // heroes/gods are summoned, not owned — clean any legacy grant
if (campaign.mapSeed == null) campaign.mapSeed = _mapSeed;
function saveCampaign() { try { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign)); } catch (e) {} }
// The active settlement — home ráth or a colony — is snapshotted to its own slot,
// so each is a standing town you can leave and come back to. Cattle is realm-wide.
function activeColony() { return campaign.active && campaign.active !== 'home' ? campaign.colonies.find((c) => c.region === campaign.active) : null; }
function saveSettlement() {
  const snap = game.snapshot();
  const c = activeColony();
  if (c) { c.settlement = snap; c.folk = game.folk; }
  else campaign.settlement = snap;
  campaign.cattle = game.cattle; saveCampaign();
}
const COLONY_START_SILVER = 120;
function emptySettlement() { return { silver: COLONY_START_SILVER, cattle: campaign.cattle, folk: 0, buildings: [], roads: [], cros: [], menace: null }; }
// Leave the current settlement (saving it) and load another — 'home' or a colony
// region id. A colony with no ráth yet loads an empty map to build from scratch.
function switchSettlement(target) {
  if (started) saveSettlement();
  cancelPending(); ui.hideInspect(); _inspectDwelling = null;
  campaign.active = target;
  let snap = target === 'home' ? campaign.settlement : (campaign.colonies.find((c) => c.region === target) || {}).settlement;
  game.load(snap || emptySettlement());
  game.isColony = target !== 'home'; // a colony's folk are harder to win over — culture drains faster there
  game.cattle = campaign.cattle;
  view.rebuildRoads(); view.rebuildCros();
  applyWarTint();
  started = true;
  saveCampaign(); pushStats(); updateDate();
}
// Cattle is single-sourced on the campaign; the settlement mirrors it.
function setCattle(n) { campaign.cattle = Math.max(0, Math.round(n)); game.cattle = campaign.cattle; pushStats(); saveCampaign(); }
// The slua's field colour drives the hurling green's players — keep it in step
// with the chosen livery so a re-coloured banner recolours the folk it sends out.
function applyWarTint() { try { game.warTint = parseInt((campaign.livery[0] || '#4a86ff').replace('#', ''), 16) || 0x4a86ff; } catch (e) { game.warTint = 0x4a86ff; } }

// --- Levels: the campaign told in chapters ---
let levelObjectives = [];
function loadLevel() {
  const lvl = levelById(campaign.level);
  levelObjectives = lvl.objectives.map((o) => ({ text: o.text, check: o.check, done: campaign.doneObjectives.includes(o.text) }));
  ui.setLevel(campaign.level);
  const h = document.querySelector('#mission h4'); if (h) h.textContent = lvl.title;
  refreshObjectives();
  // Level 3 looses the menace onto your land if it is not already loose or beaten.
  if (campaign.level === 3 && !campaign._menaceRepelled && !game.hasMenace()) { placeMenace(); saveSettlement(); }
  updateMenaceButton();
}
function placeMenace() {
  let cx = 16, cz = 14;
  if (game.buildings.length) { let sx = 0, sz = 0; for (const b of game.buildings) { sx += b.x; sz += b.z; } cx = Math.round(sx / game.buildings.length) + 5; cz = Math.round(sz / game.buildings.length) - 1; }
  game.spawnMenace(cx, cz, 4, 4);
  flashNotice('☠️ An Ollphéist — a great serpent — comes writhing out of the mist. Tap it when your war-band is ready to march on it.');
}
function warbandSize() { return campaign.roster ? Object.values(campaign.roster).reduce((a, b) => a + b, 0) : 0; }
function updateMenaceButton() {} // the menace is now met by tapping it, not a HUD button
// Tap the Ollphéist to consider marching on it.
function menaceHtml() {
  const wb = warbandSize();
  return `<h3>The Ollphéist</h3><div class="role">an Ollphéist · the menace</div>` +
    `<p>A great serpent lays waste to this ground. Nothing may be built where it coils, and its blight creeps outward with every turn of the year.</p>` +
    `<p class="dim">Your war-band numbers ${wb}. You need at least four to march.</p>` +
    `<button id="menace-march" class="continue-btn"${wb >= 4 ? '' : ' disabled'}>⚔ March on the Menace</button>`;
}
function openMenacePrompt() {
  if (!game.hasMenace()) return;
  ui.showInspect(menaceHtml(), false);
  const btn = document.getElementById('menace-march');
  if (btn) btn.addEventListener('click', () => { ui.hideInspect(); enterBattle('menace'); });
}
function menaceHitAt(e) {
  if (!game.menace || !game.menace.creature) return false;
  setNdc(e);
  return raycaster.intersectObject(game.menace.creature, true).length > 0;
}
function refreshObjectives() { ui.setObjectives(levelObjectives); }
function completeLevel() {
  pauseGame();
  const lvl = levelById(campaign.level);
  ui.showFestival({ name: 'Chapter Complete', emoji: '🏆', sub: `${lvl.title} — the folk prosper under ${leaderName()}.`, onDone: () => showNarrative(lvl.next) });
}
function advanceLevel() {
  if (campaign.level < LEVELS.length) { campaign.level += 1; campaign.doneObjectives = []; missionDone = false; applyUnlock(levelById(campaign.level)); saveCampaign(); loadLevel(); }
  else { campaign.won = true; saveCampaign(); }
  resumeGame();
}
// Each map-era chapter brings home a new craft: a buildable (gated by unlockLevel
// in the build menu), a granted muster unit, or both — announced as it lands.
function applyUnlock(lvl) {
  const u = lvl && lvl.unlock; if (!u) return;
  if (u.grantUnit) campaign.roster[u.grantUnit.key] = (campaign.roster[u.grantUnit.key] || 0) + u.grantUnit.n;
  if (u.note) flashNotice(u.note);
}
battle.setLivery(campaign.livery);
// Restore the settlement you last stood in — home ráth or a colony — so a reload
// drops you back where you were, and never saves one town's state into another's.
{
  const bootSnap = campaign.active === 'home'
    ? campaign.settlement
    : (campaign.colonies.find((c) => c.region === campaign.active) || {}).settlement;
  if (bootSnap) {
    game.load(bootSnap);
    game.isColony = campaign.active !== 'home';
    game.cattle = campaign.cattle != null ? campaign.cattle : game.cattle;
    view.rebuildRoads(); view.rebuildCros();
    started = true; // you already have a settlement — the sim runs
  } else if (campaign.active !== 'home') {
    game.load(emptySettlement()); // an unbuilt colony you were standing in
    view.rebuildRoads(); view.rebuildCros();
    started = true;
  }
}
game.cattle = campaign.cattle; // single-source the herd from the start (fresh campaigns begin with none)
applyWarTint();
saveCampaign();

// A small Gaelic name-bank so the war-dead are remembered by name, not tally.
const DEAD_NAMES = ['Bran', 'Oisín', 'Fergus', 'Niamh', 'Sadhbh', 'Cormac', 'Éimhear', 'Diarmuid', 'Lugh', 'Aoife', 'Conall', 'Gráinne', 'Naoise', 'Fiacha', 'Deirdre', 'Ruairí'];
// A warden's caliber decides how much the old powers are swayed — dedicate your
// best and a hosted hero or god is likelier to answer the horn.
const WARDEN_FAVOUR = { warrior: 0.12, seasoned: 0.20, curadh: 0.30 };
const WARDEN_RANKS = ['curadh', 'seasoned', 'warrior']; // offered best-first
function musterFavour() {
  let f = game.count('altar') > 0 ? 0.85 : 0.25; // a shrine already makes it near-certain
  for (const b of game.buildings) if (b.def.role === 'gallan' && b.warden) f += WARDEN_FAVOUR[b.warden] || 0.12;
  return Math.min(0.97, f);
}
function enterBattle(scenario) {
  if (walk.active) walk.exit(); // a raid ends the stroll — to the field
  // A deity only takes the field if a flourishing Hall of Hosting stands to seat
  // it; heroes (mortal) answer regardless. Strip un-seated gods from the muster.
  let hosted = campaign.hosted;
  if (!game.hallFlourishing()) {
    hosted = {}; let heldBack = null;
    for (const k in campaign.hosted) {
      if (!campaign.hosted[k]) continue;
      if (UNIT_TYPES[k] && UNIT_TYPES[k].cat === 'god') { heldBack = UNIT_TYPES[k].label || k; continue; }
      hosted[k] = campaign.hosted[k];
    }
    if (heldBack) flashNotice(`⛩️ ${heldBack} will not take the field — no flourishing Hall of the Gods seats the god.`);
  }
  const roster = { ...campaign.roster };
  roster.deaglan = 1;                                              // the path-maker always answers the muster
  if (game.countBuilt('builder_house') > 0) roster.somhairlin = 1; // Somhairlín marches only while her House stands
  battle.loadWarband({ roster, ghosts: campaign.ghosts, hosted, favour: musterFavour() });
  battle.menaceHp = scenario === 'menace' ? campaign.menaceHp : null; // the Ollphéist enters carrying his old wounds
  battle.enter(scenario);
  announceSummons(battle.summoned || []); // heroes/gods that answered this muster
}
// Legends that answered the horn — announced as they take the field.
const SUMMON_LORE = {
  cuchulainn: { emoji: '🐕', name: 'Cú Chulainn', line: 'The Hound of Ulster answers your muster! Alone he held the ford against all Connacht in the Táin, and in his ríastrad — the warp-spasm — no host of mortals could stand before him.' },
  fionn: { emoji: '🦌', name: 'Fionn mac Cumhaill', line: 'Fionn, lord of the Fianna, takes the field! He tasted the Salmon of Knowledge and won the wisdom of the world, and led the greatest war-band Ériu has known.' },
  dagda: { emoji: '🍲', name: 'An Dagda', line: 'The Good God strides to your side! He bears the club that slays with one end and revives with the other, and the cauldron that never runs empty. The earth answers his tread.' },
  morrigan: { emoji: '🐦‍⬛', name: 'An Mhórrígan', line: 'The Phantom Queen descends! Crow of the slaughter, she chooses who lives and who falls — and where she flies, the courage of your foes breaks.' },
  lugh: { emoji: '☀️', name: 'Lugh Lámhfhada', line: 'Lugh of the Long Arm takes the field! Samildánach, master of every art, whose sling-stone put out the deadly eye of Balor and broke the Fomorians at Mag Tuired. None on the field is his equal.' },
  nuada: { emoji: '⚔️', name: 'Nuada Airgetlám', line: 'Nuada of the Silver Arm answers your muster! First king of the Túatha Dé, who gave up his throne for a wound and bore the Sword of Light — the Claíomh Solais, from which none escape.' },
  manannan: { emoji: '🌊', name: 'Manannán mac Lir', line: 'The lord of the sea rides in on his mane of waves! He cloaks his own in mist and shakes the courage of the foe, and bears Fragarach, the Answerer, that no armour can turn.' },
  brigid: { emoji: '🔥', name: 'Brigid', line: 'The bright goddess comes — of the forge, the healing well and the poet’s fire. Her flame heartens your war-band and will not let their courage gutter out.' },
};
function announceSummons(list) {
  const q = list.slice();
  const next = () => { const h = q.shift(); if (!h) return; const s = SUMMON_LORE[h]; ui.showFestival({ name: `${s.name} Joins the Fight!`, emoji: s.emoji, sub: s.line, onDone: next }); };
  next();
}

const SVGNS = 'http://www.w3.org/2000/svg';
const kg = { built: false, mode: 'choose', sel: null, regions: {} };
function buildKingdomMap() {
  if (kg.built) return;
  const svg = document.getElementById('kg-map');
  svg.setAttribute('viewBox', '0 0 1000 800');
  const mk = (tag, a) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const img = mk('image', { x: 0, y: 0, width: 1000, height: 800 }); // the parchment map of Ériu
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'assets/ui/eire_map.jpg?v=CBUST');
  img.setAttribute('href', 'assets/ui/eire_map.jpg?v=CBUST');
  svg.appendChild(img);
  for (const k of KINGDOMS) {
    const poly = mk('polygon', { class: 'kg-region', points: k.pts }); // transparent hotspot; the parchment shows the land
    poly.addEventListener('click', () => selectKingdom(k.id));
    svg.appendChild(poly); kg.regions[k.id] = poly;
  }
  kg.homeMark = mk('polygon', { class: 'kg-home', points: '' }); kg.homeMark.style.display = 'none'; svg.appendChild(kg.homeMark);
  kg.colonyGroup = mk('g', {}); svg.appendChild(kg.colonyGroup);
  document.getElementById('kg-close').addEventListener('click', closeKingdomMap);
  document.getElementById('kg-action').addEventListener('click', kingdomAction);
  { const sb = document.getElementById('kg-oversea-btn'); if (sb) sb.addEventListener('click', openOverseasChoice); }
  document.querySelectorAll('#kg-overseas .kg-sea').forEach((b) => b.addEventListener('click', () => selectOverseas(b.dataset.o)));
  const c1 = document.getElementById('kg-c1'), c2 = document.getElementById('kg-c2');
  c1.value = campaign.livery[0]; c2.value = campaign.livery[1];
  const onCol = () => { campaign.livery = [c1.value, c2.value]; battle.setLivery(campaign.livery); applyWarTint(); drawFlagPreview(); };
  c1.addEventListener('input', onCol); c2.addEventListener('input', onCol);
  const nameIn = document.getElementById('kg-name-in');
  if (nameIn) { nameIn.value = campaign.leader || ''; nameIn.addEventListener('input', () => { campaign.leader = nameIn.value.trim() || null; }); }
  document.getElementById('kingdoms-screen').addEventListener('click', (e) => { if (e.target.id === 'kingdoms-screen') closeKingdomMap(); });
  kg.built = true;
}
function drawFlagPreview() {
  const cv = document.getElementById('kg-flag'); if (!cv) return;
  const x = cv.getContext('2d'); x.clearRect(0, 0, 60, 76);
  x.fillStyle = '#6b5230'; x.fillRect(10, 6, 4, 66);
  const X = 14, Y = 8, W = 40, H = 30;
  x.fillStyle = campaign.livery[0]; x.fillRect(X, Y, W, H);
  x.fillStyle = campaign.livery[1]; x.beginPath(); x.arc(X + W / 2, Y + H / 2, 9, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.45)'; x.strokeRect(X, Y, W, H);
}
function selectKingdom(id) {
  kg.sel = id; kg.enter = null; kg.overseas = null;
  { const sp = document.getElementById('kg-overseas'); if (sp) sp.classList.add('hidden'); }
  for (const rid in kg.regions) kg.regions[rid].classList.toggle('sel', rid === id);
  const k = kingdomById(id);
  document.getElementById('kg-none').classList.add('hidden');
  document.getElementById('kg-info').classList.remove('hidden');
  document.getElementById('kg-name').textContent = k.en;
  document.getElementById('kg-ga').textContent = k.ga;
  const act = document.getElementById('kg-action'); act.disabled = false;
  if (kg.mode !== 'war') { document.getElementById('kg-seat').textContent = `Seat of ${k.seat}.`; act.textContent = `Begin in ${k.en} ▸`; return; }
  // War map doubles as the way home and into your colonies: your own lands aren't
  // raided — they're entered and built.
  if (id === campaign.home) {
    kg.enter = 'home';
    document.getElementById('kg-seat').textContent = `Your home túath, ${k.seat}. Return to build and hold your ráth.`;
    act.textContent = campaign.active === 'home' ? `You are here` : `Return to ${k.en} 🏰`;
    act.disabled = campaign.active === 'home';
    return;
  }
  if (isColony(id)) {
    kg.enter = id;
    const folk = colonyFolk(campaign.colonies.find((c) => c.region === id));
    document.getElementById('kg-seat').textContent = `Your colony at ${k.seat} — ${folk} folk. Enter to build it up; it renders a cow home for every ten who settle there. Its folk, far from the ráth, need four times the culture to win over — raise courts and halls to hold them.`;
    act.textContent = campaign.active === id ? `You are here` : `Build in ${k.en} 🏗`;
    act.disabled = campaign.active === id;
    return;
  }
  const far = campaign.home && !NEIGHBOURS_OF(campaign.home).includes(id);
  document.getElementById('kg-seat').textContent = far
    ? `Further afield — march on ${k.seat}, and win to plant a colony there, a new Dál that renders tribute home.`
    : `A cattle-raid on ${k.seat}. Drive off their herd.`;
  act.textContent = far ? `March on ${k.en} 🏴` : `Raid ${k.en} ⚔`;
}
// Thar Sáile — reveal the three shores beyond Ériu (once you have been Ard Rí).
function openOverseasChoice() {
  for (const rid in kg.regions) kg.regions[rid].classList.remove('sel');
  kg.sel = null; kg.enter = null; kg.overseas = null;
  document.getElementById('kg-none').classList.add('hidden');
  document.getElementById('kg-info').classList.add('hidden');
  const sp = document.getElementById('kg-overseas'); if (sp) sp.classList.remove('hidden');
  const act = document.getElementById('kg-action'); act.disabled = true; act.textContent = 'Choose a shore ⛵';
}
function selectOverseas(id) {
  const o = overseasById(id); if (!o) return;
  kg.overseas = id; kg.sel = null; kg.enter = null;
  for (const rid in kg.regions) kg.regions[rid].classList.remove('sel');
  document.getElementById('kg-overseas').classList.add('hidden');
  document.getElementById('kg-none').classList.add('hidden');
  const info = document.getElementById('kg-info'); info.classList.remove('hidden');
  document.getElementById('kg-name').textContent = o.en;
  document.getElementById('kg-ga').textContent = o.ga;
  document.getElementById('kg-seat').innerHTML = `${o.desc}<br><span class="dim">A harder host than any kingdom of Ériu. ${FLEET_COST} cattle to launch the fleet.</span>`;
  const act = document.getElementById('kg-action'); act.disabled = false; act.textContent = `${o.arrow} Sail against ${o.en} ⛵`;
}
function openKingdomMap(mode, then) {
  buildKingdomMap();
  kg.mode = mode; kg.sel = null; kg.enter = null; kg.then = then || null; kg.overseas = null;
  { const sb = document.getElementById('kg-oversea-btn'); if (sb) sb.classList.toggle('hidden', !(mode === 'war' && campaign.ardRi)); }
  { const sp = document.getElementById('kg-overseas'); if (sp) sp.classList.add('hidden'); }
  document.getElementById('kg-title').textContent = mode === 'war' ? 'Raid, or ride home' : 'The Kingdoms of Ériu';
  document.getElementById('kg-hint').textContent = mode === 'war'
    ? 'Fall upon a foreign kingdom — or tap your own home or a colony to enter and build it.'
    : 'Choose the túath you will call home, and the colours your slua will carry.';
  document.getElementById('kg-none').classList.remove('hidden');
  document.getElementById('kg-info').classList.add('hidden');
  document.getElementById('kg-livery').classList.toggle('hidden', mode === 'war');
  { const ni = document.getElementById('kg-name-in'); if (ni && mode !== 'war') ni.value = campaign.leader || ''; }
  const act = document.getElementById('kg-action'); act.disabled = true;
  act.textContent = mode === 'war' ? 'Raid ⚔' : 'Begin your reign ▸';
  const activeRegion = campaign.active === 'home' ? campaign.home : campaign.active;
  for (const rid in kg.regions) {
    kg.regions[rid].classList.remove('sel', 'dim');
    kg.regions[rid].classList.toggle('held', isColony(rid));
    // In war mode your home and colonies are the way in, not barred — mark the one you're standing in.
    kg.regions[rid].classList.toggle('here', mode === 'war' && rid === activeRegion);
  }
  if (campaign.home && kg.regions[campaign.home]) { kg.homeMark.setAttribute('points', kingdomById(campaign.home).pts); kg.homeMark.style.display = ''; }
  else kg.homeMark.style.display = 'none';
  // colony overlay marks (bright, above the dimmed regions) in your field colour
  while (kg.colonyGroup.firstChild) kg.colonyGroup.removeChild(kg.colonyGroup.firstChild);
  for (const c of campaign.colonies) {
    const k = kingdomById(c.region); if (!k) continue;
    const poly = document.createElementNS(SVGNS, 'polygon'); poly.setAttribute('class', 'kg-colony'); poly.setAttribute('points', k.pts); poly.setAttribute('stroke', campaign.livery[0]); kg.colonyGroup.appendChild(poly);
    const flag = document.createElementNS(SVGNS, 'text'); flag.setAttribute('class', 'kg-colony-flag'); flag.setAttribute('x', k.label[0]); flag.setAttribute('y', k.label[1] - 22); flag.textContent = '🏴'; kg.colonyGroup.appendChild(flag);
  }
  drawFlagPreview();
  document.getElementById('kingdoms-screen').classList.remove('hidden');
}
function closeKingdomMap() { document.getElementById('kingdoms-screen').classList.add('hidden'); }

// The Celtapedia — built once from the CODEX data.
let codexBuilt = false;
function buildCodex() {
  if (codexBuilt) return;
  const body = document.getElementById('codex-body');
  for (const sec of CODEX) {
    const s = document.createElement('div'); s.className = 'codex-sec';
    const h = document.createElement('h3'); h.textContent = sec.title; s.appendChild(h);
    if (sec.blurb) { const bl = document.createElement('div'); bl.className = 'codex-blurb'; bl.textContent = sec.blurb; s.appendChild(bl); }
    for (const e of sec.entries) {
      const row = document.createElement('div'); row.className = 'codex-entry';
      const ico = document.createElement('div'); ico.className = 'cx-ico'; ico.textContent = e.icon; row.appendChild(ico);
      const main = document.createElement('div'); main.className = 'cx-main';
      main.innerHTML = `<div><span class="cx-name"></span><span class="cx-ga"></span></div><div class="cx-lore"></div><div class="cx-repr">Shown as: <b></b></div>`;
      main.querySelector('.cx-name').textContent = e.name;
      main.querySelector('.cx-ga').textContent = e.ga;
      main.querySelector('.cx-lore').textContent = e.lore;
      main.querySelector('.cx-repr b').textContent = e.repr;
      row.appendChild(main); s.appendChild(row);
    }
    body.appendChild(s);
  }
  document.getElementById('codex-close').addEventListener('click', () => document.getElementById('codex-screen').classList.add('hidden'));
  document.getElementById('codex-screen').addEventListener('click', (ev) => { if (ev.target.id === 'codex-screen') ev.currentTarget.classList.add('hidden'); });
  codexBuilt = true;
}
function openCodex() { buildCodex(); document.getElementById('codex-screen').classList.remove('hidden'); }
function leaderName() { return campaign.leader || 'a Rí'; }
// The main campaign button reads "Continue as <leader>" once a reign is under way.
function refreshCampaignButton() {
  const btn = document.querySelector('.mission-btn[data-mission="1"]');
  if (!btn) return;
  if (!(campaign.leader && campaign.home)) { btn.textContent = '⚔ Play the Campaign'; return; }
  const style = campaign.ardRi ? `👑 Continue as ${campaign.leader}, Ard Rí`
    : campaign.crownContested ? `⚔ Continue as ${campaign.leader} — the crown contested`
    : `⚔ Continue as ${campaign.leader}`;
  btn.textContent = style;
}

// --- Manage Campaign: rename, export/import a JSON save, restart ---
let manageWired = false;
function openManage() {
  if (!manageWired) {
    const $ = (id) => document.getElementById(id);
    const msg = (t) => { $('manage-msg').textContent = t || ''; };
    $('manage-close').addEventListener('click', () => $('manage-screen').classList.add('hidden'));
    $('manage-screen').addEventListener('click', (e) => { if (e.target.id === 'manage-screen') e.currentTarget.classList.add('hidden'); });
    $('manage-save-name').addEventListener('click', () => { campaign.leader = ($('manage-name').value || '').trim() || null; saveCampaign(); $('manage-who').textContent = campaign.leader ? `You reign as ${campaign.leader}.` : 'No name set — you reign unnamed.'; msg('Name saved.'); });
    $('manage-export').addEventListener('click', () => {
      const json = JSON.stringify(campaign);
      const ta = $('manage-json'); ta.classList.remove('hidden'); ta.value = json; ta.select();
      try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'ardri-save.json'; a.click(); } catch (e) {}
      msg('Save copied below and downloaded. Keep it safe.');
    });
    $('manage-import-open').addEventListener('click', () => { $('manage-json').classList.remove('hidden'); $('manage-json').value = ''; $('manage-import-btns').classList.remove('hidden'); msg('Paste a save, or choose a file, then Load.'); });
    $('manage-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('manage-json').value = r.result; }; r.readAsText(f); });
    $('manage-import-load').addEventListener('click', () => {
      try { const data = JSON.parse($('manage-json').value); if (!data || typeof data !== 'object') throw 0; localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(data)); msg('Loaded — reloading…'); setTimeout(() => location.reload(), 500); }
      catch (e) { msg('That does not look like a valid save.'); }
    });
    $('manage-restart').addEventListener('click', () => {
      if (!window.confirm('Restart the whole campaign? Your ráth, war-band, colonies and standing are lost. Export a save first if you want to keep it.')) return;
      try { localStorage.removeItem(CAMPAIGN_KEY); } catch (e) {}
      location.reload();
    });
    manageWired = true;
  }
  document.getElementById('manage-name').value = campaign.leader || '';
  document.getElementById('manage-who').textContent = campaign.leader ? `You reign as ${campaign.leader}.` : 'No name set — you reign unnamed.';
  document.getElementById('manage-msg').textContent = '';
  document.getElementById('manage-json').classList.add('hidden');
  document.getElementById('manage-import-btns').classList.add('hidden');
  document.getElementById('manage-screen').classList.remove('hidden');
}

// The Wider World — spend cattle on foreign goods, then host heroes and gods.
let tradeWired = false;
function openTrade() {
  if (!tradeWired) {
    document.getElementById('trade-close').addEventListener('click', () => document.getElementById('trade-screen').classList.add('hidden'));
    document.getElementById('trade-screen').addEventListener('click', (e) => { if (e.target.id === 'trade-screen') e.currentTarget.classList.add('hidden'); });
    tradeWired = true;
  }
  renderTrade();
  document.getElementById('trade-screen').classList.remove('hidden');
}
function renderTrade() {
  document.getElementById('trade-cattle').textContent = campaign.cattle;
  const body = document.getElementById('trade-body'); body.innerHTML = '';
  const goodsSec = document.createElement('div'); goodsSec.className = 'trade-sec';
  goodsSec.innerHTML = '<h3>Foreign merchants</h3>';
  for (const key in GOODS) {
    const g = GOODS[key]; const have = campaign.goods[key] || 0;
    const row = document.createElement('div'); row.className = 'trade-row';
    row.innerHTML = `<div class="tr-ico">${g.icon}</div><div class="tr-main"><div class="tr-name">${g.label} <span class="cx-ga">${g.ga}</span></div><div class="tr-sub">${g.desc} — from ${g.from}</div></div><div class="tr-have">have ${have}</div>`;
    const buy = document.createElement('button'); buy.textContent = `🐄 ${g.price}`;
    buy.disabled = campaign.cattle < g.price;
    buy.addEventListener('click', () => { if (campaign.cattle >= g.price) { setCattle(campaign.cattle - g.price); campaign.goods[key] = (campaign.goods[key] || 0) + 1; saveCampaign(); renderTrade(); } });
    row.appendChild(buy); goodsSec.appendChild(row);
  }
  body.appendChild(goodsSec);
  const hostSec = document.createElement('div'); hostSec.className = 'trade-sec';
  hostSec.innerHTML = '<h3>Host a hero or god</h3>';
  for (const key of HOST_ORDER) {
    const t = UNIT_TYPES[key]; const h = HOSTING[key];
    const row = document.createElement('div'); row.className = 'trade-row';
    const hosted = campaign.hosted[key];
    const godKeys = ['dagda', 'morrigan', 'lugh', 'nuada', 'manannan', 'brigid'];
    row.innerHTML = `<div class="tr-ico">${godKeys.includes(key) ? '⚡' : key === 'curadh' ? '🏆' : '🦸'}</div><div class="tr-main"><div class="tr-name">${t.label} <span class="cx-ga">${t.ga}</span></div><div class="tr-sub">${h.title} · needs ${reqText(key)}</div></div>`;
    if (hosted) { row.classList.add('hosted'); const d = document.createElement('div'); d.className = 'tr-done'; d.textContent = 'Hosted ✓'; row.appendChild(d); }
    else {
      const btn = document.createElement('button'); btn.textContent = 'Host ▸'; btn.disabled = !canHost(campaign.goods, key);
      btn.addEventListener('click', () => {
        if (!canHost(campaign.goods, key)) return;
        for (const [gk, n] of Object.entries(h.req)) campaign.goods[gk] -= n;
        campaign.hosted[key] = true; // you now hold the *right* to summon them
        if (campaign.roster[key]) delete campaign.roster[key]; // clean any stale grant
        saveCampaign(); renderTrade();
        const hasShrine = game.count('altar') > 0;
        ui.showFestival({ name: `${t.label} Hosted`, emoji: '🌟', sub: `You have raised ${h.title}. ${t.label} may answer your muster — about one time in four, or four times in five if a shrine stands in your ráth. ${hasShrine ? 'Your shrine keeps their favour.' : 'Raise a shrine to keep their favour.'}` });
      });
      row.appendChild(btn);
    }
    hostSec.appendChild(row);
  }
  body.appendChild(hostSec);
}
function kingdomAction() {
  if (kg.overseas) { // sail across the sea against a foreign shore
    const o = overseasById(kg.overseas); if (!o) return;
    if (campaign.cattle < FLEET_COST) { document.getElementById('kg-seat').textContent = `You need ${FLEET_COST} cattle to launch a fleet — you have ${campaign.cattle}.`; return; }
    setCattle(campaign.cattle - FLEET_COST);
    campaign.target = o.id; campaign._overseas = true; campaign._raidFar = false;
    saveCampaign(); closeKingdomMap(); enterBattle(o.id); return;
  }
  if (!kg.sel) return;
  if (kg.mode === 'war') {
    if (kg.enter) { const t = kg.enter; closeKingdomMap(); switchSettlement(t); enterSettlement(); return; } // enter home / a colony to build it
    campaign.target = kg.sel; campaign._raidFar = campaign.home && !NEIGHBOURS_OF(campaign.home).includes(kg.sel); if (!isColony(kg.sel)) campaign.rival = rivalFor(kg.sel) || campaign.rival; scheduleRaid(); closeKingdomMap(); enterBattle('attack'); return;
  }
  campaign.home = kg.sel; saveCampaign(); battle.setLivery(campaign.livery);
  if (kg.then === 'war') { openKingdomMap('war'); return; } // ride out to raid
  if (kg.then === 'intro') { closeKingdomMap(); showIntro(); return; } // first time: opening tale, then into the ráth
  if (kg.then === 'settle') { enterSettlement(); return; } // into your ráth to build
  closeKingdomMap();
}

function pauseGame() { if (savedSpeed === null) savedSpeed = sim.speed; sim.speed = 0; ui.reflectSpeed(0); }
function resumeGame() { if (savedSpeed !== null) { sim.speed = savedSpeed; ui.reflectSpeed(sim.speed); savedSpeed = null; } }

function applySeason(key) {
  const L = SEASONS[key].light;
  hemi.color.setHex(L.sky);
  hemi.groundColor.setHex(L.ground);
  sun.color.setHex(L.sun);
  sun.intensity = L.intensity;
  const a = SEASON_ACCENT[key];
  accent.color.setHex(a.color);
  accent.position.set(a.pos[0], a.pos[1], a.pos[2]);
  scene.background.setHex(L.bg);
  scene.fog.color.setHex(L.bg);
  ui.setSeasonIcon(SEASONS[key].icon);
}
function pushStats() {
  ui.setStats({ cattle: game.cattle, silver: game.silver, folk: game.folk });
  refreshObjectives();
}
function updateDate() {
  ui.setStats({ season: SEASONS[curSeason].ga, day: `${MONTHS_EN[cal.month].slice(0, 3)} ${cal.day}` });
}
function triggerFestival(f) { pauseGame(); ui.showFestival({ name: f.name, emoji: f.emoji, sub: f.sub }); }

function advanceDay() {
  cal.day += 1;
  let festivalToday = false;
  let newMonth = false;
  if (cal.day > DAYS_PER_MONTH) {
    cal.day = 1;
    cal.month = (cal.month + 1) % 12;
    newMonth = true;
    const s = seasonOfMonth(cal.month);
    if (s !== curSeason) {
      curSeason = s; applySeason(s); collectColonyTribute(); // colonies render tribute each turn of the year
      replenishWarband(); // the settlement raises fresh levy to replace the fallen
      maybeHurlChallenge(); // a wandering band of hurlers may come calling
      maybeSparChallenge(); // a roaming champion may come calling at the green
      if (campaign.home && (campaign.raidIn || 0) === 0 && Math.random() < 0.5) { // no war pending — a rival stirs in the provinces
        const r = riseRival();
        if (r) flashNotice(`⚔ ${r.name} is rising in ${r.region} — his host grows, and his eye turns toward your ráth.`);
      }
      if (campaign.level === 3 && game.hasMenace()) { game.expandMenace(); saveSettlement(); flashNotice('☠️ The blight creeps outward, devouring more of your land. Muster and march before it takes all.'); }
    }
    if (cal.month === 0) { campaign.yearsElapsed = (campaign.yearsElapsed || 0) + 1; saveCampaign(); } // a full turn of the year
    const fest = FESTIVALS[cal.month];
    if (fest) {
      festivalToday = true;
      // The four festivals are announced for your first three years; after that
      // the folk keep them without a herald — you'll see the season turn yourself.
      if ((campaign.yearsElapsed || 0) < 3) triggerFestival(fest);
      game.festivalRevels(); // the feast halls pour their revellers onto the roads
    }
    if (festivalToday && cal.month === 10) { resurrectPrayed(); flashNotice('🎃 Samhain — the veil thins. Until winter deepens, the risen dead walk the ráth.'); } // Samhain — the prayed-for rise from the dead
  }
  game.deadWalk = (cal.month === 10); // from Samhain to the turn of December — the veil is thin
  const wasBroke = game.broke;
  game.settleDay({ festival: festivalToday, newMonth }); // rents in, wages out, homes drain & evolve
  if (game.broke && !wasBroke) triggerAdvisor();
  pushStats();
  updateDate();
  // Provoked raiders close in: count down the days, then fall on the ráth.
  if (campaign.raidIn > 0) {
    campaign.raidIn -= 1; saveCampaign(); updateRaidBanner();
    if (campaign.raidIn === 0) {
      pauseGame();
      ui.showFestival({ name: 'Raiders at the Gate', emoji: '🔥', sub: `${campaign.rival ? `The war-band of ${campaign.rival.name}, risen in ${campaign.rival.region}, falls upon your ráth` : 'The war-band you provoked falls upon your ráth'}, ${leaderName()}. Muster the folk and hold the field.`, onDone: () => enterBattle('defend') });
    }
  }
  if (started) saveSettlement(); // persist the standing ráth (herd growth, economy) each day
}

function triggerAdvisor() {
  pauseGame();
  ui.showFestival({
    name: 'The Dagda',
    emoji: '⚠️',
    sub: 'The cauldron runs dry — your treasury is empty. The folk you keep go unpaid, and the hungry will drift back through the gate. Raise silver before the settlement falters.',
  });
}

applySeason(curSeason);
loadLevel();
pushStats();
updateDate();
ui.setCompass(cameraDirLabel(camera));
const mapFab = document.getElementById('map-fab');
if (mapFab) mapFab.addEventListener('click', () => {
  if (!campaign.home) { openKingdomMap('choose'); return; }
  if (!raidsUnlocked()) { flashNotice('🗺 Your túath is not yet strong enough to send a raid abroad. Grow it and throw back the menace first, and the wider world is yours.'); return; }
  openKingdomMap('war');
});
// Back to the title screen — save first, then show the title (the world-clock
// stops on its own while the title is up). "Play the Campaign" drops back in.
const menuFab = document.getElementById('menu-fab');
if (menuFab) menuFab.addEventListener('click', () => {
  if (started) saveSettlement();
  cancelPending();
  if (typeof tool !== 'undefined') { tool = null; ui.setTool(null); }
  ui.hideInspect();
  if (titleScreenEl) titleScreenEl.classList.remove('hidden');
});
// Raiding and colonies open only once the settlement has proved itself by
// weathering First Steps, the culture of Level 2, and casting out the menace.
function raidsUnlocked() { return !!campaign._menaceRepelled || campaign.level > 3; }
const codexBtn = document.getElementById('codex-open');
if (codexBtn) codexBtn.addEventListener('click', openCodex);
const manageBtn = document.getElementById('manage-open');
if (manageBtn) manageBtn.addEventListener('click', openManage);
// Mission checklist collapses on a tap of its heading, so it never crowds the fabs.
const missionH = document.querySelector('#mission h4');
if (missionH) {
  try { if (localStorage.getItem('ardri_mission_collapsed') === '1') document.getElementById('mission').classList.add('collapsed'); } catch (e) {}
  missionH.addEventListener('click', () => { const on = document.getElementById('mission').classList.toggle('collapsed'); try { localStorage.setItem('ardri_mission_collapsed', on ? '1' : '0'); } catch (e) {} });
}
ui.showTitle(); // title screen; Mission One starts the game
refreshCampaignButton();
if (!campaign.home) openKingdomMap('choose', 'intro'); // first run: pick a home, then the opening tale drops you into the ráth

// --- Placement preview ---
const preview = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
preview.rotation.x = -Math.PI / 2;
preview.position.y = 0.06;
preview.visible = false;
scene.add(preview);

// Raised ghost volume for building placement — clearly visible after you drop it.
const ghostBox = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.28, depthWrite: false })
);
const ghostEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
ghostBox.add(ghostEdges);
ghostBox.visible = false;
scene.add(ghostBox);
const GHOST_H = 1.4;

// Road path ghost — flat tiles traced out while dragging, before you commit.
const roadGhost = new THREE.Group();
scene.add(roadGhost);
// Building-row ghost — drag a non-unique building like a road to lay a whole
// terrace at once, each footprint boxed green (placeable) / amber (can't pay) /
// red (blocked). A zero-length drag is just one building — today's single tap.
const rowGhost = new THREE.Group();
scene.add(rowGhost);
const ROW_MAX = 40;
function clearRowGhost() { rowGhost.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); rowGhost.clear(); }
function addRowBox(f, color) {
  const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
  const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
  const box = new THREE.Mesh(new THREE.BoxGeometry(f.w * map.tile, GHOST_H, f.h * map.tile),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }));
  box.position.set(cx, GHOST_H / 2, cz);
  box.add(new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: color === 0xff5555 ? 0xffbbaa : 0xffffff })));
  rowGhost.add(box);
}
// Footprints stepped edge-to-edge from the start tile toward the drag tile along
// the dominant axis (horizontal if the drag is mostly sideways, else vertical).
function computeBuildRow(start, end) {
  const [w, h] = BUILDINGS[tool].footprint;
  const dx = end.x - start.x, dz = end.z - start.z;
  const along = Math.abs(dx) >= Math.abs(dz);
  const step = along ? w : h;
  const span = Math.abs(along ? dx : dz);
  const dir = Math.sign(along ? dx : dz) || 1;
  const n = Math.min(ROW_MAX, Math.floor(span / step) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = along ? { x: start.x + dir * i * step, z: start.z } : { x: start.x, z: start.z + dir * i * step };
    out.push(footprint(tool, t));
  }
  return out;
}
function showBuildRow(start, end) {
  clearRowGhost(); ghostBox.visible = false; preview.visible = false;
  const def = BUILDINGS[tool];
  const afford = Math.floor(game.silver / def.cost);
  const valid = [];
  for (const f of computeBuildRow(start, end)) {
    const placeable = map.canPlace(f.x, f.z, f.w, f.h);
    const canPay = valid.length < afford;
    addRowBox(f, !placeable ? 0xff5555 : canPay ? 0x66ff66 : 0xe0b83a);
    if (placeable && canPay) valid.push(f);
  }
  pendingBuildRow = valid;
  pendingRow = { start: { x: start.x, z: start.z }, end: { x: end.x, z: end.z } }; // remembered so the whole row can be dragged to reposition
  ui.showPlaceConfirm({ count: valid.length, cost: valid.length * def.cost });
}
function clearRoadGhost() {
  roadGhost.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  roadGhost.clear();
}
function addGhostTiles(tiles, { color, opacity, y, roadable }) {
  for (const p of tiles) {
    const c = map.tileToWorld(p.x, p.z);
    const col = roadable ? (map.isRoadable(p.x, p.z) ? 0x66ff66 : 0xff5555) : color;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(map.tile * 0.9, map.tile * 0.9),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(c.x, y, c.z);
    roadGhost.add(m);
  }
}
function showRoadGhost() {
  clearRoadGhost();
  if (!pendingRoad) return;
  // Underlay: the route you drew, in a cool "your path" teal, for comparison.
  addGhostTiles(drawnPath, { color: 0x54c8d8, opacity: 0.35, y: 0.065 });
  // Overlay: the currently-selected option, bright green (red where blocked).
  addGhostTiles(pendingRoad, { opacity: 0.6, y: 0.085, roadable: true });
}
function pushTile(list, x, z) { if (!list.some((p) => p.x === x && p.z === z)) list.push({ x, z }); }

// A clean L-shaped run between two tiles — horizontal-first or vertical-first.
function lPath(start, end, vertFirst) {
  const path = []; let { x, z } = start; pushTile(path, x, z);
  if (vertFirst) {
    while (z !== end.z) { z += Math.sign(end.z - z); pushTile(path, x, z); }
    while (x !== end.x) { x += Math.sign(end.x - x); pushTile(path, x, z); }
  } else {
    while (x !== end.x) { x += Math.sign(end.x - x); pushTile(path, x, z); }
    while (z !== end.z) { z += Math.sign(end.z - z); pushTile(path, x, z); }
  }
  return path;
}

// Shortest roadable route around obstacles (A*), used when the straight L is blocked.
function astar(start, end) {
  const key = (x, z) => x + z * map.size;
  const g = new Map([[key(start.x, start.z), 0]]);
  const f = new Map([[key(start.x, start.z), 0]]);
  const came = new Map();
  const seen = new Set();
  const open = [{ x: start.x, z: start.z }];
  const h = (x, z) => Math.abs(x - end.x) + Math.abs(z - end.z);
  while (open.length) {
    open.sort((p, q) => f.get(key(p.x, p.z)) - f.get(key(q.x, q.z)));
    const cur = open.shift();
    const ck = key(cur.x, cur.z);
    if (cur.x === end.x && cur.z === end.z) {
      const path = [{ x: cur.x, z: cur.z }]; let k = ck;
      while (came.has(k)) { const p = came.get(k); path.unshift({ x: p.x, z: p.z }); k = key(p.x, p.z); }
      return path;
    }
    if (seen.has(ck)) continue;
    seen.add(ck);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, nz = cur.z + dz;
      if (nx < 0 || nz < 0 || nx >= map.size || nz >= map.size) continue;
      if (!map.isRoadable(nx, nz) && !(nx === end.x && nz === end.z)) continue;
      const nk = key(nx, nz), ng = g.get(ck) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        came.set(nk, cur); g.set(nk, ng); f.set(nk, ng + h(nx, nz)); open.push({ x: nx, z: nz });
      }
    }
  }
  return null;
}

// Deaglán's suggestion: prefer a clean straight L; route around obstacles if it is blocked.
function suggestRoute(start, end, variant) {
  const l = lPath(start, end, variant % 2 === 1);
  if (l.every((p) => map.isRoadable(p.x, p.z))) return l;
  return astar(start, end) || l;
}

// Trace the tiles the finger actually passes through — "your path".
function extendDrawn(to) {
  if (!drawnPath.length) { pushTile(drawnPath, to.x, to.z); return; }
  let { x, z } = drawnPath[drawnPath.length - 1];
  while (x !== to.x) { x += Math.sign(to.x - x); pushTile(drawnPath, x, z); }
  while (z !== to.z) { z += Math.sign(to.z - z); pushTile(drawnPath, x, z); }
}
// On release, assemble the choices: Deaglán's clean suggestions + your own drawn path.
function buildRoadOptions() {
  const keyOf = (tiles) => tiles.map((p) => p.x + ',' + p.z).sort().join(';');
  const suggested = [
    { name: 'Deaglán’s path', kind: 'deaglan' },
    { name: 'Midir’s path', kind: 'midir' },
  ];
  const opts = [], seen = new Set();
  let si = 0;
  for (const v of [0, 1]) {
    const s = suggestRoute(roadStart, roadEnd, v);
    const k = keyOf(s);
    if (!seen.has(k)) { seen.add(k); opts.push({ ...suggested[si], tiles: s }); si++; }
  }
  const dk = keyOf(drawnPath);
  if (!seen.has(dk)) { seen.add(dk); opts.push({ name: 'Your path', kind: 'mine', tiles: drawnPath.slice() }); }
  roadOptions = opts;
  roadOptIdx = 0;
  pendingRoad = opts[0].tiles;
}
function commitRoad() {
  const opt = roadOptions[roadOptIdx] || { kind: 'deaglan' };
  const deag = opt.kind === 'deaglan';
  const laid = [];
  for (const p of pendingRoad) {
    if (map.setRoad(p.x, p.z, true)) { const t = map.get(p.x, p.z); if (t) t.roadKind = opt.kind; laid.push(p); }
  }
  if (laid.length) {
    view.rebuildRoads(); saveSettlement();
    // Deaglán & his dog come out to lay his path — most is built, but he shovels
    // in the gaps; the crew hides/reveals those squares as he digs.
    if (deag) game.roadCrew(laid, (tile, hidden) => { const t = map.get(tile.x, tile.z); if (t) t.roadHidden = hidden; view.rebuildRoads(); });
  }
  cancelPending();
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function setNdc(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, walk.active ? walkCam : camera); // on a stroll, pick from the eye-level camera
}
function tileUnderPointer(e) {
  setNdc(e);
  const hit = raycaster.intersectObject(view.pickPlane)[0];
  return hit ? map.worldToTile(hit.point.x, hit.point.z) : null;
}
function footprint(kind, t) {
  const [w, h] = BUILDINGS[kind].footprint;
  return { x: t.x - Math.floor((w - 1) / 2), z: t.z - Math.floor((h - 1) / 2), w, h };
}
function updatePreview(e) {
  if (!(tool === 'road' || BUILDINGS[tool])) { preview.visible = false; return; }
  const t = tileUnderPointer(e);
  if (!t) { preview.visible = false; return; }
  if (tool === 'road') {
    const c = map.tileToWorld(t.x, t.z);
    preview.position.set(c.x, 0.06, c.z);
    preview.scale.set(map.tile, map.tile, 1);
    preview.material.color.set(map.isRoadable(t.x, t.z) ? 0x66ff66 : 0xff5555);
  } else {
    const f = footprint(tool, t);
    const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
    const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
    preview.position.set(cx, 0.06, cz);
    preview.scale.set(f.w * map.tile, f.h * map.tile, 1);
    preview.material.color.set(game.canAfford(tool) && map.canPlace(f.x, f.z, f.w, f.h) ? 0x66ff66 : 0xff5555);
  }
  preview.visible = true;
}

// --- Inspect ---
function personHtml(p) {
  const name = p.nick ? `${p.name} ‘${p.nick}’` : p.name;
  return `<h3>${name}</h3><div class="role">${p.roleEn} · ${p.roleGa}</div>` +
    (p.carrying ? `<p class="carrying">Carrying: ${p.carrying}</p>` : '') +
    `<blockquote>“${p.phraseGa}”<br><span class="en">“${p.phraseEn}”</span></blockquote>`;
}
function buildingHtml(inst) {
  const d = inst.def;
  let extra = '';
  if (d.role === 'granary' || d.role === 'market') extra = `<p>${storeGoods()[0].toUpperCase() + storeGoods().slice(1)} in store: ${inst.stock}</p>`;
  if (d.role === 'dwelling') extra = dwellingRankHtml(inst);
  if (d.role === 'altar') extra = altarHtml();
  if (d.role === 'gallan') extra = gallanHtml(inst);
  if (d.role === 'hall') {
    const ok = (v) => v > 0 ? '✓' : '—';
    const flourish = inst.food > 0 && inst.water > 0 && inst.culture > 0;
    extra = `<p>Offerings — 🌾 food ${ok(inst.food)} · 💧 water ${ok(inst.water)} · 🎶 culture ${ok(inst.culture)}</p>` +
      `<p class="${flourish ? '' : 'dim'}">${flourish ? '⛩️ The hall flourishes — a hosted god will take the field.' : 'Keep all three offerings flowing (it drinks twice a dwelling’s share) for a god to answer your muster.'}</p>`;
  }
  if (d.role === 'homestead') { const graze = game._grazing(inst); const cap = 20 + graze * 4; extra = `<p>Herd: 🐄 ${inst.herd} / ${cap} · Grazing land: ${graze} tiles</p><p class="dim">Leave open pasture around the ráth and the herd grows faster. Cattle is your wealth in the wider world — and what a raider carries off.</p><button id="trade-btn" class="continue-btn">🌍 Trade in the wider world</button>`; }
  return `<h3>${d.label}</h3><div class="role">${d.role === 'homestead' ? 'Your seat' : 'Building'}</div><p>${d.desc}</p>${pipelineNote(inst)}${extra}`;
}
// A dwelling's standing, from its folk and how well it's fed, watered and
// heartened — the same three things walkers carry in.
const HOUSE_MAX = 10;
function dwellRank(inst) {
  if (inst.pop <= 0) return { emoji: '·', title: 'Empty', s: 0 };
  const s = 0.25 + (inst.pop / Math.max(1, inst.cap)) * 0.15
    + (inst.food / HOUSE_MAX) * 0.2 + (inst.water / HOUSE_MAX) * 0.2 + (inst.culture / HOUSE_MAX) * 0.2;
  if (s >= 0.85) return { emoji: '🏅', title: 'Thriving', s };
  if (s >= 0.68) return { emoji: '🙂', title: 'Content', s };
  if (s >= 0.5) return { emoji: '🌾', title: 'Getting by', s };
  return { emoji: '🥀', title: 'Struggling', s };
}
function meterRow(label, val, max, cls) {
  const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));
  return `<div class="meter ${cls}"><span class="ml">${label}</span><span class="track"><i style="width:${pct}%"></i></span><span class="mv">${val}/${max}</span></div>`;
}
function dwellingRankHtml(inst) {
  const r = dwellRank(inst);
  return `<div class="dwell-rank"><div class="rank-title">${r.emoji} ${r.title}</div>` +
    meterRow('Folk', inst.pop, inst.cap || 1, 'folk') +
    meterRow('Food', inst.food, HOUSE_MAX, 'food') +
    meterRow('Water', inst.water, HOUSE_MAX, 'water') +
    meterRow('Culture', inst.culture, HOUSE_MAX, 'culture') +
    '</div>';
}
// Keep the open dwelling panel's meters filling live as walkers deliver, without
// re-rendering (and clobbering) the whole panel each frame.
let _inspectDwelling = null;
function refreshDwellMeter(inst) {
  const body = document.getElementById('inspect-body');
  if (!body) return;
  const rank = body.querySelector('.dwell-rank');
  if (!rank) return;
  const set = (cls, val, max) => {
    const bar = body.querySelector(`.meter.${cls} .track i`);
    const mv = body.querySelector(`.meter.${cls} .mv`);
    if (bar) bar.style.width = Math.max(0, Math.min(100, Math.round((val / max) * 100))) + '%';
    if (mv) mv.textContent = `${val}/${max}`;
  };
  set('folk', inst.pop, inst.cap || 1);
  set('food', inst.food, HOUSE_MAX);
  set('water', inst.water, HOUSE_MAX);
  set('culture', inst.culture, HOUSE_MAX);
  const rt = rank.querySelector('.rank-title');
  if (rt) { const r = dwellRank(inst); rt.textContent = `${r.emoji} ${r.title}`; }
}

// Say plainly what a building needs to work — so the grain/water/culture
// pipelines are never a mystery.
function pipelineNote(inst) {
  const d = inst.def, g = game, road = inst.connected;
  const warn = (t) => `<p class="pl-warn">⚠ ${t}</p>`;
  const flow = (t) => `<p class="pl-ok">→ ${t}</p>`;
  if (d.role === 'farm') {
    const crop = d.produce === 'apples' ? 'apples' : 'barley';
    const total = inst.yieldTotal || (d.load || 4) * (inst.harvests || 2);
    const load = d.load || 4;
    const hasStore = g.count('granary') > 0;
    const line = (head) =>
      `<p><b>${head}</b></p>` +
      `<p class="dim">Each ripe crop gives <b>${total} ${crop}</b> — ${inst.harvests || 2} cart-loads of ${load}, run by a grain-carrier to your nearest grain store. Markets then sell it on to feed the dwellings.</p>`;
    if (inst.ripe) {
      const left = inst.harvestsLeft || 0;
      const status = `🌾 Ripe — harvesting now. ${left} cart-load${left === 1 ? '' : 's'} of ${crop} (~${left * load}) still to bring in.`;
      if (!road) return warn(`${crop[0].toUpperCase() + crop.slice(1)} is ripe but there is no road — lay one to a grain store or the harvest rots.`) + line('Harvest');
      if (!hasStore) return warn('Ripe, but no grain store to carry it to — build a Grain Store.') + line('Harvest');
      if (g.folk < 4) return warn(status + ` But too few folk (${g.folk}/4) to carry it — the harvest waits.`) + line('Harvest');
      if (!g._storeHasRoom()) return warn(status + ' But every grain store is full — raise another store, or a market to move it on; the ripe crop waits and is not lost.') + line('Harvest');
      return flow(status) + line('Harvest');
    }
    const pct = inst.growMax ? Math.min(99, Math.round((inst.grown / inst.growMax) * 100)) : 0;
    const head = `${crop[0].toUpperCase() + crop.slice(1)} growing — ${pct}% to harvest.`;
    if (!road) return warn(head + ' ⚠ No road yet — link this plot to a grain store before it ripens.') + line('Next harvest');
    if (!hasStore) return warn(head + ' ⚠ No grain store yet — build one to receive the harvest.') + line('Next harvest');
    if (g.folk < 4) return warn(head + ` ⚠ Needs 4 folk to harvest (you have ${g.folk}).`) + line('Next harvest');
    return flow(head) + line('Next harvest');
  }
  if (d.role === 'granary') return road ? flow(`Fields and orchards fill it with ${storeGoods()}; markets restock from it.`) : warn('No road — carriers and markets cannot reach it. Lay a road.');
  if (d.role === 'market') {
    if (!road) return warn('No road — cannot reach a grain store. Lay a road.');
    if (!g.anyStock('granary')) return warn('No stocked grain store on the roads yet — a field must fill a store first.');
    return flow('Restocks from a grain store and feeds the dwellings on its route.');
  }
  if (d.role === 'well') {
    if (!road) return warn('No road — the water-carrier cannot reach the dwellings.');
    if (g.broke) return warn('Treasury empty — the water-carrier goes unpaid.');
    return flow('Sends a water-carrier to the dwellings along the roads.');
  }
  if (d.role === 'altar') return road ? '' : warn('No road — the druid cannot walk to the dwellings to raise culture.');
  if (d.role === 'culture') return road ? flow('Sends folk along the roads to lift the culture of the dwellings they pass.') : warn('No road — its folk cannot reach the dwellings to raise culture.');
  if (d.role === 'dwelling') {
    const miss = [];
    if (inst.food <= 0) miss.push('food (a market-trader must reach it)');
    if (inst.water <= 0) miss.push('water (a well’s carrier must reach it)');
    if (miss.length) return warn('Going without ' + miss.join(' and ') + '.');
    // Not in want — name the single visit that would help this household most.
    const needs = [
      { v: inst.food, msg: 'A passing market-trader would help the food here most.' },
      { v: inst.water, msg: 'A water-carrier’s round would help this home most.' },
      { v: inst.culture, msg: 'A druid’s visit would lift this home most.' },
    ].filter((n) => n.v < 8).sort((a, b) => a.v - b.v);
    if (needs.length) return flow(needs[0].msg);
    return flow('Fed, watered and heartened — a happy home sends two to the muster.');
  }
  return '';
}
// An altar is a place to pray to the war-dead. You commit souls to the rite
// through the year — up to three — and they rise together at Samhain, when the
// veil thins, to walk with you as ghost warriors.
const RISE_MAX = 3;
function altarHtml() {
  const n = campaign.fallen.length;
  const pending = (campaign.pendingRise || []).length;
  const roll = campaign.fallen.slice(-5).map((f) => `${f.name} <span class="en">${UNIT_TYPES[f.type] ? UNIT_TYPES[f.type].label : f.type}</span>`).join('<br>');
  const canPray = n > 0 && pending < RISE_MAX;
  return `<div class="altar-dead"><div class="role">The war-dead · ${n} fallen · ${campaign.ghosts} risen</div>` +
    (n ? `<blockquote>${roll}${n > 5 ? '<br>…' : ''}</blockquote>` : `<p class="dim">None have fallen in your service yet.</p>`) +
    `<p class="dim">Souls committed to the Samhain rite: <b>${pending}/${RISE_MAX}</b>. They rise together when the veil thins at Samhain.</p>` +
    `<button id="pray-btn" class="continue-btn"${canPray ? '' : ' disabled'}>🕯️ Commit a soul to the Samhain rite</button></div>`;
}
function prayAtAltar() {
  if (!campaign.pendingRise) campaign.pendingRise = [];
  if (!campaign.fallen.length || campaign.pendingRise.length >= RISE_MAX) return;
  const f = campaign.fallen.pop();
  campaign.pendingRise.push(f);
  saveCampaign();
  const body = document.getElementById('inspect-body');
  if (body) body.innerHTML = `<h3>A Prayer for the Dead</h3><div class="role">Altóir</div><p>${f.name} is named to the rite. At Samhain, when the veil thins, the committed dead will rise as ghost warriors to walk with you.</p>` + altarHtml();
  wireAltar();
}
// Samhain: the souls committed through the year rise together.
function resurrectPrayed() {
  const p = campaign.pendingRise || [];
  if (!p.length) return;
  const n = p.length;
  campaign.ghosts = (campaign.ghosts || 0) + n;
  campaign.pendingRise = [];
  saveCampaign();
  flashNotice(`🎃 Samhain — the veil thins. ${n} of the war-dead rise as ghost warriors to walk with you.`);
}
function wireAltar() { const b = document.getElementById('pray-btn'); if (b) b.addEventListener('click', prayAtAltar); }
// A gallán serves two rites. A warrior may stand vigil at it (out of the muster,
// for the old powers' favour), and the stone may be consecrated to a god or hero —
// pray to that patron with gold and a cow and they walk among your homes, blessing
// them to the full of every good for two months.
const PATRON_GODS = ['lugh', 'nuada', 'manannan', 'brigid', 'dagda', 'morrigan', 'cuchulainn', 'fionn'];
const PRAY_GOLD = 30, PRAY_COW = 1, BLESS_HOMES = 3, BLESS_DAYS = 12; // 2 full months at 6 days a month
function patronSection(inst) {
  if (!inst.patron) {
    return `<div class="role">The patron</div>` +
      `<p class="dim">Consecrate the stone to one of the old powers. Then, with gold and a cow laid at the gallán, pray for a visitation — the god walks among your homes and blesses them.</p>` +
      `<div class="patron-picks">` + PATRON_GODS.map((k) => `<button class="patron-pick continue-btn" data-k="${k}">${SUMMON_LORE[k].emoji} ${SUMMON_LORE[k].name}</button>`).join('') + `</div>`;
  }
  const s = SUMMON_LORE[inst.patron];
  const homes = game.dwellings().length;
  const canPray = game.silver >= PRAY_GOLD && campaign.cattle >= PRAY_COW && homes > 0;
  const why = homes === 0 ? 'No homes with folk to bless yet.'
    : game.silver < PRAY_GOLD ? `Need 🪙${PRAY_GOLD} in the treasury.`
    : campaign.cattle < PRAY_COW ? 'Need a cow to lay at the stone.' : '';
  return `<div class="role">${s.emoji} Dedicated to ${s.name}</div>` +
    `<p class="dim">Lay 🪙${PRAY_GOLD} and 🐄${PRAY_COW} at the stone and pray. ${s.name} will walk among your ${BLESS_HOMES} nearest homes and bless them to the full of food, water and heart for two months.</p>` +
    (why ? `<p class="pl-warn">⚠ ${why}</p>` : '') +
    `<button id="pray-god" class="continue-btn"${canPray ? '' : ' disabled'}>🙏 Pray to ${s.name} — 🪙${PRAY_GOLD} · 🐄${PRAY_COW}</button>` +
    `<button id="patron-clear" class="continue-btn ghost">Re-dedicate the stone</button>`;
}
function vigilSection(inst) {
  const cur = inst.warden;
  if (cur) {
    const fav = Math.round((WARDEN_FAVOUR[cur] || 0.12) * 100);
    const name = UNIT_TYPES[cur] ? UNIT_TYPES[cur].label : cur;
    return `<hr class="soft"><div class="role">The vigil</div>` +
      `<p class="pl-ok">→ A ${name} keeps vigil at the stone — <b>+${fav}%</b> to your muster favour. They will not answer the horn while they watch.</p>` +
      `<button id="gallan-clear" class="continue-btn ghost">Recall the warden</button>`;
  }
  const free = WARDEN_RANKS.filter((t) => (campaign.roster[t] || 0) > 0);
  if (!free.length) {
    return `<hr class="soft"><div class="role">The vigil</div>` +
      `<p class="dim">No warriors free to keep a vigil. Win or muster some, then dedicate one here.</p>`;
  }
  return `<hr class="soft"><div class="role">The vigil</div>` +
    `<p class="dim">Dedicate a warrior to stand watch — out of the muster, but the old powers favour a túath that keeps its champions at the stones.</p>` +
    free.map((t) => `<button class="gallan-pick continue-btn ghost" data-t="${t}">Set ${UNIT_TYPES[t].label} — +${Math.round(WARDEN_FAVOUR[t] * 100)}% (${campaign.roster[t]} free)</button>`).join('');
}
function gallanHtml(inst) {
  return `<div class="altar-dead">` + patronSection(inst) + vigilSection(inst) + `</div>`;
}
function refreshGallan(inst) { const body = document.getElementById('inspect-body'); if (body) { body.innerHTML = buildingHtml(inst); wireGallan(inst); } }
function prayToGod(inst) {
  if (!inst.patron || game.silver < PRAY_GOLD || campaign.cattle < PRAY_COW) return;
  const n = game.blessDwellings(inst.patron, inst, { count: BLESS_HOMES, days: BLESS_DAYS });
  if (!n) { flashNotice('🙏 No homes with folk to bless yet — settle some first.'); return; }
  game.silver -= PRAY_GOLD;
  setCattle(campaign.cattle - PRAY_COW); // also pushes stats + saves the campaign
  saveSettlement();
  const s = SUMMON_LORE[inst.patron];
  ui.hideInspect();
  flashNotice(`${s.emoji} ${s.name} walks out of the gallán to bless ${n} of your homes — two months without want.`);
}
function wireGallan(inst) {
  document.querySelectorAll('.patron-pick').forEach((b) => b.addEventListener('click', () => { inst.patron = b.dataset.k; saveSettlement(); refreshGallan(inst); }));
  const pray = document.getElementById('pray-god');
  if (pray) pray.addEventListener('click', () => prayToGod(inst));
  const pc = document.getElementById('patron-clear');
  if (pc) pc.addEventListener('click', () => { inst.patron = null; saveSettlement(); refreshGallan(inst); });
  const clr = document.getElementById('gallan-clear');
  if (clr) clr.addEventListener('click', () => { clearWarden(inst); refreshGallan(inst); });
  document.querySelectorAll('.gallan-pick').forEach((b) => b.addEventListener('click', () => { assignWarden(inst, b.dataset.t); refreshGallan(inst); }));
}
function assignWarden(inst, t) {
  if (inst.warden || (campaign.roster[t] || 0) <= 0) return;
  campaign.roster[t] -= 1;
  inst.warden = t;
  pushStats(); saveSettlement();
}
function clearWarden(inst) {
  if (!inst.warden) return;
  campaign.roster[inst.warden] = (campaign.roster[inst.warden] || 0) + 1;
  inst.warden = null;
  pushStats(); saveSettlement();
}
function terrainHtml(tile) {
  const info = TERRAIN_INFO[tile.terrain];
  return `<h3>${info.name}</h3><div class="role">Terrain</div><p>${info.desc}</p>`;
}
function inspectAt(e) {
  setNdc(e);
  _inspectDwelling = null; // a fresh tap; only a dwelling panel arms the live meter
  if (menaceHitAt(e)) { openMenacePrompt(); return; }
  const wh = raycaster.intersectObjects(game.walkerGroup.children, true)[0];
  if (wh) {
    let o = wh.object;
    while (o && !(o.userData && o.userData.person)) o = o.parent;
    if (o && o.userData.person) { ui.showInspect(personHtml(o.userData.person), true); pauseGame(); return; }
  }
  // Tap the building billboard (or its floating dot) directly — no ground-plane
  // guesswork, which used to land on the empty tile behind a tall roof.
  let inst = null;
  const bh = raycaster.intersectObjects(game.buildingGroup.children, true);
  for (const h of bh) { let o = h.object; while (o && !(o.userData && o.userData.inst)) o = o.parent; if (o && o.userData.inst && !o.userData.inst.dead) { inst = o.userData.inst; break; } }
  if (!inst) { // fall back to the ground tile (terrain, or a building whose base you hit)
    const hit = raycaster.intersectObject(view.pickPlane)[0];
    if (!hit) return;
    const t = map.worldToTile(hit.point.x, hit.point.z);
    if (!t) return;
    const tile = map.get(t.x, t.z);
    if (!tile.occupant) { ui.showInspect(terrainHtml(tile), false); return; }
    inst = tile.occupant;
  }
  if (inst.key === 'hurling_field' && campaign.hurlChallenge) {
    ui.showInspect(`<h3>Hurling Field</h3><div class="role">A challenge waits</div><p>A wandering band of hurlers has come to test your ráth. Field three strikers and meet them in a shootout of points — win it and raise a monument to the day.</p><button id="hurl-go" class="continue-btn">🏑 Meet the challengers</button>`, false);
    const b = document.getElementById('hurl-go'); if (b) b.addEventListener('click', openHurling);
    return;
  }
  if (inst.key === 'wrestling_ring' && campaign.sparChallenge) {
    ui.showInspect(`<h3>Wrestling Green</h3><div class="role">A champion waits</div><p>A roaming curadh has come to the green and calls out your túath. Name a fighter to stand for you and corner them through three rounds — win the bout and raise a monument to the day.</p><button id="spar-go" class="continue-btn">🤼 Answer the challenge</button>`, false);
    const b = document.getElementById('spar-go'); if (b) b.addEventListener('click', openSparring);
    return;
  }
  ui.showInspect(buildingHtml(inst), false);
  if (inst.def.role === 'dwelling') _inspectDwelling = inst; // keep its meters live
  if (inst.def.role === 'altar') wireAltar();
  if (inst.def.role === 'gallan') wireGallan(inst);
  if (inst.def.role === 'homestead') { const tb = document.getElementById('trade-btn'); if (tb) tb.addEventListener('click', openTrade); }
}
// Demolish, like build, is confirmed: mark the target red, then "Raze ✓".
function showDemolishGhost(t) {
  if (!t) return;
  const tile = map.get(t.x, t.z);
  if (!tile) return;
  let f;
  if (tile.occupant) { const o = tile.occupant; f = { x: o.x, z: o.z, w: o.w, h: o.h }; }
  else if (tile.blocked || tile.road) f = { x: t.x, z: t.z, w: 1, h: 1 };
  else return; // nothing to remove on bare ground
  pendingDemolish = { x: t.x, z: t.z };
  const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
  const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
  preview.material.color.set(0xff5555);
  preview.position.set(cx, 0.07, cz);
  preview.scale.set(f.w * map.tile, f.h * map.tile, 1);
  preview.visible = true;
  ghostBox.visible = false;
  ui.showPlaceConfirm({ raze: true });
}
function commitDemolish() {
  if (!pendingDemolish) return;
  const occ = map.get(pendingDemolish.x, pendingDemolish.z);
  if (occ && occ.occupant && occ.occupant.warden) clearWarden(occ.occupant); // a razed gallán frees its warden back to the war-band
  const r = game.demolish(pendingDemolish.x, pendingDemolish.z);
  if (r === 'road') { view.rebuildRoads(); view.rebuildCros(); }
  if (r === 'cros') view.rebuildCros();
  if (r) { pushStats(); saveSettlement(); ui.refreshBuildMenu(); } // a razed unique building returns to the menu
  cancelPending();
}

// --- Input: build / road-paint / demolish / inspect + pan + pinch ---
const pointers = new Map();
let painting = false, demolishing = false, panLast = null, pinchDist = 0, tapStart = null;
let pendingBuild = null, movingBuild = false;
let buildRowStart = null, pendingBuildRow = null;
let pendingRow = null, movingRow = false, rowGrab = null, rowOrigin = null;
let pendingRoad = null, drawingRoad = false;
let pendingDemolish = null;
let roadStart = null, roadEnd = null, drawnPath = [];
let roadOptions = [], roadOptIdx = 0;
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

// Ghost placement: drop a building, drag to relocate, then "Build here".
function showGhostAt(t) {
  if (!t || !BUILDINGS[tool]) return;
  pendingBuild = t;
  const f = footprint(tool, t);
  const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
  const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
  const ok = game.canAfford(tool) && map.canPlace(f.x, f.z, f.w, f.h);
  ghostBox.position.set(cx, GHOST_H / 2, cz);
  ghostBox.scale.set(f.w * map.tile, GHOST_H, f.h * map.tile);
  ghostBox.material.color.set(ok ? 0x66ff66 : 0xff5555);
  ghostEdges.material.color.set(ok ? 0xffffff : 0xffbbaa);
  ghostBox.visible = true;
  preview.visible = false;
  ui.showPlaceConfirm();
}
function confirmBuild() {
  if (pendingRoad) { commitRoad(); return; }
  if (pendingDemolish) { commitDemolish(); return; }
  // A dragged row of one or more of the same building.
  if (pendingBuildRow && BUILDINGS[tool]) {
    let n = 0;
    for (const f of pendingBuildRow) if (game.place(tool, f)) n++;
    if (n) {
      if (n > 1) flashNotice(`🏗 Raised ${n} × ${BUILDINGS[tool].label}.`);
      pushStats(); saveSettlement();
    }
    cancelPending();
    return;
  }
  if (!pendingBuild || !BUILDINGS[tool]) return;
  if (game.momentousBlocked(tool)) { flashNotice('🔨 Raise Somhairlín’s House first — she builds the great works.'); cancelPending(); return; }
  const f = footprint(tool, pendingBuild);
  if (game.place(tool, f)) {
    if (tool === 'homestead') { setCattle(campaign.cattle + 25); flashNotice('🐄 Your founding herd settles on the pasture — the wealth of a rí begins.'); } // cattle arrives with the homestead
    if (BUILDINGS[tool].unique) ui.refreshBuildMenu(); // a one-per-settlement building leaves the menu once built
    pushStats(); saveSettlement(); cancelPending();
  }
}
function cancelPending() {
  pendingBuild = null;
  buildRowStart = null;
  pendingBuildRow = null;
  pendingRow = null;
  movingRow = false; rowGrab = null; rowOrigin = null;
  clearRowGhost();
  movingBuild = false;
  pendingRoad = null;
  pendingDemolish = null;
  drawingRoad = false;
  roadStart = null;
  roadEnd = null;
  drawnPath = [];
  roadOptions = [];
  roadOptIdx = 0;
  preview.visible = false;
  ghostBox.visible = false;
  clearRoadGhost();
  if (ui.hidePlaceConfirm) ui.hidePlaceConfirm();
}

// "Other" — cycle through Deaglán's suggestions and your own drawn path.
function altRoute() {
  if (roadOptions.length < 2) return;
  roadOptIdx = (roadOptIdx + 1) % roadOptions.length;
  const opt = roadOptions[roadOptIdx];
  pendingRoad = opt.tiles;
  showRoadGhost();
  ui.showPlaceConfirm({ road: true, label: opt.name, alt: true });
}

function pointerDist() {
  const p = [...pointers.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
function panByScreen(dxPix, dyPix) {
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.set(_fwd.z, 0, -_fwd.x);
  const wpp = (2 * camera.userData.viewSize) / window.innerHeight;
  const mx = -dxPix * wpp, my = -dyPix * wpp; // drag moves the ground under the finger — matches the battle map
  panIsoCamera(camera, _right.x * mx + _fwd.x * my, _right.z * mx + _fwd.z * my);
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  if (sparring.active) return;
  if (hurling.active) { hurling.pointerDown(e); return; }
  if (battle.active) { battle.pointerDown(e); return; }
  if (walk.active) { inspectAt(e); return; } // on a stroll, a tap just looks at who/what you pass
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { panLast = null; painting = false; demolishing = false; pinchDist = pointerDist(); return; }
  if (e.button !== 2) {
    if (tool === 'inspect') { inspectAt(e); return; }
    if (tool === 'demolish') { showDemolishGhost(tileUnderPointer(e)); return; }
    if (tool === 'road') { const t = tileUnderPointer(e); if (t) { roadStart = t; roadEnd = t; drawnPath = [{ x: t.x, z: t.z }]; drawingRoad = true; pendingRoad = drawnPath; showRoadGhost(); } return; }
    if (tool === 'cros') { const t = tileUnderPointer(e); if (t && game.toggleCros(t.x, t.z)) { view.rebuildCros(); saveSettlement(); } return; }
    if (BUILDINGS[tool]) {
      const t = tileUnderPointer(e);
      if (pendingRow && !BUILDINGS[tool].unique) {                   // a row is laid out — grab it and slide the whole thing
        movingRow = true; rowGrab = t; rowOrigin = pendingRow;
      } else {
        movingBuild = true;
        if (BUILDINGS[tool].unique) { showGhostAt(t); }             // one-per-settlement: single ghost, drag to reposition
        else { buildRowStart = t; if (t) showBuildRow(t, t); }       // else: drag from here to lay a row (a tap = one)
      }
      return;
    }
  }
  panLast = { x: e.clientX, y: e.clientY }; // no build tool, or right-drag → pan
  if (e.button !== 2 && !tool) tapStart = { x: e.clientX, y: e.clientY }; // a plain tap in roam mode may hit the menace
});

canvas.addEventListener('pointermove', (e) => {
  if (sparring.active) return;
  if (hurling.active) { hurling.pointerMove(e); return; }
  if (battle.active) { battle.pointerMove(e); return; }
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { const d = pointerDist(); if (pinchDist && d > 0) zoomIsoCamera(camera, pinchDist / d, aspect); pinchDist = d; return; }
  if (panLast) { panByScreen(e.clientX - panLast.x, e.clientY - panLast.y); panLast = { x: e.clientX, y: e.clientY }; return; }
  if (drawingRoad && tool === 'road') {
    const t = tileUnderPointer(e);
    if (t && (t.x !== roadEnd.x || t.z !== roadEnd.z)) { roadEnd = t; extendDrawn(t); pendingRoad = drawnPath; showRoadGhost(); }
    return;
  }
  if (movingRow && rowOrigin) {                                    // slide the whole laid-out row by the drag delta
    const t = tileUnderPointer(e); if (!t || !rowGrab) return;
    const dx = t.x - rowGrab.x, dz = t.z - rowGrab.z;
    showBuildRow({ x: rowOrigin.start.x + dx, z: rowOrigin.start.z + dz }, { x: rowOrigin.end.x + dx, z: rowOrigin.end.z + dz });
    return;
  }
  if (movingBuild && BUILDINGS[tool]) {
    const t = tileUnderPointer(e); if (!t) return;
    if (BUILDINGS[tool].unique) showGhostAt(t);                    // reposition the single ghost
    else showBuildRow(buildRowStart || t, t);                      // extend the row toward the drag tile
    return;
  }
  if (pendingBuild || pendingBuildRow || pendingRoad || pendingDemolish) return; // ghost locked awaiting confirm
  updatePreview(e);
});

function endPointer(e) {
  canvas.releasePointerCapture?.(e.pointerId);
  if (sparring.active) return;
  if (hurling.active) { hurling.pointerUp(e); return; }
  if (battle.active) { battle.pointerUp(e); return; }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (tapStart && game.hasMenace() && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8 && menaceHitAt(e)) { tapStart = null; openMenacePrompt(); return; }
  tapStart = null;
  if (pointers.size === 0) {
    painting = false; demolishing = false; panLast = null; movingBuild = false;
    movingRow = false; rowGrab = null; rowOrigin = null; // row stays laid out (pendingRow) for another slide or a Build
    if (drawingRoad) {
      drawingRoad = false;
      if (drawnPath.length) {
        buildRoadOptions();
        showRoadGhost();
        ui.showPlaceConfirm({ road: true, label: roadOptions[0].name, alt: roadOptions.length > 1 });
      } else cancelPending();
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!pendingBuild) preview.visible = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (sparring.active) return;
  if (hurling.active) { hurling.zoom(e.deltaY > 0 ? 1.1 : 0.9); return; }
  if (battle.active) { battle.zoom(e.deltaY > 0 ? 1.1 : 0.9); return; }
  zoomIsoCamera(camera, e.deltaY > 0 ? 1.1 : 0.9, aspect);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (battle.active) return;
  if (e.key === 'Escape') { cancelPending(); tool = null; ui.setTool(null); preview.visible = false; ui.hideInspect(); }
});

function checkMission() {
  if (!levelObjectives.length) return;
  let changed = false, all = true;
  for (const o of levelObjectives) {
    if (!o.done && o.check(game, campaign)) { o.done = true; changed = true; if (!campaign.doneObjectives.includes(o.text)) campaign.doneObjectives.push(o.text); }
    if (!o.done) all = false;
  }
  if (changed) { refreshObjectives(); saveCampaign(); }
  if (!missionDone && all) { missionDone = true; completeLevel(); }
}

// A Zeus-style illuminated interstitial between chapters.
let narrativeWired = false, _narrDone = null;
function showNarrative(nx, onDone) {
  if (!nx) { (onDone || advanceLevel)(); return; }
  _narrDone = onDone || advanceLevel;
  const $ = (id) => document.getElementById(id);
  $('narr-banner').style.background = nx.motif || 'linear-gradient(160deg,#2a3a1e,#4a6b2e)';
  $('narr-emoji').textContent = nx.emoji || '🌿';
  $('narr-title').textContent = nx.title || '';
  $('narr-ga').textContent = nx.ga || '';
  $('narr-body').innerHTML = (nx.body || []).map((p) => `<p>${p}</p>`).join('');
  if (!narrativeWired) { $('narr-continue').addEventListener('click', () => { $('narrative-screen').classList.add('hidden'); const d = _narrDone; _narrDone = null; if (d) d(); }); narrativeWired = true; }
  $('narrative-screen').classList.remove('hidden');
}
// The opening: after choosing a home, an intro page, then into the ráth.
function showIntro() {
  const k = kingdomById(campaign.home);
  campaign._introSeen = true; saveCampaign();
  showNarrative({
    emoji: '🌱', motif: 'linear-gradient(160deg,#2a3a1e,#4a6b2e)', title: 'A New Ráth', ga: 'Ráth Nua',
    body: [
      `${leaderName()}, you come to ${k ? k.en : 'this land'} in the last grey days of winter, your people at your back and a bare stretch of pasture before you.`,
      'Imbolc is near — Brigid, daughter of the Dagda, will soon wake the earth. Before the festival fires are lit, raise your first hearths, sow the barley, and let a shrine stand.',
      'These are the first steps of a reign that may yet end in the High Kingship of all Ériu. Build well — the land is watching.',
    ],
  }, enterSettlement);
}

window.addEventListener('resize', () => {
  aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeIsoCamera(camera, aspect);
  walkCam.aspect = aspect; walkCam.updateProjectionMatrix();
  battle.resize(aspect);
  hurling.resize(aspect);
  sparring.resize(aspect);
});

window.ardri = { game, map, view, sim, cal, camera, walk, walkCam, battle, hurling, sparring, openSparring, ui, openKingdomMap, openTrade, campaign, saveSettlement, setCattle,
  _dbg: { foundColony, collectColonyTribute, replenishWarband, isColony, showNarrative, completeLevel, loadLevel, levelById, advanceLevel, applyUnlock, refreshCampaignButton, buildingHtml,
    layRow: (key, sx, sz, ex, ez) => { const before = game.buildings.length; tool = key; showBuildRow({ x: sx, z: sz }, { x: ex, z: ez }); const shown = pendingBuildRow ? pendingBuildRow.length : 0; confirmBuild(); return { shown, placed: game.buildings.length - before }; } },
  screenOf(tx, tz) { // tile → screen pixels, for headless probes
    const w = map.tileToWorld(tx, tz);
    const v = new THREE.Vector3(w.x, 0.1, w.z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  } };

// --- Loop: economy on ECON_TICK, calendar on SECONDS_PER_DAY ---
let econAcc = 0, dayAcc = 0;
const clock = new THREE.Clock();

// Buildings are quads we orient ourselves each frame. Under the iso camera we match
// its view plane (identical to the old billboard sprite). In the first-person stroll
// we only yaw them to face the camera, keeping them vertically upright — so a building
// stands straight instead of tilting its top toward you and overhanging the tile.
function billboardBuildings(cam, upright) {
  const list = game.buildingGroup.children;
  for (let i = 0; i < list.length; i++) {
    const g = list[i], spr = g.userData && g.userData.spr;
    if (!spr || !spr.userData || !spr.userData.billboard) continue;
    if (upright) spr.rotation.set(0, Math.atan2(cam.position.x - g.position.x, cam.position.z - g.position.z), 0);
    else spr.quaternion.copy(cam.quaternion);
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (battle.active) { setCamera(battle.camera); battle.update(dt); battle.render(renderer); return; }
  if (hurling.active) { setCamera(hurling.renderCam()); hurling.update(dt); hurling.render(renderer); return; }
  if (sparring.active) { setCamera(sparring.renderCam()); sparring.update(dt); sparring.render(renderer); return; }
  const cam = walk.active ? walkCam : camera;
  setCamera(cam);
  updateWalkBtn();
  // The world-clock and economy run whenever the settlement is the scene you're
  // looking at — including the stroll, so folk keep spawning and the ráth stays
  // alive while you follow someone. (Battle/hurling/sparring returned above.)
  const live = titleScreenEl.classList.contains('hidden');
  if (live) started = true; // play has begun — day-saves and onboarding may run
  const scaled = live ? dt * sim.speed : 0;
  game.update(scaled);
  game.updateFx(dt); // ambient effects run in real time
  if (_inspectDwelling && !_inspectDwelling.dead) refreshDwellMeter(_inspectDwelling); // fill the open panel's meters live
  econAcc += scaled;
  while (econAcc >= ECON_TICK) { econAcc -= ECON_TICK; game.tick(); pushStats(); checkMission(); }
  if (game._unpavedRun) { game._unpavedRun = false; if (!campaign._unpavedHinted) { campaign._unpavedHinted = true; saveCampaign(); flashNotice('💰 A carrier had to cross open ground — an unpaved run costs 5 silver, not 1. Pave a road all the way to your stores to keep carriage cheap.'); } }
  dayAcc += scaled;
  while (dayAcc >= SECONDS_PER_DAY) { dayAcc -= SECONDS_PER_DAY; advanceDay(); }
  if (walk.active) {
    walk.update(dt);
    billboardBuildings(walkCam, true);
    renderer.render(scene, walkCam);
  } else {
    billboardBuildings(camera, false);
    renderer.render(scene, camera);
  }
}
frame();

// Dev-only handle (activated with ?dev in the URL) for testing/inspection — inert
// for normal players. Exposes the world and a helper to lay a Deaglán road.
if (typeof location !== 'undefined' && /[?&]dev\b/.test(location.search)) {
  window.__ardri = { game, map, view, hurling, openHurling, campaign,
    layDeaglanRoad(tiles) {
      const laid = [];
      for (const p of tiles) { if (map.setRoad(p.x, p.z, true)) { const t = map.get(p.x, p.z); if (t) t.roadKind = 'deaglan'; laid.push(p); } }
      if (laid.length) { view.rebuildRoads(); game.roadCrew(laid, (tile, hidden) => { const t = map.get(tile.x, tile.z); if (t) t.roadHidden = hidden; view.rebuildRoads(); }); }
      return laid.length;
    } };
}
