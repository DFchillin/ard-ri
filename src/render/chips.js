import * as THREE from 'three';
import { tex, spriteFrom, fitWidth, sizeSprite, screenDir, onReady } from './assets.js?v=CBUST';

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
  market: 'market', well: 'well', altar: 'altar', homestead: 'roundhouse',
};
const WALK_FILE = {
  villager: 'villager', grain_carrier: 'grain_carrier',
  market_trader: 'market_trader', water_carrier: 'water_carrier', druid: 'druid',
};

const FALLBACK = {
  dwelling: { color: 0xc98a3a, h: 1.2 }, farm: { color: 0x8ea63a, h: 0.35 },
  granary: { color: 0xb0894a, h: 1.7 }, market: { color: 0xa8663a, h: 1.0 },
  well: { color: 0x5a8aa0, h: 0.8 }, altar: { color: 0x7a6a9a, h: 1.1 },
  homestead: { color: 0xd8a24a, h: 1.4 },
};

// A single grazing cow, drawn on a canvas so it needs no sprite art — a
// dun-and-white beast for the herd around the homestead.
export function makeCowToken() {
  const c = document.createElement('canvas'); c.width = 40; c.height = 30;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(30,24,14,0.28)'; x.beginPath(); x.ellipse(20, 26, 12, 3, 0, 0, Math.PI * 2); x.fill(); // shadow
  x.fillStyle = '#efe6d2';                                  // body
  x.beginPath(); x.ellipse(19, 16, 12, 7, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#6b4a2a'; x.beginPath(); x.ellipse(14, 14, 4, 3, 0, 0, Math.PI * 2); x.fill(); // patches
  x.beginPath(); x.ellipse(24, 18, 3, 2.5, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3a2c1a'; x.fillRect(10, 21, 2.5, 6); x.fillRect(26, 21, 2.5, 6); // legs
  x.fillStyle = '#efe6d2'; x.beginPath(); x.ellipse(31, 12, 4.5, 4, 0, 0, Math.PI * 2); x.fill(); // head
  x.fillStyle = '#d8c8a8'; x.beginPath(); x.moveTo(33, 8); x.lineTo(36, 5); x.lineTo(34, 9); x.fill(); // horn
  const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true }));
  s.center.set(0.5, 0); s.scale.set(0.85, 0.64, 1);
  return s;
}

// A building is a Group holding one billboard sprite (so the alert marker can be
// a child without being scaled by the sprite). Two textures — empty / full.
// A building chip is a billboard with a set of state frames. Most buildings have
// two (empty/full); those with `states: 4` in their def swap between four
// prosperity frames (_s1.._s4) as they thrive. opts: { art, states }.
export function makeBuildingChip(role, w, h, ts, opts = {}) {
  const { art, states = 2, scale = 1, drawW } = opts;
  const g = new THREE.Group();
  const frames = [];
  if (art && states >= 3) {
    for (let i = 1; i <= states; i++) frames.push(tex(`assets/buildings/${art}_s${i}.png`));
  } else {
    const base = art || ROLE_FILE[role];
    if (base) frames.push(tex(`assets/buildings/${base}_empty.png`), tex(`assets/buildings/${base}_full.png`));
  }
  if (frames.length) {
    // Render size normally follows the footprint's diagonal span. Full-scene art
    // (a building drawn on its whole plot) instead sets `drawW` — one shared world
    // width per art generation — so a person reads the same size next to every
    // building and perspective holds, whatever tile footprint the plot occupies.
    const worldW = drawW != null ? drawW * ts : (w + h) * ts * DIAG_FILL * scale;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, alphaTest: 0.12 }));
    spr.center.set(0.5, 0);
    fitWidth(spr, frames[0], worldW);
    g.add(spr);
    g.userData = { spr, frames, worldW, state: 0 };
  } else {
    g.add(fallbackBody(FALLBACK[role] || { color: 0x999999, h: 1 }, w, h, ts));
  }
  return g;
}

