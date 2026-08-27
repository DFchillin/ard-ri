import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, rotateIsoCamera, zoomIsoCamera, panIsoCamera, cameraDirLabel } from './iso_camera.js?v=10';
import { Tilemap, TERRAIN_INFO } from './sim/tilemap.js?v=10';
import { WorldView } from './render/world_view.js?v=10';
import { BUILDINGS } from './data/buildings.js?v=10';
import { Game } from './sim/game.js?v=10';
import { UI } from './ui.js?v=10';
import { MONTHS_EN, SEASONS, seasonOfMonth, FESTIVALS } from './sim/calendar.js?v=10';

const DAYS_PER_MONTH = 6;
const SECONDS_PER_DAY = 2.6; // real seconds per in-game day at 1×
const ECON_TICK = 0.45;      // economy step

const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1418);
scene.fog = new THREE.Fog(0x0b1418, 70, 175);

let aspect = window.innerWidth / window.innerHeight;
const camera = createIsoCamera(15, aspect);

const hemi = new THREE.HemisphereLight(0xd6f0cf, 0x40602f, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xdfffcf, 1.8);
sun.position.set(40, 70, 20);
scene.add(sun);
// Seasonal accent: a coloured light from a different corner each season.
const accent = new THREE.DirectionalLight(0x8fe06a, 2.4);
scene.add(accent);
scene.add(accent.target);
const SEASON_ACCENT = {
  earrach:    { color: 0x8fe06a, pos: [-45, 42, -45] },
  samhradh:   { color: 0xffd166, pos: [45, 42, -45] },
  fomhar:     { color: 0xff8a4a, pos: [45, 42, 45] },
  geimhreadh: { color: 0x8fbfff, pos: [-45, 42, 45] },
};

const map = new Tilemap(32, 1, 7);
const view = new WorldView(scene, map);
const game = new Game(map, scene);

const sim = { speed: 1 };
const cal = { day: 1, month: 1 }; // start Feb — Imbolc, Spring
let curSeason = seasonOfMonth(cal.month);
let tool = null;
let savedSpeed = null;
let started = false;
let missionDone = false;

const ui = new UI({
  onTool: (kind) => { cancelPending(); tool = kind; if (!(tool === 'road' || BUILDINGS[tool])) preview.visible = false; },
  onSpeed: (s) => { sim.speed = s; savedSpeed = null; },
  onRotate: (d) => ui.setCompass(rotateIsoCamera(camera, d)),
  onZoom: (f) => zoomIsoCamera(camera, f, aspect),
  onInspectClose: () => resumeGame(),
  onFestivalContinue: () => resumeGame(),
  onStartMission: () => startMission(),
  onPlaceConfirm: () => confirmBuild(),
  onPlaceCancel: () => cancelPending(),
  onPlaceAlt: () => altRoute(),
});

function startMission() { started = true; triggerFestival(FESTIVALS[1]); }

function pauseGame() { if (savedSpeed === null) savedSpeed = sim.speed; sim.speed = 0; ui.reflectSpeed(0); }
function resumeGame() { if (savedSpeed !== null) { sim.speed = savedSpeed; ui.reflectSpeed(sim.speed); savedSpeed = null; } }

function applySeason(key) {
  const L = SEASONS[key].light;
  hemi.color.setHex(L.sky);
  hemi.groundColor.setHex(L.ground);
  sun.color.setHex(L.sun);
  sun.intensity = L.intensity;
  const a = SEASON_ACCENT[key];
  accent.color.setHex(a.color);
  accent.position.set(a.pos[0], a.pos[1], a.pos[2]);
  scene.background.setHex(L.bg);
  scene.fog.color.setHex(L.bg);
  ui.setSeasonIcon(SEASONS[key].icon);
}
function pushStats() {
  ui.setStats({ cattle: game.cattle, silver: game.silver, folk: game.folk });
  ui.setObjectives(game.objectives);
}
function updateDate() {
  ui.setStats({ season: SEASONS[curSeason].ga, day: `${MONTHS_EN[cal.month].slice(0, 3)} ${cal.day}` });
}
function triggerFestival(f) { pauseGame(); ui.showFestival({ name: f.name, emoji: f.emoji, sub: f.sub }); }

function advanceDay() {
  cal.day += 1;
  if (cal.day > DAYS_PER_MONTH) {
    cal.day = 1;
    cal.month = (cal.month + 1) % 12;
    const s = seasonOfMonth(cal.month);
    if (s !== curSeason) { curSeason = s; applySeason(s); }
    const fest = FESTIVALS[cal.month];
    if (fest) triggerFestival(fest);
  }
  updateDate();
}

