import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera } from './iso_camera.js?v=CBUST';
import { makeWarriorChip } from './render/chips.js?v=CBUST';
import { tex } from './render/assets.js?v=CBUST';
import { UNIT_TYPES } from './battle/units.js?v=CBUST';

// Babhta Sparála — the sparring bout. A roaming champion comes to the wrestling
// green and throws down a challenge. You pick a townsperson to stand for the
// túath (drawn with warrior sprites, so even a villager swings like a laoch) and
// corner them through three rounds. Each round you call the attack, the guard and
// a word of corner advice; the two fighters trade blows on an isometric ring and
// the round is scored boxing-style (10–9, a knockdown 10–8, a mauling 10–7). Win
// the bout and raise a monument. A knockout ends it there and then.

const RING_R = 4.0;                 // sand circle radius
const STANCE_Z = 1.5;               // fighters start this far either side of centre
const KO_HP = 0;
const KD_BLOW = 20;                 // a single blow this heavy puts a fighter down
const START_HP = 100;

// Fighter strength by war-band category — a hero swings far harder than a cowherd,
// but all of them borrow the warrior's stance and strike frames in the ring.
const POWER = { regular: 0.85, warrior: 1.0, seasoned: 1.18, special: 1.35, hero: 1.7, god: 2.1 };
const SKILL = { regular: 0.0, warrior: 0.03, seasoned: 0.06, special: 0.09, hero: 0.13, god: 0.17 };

const ATTACKS = {
  thrust: { label: 'Sá dhíreach', hint: 'a straight thrust — true and quick', dmg: 17, acc: 0.84, target: 'head', open: 0.20, ga: 'thrust' },
  heavy:  { label: 'Trombhuille', hint: 'a heavy swing — it ends bouts, if it lands', dmg: 31, acc: 0.56, target: 'head', open: 0.52, ga: 'heavy blow' },
  body:   { label: 'Buille cuirp', hint: 'a body blow — wears a man down', dmg: 19, acc: 0.82, target: 'body', open: 0.24, ga: 'body blow' },
};
const DEFENCES = {
  high:  { label: 'Garda ard', hint: 'high guard — turns blows from the head', head: 0.45, body: 1.1, evade: 0 },
  low:   { label: 'Garda íseal', hint: 'low guard — covers the body', head: 1.1, body: 0.45, evade: 0 },
  evade: { label: 'Cor coise', hint: 'footwork — slip the blow, then counter', head: 1.0, body: 1.0, evade: 0.4 },
};
const ADVICE = {
  ruthless:  { label: 'Fíochmhar', en: 'Ruthless', hint: 'swing for the finish — you hit harder, but so does he', dmg: 1.35, taken: 1.3, acc: 0.0, counter: 1.0 },
  cautious:  { label: 'Faichilleach', en: 'Cautious', hint: 'cover up and survive the round', dmg: 0.75, taken: 0.65, acc: 0.0, counter: 1.0 },
  balanced:  { label: 'Cothrom', en: 'Balanced', hint: 'trade evenly, give nothing away', dmg: 1.0, taken: 1.0, acc: 0.0, counter: 1.0 },
  technical: { label: 'Teicniúil', en: 'Technical', hint: 'pick the opening — surer blows, sharper counters', dmg: 1.05, taken: 0.95, acc: 0.14, counter: 1.6 },
};

const CHAMP_NAMES = ['Dáire of the Nine Scars', 'Conall the Unbowed', 'Fráech of the Fords', 'Garbh the Breaker',
  'Loairn Red-Hand', 'Sreng of the Firbolg', 'Cet mac Mágach', 'Ferdia of the Weir'];

