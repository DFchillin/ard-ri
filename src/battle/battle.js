import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera, rotateIsoCamera, zoomIsoCamera, panIsoCamera } from '../iso_camera.js?v=CBUST';
import { Tilemap, T } from '../sim/tilemap.js?v=CBUST';
import { WorldView } from '../render/world_view.js?v=CBUST';
import { makeBuildingChip, makeWalkerChip } from '../render/chips.js?v=CBUST';
import { UNIT_TYPES, FORMATIONS, FORMATION_KEYS, matchup, ROUT_MISNEACH, nextNickname, UPSKILL, EMPLOYEES } from './units.js?v=CBUST';

const MAP = 20;
const CLASH_DT = 0.5;
const MOVE = 0.7;
const ATTACK_RANGE = 1.7;
const AGGRO = 6;
const KU = 0.2;
const KB = 0.4;
const TEAM = { player: 0x4a86ff, enemy: 0xe0563a };

// Enemy hosts are pre-mustered; the player musters their own companies on their
// side of the pitch. musterMinZ marks the player's side (tile z >= this).
const SCENARIOS = {
  defend: {
    title: 'Cosaint — hold your ráth', defend: true, musterMinZ: 6,
    // the ráth sits at the back (south), behind the defending line
    buildings: [
      { role: 'dwelling', x: 5, z: 15, w: 2, h: 2, hp: 24, team: 'player' },
      { role: 'dwelling', x: 13, z: 15, w: 2, h: 2, hp: 24, team: 'player' },
      { role: 'granary', x: 9, z: 16, w: 2, h: 2, hp: 34, team: 'player' },
    ],
    availability: { villager: 8, water: 4, grain: 4, deaglan: 1, druid: 3, seasoned: 6, curadh: 2, cuchulainn: 1, fionn: 1, dagda: 1, morrigan: 1 },
    enemyCompanies: [
      { name: ['Fomhóraigh', 'the Fomorians'], formation: 'wall', types: ['seasoned', 'seasoned', 'seasoned', 'seasoned', 'villager', 'villager'], x: 10, z: 2 },
      { name: ['Lucht Mara', 'the sea-host'], formation: 'wedge', types: ['villager', 'villager', 'villager', 'villager', 'seasoned'], x: 5, z: 2 },
    ],
    enemyLone: [['curadh', 15, 2]],
  },
};

let _uid = 0;

export class Battle {
  constructor({ onVictory, onExit, onTruce } = {}) {
    this.onVictory = onVictory || (() => {});
    this.onExit = onExit || (() => {});
    this.onTruce = onTruce || (() => {});
    this.active = false; this.phase = 'idle'; this.started = false;
    this.units = []; this.companies = []; this.buildings = []; this.selected = new Set();
    this.forming = null; this.placing = false;
    this._clashAcc = 0; this._pointers = new Map();
    // Your war-band, kept in memory between battles: folk grow tiers by surviving
    // wins, and fall in defeat. (Later this is derived from the settlement itself.)
    this.roster = { villager: 6, water: 3, grain: 3, deaglan: 1, druid: 2, warrior: 3, seasoned: 2, curadh: 1, cuchulainn: 1, fionn: 1, dagda: 1, morrigan: 1 };
    this.employeeDebt = 0; // city folk lost, awaiting replacement

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1d2a19);
    this.aspect = window.innerWidth / window.innerHeight;
    this.camera = createIsoCamera(13, this.aspect);
    // gentler light so the pasture doesn't blow out to washed yellow-green
    this.scene.add(new THREE.HemisphereLight(0xcdd8c6, 0x445536, 1.15));
    const sun = new THREE.DirectionalLight(0xf6f2e2, 1.15); sun.position.set(30, 60, 20); this.scene.add(sun);

