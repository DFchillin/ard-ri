import * as THREE from 'three';
import { createIsoCamera, resizeIsoCamera } from './iso_camera.js?v=CBUST';
import { makeWarriorChip, makeWalkerChip } from './render/chips.js?v=CBUST';
import { UNIT_TYPES } from './battle/units.js?v=CBUST';

// The hurling challenge — a penalty-shootout minigame on a small isometric pitch,
// rendered like the battlefield: painted lines, a goal at the far end, your chosen
// strikers as billboard chips that play their strike animation, and a sliotar that
// arcs toward the posts. The power/accuracy meter and scoreboard are an HTML
// overlay. Win it and you may raise a monument. Purely a friendly match.

const SWEET = { god: 0.40, hero: 0.36, special: 0.26, seasoned: 0.24, warrior: 0.21, regular: 0.17 };
const CHALLENGER_ODDS = 0.55;
const WALK = { villager: 'villager', water: 'water_carrier', grain: 'grain_carrier', deaglan: 'market_trader', druid: 'druid' };
const GOD_KEYS = new Set(['dagda', 'morrigan', 'lugh', 'nuada', 'manannan', 'brigid', 'cuchulainn', 'fionn']);

const SPOT_Z = 5.5, GOAL_Z = -6.5, POST_X = 1.7, BAR_Y = 2.0, POST_H = 4.0;

function spriteSrc(type) {
  const t = UNIT_TYPES[type];
  if (t && t.battle) return `assets/battle/${t.battle.art}/s_idle.png`;
  return `assets/walkers/${(t && t.sprite) || WALK[type] || 'villager'}/s_stand.png`;
}
function label(type) { return (UNIT_TYPES[type] && UNIT_TYPES[type].label) || type; }
function sweetFor(type) { const t = UNIT_TYPES[type]; return (t && SWEET[t.cat]) || 0.2; }
function chipFor(type) {
  const t = UNIT_TYPES[type];
  if (t && t.battle) return makeWarriorChip(t.battle.art, Math.min(t.battle.h, 2.2));
  return makeWalkerChip((t && t.sprite) || WALK[type] || 'villager', false);
}

function pitchTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#356a2e'); g.addColorStop(1, '#2b5626');
  x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  // mown stripes down the pitch
  x.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 512; i += 40) x.fillRect(0, i, 256, 20);
  x.strokeStyle = 'rgba(240,244,230,0.8)'; x.lineWidth = 3;
  x.strokeRect(12, 12, 232, 488);            // sideline box
  x.beginPath(); x.moveTo(12, 256); x.lineTo(244, 256); x.stroke(); // halfway line
  // small square + large rectangle at the goal end (top)
  x.strokeRect(78, 12, 100, 34);
  x.strokeRect(44, 12, 168, 80);
  x.beginPath(); x.moveTo(12, 120); x.lineTo(244, 120); x.stroke(); // 45 line
  // point spot
  x.fillStyle = 'rgba(240,244,230,0.85)'; x.beginPath(); x.arc(128, 150, 4, 0, Math.PI * 2); x.fill();
  const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4; return tx;
}

function makeBall() {
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const x = c.getContext('2d');
  x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(12, 12, 10, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#c9b98a'; x.lineWidth = 1.5; x.beginPath(); x.arc(12, 12, 10, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(5, 8); x.quadraticCurveTo(12, 12, 19, 8); x.stroke();
  const tx = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true }));
  s.scale.set(0.42, 0.42, 1); s.visible = false; return s;
}

export class Hurling {
  constructor({ onResolve, onClose } = {}) {
    this.onResolve = onResolve || (() => {});
    this.onClose = onClose || (() => {});
    this.active = false;
    this.aspect = window.innerWidth / window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2a17);
    this.camera = createIsoCamera(9.5, this.aspect);
    this.scene.add(new THREE.HemisphereLight(0xcfe0c4, 0x3a4a2c, 1.25));
    const sun = new THREE.DirectionalLight(0xf6f2e2, 1.2); sun.position.set(30, 60, 20); this.scene.add(sun);
    this._buildPitch();
    this.chipGroup = new THREE.Group(); this.scene.add(this.chipGroup);
    this.ball = makeBall(); this.scene.add(this.ball);

