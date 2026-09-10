import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js?v=CBUST';
import { makeBuildingChip, makeAlertMarker, makeInspectDot, makeCowToken, makeWarriorChip, makeWalkerChip, setChipActive, setChipState } from '../render/chips.js?v=CBUST';
import { tex, spriteFrom } from '../render/assets.js?v=CBUST';
import { emitterFor, Emitter } from '../render/effects.js?v=CBUST';

const FX_TOP = { dwelling: 1.15, farm: 0.7, market: 1.15, homestead: 1.6 }; // where hearth-smoke leaves the roof — tuned to the ~1.25-tile-tall building art
import { Walker, Traveler } from './walkers.js?v=CBUST';

// A soft round pip that floats up from a building when a walker delivers to it,
// so the invisible food/water/culture transfer can be seen. Colour = what arrived.
const PIP_COLOR = { food: 0xe8c86b, water: 0x6fb0e0, culture: 0xb07ad0 };
const PIP_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const x = c.getContext('2d');
  // A solid colour bead (white core → soft edge) with a thin dark rim, so it
  // reads as a crisp coloured dot over bright hearth-smoke as well as dark ground
  // rather than washing out the way an additive glow does.
  const g = x.createRadialGradient(24, 20, 1, 24, 24, 22);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.98)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(24, 24, 22, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(35,22,12,0.55)'; x.lineWidth = 2.5; x.beginPath(); x.arc(24, 24, 20, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c); return t;
})();
import { entryRoadTile, adjacentBuildings, roadConnected, roadNeighbors } from './roads.js?v=CBUST';
import { randomName } from '../data/names.js?v=CBUST';
import { personFor } from '../data/phrases.js?v=CBUST';

const MARKET_CAP = 12;
const HOUSE_CAP = 10;      // a delivery fills a home to this — its stock reads in days
const RENT_PER_HEAD = 1;   // silver per content head per day
// Homes hold their supply for days now, not seconds — one delivery lasts a good
// while and drains once a day, so keeping folk happy is about reaching them, not
// racing a fast timer.
const FOOD_DECAY = 1;      // per day → a full home is fed ~10 days
const WATER_DECAY = 1;     // per day → ~10 days
const CULTURE_DECAY = 2;   // per day → ~5 days
const DISTRESS_DAYS = 4;   // days with NO food AND NO water before a family leaves
const PROSPER_TIER = 2;    // a home at this prosperity tier or above holds more folk
const PROSPER_CAP = 6;     // the folk a prospering home can hold
const FESTIVAL_BONUS = 1.5;
const GRANARY_CAP = 48;    // grain a store holds before it's full
const FARM_GROW = 24;      // econ ticks for a field to ripen
const FARM_HARVESTS = 2;   // grain-carriers a ripe field sends before regrowing
const FARM_MIN_FOLK = 4;   // hands the settlement needs to bring a harvest in
const MAX_PER_BLD = 2;     // most walkers any one building keeps on the roads (2 druids per shrine)
const HERD_GROW = 5;       // econ ticks between calvings at the homestead
const HERD_RADIUS = 3;     // tiles of open pasture around the homestead that count as grazing
const COW_PER_TOKEN = 5;   // cattle each grazing cow-token on the map stands for (max 10 shown)
const CULTURE_BONUS = 1.25; // rent multiplier for a fed, watered AND cultured house
// Settlement rank ladder — culture is weighted double, so a cultured túath rises fastest.
const RANKS = [[120, 'Ard Rí'], [80, 'Rí Tuaithe'], [45, 'Mór-Thúath'], [20, 'Túath'], [8, 'Baile'], [0, 'Ráth']];

// Owns the buildings, the economy tick, the walkers, and mission objectives.
export class Game {
  constructor(map, scene) {
    this.map = map;
    this.scene = scene;
    this.buildingGroup = new THREE.Group();
    this.walkerGroup = new THREE.Group();
    this.menaceGroup = new THREE.Group();
    this.floatieGroup = new THREE.Group();
    this.blessGroup = new THREE.Group();
    this.crewGroup = new THREE.Group();
    scene.add(this.buildingGroup, this.walkerGroup, this.menaceGroup, this.floatieGroup, this.blessGroup, this.crewGroup);
    this.crews = []; // Deaglán & his dog, out building a road
    this._floaties = [];
    this.menace = null;

    this.buildings = [];
    this.walkers = [];
    this.silver = 200;
    this.folk = 0;
    this.cattle = 40;
    this.broke = false;
    this.warTint = 0x4a86ff; // the slua's field colour — set from the campaign livery; the hurling green sends folk in it
    this.blessings = []; // active god-processions blessing the dwellings
    this._immTimer = 0;
    this.entrance = { x: 0, z: Math.floor(map.size / 2) }; // settlers arrive here

    const ew = map.tileToWorld(this.entrance.x, this.entrance.z);
    const gate = spriteFrom(tex('assets/props/gate.png'), 1.2);
    gate.position.set(ew.x, 0, ew.z);
    scene.add(gate);

    this.objectives = []; // set per-level by main via setObjectives()
  }

  showInspectDots(on) { this._inspectDots = on; for (const b of this.buildings) if (b.dot) b.dot.visible = on; }

