// DOM overlay wiring. Owns the HTML controls and exposes callbacks to the
// world; the world never reads the DOM directly.
export class UI {
  constructor({ onSpeed, onBuildSelect }) {
    this.onSpeed = onSpeed;
    this.onBuildSelect = onBuildSelect;

    this.buildHint = document.getElementById('build-hint');
    this.buildBtns = [...document.querySelectorAll('.build-btn')];
    this.speedBtns = [...document.querySelectorAll('.speed-btn')];

    this.el = {
      cattle: document.getElementById('stat-cattle'),
      silver: document.getElementById('stat-silver'),
      folk: document.getElementById('stat-folk'),
      season: document.getElementById('stat-season'),
      day: document.getElementById('stat-day'),
    };

    this.activeBuild = null;

    this.speedBtns.forEach((b) =>
      b.addEventListener('click', () => this._selectSpeed(b))
    );
    this.buildBtns.forEach((b) =>
      b.addEventListener('click', () => this._toggleBuild(b))
    );
  }

  _selectSpeed(btn) {
    this.speedBtns.forEach((b) => b.classList.toggle('active', b === btn));
    this.onSpeed(Number(btn.dataset.speed));
  }

  _toggleBuild(btn) {
    const kind = btn.dataset.build;
    const turningOff = this.activeBuild === kind;
    this.setBuild(turningOff ? null : kind);
  }

  setBuild(kind) {
    this.activeBuild = kind;
    this.buildBtns.forEach((b) =>
      b.classList.toggle('active', b.dataset.build === kind)
    );
    this.buildHint.classList.toggle('hidden', !kind);
    this.onBuildSelect(kind);
  }

  setStats({ cattle, silver, folk, season, day }) {
    if (cattle != null) this.el.cattle.textContent = cattle;
    if (silver != null) this.el.silver.textContent = silver;
    if (folk != null) this.el.folk.textContent = folk;
    if (season != null) this.el.season.textContent = season;
    if (day != null) this.el.day.textContent = `Day ${day}`;
  }
}
