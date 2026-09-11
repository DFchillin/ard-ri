import { UNIT_TYPES } from './battle/units.js?v=CBUST';

// The hurling challenge — a penalty-shootout minigame on a dedicated pitch. A
// wandering band challenges the ráth; you field three shooters from your muster
// (gods and heroes have a wider sweet spot), each takes a strike at a point, and
// the challengers reply from the same spot. Points only. Win it and you may raise
// a monument. Purely a friendly match — no units are spent.

// How wide the green sweet spot is, by unit category — the surer the striker.
const SWEET = { god: 0.40, hero: 0.36, special: 0.26, seasoned: 0.24, warrior: 0.21, regular: 0.17 };
const CHALLENGER_ODDS = 0.55; // the wandering band strike about this often

const WALK = { villager: 'villager', water: 'water_carrier', grain: 'grain_carrier', deaglan: 'market_trader', druid: 'druid' };
function spriteSrc(type) {
  const t = UNIT_TYPES[type];
  if (t && t.battle) return `assets/battle/${t.battle.art}/s_idle.png`;
  return `assets/walkers/${(t && t.sprite) || WALK[type] || 'villager'}/s_stand.png`;
}
function label(type) { return (UNIT_TYPES[type] && UNIT_TYPES[type].label) || type; }
function sweetFor(type) { const t = UNIT_TYPES[type]; return (t && SWEET[t.cat]) || 0.2; }

