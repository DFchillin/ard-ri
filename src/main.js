import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, rotateIsoCamera, zoomIsoCamera, panIsoCamera, cameraDirLabel } from './iso_camera.js?v=CBUST';
import { Tilemap, TERRAIN_INFO } from './sim/tilemap.js?v=CBUST';
import { WorldView } from './render/world_view.js?v=CBUST';
import { BUILDINGS } from './data/buildings.js?v=CBUST';
import { Game } from './sim/game.js?v=CBUST';
import { UI } from './ui.js?v=CBUST';
import { MONTHS_EN, SEASONS, seasonOfMonth, FESTIVALS } from './sim/calendar.js?v=CBUST';
import { setCamera } from './render/assets.js?v=CBUST';
import { Battle } from './battle/battle.js?v=CBUST';
import { ISLAND, KINGDOMS, NEIGHBOURS, kingdomById } from './data/kingdoms.js?v=CBUST';
import { CODEX } from './data/codex.js?v=CBUST';

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
setCamera(camera); // walkers face by screen direction

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

const map = new Tilemap(32, 1, (Math.random() * 0x7fffffff) | 0); // a fresh ráth-land each session
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
  onTool: (kind) => { cancelPending(); tool = kind; if (!(tool === 'road' || BUILDINGS[tool])) preview.visible = false; game.showInspectDots(kind === 'inspect'); },
  onSpeed: (s) => { sim.speed = s; savedSpeed = null; },
  onRotate: (d) => { if (battle.active) { battle.rotate(d); return; } ui.setCompass(rotateIsoCamera(camera, d)); },
  onZoom: (f) => { if (battle.active) { battle.zoom(f); return; } zoomIsoCamera(camera, f, aspect); },
  onInspectClose: () => resumeGame(),
  onFestivalContinue: () => { if (battleWon) { battleWon = false; battle.exit(); } else resumeGame(); },
  onStartMission: (n) => startMission(n),
  onPlaceConfirm: () => confirmBuild(),
  onPlaceCancel: () => cancelPending(),
  onPlaceAlt: () => altRoute(),
  onLedger: () => showLedger(),
  onAdvisors: () => showAdvisors(),
});

function showAdvisors() {
  const B = game.buildings;
  const sum = (role, key) => B.reduce((n, b) => n + (b.def.role === role ? (b[key] || 0) : 0), 0);
  const fields = game.count('farm');
  const ripe = B.filter((b) => b.def.role === 'farm' && b.ripe).length;
  const st = game.standing();
  const spearmen = Math.floor(game.folk / 2);
  const strength = spearmen + Math.floor(game.cattle / 4) + Math.floor(game.silver / 50);
  const host = strength < 6 ? 'a lone champion'
    : strength < 14 ? 'a cattle-raiding party'
    : strength < 28 ? 'a túath war-band'
    : strength < 48 ? 'a great host'
    : 'an army fit for the High King';
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const html =
    `<h3>Trusted Advisors</h3><div class="role">Counsel at your ear</div>` +
    `<div class="advisor"><h4>🌾 An Rechtaire · the Steward</h4><table class="ledger">` +
      row('Fields sown', fields + (ripe ? ` · ${ripe} ripe` : '')) +
      row('Grain in store', sum('granary', 'stock')) +
      row('At market', sum('market', 'stock')) +
      row('Wells', game.count('well')) +
    `</table></div>` +
    `<div class="advisor"><h4>📜 An tOllamh · the Poet</h4><table class="ledger">` +
      row('Folk', game.folk) +
      row('Content', `${game.folkContent()} / ${game.folk}`) +
      row('Cultured', `${game.culturedFolk()} / ${game.folk}`) +
      row('Shrines', game.count('altar')) +
      `<tr class="net"><td>Standing</td><td>${st.title} · ${st.score}</td></tr>` +
    `</table></div>` +
    `<div class="advisor"><h4>⚔️ An Toísech · the War-Leader</h4><table class="ledger">` +
      row('Cattle', game.cattle) +
      row('Silver', `🪙 ${game.silver}`) +
      row('Fighting folk', spearmen) +
      `<tr class="net"><td>War-band</td><td>${host}</td></tr>` +
    `</table></div>` +
    `<p class="fest-note">The Toísech reckons your strength from folk, cattle and silver — the raid-wealth of a Gaelic king.</p>`;
  ui.showInspect(html, false);
}

