import * as THREE from 'three';
import { tex, spriteFrom, fitWidth } from './assets.js?v=15';

const FILL = 1.35; // building sprite width as a multiple of its footprint width

// Pixel-art sprites for buildings and walkers, with the old solid-shape chips
// kept as a fallback if a role has no art yet.

const ROLE_FILE = {
  dwelling: 'roundhouse', farm: 'field', granary: 'granary',
  market: 'market', well: 'well', altar: 'altar',
};
const WALK_FILE = {
  villager: 'villager', grain_carrier: 'grain_carrier',
  market_trader: 'market_trader', water_carrier: 'water_carrier', druid: 'druid',
};

const FALLBACK = {
  dwelling: { color: 0xc98a3a, h: 1.2 }, farm: { color: 0x8ea63a, h: 0.35 },
  granary: { color: 0xb0894a, h: 1.7 }, market: { color: 0xa8663a, h: 1.0 },
  well: { color: 0x5a8aa0, h: 0.8 }, altar: { color: 0x7a6a9a, h: 1.1 },
};

// A building is a Group holding one billboard sprite (so the alert marker can be
// a child without being scaled by the sprite). Two textures — empty / full.
export function makeBuildingChip(role, w, h, ts) {
  const base = ROLE_FILE[role];
  const g = new THREE.Group();
  if (base) {
    const emptyT = tex('assets/buildings/' + base + '_empty.png');
    const fullT = tex('assets/buildings/' + base + '_full.png');
    const worldW = w * ts * FILL; // fill the footprint regardless of art pixel size
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: emptyT, transparent: true, alphaTest: 0.12 }));
    spr.center.set(0.5, 0);
    fitWidth(spr, emptyT, worldW);
    g.add(spr);
    g.userData = { spr, emptyT, fullT, worldW, active: false };
  } else {
    g.add(fallbackBody(FALLBACK[role] || { color: 0x999999, h: 1 }, w, h, ts));
  }
  return g;
}

export function setChipActive(chip, active) {
  const u = chip.userData;
  if (!u || !u.spr) return; // fallback chips just stay put
  const t = active ? u.fullT : u.emptyT;
  if (u.spr.material.map === t) return;
  u.spr.material.map = t;
  u.spr.material.needsUpdate = true;
  fitWidth(u.spr, t, u.worldW);
}

function fallbackBody(spec, w, h, ts) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * ts * 0.8, spec.h, h * ts * 0.8),
    new THREE.MeshLambertMaterial({ color: spec.color })
  );
  body.position.y = 0.14 + spec.h / 2;
  return body;
}

export function makeWalkerChip(type) {
  const base = WALK_FILE[type] || 'villager';
  return spriteFrom(tex('assets/walkers/' + base + '.png'), 1.5);
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
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false }));
  s.scale.set(1.1, 1.1, 1.1);
  return s;
}
