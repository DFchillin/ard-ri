import { makeWalkerChip } from '../render/chips.js?v=17';
import { roadNeighbors } from './roads.js?v=17';

// A walker random-walks the road network for a fixed number of steps, running
// its onTile callback as it enters each tile, then finishes. This one mechanic
// carries every service in the game.
export class Walker {
  constructor(map, spawn, { type, label, steps = 20, speed = 2.5, onTile, person } = {}) {
    this.map = map;
    this.steps = steps;
    this.speed = speed;
    this.onTile = onTile;
    this.person = person || null;
    this.cur = { x: spawn.x, z: spawn.z };
    this.next = null;
    this.t = 0;
    this.done = false;

    this.sprite = makeWalkerChip(type);
    this.sprite.userData = { kind: 'walker', person: this.person, type };
    this._moveSpriteTo(this.cur, this.cur, 0);
    if (onTile) onTile(this.cur.x, this.cur.z);
    this._pickNext(null);
  }

  _moveSpriteTo(a, b, k) {
    const wa = this.map.tileToWorld(a.x, a.z);
    const wb = this.map.tileToWorld(b.x, b.z);
    this.sprite.position.set(wa.x + (wb.x - wa.x) * k, 0.05, wa.z + (wb.z - wa.z) * k);
  }

  _pickNext(prev) {
    if (this.steps <= 0) { this.next = null; return; }
    let opts = roadNeighbors(this.map, this.cur.x, this.cur.z);
    const forward = prev ? opts.filter((n) => !(n.x === prev.x && n.z === prev.z)) : opts;
    const pool = forward.length ? forward : opts;
    if (!pool.length) { this.next = null; return; }
    this.next = pool[(Math.random() * pool.length) | 0];
    if (this.sprite.setHeading) {
      const wa = this.map.tileToWorld(this.cur.x, this.cur.z);
      const wb = this.map.tileToWorld(this.next.x, this.next.z);
      this.sprite.setHeading(Math.atan2(-(wb.z - wa.z), wb.x - wa.x));
    }
  }

  update(dt) {
    if (this.done) return;
    if (!this.next) { this.done = true; return; }
    this.age = (this.age || 0) + dt;
    this.t += dt * this.speed;
    const k = Math.min(this.t, 1);
    this._moveSpriteTo(this.cur, this.next, k);
    this.sprite.position.y = 0.05 + Math.abs(Math.sin(this.age * 7)) * 0.16; // bob
    if (this.t >= 1) {
      this.t -= 1;
      const prev = this.cur;
      this.cur = this.next;
      this.steps -= 1;
      if (this.onTile) this.onTile(this.cur.x, this.cur.z);
      this._pickNext(prev);
    }
  }

  dispose() {
    disposeSprite(this.sprite);
  }
}

function disposeSprite(sprite) {
  sprite.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  if (sprite.geometry) sprite.geometry.dispose();
  if (sprite.material) sprite.material.dispose();
}

// A traveller moves in a straight line from one tile to another, ignoring roads
// — used for settlers walking in from the map entrance into their new dwelling.
export class Traveler {
  constructor(map, startTile, targetTile, { type = 'villager', speed = 2.2, onArrive, person } = {}) {
    this.map = map;
    this.speed = speed;
    this.onArrive = onArrive;
    this.person = person || null;
    this.done = false;
    this.t = 0;
    this.age = 0;
    this.a = map.tileToWorld(startTile.x, startTile.z);
    this.b = map.tileToWorld(targetTile.x, targetTile.z);
    this.dist = Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z) || 1;
    this.sprite = makeWalkerChip(type);
    this.sprite.userData = { kind: 'walker', person: this.person, type };
    this.sprite.position.set(this.a.x, 0.05, this.a.z);
  }

  update(dt) {
    if (this.done) return;
    this.age += dt;
    this.t += (dt * this.speed) / this.dist;
    const k = Math.min(this.t, 1);
    this.sprite.position.set(
      this.a.x + (this.b.x - this.a.x) * k,
      0.05 + Math.abs(Math.sin(this.age * 7)) * 0.16,
      this.a.z + (this.b.z - this.a.z) * k
    );
    if (this.t >= 1) { this.done = true; if (this.onArrive) this.onArrive(); }
  }

  dispose() { disposeSprite(this.sprite); }
}