    this.map = new Tilemap(MAP, 1, 9);
    this._carveObstacles();
    this.view = new WorldView(this.scene, this.map);
    this.pickPlane = this.view.pickPlane;
    this.unitGroup = new THREE.Group(); this.scene.add(this.unitGroup);
    this.buildingGroup = new THREE.Group(); this.scene.add(this.buildingGroup);
    this.raycaster = new THREE.Raycaster();
    this._dom();
  }

  _worldOf(tx, tz) { return { x: tx - this.map.half + 0.5, z: tz - this.map.half + 0.5 }; }

  // Tactical obstacle terrain: mires on the flanks, a boggy neck up the middle,
  // so a charge up the wings bogs down and the ground shapes the fight.
  _carveObstacles() {
    const set = (x, z, t) => { const tile = this.map.get(x, z); if (tile) tile.terrain = t; };
    for (let x = 2; x <= 6; x++) { set(x, 8, T.BOG); set(x, 9, T.BOG); }
    for (let x = 14; x <= 18; x++) { set(x, 8, T.BOG); set(x, 9, T.BOG); }
    set(9, 6, T.BOG); set(10, 6, T.BOG); set(10, 5, T.BOG); set(9, 5, T.BOG);
    set(4, 12, T.WATER); set(3, 12, T.WATER); set(16, 12, T.WATER); set(17, 12, T.WATER);
  }
  _terrainFactor(x, z) {
    const tl = this.map.worldToTile(x, z); if (!tl) return 1;
    const t = this.map.get(tl.x, tl.z); if (!t) return 1;
    return t.terrain === T.WATER ? 0.4 : t.terrain === T.BOG ? 0.5 : t.terrain === T.ROCK ? 0.5 : t.terrain === T.WOODS ? 0.75 : 1;
  }

  // ---------- entry & muster ----------
  enter(scenario = 'defend') {
    this.scenario = scenario;
    this.cfg = SCENARIOS[scenario] || SCENARIOS.defend;
    this.active = true; this.started = false; this.phase = 'muster';
    for (const u of this.units) this.unitGroup.remove(u.mesh);
    for (const b of this.buildings) { this.buildingGroup.remove(b.chip); this.buildingGroup.remove(b.bar); }
    this.units = []; this.companies = []; this.buildings = []; this.selected.clear();
    for (const d of this.cfg.buildings || []) this._spawnBuilding(d);
    for (const c of this.cfg.enemyCompanies || []) this._placeCompany('enemy', c.name, c.formation, c.types, this._worldOf(c.x, c.z));
    for (const [t, x, z] of this.cfg.enemyLone || []) this._placeCompany('enemy', null, 'loose', [t], this._worldOf(x, z));
    this.forming = { types: [], name: nextNickname(), formation: 'wall' };
    this.pool = Object.assign({}, this.roster); // muster draws from your war-band
    document.getElementById('battle-ui').classList.remove('hidden');
    document.getElementById('battle-sidebar').classList.remove('hidden');
    document.body.classList.add('in-battle');
    this._showPhase(); this._renderMuster();
  }
  exit() {
    this.active = false; this.started = false; this.phase = 'idle';
    document.getElementById('battle-ui').classList.add('hidden');
    document.getElementById('battle-sidebar').classList.add('hidden');
    document.body.classList.remove('in-battle');
    this.onExit();
  }

  // ---------- parley ----------
  rideToParley() {
    if (this.phase !== 'muster') return;
    if (!this.companies.some((c) => c.team === 'player')) { this._flashMuster('Muster at least one company.'); return; }
    this.phase = 'parley'; this._showPhase(); this._showParley();
  }
  backToMuster() {
    if (this.phase !== 'parley') return;
    document.getElementById('parley-overlay').classList.add('hidden');
    this.phase = 'muster'; this._showPhase(); this._renderMuster();
  }
  _commence() {
    document.getElementById('parley-overlay').classList.add('hidden');
    // the mustered folk march out of the war-band; survivors return after the battle
    for (const u of this.units) if (u.team === 'player') this.roster[u.type] = Math.max(0, (this.roster[u.type] || 0) - 1);
    this.phase = 'battle'; this.started = true;
    for (const c of this.companies) {
      if (c.team === 'enemy' && this.cfg.defend) { const b = pick(c, this.buildings.filter((x) => !x.dead)); if (b) c.target = { foe: b }; }
      if (c.team === 'player' && this.cfg.defend) c.morale = Math.min(100, c.morale + 6);
    }
    this._showPhase();
  }

  _strength(team) {
    let s = 0;
    for (const u of this.units) if (u.team === team && !u.dead) { const t = UNIT_TYPES[u.type]; s += t.atk * t.hp * (1 + (t.aura || 0) / 15); }
    return Math.round(s);
  }
  _hostLines(team) {
    return this.companies.filter((c) => c.team === team).map((c) => {
      const lead = UNIT_TYPES[c.leader.type];
      const tag = lead.cat === 'god' ? ' ⚡' : lead.cat === 'hero' ? ' ★' : '';
      return `<li>${c.name ? c.name[0] : lead.label} <small>×${c.units.length} · ${lead.label}${tag}</small></li>`;
    }).join('');
  }
  _showParley() {
    const ps = this._strength('player'), es = this._strength('enemy');
    const gods = this.units.filter((u) => u.team === 'enemy' && UNIT_TYPES[u.type].cat === 'god').length;
    const heroes = this.units.filter((u) => u.team === 'enemy' && UNIT_TYPES[u.type].cat === 'hero').length;
    const r = ps / Math.max(1, es);
    let stance, tribute, mood;
    if (r >= 1.35) { stance = 'offer'; tribute = Math.round(es * 0.06) + 4; mood = 'Their captain looks over your host and blanches. He would sooner pay than bleed.'; }
    else if (r <= 0.72) { stance = 'demand'; tribute = Math.round(ps * 0.08) + 5; mood = (gods || heroes) ? 'Their captain is unafraid — greater names stand at his back. He bids you yield.' : 'Their captain is unafraid — he counts far more spears than you can field, and bids you yield.'; }
    else { stance = 'even'; tribute = Math.round(ps * 0.07) + 4; mood = 'The captains take each other\'s measure. It is finely balanced — this will be a hard day.'; }
    const revealed = (gods || heroes) ? ` <span class="parley-warn">${gods ? gods + ' god' + (gods > 1 ? 's' : '') : ''}${gods && heroes ? ' & ' : ''}${heroes ? heroes + ' hero' + (heroes > 1 ? 'es' : '') : ''} among them.</span>` : '';
    document.getElementById('parley-body').innerHTML =
      `<p class="parley-mood">${mood}</p>` +
      `<div class="parley-hosts"><div><h4>Their host <span>⚔ ${es}</span></h4><ul>${this._hostLines('enemy')}</ul>${revealed}</div>` +
      `<div><h4>Your slua <span>⚔ ${ps}</span></h4><ul>${this._hostLines('player')}</ul></div></div>`;
    const acts = document.getElementById('parley-actions'); acts.innerHTML = '';
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = label; b.addEventListener('click', fn); acts.appendChild(b); };
    if (stance === 'offer') {
      btn(`Accept their surrender ▸<small>+${tribute} cattle bóruma</small>`, 'parley-yes', () => this._parleyWin(tribute));
      btn('No mercy — give battle', 'parley-fight', () => this._commence());
    } else if (stance === 'demand') {
      btn('Give battle — we do not yield', 'parley-fight', () => this._commence());
      btn(`Pay the bóruma & withdraw<small>−${tribute} cattle</small>`, 'parley-pay', () => this._parleyTruce(tribute));
    } else {
      btn('Give battle', 'parley-fight', () => this._commence());
      btn(`Sue for peace & withdraw<small>−${tribute} cattle</small>`, 'parley-pay', () => this._parleyTruce(tribute));
    }
    btn('↩ back to the muster', 'parley-back', () => this.backToMuster());
    document.getElementById('parley-overlay').classList.remove('hidden');
  }
  _parleyWin(cattle) {
    document.getElementById('parley-overlay').classList.add('hidden');
    this.onVictory({ sub: `Rather than face your slua, they laid down their spears and paid a bóruma of ${cattle} cattle. A bloodless victory — Ériu remembers.`, cattle });
  }
  _parleyTruce(cattle) {
    document.getElementById('parley-overlay').classList.add('hidden');
    this.onTruce(cattle);
  }

  // ---------- building ----------
  _spawnBuilding(d) {
    for (let dz = 0; dz < d.h; dz++) for (let dx = 0; dx < d.w; dx++) {
      const t = this.map.get(d.x + dx, d.z + dz); if (t) { t.terrain = 0; t.road = false; t.occupant = null; }
    }
    const chip = makeBuildingChip(d.role, d.w, d.h, this.map.tile);
    const cx = d.x - this.map.half + d.w / 2, cz = d.z - this.map.half + d.h / 2;
    chip.position.set(cx, 0, cz);
    const bar = makeBar(1.4); bar.position.set(cx, 2.6, cz);
    this.buildingGroup.add(bar); this.buildingGroup.add(chip);
    const b = { id: ++_uid, team: d.team || 'enemy', kind: 'building', chip, bar, pos: { x: cx, z: cz }, w: d.w, h: d.h, hp: d.hp, hp0: d.hp, dead: false };
    drawBar(bar, 1, 0x6cc551); this.buildings.push(b); return b;
  }

  // ---------- companies & units ----------
  _placeCompany(team, name, formation, types, at) {
    const co = { id: ++_uid, team, name: name || null, formation, units: [], leader: null, morale: 0, target: null, routing: false, lone: types.length === 1 };
    const slots = formationSlots(types.length, FORMATIONS[formation]);
    types.forEach((type, i) => {
      const s = slots[i];
      const u = this._makeUnit(team, type, at.x + s.dx, at.z + s.dz, co);
      u.slot = s; co.units.push(u);
    });
    co.leader = co.units.reduce((a, b) => (UNIT_TYPES[b.type].rank >= UNIT_TYPES[a.type].rank ? b : a), co.units[0]);
    const avg = co.units.reduce((n, u) => n + UNIT_TYPES[u.type].morale, 0) / co.units.length;
    const lead = co.lone ? 0 : (UNIT_TYPES[co.leader.type].rank - 1) * 4;
    const aura = Math.max(...co.units.map((u) => UNIT_TYPES[u.type].aura));
    co.morale = Math.min(100, avg + lead + aura);
    co.morale0 = co.morale;
    // a standard borne by the leader marks the company's ground
    co.flag = makeFlag(team, UNIT_TYPES[co.leader.type]);
    co.flag.position.y = (UNIT_TYPES[co.leader.type].piece ? UNIT_TYPES[co.leader.type].piece.tall + 0.6 : 1.7);
    co.leader.mesh.add(co.flag);
    this.companies.push(co);
    return co;
  }

  _makeUnit(team, type, x, z, co) {
    const t = UNIT_TYPES[type];
    const u = { id: ++_uid, team, type, company: co, kind: 'unit', hp: t.hp, hp0: t.hp, atk: t.atk, build: t.build,
      pos: { x, z }, dead: false, mesh: null, slot: { dx: 0, dz: 0 } };
    const mesh = makeUnitVisual(type, team);
    mesh.position.set(x, 0, z);
    u.mesh = mesh; u.ring = mesh.userData.ring; u.bar = mesh.userData.bar;
    drawBar(u.bar, 1, 0x6cc551);
    this.unitGroup.add(mesh); this.units.push(u);
    return u;
  }

  _liveCompanies(team) { return this.companies.filter((c) => c.team === team && !c.routing && c.units.some((u) => !u.dead)); }
  _liveUnits(team) { return this.units.filter((u) => u.team === team && !u.dead && !u.company.routing); }

  // ---------- sim ----------
  update(dt) {
    if (!this.active) return;
    if (this.phase !== 'battle' || !this.started) return;
    dt = Math.min(dt, 0.05);
    for (const c of this.companies) if (c.cryT > 0) c.cryT -= dt;
    for (const u of this.units) if (!u.dead) this._move(u, dt);
    this._clashAcc += dt;
    if (this._clashAcc >= CLASH_DT) { this._clashAcc -= CLASH_DT; this._clash(); this._checkEnd(); }
    if (this.selected.size) this._renderCommand();
  }

  _companyPos(c) { const l = c.units.filter((u) => !u.dead); if (!l.length) return null; let x = 0, z = 0; for (const u of l) { x += u.pos.x; z += u.pos.z; } return { x: x / l.length, z: z / l.length }; }
  _targetPos(c) { const t = c.target; if (!t) return null; if (t.foe) return t.foe.dead ? null : t.foe.pos; if (t.point) return t.point; return null; }

  _move(u, dt) {
    const c = u.company;
    if (c.routing) {
      const spd = UNIT_TYPES[u.type].speed * MOVE * 1.1;
      const dz = (u.team === 'player' ? this.map.half + 3 : -this.map.half - 3) - u.pos.z;
      u.pos.z += Math.sign(dz) * Math.min(spd * dt, Math.abs(dz));
      if (Math.abs(u.pos.z) > this.map.half + 1) { u.dead = true; u.fled = true; this.unitGroup.remove(u.mesh); }
      else u.mesh.position.set(u.pos.x, 0, u.pos.z);
      return;
    }
    // hold to fight an enemy already in reach
    const enemies = u.team === 'player' ? this._liveUnits('enemy') : this._liveUnits('player');
    for (const o of enemies) if (dist2(u.pos, o.pos) <= ATTACK_RANGE * ATTACK_RANGE) return;
    const cp = this._targetPos(c); if (!cp) return;
    const isFoe = !!(c.target && c.target.foe);
    const dest = { x: cp.x + u.slot.dx, z: cp.z + u.slot.dz };
    const spd = UNIT_TYPES[u.type].speed * MOVE * FORMATIONS[c.formation].speed * this._terrainFactor(u.pos.x, u.pos.z);
    const dx = dest.x - u.pos.x, dz = dest.z - u.pos.z, dist = Math.hypot(dx, dz);
    const stop = isFoe ? ATTACK_RANGE - 0.3 : 0.15;
    if (dist > stop) {
      const step = Math.min(spd * dt, dist);
      u.pos.x += (dx / dist) * step; u.pos.z += (dz / dist) * step;
      u.mesh.position.set(u.pos.x, 0, u.pos.z);
      if (u.mesh.userData.spr && u.mesh.userData.spr.faceWorld) u.mesh.userData.spr.faceWorld(dx, dz);
    } else if (c.target && c.target.point && this._companyArrived(c)) c.target = null;
  }
  _companyArrived(c) { const cp = this._targetPos(c); if (!cp) return true; return c.units.every((u) => u.dead || Math.hypot(u.pos.x - cp.x - u.slot.dx, u.pos.z - cp.z - u.slot.dz) < 0.6); }

  _dmgTo(att, def) {
    const f = FORMATIONS[att.company.formation];
    const cry = att.company.cryT > 0 ? 1.25 : 1.0;
    if (def.kind === 'building') return att.build * (att.company.morale / 100) * f.atk * cry * KB;
    return att.atk * (att.company.morale / 100) * f.atk * matchup(att.type, def.type) * cry * KU;
  }

  _clash() {
    const F = this._liveUnits('player'), E = this._liveUnits('enemy');
    // re-acquire spent company targets: raiders press to the next building, else guard
    for (const c of [...this._liveCompanies('player'), ...this._liveCompanies('enemy')]) {
      const stale = !c.target || (c.target.foe && c.target.foe.dead);
      if (!stale) continue;
      let n = null;
      if (this.cfg.defend && c.team === 'enemy') n = pick(c, this.buildings.filter((b) => !b.dead && b.team !== 'enemy'));
      if (!n) { const cp = this._companyPos(c); if (cp) n = nearest({ pos: cp }, (c.team === 'player' ? E : F)); }
      c.target = n ? { foe: n } : null;
    }
    // gather blows: nearest enemy unit in reach, else an adjacent enemy building
    const dmg = new Map(); const add = (t, n) => dmg.set(t, (dmg.get(t) || 0) + n);
    const took = new Map();
    for (const u of [...F, ...E]) {
      const foes = u.team === 'player' ? E : F;
      let tgt = null, td = ATTACK_RANGE * ATTACK_RANGE;
      for (const o of foes) { const d = dist2(u.pos, o.pos); if (d < td) { td = d; tgt = o; } }
      if (!tgt) for (const b of this.buildings) if (!b.dead && b.team !== u.team &&
        Math.abs(u.pos.x - b.pos.x) <= b.w / 2 + ATTACK_RANGE - 0.4 && Math.abs(u.pos.z - b.pos.z) <= b.h / 2 + ATTACK_RANGE - 0.4) { tgt = b; break; }
      if (tgt) add(tgt, this._dmgTo(u, tgt));
    }
    for (const [t, n] of dmg) {
      t.hp -= n;
      if (t.kind === 'unit') took.set(t.company, (took.get(t.company) || 0) + n);
      if (t.hp <= 0) {
        t.dead = true;
        if (t.kind === 'building') { this.buildingGroup.remove(t.chip); this.buildingGroup.remove(t.bar); }
        else { t.killed = true; this.unitGroup.remove(t.mesh); if (t.company.leader === t) took.set(t.company, (took.get(t.company) || 0) + t.hp0 * 2); } // a fallen leader shakes the company
      }
    }
    // collective morale per company
    for (const c of this.companies) {
      if (c.routing) continue;
      const alive = c.units.filter((u) => !u.dead);
      if (!alive.length) continue;
      const dealt = took.get(c) || 0;
      if (dealt > 0) {
        const cp = this._companyPos(c);
        let foes = 0, friends = 0;
        for (const o of this.units) if (!o.dead && !o.company.routing && dist2(o.pos, cp) < 16) (o.team === c.team ? friends++ : foes++);
        c.morale -= (dealt / c.morale0) * 26 + Math.max(0, foes - friends) * 1.5;
      } else c.morale += 4 * CLASH_DT;
      c.morale = Math.max(0, Math.min(100, c.morale));
      if (c.morale < ROUT_MISNEACH) { c.routing = true; this.selected.delete(c); }
      for (const u of alive) {
        drawBar(u.bar, Math.max(0, u.hp) / u.hp0, u.hp / u.hp0 > 0.5 ? 0x6cc551 : u.hp / u.hp0 > 0.25 ? 0xe0b83a : 0xe0563a);
        u.mesh.children.forEach((ch) => { if (ch.material && ch.material.opacity !== undefined && ch !== u.ring) ch.material.opacity = c.routing ? 0.5 : (u.mesh.userData.spr ? 1 : 1); });
      }
    }
    for (const b of this.buildings) if (!b.dead) drawBar(b.bar, Math.max(0, b.hp) / b.hp0, b.hp / b.hp0 > 0.5 ? 0x6cc551 : 0xe0b83a);
    this._showPhase();
  }

  _checkEnd() {
    if (!this.started) return;
    const rath = this.buildings.some((b) => !b.dead && b.team === 'player');
    if (this._liveCompanies('enemy').length === 0) { this.started = false; const s = this._resolveRoster(true); this.onVictory({ sub: 'The enemy slua is broken and flees the field. ' + s }); }
    else if (this._liveCompanies('player').length === 0) { this.started = false; this._defeat('Your slua is broken. ' + this._resolveRoster(false)); }
    else if (this.cfg.defend && !rath) { this.started = false; this._defeat('Your ráth is burned. ' + this._resolveRoster(false)); }
  }

  // After a battle the survivors return to the war-band; on a win some grow a
  // tier, and the fallen (city folk especially) leave a hole to fill.
  _resolveRoster(won) {
    const grew = {}; let fell = 0, empLost = 0;
    for (const u of this.units) {
      if (u.team !== 'player') continue;
      if (u.killed) { fell++; if (EMPLOYEES.includes(u.type)) empLost++; continue; }
      let t = u.type; // survivors (alive or fled home) return
      if (won && UPSKILL[t] && Math.random() < (UPSKILL[t] === 'seasoned' ? 0.32 : 0.4)) { t = UPSKILL[t]; grew[t] = (grew[t] || 0) + 1; }
      this.roster[t] = (this.roster[t] || 0) + 1;
    }
    this.employeeDebt += empLost;
    const grewStr = Object.entries(grew).map(([k, n]) => `${n} rose to ${UNIT_TYPES[k].label}`).join(', ');
    if (won) return `The host returns${grewStr ? ' — ' + grewStr : ''}${fell ? `; ${fell} fell` : ' with no losses'}.` + (empLost ? ` (${empLost} of the settlement's own lost — two seasons to replace.)` : '');
    return `${fell} fell and the rest scattered home.` + (empLost ? ` ${empLost} city folk among the dead — two seasons to replace.` : '');
  }

  // ---------- input ----------
  _screen(pos) { const v = new THREE.Vector3(pos.x, 0.4, pos.z).project(this.camera); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }; }
  _worldAt(e) {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.pickPlane)[0];
    return hit ? { x: hit.point.x, z: hit.point.z, tile: this.map.worldToTile(hit.point.x, hit.point.z) } : null;
  }
  _companyAt(w, team) {
    let best = null, bd = 1.0;
    for (const u of this.units) if (!u.dead && !u.company.routing && (!team || u.team === team)) { const d = dist2(u.pos, w); if (d < bd) { bd = d; best = u.company; } }
    return best;
  }

  pointerDown(e) {
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size >= 2) { this._pinch = this._pointerDist(); this._panMid = this._pointerMid(); this._dragStart = null; return; }
    if (e.button === 2) { this._panLast = { x: e.clientX, y: e.clientY }; return; } // right-drag pans
    this._dragStart = { x: e.clientX, y: e.clientY }; this._dragging = false;
  }
  pointerMove(e) {
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size >= 2) { const d = this._pointerDist(); if (this._pinch && d > 0) this.zoom(this._pinch / d); this._pinch = d;
      const m = this._pointerMid(); if (this._panMid) this._panScreen(m.x - this._panMid.x, m.y - this._panMid.y); this._panMid = m; return; }
    if (this._panLast) { this._panScreen(e.clientX - this._panLast.x, e.clientY - this._panLast.y); this._panLast = { x: e.clientX, y: e.clientY }; return; }
    if (!this._dragStart) return;
    const dx = e.clientX - this._dragStart.x, dy = e.clientY - this._dragStart.y;
    if (!this._dragging && Math.hypot(dx, dy) > 8) this._dragging = true;
    if (this._dragging && this.phase === 'battle') {
      const box = document.getElementById('battle-select-box');
      box.style.left = Math.min(e.clientX, this._dragStart.x) + 'px'; box.style.top = Math.min(e.clientY, this._dragStart.y) + 'px';
      box.style.width = Math.abs(dx) + 'px'; box.style.height = Math.abs(dy) + 'px'; box.classList.remove('hidden');
    }
  }
  pointerUp(e) {
    const wasMulti = this._pointers.size >= 2;
    this._pointers.delete(e.pointerId);
    if (this._panLast && e.button === 2) { this._panLast = null; return; }
    if (wasMulti || this._pointers.size >= 1) { this._panMid = null; this._pinch = 0; return; }
    document.getElementById('battle-select-box').classList.add('hidden');
    if (!this._dragStart) return;
    const start = this._dragStart; this._dragStart = null;
    if (this._dragging) {
      this._dragging = false;
      if (this.phase !== 'battle') return;
      const x0 = Math.min(e.clientX, start.x), x1 = Math.max(e.clientX, start.x), y0 = Math.min(e.clientY, start.y), y1 = Math.max(e.clientY, start.y);
      const cos = new Set();
      for (const u of this._liveUnits('player')) { const s = this._screen(u.pos); if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) cos.add(u.company); }
      this._select([...cos]); return;
    }
    const w = this._worldAt(e); if (!w) return;
    if (this.phase === 'muster') { this._musterTap(w); return; }
    // battle tap: command or select
    const foeCo = this._companyAt(w, 'enemy'); const bld = this._buildingAt(w); const friendCo = this._companyAt(w, 'player');
    if (this.selected.size && (foeCo || bld)) { const tgt = foeCo ? foeCo.units.find((u) => !u.dead) : bld; for (const c of this.selected) c.target = { foe: tgt }; }
    else if (friendCo) this._select([friendCo]);
    else if (this.selected.size) for (const c of this.selected) c.target = { point: { x: w.x, z: w.z } };
  }
  _buildingAt(w) { for (const b of this.buildings) if (!b.dead) { if (Math.abs(w.x - b.pos.x) <= b.w / 2 + 0.4 && Math.abs(w.z - b.pos.z) <= b.h / 2 + 0.4) return b; } return null; }
  _pointerDist() { const p = [...this._pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  _pointerMid() { const p = [...this._pointers.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; }
  _panScreen(dxPix, dyPix) {
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(f.z, 0, -f.x);
    const wpp = (2 * this.camera.userData.viewSize) / window.innerHeight;
    const mx = -dxPix * wpp, my = dyPix * wpp;
    panIsoCamera(this.camera, r.x * mx + f.x * my, r.z * mx + f.z * my);
  }

  // muster: place the forming company where the player taps their side
  _musterTap(w) {
    if (!this.placing || !this.forming.types.length) return;
    if (w.tile.z < this.cfg.musterMinZ) { this._flashMuster('Set your folk on your own side of the pitch.'); return; }
    this._placeCompany('player', this.forming.name, this.forming.formation, this.forming.types.slice(), { x: w.x, z: w.z });
    for (const k of this.forming.types) if (this.pool[k] != null) this.pool[k] = Math.max(0, this.pool[k] - 1); // spend from the muster
    this.forming = { types: [], name: nextNickname(), formation: this.forming.formation };
    this.placing = false; this._renderMuster();
  }

  rotate(d) { rotateIsoCamera(this.camera, d); }
  zoom(f) { zoomIsoCamera(this.camera, f, this.aspect); }
  resize(aspect) { this.aspect = aspect; resizeIsoCamera(this.camera, aspect); }
  render(renderer) { renderer.render(this.scene, this.camera); }

  // ---------- selection ----------
  _select(list) {
    for (const c of this.selected) for (const u of c.units) if (u.ring) restoreRing(u);
    this.selected = new Set(list);
    for (const c of this.selected) for (const u of c.units) if (u.ring) selectRing(u);
    this._renderCommand();
  }
  setFormation(form) { for (const c of this.selected) c.formation = form; this._renderCommand(); }
  battleCry() { for (const c of this.selected) if (!c.routing && (!c.cd || c.cd <= 0)) { c.morale = Math.min(100, c.morale + 22); c.cryT = 4; c.cd = 14; } this._renderCommand(); }

  // ---------- DOM ----------
  _dom() {
    document.getElementById('battle-exit').addEventListener('click', () => this.exit());
    document.getElementById('bs-give-battle').addEventListener('click', () => this.rideToParley());
    document.getElementById('bs-place').addEventListener('click', () => { if (this.forming.types.length) { this.placing = true; this._renderMuster(); } });
    document.getElementById('bs-clear').addEventListener('click', () => { this.forming.types = []; this.placing = false; this._renderMuster(); });
    document.getElementById('bs-reroll').addEventListener('click', () => { this.forming.name = nextNickname(); this._renderMuster(); });
    document.getElementById('bs-cry').addEventListener('click', () => this.battleCry());
    document.querySelectorAll('#bs-formations [data-form]').forEach((b) => b.addEventListener('click', () => {
      if (this.phase === 'muster') { this.forming.formation = b.dataset.form; this._renderMuster(); } else this.setFormation(b.dataset.form);
    }));
  }
  _showPhase() {
    const label = this.phase === 'muster' ? 'An Cruinniú · Muster' : this.phase === 'parley' ? 'An Idirbheartaíocht · Parley' : this.cfg.title;
    const f = this._liveCompanies('player').length, e = this._liveCompanies('enemy').length;
    document.getElementById('bs-phase').innerHTML = this.phase === 'battle'
      ? `${label}<br><small>${f} vs ${e} companies</small>` : label;
    document.getElementById('bs-muster').classList.toggle('hidden', this.phase !== 'muster');
    document.getElementById('bs-command').classList.toggle('hidden', this.phase !== 'battle');
  }
  _renderMuster() {
    const roster = document.getElementById('bs-roster'); roster.innerHTML = '';
    const inForming = (k) => this.forming.types.filter((x) => x === k).length;
    for (const key of ['villager', 'water', 'grain', 'deaglan', 'druid', 'warrior', 'seasoned', 'curadh', 'cuchulainn', 'fionn', 'dagda', 'morrigan']) {
      const t = UNIT_TYPES[key]; const left = (this.pool[key] || 0) - inForming(key);
      const b = document.createElement('button'); b.className = 'bs-unit cat-' + t.cat;
      b.innerHTML = `<b>${t.label} <span class="bs-left">${left}</span></b><small>${t.ga}</small>`; b.title = t.ga;
      b.disabled = left <= 0;
      b.addEventListener('click', () => { if (this.forming.types.length < 6 && (this.pool[key] || 0) - inForming(key) > 0) { this.forming.types.push(key); this.placing = false; this._renderMuster(); } });
      roster.appendChild(b);
    }
    document.getElementById('bs-name').textContent = `${this.forming.name[0]} — ${this.forming.name[1]}`;
    const tray = document.getElementById('bs-forming'); tray.innerHTML = '';
    this.forming.types.forEach((k, i) => { const s = document.createElement('span'); s.className = 'bs-chip'; s.textContent = UNIT_TYPES[k].label;
      s.title = 'remove'; s.addEventListener('click', () => { this.forming.types.splice(i, 1); this._renderMuster(); }); tray.appendChild(s); });
    if (!this.forming.types.length) tray.innerHTML = '<span class="dim">tap folk above to raise a company (up to 6)</span>';
    document.querySelectorAll('#bs-formations [data-form]').forEach((b) => b.classList.toggle('on', b.dataset.form === this.forming.formation));
    const place = document.getElementById('bs-place');
    place.textContent = this.placing ? 'Tap your side to set down…' : 'Set down ▸';
    place.classList.toggle('armed', this.placing);
    const list = document.getElementById('bs-companies'); list.innerHTML = '';
    for (const c of this.companies.filter((x) => x.team === 'player')) {
      const d = document.createElement('div'); d.className = 'bs-co';
      d.innerHTML = `<b>${c.name ? c.name[0] : 'lone'}</b> <small>×${c.units.length} · ${FORMATIONS[c.formation].label} · led by ${UNIT_TYPES[c.leader.type].label}</small>`;
      list.appendChild(d);
    }
  }
  _renderCommand() {
    const info = document.getElementById('bs-sel-info');
    const arr = [...this.selected].filter((c) => c.units.some((u) => !u.dead));
    if (!arr.length) { info.innerHTML = '<span class="dim">Tap a company, or drag a box. Two fingers to pan, pinch to zoom.</span>'; return; }
    if (arr.length === 1) {
      const c = arr[0]; const flag = c.morale > 66 ? '<span class="ok">confident</span>' : c.morale > 33 ? '<span class="warn">wavering</span>' : '<span class="rout">breaking</span>';
      info.innerHTML = `<b>${c.name ? c.name[0] : UNIT_TYPES[c.leader.type].label}</b> ${c.name ? `<small>${c.name[1]}</small>` : ''}<br>` +
        `×${c.units.filter((u) => !u.dead).length} · ${FORMATIONS[c.formation].label} · Misneach ${Math.round(c.morale)} ${flag}`;
    } else info.innerHTML = `<b>${arr.length} companies</b> in hand`;
    document.querySelectorAll('#bs-formations [data-form]').forEach((b) => b.classList.toggle('on', arr.length === 1 && b.dataset.form === arr[0].formation));
  }
  _flashMuster(msg) { const el = document.getElementById('bs-flash'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(this._ft); this._ft = setTimeout(() => el.classList.add('hidden'), 2200); }
  _defeat(msg) { const info = document.getElementById('bs-sel-info'); info.innerHTML = `<span class="rout">${msg}</span> <a id="bs-retry">Try again</a>`; document.getElementById('bs-retry').addEventListener('click', () => this.enter(this.scenario)); }
}

// ---- visuals ----
function makeUnitVisual(type, team) {
  const t = UNIT_TYPES[type];
  const g = new THREE.Group();
  let tall = 1.0;
  if (t.sprite) { const spr = makeWalkerChip(t.sprite); spr.scale.multiplyScalar(0.85); g.add(spr); g.userData.spr = spr; tall = 1.4; }
  else { buildPiece(g, t.piece.color, t.piece.tall, t.cat); tall = t.piece.tall + 0.5; }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 20), new THREE.MeshBasicMaterial({ color: TEAM[team], transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.userData.team = TEAM[team]; g.add(ring); g.userData.ring = ring;
  const bar = makeBar(0.7); bar.position.y = tall + 0.5; g.add(bar); g.userData.bar = bar;
  return g;
}
// A company standard: a billboard pole + team pennant with a sigil dot in the
// leader's colour, borne above the leader to mark the company's ground.
function makeFlag(team, leaderType) {
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 72;
  const x = cv.getContext('2d');
  x.fillStyle = '#6b5230'; x.fillRect(9, 6, 4, 62);
  x.fillStyle = '#' + TEAM[team].toString(16).padStart(6, '0');
  x.beginPath(); x.moveTo(13, 8); x.lineTo(46, 20); x.lineTo(13, 34); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1.5; x.stroke();
  const sig = (leaderType.piece ? leaderType.piece.color : 0xf0e0c0);
  x.fillStyle = '#' + sig.toString(16).padStart(6, '0');
  x.beginPath(); x.arc(24, 20, 4.5, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.center.set(0.23, 0); s.scale.set(0.9, 1.35, 1);
  return s;
}
function selectRing(u) { u.ring.material.color.setHex(0xffe08a); u.ring.material.opacity = 0.95; }
function restoreRing(u) { u.ring.material.color.setHex(u.ring.userData.team); u.ring.material.opacity = 0.5; }
function buildPiece(g, col, tall, cat) {
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 16), mat(darken(col, 0.5))); base.position.y = 0.08; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, tall * 0.7, 16), mat(col)); body.position.y = 0.16 + tall * 0.35; g.add(body);
  let head;
  if (cat === 'warrior') head = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.32, 16), mat(col));
  else if (cat === 'seasoned') head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), mat(col));
  else if (cat === 'special') head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat(col));
  else if (cat === 'god') head = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.66, 16), mat(col));
  else head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat(col)); // hero
  head.position.y = 0.16 + tall * 0.7 + 0.16; g.add(head);
  if (cat === 'hero' || cat === 'god') { const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); glow.position.y = head.position.y + 0.32; g.add(glow); }
}
function darken(hex, f) { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return ((r * f) << 16) | ((g * f) << 8) | (b * f); }

