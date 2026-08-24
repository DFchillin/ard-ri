import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';
import { makeBuildingChip } from '../render/chips.js';
import { Walker } from './walkers.js';
import { entryRoadTile, adjacentBuildings, roadConnected } from './roads.js';
import { randomName } from '../data/names.js';
import { personFor } from '../data/phrases.js';

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

    const inst = { key, def, x: f.x, z: f.z, w: f.w, h: f.h, stock: 0, food: 0, timer: 0 };
    this.map.place(f.x, f.z, f.w, f.h, inst);

    const chip = makeBuildingChip(def.role, f.w, f.h, this.map.tile);
    const c = this._center(f);
    chip.position.set(c.x, 0, c.z);
    this.buildingGroup.add(chip);
    inst.sprite = chip;

    this.buildings.push(inst);
    this.silver -= def.cost;
    if (def.folk) this.folk += def.folk;
    return true;
  }

  _spawn(entry, opts) {
    const person = { name: randomName(), ...personFor(opts.type) };
    const w = new Walker(this.map, entry, { ...opts, person });
    this.walkers.push(w);
    this.walkerGroup.add(w.sprite);
  }

  // --- Economy, one call per sim tick ---
  tick() {
    for (const b of this.buildings) this._tickBuilding(b);
    for (const o of this.objectives) if (!o.done && o.check(this)) o.done = true;
  }

  _tickBuilding(b) {
    switch (b.def.role) {
      case 'farm': {
        if (++b.timer >= b.def.rate) { b.timer = 0; this._sendGrain(b); }
        break;
      }
      case 'market': {
        this._restock(b);
        if (b.stock > 0 && ++b.timer >= 3) { b.timer = 0; this._sendTrader(b); }
        break;
      }
      case 'dwelling': {
        if (b.food > 0) b.food -= 1;
        break;
      }
    }
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
