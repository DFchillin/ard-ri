import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera } from './iso_camera.js';
import { Grid } from './grid.js';
import { UI } from './ui.js';

const SEASONS = ['Imbolc', 'Bealtaine', 'Lughnasadh', 'Samhain'];
const TICK = 1 / 3; // seconds of sim time per tick at 1×
const DAYS_PER_SEASON = 20;

const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1418);
scene.fog = new THREE.Fog(0x0b1418, 60, 140);

let aspect = window.innerWidth / window.innerHeight;
const camera = createIsoCamera(14, aspect);

scene.add(new THREE.HemisphereLight(0xdff0ff, 0x3a4a2a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
sun.position.set(40, 70, 20);
scene.add(sun);

const grid = new Grid(scene, 24, 1);

const state = { cattle: 40, silver: 100, folk: 0, day: 1, seasonIdx: 0, speed: 1 };
const markers = new THREE.Group();
scene.add(markers);

const ui = new UI({
  onSpeed: (s) => (state.speed = s),
  onBuildSelect: (kind) => (buildKind = kind),
});
ui.setStats(state);

let buildKind = null;

// --- Placeholder sprite: a stand-in until real iso pixel art is drawn. ---
function placeholderTexture(label, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(64, 12);
  g.lineTo(116, 104);
  g.lineTo(12, 104);
  g.closePath();
  g.fill();
  g.fillStyle = '#1c130a';
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 64, 92);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
const rathTex = placeholderTexture('R', '#e8c96b');

function placeAt(tx, tz) {
  const { x, z } = grid.tileToWorld(tx, tz);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: rathTex }));
  spr.scale.set(2, 2, 2);
  spr.position.set(x, 1, z);
  markers.add(spr);
  state.folk += 4;
  ui.setStats({ folk: state.folk });
}

// The one seed on the empty land, so you arrive to "a dwelling and a dream".
placeAt(12, 12);

// --- DOM -> world placement bridge. UI taps never reach here (see CSS). ---
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (!buildKind) return;
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(grid.ground)[0];
  if (!hit) return;
  const t = grid.worldToTile(hit.point.x, hit.point.z);
  if (t) placeAt(t.tx, t.tz);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ui.setBuild(null);
});

window.addEventListener('resize', () => {
  aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeIsoCamera(camera, aspect);
});

// --- Fixed-timestep sim, scaled by the speed multiplier. ---
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
