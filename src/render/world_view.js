import * as THREE from 'three';
import { T } from '../sim/tilemap.js?v=15';
import { tex, spriteFrom } from './assets.js?v=15';

const TERR_FILE = {
  [T.GRASS]: 'pasture', [T.WATER]: 'water', [T.BOG]: 'bog',
  [T.ROCK]: 'rock', [T.WOODS]: 'pasture', [T.SAND]: 'shore',
};

export class WorldView {
  constructor(scene, map) {
    this.map = map;
    this.ts = map.tile;
    this.half = map.half;

    scene.add(this._buildTerrain());
    scene.add(this._buildScenery());

    this.roadGroup = new THREE.Group();
    scene.add(this.roadGroup);
    this.rebuildRoads();

    const grid = new THREE.GridHelper(map.size * this.ts, map.size, 0x20301c, 0x33492a);
    grid.position.y = 0.03;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    // Invisible flat plane for placement raycasts.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(map.size * this.ts, map.size * this.ts),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
    this.pickPlane = plane;
  }

  _buildTerrain() {
    const { map, ts, half } = this;
    // One textured mesh per terrain type; each tile samples the full texture.
    const buckets = {};
    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
        const t = map.get(x, z).terrain;
        const b = (buckets[t] = buckets[t] || { pos: [], uv: [], idx: [], vi: 0 });
        const y = t === T.WATER ? -0.18 : 0;
        const wx = x * ts - half, wz = z * ts - half;
        b.pos.push(wx, y, wz, wx + ts, y, wz, wx + ts, y, wz + ts, wx, y, wz + ts);
        b.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
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
      geo.setIndex(b.idx);
      geo.computeVertexNormals();
      const file = TERR_FILE[t] || 'pasture';
      group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        map: tex('assets/terrain/tiles/' + file + '.png'), side: THREE.DoubleSide,
      })));
    }
    return group;
  }

  _buildScenery() {
    const { map } = this;
    const group = new THREE.Group();
    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
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
    const { map, ts, half } = this;
    this.roadGroup.clear();
    const pos = [], idx = [];
    // framing edges by whose route laid the tile: Deaglán (gold), Midir (violet), yours (teal)
    const buckets = { deaglan: [], midir: [], mine: [] };
    let vi = 0;
    const inset = ts * 0.06;
    const bi = ts * 0.03;
    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
        const t = map.get(x, z);
        if (!t.road) continue;
        const wx = x * ts - half + inset, wz = z * ts - half + inset;
        const s = ts - inset * 2;
        pos.push(wx, 0.04, wz, wx + s, 0.04, wz, wx + s, 0.04, wz + s, wx, 0.04, wz + s);
        idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
        vi += 4;
        if (t.roadKind) {
          const bx0 = x * ts - half + bi, bz0 = z * ts - half + bi;
          const bx1 = (x + 1) * ts - half - bi, bz1 = (z + 1) * ts - half - bi;
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
    this.roadGroup.add(
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a7350, side: THREE.DoubleSide }))
    );
    this._addBorder(buckets.deaglan, 0xe8c96b);
    this._addBorder(buckets.midir, 0xb98cff);
    this._addBorder(buckets.mine, 0x54c8d8);
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
