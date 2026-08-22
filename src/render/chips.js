import * as THREE from 'three';

// Programmer-art: solid coloured shapes so the game is fully readable before
// the pixel sprites are wired in. Swap back to sprites.js per building later.

const BUILDING = {
  dwelling: { color: 0xc98a3a, h: 1.2 },
  farm:     { color: 0x8ea63a, h: 0.35 },
  granary:  { color: 0xb0894a, h: 1.7 },
  market:   { color: 0xa8663a, h: 1.0 },
  well:     { color: 0x5a8aa0, h: 0.8 },
  altar:    { color: 0x7a6a9a, h: 1.1 },
};

const WALKER = {
  grain_carrier: 0xe8c96b,
  market_trader: 0xe0883a,
  water_carrier: 0x6fb0e0,
  druid: 0xb07ad0,
};

export function makeBuildingChip(role, w, h, ts) {
  const spec = BUILDING[role] || { color: 0x999999, h: 1 };
  const g = new THREE.Group();

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w * ts * 0.92, 0.14, h * ts * 0.92),
    new THREE.MeshLambertMaterial({ color: 0x1b2416 })
  );
  plinth.position.y = 0.07;
  g.add(plinth);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * ts * 0.8, spec.h, h * ts * 0.8),
    new THREE.MeshLambertMaterial({ color: spec.color })
  );
  body.position.y = 0.14 + spec.h / 2;
  g.add(body);

  return g;
}

export function makeWalkerChip(type) {
  const geo = new THREE.ConeGeometry(0.2, 0.6, 6);
  geo.translate(0, 0.3, 0); // base at origin
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: WALKER[type] || 0xffffff }));
  return m;
}