function uLabel(type) { return (UNIT_TYPES[type] && UNIT_TYPES[type].label) || type; }
function uCat(type) { return (UNIT_TYPES[type] && UNIT_TYPES[type].cat) || 'regular'; }
function spriteSrc(type) {
  const t = UNIT_TYPES[type];
  if (t && t.battle) return `assets/battle/${t.battle.art}/s_idle.png`;
  return 'assets/battle/warrior/s_idle.png';
}
// A fighter always gets a warrior-capable chip (idle/windup/strike frames); a god
// or hero uses their own battle art, everyone else borrows the warrior's.
function fighterArt(type) { const t = UNIT_TYPES[type]; return (t && t.battle && t.battle.art) || 'warrior'; }
function fighterH(type) { const t = UNIT_TYPES[type]; return t && t.battle ? Math.min(t.battle.h, 2.0) : 1.6; }

export class Sparring {
  constructor({ onResolve, onClose } = {}) {
    this.onResolve = onResolve || (() => {});
    this.onClose = onClose || (() => {});
    this.active = false;
    this.aspect = window.innerWidth / window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x201a12);
    this.camera = createIsoCamera(7.2, this.aspect);
    this.scene.add(new THREE.HemisphereLight(0xdcd2bc, 0x403524, 1.25));
    const sun = new THREE.DirectionalLight(0xf6f0e0, 1.25); sun.position.set(24, 50, 18); this.scene.add(sun);
    this._buildRing();
    this.chipGroup = new THREE.Group(); this.scene.add(this.chipGroup);

    // camera shake + push, eased each frame
    this._shake = 0; this._baseVs = 7.2; this._vsGoal = 7.2;

    // DOM
    this.screen = document.getElementById('sparring-screen');
    this.hud = document.getElementById('spar-hud');
    this.scoreEl = document.getElementById('spar-score');
    this.pName = document.getElementById('spar-p-name'); this.pBar = document.getElementById('spar-p-bar');
    this.cName = document.getElementById('spar-c-name'); this.cBar = document.getElementById('spar-c-bar');
    this.cardEl = document.getElementById('spar-card');
    this.statusEl = document.getElementById('spar-status');
    this.resultEl = document.getElementById('spar-result');
    const close = document.getElementById('spar-close'); if (close) close.addEventListener('click', () => this.close());