export class Hurling {
  constructor({ onResolve, onClose } = {}) {
    this.onResolve = onResolve || (() => {}); // (won) — a match played to its end
    this.onClose = onClose || (() => {});     // always, on close (cleanup/resume)
    this.screen = document.getElementById('hurling-screen');
    this.body = document.getElementById('hurl-body');
    const close = document.getElementById('hurl-close');
    if (close) close.addEventListener('click', () => this.close());
    this._raf = null;
    this._onTap = null;
    this._keyH = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (this._onTap) this._onTap(); } };
  }

  open(roster, hosted) {
    this.avail = this._shooters(roster, hosted);
    this.picks = [];
    this.pScore = 0; this.cScore = 0; this.round = 0; this.won = false;
    this.screen.classList.remove('hidden');
    window.addEventListener('keydown', this._keyH);
    this._renderPick();
  }
  close() {
    cancelAnimationFrame(this._raf); this._raf = null; this._onTap = null;
    window.removeEventListener('keydown', this._keyH);
    this.screen.classList.add('hidden');
    this.onClose();
  }

  _shooters(roster, hosted) {
    const out = [];
    for (const k in (roster || {})) if (roster[k] > 0 && UNIT_TYPES[k]) out.push(k);
    for (const k in (hosted || {})) if (hosted[k] && UNIT_TYPES[k] && !out.includes(k)) out.push(k);
    if (!out.length) out.push('villager');
    return out;
  }

  // --- Team selection: fill three slots from the muster ---
  _renderPick() {
    const godKeys = new Set(['dagda', 'morrigan', 'lugh', 'nuada', 'manannan', 'brigid', 'cuchulainn', 'fionn']);
    const slots = this.picks.map((k, i) =>
      `<div class="hurl-slot"><img src="${spriteSrc(k)}" alt=""><span>${label(k)}</span><button class="hurl-drop" data-i="${i}">✕</button></div>`).join('') +
      Array.from({ length: 3 - this.picks.length }, () => `<div class="hurl-slot empty">—</div>`).join('');
    const opts = this.avail.map((k) =>
      `<button class="hurl-pick${godKeys.has(k) ? ' god' : ''}" data-k="${k}" ${this.picks.length >= 3 ? 'disabled' : ''}>` +
      `<img src="${spriteSrc(k)}" alt=""><span>${label(k)}</span><em>${Math.round(sweetFor(k) * 100)}%</em></button>`).join('');
    this.body.innerHTML =
      `<h3>The Challenge of the Field</h3>` +
      `<p class="hurl-sub">A wandering band of hurlers has come to your ráth and thrown down a challenge. Field three strikers — gods and heroes have the surest eye (a wider sweet spot).</p>` +
      `<div class="hurl-team">${slots}</div>` +
      `<div class="hurl-roster">${opts}</div>` +
      `<button id="hurl-start" class="continue-btn" ${this.picks.length === 3 ? '' : 'disabled'}>Take the field ▸</button>`;
    this.body.querySelectorAll('.hurl-pick').forEach((b) => b.addEventListener('click', () => {
      if (this.picks.length < 3) { this.picks.push(b.dataset.k); this._renderPick(); }
    }));
    this.body.querySelectorAll('.hurl-drop').forEach((b) => b.addEventListener('click', () => {
      this.picks.splice(+b.dataset.i, 1); this._renderPick();
    }));
    const start = document.getElementById('hurl-start');
    if (start) start.addEventListener('click', () => { if (this.picks.length === 3) this._nextRound(); });
  }

  // --- The shootout: three rounds, then sudden death on a tie ---
  _nextRound() {
    const done = this.round >= 3;
    if (done && this.pScore !== this.cScore) return this._finish();
    this._playerShot(this.round);
  }

  // Whether this strike is a nervy one to win/save — the meter shakes for it.
  _shaky(idx) {
    if (idx >= 3) return true; // sudden death
    const shotsLeft = 3 - idx - 1;
    return Math.abs(this.pScore - this.cScore) <= 1 && shotsLeft <= 1;
  }

  _pitchHtml(who, type, sweetC, sweetW, msg) {
    const sw = Math.round(sweetW * 100), sl = Math.round((sweetC - sweetW / 2) * 100);
    return `<h3>Round ${this.round + 1} · You ${this.pScore} – ${this.cScore} Them</h3>` +
      `<div class="hurl-pitch">` +
      `<div class="hurl-goal"><span class="post"></span><span class="bar"></span><span class="post"></span></div>` +
      `<img class="hurl-striker" src="${spriteSrc(type)}" alt="">` +
      `</div>` +
      `<p class="hurl-sub">${msg}</p>` +
      `<div class="hurl-meter"><div class="sweet" style="left:${sl}%;width:${sw}%"></div><div class="mk" id="hurl-mk"></div></div>` +
      `<button id="hurl-strike" class="continue-btn">STRIKE!</button>`;
  }

  _playerShot(idx) {
    const type = this.picks[idx % this.picks.length];
    const shaky = this._shaky(idx);
    let w = sweetFor(type); if (shaky) w *= 0.66;
    const c = 0.25 + Math.random() * 0.5; // sweet-spot centre wanders each strike
    this.body.innerHTML = this._pitchHtml('you', type, c, w, shaky
      ? `${label(type)} steps up — and this one is to win it. Steady… stop the strike in the green.`
      : `${label(type)} steps up. Time your strike — stop it in the green.`);
    const mk = document.getElementById('hurl-mk');
    const btn = document.getElementById('hurl-strike');
    let t = 0, dir = 1, done = false;
    const speed = shaky ? 1.45 : 0.95;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      t += dir * speed * dt;
      if (t >= 1) { t = 1; dir = -1; } else if (t <= 0) { t = 0; dir = 1; }
      const jitter = shaky ? (Math.random() - 0.5) * 0.04 : 0;
      mk.style.left = Math.max(0, Math.min(1, t + jitter)) * 100 + '%';
      if (!done) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
    const strike = () => {
      if (done) return; done = true;
      cancelAnimationFrame(this._raf); this._onTap = null;
      const hit = Math.abs(t - c) <= w / 2;
      if (hit) this.pScore++;
      this._resolveShot(true, type, hit, idx);
    };
    this._onTap = strike;
    if (btn) btn.addEventListener('click', strike);
  }

  _resolveShot(isPlayer, type, hit, idx) {
    const verdict = hit
      ? `<span class="hurl-ok">Over the bar — a point! ${label(type)} raises the camán.</span>`
      : `<span class="hurl-miss">Wide! It drifts past the post.</span>`;
    this.body.innerHTML =
      `<h3>You ${this.pScore} – ${this.cScore} Them</h3>` +
      `<p class="hurl-sub">${verdict}</p>` +
      `<button id="hurl-next" class="continue-btn">${idx >= 2 ? 'The challengers reply ▸' : 'Next ▸'}</button>`;
    document.getElementById('hurl-next').addEventListener('click', () => this._challengerShot(idx));
  }

  _challengerShot(idx) {
    const hit = Math.random() < CHALLENGER_ODDS;
    if (hit) this.cScore++;
    this.body.innerHTML =
      `<h3>You ${this.pScore} – ${this.cScore} Them</h3>` +
      `<p class="hurl-sub">The challenger strikes from the same spot… ` +
      (hit ? `<span class="hurl-miss">and it sails over. A point to them.</span>` : `<span class="hurl-ok">and it's wide! No score.</span>`) + `</p>` +
      `<button id="hurl-next" class="continue-btn">Continue ▸</button>`;
    document.getElementById('hurl-next').addEventListener('click', () => { this.round++; this._nextRound(); });
  }

  _finish() {
    const won = this.pScore > this.cScore;
    this.body.innerHTML =
      `<h3>${won ? '🏆 The Field is Yours' : 'The Day is Theirs'}</h3>` +
      `<p class="hurl-sub">Final: You ${this.pScore} – ${this.cScore} Them. ` +
      (won
        ? `The wandering band bows to your strikers. Raise a monument to the victory — while it stands, the harvest comes in a fifth more plentiful.`
        : `The challengers take the honours and move on. Field a surer team when the next band comes calling.`) + `</p>` +
      `<button id="hurl-done" class="continue-btn">${won ? 'Claim your monument ▸' : 'Back to the ráth'}</button>`;
    document.getElementById('hurl-done').addEventListener('click', () => { this.onResolve(won); this.close(); });
  }
}