function showLedger() {
  const festivalToday = cal.day === 1 && !!FESTIVALS[cal.month];
  const rent = game.dailyRent(festivalToday);
  const wages = game.dailyWages();
  const net = rent - wages;
  const content = game.folkContent();
  const st = game.standing();
  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const html =
    `<h3>The Ledger</h3><div class="role">Rents &amp; wages, each day</div>` +
    `<table class="ledger">` +
    `<tr><td>Treasury</td><td>🪙 ${game.silver}</td></tr>` +
    `<tr><td>Rents in</td><td class="pos">+${rent}</td></tr>` +
    `<tr><td>Wages out</td><td class="neg">−${wages}</td></tr>` +
    `<tr class="net"><td>Net / day</td><td class="${net >= 0 ? 'pos' : 'neg'}">${sign(net)}</td></tr>` +
    `<tr><td>Folk content</td><td>${content} / ${game.folk}</td></tr>` +
    `<tr><td>Folk cultured</td><td>${st.cultured} / ${game.folk}</td></tr>` +
    `<tr class="net"><td>Standing</td><td>${st.title} · ${st.score}</td></tr>` +
    `</table>` +
    (festivalToday ? `<p class="fest-note">Festival today — content folk pay a generous bonus.</p>` : '') +
    (game.broke ? `<p class="fest-note broke">The cauldron runs dry — public folk go unpaid.</p>` : '');
  ui.showInspect(html, false);
}

let battleWon = false;
const battle = new Battle({
  onVictory: (info) => {
    battleWon = true;
    if (info && info.cattle) { game.cattle += info.cattle; pushStats(); }
    ui.showFestival({ name: 'Victory!', emoji: '🏆', sub: (info && info.sub) || 'The enemy slua is broken and flees the field. Ériu will remember this cath.' });
  },
  onTruce: (cattle) => {
    battle.exit();
    if (cattle) { game.cattle = Math.max(0, game.cattle - cattle); pushStats(); }
    ui.showFestival({ name: 'A Truce', emoji: '🕊️', sub: `You paid a bóruma of ${cattle} cattle and withdrew. No blood was shed this day — though the foe remembers your silver.` });
  },
  onExit: () => ui.showTitle(),
});

function startMission(n) {
  n = String(n);
  if (n === '1') { startCampaign(); return; }           // the raid & be-raided loop on the map of Ériu
  if (n === '2') { started = true; triggerFestival(FESTIVALS[1]); return; } // sandbox: build a settlement
  if (n === '3') { battle.enter('attack'); return; }     // sandbox: a pitched battle to test the field
}

// The campaign alternates: you ride out to raid a kingdom, then raiders come
// back to fall upon you — lose the defence and your ráth is ransacked.
function startCampaign() {
  if (!campaign.home) { openKingdomMap('choose', 'war'); return; } // first pick a home, then straight to raiding
  if (campaign.nextIsDefend) { campaign.nextIsDefend = false; saveCampaign(); ui.showFestival({ name: 'Raiders on the Wind', emoji: '🔥', sub: 'Word comes two seasons early: a war-band marches on your ráth. Muster the folk and hold the field.', onDone: () => battle.enter('defend') }); return; }
  openKingdomMap('war');
}

// --- Campaign: a home kingdom and your battle livery, kept per device ---
const CAMPAIGN_KEY = 'ardri_campaign';
let campaign = { home: null, livery: ['#2f5fc0', '#eae2c8'] };
try { const s = localStorage.getItem(CAMPAIGN_KEY); if (s) campaign = Object.assign(campaign, JSON.parse(s)); } catch (e) {}
function saveCampaign() { try { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign)); } catch (e) {} }
battle.setLivery(campaign.livery);

