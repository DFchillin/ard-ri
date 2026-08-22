// The tile map is the source of truth. The 3D world is a view over this.
export const T = { GRASS: 0, WATER: 1, BOG: 2, ROCK: 3, WOODS: 4, SAND: 5 };

export const TERRAIN_COLOR = {
  [T.GRASS]: 0x4a6b3a,
  [T.WATER]: 0x2f5a74,
  [T.BOG]: 0x5c5230,
  [T.ROCK]: 0x7a756b,
  [T.WOODS]: 0x35502c,
  [T.SAND]: 0xb8a468,
};

const BUILDABLE = new Set([T.GRASS]);
const ROADABLE = new Set([T.GRASS, T.SAND]);

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise over a coarse random lattice.
function makeNoise(rand, size, cells) {
  const g = cells + 1;
  const v = new Float32Array(g * g);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  return (x, z) => {
    const fx = Math.min((x / size) * cells, cells - 1e-4);
    const fz = Math.min((z / size) * cells, cells - 1e-4);
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const a = v[z0 * g + x0], b = v[z0 * g + x0 + 1];
    const c = v[(z0 + 1) * g + x0], d = v[(z0 + 1) * g + x0 + 1];
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
  };
}

export class Tilemap {
  constructor(size = 32, tile = 1, seed = 7) {
    this.size = size;
    this.tile = tile;
    this.half = (size * tile) / 2;
    this.tiles = new Array(size * size);
    this.generate(seed);
  }

  idx(x, z) { return z * this.size + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }
  get(x, z) { return this.inBounds(x, z) ? this.tiles[this.idx(x, z)] : null; }

  generate(seed) {
    const elev = makeNoise(mulberry32(seed), this.size, 6);
    const moist = makeNoise(mulberry32(seed * 7 + 1), this.size, 5);
    const scatter = mulberry32(seed * 13 + 3);
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        const e = elev(x + 0.5, z + 0.5);
        const m = moist(x + 0.5, z + 0.5);
        let terrain = T.GRASS;
        if (e < 0.30) terrain = T.WATER;
        else if (e < 0.35) terrain = T.SAND;
        else if (e > 0.76) terrain = T.ROCK;
        else if (m > 0.70) terrain = T.BOG;
        else if (m < 0.34 && scatter() < 0.55) terrain = T.WOODS;
        this.tiles[this.idx(x, z)] = { terrain, road: false, occupant: null };
      }
    }
  }

  // Tile (x,z) centre in world space.
  tileToWorld(x, z) {
    return {
      x: x * this.tile - this.half + this.tile / 2,
      z: z * this.tile - this.half + this.tile / 2,
    };
  }
  worldToTile(wx, wz) {
    const x = Math.floor((wx + this.half) / this.tile);
    const z = Math.floor((wz + this.half) / this.tile);
    return this.inBounds(x, z) ? { x, z } : null;
  }

  isBuildable(x, z) {
    const t = this.get(x, z);
    return !!t && BUILDABLE.has(t.terrain) && !t.road && !t.occupant;
  }
  canPlace(x, z, w, h) {
    for (let dz = 0; dz < h; dz++)
      for (let dx = 0; dx < w; dx++)
        if (!this.isBuildable(x + dx, z + dz)) return false;
    return true;
  }
  place(x, z, w, h, name) {
    const occ = { name, ox: x, oz: z };
    for (let dz = 0; dz < h; dz++)
      for (let dx = 0; dx < w; dx++)
        this.get(x + dx, z + dz).occupant = occ;
  }

  isRoadable(x, z) {
    const t = this.get(x, z);
    return !!t && ROADABLE.has(t.terrain) && !t.occupant;
  }
  setRoad(x, z, on) {
    if (on && !this.isRoadable(x, z)) return false;
    const t = this.get(x, z);
    if (!t) return false;
    t.road = on;
    return true;
  }
}
