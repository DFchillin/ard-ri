import * as THREE from 'three';
import { T, TERRAIN_COLOR } from '../sim/tilemap.js?v=12';

function sceneryTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'tree') {
    g.fillStyle = '#3a2a18';
    g.fillRect(29, 40, 6, 18);
    g.fillStyle = '#2f5a2a';
    g.beginPath();
    g.arc(32, 30, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3c6e33';
    g.beginPath();
    g.arc(26, 26, 10, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#8a857b';
    g.beginPath();
    g.moveTo(16, 52); g.lineTo(24, 30); g.lineTo(40, 34); g.lineTo(50, 52);
    g.closePath(); g.fill();
    g.fillStyle = '#6f6a61';
    g.beginPath(); g.moveTo(24, 30); g.lineTo(40, 34); g.lineTo(30, 40); g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

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
    const pos = [], col = [], idx = [];
    let vi = 0;
    const c = new THREE.Color();
    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
        const t = map.get(x, z);
        const y = t.terrain === T.WATER ? -0.18 : 0;
        c.set(TERRAIN_COLOR[t.terrain]);
        const wx = x * ts - half, wz = z * ts - half;
        pos.push(wx, y, wz, wx + ts, y, wz, wx + ts, y, wz + ts, wx, y, wz + ts);
        for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
        idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
        vi += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
  }

  _buildScenery() {
    const { map } = this;
    const group = new THREE.Group();
    const treeTex = sceneryTexture('tree');
    const rockTex = sceneryTexture('rock');
    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
        const t = map.get(x, z);
        const tex = t.terrain === T.WOODS ? treeTex : t.terrain === T.ROCK ? rockTex : null;
        if (!tex) continue;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        s.center.set(0.5, 0);
        const w = map.tileToWorld(x, z);
        s.position.set(w.x, 0, w.z);
        s.scale.set(1.1, 1.1, 1.1);
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