const SVGNS = 'http://www.w3.org/2000/svg';
const kg = { built: false, mode: 'choose', sel: null, regions: {} };
function buildKingdomMap() {
  if (kg.built) return;
  const svg = document.getElementById('kg-map');
  const mk = (tag, a) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  svg.appendChild(mk('rect', { class: 'kg-sea', x: 0, y: 0, width: 360, height: 480 }));
  svg.appendChild(mk('path', { class: 'kg-isle', d: ISLAND }));
  for (const k of KINGDOMS) {
    const poly = mk('polygon', { class: 'kg-region', points: k.pts, fill: k.color });
    poly.addEventListener('click', () => selectKingdom(k.id));
    svg.appendChild(poly); kg.regions[k.id] = poly;
    const t = mk('text', { class: 'kg-label', x: k.label[0], y: k.label[1] }); t.textContent = k.en; svg.appendChild(t);
  }
  kg.homeMark = mk('polygon', { class: 'kg-home', points: '' }); kg.homeMark.style.display = 'none'; svg.appendChild(kg.homeMark);
  document.getElementById('kg-close').addEventListener('click', closeKingdomMap);
  document.getElementById('kg-action').addEventListener('click', kingdomAction);
  const c1 = document.getElementById('kg-c1'), c2 = document.getElementById('kg-c2');
  c1.value = campaign.livery[0]; c2.value = campaign.livery[1];
  const onCol = () => { campaign.livery = [c1.value, c2.value]; battle.setLivery(campaign.livery); drawFlagPreview(); };
  c1.addEventListener('input', onCol); c2.addEventListener('input', onCol);
  document.getElementById('kingdoms-screen').addEventListener('click', (e) => { if (e.target.id === 'kingdoms-screen') closeKingdomMap(); });
  kg.built = true;
}
function drawFlagPreview() {
  const cv = document.getElementById('kg-flag'); if (!cv) return;
  const x = cv.getContext('2d'); x.clearRect(0, 0, 60, 76);
  x.fillStyle = '#6b5230'; x.fillRect(10, 6, 4, 66);
  const X = 14, Y = 8, W = 40, H = 30;
  x.fillStyle = campaign.livery[0]; x.fillRect(X, Y, W, H);
  x.fillStyle = campaign.livery[1]; x.beginPath(); x.arc(X + W / 2, Y + H / 2, 9, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.45)'; x.strokeRect(X, Y, W, H);
}
function selectKingdom(id) {
  if (kg.mode === 'war' && id === campaign.home) return;
  kg.sel = id;
  for (const rid in kg.regions) kg.regions[rid].classList.toggle('sel', rid === id);
  const k = kingdomById(id);
  document.getElementById('kg-none').classList.add('hidden');
  document.getElementById('kg-info').classList.remove('hidden');
  document.getElementById('kg-name').textContent = k.en;
  document.getElementById('kg-ga').textContent = k.ga;
  document.getElementById('kg-seat').textContent = kg.mode === 'war' ? `A raid on ${k.seat}.` : `Seat of ${k.seat}.`;
  const act = document.getElementById('kg-action'); act.disabled = false;
  act.textContent = kg.mode === 'war' ? `Raid ${k.en} ⚔` : `Begin in ${k.en} ▸`;
}
function openKingdomMap(mode, then) {
  buildKingdomMap();
  kg.mode = mode; kg.sel = null; kg.then = then || null;
  document.getElementById('kg-title').textContent = mode === 'war' ? 'Where will you raid?' : 'The Kingdoms of Ériu';
  document.getElementById('kg-hint').textContent = mode === 'war'
    ? 'Choose a kingdom to fall upon. Your own lands are barred.'
    : 'Choose the túath you will call home, and the colours your slua will carry.';
  document.getElementById('kg-none').classList.remove('hidden');
  document.getElementById('kg-info').classList.add('hidden');
  document.getElementById('kg-livery').classList.toggle('hidden', mode === 'war');
  const act = document.getElementById('kg-action'); act.disabled = true;
  act.textContent = mode === 'war' ? 'Raid ⚔' : 'Begin your reign ▸';
  for (const rid in kg.regions) {
    kg.regions[rid].classList.remove('sel');
    kg.regions[rid].classList.toggle('dim', mode === 'war' && rid === campaign.home);
  }
  if (campaign.home && kg.regions[campaign.home]) { kg.homeMark.setAttribute('points', kingdomById(campaign.home).pts); kg.homeMark.style.display = ''; }
  else kg.homeMark.style.display = 'none';
  drawFlagPreview();
  document.getElementById('kingdoms-screen').classList.remove('hidden');
}
function closeKingdomMap() { document.getElementById('kingdoms-screen').classList.add('hidden'); }

