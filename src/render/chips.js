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
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.32, 1.1, 7);
  geo.translate(0, 0.55, 0); // base at origin
  // MeshBasic so walkers stay vivid regardless of lighting.
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: WALKER[type] || 0xffffff }));
  g.add(body);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4d8 })
  );
  cap.position.y = 1.2;
  g.add(cap);
  return g;
}

export function makeAlertMarker() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e0432f';
  x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff';
  x.font = 'bold 42px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('!', 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(1.1, 1.1, 1.1);
  return s;
}
