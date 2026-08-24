import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, rotateIsoCamera, zoomIsoCamera, cameraDirLabel } from './iso_camera.js';
import { Tilemap, TERRAIN_INFO } from './sim/tilemap.js';
import { WorldView } from './render/world_view.js';
import { BUILDINGS } from './data/buildings.js';
import { Game } from './sim/game.js';
import { UI } from './ui.js';

const SEASONS = ['Imbolc', 'Bealtaine', 'Lughnasadh', 'Samhain'];
const TICK = 1 / 3;
const DAYS_PER_SEASON = 20;

const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1418);
scene.fog = new THREE.Fog(0x0b1418, 70, 170);

let aspect = window.innerWidth / window.innerHeight;
const camera = createIsoCamera(18, aspect);

scene.add(new THREE.HemisphereLight(0xdff0ff, 0x3a4a2a, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.0);
sun.position.set(40, 70, 20);
scene.add(sun);

const map = new Tilemap(32, 1, 7);
const view = new WorldView(scene, map);
const game = new Game(map, scene);

const sim = { day: 1, seasonIdx: 0, speed: 1 };
let tool = null;

const ui = new UI({
  onTool: (kind) => { tool = kind; if (tool !== 'inspect' && tool !== 'road' && !BUILDINGS[tool]) preview.visible = false; },
  onSpeed: (s) => (sim.speed = s),
  onRotate: (d) => ui.setCompass(rotateIsoCamera(camera, d)),
  onZoom: (f) => zoomIsoCamera(camera, f, aspect),
});

function pushStats() {
  ui.setStats({ cattle: game.cattle, silver: game.silver, folk: game.folk,
    day: sim.day, season: SEASONS[sim.seasonIdx] });
  ui.setObjectives(game.objectives);
}
pushStats();
ui.setCompass(cameraDirLabel(camera));

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

// --- Inspect popups ---
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
    if (o && o.userData.person) { ui.showInspect(personHtml(o.userData.person)); return; }
  }
  const hit = raycaster.intersectObject(view.pickPlane)[0];
  if (!hit) return;
  const t = map.worldToTile(hit.point.x, hit.point.z);
  if (!t) return;
  const tile = map.get(t.x, t.z);
  ui.showInspect(tile.occupant ? buildingHtml(tile.occupant) : terrainHtml(tile));
}

// --- Input ---
let painting = false;

canvas.addEventListener('pointerdown', (e) => {
  if (tool === 'inspect') { inspectAt(e); return; }
  const t = tool && tileUnderPointer(e);
  if (!t) return;
  if (tool === 'road') {
    painting = true;
    if (map.setRoad(t.x, t.z, true)) view.rebuildRoads();
  } else if (BUILDINGS[tool] && game.place(tool, footprint(tool, t))) {
    pushStats();
  }
});
canvas.addEventListener('pointermove', (e) => {
  updatePreview(e);
  if (painting && tool === 'road') {
    const t = tileUnderPointer(e);
    if (t && map.setRoad(t.x, t.z, true)) view.rebuildRoads();
  }
});
window.addEventListener('pointerup', () => (painting = false));
canvas.addEventListener('pointerleave', () => (preview.visible = false));

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

window.ardri = { game, map, view, sim };

// --- Fixed-timestep sim scaled by speed ---
let acc = 0;
const clock = new THREE.Clock();

function tick() {
  game.tick();
  sim.day += 1;
  if (sim.day > DAYS_PER_SEASON) { sim.day = 1; sim.seasonIdx = (sim.seasonIdx + 1) % SEASONS.length; }
  pushStats();
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const scaled = dt * sim.speed;
  game.update(scaled);
  acc += scaled;
  while (acc >= TICK) { acc -= TICK; tick(); }
  renderer.render(scene, camera);
}
frame();
