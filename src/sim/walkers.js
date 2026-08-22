import { makeWalkerChip } from '../render/chips.js';
import { roadNeighbors } from './roads.js';

// A walker random-walks the road network for a fixed number of steps, running
// its onTile callback as it enters each tile, then finishes. This one mechanic
// carries every service in the game.
export class Walker {
  constructor(map, spawn, { type, label, steps = 20, speed = 2.5, onTile } = {}) {
    this.map = map;
    this.steps = steps;
    this.speed = speed;
    this.onTile = onTile;
    this.cur = { x: spawn.x, z: spawn.z };
    this.next = null;
    this.t = 0;
    this.done = false;

    this.sprite = makeWalkerChip(type);
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
    this.t += dt * this.speed;
    const k = Math.min(this.t, 1);
    this._moveSpriteTo(this.cur, this.next, k);
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
    this.sprite.traverse?.((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    if (this.sprite.geometry) this.sprite.geometry.dispose();
    if (this.sprite.material) this.sprite.material.dispose();
  }
}
