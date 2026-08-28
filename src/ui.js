import { BUILDINGS, CATEGORIES, ROAD_ITEM } from './data/buildings.js?v=18';

// DOM overlay. Owns the HTML controls; the world never reads the DOM directly.
export class UI {
  constructor({ onTool, onSpeed, onRotate, onZoom, onInspectClose, onFestivalContinue, onStartMission, onPlaceConfirm, onPlaceCancel, onPlaceAlt, onLedger }) {
    this.onTool = onTool;
    this.onSpeed = onSpeed;
    this.onInspectClose = onInspectClose || (() => {});
    this.onFestivalContinue = onFestivalContinue || (() => {});
    this.activeTool = null;

    this.panel = document.getElementById('build-panel');
    this.tabsEl = document.getElementById('build-tabs');
    this.listEl = document.getElementById('build-list');
    this.inspectTool = document.getElementById('inspect-tool');
    this.demolishTool = document.getElementById('demolish-tool');
    this.roamTool = document.getElementById('roam-tool');
    this.titleScreen = document.getElementById('title-screen');
    this.placeConfirm = document.getElementById('place-confirm');
    this.compassLabel = document.getElementById('compass-label');
    this.seasonIcon = document.getElementById('stat-season-icon');
    this.missionList = document.getElementById('mission-list');
    this.popup = document.getElementById('inspect-popup');
    this.popupBody = document.getElementById('inspect-body');
    this.inspectContinue = document.getElementById('inspect-continue');
    this.speedBtns = [...document.querySelectorAll('.speed-btn')];
    this.festival = document.getElementById('festival-overlay');

    this.el = {
      cattle: document.getElementById('stat-cattle'),
      silver: document.getElementById('stat-silver'),
      folk: document.getElementById('stat-folk'),
      season: document.getElementById('stat-season'),
      day: document.getElementById('stat-day'),
    };

    // Speed
    this.speedBtns.forEach((b) =>
      b.addEventListener('click', () => {
        this.reflectSpeed(Number(b.dataset.speed));
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
    this.inspectFab = document.getElementById('inspect-fab');
    this.inspectFab.addEventListener('click', () => this.selectTool('inspect'));
    this.inspectTool.addEventListener('click', () => this.selectTool('inspect'));
    this.demolishTool.addEventListener('click', () => this.selectTool('demolish'));
    this.roamTool.addEventListener('click', () => this.roam());
    document.getElementById('inspect-close').addEventListener('click', () => this.hideInspect());
    this.inspectContinue.addEventListener('click', () => this.hideInspect());
    document.getElementById('fest-continue').addEventListener('click', () => this.hideFestival());
    this.placeLabel = document.getElementById('place-label');
    this.placeAlt = document.getElementById('place-alt');
    document.getElementById('place-do').addEventListener('click', () => (onPlaceConfirm || (() => {}))());
    document.getElementById('place-cancel').addEventListener('click', () => (onPlaceCancel || (() => {}))());
    if (this.placeAlt) this.placeAlt.addEventListener('click', () => (onPlaceAlt || (() => {}))());
    [...document.querySelectorAll('.mission-btn:not(.locked)')].forEach((b) =>
      b.addEventListener('click', () => { this.hideTitle(); (onStartMission || (() => {}))(); })
    );

    // Full-screen toggle (top corner)
    this.fsBtn = document.getElementById('fullscreen-btn');
    if (this.fsBtn) {
      this.fsBtn.addEventListener('click', () => {
        const el = document.documentElement;
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        } else {
          (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
        }
      });
      const sync = () => {
        const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.fsBtn.textContent = on ? '🡼' : '⛶';
        this.fsBtn.title = on ? 'Exit full screen' : 'Play full screen';
      };
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync);
    }

    // Tap the silver in the topbar to open the ledger.
    const silverStat = this.el.silver && this.el.silver.closest('.stat');
    if (silverStat) {
      silverStat.style.cursor = 'pointer';
      silverStat.addEventListener('click', () => (onLedger || (() => {}))());
    }

    this._buildTabs();
    this._renderList(CATEGORIES[0].id);
  }

  roam() {
    this.activeTool = null;
    this._applyToolHighlight();
    this.hideInspect();
    this.onTool(null);
    this._setDrawer(false);
  }

  showTitle() { if (this.titleScreen) this.titleScreen.classList.remove('hidden'); }
  hideTitle() { if (this.titleScreen) this.titleScreen.classList.add('hidden'); }
  showPlaceConfirm({ road = false, label = '', alt = true } = {}) {
    if (this.placeLabel) {
      this.placeLabel.textContent = label;
      this.placeLabel.classList.toggle('hidden', !road);
    }
    if (this.placeAlt) this.placeAlt.classList.toggle('hidden', !road || !alt);
    if (this.placeConfirm) this.placeConfirm.classList.remove('hidden');
  }
  hidePlaceConfirm() { if (this.placeConfirm) this.placeConfirm.classList.add('hidden'); }

  _setDrawer(open) {
    this.panel.classList.toggle('open', open);
    this.fab.style.display = open ? 'none' : '';
    if (this.inspectFab) this.inspectFab.style.display = open ? 'none' : '';
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
      b.title = def.desc || '';
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
    // Inspect/demolish want the full map — close the build drawer on mobile.
    if (this.activeTool === 'inspect' || this.activeTool === 'demolish') this._setDrawer(false);
    this.onTool(this.activeTool);
  }

  setTool(key) {
    this.activeTool = key;
    this._applyToolHighlight();
  }

  _applyToolHighlight() {
    this.inspectTool.classList.toggle('active', this.activeTool === 'inspect');
    this.demolishTool.classList.toggle('active', this.activeTool === 'demolish');
    if (this.inspectFab) this.inspectFab.classList.toggle('active', this.activeTool === 'inspect');
    if (this.fab) this.fab.classList.toggle('active', !!this.activeTool && this.activeTool !== 'inspect' && this.activeTool !== 'demolish');
    if (this.roamTool) this.roamTool.classList.toggle('active', this.activeTool === null);
    [...this.listEl.querySelectorAll('.build-btn')].forEach((b) =>
      b.classList.toggle('active', b.dataset.key === this.activeTool)
    );
  }

  setCompass(label) { if (this.compassLabel) this.compassLabel.textContent = label; }
  setSeasonIcon(icon) { if (this.seasonIcon) this.seasonIcon.textContent = icon; }

  reflectSpeed(s) {
    this.speedBtns.forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === s));
  }

  showInspect(html, withContinue = false) {
    this.popupBody.innerHTML = html;
    this.inspectContinue.classList.toggle('hidden', !withContinue);
    this.popup.classList.remove('hidden');
  }
  hideInspect() {
    if (this.popup.classList.contains('hidden')) return;
    this.popup.classList.add('hidden');
    this.onInspectClose();
  }

  showFestival({ name, emoji, sub }) {
    document.getElementById('fest-name').textContent = name;
    document.getElementById('fest-emoji').textContent = emoji;
    document.getElementById('fest-sub').textContent = sub;
    this.festival.classList.remove('hidden');
  }
  hideFestival() {
    if (this.festival.classList.contains('hidden')) return;
    this.festival.classList.add('hidden');
    this.onFestivalContinue();
  }

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
    if (day != null) this.el.day.textContent = day;
  }
}
