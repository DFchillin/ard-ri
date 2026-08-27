import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js?v=9';
import { makeBuildingChip, makeAlertMarker } from '../render/chips.js?v=9';
import { Walker, Traveler } from './walkers.js?v=9';
import { entryRoadTile, adjacentBuildings, roadConnected } from './roads.js?v=9';
import { randomName } from '../data/names.js?v=9';
import { personFor } from '../data/phrases.js?v=9';

const MARKET_CAP = 12;
const HOUSE_CAP = 10;

// Owns the buildings, the economy tick, the walkers, and mission objectives.
export class Game {
  constructor(map, scene) {
    this.map = map;
    this.buildingGroup = new THREE.Group();
    this.walkerGroup = new THREE.Group();
    scene.add(this.buildingGroup, this.walkerGroup);

    this.buildings = [];
    this.walkers = [];
    this.silver = 200;
    this.folk = 0;
    this.cattle = 40;
    this._immTimer = 0;
    this.entrance = { x: 0, z: Math.floor(map.size / 2) }; // settlers arrive here

    const ew = map.tileToWorld(this.entrance.x, this.entrance.z);
    const gate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 1.6, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8c96b })
    );
    gate.position.set(ew.x, 0.8, ew.z);
    scene.add(gate);

    this.objectives = [
      { text: 'Build 4 dwellings', done: false, check: (g) => g.count('dwelling') >= 4 },
      { text: 'Sow a barley field', done: false, check: (g) => g.count('farm') >= 1 },
      { text: 'Store grain', done: false, check: (g) => g.anyStock('granary') },
      { text: 'Stock a market', done: false, check: (g) => g.anyStock('market') },
      { text: 'Feed a dwelling', done: false, check: (g) => g.buildings.some((b) => b.def.role === 'dwelling' && b.food > 0) },
    ];
  }

  count(role) { return this.buildings.filter((b) => b.def.role === role).length; }
  anyStock(role) { return this.buildings.some((b) => b.def.role === role && b.stock > 0); }

  // Half the folk are able workers — the rest are children and elders.
  workforce() { return Math.floor(this.folk * 0.5); }
  _activeWorkers() { return this.walkers.reduce((n, w) => n + (w instanceof Walker && !w.done ? 1 : 0), 0); }

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

    const inst = { key, def, x: f.x, z: f.z, w: f.w, h: f.h, stock: 0, food: 0, timer: 0,
      pop: 0, cap: def.folk || 0, incoming: 0 };
    this.map.place(f.x, f.z, f.w, f.h, inst);

    const chip = makeBuildingChip(def.role, f.w, f.h, this.map.tile);
    const c = this._center(f);
    chip.position.set(c.x, 0, c.z);
    const alert = makeAlertMarker();
    alert.position.set(0, 2.7, 0);
    alert.visible = false;
    chip.add(alert);
    inst.alert = alert;
    this.buildingGroup.add(chip);
    inst.sprite = chip;

    this.buildings.push(inst);
    this.silver -= def.cost;
    return true; // dwellings fill via immigrants, not instantly
  }

  // Remove a building (refund half) or a road at a tile.
  demolish(x, z) {
    const t = this.map.get(x, z);
    if (t && t.occupant) {
      const inst = t.occupant;
      for (let dz = 0; dz < inst.h; dz++)
        for (let dx = 0; dx < inst.w; dx++) {
          const tt = this.map.get(inst.x + dx, inst.z + dz);
          if (tt) tt.occupant = null;
        }
      this.buildingGroup.remove(inst.sprite);
      this.buildings = this.buildings.filter((b) => b !== inst);
      if (inst.pop) this.folk = Math.max(0, this.folk - inst.pop);
      this.silver += Math.floor(inst.def.cost / 2);
      return 'building';
    }
    if (t && t.road) { this.map.setRoad(x, z, false); return 'road'; }
    return null;
  }

  _spawn(entry, opts) {
    const person = { name: randomName(), ...personFor(opts.type) };
    const w = new Walker(this.map, entry, { ...opts, person });
    this.walkers.push(w);
    this.walkerGroup.add(w.sprite);
  }

  // --- Economy, one call per sim tick ---
  tick() {
    if (++this._immTimer >= 3) { this._immTimer = 0; this._sendImmigrant(); } // settlers move in
    this._labour = Math.max(0, this.workforce() - this._activeWorkers()); // spare hands this tick
    for (const b of this.buildings) {
      if (b.alert) b.alert.visible = !entryRoadTile(this.map, b); // flag buildings with no road
      this._tickBuilding(b);
    }
    for (const o of this.objectives) if (!o.done && o.check(this)) o.done = true;
  }

  _tickBuilding(b) {
    switch (b.def.role) {
      case 'farm': {
        // No workers until people live here, and never more workers than spare hands.
        if (this._labour > 0 && ++b.timer >= b.def.rate) { b.timer = 0; this._labour--; this._sendGrain(b); }
        break;
      }
      case 'market': {
        this._restock(b);
        if (this._labour > 0 && b.stock > 0 && ++b.timer >= 3) { b.timer = 0; this._labour--; this._sendTrader(b); }
        break;
      }
      case 'dwelling': {
        if (b.food > 0) b.food -= 1;
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
    const person = { name: randomName(), ...personFor('villager') };
    const tr = new Traveler(this.map, this.entrance, { x: home.x, z: home.z }, {
      type: 'villager', speed: 2.4, person,
      onArrive: () => {
        home.incoming = Math.max(0, home.incoming - 1);
        if (home.pop < home.cap) { home.pop += 1; this.folk += 1; }
      },
    });
    this.walkers.push(tr);
    this.walkerGroup.add(tr.sprite);
  }

  // Farm → grain_carrier wanders roads, deposits its load in the first granary it passes.
  _sendGrain(farm) {
    const entry = entryRoadTile(this.map, farm);
    if (!entry) return;
    let load = farm.def.load;
    this._spawn(entry, {
      type: 'grain_carrier', label: 'G', steps: 26, speed: 2.4,
      onTile: (x, z) => {
        if (load <= 0) return;
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'granary') { inst.stock += load; load = 0; break; }
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
      type: 'market_trader', label: 'M', steps: 24, speed: 2.6,
      onTile: (x, z) => {
        for (const inst of adjacentBuildings(this.map, x, z)) {
          if (inst.def.role === 'dwelling' && market.stock > 0 && inst.food < HOUSE_CAP) {
            inst.food = Math.min(HOUSE_CAP, inst.food + 5);
            market.stock -= 1;
          }
        }
      },
    });
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
