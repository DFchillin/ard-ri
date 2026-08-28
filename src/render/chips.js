import * as THREE from 'three';
import { tex, spriteFrom, fitWidth, sizeSprite, screenDir } from './assets.js?v=CBUST';

const DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'];
const WALK_CYCLE = [0, 2, 1, 2]; // step1, stand, step2, stand
const STEP_TIME = 0.42; // seconds per walk frame (slower, calmer gait)

// A screen-facing billboard's width maps to the footprint's diagonal screen
// span, which grows with w+h (not w alone). 0.6 keeps square/1x1 buildings the
// same size they were at the old w*1.2, while insetting wide footprints (the
// 3x2 field) so their art no longer overhangs onto adjacent roads.
const DIAG_FILL = 0.6;

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
    const worldW = (w + h) * ts * DIAG_FILL; // size to the iso footprint's diagonal span
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

const WALKER_COLOR = {
  villager: 0xf0e0c0, grain_carrier: 0xe8c96b, market_trader: 0xe0883a,
  water_carrier: 0x6fb0e0, druid: 0xb07ad0,
};

export function makeWalkerChip(type) {
  const role = WALK_FILE[type] || 'villager';
  // Half the folk are women — every role has a matching female sprite set in a
  // <role>_f folder, so the streets read as families, not a town of one gender.
  const base = Math.random() < 0.5 ? role + '_f' : role;
  const T = {};
  for (const d of DIRS) T[d] = ['step1', 'step2', 'stand'].map((f) => tex(`assets/walkers/${base}/${d}_${f}.png`));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.s[2], transparent: true, alphaTest: 0.12 }));
  s.center.set(0.5, 0);
  s.scale.set(0.55, 0.95, 1); // sensible default before the art loads
  sizeSprite(s, T.s[2], 1.5);
  // Safety net: if the art can't load, show a plain coloured figure, never nothing.
  tex(`assets/walkers/${base}/s_stand.png`, () => {
    s._failed = true;
    s.material.map = null;
    s.material.color.set(WALKER_COLOR[type] || 0xffffff);
    s.material.needsUpdate = true;
    s.scale.set(0.5, 0.9, 1);
  });
  // animation state on dedicated props — walkers overwrite userData for inspect
  s._dx = 0; s._dz = 1; s._phase = 0; s._t = 0;
  s.faceWorld = (dx, dz) => { if (dx || dz) { s._dx = dx; s._dz = dz; } };
  s.animate = (dt, moving) => {
    if (s._failed) return; // fallback colour figure — nothing to swap
    const frames = T[screenDir(s._dx, s._dz)] || T.s;
    if (moving) {
      s._t += dt;
      if (s._t >= STEP_TIME) { s._t -= STEP_TIME; s._phase = (s._phase + 1) % 4; }
      s.material.map = frames[WALK_CYCLE[s._phase]];
    } else {
      s.material.map = frames[2];
    }
  };
  return s;
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