    this.phase = 'idle';
  }

  _buildRing() {
    const g = new THREE.Group(); this.scene.add(g);
    // grass apron
    const grassTex = new THREE.TextureLoader().load('assets/terrain/tiles/pasture.png');
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.magFilter = grassTex.minFilter = THREE.NearestFilter; grassTex.generateMipmaps = false;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(5, 5);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshLambertMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2; grass.renderOrder = -3; g.add(grass);
    // the sand ring
    const sand = new THREE.Mesh(new THREE.CircleGeometry(RING_R, 48), new THREE.MeshLambertMaterial({ color: 0xcdb27a }));
    sand.rotation.x = -Math.PI / 2; sand.position.y = 0.01; sand.renderOrder = -2; g.add(sand);
    // a darker worn centre ring
    const inner = new THREE.Mesh(new THREE.RingGeometry(RING_R - 0.5, RING_R - 0.3, 48), new THREE.MeshBasicMaterial({ color: 0x9c8454, transparent: true, opacity: 0.6 }));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.02; inner.renderOrder = -1; g.add(inner);
    // corner posts ringed with rope (the wrestling green "ringed with posts")
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a28 });
    const postH = 1.1, n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, postH, 6), wood);
      p.position.set(Math.cos(a) * (RING_R + 0.2), postH / 2, Math.sin(a) * (RING_R + 0.2));
      g.add(p);
    }
    this._buildCrowd(g);
  }

  _buildCrowd(parent) {
    const bases = ['villager', 'villager_f', 'grain_carrier', 'water_carrier', 'market_trader', 'druid'];
    const cache = new Map();
    const camTo = new THREE.Vector3(1, 0, 1).normalize();
    const matFor = (base, dir) => {
      const k = base + '/' + dir; let m = cache.get(k);
      if (!m) { m = new THREE.SpriteMaterial({ map: tex(`assets/walkers/${base}/${dir}_stand.png`), transparent: true, alphaTest: 0.12 }); cache.set(k, m); }
      return m;
    };
    const dirFrame = (x, z) => {
      const len = Math.hypot(x, z) || 1, nx = -x / len, nz = -z / len;
      const front = nx * camTo.x + nz * camTo.z, side = nx * -camTo.z + nz * camTo.x;
      if (front > 0.4) return side > 0.4 ? 'se' : side < -0.4 ? 'sw' : 's';
      if (front < -0.4) return side > 0.4 ? 'ne' : side < -0.4 ? 'nw' : 'n';
      return side > 0 ? 'e' : 'w';
    };
    for (let r = 0; r < 3; r++) {
      const rad = RING_R + 1.0 + r * 0.85, step = (0.95 + r * 0.1) / rad;
      for (let a = 0; a < Math.PI * 2; a += step) {
        const x = Math.cos(a) * rad + (Math.random() - 0.5) * 0.3;
        const z = Math.sin(a) * rad + (Math.random() - 0.5) * 0.3;
        const base = bases[(Math.random() * bases.length) | 0];
        const s = new THREE.Sprite(matFor(base, dirFrame(x, z)));
        s.center.set(0.5, 0); s.renderOrder = 1; s.scale.set(0.8, 1.0, 1);
        s.position.set(x, 0.02, z);
        parent.add(s);
      }
    }
  }

  // --- lifecycle ---
  open(roster, hosted, { grit = 0 } = {}) {
    this.avail = this._fighters(roster, hosted);
    this.pick = null; this.round = 0; this.pPts = 0; this.cPts = 0;
    this.scoreLog = [];
    this.grit = grit;
    this.active = true; this.phase = 'pick';
    this.aspect = window.innerWidth / window.innerHeight; this._resetCam();
    this.screen.classList.remove('hidden');
    document.body.classList.add('in-sparring');
    this.hud.classList.add('hidden'); this.resultEl.classList.add('hidden');
    this.cardEl.classList.remove('hidden');
    this._renderPick();
  }
  close() {
    this.active = false; this.phase = 'idle';
    this.screen.classList.add('hidden');
    document.body.classList.remove('in-sparring');
    this._clearChips();
    this.onClose();
  }
  resize(aspect) { this.aspect = aspect; resizeIsoCamera(this.camera, aspect); }
  renderCam() { return this.camera; }
  render(renderer) { renderer.render(this.scene, this.camera); }

  _resetCam() {
    const c = this.camera; c.userData.dir = 0; c.userData.pan.x = 0; c.userData.pan.z = 0;
    const vs = this._fitViewSize(this.aspect);
    this._baseVs = this._vsGoal = vs;
    c.userData.viewSize = vs; resizeIsoCamera(c, this.aspect);
  }
  _fitViewSize(aspect) {
    // enclose the ring + fighters; crowd may bleed off the edges
    const ex = RING_R + 0.8, ey = 2.2;
    const need = Math.max(ey, ex / aspect) * 1.12;
    return Math.max(4.5, Math.min(14, need));
  }

  _clearChips() {
    for (const c of this.chipGroup.children.slice()) this.chipGroup.remove(c);
    this.me = null; this.foe = null;
  }

  _fighters(roster, hosted) {
    const out = [];
    for (const k in (roster || {})) if (roster[k] > 0 && UNIT_TYPES[k]) out.push(k);
    for (const k in (hosted || {})) if (hosted[k] && UNIT_TYPES[k] && !out.includes(k)) out.push(k);
    if (!out.length) out.push('villager');
    return out;
  }

  // --- fighter selection ---
  _renderPick() {
    const opts = this.avail.map((k) => {
      const cat = uCat(k), pw = Math.round((POWER[cat] || 1) * 100);
      return `<button class="spar-pick" data-k="${k}"><img src="${spriteSrc(k)}" alt=""><span>${uLabel(k)}</span><em>⚔ ${pw}</em></button>`;
    }).join('');
    this.cardEl.innerHTML =
      `<h3>A Champion at the Green</h3>` +
      `<p class="spar-sub">A roaming curadh, <b>${this._champName || (this._champName = CHAMP_NAMES[(Math.random() * CHAMP_NAMES.length) | 0])}</b>, has come to the wrestling green and calls out your túath. Name the one who will stand for you — any soul will do, for in the ring they all take up the warrior's stance. Corner them well through three rounds.</p>` +
      `<div class="spar-roster">${opts}</div>`;
    this.cardEl.querySelectorAll('.spar-pick').forEach((b) => b.addEventListener('click', () => { this.pick = b.dataset.k; this._startBout(); }));
  }

  _startBout() {
    this.cardEl.classList.add('hidden');
    this.hud.classList.remove('hidden');
    // place the two fighters facing each other across the ring
    const pCat = uCat(this.pick);
    this.me = {
      name: uLabel(this.pick), hp: START_HP, max: START_HP,
      power: POWER[pCat] || 1, skill: SKILL[pCat] || 0,
      chip: makeWarriorChip(fighterArt(this.pick), fighterH(this.pick)),
    };
    const champPower = 1.18 + 0.07 * Math.min(this.grit, 6);
    const champSkill = 0.04 + 0.012 * Math.min(this.grit, 6);
    this.foe = {
      name: this._champName, hp: START_HP, max: START_HP,
      power: champPower, skill: champSkill,
      chip: makeWarriorChip('curadh', 1.75),
    };
    this.me.chip.position.set(0, 0.05, STANCE_Z); this.me.chip.faceWorld(0, -1); this.me.chip.renderOrder = 2;
    this.foe.chip.position.set(0, 0.05, -STANCE_Z); this.foe.chip.faceWorld(0, 1); this.foe.chip.renderOrder = 2;
    if (this.foe.chip.material) this.foe.chip.material.color.setHex(0xe07a5a); // the challenger reads in raider red
    this.chipGroup.add(this.me.chip, this.foe.chip);
    this.pName.textContent = this.me.name; this.cName.textContent = this.foe.name;
    this._drawBars(); this._updateScore();
    this.round = 0; this._nextRound();
  }

  // --- round flow ---
  _nextRound() {
    if (this.me.hp <= KO_HP || this.foe.hp <= KO_HP) return this._finish();
    if (this.round >= 3) return this._finish();
    this.round++;
    this._renderChoices();
    this._status(`Round ${this.round}. Call the round — your attack, your guard, and a word in the corner.`);
    this.phase = 'choose';
  }

  _renderChoices() {
    this.sel = { atk: 'thrust', def: 'high', adv: 'balanced' };
    const grp = (title, map, key, enKey) => {
      const btns = Object.keys(map).map((k) => {
        const o = map[k];
        const name = enKey ? `${o.en}` : o.label;
        const sub = enKey ? o.label : o.hint;
        return `<button class="spar-opt" data-g="${key}" data-k="${k}"><b>${name}</b><i>${sub}</i></button>`;
      }).join('');
      return `<div class="spar-grp"><h4>${title}</h4><div class="spar-opts">${btns}</div></div>`;
    };
    this.cardEl.innerHTML =
      `<div class="spar-round-head">Round ${this.round} of 3</div>` +
      grp('Attack', ATTACKS, 'atk', false) +
      grp('Guard', DEFENCES, 'def', false) +
      grp('Corner advice', ADVICE, 'adv', true) +
      `<button id="spar-go" class="continue-btn">To the centre ▸</button>`;
    this.cardEl.classList.remove('hidden');
    const refresh = () => this.cardEl.querySelectorAll('.spar-opt').forEach((b) => {
      b.classList.toggle('on', this.sel[b.dataset.g] === b.dataset.k);
    });
    this.cardEl.querySelectorAll('.spar-opt').forEach((b) => b.addEventListener('click', () => { this.sel[b.dataset.g] = b.dataset.k; refresh(); }));
    refresh();
    this.cardEl.querySelector('#spar-go').addEventListener('click', () => this._resolveRound());
  }

  // Compute an exchange from the player's called shots and the champion's AI, then
  // queue the blows as timed beats the render loop plays out.
  _resolveRound() {
    this.cardEl.classList.add('hidden');
    const adv = ADVICE[this.sel.adv];
    const pAtk = ATTACKS[this.sel.atk], pDef = DEFENCES[this.sel.def];
    // champion AI: lean on the body when you're whole, swing heavy when you're hurt
    const cAtkKey = this._champAttack(), cDefKey = this._champDefence();
    const cAtk = ATTACKS[cAtkKey], cDef = DEFENCES[cDefKey];

    const beats = [];
    let pRoundDmg = 0, cRoundDmg = 0, pKd = false, cKd = false;

    // 1) your fighter leads
    const pBlow = this._blow(this.me, this.foe, pAtk, cDef, adv.dmg, adv.acc, this.sel.def === 'evade');
    beats.push({ who: 'p', ...pBlow, say: this._say('p', pBlow, pAtk) });
    cRoundDmg += pBlow.dmg; if (pBlow.kd) cKd = true;

    // 2) the champion answers (unless already down)
    if (this.foe.hp - pBlow.dmg > KO_HP) {
      const openBonus = pBlow.land ? 0 : pAtk.open * 0.4; // a missed heavy leaves you open
      const cBlow = this._blow(this.foe, this.me, cAtk, pDef, adv.taken, openBonus, false);
      beats.push({ who: 'c', ...cBlow, say: this._say('c', cBlow, cAtk) });
      pRoundDmg += cBlow.dmg; if (cBlow.kd) pKd = true;

      // 3) a counter, if you slipped the blow (footwork) or called it technical
      if ((this.sel.def === 'evade' && cBlow.dodged) || (this.sel.adv === 'technical' && !cBlow.land)) {
        if (this.foe.hp - pBlow.dmg - 0 > KO_HP) {
          const cnt = this._blow(this.me, this.foe, ATTACKS.thrust, cDef, adv.dmg * adv.counter * 0.7, 0.2, false);
          cnt.counter = true;
          beats.push({ who: 'p', ...cnt, say: this._say('p', cnt, ATTACKS.thrust, true) });
          cRoundDmg += cnt.dmg; if (cnt.kd) cKd = true;
        }
      }
    }

    this._round = { beats, i: 0, t: 0, pRoundDmg, cRoundDmg, pKd, cKd };
    this.phase = 'anim';
    this._status('They close…');
  }

  // A single blow: does it land, how hard, and does it put the man down.
  _blow(att, def, atk, defMove, dmgMult, accBonus, defenderEvading) {
    const acc = Math.min(0.97, atk.acc + accBonus + att.skill - def.skill * 0.4);
    const land = Math.random() < acc;
    if (!land) return { land: false, dmg: 0, kd: false, dodged: false };
    let dodged = false;
    if (defMove.evade > 0 && Math.random() < defMove.evade) { dodged = true; return { land: true, dmg: 0, kd: false, dodged: true }; }
    const guard = atk.target === 'head' ? defMove.head : defMove.body;
    const variance = 0.85 + Math.random() * 0.3;
    let dmg = atk.dmg * guard * dmgMult * att.power * variance;
    dmg = Math.max(1, Math.round(dmg));
    const kd = dmg >= KD_BLOW;
    return { land: true, dmg, kd, dodged: false };
  }

  _champAttack() {
    const r = Math.random();
    if (this.me.hp < 45) return r < 0.55 ? 'heavy' : r < 0.8 ? 'thrust' : 'body'; // smell blood
    return r < 0.45 ? 'body' : r < 0.78 ? 'thrust' : 'heavy';
  }
  _champDefence() {
    // the champion mixes his guard at random — he cannot read your corner, just as
    // you cannot read his, so a well-called attack finds the opening on its own odds
    const r = Math.random();
    return r < 0.38 ? 'high' : r < 0.72 ? 'low' : 'evade';
  }

  _say(who, blow, atk, counter) {
    const me = who === 'p' ? this.me.name : this.foe.name;
    const foe = who === 'p' ? this.foe.name : this.me.name;
    if (!blow.land) return `${me} swings the ${atk.ga} — ${foe} is not there.`;
    if (blow.dodged) return `${foe} slips the ${atk.ga} clean — and the crowd roars.`;
    if (blow.kd) return `THE ${atk.ga.toUpperCase()} LANDS CLEAN — ${foe} is down! The green erupts.`;
    if (counter) return `${me} counters off the slip — a sharp blow slips through!`;
    if (blow.dmg >= 16) return `${me} buries the ${atk.ga} — ${foe} rocks back, legs gone to water.`;
    if (blow.dmg >= 8) return `${me} lands the ${atk.ga} flush. ${foe} wears it.`;
    return `${me}'s ${atk.ga} grazes home — little in it.`;
  }

  // step the queued beats, applying damage in time with each strike animation
  _stepRound(dt) {
    const R = this._round; R.t += dt;
    const beat = R.beats[R.i];
    if (!beat) return;
    if (!beat._started) {
      beat._started = true; beat._applied = false; R.t = 0;
      const att = beat.who === 'p' ? this.me : this.foe;
      const def = beat.who === 'p' ? this.foe : this.me;
      att.chip.faceWorld(0, beat.who === 'p' ? -1 : 1);
      if (att.chip.strike) att.chip.strike();
      this._status(beat.say);
      this._lastPlayerTarget = beat.who === 'p' ? (ATTACKS[this.sel.atk] ? ATTACKS[this.sel.atk].target : null) : this._lastPlayerTarget;
    }
    // apply the blow a beat into the swing (as the strike frame shows)
    if (!beat._applied && R.t >= 0.32) {
      beat._applied = true;
      if (beat.land && !beat.dodged && beat.dmg > 0) {
        const def = beat.who === 'p' ? this.foe : this.me;
        def.hp = Math.max(0, def.hp - beat.dmg);
        this._shake = Math.min(0.9, 0.12 + beat.dmg / 60);
        this._recoil = { chip: def.chip, dir: beat.who === 'p' ? -1 : 1, t: 0.18 };
        this._drawBars();
      }
    }
    // next beat after it settles
    if (R.t >= 1.15) { R.i++; if (R.i >= R.beats.length) this._scoreRound(); }
  }

  _scoreRound() {
    const R = this._round;
    // knockout?
    if (this.me.hp <= KO_HP || this.foe.hp <= KO_HP) { this._finish(true); return; }
    // boxing score: the harder-hitting fighter takes the round, a knockdown weighs heavy
    let pScore = 10, cScore = 10;
    const pEdge = R.cRoundDmg + (R.cKd ? 14 : 0); // your case this round (damage you dealt + a knockdown you scored)
    const cEdge = R.pRoundDmg + (R.pKd ? 14 : 0); // his case
    const diff = pEdge - cEdge;                    // + means the round is yours
    if (Math.abs(diff) < 2) { pScore = cScore = 10; } // a genuine stalemate — rare
    else if (diff > 0) { cScore = (R.cKd && diff >= 24) ? 7 : R.cKd ? 8 : 9; }
    else { pScore = (R.pKd && -diff >= 24) ? 7 : R.pKd ? 8 : 9; }
    this.pPts += pScore; this.cPts += cScore;
    const verdict = pScore > cScore
      ? (cScore <= 7 ? `You take the round ${pScore}–${cScore} — a mauling.` : cScore === 8 ? `A knockdown! You bank the round ${pScore}–${cScore}.` : `You edge the round ${pScore}–${cScore}.`)
      : cScore > pScore
        ? (pScore <= 7 ? `He mauls you this round, ${cScore}–${pScore}.` : pScore === 8 ? `You're put down — his round ${cScore}–${pScore}.` : `He nicks the round ${cScore}–${pScore}.`)
        : `Nothing between them — ${pScore}–${cScore}, a shared round.`;
    this.scoreLog.push({ r: this.round, p: pScore, c: cScore });
    this._updateScore();
    this._status(verdict);
    this._gap = 1.6; this._after = () => this._nextRound();
    this.phase = 'gap';
  }

  _finish(byKo) {
    this.hud.classList.remove('hidden');
    let won;
    if (this.foe.hp <= KO_HP) won = true;
    else if (this.me.hp <= KO_HP) won = false;
    else won = this.pPts > this.cPts; // a draw on the cards goes to the standing champion
    const koLine = byKo ? (won ? `${this.foe.name} will not beat the count — a knockout!` : `You could not answer the count. ${this.foe.name} stands over you.`) : '';
    this.resultEl.classList.remove('hidden');
    this.cardEl.classList.add('hidden');
    this.resultEl.innerHTML =
      `<h3>${won ? '🏆 The Bout is Yours' : 'The Champion Stands'}</h3>` +
      `<p class="spar-sub">${koLine} ${byKo ? '' : `On the cards: You ${this.pPts} – ${this.cPts} ${this.foe.name}.`} ` +
      (won ? 'The green chants your champion\'s name. Raise a monument to the day — while it stands the harvest comes in a fifth more plentiful.'
           : 'The roaming champion takes the laurels and moves on. Corner a surer fighter when the next one comes calling.') + `</p>` +
      `<button id="spar-done" class="continue-btn">${won ? 'Claim your monument ▸' : 'Back to the ráth'}</button>`;
    this.resultEl.querySelector('#spar-done').addEventListener('click', () => { this.onResolve(won); this.close(); });
    this.phase = 'done';
  }

  _drawBars() {
    if (this.pBar) this.pBar.style.width = Math.max(0, (this.me.hp / this.me.max) * 100) + '%';
    if (this.cBar) this.cBar.style.width = Math.max(0, (this.foe.hp / this.foe.max) * 100) + '%';
  }
  _updateScore() {
    if (!this.scoreEl) return;
    const pips = [0, 1, 2].map((i) => {
      const s = this.scoreLog[i];
      return `<span class="spar-pip${s ? (s.p > s.c ? ' p' : s.p < s.c ? ' c' : ' d') : ''}">${s ? `${s.p}–${s.c}` : '·'}</span>`;
    }).join('');
    this.scoreEl.innerHTML = `<b>${this.pPts}</b> <span class="spar-pips">${pips}</span> <b>${this.cPts}</b>`;
  }
  _status(t) { if (this.statusEl) this.statusEl.textContent = t; }

  // --- render loop ---
  update(dt) {
    if (!this.active) return;
    // ease camera shake / push
    const c = this.camera;
    if (this._shake > 0) this._shake = Math.max(0, this._shake - dt * 2.6);
    const sx = (Math.random() - 0.5) * this._shake * 0.3, sz = (Math.random() - 0.5) * this._shake * 0.3;
    if (c.userData.pan) { c.userData.pan.x = sx; c.userData.pan.z = sz; }
    // recoil: shove the struck fighter back a touch
    if (this._recoil) {
      this._recoil.t -= dt;
      const ch = this._recoil.chip;
      ch.position.z = (ch === (this.foe && this.foe.chip) ? -STANCE_Z : STANCE_Z) + this._recoil.dir * Math.max(0, this._recoil.t) * 1.4;
      if (this._recoil.t <= 0) { ch.position.z = ch === (this.foe && this.foe.chip) ? -STANCE_Z : STANCE_Z; this._recoil = null; }
    }
    for (const o of this.chipGroup.children) if (o.animate) o.animate(dt, false);
    if (this.phase === 'anim') this._stepRound(dt);
    else if (this.phase === 'gap') { this._gap -= dt; if (this._gap <= 0) { const f = this._after; this._after = null; this.phase = 'idle2'; if (f) f(); } }
  }
}
