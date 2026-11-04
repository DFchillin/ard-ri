import * as THREE from 'three';
import { T } from '../sim/tilemap.js?v=CBUST';
import { tex, spriteFrom } from './assets.js?v=CBUST';
import { makeCrosMarker } from './chips.js?v=CBUST';

const TERR_FILE = {
  [T.GRASS]: 'pasture', [T.WATER]: 'water', [T.BOG]: 'bog',
  [T.ROCK]: 'rock', [T.WOODS]: 'pasture', [T.SAND]: 'shore',
};

export class WorldView {
  constructor(scene, map) {
    this.map = map;
    this.ts = map.tile;
    this.half = map.half; this.halfX = map.halfX; this.halfZ = map.halfZ;

    this.scene = scene;
    this.terrainGroup = this._buildTerrain(); scene.add(this.terrainGroup);
    this.sceneryGroup = this._buildScenery(); scene.add(this.sceneryGroup);

    this.roadGroup = new THREE.Group();
    scene.add(this.roadGroup);
    this.rebuildRoads();

    this.crosGroup = new THREE.Group();
    scene.add(this.crosGroup);

    const gs = Math.max(map.w, map.h);
    const grid = new THREE.GridHelper(gs * this.ts, gs, 0x20301c, 0x33492a);
    grid.position.y = 0.03;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid); this._grid = grid;

    // Invisible flat plane for placement raycasts.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry((gs + 4) * this.ts, (gs + 4) * this.ts),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
    this.pickPlane = plane;
  }

  // Remove every object this view added to the scene (for swapping in a map of a
  // different shape). Disposes geometry so nothing leaks.
  teardown() {
    for (const o of [this.terrainGroup, this.sceneryGroup, this.roadGroup, this.crosGroup, this._grid, this.pickPlane]) {
      if (!o) continue;
      this.scene.remove(o);
      if (o.traverse) o.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
      if (o.geometry) o.geometry.dispose();
    }
  }

  // Rebuild the ground and scenery after the map's terrain changes (e.g. a
  // fresh battlefield). Disposes the old meshes so the scene doesn't leak.
  rebuildTerrain() {
    for (const grp of [this.terrainGroup, this.sceneryGroup]) {
      this.scene.remove(grp);
      grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.terrainGroup = this._buildTerrain(); this.scene.add(this.terrainGroup);
    this.sceneryGroup = this._buildScenery(); this.scene.add(this.sceneryGroup);
  }

  _buildTerrain() {
    const { map, ts, halfX, halfZ } = this;
    // One textured mesh per terrain type; each tile samples the full texture. Each
    // tile's UVs are randomly rotated/flipped and tinted a touch, so a field of the
    // same texture reads as varied ground, not a repeated chessboard.
    const CORN = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const buckets = {};
    for (let z = 0; z < map.h; z++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, z).terrain;
        const b = (buckets[t] = buckets[t] || { pos: [], uv: [], col: [], idx: [], vi: 0 });
        const y = t === T.WATER ? -0.18 : 0;
        const wx = x * ts - halfX, wz = z * ts - halfZ;
        b.pos.push(wx, y, wz, wx + ts, y, wz, wx + ts, y, wz + ts, wx, y, wz + ts);
        const r = (Math.random() * 4) | 0, flip = Math.random() < 0.5; // 8 orientations
        for (let i = 0; i < 4; i++) { const c = CORN[(i + r) % 4]; b.uv.push(flip ? 1 - c[0] : c[0], c[1]); }
        const v = 0.9 + Math.random() * 0.16;          // brightness patchiness
        const cr = v * (1 + (Math.random() - 0.5) * 0.06), cg = v * (1 + (Math.random() - 0.5) * 0.05), cb = v * (1 + (Math.random() - 0.5) * 0.07);
        for (let i = 0; i < 4; i++) b.col.push(cr, cg, cb);
        b.idx.push(b.vi, b.vi + 2, b.vi + 1, b.vi, b.vi + 3, b.vi + 2);
        b.vi += 4;
      }
    }
    const group = new THREE.Group();
    for (const t in buckets) {
      const b = buckets[t];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      geo.computeVertexNormals();
      const file = TERR_FILE[t] || 'pasture';
      group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        map: tex('assets/terrain/tiles/' + file + '.png'), side: THREE.DoubleSide, vertexColors: true,
      })));
    }
    return group;
  }

  _buildScenery() {
    const { map } = this;
    const group = new THREE.Group();
    for (let z = 0; z < map.h; z++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, z).terrain;
        const file = t === T.WOODS ? 'tree' : t === T.ROCK ? 'rock' : null;
        if (!file) continue;
        const s = spriteFrom(tex('assets/terrain/' + file + '.png'));
        const w = map.tileToWorld(x, z);
        s.position.set(w.x, 0, w.z);
        group.add(s);
      }
    }
    return group;
  }

  rebuildRoads() {
    const { map, ts, halfX, halfZ } = this;
    this.roadGroup.clear();
    const pos = [], idx = [];
    // framing edges by whose route laid the tile: Deaglán (gold), Midir (violet), yours (teal)
    const buckets = { deaglan: [], midir: [], mine: [] };
    let vi = 0;
    const inset = ts * 0.06;
    const bi = ts * 0.03;
    for (let z = 0; z < map.h; z++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, z);
        if (!t.road || t.roadHidden) continue; // a Deaglán road stays hidden until he digs it in
        const wx = x * ts - halfX + inset, wz = z * ts - halfZ + inset;
        const s = ts - inset * 2;
        pos.push(wx, 0.04, wz, wx + s, 0.04, wz, wx + s, 0.04, wz + s, wx, 0.04, wz + s);
        idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
        vi += 4;
        if (t.roadKind) {
          const bx0 = x * ts - halfX + bi, bz0 = z * ts - halfZ + bi;
          const bx1 = (x + 1) * ts - halfX - bi, bz1 = (z + 1) * ts - halfZ - bi;
          const y = 0.05;
          const edges = [bx0, y, bz0, bx1, y, bz0,  bx1, y, bz0, bx1, y, bz1,
                         bx1, y, bz1, bx0, y, bz1,  bx0, y, bz1, bx0, y, bz0];
          if (buckets[t.roadKind]) buckets[t.roadKind].push(...edges);
        }
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    // Add ?dbg (or ?debug) to the URL to tint every road tile bright magenta —
    // handy for confirming at a glance whether a walker is actually on a road.
    const dbg = typeof location !== 'undefined' && /[?&](dbg|debug)\b/.test(location.search);
    this.roadGroup.add(
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: dbg ? 0xff2fbf : 0x8a7350, side: THREE.DoubleSide }))
    );
    this._addBorder(buckets.deaglan, 0xe8c96b);
    this._addBorder(buckets.midir, 0xb98cff);
    this._addBorder(buckets.mine, 0x54c8d8);
  }

  rebuildCros() {
    const { map, ts, halfX, halfZ } = this;
    this.crosGroup.clear();
    for (let z = 0; z < map.h; z++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, z);
        if (!t || !t.blocked) continue;
        const s = makeCrosMarker();
        s.position.set(x * ts - halfX + ts / 2, 0.06, z * ts - halfZ + ts / 2);
        this.crosGroup.add(s);
      }
    }
  }

  _addBorder(verts, color) {
    if (!verts.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.roadGroup.add(
      new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }))
    );
  }
}