// frac 0..1 → picks the nearest state frame (0=empty/bare, 1=full/thriving).
export function setChipState(chip, frac) {
  const u = chip.userData;
  if (!u || !u.spr || !u.frames) return; // fallback chips just stay put
  const n = u.frames.length;
  const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
  if (u.state === idx) return;
  u.state = idx;
  const t = u.frames[idx];
  u.spr.material.map = t;
  u.spr.material.needsUpdate = true;
  fitWidth(u.spr, t, u.worldW);
}
// Back-compat: full when active, empty when not.
export function setChipActive(chip, active) { setChipState(chip, active ? 1 : 0); }

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

const WALKER_H = 1.3;   // world height every walker renders at, whatever the art's pixel size
const WALK_FRAMES = 6;  // walk poses per facing (cardinals repeat their idle)
const WALK_FPS = 0.11;  // seconds per walk frame
export function makeWalkerChip(type, female) {
  const role = WALK_FILE[type] || 'villager';
  // Half the folk are women — every role has a matching female sprite set in a
  // <role>_f folder, so the streets read as families, not a town of one gender.
  // `female` ties the sprite to the person's name; omit it for a random pick.
  const useF = female === undefined ? Math.random() < 0.5 : !!female;
  const base = useF ? role + '_f' : role;
  const T = {};
  for (const d of DIRS) T[d] = { stand: tex(`assets/walkers/${base}/${d}_stand.png`),
    walk: Array.from({ length: WALK_FRAMES }, (_, i) => tex(`assets/walkers/${base}/${d}_walk${i}.png`)) };
  const first = T.s.stand;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: first, transparent: true, alphaTest: 0.12 }));
  s.center.set(0.5, 0);
  s.scale.set(0.7, WALKER_H, 1); // sensible default before the art loads
  // Size to a fixed world height so the figure reads at a consistent size no
  // matter what resolution the frame was authored at (aspect from the art).
  onReady(first, () => { const i = first.image; if (i && i.width) s.scale.set(WALKER_H * (i.width / i.height), WALKER_H, 1); });
  // Safety net: if the art can't load, show a plain coloured figure, never nothing.
  tex(`assets/walkers/${base}/s_stand.png`, () => {
    s._failed = true;
    s.material.map = null;
    s.material.color.set(WALKER_COLOR[type] || 0xffffff);
    s.material.needsUpdate = true;
    s.scale.set(0.6, WALKER_H, 1);
  });
  // animation state on dedicated props — walkers overwrite userData for inspect
  s._dx = 0; s._dz = 1; s._phase = 0; s._t = 0;
  s.faceWorld = (dx, dz) => { if (dx || dz) { s._dx = dx; s._dz = dz; } };
  s.animate = (dt, moving) => {
    if (s._failed) return; // fallback colour figure — nothing to swap
    const fr = T[screenDir(s._dx, s._dz)] || T.s;
    if (moving) {
      s._t += dt;
      if (s._t >= WALK_FPS) { s._t -= WALK_FPS; s._phase = (s._phase + 1) % fr.walk.length; }
      s.material.map = fr.walk[s._phase] || fr.stand;
    } else {
      s.material.map = fr.stand;
    }
  };
  return s;
}

