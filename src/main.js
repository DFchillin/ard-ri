import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, rotateIsoCamera, zoomIsoCamera, panIsoCamera, cameraDirLabel } from './iso_camera.js';
import { Tilemap, TERRAIN_INFO } from './sim/tilemap.js';
import { WorldView } from './render/world_view.js';
import { BUILDINGS } from './data/buildings.js';
import { Game } from './sim/game.js';
import { UI } from './ui.js';
import { MONTHS_EN, SEASONS, seasonOfMonth, FESTIVALS } from './sim/calendar.js';

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

const hemi = new THREE.HemisphereLight(0xd6f0cf, 0x40602f, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xdfffcf, 1.0);
sun.position.set(40, 70, 20);
scene.add(sun);

const map = new Tilemap(32, 1, 7);
const view = new WorldView(scene, map);
const game = new Game(map, scene);

const sim = { speed: 1 };
const cal = { day: 1, month: 1 }; // start Feb — Imbolc, Spring
let curSeason = seasonOfMonth(cal.month);
let tool = null;
let savedSpeed = null;

const ui = new UI({
  onTool: (kind) => { tool = kind; if (!(tool === 'road' || BUILDINGS[tool])) preview.visible = false; },
  onSpeed: (s) => { sim.speed = s; savedSpeed = null; },
  onRotate: (d) => ui.setCompass(rotateIsoCamera(camera, d)),
  onZoom: (f) => zoomIsoCamera(camera, f, aspect),
  onInspectClose: () => resumeGame(),
  onFestivalContinue: () => resumeGame(),
});

function pauseGame() { if (savedSpeed === null) savedSpeed = sim.speed; sim.speed = 0; ui.reflectSpeed(0); }
function resumeGame() { if (savedSpeed !== null) { sim.speed = savedSpeed; ui.reflectSpeed(sim.speed); savedSpeed = null; } }

function applySeason(key) {
  const L = SEASONS[key].light;
  hemi.color.setHex(L.sky);
  hemi.groundColor.setHex(L.ground);
  sun.color.setHex(L.sun);
  sun.intensity = L.intensity;
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
triggerFestival(FESTIVALS[1]); // open the year at Imbolc

// --- Placement preview ---
const preview = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
preview.rotation.x = -Math.PI / 2;
preview.position.y = 0.06;
preview.visible = false;
scene.add(preview);

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
  if (d.role === 'dwelling') extra = `<p>Food: ${inst.food}/10</p>`;
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
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

function pointerDist() {
  const p = [...pointers.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
function panByScreen(dxPix, dyPix) {
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.set(_fwd.z, 0, -_fwd.x);
  const wpp = (2 * camera.userData.viewSize) / window.innerHeight;
  const mx = -dxPix * wpp, my = dyPix * wpp;
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
    if (tool === 'road') { const t = tileUnderPointer(e); if (t) { painting = true; if (map.setRoad(t.x, t.z, true)) view.rebuildRoads(); } return; }
    if (BUILDINGS[tool]) { const t = tileUnderPointer(e); if (t && game.place(tool, footprint(tool, t))) pushStats(); return; }
  }
  panLast = { x: e.clientX, y: e.clientY }; // no build tool, or right-drag → pan
});

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { const d = pointerDist(); if (pinchDist && d > 0) zoomIsoCamera(camera, pinchDist / d, aspect); pinchDist = d; return; }
  if (panLast) { panByScreen(e.clientX - panLast.x, e.clientY - panLast.y); panLast = { x: e.clientX, y: e.clientY }; return; }
  updatePreview(e);
  if (painting && tool === 'road') { const t = tileUnderPointer(e); if (t && map.setRoad(t.x, t.z, true)) view.rebuildRoads(); }
  if (demolishing && tool === 'demolish') demolishAt(e);
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  canvas.releasePointerCapture?.(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (pointers.size === 0) { painting = false; demolishing = false; panLast = null; }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { preview.visible = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomIsoCamera(camera, e.deltaY > 0 ? 1.1 : 0.9, aspect);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { tool = null; ui.setTool(null); preview.visible = false; ui.hideInspect(); }
});

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
  const scaled = dt * sim.speed;
  game.update(scaled);
  econAcc += scaled;
  while (econAcc >= ECON_TICK) { econAcc -= ECON_TICK; game.tick(); pushStats(); }
  dayAcc += scaled;
  while (dayAcc >= SECONDS_PER_DAY) { dayAcc -= SECONDS_PER_DAY; advanceDay(); }
  renderer.render(scene, camera);
}
frame();