    // DOM
    this.screen = document.getElementById('hurling-screen');
    this.pickCard = document.getElementById('hurl-pick-card');
    this.hud = document.getElementById('hurl-hud');
    this.scoreEl = document.getElementById('hurl-score');
    this.bottom = document.getElementById('hurl-bottom');
    this.statusEl = document.getElementById('hurl-status');
    this.meterEl = document.getElementById('hurl-meter');
    this.sweetEl = document.getElementById('hurl-sweet');
    this.mkEl = document.getElementById('hurl-mk');
    this.strikeBtn = document.getElementById('hurl-strike');
    this.resultEl = document.getElementById('hurl-result');
    const close = document.getElementById('hurl-close'); if (close) close.addEventListener('click', () => this.close());
    if (this.strikeBtn) this.strikeBtn.addEventListener('click', () => this._strike());
    this._keyH = (e) => { if ((e.code === 'Space' || e.key === ' ') && this.phase === 'aim') { e.preventDefault(); this._strike(); } };

    this.phase = 'idle';
  }

  _buildPitch() {
    const g = new THREE.Group();
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 18),
      new THREE.MeshLambertMaterial({ map: pitchTexture() })
    );
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.01; g.add(pitch);
    // goal: two posts + crossbar at the far end
    const white = new THREE.MeshLambertMaterial({ color: 0xeee6d0 });
    const post = () => new THREE.Mesh(new THREE.BoxGeometry(0.16, POST_H, 0.16), white);
    const pl = post(), pr = post();
    pl.position.set(-POST_X, POST_H / 2, GOAL_Z); pr.position.set(POST_X, POST_H / 2, GOAL_Z);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(POST_X * 2 + 0.16, 0.14, 0.14), white);
    bar.position.set(0, BAR_Y, GOAL_Z);
    g.add(pl, pr, bar);
    this.scene.add(g);
  }

  // --- lifecycle ---
  open(roster, hosted) {
    this.avail = this._shooters(roster, hosted);
    this.picks = []; this.pScore = 0; this.cScore = 0; this.round = 0;
    this.active = true; this.phase = 'pick';
    this.resize(window.innerWidth / window.innerHeight);
    this.screen.classList.remove('hidden');
    document.body.classList.add('in-hurling');
    this.hud.classList.add('hidden'); this.bottom.classList.add('hidden'); this.resultEl.classList.add('hidden');
    this.pickCard.classList.remove('hidden');
    window.addEventListener('keydown', this._keyH);
    this._renderPick();
  }
  close() {
    this.active = false; this.phase = 'idle';
    window.removeEventListener('keydown', this._keyH);
    this.screen.classList.add('hidden');
    document.body.classList.remove('in-hurling');
    this._clearChips();
    this.onClose();
  }
  resize(aspect) { this.aspect = aspect; resizeIsoCamera(this.camera, aspect); }
  render(renderer) { renderer.render(this.scene, this.camera); }

  _clearChips() {
    for (const c of this.chipGroup.children.slice()) this.chipGroup.remove(c);
    this.team = null; this.challenger = null; this.ball.visible = false;
  }

  _shooters(roster, hosted) {
    const out = [];
    for (const k in (roster || {})) if (roster[k] > 0 && UNIT_TYPES[k]) out.push(k);
    for (const k in (hosted || {})) if (hosted[k] && UNIT_TYPES[k] && !out.includes(k)) out.push(k);
    if (!out.length) out.push('villager');
    return out;
  }

  // --- team selection (HTML card over the pitch) ---
  _renderPick() {
    const slots = this.picks.map((k, i) =>
      `<div class="hurl-slot"><img src="${spriteSrc(k)}" alt=""><span>${label(k)}</span><button class="hurl-drop" data-i="${i}">✕</button></div>`).join('') +
      Array.from({ length: 3 - this.picks.length }, () => `<div class="hurl-slot empty">—</div>`).join('');
    const opts = this.avail.map((k) =>
      `<button class="hurl-pick${GOD_KEYS.has(k) ? ' god' : ''}" data-k="${k}" ${this.picks.length >= 3 ? 'disabled' : ''}>` +
      `<img src="${spriteSrc(k)}" alt=""><span>${label(k)}</span><em>${Math.round(sweetFor(k) * 100)}%</em></button>`).join('');
    this.pickCard.innerHTML =
      `<h3>The Challenge of the Field</h3>` +
      `<p class="hurl-sub">A wandering band of hurlers has thrown down a challenge. Field three strikers — gods and heroes have the surest eye (a wider sweet spot).</p>` +
      `<div class="hurl-team">${slots}</div>` +
      `<div class="hurl-roster">${opts}</div>` +
      `<button id="hurl-start" class="continue-btn" ${this.picks.length === 3 ? '' : 'disabled'}>Take the field ▸</button>`;
    this.pickCard.querySelectorAll('.hurl-pick').forEach((b) => b.addEventListener('click', () => {
      if (this.picks.length < 3) { this.picks.push(b.dataset.k); this._renderPick(); }
    }));
    this.pickCard.querySelectorAll('.hurl-drop').forEach((b) => b.addEventListener('click', () => { this.picks.splice(+b.dataset.i, 1); this._renderPick(); }));
    const start = this.pickCard.querySelector('#hurl-start');
    if (start) start.addEventListener('click', () => { if (this.picks.length === 3) this._startMatch(); });
  }

  _startMatch() {
    this.pickCard.classList.add('hidden');
    this.hud.classList.remove('hidden'); this.bottom.classList.remove('hidden');
    // place the three strikers on the pitch: a bench, plus a spot for whoever shoots
    this.team = this.picks.map((type, i) => {
      const chip = chipFor(type); chip.position.set((i - 1) * 2.0, 0.05, SPOT_Z + 1.8);
      if (chip.faceWorld) chip.faceWorld(0, -1);
      this.chipGroup.add(chip); return { type, chip };
    });
    this.challenger = chipFor('villager'); this.challenger.position.set(0, 0.05, SPOT_Z);
    if (this.challenger.material) this.challenger.material.color.setHex(0xe0563a);
    this.challenger.visible = false; this.chipGroup.add(this.challenger);
    this.round = 0; this._nextRound();
  }

  // --- shootout flow ---
  _nextRound() {
    if (this.round >= 3 && this.pScore !== this.cScore) return this._finish();
    const type = this.picks[this.round % this.picks.length];
    const shaky = this._shaky(this.round);
    // bring this striker to the spot; others to the bench
    this.team.forEach((m, i) => { m.chip.visible = true; m.chip.position.set((i - 1) * 2.0, 0.05, SPOT_Z + 1.8); if (m.chip.faceWorld) m.chip.faceWorld(0, -1); });
    this.striker = this.team[this.round % this.team.length].chip;
    this.striker.position.set(0, 0.05, SPOT_Z); if (this.striker.faceWorld) this.striker.faceWorld(0, -1);
    this.challenger.visible = false;
    this._updateScore();
    this.sw = sweetFor(type) * (shaky ? 0.66 : 1);
    this.swC = 0.25 + Math.random() * 0.5;
    this.sweetEl.style.left = (this.swC - this.sw / 2) * 100 + '%';
    this.sweetEl.style.width = this.sw * 100 + '%';
    this.mkT = 0; this.mkDir = 1; this.mkSpeed = shaky ? 1.45 : 0.95; this.shaky = shaky;
    this.bottom.classList.remove('hidden'); this.strikeBtn.classList.remove('hidden'); this.meterEl.classList.remove('hidden');
    this._status(`${label(type)} steps up — ${shaky ? 'and this one is to win it. Steady…' : 'time your strike.'} Stop it in the green.`);
    this.phase = 'aim';
  }
  _shaky(idx) { if (idx >= 3) return true; return Math.abs(this.pScore - this.cScore) <= 1 && (3 - idx - 1) <= 1; }

  _strike() {
    if (this.phase !== 'aim') return;
    const hit = Math.abs(this.mkT - this.swC) <= this.sw / 2;
    this.meterEl.classList.add('hidden'); this.strikeBtn.classList.add('hidden');
    this.striker.faceWorld && this.striker.faceWorld(0, -1);
    if (this.striker.strike) this.striker.strike();
    this._pendingHit = hit; this._launchIn = 0.26; this._shooterPos = this.striker.position;
    this.phase = 'wind';
  }

  _challengerShoot() {
    this.striker && (this.striker.visible = false);
    // keep the current striker's team on the bench, bring the challenger to the spot
    this.challenger.visible = true; this.challenger.position.set(0, 0.05, SPOT_Z);
    if (this.challenger.faceWorld) this.challenger.faceWorld(0, -1);
    if (this.challenger.strike) this.challenger.strike();
    this._pendingHit = Math.random() < CHALLENGER_ODDS; this._launchIn = 0.26;
    this._shooterPos = this.challenger.position; this._replying = true;
    this._status('The challenger strikes from the same spot…');
    this.phase = 'wind';
  }

  _launchBall() {
    const hit = this._pendingHit;
    const from = this._shooterPos;
    let target;
    if (hit) target = new THREE.Vector3((Math.random() - 0.5) * (POST_X - 0.4), BAR_Y + 1.3, GOAL_Z - 0.4);
    else if (Math.random() < 0.5) target = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (POST_X + 0.8), BAR_Y + 0.4, GOAL_Z);
    else target = new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.6, GOAL_Z + 3.2);
    this._ballFrom = new THREE.Vector3(from.x, 1.3, from.z - 0.3);
    this._ballTo = target; this._ballT = 0; this._ballDur = 0.95; this._ballPeak = 2.6;
    this.ball.visible = true; this.ball.position.copy(this._ballFrom);
    this.phase = 'fly';
  }
  _stepBall(dt) {
    this._ballT += dt / this._ballDur;
    const t = Math.min(this._ballT, 1);
    const p = this._ballFrom.clone().lerp(this._ballTo, t);
    p.y += this._ballPeak * 4 * t * (1 - t);
    this.ball.position.copy(p);
    this.ball.material.rotation += dt * 12;
    if (this._ballT >= 1) { this.ball.visible = false; this._onLand(); }
  }
  _onLand() {
    const hit = this._pendingHit;
    if (this._replying) { if (hit) this.cScore++; this._replying = false; this._updateScore(); this._status(hit ? 'Over the bar — a point to them.' : 'Wide! No score to the challengers.'); this._gap = 1.1; this._after = () => { this.round++; this._nextRound(); }; }
    else { if (hit) this.pScore++; this._updateScore(); this._status(hit ? 'OVER THE BAR — a point!' : 'Wide! It drifts past the post.'); this._gap = 0.9; this._after = () => this._challengerShoot(); }
    this.phase = 'gap';
  }

  _finish() {
    const won = this.pScore > this.cScore;
    this.bottom.classList.add('hidden');
    this.resultEl.classList.remove('hidden');
    this.resultEl.innerHTML =
      `<h3>${won ? '🏆 The Field is Yours' : 'The Day is Theirs'}</h3>` +
      `<p class="hurl-sub">Final: You ${this.pScore} – ${this.cScore} Them. ` +
      (won ? 'The wandering band bows to your strikers. Raise a monument to the day — while it stands, the harvest comes in a fifth more plentiful.'
           : 'The challengers take the honours and move on. Field a surer team when the next band comes calling.') + `</p>` +
      `<button id="hurl-done" class="continue-btn">${won ? 'Claim your monument ▸' : 'Back to the ráth'}</button>`;
    this.resultEl.querySelector('#hurl-done').addEventListener('click', () => { this.onResolve(won); this.close(); });
    this.phase = 'done';
  }

  _updateScore() { if (this.scoreEl) this.scoreEl.innerHTML = `Round ${Math.min(this.round + 1, 4)} &nbsp;·&nbsp; You <b>${this.pScore}</b> – <b>${this.cScore}</b> Them`; }
  _status(t) { if (this.statusEl) this.statusEl.textContent = t; }

  // --- driven by the main render loop while active ---
  update(dt) {
    if (!this.active) return;
    for (const c of this.chipGroup.children) if (c.animate) c.animate(dt, false);
    if (this.phase === 'aim') {
      this.mkT += this.mkDir * this.mkSpeed * dt;
      if (this.mkT >= 1) { this.mkT = 1; this.mkDir = -1; } else if (this.mkT <= 0) { this.mkT = 0; this.mkDir = 1; }
      const j = this.shaky ? (Math.random() - 0.5) * 0.04 : 0;
      this.mkEl.style.left = Math.max(0, Math.min(1, this.mkT + j)) * 100 + '%';
    } else if (this.phase === 'wind') {
      this._launchIn -= dt; if (this._launchIn <= 0) this._launchBall();
    } else if (this.phase === 'fly') {
      this._stepBall(dt);
    } else if (this.phase === 'gap') {
      this._gap -= dt; if (this._gap <= 0) { const f = this._after; this._after = null; this.phase = 'idle2'; if (f) f(); }
    }
  }
}