// The Celtapedia — built once from the CODEX data.
let codexBuilt = false;
function buildCodex() {
  if (codexBuilt) return;
  const body = document.getElementById('codex-body');
  for (const sec of CODEX) {
    const s = document.createElement('div'); s.className = 'codex-sec';
    const h = document.createElement('h3'); h.textContent = sec.title; s.appendChild(h);
    if (sec.blurb) { const bl = document.createElement('div'); bl.className = 'codex-blurb'; bl.textContent = sec.blurb; s.appendChild(bl); }
    for (const e of sec.entries) {
      const row = document.createElement('div'); row.className = 'codex-entry';
      const ico = document.createElement('div'); ico.className = 'cx-ico'; ico.textContent = e.icon; row.appendChild(ico);
      const main = document.createElement('div'); main.className = 'cx-main';
      main.innerHTML = `<div><span class="cx-name"></span><span class="cx-ga"></span></div><div class="cx-lore"></div><div class="cx-repr">Shown as: <b></b></div>`;
      main.querySelector('.cx-name').textContent = e.name;
      main.querySelector('.cx-ga').textContent = e.ga;
      main.querySelector('.cx-lore').textContent = e.lore;
      main.querySelector('.cx-repr b').textContent = e.repr;
      row.appendChild(main); s.appendChild(row);
    }
    body.appendChild(s);
  }
  document.getElementById('codex-close').addEventListener('click', () => document.getElementById('codex-screen').classList.add('hidden'));
  document.getElementById('codex-screen').addEventListener('click', (ev) => { if (ev.target.id === 'codex-screen') ev.currentTarget.classList.add('hidden'); });
  codexBuilt = true;
}
function openCodex() { buildCodex(); document.getElementById('codex-screen').classList.remove('hidden'); }
function kingdomAction() {
  if (!kg.sel) return;
  if (kg.mode === 'war') { campaign.target = kg.sel; campaign.nextIsDefend = true; saveCampaign(); closeKingdomMap(); battle.enter('attack'); return; }
  campaign.home = kg.sel; saveCampaign(); battle.setLivery(campaign.livery);
  if (kg.then === 'war') { openKingdomMap('war'); return; } // just picked a home for the campaign — ride out to raid
  closeKingdomMap();
}

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
  let festivalToday = false;
  if (cal.day > DAYS_PER_MONTH) {
    cal.day = 1;
    cal.month = (cal.month + 1) % 12;
    const s = seasonOfMonth(cal.month);
    if (s !== curSeason) { curSeason = s; applySeason(s); }
    const fest = FESTIVALS[cal.month];
    if (fest) { festivalToday = true; triggerFestival(fest); }
  }
  const wasBroke = game.broke;
  game.settleDay({ festival: festivalToday }); // rents in, public wages out
  if (game.broke && !wasBroke) triggerAdvisor();
  pushStats();
  updateDate();
}

function triggerAdvisor() {
  pauseGame();
  ui.showFestival({
    name: 'The Dagda',
    emoji: '⚠️',
    sub: 'The cauldron runs dry — your treasury is empty. The folk you keep go unpaid, and the hungry will drift back through the gate. Raise silver before the settlement falters.',
  });
}