function makeBar(w) { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 10; const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); s.scale.set(w, w * 10 / 64, 1); s.userData.cv = cv; s.userData.tex = tex; return s; }
function drawBar(sprite, frac, color) { const cv = sprite.userData.cv, x = cv.getContext('2d'); x.clearRect(0, 0, 64, 10);
  x.fillStyle = '#000'; x.globalAlpha = 0.55; x.fillRect(0, 0, 64, 10); x.globalAlpha = 1;
  x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(1, 1, 62 * Math.max(0, Math.min(1, frac)), 8); sprite.userData.tex.needsUpdate = true; }

// formation slot offsets for n units
function formationSlots(n, f) {
  const cols = Math.min(f.cols, n), sp = 0.95, out = [];
  for (let i = 0; i < n; i++) { const c = i % cols, r = (i / cols) | 0; out.push({ dx: (c - (cols - 1) / 2) * sp, dz: r * sp * (f.label === 'Rinn' ? 1.1 : 1) }); }
  return out;
}
function dist2(a, b) { const dx = a.pos ? a.pos.x - b.x : a.x - b.x, dz = a.pos ? a.pos.z - b.z : a.z - b.z; return dx * dx + dz * dz; }
function nearest(u, list) { let best = null, bd = AGGRO * AGGRO; for (const o of list) { const d = distp(u.pos, o.pos); if (d < bd) { bd = d; best = o; } } return best; }
function pick(c, list) { let best = null, bd = Infinity; const cp = c.pos || (c.units && c.units.find((u) => !u.dead) && c.units.find((u) => !u.dead).pos); if (!cp) return null; for (const o of list) { const d = distp(cp, o.pos); if (d < bd) { bd = d; best = o; } } return best; }
function distp(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