// Battle sprites: 8 facings × 5 frames (idle, step1, step2, wind-up, strike)
// sliced from the character sheet. Walks on the step frames, and plays a short
// wind-up → strike when it lands a blow. `h` is the world height to draw at.
const B_WALK = ['step1', 'idle', 'step2', 'idle'];
const B_STEP = 0.28;
const STRIKE_DUR = 0.5;
export function makeWarriorChip(art, h = 1.6) {
  const F = {};
  for (const d of DIRS) F[d] = {};
  // idle/walk/attack always exist; hurt/fall/dead are the death set — optional,
  // and any that hasn't been drawn yet falls back to idle at read-time.
  const frames = ['idle', 'step1', 'step2', 'windup', 'strike', 'hurt', 'fall', 'dead'];
  for (const d of DIRS) for (const f of frames) F[d][f] = tex(`assets/battle/${art}/${d}_${f}.png`);
  const first = F.s.idle;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: first, transparent: true, alphaTest: 0.14 }));
  s.center.set(0.5, 0);
  s.scale.set(h * 0.75, h, 1);
  const fit = () => { const i = first.image; if (i && i.width) s.scale.set(h * (i.width / i.height), h, 1); };
  onReady(first, fit);
  s._dx = 0; s._dz = 1; s._phase = 0; s._t = 0; s._strike = 0; s._dying = false; s._death = 0;
  s.faceWorld = (dx, dz) => { if (dx || dz) { s._dx = dx; s._dz = dz; } };
  s.strike = () => { if (s._strike <= 0) s._strike = STRIKE_DUR; };
  s.die = () => { s._dying = true; s._death = 0; }; // hurt → fall → dead, then hold
  s.animate = (dt, moving) => {
    const fr = F[screenDir(s._dx, s._dz)] || F.s;
    let key;
    if (s._dying) { s._death += dt; key = s._death < 0.22 ? 'hurt' : s._death < 0.55 ? 'fall' : 'dead'; }
    else if (s._strike > 0) { s._strike -= dt; key = s._strike > STRIKE_DUR * 0.45 ? 'windup' : 'strike'; }
    else if (moving) { s._t += dt; if (s._t >= B_STEP) { s._t -= B_STEP; s._phase = (s._phase + 1) % 4; } key = B_WALK[s._phase]; }
    else key = 'idle';
    let m = fr[key];
    if (!m || m._failed) m = fr.idle; // death art not drawn yet — stay on idle rather than blank
    if (s.material.map !== m) { s.material.map = m; s.material.needsUpdate = true; }
  };
  return s;
}

// The menace: a hulking Fomorian giant that patrols its blighted ground in the
// settlement. Drawn on a canvas — a dark, one-eyed figure — until real art lands.
export function makeMenaceCreature() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,6,14,0.4)'; x.beginPath(); x.ellipse(32, 90, 20, 5, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#2b2436';                                   // body
  x.beginPath(); x.moveTo(20, 40); x.lineTo(44, 40); x.lineTo(48, 88); x.lineTo(16, 88); x.closePath(); x.fill();
  x.beginPath(); x.ellipse(32, 26, 15, 16, 0, 0, Math.PI * 2); x.fill(); // head
  x.fillStyle = '#3a3048'; x.fillRect(8, 44, 10, 30); x.fillRect(46, 44, 10, 30); // arms
  x.fillStyle = '#d84a3a'; x.beginPath(); x.arc(32, 24, 5, 0, Math.PI * 2); x.fill(); // single red eye
  x.fillStyle = '#c0b8cc'; x.fillRect(20, 12, 4, 8); x.fillRect(40, 12, 4, 8); // horns
  const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true }));
  s.center.set(0.5, 0); s.scale.set(2.2, 3.3, 1);
  return s;
}

// A wayside high-cross that pens walkers to a route. Drawn on a canvas so it
// needs no sprite-sheet art — a ringed Celtic cross in weathered stone.
export function makeCrosMarker() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.strokeStyle = '#2a2418'; x.lineWidth = 3;
  x.fillStyle = '#b9b2a0'; // pale standing-stone grey
  const cx = 32;
  const shaft = (yTop, yBot, halfW) => { x.beginPath(); x.rect(cx - halfW, yTop, halfW * 2, yBot - yTop); x.fill(); x.stroke(); };
  shaft(10, 92, 7);            // upright
  shaft(30, 46, 22);          // arms (drawn as a bar)
  x.beginPath(); x.arc(cx, 38, 17, 0, Math.PI * 2); x.lineWidth = 5; x.stroke(); // the ring
  x.fillStyle = 'rgba(120,110,90,0.35)';
  x.beginPath(); x.ellipse(cx, 92, 16, 5, 0, 0, Math.PI * 2); x.fill(); // ground shadow
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true }));
  s.center.set(0.5, 0);
  s.scale.set(0.85, 1.28, 1);
  return s;
}

// A small gold "tap here" dot, shown on every building while the magnifying
// glass is active so it's clear what can be inspected.
export function makeInspectDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,16,8,0.55)'; x.beginPath(); x.arc(24, 24, 20, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e8c96b'; x.beginPath(); x.arc(24, 24, 12, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1c130a'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('🔍', 24, 25);
  const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
  s.scale.set(0.7, 0.7, 0.7);
  s.visible = false;
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