applySeason(curSeason);
pushStats();
updateDate();
ui.setCompass(cameraDirLabel(camera));
const mapFab = document.getElementById('map-fab');
if (mapFab) mapFab.addEventListener('click', () => openKingdomMap(campaign.home ? 'war' : 'choose'));
const codexBtn = document.getElementById('codex-open');
if (codexBtn) codexBtn.addEventListener('click', openCodex);
ui.showTitle(); // title screen; Mission One starts the game
if (!campaign.home) openKingdomMap('choose'); // first run: pick a home and colours

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
function addGhostTiles(tiles, { color, opacity, y, roadable }) {
  for (const p of tiles) {
    const c = map.tileToWorld(p.x, p.z);
    const col = roadable ? (map.isRoadable(p.x, p.z) ? 0x66ff66 : 0xff5555) : color;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(map.tile * 0.9, map.tile * 0.9),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(c.x, y, c.z);
    roadGhost.add(m);
  }
}
function showRoadGhost() {
  clearRoadGhost();
  if (!pendingRoad) return;
  // Underlay: the route you drew, in a cool "your path" teal, for comparison.
  addGhostTiles(drawnPath, { color: 0x54c8d8, opacity: 0.35, y: 0.065 });
  // Overlay: the currently-selected option, bright green (red where blocked).
  addGhostTiles(pendingRoad, { opacity: 0.6, y: 0.085, roadable: true });
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

// Trace the tiles the finger actually passes through — "your path".
function extendDrawn(to) {
  if (!drawnPath.length) { pushTile(drawnPath, to.x, to.z); return; }
  let { x, z } = drawnPath[drawnPath.length - 1];
  while (x !== to.x) { x += Math.sign(to.x - x); pushTile(drawnPath, x, z); }
  while (z !== to.z) { z += Math.sign(to.z - z); pushTile(drawnPath, x, z); }
}
// On release, assemble the choices: Deaglán's clean suggestions + your own drawn path.
function buildRoadOptions() {
  const keyOf = (tiles) => tiles.map((p) => p.x + ',' + p.z).sort().join(';');
  const suggested = [
    { name: 'Deaglán’s path', kind: 'deaglan' },
    { name: 'Midir’s path', kind: 'midir' },
  ];
  const opts = [], seen = new Set();
  let si = 0;
  for (const v of [0, 1]) {
    const s = suggestRoute(roadStart, roadEnd, v);
    const k = keyOf(s);
    if (!seen.has(k)) { seen.add(k); opts.push({ ...suggested[si], tiles: s }); si++; }
  }
  const dk = keyOf(drawnPath);
  if (!seen.has(dk)) { seen.add(dk); opts.push({ name: 'Your path', kind: 'mine', tiles: drawnPath.slice() }); }
  roadOptions = opts;
  roadOptIdx = 0;
  pendingRoad = opts[0].tiles;
}
function commitRoad() {
  const opt = roadOptions[roadOptIdx] || { kind: 'deaglan' };
  let changed = false;
  for (const p of pendingRoad) {
    if (map.setRoad(p.x, p.z, true)) { const t = map.get(p.x, p.z); if (t) t.roadKind = opt.kind; changed = true; }
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
  if (d.role === 'dwelling') extra = `<p>Folk: ${inst.pop}/${inst.cap} · Food: ${inst.food}/10 · Water: ${inst.water}/10 · Culture: ${inst.culture}/10</p>`;
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
// Demolish, like build, is confirmed: mark the target red, then "Raze ✓".
function showDemolishGhost(t) {
  if (!t) return;
  const tile = map.get(t.x, t.z);
  if (!tile) return;
  let f;
  if (tile.occupant) { const o = tile.occupant; f = { x: o.x, z: o.z, w: o.w, h: o.h }; }
  else if (tile.blocked || tile.road) f = { x: t.x, z: t.z, w: 1, h: 1 };
  else return; // nothing to remove on bare ground
  pendingDemolish = { x: t.x, z: t.z };
  const cx = f.x * map.tile - map.half + (f.w * map.tile) / 2;
  const cz = f.z * map.tile - map.half + (f.h * map.tile) / 2;
  preview.material.color.set(0xff5555);
  preview.position.set(cx, 0.07, cz);
  preview.scale.set(f.w * map.tile, f.h * map.tile, 1);
  preview.visible = true;
  ghostBox.visible = false;
  ui.showPlaceConfirm({ raze: true });
}
function commitDemolish() {
  if (!pendingDemolish) return;
  const r = game.demolish(pendingDemolish.x, pendingDemolish.z);
  if (r === 'road') { view.rebuildRoads(); view.rebuildCros(); }
  if (r === 'cros') view.rebuildCros();
  if (r) pushStats();
  cancelPending();
}

// --- Input: build / road-paint / demolish / inspect + pan + pinch ---
const pointers = new Map();
let painting = false, demolishing = false, panLast = null, pinchDist = 0;
let pendingBuild = null, movingBuild = false;
let pendingRoad = null, drawingRoad = false;
let pendingDemolish = null;
let roadStart = null, roadEnd = null, drawnPath = [];
let roadOptions = [], roadOptIdx = 0;
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
  if (pendingDemolish) { commitDemolish(); return; }
  if (!pendingBuild || !BUILDINGS[tool]) return;
  const f = footprint(tool, pendingBuild);
  if (game.place(tool, f)) { pushStats(); cancelPending(); }
}
function cancelPending() {
  pendingBuild = null;
  movingBuild = false;
  pendingRoad = null;
  pendingDemolish = null;
  drawingRoad = false;
  roadStart = null;
  roadEnd = null;
  drawnPath = [];
  roadOptions = [];
  roadOptIdx = 0;
  preview.visible = false;
  ghostBox.visible = false;
  clearRoadGhost();
  if (ui.hidePlaceConfirm) ui.hidePlaceConfirm();
}

// "Other" — cycle through Deaglán's suggestions and your own drawn path.
function altRoute() {
  if (roadOptions.length < 2) return;
  roadOptIdx = (roadOptIdx + 1) % roadOptions.length;
  const opt = roadOptions[roadOptIdx];
  pendingRoad = opt.tiles;
  showRoadGhost();
  ui.showPlaceConfirm({ road: true, label: opt.name, alt: true });
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
  if (battle.active) { battle.pointerDown(e); return; }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { panLast = null; painting = false; demolishing = false; pinchDist = pointerDist(); return; }
  if (e.button !== 2) {
    if (tool === 'inspect') { inspectAt(e); return; }
    if (tool === 'demolish') { showDemolishGhost(tileUnderPointer(e)); return; }
    if (tool === 'road') { const t = tileUnderPointer(e); if (t) { roadStart = t; roadEnd = t; drawnPath = [{ x: t.x, z: t.z }]; drawingRoad = true; pendingRoad = drawnPath; showRoadGhost(); } return; }
    if (tool === 'cros') { const t = tileUnderPointer(e); if (t && game.toggleCros(t.x, t.z)) view.rebuildCros(); return; }
    if (BUILDINGS[tool]) { movingBuild = true; showGhostAt(tileUnderPointer(e)); return; }
  }
  panLast = { x: e.clientX, y: e.clientY }; // no build tool, or right-drag → pan
});

canvas.addEventListener('pointermove', (e) => {
  if (battle.active) { battle.pointerMove(e); return; }
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { const d = pointerDist(); if (pinchDist && d > 0) zoomIsoCamera(camera, pinchDist / d, aspect); pinchDist = d; return; }
  if (panLast) { panByScreen(e.clientX - panLast.x, e.clientY - panLast.y); panLast = { x: e.clientX, y: e.clientY }; return; }
  if (drawingRoad && tool === 'road') {
    const t = tileUnderPointer(e);
    if (t && (t.x !== roadEnd.x || t.z !== roadEnd.z)) { roadEnd = t; extendDrawn(t); pendingRoad = drawnPath; showRoadGhost(); }
    return;
  }
  if (movingBuild && BUILDINGS[tool]) { const t = tileUnderPointer(e); if (t) showGhostAt(t); return; }
  if (pendingBuild || pendingRoad || pendingDemolish) return; // ghost locked awaiting confirm
  updatePreview(e);
});

function endPointer(e) {
  canvas.releasePointerCapture?.(e.pointerId);
  if (battle.active) { battle.pointerUp(e); return; }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (pointers.size === 0) {
    painting = false; demolishing = false; panLast = null; movingBuild = false;
    if (drawingRoad) {
      drawingRoad = false;
      if (drawnPath.length) {
        buildRoadOptions();
        showRoadGhost();
        ui.showPlaceConfirm({ road: true, label: roadOptions[0].name, alt: roadOptions.length > 1 });
      } else cancelPending();
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!pendingBuild) preview.visible = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (battle.active) { battle.zoom(e.deltaY > 0 ? 1.1 : 0.9); return; }
  zoomIsoCamera(camera, e.deltaY > 0 ? 1.1 : 0.9, aspect);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (battle.active) return;
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
  battle.resize(aspect);
});

window.ardri = { game, map, view, sim, cal, camera, battle, openKingdomMap, campaign,
  screenOf(tx, tz) { // tile → screen pixels, for headless probes
    const w = map.tileToWorld(tx, tz);
    const v = new THREE.Vector3(w.x, 0.1, w.z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  } };

// --- Loop: economy on ECON_TICK, calendar on SECONDS_PER_DAY ---
let econAcc = 0, dayAcc = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (battle.active) { setCamera(battle.camera); battle.update(dt); battle.render(renderer); return; }
  setCamera(camera);
  const scaled = started ? dt * sim.speed : 0;
  game.update(scaled);
  game.updateFx(dt); // ambient effects run in real time
  econAcc += scaled;
  while (econAcc >= ECON_TICK) { econAcc -= ECON_TICK; game.tick(); pushStats(); checkMission(); }
  dayAcc += scaled;
  while (dayAcc >= SECONDS_PER_DAY) { dayAcc -= SECONDS_PER_DAY; advanceDay(); }
  renderer.render(scene, camera);
}
frame();
