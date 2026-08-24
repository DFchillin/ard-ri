import { BUILDINGS, CATEGORIES, ROAD_ITEM } from './data/buildings.js';

// DOM overlay. Owns the HTML controls; the world never reads the DOM directly.
export class UI {
  constructor({ onTool, onSpeed, onRotate, onZoom }) {
    this.onTool = onTool;
    this.onSpeed = onSpeed;
    this.activeTool = null;

    this.panel = document.getElementById('build-panel');
    this.tabsEl = document.getElementById('build-tabs');
    this.listEl = document.getElementById('build-list');
    this.inspectTool = document.getElementById('inspect-tool');
    this.compassLabel = document.getElementById('compass-label');
    this.missionList = document.getElementById('mission-list');
    this.popup = document.getElementById('inspect-popup');
    this.popupBody = document.getElementById('inspect-body');

    this.el = {
      cattle: document.getElementById('stat-cattle'),
      silver: document.getElementById('stat-silver'),
      folk: document.getElementById('stat-folk'),
      season: document.getElementById('stat-season'),
      day: document.getElementById('stat-day'),
    };

    // Speed
    [...document.querySelectorAll('.speed-btn')].forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach((o) => o.classList.toggle('active', o === b));
        onSpeed(Number(b.dataset.speed));
      })
    );

    // Map controls
    document.getElementById('rot-left').addEventListener('click', () => onRotate(-1));
    document.getElementById('rot-right').addEventListener('click', () => onRotate(1));
    document.getElementById('zoom-in').addEventListener('click', () => onZoom(0.85));
    document.getElementById('zoom-out').addEventListener('click', () => onZoom(1.18));

    // Drawer + tools
    this.fab = document.getElementById('build-toggle');
    this.fab.addEventListener('click', () => this._setDrawer(true));
    document.getElementById('build-close').addEventListener('click', () => this._setDrawer(false));
    this.inspectTool.addEventListener('click', () => this.selectTool('inspect'));
    document.getElementById('inspect-close').addEventListener('click', () => this.hideInspect());

    this._buildTabs();
    this._renderList(CATEGORIES[0].id);
  }

  _setDrawer(open) {
    this.panel.classList.toggle('open', open);
    this.fab.style.display = open ? 'none' : '';
  }

  _buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const cat of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'tab-btn';
      b.textContent = cat.icon;
      b.title = cat.label;
      b.addEventListener('click', () => {
        [...this.tabsEl.children].forEach((c) => c.classList.toggle('active', c === b));
        this._renderList(cat.id);
      });
      this.tabsEl.appendChild(b);
    }
    this.tabsEl.firstChild.classList.add('active');
  }

  _renderList(catId) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    this.listEl.innerHTML = '';
    for (const key of cat.items) {
      const def = key === 'road' ? ROAD_ITEM : BUILDINGS[key];
      const b = document.createElement('button');
      b.className = 'build-btn';
      b.dataset.key = key;
      b.innerHTML = `<span class="b-icon">${def.icon}</span>` +
        `<span class="b-name">${def.label}</span>` +
        (def.cost ? `<span class="b-cost">🪙${def.cost}</span>` : '');
      b.addEventListener('click', () => this.selectTool(key));
      this.listEl.appendChild(b);
    }
    this._applyToolHighlight();
  }

  selectTool(key) {
    this.activeTool = this.activeTool === key ? null : key;
    if (this.activeTool !== 'inspect') this.hideInspect();
    this._applyToolHighlight();
    this.onTool(this.activeTool);
  }

  setTool(key) {
    this.activeTool = key;
    this._applyToolHighlight();
  }

  _applyToolHighlight() {
    this.inspectTool.classList.toggle('active', this.activeTool === 'inspect');
    [...this.listEl.querySelectorAll('.build-btn')].forEach((b) =>
      b.classList.toggle('active', b.dataset.key === this.activeTool)
    );
  }

  setCompass(label) { if (this.compassLabel) this.compassLabel.textContent = label; }

  showInspect(html) { this.popupBody.innerHTML = html; this.popup.classList.remove('hidden'); }
  hideInspect() { this.popup.classList.add('hidden'); }

  setObjectives(objectives) {
    this.missionList.innerHTML = objectives
      .map((o) => `<li class="${o.done ? 'done' : ''}">${o.done ? '✓' : '○'} ${o.text}</li>`)
      .join('');
  }

  setStats({ cattle, silver, folk, season, day }) {
    if (cattle != null) this.el.cattle.textContent = cattle;
    if (silver != null) this.el.silver.textContent = silver;
    if (folk != null) this.el.folk.textContent = folk;
    if (season != null) this.el.season.textContent = season;
    if (day != null) this.el.day.textContent = `Day ${day}`;
  }
}