  // --- The menace: a blighted, unbuildable patrol zone with the Ollphéist serpent ---
  spawnMenace(x, z, w, h) {
    this.clearMenace();
    x = Math.max(0, Math.min(x, this.map.size - w)); z = Math.max(0, Math.min(z, this.map.size - h));
    this.menace = { x, z, w, h, t: 0 };
    this._markMenace(true);
    this._razeInMenace();
    this._drawMenaceZone();
    const cre = makeWarriorChip('olipheist', 3.6); this.menace.creature = cre; this.menaceGroup.add(cre); // the Ollphéist — the great serpent you march on
    this._moveMenaceCreature(0);
  }
  clearMenace() {
    if (!this.menace) return;
    this._markMenace(false);
    while (this.menaceGroup.children.length) this.menaceGroup.remove(this.menaceGroup.children[0]);
    this.menace = null;
  }
  hasMenace() { return !!this.menace; }
  _markMenace(on) {
    const m = this.menace; if (!m) return;
    for (let z = m.z; z < m.z + m.h; z++) for (let x = m.x; x < m.x + m.w; x++) { const t = this.map.get(x, z); if (t) t.menace = on; }
  }
  _razeInMenace() {
    const m = this.menace; if (!m) return;
    for (const b of this.buildings.slice()) {
      if (b.x < m.x + m.w && b.x + b.w > m.x && b.z < m.z + m.h && b.z + b.h > m.z) this.demolish(b.x, b.z, false); // razed, no refund
    }
  }
  // Each turn of the year the blight creeps outward by one ring, engulfing more.
  expandMenace() {
    const m = this.menace; if (!m) return;
    this._markMenace(false);
    m.x = Math.max(0, m.x - 1); m.z = Math.max(0, m.z - 1);
    m.w = Math.min(this.map.size - m.x, m.w + 2); m.h = Math.min(this.map.size - m.z, m.h + 2);
    this._markMenace(true);
    this._razeInMenace();
    this._drawMenaceZone();
    this._moveMenaceCreature(0);
  }
  _drawMenaceZone() {
    const m = this.menace; if (!m) return;
    for (const c of this.menaceGroup.children.slice()) if (c.userData && c.userData.zone) { this.menaceGroup.remove(c); if (c.geometry) c.geometry.dispose(); }
    const ts = this.map.tile;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(m.w * ts, m.h * ts),
      new THREE.MeshBasicMaterial({ color: 0xa01c24, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2; plane.position.set((m.x + m.w / 2) * ts - this.map.half, 0.06, (m.z + m.h / 2) * ts - this.map.half);
    plane.userData.zone = true; this.menaceGroup.add(plane);
  }
  _moveMenaceCreature(dt) {
    const m = this.menace; if (!m || !m.creature) return;
    const cre = m.creature, prevX = cre.position.x, prevZ = cre.position.z;
    m.t += dt * 0.5;
    const ts = this.map.tile;
    const px = (m.x + m.w / 2 + Math.sin(m.t) * (m.w / 2 - 0.6)) * ts - this.map.half;
    const pz = (m.z + m.h / 2 + Math.cos(m.t * 0.7) * (m.h / 2 - 0.6)) * ts - this.map.half;
    cre.position.set(px, 0.05, pz);
    const dx = px - prevX, dz = pz - prevZ, moving = Math.hypot(dx, dz) > 0.0005;
    if (cre.faceWorld) cre.faceWorld(dx, dz);
    if (cre.animate) cre.animate(dt, moving); // the giant walks its blighted ground
  }
  // Count the open pasture (bare grass, no road, no building) in a ring around
  // the homestead — the grazing that lets the herd grow.
  _grazing(b) {
    let n = 0;
    for (let z = b.z - HERD_RADIUS; z < b.z + b.h + HERD_RADIUS; z++)
      for (let x = b.x - HERD_RADIUS; x < b.x + b.w + HERD_RADIUS; x++) {
        const t = this.map.get(x, z);
        if (t && t.terrain === 0 && !t.road && !t.occupant) n++;
      }
    return n;
  }
  // Show the herd as a scatter of grazing cows around the ráth (capped at 10).
  _updateHerd(b) {
    if (!b.herdGroup) return;
    const want = Math.min(10, Math.floor(b.herd / COW_PER_TOKEN));
    while (b.herdGroup.children.length < want) {
      const cow = makeCowToken();
      const a = Math.random() * Math.PI * 2, r = (b.w / 2 + 0.6 + Math.random() * 1.6) * this.map.tile;
      cow.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r + this.map.tile * 0.3);
      b.herdGroup.add(cow);
    }
    while (b.herdGroup.children.length > want) b.herdGroup.remove(b.herdGroup.children[b.herdGroup.children.length - 1]);
  }
  count(role) { return this.buildings.filter((b) => b.def.role === role).length; }
  anyStock(role) { return this.buildings.some((b) => b.def.role === role && b.stock > 0); }
  _storeHasRoom() { return this.buildings.some((b) => b.def.role === 'granary' && b.stock < GRANARY_CAP); }

  // Half the folk are able workers — the rest are children and elders.
  workforce() { return Math.floor(this.folk * 0.5); }
  _activeWorkers() {
    const priv = new Set(['grain_carrier', 'market_trader']); // public water-carriers aren't private labour
    return this.walkers.reduce((n, w) =>
      n + (w instanceof Walker && !w.done && priv.has(w.sprite?.userData?.type) ? 1 : 0), 0);
  }

  // --- Economy: private rents in, public wages out, settled once per day ---
  dwellings() { return this.buildings.filter((b) => b.def.role === 'dwelling' && b.pop > 0); }
  folkContent() { return this.dwellings().reduce((n, b) => n + (b.food > 0 && b.water > 0 ? b.pop : 0), 0); }
  culturedFolk() { return this.dwellings().reduce((n, b) => n + (b.culture > 0 ? b.pop : 0), 0); }
  dailyRent(festival = false) {
    let sum = 0;
    for (const b of this.dwellings()) {
      const fed = b.food > 0, watered = b.water > 0;
      const factor = fed && watered ? 1 : (fed || watered ? 0.5 : 0.25); // both services = full rent
      let r = b.pop * RENT_PER_HEAD * factor;
      if (fed && watered && b.culture > 0) r *= CULTURE_BONUS; // proud, cultured folk pay more
      if (festival && fed && watered) r *= FESTIVAL_BONUS; // content folk are generous at the feast
      sum += r;
    }
    return Math.round(sum);
  }
  // Settlement standing — folk, the content among them, and culture (double-weighted).
  standing() {
    const content = this.folkContent();
    const cultured = this.culturedFolk();
    const score = this.folk + content + cultured * 2;
    const title = RANKS.find(([t]) => score >= t)[1];
    return { score, title, content, cultured };
  }
  dailyWages() { return this.buildings.reduce((n, b) => n + (b.def.upkeep || 0), 0); }
  settleDay({ festival = false, newMonth = false } = {}) {
    const rent = this.dailyRent(festival);
    const wages = this.dailyWages();
    this.silver += rent;
    if (this.silver >= wages) { this.silver -= wages; this.broke = false; }
    else { this.silver = 0; this.broke = wages > 0; } // payroll unmet — public folk go unpaid
    for (const b of this.buildings) if (b.def.role === 'dwelling') this._dwellingDay(b, festival, newMonth);
    return { rent, wages, net: rent - wages, festival, broke: this.broke };
  }

  // A home, once a day: its supply drains, it may lose a family to lasting want,
  // and its prosperity tier steps up at a festival (if it's thriving) or slips at
  // a plain month-turn (if it's been neglected). A prospering home holds more folk.
  _dwellingDay(b, festival, newMonth) {
    if (b.blessedDays > 0) {
      // A god's blessing holds this home at the full of every good — no want, no
      // drain — for as long as it lasts (set when a patron god is prayed to).
      b.food = HOUSE_CAP; b.water = HOUSE_CAP; b.culture = HOUSE_CAP; b.distress = 0;
      b.blessedDays -= 1;
    } else {
      b.food = Math.max(0, b.food - FOOD_DECAY);
      b.water = Math.max(0, b.water - WATER_DECAY);
      b.culture = Math.max(0, b.culture - CULTURE_DECAY);
      if (b.food <= 0 && b.water <= 0) {
        b.distress = (b.distress || 0) + 1;
        if (b.distress >= DISTRESS_DAYS && b.pop > 0) { b.distress = 0; this._emigrate(b); }
      } else b.distress = 0;
    }
    // Prosperity climbs a step whenever a full, fed, watered home turns a month —
    // festivals give the same lift — so a well-kept home reaches its greater
    // capacity (holds 6) in a season or two, and you see it grow. The top tier
    // also wants a heartened, cultured home.
    const kept = b.pop >= b.cap && b.food >= 5 && b.water >= 5;
    const thriving = kept && (b.tier < 2 || b.culture >= 5);
    const neglected = b.food < 3 || b.water < 3;
    if ((newMonth || festival) && thriving && b.tier < 3) b.tier += 1;
    else if (newMonth && !festival && neglected && b.tier > 0) b.tier -= 1;
    b.cap = b.tier >= PROSPER_TIER ? PROSPER_CAP : (b.def.folk || 4);
  }

  _center(f) {
    return {
      x: f.x * this.map.tile - this.map.half + (f.w * this.map.tile) / 2,
      z: f.z * this.map.tile - this.map.half + (f.h * this.map.tile) / 2,
    };
  }

  canAfford(key) { return this.silver >= BUILDINGS[key].cost; }

  place(key, f) {
    const def = BUILDINGS[key];
    if (this.silver < def.cost || !this.map.canPlace(f.x, f.z, f.w, f.h)) return false;
    if (def.unique && this.buildings.some((b) => b.def.role === def.role)) return false; // one homestead only
    this._spawnBuilding(key, f);
    this.silver -= def.cost;
    return true; // dwellings fill via immigrants, not instantly
  }

  // Build the mesh + instance for a building. Shared by place() and restore().
  _spawnBuilding(key, f) {
    const def = BUILDINGS[key];
    const inst = { key, def, x: f.x, z: f.z, w: f.w, h: f.h, stock: 0, food: 0, water: 0, culture: 0, timer: 0,
      pop: 0, cap: def.folk || 0, incoming: 0, distress: 0, active: false, tier: 0,
      grown: 0, ripe: false, harvestsLeft: 0, connected: false, herd: def.role === 'homestead' ? 10 : 0,
      blessedDays: 0, // days a god's blessing keeps this home at the full of every good
      warden: null, patron: null, // a gallán may dedicate a warrior (warden) and be attributed to a god/hero (patron)
      growMax: FARM_GROW, harvests: FARM_HARVESTS, yieldTotal: (def.load || 0) * FARM_HARVESTS }; // for the field inspect readout
    this.map.place(f.x, f.z, f.w, f.h, inst);

    const chip = makeBuildingChip(def.role, f.w, f.h, this.map.tile, { art: def.art, states: def.states, scale: def.scale, drawW: def.drawW });
    const c = this._center(f);
    chip.position.set(c.x, 0, c.z);
    if (def.role === 'homestead') {
      const s = chip.userData && chip.userData.spr; if (s) s.material.color.setHex(0xf0dca8);
      inst.herdGroup = new THREE.Group(); chip.add(inst.herdGroup);
      const graze = new Emitter('graze', { w: HERD_RADIUS * 2, h: HERD_RADIUS * 2, tile: this.map.tile, topY: 0.9 }); // green glitter over the grazing fields
      graze.setActive(true); chip.add(graze.group); inst.fx2 = graze;
    }
    const alert = makeAlertMarker();
    alert.position.set(0, 2.7, 0);
    alert.visible = false;
    chip.add(alert);
    inst.alert = alert;
    const dot = makeInspectDot();
    dot.position.set(0, 1.4, 0);
    chip.add(dot);
    inst.dot = dot;
    if (this._inspectDots) dot.visible = true;
    const fx = emitterFor(def.role, { w: f.w, h: f.h, tile: this.map.tile, topY: FX_TOP[def.role] || 2 });
    if (fx) { fx.setActive(false); chip.add(fx.group); inst.fx = fx; }
    this.buildingGroup.add(chip);
    inst.sprite = chip;
    chip.userData.inst = inst; // lets a tap on the billboard (or its dot) resolve to this building

    this.buildings.push(inst);
    if (def.role === 'homestead') this._updateHerd(inst);
    return inst;
  }

  // --- Persistence: the settlement is your standing ráth, kept between sessions ---
  snapshot() {
    const roads = [], cros = [];
    for (let z = 0; z < this.map.size; z++) for (let x = 0; x < this.map.size; x++) {
      const t = this.map.get(x, z);
      if (t && t.road) roads.push({ x, z, kind: t.roadKind || null });
      if (t && t.blocked) cros.push({ x, z });
    }
    const buildings = this.buildings.map((b) => ({ key: b.key, x: b.x, z: b.z,
      pop: b.pop, stock: b.stock, food: b.food, water: b.water, culture: b.culture, herd: b.herd,
      grown: b.grown, ripe: b.ripe, harvestsLeft: b.harvestsLeft, warden: b.warden || null, patron: b.patron || null,
      blessedDays: b.blessedDays || 0, tier: b.tier || 0 }));
    const menace = this.menace ? { x: this.menace.x, z: this.menace.z, w: this.menace.w, h: this.menace.h } : null;
    return { silver: this.silver, cattle: this.cattle, folk: this.folk, buildings, roads, cros, menace };
  }
  load(snap) {
    if (!snap) return;
    this.clearMenace();
    for (const c of this.blessGroup.children.slice()) this.blessGroup.remove(c);
    this.blessings = [];
    for (const c of this.crewGroup.children.slice()) this.crewGroup.remove(c);
    this.crews = [];
    for (const b of this.buildings.slice()) { this.buildingGroup.remove(b.sprite); if (b.fx) b.fx.dispose(); if (b.fx2) b.fx2.dispose(); }
    this.buildings = [];
    for (const w of this.walkers.slice()) this.walkerGroup.remove(w.sprite);
    this.walkers = [];
    for (let z = 0; z < this.map.size; z++) for (let x = 0; x < this.map.size; x++) {
      const t = this.map.get(x, z); if (!t) continue; t.occupant = null; if (t.road) this.map.setRoad(x, z, false); t.roadKind = null; t.blocked = false; t.menace = false;
    }
    this.silver = snap.silver != null ? snap.silver : this.silver;
    this.cattle = snap.cattle != null ? snap.cattle : this.cattle;
    this.folk = snap.folk || 0;
    for (const r of snap.roads || []) { if (this.map.setRoad(r.x, r.z, true)) { const t = this.map.get(r.x, r.z); if (t) t.roadKind = r.kind; } }
    for (const c of snap.cros || []) { const t = this.map.get(c.x, c.z); if (t) t.blocked = true; }
    for (const b of snap.buildings || []) {
      const def = BUILDINGS[b.key]; if (!def) continue;
      const [w, h] = def.footprint;
      if (!this.map.canPlace(b.x, b.z, w, h)) continue;
      const inst = this._spawnBuilding(b.key, { x: b.x, z: b.z, w, h });
      Object.assign(inst, { pop: b.pop || 0, stock: b.stock || 0, food: b.food || 0, water: b.water || 0, culture: b.culture || 0,
        grown: b.grown || 0, ripe: !!b.ripe, harvestsLeft: b.harvestsLeft || 0, warden: b.warden || null, patron: b.patron || null,
        blessedDays: b.blessedDays || 0, tier: b.tier || 0 });
      if (def.role === 'dwelling') inst.cap = inst.tier >= PROSPER_TIER ? PROSPER_CAP : (def.folk || 4);
      if (def.role === 'homestead') { inst.herd = b.herd || 10; this._updateHerd(inst); }
    }
    if (snap.menace) this.spawnMenace(snap.menace.x, snap.menace.z, snap.menace.w, snap.menace.h);
  }

  // Remove a building (refund half) or a road at a tile.
  // A Cros pens walkers: toggle it on a road tile. Returns 'cros'/'uncros'/null.
  toggleCros(x, z) {
    const t = this.map.get(x, z);
    if (!t || !t.road) return null;
    t.blocked = !t.blocked;
    return t.blocked ? 'cros' : 'uncros';
  }

  demolish(x, z, refund = true) {
    const t = this.map.get(x, z);
    if (t && t.blocked) { t.blocked = false; return 'cros'; } // clear the Cros first, keep the road
    if (t && t.occupant) {
      const inst = t.occupant;
      for (let dz = 0; dz < inst.h; dz++)
        for (let dx = 0; dx < inst.w; dx++) {
          const tt = this.map.get(inst.x + dx, inst.z + dz);
          if (tt) tt.occupant = null;
        }
      this.buildingGroup.remove(inst.sprite);
      if (inst.fx) inst.fx.dispose();
      if (inst.fx2) inst.fx2.dispose();
      this.buildings = this.buildings.filter((b) => b !== inst);
      if (inst.pop) this.folk = Math.max(0, this.folk - inst.pop);
      if (refund) this.silver += Math.floor(inst.def.cost / 2);
      return 'building';
    }
    if (t && t.road) { this.map.setRoad(x, z, false); t.roadKind = null; t.blocked = false; return 'road'; }
    return null;
  }

  _spawn(entry, opts) {
    const female = Math.random() < 0.5;
    const person = { name: randomName(female), female, ...personFor(opts.personType || opts.type) };
    const w = new Walker(this.map, entry, { ...opts, person });
    w.source = opts.source || null;
    if (opts.tint != null && w.sprite && w.sprite.material) w.sprite.material.color.setHex(opts.tint); // war-colour the hurling players
    this.walkers.push(w);
    this.walkerGroup.add(w.sprite);
  }

  _walkersFrom(b) {
    return this.walkers.reduce((n, w) => n + (w.source === b && !w.done ? 1 : 0), 0);
  }

  // --- Economy, one call per sim tick ---
  tick() {
    if (++this._immTimer >= 3) { this._immTimer = 0; this._sendImmigrant(); } // settlers move in
    this._labour = Math.max(0, this.workforce() - this._activeWorkers()); // spare hands this tick
    for (const b of this.buildings) {
      const connected = !!entryRoadTile(this.map, b);
      b.connected = connected;
      if (b.alert) b.alert.visible = !connected && b.def.role !== 'homestead' && b.def.role !== 'gallan'; // homestead and standing-stone need no road
      // dwellings rise when occupied; a field only shows its golden crop when ripe; else road-connected
      const active = b.def.role === 'dwelling' ? b.pop > 0
        : b.def.role === 'farm' ? b.ripe
        : b.def.role === 'homestead' ? true
        : connected;
      if (active !== b.active) { b.active = active; if (b.fx) b.fx.setActive(active); }
      // Buildings with four prosperity frames grade smoothly; the rest just
      // swap empty↔full on `active`.
      setChipState(b.sprite, (b.def.states >= 3) ? this._prosperity(b) : (active ? 1 : 0));
      this._tickBuilding(b);
    }
  }

  // How thriving a building looks, 0..1, mapped onto its four prosperity frames.
  _prosperity(b) {
    switch (b.def.role) {
      case 'dwelling': // a sticky prosperity tier: it rises at festivals, slips if neglected
        return (b.tier || 0) / 3;
      case 'farm': // growing through the season, then the ripe harvest
        return b.ripe ? 1 : Math.min(0.66, (b.grown / FARM_GROW) * 0.66);
      case 'market': // busier the more it holds
        return b.connected ? Math.min(1, 0.34 + (b.stock / MARKET_CAP) * 0.66) : 0;
      case 'gallan': // a bare stone → consecrated/tended → a patron god or a warden lights it
        return (b.warden || b.patron) ? 1 : 0.3;
      case 'culture': // a venue comes alive once it is on the roads and folk can reach it
        return b.connected ? 1 : 0.3;
      default:
        return b.active ? 1 : 0;
    }
  }
  _tickBuilding(b) {
    switch (b.def.role) {
      case 'farm': {
        // The field ripens on a growth cycle; only a ripe field is golden & harvested.
        if (!b.ripe) {
          if (++b.grown >= FARM_GROW) { b.ripe = true; b.harvestsLeft = FARM_HARVESTS; b.timer = 0; }
          break;
        }
        // Ripe: bring the harvest in — needs a road, 4 hands in the settlement,
        // spare labour, at most 2 carriers on the roads at once, AND a grain store
        // with room. When every store is full the field simply holds its ripe
        // crop and waits, rather than sending a carrier that spills the harvest
        // into a full store — so a good year is never silently lost.
        if (b.connected && this.folk >= FARM_MIN_FOLK && this._labour > 0 && this._storeHasRoom() &&
            this._walkersFrom(b) < MAX_PER_BLD && ++b.timer >= 2) {
          b.timer = 0; this._labour--; this._sendGrain(b);
          if (--b.harvestsLeft <= 0) { b.ripe = false; b.grown = 0; } // back to growing
        }
        break;
      }
      case 'market': {
        this._restock(b);
        if (this._labour > 0 && b.stock > 0 && this._walkersFrom(b) < MAX_PER_BLD && ++b.timer >= 3) {
          b.timer = 0; this._labour--; this._sendTrader(b);
        }
        break;
      }
      case 'well': {
        // Public water-carrier: runs while the treasury can pay (not broke).
        if (!this.broke && this.folk > 0 && this._walkersFrom(b) < MAX_PER_BLD && ++b.timer >= 3) {
          b.timer = 0; this._sendWater(b);
        }
        break;
      }
      case 'altar': {
        // A shrine keeps druids on the roads (paid from the treasury, like a well),
        // and every dwelling they pass gains culture. Two druids at a time.
        if (!this.broke && this.folk > 0 && this._walkersFrom(b) < MAX_PER_BLD && ++b.timer >= 3) {
          b.timer = 0; this._sendDruid(b);
        }
        break;
      }
      case 'culture': {
        // A culture venue — feast hall, hurling field, stone-circle — sends folk out
        // along the roads (storytellers, revellers, players) who lift the culture of
        // every dwelling they pass, just as a shrine's druid does. Most send druids;
        // the hurling green sends its players, in the slua's war colours.
        if (this.folk > 0 && this._walkersFrom(b) < MAX_PER_BLD && ++b.timer >= 3) {
          b.timer = 0; this._sendCultureRaiser(b);
        }
        break;
      }
      case 'homestead': {
        // The herd calves on open grazing. Count the free pasture around the
        // ráth; more open grass, a larger herd it can carry, the faster it grows.
        const graze = this._grazing(b);
        const cap = 20 + graze * 4;
        if (b.herd < cap && ++b.timer >= HERD_GROW) {
          b.timer = 0; b.herd += 1; this.cattle += 1; this._updateHerd(b);
        }
        break;
      }
      case 'dwelling':
        break; // a home's supply drains once a day now, in settleDay — not per tick
    }
  }

  // The map-edge tile nearest a building — settlers arrive from (and leave to)
  // the countryside just off the edge closest to the ráth, not clear across the
  // whole map, so a lone traveller never treks the empty middle.
  _arrivalTile(b) {
    const s = this.map.size - 1;
    const cands = [{ x: 0, z: b.z }, { x: s, z: b.z }, { x: b.x, z: 0 }, { x: b.x, z: s }];
    let best = cands[0], bd = Infinity;
    for (const c of cands) { const d = Math.abs(c.x - b.x) + Math.abs(c.z - b.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // A settler walks in from the nearest edge and moves into a dwelling with room.
  _sendImmigrant() {
    const home = this.buildings.find(
      (b) => b.def.role === 'dwelling' && b.pop + b.incoming < b.cap
    );
    if (!home) return;
    home.incoming += 1;
    const female = Math.random() < 0.5;
    const person = { name: randomName(female), female, ...personFor('villager') };
    const tr = new Traveler(this.map, this._arrivalTile(home), { x: home.x, z: home.z }, {
      type: 'villager', speed: 2.4, person,
      onArrive: () => {
        home.incoming = Math.max(0, home.incoming - 1);
        if (home.pop < home.cap) { home.pop += 1; this.folk += 1; home.water = Math.max(home.water, HOUSE_CAP); } // settlers arrive with water
      },
    });
    this.walkers.push(tr);
    this.walkerGroup.add(tr.sprite);
  }

  // A hungry resident gives up and walks back out to the gate.
  _emigrate(home) {
    home.pop = Math.max(0, home.pop - 1);
    this.folk = Math.max(0, this.folk - 1);
    const female = Math.random() < 0.5;
    const person = { name: randomName(female), female, ...personFor('villager') };
    const tr = new Traveler(this.map, { x: home.x, z: home.z }, this._arrivalTile(home), { type: 'villager', speed: 2.4, person });
    this.walkers.push(tr);
    this.walkerGroup.add(tr.sprite);
  }

  // Farm → grain_carrier wanders roads, deposits its load in the first granary it passes.
  _sendGrain(farm) {
    const entry = entryRoadTile(this.map, farm);
    if (!entry) return;
    let load = farm.def.load;
    this._spawn(entry, {
      type: 'grain_carrier', label: 'G', steps: 26, speed: 2.4, source: farm,
      onTile: (x, z) => {
        if (load <= 0) return;
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'granary' && inst.stock < GRANARY_CAP) { // stores fill to a cap
            const add = Math.min(load, GRANARY_CAP - inst.stock);
            inst.stock += add; load -= add;
            if (load <= 0) break;
          }
        }
      },
    });
  }

  // Well → water_carrier wanders roads, refilling the dwellings it passes.
  _sendWater(well) {
    const entry = entryRoadTile(this.map, well);
    if (!entry) return;
    this._spawn(entry, {
      type: 'water_carrier', label: 'W', steps: 24, speed: 2.6, source: well,
      onTile: (x, z, w) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && inst.water < HOUSE_CAP) { inst.water = HOUSE_CAP; this._deliverFx(inst, w, 'water'); } // one visit fills the home (~10 days)
        }
      },
    });
  }

  // Culture venue → a culture-raiser wanders the roads, lifting the culture of the
  // dwellings it passes. Most send a druid; a venue can name its own walker via
  // def.cultureWalker (the hurling green sends villagers in the war colours).
  _sendCultureRaiser(src) {
    const cw = src.def.cultureWalker || {};
    const entry = entryRoadTile(this.map, src);
    if (!entry) return;
    this._spawn(entry, {
      type: cw.type || 'druid', personType: cw.persona || null, label: cw.label || 'D', steps: 26, speed: 2.2, source: src,
      tint: cw.war ? this.warTint : null,
      onTile: (x, z, w) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && inst.culture < HOUSE_CAP) { inst.culture = HOUSE_CAP; this._deliverFx(inst, w, 'culture'); }
        }
      },
    });
  }

  // Each festival, a feast hall pours a burst of revellers onto the roads — more
  // than its everyday pair — to carry the celebration through the streets.
  festivalRevels() {
    for (const b of this.buildings) {
      const n = b.def.festivalRevellers || 0;
      if (!n || !entryRoadTile(this.map, b) || this.folk <= 0) continue;
      for (let i = 0; i < n; i++) this._sendCultureRaiser(b);
    }
  }

  // A patron god, prayed to at a gallán, manifests at the stones and walks the
  // town's own roads — slowly, at a god's stately pace — blessing the homes it
  // passes: it stops before a house, faces it and streams coloured light at it,
  // then leaves it at the full of every good, held for a good while (blessedDays).
  // Returns roughly how many homes it means to bless (0 if there are none).
  blessDwellings(godArt, fromInst, { count = 3, days = 12, h = 3.6 } = {}) {
    const homes = this.buildings.filter((b) => b.def.role === 'dwelling' && b.pop > 0);
    if (!homes.length) return 0;
    const chip = makeWarriorChip(godArt, h);
    const entry = entryRoadTile(this.map, fromInst);
    if (!entry) {
      // The stone stands off the roads — the god cannot walk them. Bless the
      // nearest homes on the spot instead so the prayer is never wasted.
      const c0 = this._center(fromInst);
      homes.sort((a, b) => { const ca = this._center(a), cb = this._center(b); return Math.hypot(ca.x - c0.x, ca.z - c0.z) - Math.hypot(cb.x - c0.x, cb.z - c0.z); });
      for (const hme of homes.slice(0, count)) this._applyBlessing(hme, days);
      return Math.min(count, homes.length);
    }
    const w0 = this.map.tileToWorld(entry.x, entry.z);
    chip.position.set(w0.x, 0.05, w0.z);
    this.blessGroup.add(chip);
    this.blessings.push({ chip, days, need: count, blessed: new Set(),
      cur: { x: entry.x, z: entry.z }, next: null, prev: null, t: 0, steps: 90,
      mode: 'walk', target: null, blessT: 0, emitT: 0, hold: 0 });
    this._blessPickNext(this.blessings[this.blessings.length - 1]);
    return Math.min(count, homes.length);
  }
  _applyBlessing(home, days) {
    if (!home || !home.sprite) return;
    home.blessedDays = days; home.food = HOUSE_CAP; home.water = HOUSE_CAP; home.culture = HOUSE_CAP;
    const p = home.sprite.position;
    this._floatie(p.x, 2.1, p.z, 'food', { sz: 0.3, vy: 1.1, life: 1.3, over: true });
    this._floatie(p.x + 0.35, 2.0, p.z, 'water', { sz: 0.3, vy: 1.1, life: 1.4, over: true });
    this._floatie(p.x - 0.35, 2.0, p.z, 'culture', { sz: 0.3, vy: 1.1, life: 1.5, over: true });
  }
  _blessPickNext(bl) {
    let opts = roadNeighbors(this.map, bl.cur.x, bl.cur.z);
    const open = opts.filter((n) => { const t = this.map.get(n.x, n.z); return t && !t.blocked; });
    if (open.length) opts = open;
    const fwd = bl.prev ? opts.filter((n) => !(n.x === bl.prev.x && n.z === bl.prev.z)) : opts;
    const pool = fwd.length ? fwd : opts;
    bl.next = pool.length ? pool[(Math.random() * pool.length) | 0] : null;
    if (bl.next && bl.chip.faceWorld) bl.chip.faceWorld(bl.next.x - bl.cur.x, bl.next.z - bl.cur.z);
  }
  _blessColour(i) { return ['food', 'water', 'culture'][i % 3]; }
  _updateBlessings(dt) {
    const BLESS_SPEED = 0.7; // tiles/sec — a god's slow, deliberate procession
    for (let i = this.blessings.length - 1; i >= 0; i--) {
      const bl = this.blessings[i], chip = bl.chip;
      if (bl.mode === 'bless') {
        const home = bl.target;
        if (!home || !home.sprite || home.dead) { bl.mode = 'walk'; this._blessPickNext(bl); continue; }
        const tp = home.sprite.position;
        if (chip.faceWorld) chip.faceWorld(tp.x - chip.position.x, tp.z - chip.position.z);
        if (chip.animate) chip.animate(dt, false);
        // Stream coloured light from the god's hands at the house.
        bl.emitT -= dt;
        if (bl.emitT <= 0) {
          bl.emitT = 0.07;
          const dx = tp.x - chip.position.x, dz = tp.z - chip.position.z, d = Math.hypot(dx, dz) || 1;
          const kind = this._blessColour((bl._emitN = (bl._emitN || 0) + 1));
          this._floatie(chip.position.x, 1.7, chip.position.z, kind,
            { sz: 0.16, vx: (dx / d) * (d / 0.5), vy: 0.5, vz: (dz / d) * (d / 0.5), life: 0.55, over: true });
        }
        bl.blessT -= dt;
        if (bl.blessT <= 0) { this._applyBlessing(home, bl.days); bl.blessed.add(home); bl.need -= 1; bl.target = null; bl.mode = 'walk'; this._blessPickNext(bl); }
        continue;
      }
      if (bl.mode === 'leave') {
        bl.hold += dt;
        if (chip.material) { chip.material.transparent = true; chip.material.opacity = Math.max(0, 1 - bl.hold * 1.2); }
        if (chip.animate) chip.animate(dt, false);
        if (bl.hold >= 1.2) { this.blessGroup.remove(chip); this.blessings.splice(i, 1); }
        continue;
      }
      // mode 'walk'
      if (bl.need <= 0 || bl.steps <= 0 || !bl.next) { bl.mode = 'leave'; continue; }
      const wa = this.map.tileToWorld(bl.cur.x, bl.cur.z), wb = this.map.tileToWorld(bl.next.x, bl.next.z);
      bl.t += dt * BLESS_SPEED;
      const k = Math.min(bl.t, 1);
      chip.position.set(wa.x + (wb.x - wa.x) * k, 0.05, wa.z + (wb.z - wa.z) * k);
      if (chip.animate) chip.animate(dt, true);
      if (bl.t >= 1) {
        bl.t = 0; bl.prev = bl.cur; bl.cur = bl.next; bl.steps -= 1;
        // Reached a tile — is there an unblessed home to bless beside it?
        const home = adjacentBuildings(this.map, bl.cur.x, bl.cur.z)
          .find((inst) => inst.def.role === 'dwelling' && inst.pop > 0 && !bl.blessed.has(inst));
        if (home && bl.need > 0) { bl.mode = 'bless'; bl.target = home; bl.blessT = 2.4; bl.emitT = 0; }
        else this._blessPickNext(bl);
      }
    }
  }

  // Deaglán the path-maker and his dog Finn come out when you lay one of his
  // roads: he walks its length, stops once to dig it in (his shovel), and Finn
  // races up and down the whole length testing it — then the two slip away.
  roadCrew(path) {
    if (!path || path.length < 2) return;
    const tiles = path.map((p) => ({ x: p.x, z: p.z }));
    const w0 = this.map.tileToWorld(tiles[0].x, tiles[0].z);
    const deagWalk = makeWalkerChip('deaglan');
    const deagDig = makeWalkerChip('deaglan_dig'); deagDig.visible = false;
    const finn = makeWalkerChip('finn_run');
    for (const c of [deagWalk, deagDig, finn]) { c.position.set(w0.x, 0.05, w0.z); this.crewGroup.add(c); }
    this.crews.push({ tiles, deagWalk, deagDig, finn, di: 0, dt: 0,
      digAt: 1 + ((Math.random() * Math.max(1, tiles.length - 1)) | 0), dug: false, digging: false, digT: 0,
      fi: 0, fdir: 1, ft: 0, leaving: false, fade: 0 });
  }
  _crewMove(chip, a, b, k) {
    const wa = this.map.tileToWorld(a.x, a.z), wb = this.map.tileToWorld(b.x, b.z);
    chip.position.set(wa.x + (wb.x - wa.x) * k, 0.05, wa.z + (wb.z - wa.z) * k);
    if (chip.faceWorld && (b.x !== a.x || b.z !== a.z)) chip.faceWorld(b.x - a.x, b.z - a.z);
  }
  _updateCrews(dt) {
    const DEAG_SPEED = 2.0, FINN_SPEED = 4.5;
    for (let i = this.crews.length - 1; i >= 0; i--) {
      const cr = this.crews[i], T = cr.tiles, last = T.length - 1;
      // The dog runs the whole length, up and down, always at a run.
      cr.ft += dt * FINN_SPEED;
      while (cr.ft >= 1) { cr.ft -= 1; cr.fi += cr.fdir; if (cr.fi >= last) { cr.fi = last; cr.fdir = -1; } else if (cr.fi <= 0) { cr.fi = 0; cr.fdir = 1; } }
      this._crewMove(cr.finn, T[cr.fi], T[Math.max(0, Math.min(last, cr.fi + cr.fdir))], cr.ft);
      if (cr.finn.animate) cr.finn.animate(dt, true);
      cr.deagWalk.visible = !cr.digging; cr.deagDig.visible = cr.digging;
      if (cr.leaving) {
        cr.fade += dt;
        const o = Math.max(0, 1 - cr.fade * 1.3);
        for (const c of [cr.deagWalk, cr.deagDig, cr.finn]) if (c.material) { c.material.transparent = true; c.material.opacity = o; }
        if (cr.deagWalk.animate) cr.deagWalk.animate(dt, true);
        if (cr.fade >= 0.85) { for (const c of [cr.deagWalk, cr.deagDig, cr.finn]) this.crewGroup.remove(c); this.crews.splice(i, 1); }
        continue;
      }
      if (cr.digging) {
        const wt = this.map.tileToWorld(T[cr.di].x, T[cr.di].z);
        cr.deagDig.position.set(wt.x, 0.05, wt.z);
        if (cr.deagDig.animate) cr.deagDig.animate(dt, true);
        cr.digT -= dt;
        if (cr.digT <= 0) { cr.digging = false; cr.dug = true; }
        continue;
      }
      if (cr.di >= last) { cr.leaving = true; continue; }
      cr.dt += dt * DEAG_SPEED;
      this._crewMove(cr.deagWalk, T[cr.di], T[cr.di + 1], Math.min(cr.dt, 1));
      if (cr.deagWalk.animate) cr.deagWalk.animate(dt, true);
      if (cr.dt >= 1) { cr.dt = 0; cr.di += 1; if (!cr.dug && cr.di === cr.digAt) { cr.digging = true; cr.digT = 1.6; } }
    }
  }

  // While a warrior keeps vigil at a gallán, a guard patrols a slow ring around
  // the stone. The patrol chip lives as a child of the stone's own chip, so it
  // comes and goes with the warden and is cleaned up if the stone is razed.
  _updateVigils(dt) {
    for (const b of this.buildings) {
      if (b.def.role !== 'gallan') continue;
      if (b.warden && !b._vigil) {
        const chip = makeWalkerChip('vigil');
        b.sprite.add(chip);
        const r = 1.15 * this.map.tile, pts = [];
        for (let a = 0; a < 6; a++) pts.push({ x: Math.cos((a / 6) * Math.PI * 2) * r, z: Math.sin((a / 6) * Math.PI * 2) * r * 0.7 });
        b._vigil = { chip, pts, i: 0, t: 0 };
      } else if (!b.warden && b._vigil) {
        b.sprite.remove(b._vigil.chip); b._vigil = null;
      }
      if (b._vigil) {
        const v = b._vigil, a = v.pts[v.i], nb = v.pts[(v.i + 1) % v.pts.length];
        v.t += dt * 0.5; // a slow, watchful round
        const k = Math.min(v.t, 1);
        v.chip.position.set(a.x + (nb.x - a.x) * k, 0.05, a.z + (nb.z - a.z) * k);
        if (v.chip.faceWorld) v.chip.faceWorld(nb.x - a.x, nb.z - a.z);
        if (v.chip.animate) v.chip.animate(dt, true);
        if (v.t >= 1) { v.t = 0; v.i = (v.i + 1) % v.pts.length; }
      }
    }
  }

  // Altar → druid wanders roads, raising the culture of the dwellings it passes.
  _sendDruid(altar) {
    const entry = entryRoadTile(this.map, altar);
    if (!entry) return;
    this._spawn(entry, {
      type: 'druid', label: 'D', steps: 26, speed: 2.2, source: altar,
      onTile: (x, z, w) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && inst.culture < HOUSE_CAP) { inst.culture = HOUSE_CAP; this._deliverFx(inst, w, 'culture'); } // one visit lifts the home (~5 days)
        }
      },
    });
  }

  // Market pulls grain from any road-connected granary into its own stock.
  _restock(market) {
    if (market.stock >= MARKET_CAP) return;
    const mEntry = entryRoadTile(this.map, market);
    if (!mEntry) return;
    for (const g of this.buildings) {
      if (g.def.role !== 'granary' || g.stock <= 0) continue;
      const gEntry = entryRoadTile(this.map, g);
      if (gEntry && roadConnected(this.map, mEntry, gEntry)) {
        const take = Math.min(g.stock, MARKET_CAP - market.stock);
        g.stock -= take;
        market.stock += take;
        if (market.stock >= MARKET_CAP) break;
      }
    }
  }

  // Market → market_trader wanders roads, feeding dwellings it passes.
  _sendTrader(market) {
    const entry = entryRoadTile(this.map, market);
    if (!entry) return;
    this._spawn(entry, {
      type: 'market_trader', label: 'M', steps: 24, speed: 2.6, source: market,
      onTile: (x, z, w) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && market.stock > 0 && inst.food < HOUSE_CAP) {
            inst.food = HOUSE_CAP; // fill the larder in one visit (~10 days)
            market.stock -= 1;
            this._deliverFx(inst, w, 'food');
          }
        }
      },
    });
  }

  // One floating chip — a small soft coloured bead. `over` draws it above the smoke.
  _floatie(x, y, z, kind, { sz = 0.1, vx = 0, vy = 1.0, vz = 0, life = 1.2, over = false } = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PIP_TEX, color: PIP_COLOR[kind] || 0xffffff,
      transparent: true, opacity: 1, depthTest: !over, depthWrite: false }));
    if (over) s.renderOrder = 20; // drawn over the smoke, never occluded by it
    s.center.set(0.5, 0.5); s.scale.set(sz, sz, 1);
    s.position.set(x, y, z);
    this.floatieGroup.add(s);
    this._floaties.push({ s, age: 0, life, sz, vx, vy, vz });
  }

  // A delivery to a dwelling: a small bead lifts off the home, and a matching
  // scatter of tiny chips puffs from the walker who carried it — so it's clear
  // who brought what. Throttled per home (a busy round drips, not bursts).
  _deliverFx(inst, walker, kind) {
    if (!inst.sprite || (inst._popCd || 0) > 0) return;
    inst._popCd = 0.55;
    const p = inst.sprite.position, a = Math.random() * Math.PI * 2;
    this._floatie(p.x + Math.cos(a) * 0.6, 1.9, p.z + Math.sin(a) * 0.6, kind, { sz: 0.28, vy: 1.0, life: 1.2, over: true });
    if (walker && walker.sprite) {
      const w = walker.sprite.position;
      for (let i = 0; i < 3; i++) {
        const b = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.5;
        this._floatie(w.x, 0.9 + Math.random() * 0.3, w.z, kind, { sz: 0.2, vx: Math.cos(b) * r, vz: Math.sin(b) * r, vy: 0.35, life: 0.7, over: true });
      }
    }
  }

  // Ambient particle effects — real time, so they drift even while paused.
  updateFx(dt) {
    for (const b of this.buildings) { if (b.fx) b.fx.update(dt); if (b.fx2) b.fx2.update(dt); if (b._popCd > 0) b._popCd -= dt; }
    for (let i = this._floaties.length - 1; i >= 0; i--) {
      const f = this._floaties[i]; f.age += dt;
      const t = f.age / f.life;
      f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt; f.s.position.z += f.vz * dt;
      f.s.material.opacity = 1 - t * t; // hold bright, then fade late so the colour reads
      const pop = 1 + 0.25 * Math.sin(Math.min(1, t * 4) * Math.PI / 2); // a small pop as it appears
      f.s.scale.set(f.sz * pop, f.sz * pop, 1);
      if (t >= 1) { this.floatieGroup.remove(f.s); f.s.material.dispose(); this._floaties.splice(i, 1); }
    }
    if (this.menace) this._moveMenaceCreature(dt);
    if (this.blessings.length) this._updateBlessings(dt);
    if (this.crews.length) this._updateCrews(dt);
    this._updateVigils(dt);
  }

  // --- Animation, one call per frame (dt already scaled by game speed) ---
  update(dt) {
    for (const w of this.walkers) w.update(dt);
    const alive = [];
    for (const w of this.walkers) {
      if (w.done) { this.walkerGroup.remove(w.sprite); w.dispose(); }
      else alive.push(w);
    }
    this.walkers = alive;
  }
}
