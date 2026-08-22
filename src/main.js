import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera } from './iso_camera.js';
import { Tilemap } from './sim/tilemap.js';
import { WorldView } from './render/world_view.js';
import { BUILDINGS } from './data/buildings.js';
import { UI } from './ui.js';
import { makeBuildingSprite } from './render/sprites.js';

const SEASONS = ['Imbolc', 'Bealtaine', 'Lughnasadh', 'Samhain'];
const TICK = 1 / 3;
const DAYS_PER_SEASON = 20;

const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1418);
scene.fog = new THREE.Fog(0x0b1418, 70, 160);

let aspect = window.innerWidth / window.innerHeight;
const camera = createIsoCamera(18, aspect);

scene.add(new THREE.HemisphereLight(0xdff0ff, 0x3a4a2a, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.0);
sun.position.set(40, 70, 20);
scene.add(sun);

const map = new Tilemap(32, 1, 7);
const view = new WorldView(scene, map);

const buildings = new THREE.Group();
scene.add(buildings);

const state = { cattle: 40, silver: 100, folk: 0, day: 1, seasonIdx: 0, speed: 1 };
let tool = null; // building key, 'road', or null

const ui = new UI({
  onSpeed: (s) => (state.speed = s),
  onBuildSelect: (kind) => (tool = kind),
});
ui.setStats(state);

// --- Placement preview (green = ok, red = blocked). ---
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

function tileUnderPointer(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(view.pickPlane)[0];
  if (!hit) return null;
  return map.worldToTile(hit.point.x, hit.point.z);
}

function footprint(kind, t) {
  const [w, h] = BUILDINGS[kind].footprint;
  const x = t.x - Math.floor((w - 1) / 2);
  const z = t.z - Math.floor((h - 1) / 2);
  return { x, z, w, h };
}

function updatePreview(e) {
  const t = tool && tileUnderPointer(e);
  if (!t) { preview.visible = false; return; }
  if (tool === 'road') {
    const c = map.tileToWorld(t.x, t.z);
    preview.position.set(c.x, 0.06, c.z);
    preview.scale.set(map.tile, map.tile, 1);
    preview.material.color.set(map.isRoadable(t.x, t.z) ? 0x66ff66 : 0xff5555);
  } else if (BUILDINGS[tool]) {
    const f = footprint(tool, t);
    const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
    const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
    preview.position.set(cx, 0.06, cz);
    preview.scale.set(f.w * map.tile, f.h * map.tile, 1);
    preview.material.color.set(map.canPlace(f.x, f.z, f.w, f.h) ? 0x66ff66 : 0xff5555);
  }
  preview.visible = true;
}

function placeBuilding(kind, f) {
  const def = BUILDINGS[kind];
  if (state.silver < def.cost || !map.canPlace(f.x, f.z, f.w, f.h)) return;
  map.place(f.x, f.z, f.w, f.h, kind);
  const spr = makeBuildingSprite(def.sprite, def.label[0]);
  const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
  const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
  spr.scale.setScalar(Math.max(f.w, f.h) * 1.3 + 0.6);
  spr.position.set(cx, 0, cz);
  buildings.add(spr);
  state.silver -= def.cost;
  state.folk += def.folk;
  ui.setStats({ silver: state.silver, folk: state.folk });
}

// --- Input: road painting + building placement. ---
let painting = false;

canvas.addEventListener('pointerdown', (e) => {
  const t = tool && tileUnderPointer(e);
  if (!t) return;
  if (tool === 'road') {
    painting = true;
    if (map.setRoad(t.x, t.z, true)) view.rebuildRoads();
  } else if (BUILDINGS[tool]) {
    placeBuilding(tool, footprint(tool, t));
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

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { ui.setBuild(null); preview.visible = false; }
});

window.addEventListener('resize', () => {
  aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeIsoCamera(camera, aspect);
});

// Seed dwelling so you arrive to "a dwelling and a dream".
placeBuilding('rath', footprint('rath', { x: 16, z: 16 }));
state.silver = 100;
ui.setStats(state);

// --- Fixed-timestep sim scaled by speed. ---
let acc = 0;
const clock = new THREE.Clock();

function tick() {
  state.day += 1;
  if (state.day > DAYS_PER_SEASON) {
    state.day = 1;
    state.seasonIdx = (state.seasonIdx + 1) % SEASONS.length;
  }
  ui.setStats({ day: state.day, season: SEASONS[state.seasonIdx] });
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  acc += dt * state.speed;
  while (acc >= TICK) {
    acc -= TICK;
    tick();
  }
  renderer.render(scene, camera);
}
frame();
