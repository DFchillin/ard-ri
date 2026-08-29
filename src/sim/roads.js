// Road-network helpers. Walkers move only over road tiles; buildings connect to
// the network through a road tile touching their footprint.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// All road neighbours, ignoring any Cros — connectivity and restock never break.
// Walkers themselves prefer to avoid Cros tiles (see Walker._pickNext).
export function roadNeighbors(map, x, z) {
  const out = [];
  for (const [dx, dz] of N4) {
    const t = map.get(x + dx, z + dz);
    if (t && t.road) out.push({ x: x + dx, z: z + dz });
  }
  return out;
}

// First road tile orthogonally touching a building's footprint (its "door").
export function entryRoadTile(map, inst) {
  for (let dz = 0; dz < inst.h; dz++) {
    for (let dx = 0; dx < inst.w; dx++) {
      const bx = inst.x + dx, bz = inst.z + dz;
      for (const [ox, oz] of N4) {
        const t = map.get(bx + ox, bz + oz);
        if (t && t.road) return { x: bx + ox, z: bz + oz };
      }
    }
  }
  return null;
}

// Distinct building instances occupying tiles orthogonally adjacent to (x,z).
export function adjacentBuildings(map, x, z) {
  const seen = new Set(), out = [];
  for (const [ox, oz] of N4) {
    const t = map.get(x + ox, z + oz);
    if (t && t.occupant && !seen.has(t.occupant)) {
      seen.add(t.occupant);
      out.push(t.occupant);
    }
  }
  return out;
}

// Is there a road-only path between two road tiles?
export function roadConnected(map, a, b) {
  if (a.x === b.x && a.z === b.z) return true;
  const seen = new Set([a.x + ',' + a.z]);
  const q = [a];
  while (q.length) {
    const c = q.shift();
    for (const n of roadNeighbors(map, c.x, c.z)) {
      if (n.x === b.x && n.z === b.z) return true;
      const k = n.x + ',' + n.z;
      if (!seen.has(k)) { seen.add(k); q.push(n); }
    }
  }
  return false;
}