applySeason(curSeason);
pushStats();
updateDate();
ui.setCompass(cameraDirLabel(camera));
ui.showTitle(); // title screen; Mission One starts the game

// --- Placement preview ---
const preview = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
preview.rotation.x = -Math.PI / 2;
preview.position.y = 0.06;
preview.visible = false;
scene.add(preview);

// Raised ghost volume for building placement — clearly visible after you drop it.
const ghostBox = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.28, depthWrite: false })
);
const ghostEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
ghostBox.add(ghostEdges);
ghostBox.visible = false;
scene.add(ghostBox);
const GHOST_H = 1.4;

// Road path ghost — flat tiles traced out while dragging, before you commit.
const roadGhost = new THREE.Group();
scene.add(roadGhost);
function clearRoadGhost() {
  roadGhost.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  roadGhost.clear();
}
function showRoadGhost() {
  clearRoadGhost();
  for (const p of pendingRoad) {
    const c = map.tileToWorld(p.x, p.z);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(map.tile * 0.9, map.tile * 0.9),
      new THREE.MeshBasicMaterial({
        color: map.isRoadable(p.x, p.z) ? 0x66ff66 : 0xff5555,
        transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(c.x, 0.07, c.z);
    roadGhost.add(m);
  }
}
function pushTile(list, x, z) { if (!list.some((p) => p.x === x && p.z === z)) list.push({ x, z }); }

// A clean L-shaped run between two tiles — horizontal-first or vertical-first.
function lPath(start, end, vertFirst) {
  const path = []; let { x, z } = start; pushTile(path, x, z);
  if (vertFirst) {
    while (z !== end.z) { z += Math.sign(end.z - z); pushTile(path, x, z); }
    while (x !== end.x) { x += Math.sign(end.x - x); pushTile(path, x, z); }
  } else {
    while (x !== end.x) { x += Math.sign(end.x - x); pushTile(path, x, z); }
    while (z !== end.z) { z += Math.sign(end.z - z); pushTile(path, x, z); }
  }
  return path;
}

// Shortest roadable route around obstacles (A*), used when the straight L is blocked.
function astar(start, end) {
  const key = (x, z) => x + z * map.size;
  const g = new Map([[key(start.x, start.z), 0]]);
  const f = new Map([[key(start.x, start.z), 0]]);
  const came = new Map();
  const seen = new Set();
  const open = [{ x: start.x, z: start.z }];
  const h = (x, z) => Math.abs(x - end.x) + Math.abs(z - end.z);
  while (open.length) {
    open.sort((p, q) => f.get(key(p.x, p.z)) - f.get(key(q.x, q.z)));
    const cur = open.shift();
    const ck = key(cur.x, cur.z);
    if (cur.x === end.x && cur.z === end.z) {
      const path = [{ x: cur.x, z: cur.z }]; let k = ck;
      while (came.has(k)) { const p = came.get(k); path.unshift({ x: p.x, z: p.z }); k = key(p.x, p.z); }
      return path;
    }
    if (seen.has(ck)) continue;
    seen.add(ck);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, nz = cur.z + dz;
      if (nx < 0 || nz < 0 || nx >= map.size || nz >= map.size) continue;
      if (!map.isRoadable(nx, nz) && !(nx === end.x && nz === end.z)) continue;
      const nk = key(nx, nz), ng = g.get(ck) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        came.set(nk, cur); g.set(nk, ng); f.set(nk, ng + h(nx, nz)); open.push({ x: nx, z: nz });
      }
    }
  }
  return null;
}

// Deaglán's suggestion: prefer a clean straight L; route around obstacles if it is blocked.
function suggestRoute(start, end, variant) {
  const l = lPath(start, end, variant % 2 === 1);
  if (l.every((p) => map.isRoadable(p.x, p.z))) return l;
  return astar(start, end) || l;
}

