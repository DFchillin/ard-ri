import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js?v=CBUST';
import { makeBuildingChip, makeAlertMarker, makeInspectDot, makeCowToken, makeMenaceCreature, setChipActive, setChipState } from '../render/chips.js?v=CBUST';
import { tex, spriteFrom } from '../render/assets.js?v=CBUST';
import { emitterFor, Emitter } from '../render/effects.js?v=CBUST';

const FX_TOP = { dwelling: 1.15, farm: 0.7, market: 1.15, homestead: 1.6 }; // where hearth-smoke leaves the roof — tuned to the ~1.25-tile-tall building art
import { Walker, Traveler } from './walkers.js?v=CBUST';

// A soft round pip that floats up from a building when a walker delivers to it,
// so the invisible food/water/culture transfer can be seen. Colour = what arrived.
const PIP_COLOR = { food: 0xe8c86b, water: 0x6fb0e0, culture: 0xb07ad0 };
const PIP_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(16, 16, 15, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); return t;
})();
import { entryRoadTile, adjacentBuildings, roadConnected } from './roads.js?v=CBUST';
import { randomName } from '../data/names.js?v=CBUST';
import { personFor } from '../data/phrases.js?v=CBUST';

const MARKET_CAP = 12;
const HOUSE_CAP = 10;
const RENT_PER_HEAD = 1;   // silver per content head per day
const DISTRESS_LEAVE = 18; // econ ticks with NO food AND NO water before a family leaves
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
    scene.add(this.buildingGroup, this.walkerGroup, this.menaceGroup, this.floatieGroup);
    this._floaties = [];
    this.menace = null;

    this.buildings = [];
    this.walkers = [];
    this.silver = 200;
    this.folk = 0;
    this.cattle = 40;
    this.broke = false;
    this._immTimer = 0;
    this.entrance = { x: 0, z: Math.floor(map.size / 2) }; // settlers arrive here

    const ew = map.tileToWorld(this.entrance.x, this.entrance.z);
    const gate = spriteFrom(tex('assets/props/gate.png'), 1.2);
    gate.position.set(ew.x, 0, ew.z);
    scene.add(gate);

    this.objectives = []; // set per-level by main via setObjectives()
  }

  showInspectDots(on) { this._inspectDots = on; for (const b of this.buildings) if (b.dot) b.dot.visible = on; }

  // --- The menace: a blighted, unbuildable patrol zone with a Fomorian giant ---
  spawnMenace(x, z, w, h) {
    this.clearMenace();
    x = Math.max(0, Math.min(x, this.map.size - w)); z = Math.max(0, Math.min(z, this.map.size - h));
    this.menace = { x, z, w, h, t: 0 };
    this._markMenace(true);
    this._razeInMenace();
    this._drawMenaceZone();
    const cre = makeMenaceCreature(); this.menace.creature = cre; this.menaceGroup.add(cre);
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
    m.t += dt * 0.5;
    const ts = this.map.tile;
    const px = (m.x + m.w / 2 + Math.sin(m.t) * (m.w / 2 - 0.6)) * ts - this.map.half;
    const pz = (m.z + m.h / 2 + Math.cos(m.t * 0.7) * (m.h / 2 - 0.6)) * ts - this.map.half;
    m.creature.position.set(px, 0.1, pz);
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
  settleDay({ festival = false } = {}) {
    const rent = this.dailyRent(festival);
    const wages = this.dailyWages();
    this.silver += rent;
    if (this.silver >= wages) { this.silver -= wages; this.broke = false; }
    else { this.silver = 0; this.broke = wages > 0; } // payroll unmet — public folk go unpaid
    return { rent, wages, net: rent - wages, festival, broke: this.broke };
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
      pop: 0, cap: def.folk || 0, incoming: 0, distress: 0, active: false,
      grown: 0, ripe: false, harvestsLeft: 0, connected: false, herd: def.role === 'homestead' ? 10 : 0,
      warden: null, // a gallán may have a warrior dedicated to stand vigil (raises muster favour)
      growMax: FARM_GROW, harvests: FARM_HARVESTS, yieldTotal: (def.load || 0) * FARM_HARVESTS }; // for the field inspect readout
    this.map.place(f.x, f.z, f.w, f.h, inst);

    const chip = makeBuildingChip(def.role, f.w, f.h, this.map.tile, { art: def.art, states: def.states, scale: def.scale });
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
      grown: b.grown, ripe: b.ripe, harvestsLeft: b.harvestsLeft, warden: b.warden || null }));
    const menace = this.menace ? { x: this.menace.x, z: this.menace.z, w: this.menace.w, h: this.menace.h } : null;
    return { silver: this.silver, cattle: this.cattle, folk: this.folk, buildings, roads, cros, menace };
  }
  load(snap) {
    if (!snap) return;
    this.clearMenace();
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
        grown: b.grown || 0, ripe: !!b.ripe, harvestsLeft: b.harvestsLeft || 0, warden: b.warden || null });
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
    const person = { name: randomName(female), female, ...personFor(opts.type) };
    const w = new Walker(this.map, entry, { ...opts, person });
    w.source = opts.source || null;
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
      case 'dwelling': // bare → occupied → fed → cultured-and-full
        if (b.pop <= 0) return 0;
        return Math.min(1, 0.34 + (b.pop / Math.max(1, b.cap)) * 0.22 + (b.food / HOUSE_CAP) * 0.22 + (b.culture / HOUSE_CAP) * 0.22);
      case 'farm': // growing through the season, then the ripe harvest
        return b.ripe ? 1 : Math.min(0.66, (b.grown / FARM_GROW) * 0.66);
      case 'market': // busier the more it holds
        return b.connected ? Math.min(1, 0.34 + (b.stock / MARKET_CAP) * 0.66) : 0;
      case 'gallan': // a bare stone → tended ground → a warden keeps vigil and the stone is lit
        return b.warden ? 1 : 0.3;
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
        // spare labour, and at most 2 carriers on the roads at once.
        if (b.connected && this.folk >= FARM_MIN_FOLK && this._labour > 0 &&
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
      case 'dwelling': {
        if (b.food > 0) b.food -= 1;
        if (b.water > 0) b.water -= 1;
        if (b.culture > 0) b.culture -= 1; // culture wanes without a druid's visits (a bonus, never a cause to leave)
        if (b.food <= 0 && b.water <= 0) { // no food AND no water — a family in distress
          b.distress += 1;
          if (b.distress >= DISTRESS_LEAVE && b.pop > 0) { b.distress = 0; this._emigrate(b); }
        } else b.distress = 0;
        break;
      }
    }
  }

  // A settler walks in from the entrance and moves into a dwelling with room.
  _sendImmigrant() {
    const home = this.buildings.find(
      (b) => b.def.role === 'dwelling' && b.pop + b.incoming < b.cap
    );
    if (!home) return;
    home.incoming += 1;
    const female = Math.random() < 0.5;
    const person = { name: randomName(female), female, ...personFor('villager') };
    const tr = new Traveler(this.map, this.entrance, { x: home.x, z: home.z }, {
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
    const tr = new Traveler(this.map, { x: home.x, z: home.z }, this.entrance, { type: 'villager', speed: 2.4, person });
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
      onTile: (x, z) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && inst.water < HOUSE_CAP) { inst.water = Math.min(HOUSE_CAP, inst.water + 5); this._pop(inst, 'water'); }
        }
      },
    });
  }

  // Altar → druid wanders roads, raising the culture of the dwellings it passes.
  _sendDruid(altar) {
    const entry = entryRoadTile(this.map, altar);
    if (!entry) return;
    this._spawn(entry, {
      type: 'druid', label: 'D', steps: 26, speed: 2.2, source: altar,
      onTile: (x, z) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && inst.culture < HOUSE_CAP) { inst.culture = Math.min(HOUSE_CAP, inst.culture + 5); this._pop(inst, 'culture'); }
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
      onTile: (x, z) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && market.stock > 0 && inst.food < HOUSE_CAP) {
            inst.food = Math.min(HOUSE_CAP, inst.food + 5);
            market.stock -= 1;
            this._pop(inst, 'food');
          }
        }
      },
    });
  }

  // A pip floats up from a building when a walker just delivered to it. Throttled
  // per building (a busy round shows a steady drip, not a burst).
  _pop(inst, kind) {
    if (!inst.sprite || (inst._popCd || 0) > 0) return;
    inst._popCd = 0.55;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PIP_TEX, color: PIP_COLOR[kind] || 0xffffff,
      transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.center.set(0.5, 0.5); s.scale.set(0.4, 0.4, 1);
    const p = inst.sprite.position;
    s.position.set(p.x + (Math.random() - 0.5) * 0.4, 1.2, p.z + (Math.random() - 0.5) * 0.4);
    this.floatieGroup.add(s);
    this._floaties.push({ s, age: 0, life: 1.1 });
  }

  // Ambient particle effects — real time, so they drift even while paused.
  updateFx(dt) {
    for (const b of this.buildings) { if (b.fx) b.fx.update(dt); if (b.fx2) b.fx2.update(dt); if (b._popCd > 0) b._popCd -= dt; }
    for (let i = this._floaties.length - 1; i >= 0; i--) {
      const f = this._floaties[i]; f.age += dt;
      const t = f.age / f.life;
      f.s.position.y += dt * 0.9;
      f.s.material.opacity = 0.9 * (1 - t);
      if (t >= 1) { this.floatieGroup.remove(f.s); f.s.material.dispose(); this._floaties.splice(i, 1); }
    }
    if (this.menace) this._moveMenaceCreature(dt);
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
