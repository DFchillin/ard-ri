import * as THREE from 'three';

// A soft round dot, shared by every particle.
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(24, 24, 24, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}
const DOT = dotTexture();
const rnd = (a, b) => a + Math.random() * (b - a);

// kind -> behaviour. All additive so a fade to black reads as "gone".
const CFG = {
  smoke:  { n: 10, color: 0xe4dcc6, size: 0.5,  op: 0.42, vy: 0.55, drift: 0.06, life: 2.2, grow: 1.6, rise: true },
  field:  { n: 16, color: 0xffd062, size: 0.3,  op: 0.85, vy: 0.28, drift: 0.05, life: 2.4, grow: 1.0, rise: true },
  market: { n: 14, color: 0xe6ecf4, size: 0.26, op: 0.9,  vy: -0.5, drift: 0.12, life: 1.7, grow: 1.0, rise: false },
};

export class Emitter {
  constructor(kind, { w = 1, h = 1, tile = 1, topY = 2 } = {}) {
    const cfg = (this.cfg = CFG[kind]);
    this.group = new THREE.Group();
    this.spanX = w * tile * 0.42;
    this.spanZ = h * tile * 0.42;
    this.topY = topY;
    this.parts = [];
    for (let i = 0; i < cfg.n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: DOT, color: cfg.color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const p = { s, age: rnd(0, cfg.life), life: rnd(cfg.life * 0.7, cfg.life * 1.2) };
      this._respawn(p, true);
      this.group.add(s);
      this.parts.push(p);
    }
  }

  _respawn(p, initial) {
    const c = this.cfg;
    p.age = initial ? p.age : 0;
    p.life = rnd(c.life * 0.7, c.life * 1.2);
    // smoke rises from the roof/chimney; area effects spread over the footprint
    const chimney = c.rise && c.vy > 0.4;
    p.x = chimney ? rnd(-0.12, 0.12) : rnd(-this.spanX, this.spanX);
    p.z = chimney ? rnd(-0.12, 0.12) : rnd(-this.spanZ, this.spanZ);
    p.y = chimney ? this.topY : (c.rise ? rnd(0.1, 0.5) : rnd(this.topY * 0.6, this.topY));
    p.vx = rnd(-c.drift, c.drift);
    p.vz = rnd(-c.drift, c.drift);
    p.vy = c.vy * rnd(0.8, 1.2);
    p.sz = c.size * rnd(0.7, 1.2);
  }

  update(dt) {
    if (!this.group.visible) return;
    const c = this.cfg;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) this._respawn(p, false);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life;
      const fade = Math.sin(Math.PI * t); // fade in then out
      p.s.material.opacity = fade * c.op;
      const grow = 1 + (c.grow - 1) * t;
      p.s.scale.setScalar(p.sz * grow);
      p.s.position.set(p.x, p.y, p.z);
    }
  }

  setActive(on) { this.group.visible = on; }
  dispose() { for (const p of this.parts) p.s.material.dispose(); }
}

export function emitterFor(role, opts) {
  if (role === 'dwelling') return new Emitter('smoke', opts);
  if (role === 'farm') return new Emitter('field', opts);
  if (role === 'market') return new Emitter('market', opts);
  return null;
}