function commitRoad() {
  let changed = false;
  for (const p of pendingRoad) {
    if (map.setRoad(p.x, p.z, true)) { const t = map.get(p.x, p.z); if (t) t.deaglan = true; changed = true; }
  }
  if (changed) view.rebuildRoads();
  cancelPending();
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function setNdc(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}
function tileUnderPointer(e) {
  setNdc(e);
  const hit = raycaster.intersectObject(view.pickPlane)[0];
  return hit ? map.worldToTile(hit.point.x, hit.point.z) : null;
}
function footprint(kind, t) {
  const [w, h] = BUILDINGS[kind].footprint;
  return { x: t.x - Math.floor((w - 1) / 2), z: t.z - Math.floor((h - 1) / 2), w, h };
}
function updatePreview(e) {
  if (!(tool === 'road' || BUILDINGS[tool])) { preview.visible = false; return; }
  const t = tileUnderPointer(e);
  if (!t) { preview.visible = false; return; }
  if (tool === 'road') {
    const c = map.tileToWorld(t.x, t.z);
    preview.position.set(c.x, 0.06, c.z);
    preview.scale.set(map.tile, map.tile, 1);
    preview.material.color.set(map.isRoadable(t.x, t.z) ? 0x66ff66 : 0xff5555);
  } else {
    const f = footprint(tool, t);
    const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
    const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
    preview.position.set(cx, 0.06, cz);
    preview.scale.set(f.w * map.tile, f.h * map.tile, 1);
    preview.material.color.set(game.canAfford(tool) && map.canPlace(f.x, f.z, f.w, f.h) ? 0x66ff66 : 0xff5555);
  }
  preview.visible = true;
}

// --- Inspect ---
function personHtml(p) {
  return `<h3>${p.name}</h3><div class="role">${p.roleEn} · ${p.roleGa}</div>` +
    `<blockquote>“${p.phraseGa}”<br><span class="en">“${p.phraseEn}”</span></blockquote>`;
}
function buildingHtml(inst) {
  const d = inst.def;
  let extra = '';
  if (d.role === 'granary' || d.role === 'market') extra = `<p>Grain in store: ${inst.stock}</p>`;
  if (d.role === 'dwelling') extra = `<p>Folk: ${inst.pop}/${inst.cap} · Food: ${inst.food}/10</p>`;
  return `<h3>${d.label}</h3><div class="role">Building</div><p>${d.desc}</p>${extra}`;
}
function terrainHtml(tile) {
  const info = TERRAIN_INFO[tile.terrain];
  return `<h3>${info.name}</h3><div class="role">Terrain</div><p>${info.desc}</p>`;
}
function inspectAt(e) {
  setNdc(e);
  const wh = raycaster.intersectObjects(game.walkerGroup.children, true)[0];
  if (wh) {
    let o = wh.object;
    while (o && !(o.userData && o.userData.person)) o = o.parent;
    if (o && o.userData.person) { ui.showInspect(personHtml(o.userData.person), true); pauseGame(); return; }
  }
  const hit = raycaster.intersectObject(view.pickPlane)[0];
  if (!hit) return;
  const t = map.worldToTile(hit.point.x, hit.point.z);
  if (!t) return;
  const tile = map.get(t.x, t.z);
  ui.showInspect(tile.occupant ? buildingHtml(tile.occupant) : terrainHtml(tile), false);
}
function demolishAt(e) {
  const t = tileUnderPointer(e);
  if (!t) return;
  const r = game.demolish(t.x, t.z);
  if (r === 'road') view.rebuildRoads();
  if (r) pushStats();
}

// --- Input: build / road-paint / demolish / inspect + pan + pinch ---
const pointers = new Map();
let painting = false, demolishing = false, panLast = null, pinchDist = 0;
let pendingBuild = null, movingBuild = false;
let pendingRoad = null, drawingRoad = false;
let roadStart = null, roadEnd = null, roadVariant = 0;
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

// Ghost placement: drop a building, drag to relocate, then "Build here".
function showGhostAt(t) {
  if (!t || !BUILDINGS[tool]) return;
  pendingBuild = t;
  const f = footprint(tool, t);
  const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
  const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
  const ok = game.canAfford(tool) && map.canPlace(f.x, f.z, f.w, f.h);
  ghostBox.position.set(cx, GHOST_H / 2, cz);
  ghostBox.scale.set(f.w * map.tile, GHOST_H, f.h * map.tile);
  ghostBox.material.color.set(ok ? 0x66ff66 : 0xff5555);
  ghostEdges.material.color.set(ok ? 0xffffff : 0xffbbaa);
  ghostBox.visible = true;
  preview.visible = false;
  ui.showPlaceConfirm();
}
function confirmBuild() {
  if (pendingRoad) { commitRoad(); return; }
  if (!pendingBuild || !BUILDINGS[tool]) return;
  const f = footprint(tool, pendingBuild);
  if (game.place(tool, f)) { pushStats(); cancelPending(); }
}
function cancelPending() {
  pendingBuild = null;
  movingBuild = false;
  pendingRoad = null;
  drawingRoad = false;
  roadStart = null;
  roadEnd = null;
  preview.visible = false;
  ghostBox.visible = false;
  clearRoadGhost();
  if (ui.hidePlaceConfirm) ui.hidePlaceConfirm();
}

// "Try the other route" — flip Deaglán's suggestion between the two clean L runs.
function altRoute() {
  if (!pendingRoad || !roadStart || !roadEnd) return;
  roadVariant = (roadVariant + 1) % 2;
  pendingRoad = suggestRoute(roadStart, roadEnd, roadVariant);
  showRoadGhost();
}

function pointerDist() {
  const p = [...pointers.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
function panByScreen(dxPix, dyPix) {
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.set(_fwd.z, 0, -_fwd.x);
  const wpp = (2 * camera.userData.viewSize) / window.innerHeight;
  const mx = dxPix * wpp, my = -dyPix * wpp; // inverted drag
  panIsoCamera(camera, _right.x * mx + _fwd.x * my, _right.z * mx + _fwd.z * my);
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { panLast = null; painting = false; demolishing = false; pinchDist = pointerDist(); return; }
  if (e.button !== 2) {
    if (tool === 'inspect') { inspectAt(e); return; }
    if (tool === 'demolish') { demolishing = true; demolishAt(e); return; }
    if (tool === 'road') { const t = tileUnderPointer(e); if (t) { roadStart = t; roadEnd = t; roadVariant = 0; drawingRoad = true; pendingRoad = suggestRoute(roadStart, roadEnd, roadVariant); showRoadGhost(); } return; }
    if (BUILDINGS[tool]) { movingBuild = true; showGhostAt(tileUnderPointer(e)); return; }
  }
  panLast = { x: e.clientX, y: e.clientY }; // no build tool, or right-drag → pan
});

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { const d = pointerDist(); if (pinchDist && d > 0) zoomIsoCamera(camera, pinchDist / d, aspect); pinchDist = d; return; }
  if (panLast) { panByScreen(e.clientX - panLast.x, e.clientY - panLast.y); panLast = { x: e.clientX, y: e.clientY }; return; }
  if (drawingRoad && tool === 'road') {
    const t = tileUnderPointer(e);
    if (t && (t.x !== roadEnd.x || t.z !== roadEnd.z)) { roadEnd = t; pendingRoad = suggestRoute(roadStart, roadEnd, roadVariant); showRoadGhost(); }
    return;
  }
  if (movingBuild && BUILDINGS[tool]) { const t = tileUnderPointer(e); if (t) showGhostAt(t); return; }
  if (pendingBuild || pendingRoad) return; // ghost locked awaiting "Build here"
  updatePreview(e);
  if (demolishing && tool === 'demolish') demolishAt(e);
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  canvas.releasePointerCapture?.(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (pointers.size === 0) {
    painting = false; demolishing = false; panLast = null; movingBuild = false;
    if (drawingRoad) {
      drawingRoad = false;
      if (pendingRoad && pendingRoad.length) ui.showPlaceConfirm({ road: true, label: 'Deaglán’s path' }); else cancelPending();
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!pendingBuild) preview.visible = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomIsoCamera(camera, e.deltaY > 0 ? 1.1 : 0.9, aspect);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { cancelPending(); tool = null; ui.setTool(null); preview.visible = false; ui.hideInspect(); }
});

function checkMission() {
  if (!missionDone && game.objectives.every((o) => o.done)) {
    missionDone = true;
    pauseGame();
    ui.showFestival({ name: 'Mission Complete', emoji: '🏆', sub: 'Comhghairdeas! Your settlement thrives — the first steps are taken.' });
  }
}

window.addEventListener('resize', () => {
  aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeIsoCamera(camera, aspect);
});

window.ardri = { game, map, view, sim, cal };

// --- Loop: economy on ECON_TICK, calendar on SECONDS_PER_DAY ---
let econAcc = 0, dayAcc = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const scaled = started ? dt * sim.speed : 0;
  game.update(scaled);
  econAcc += scaled;
  while (econAcc >= ECON_TICK) { econAcc -= ECON_TICK; game.tick(); pushStats(); checkMission(); }
  dayAcc += scaled;
  while (dayAcc >= SECONDS_PER_DAY) { dayAcc -= SECONDS_PER_DAY; advanceDay(); }
  renderer.render(scene, camera);
}
frame();
