import * as THREE from 'three';

const DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
const loader = new THREE.TextureLoader();

function pixelate(tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural stand-in so the world is legible before real art lands.
export function placeholderTexture(label, color = '#e8c96b') {
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
  return pixelate(new THREE.CanvasTexture(c));
}

function loadInto(material, url) {
  loader.load(
    url,
    (tex) => {
      material.map = pixelate(tex);
      material.needsUpdate = true;
    },
    undefined,
    () => {} // keep the placeholder on 404
  );
}

// A building: one flat iso frame. Falls back to a placeholder if art is absent.
export function makeBuildingSprite(name, label = name[0].toUpperCase()) {
  const mat = new THREE.SpriteMaterial({ map: placeholderTexture(label) });
  loadInto(mat, `assets/buildings/${name}.png`);
  const spr = new THREE.Sprite(mat);
  spr.center.set(0.5, 0); // bottom-centre anchor sits on the tile
  return spr;
}

// A walker chosen from world heading. Concept art ships 4 frames
// (down/left/up/right = S/W/N/E); 8 is supported too. Any direction the art
// doesn't provide falls back to the nearest frame that did load.
export function makeWalkerSprite(name, label = name[0].toUpperCase()) {
  const mat = new THREE.SpriteMaterial({ map: placeholderTexture(label, '#9ad0ff') });
  const frames = {};
  for (const d of DIRS) {
    loader.load(
      `assets/walkers/${name}/${name}_${d}.png`,
      (tex) => (frames[d] = pixelate(tex)),
      undefined,
      () => {}
    );
  }
  const spr = new THREE.Sprite(mat);
  spr.center.set(0.5, 0);
  spr.setHeading = (rad) => {
    const target = ((Math.round(rad / (Math.PI / 4)) % 8) + 8) % 8;
    let tex;
    for (let step = 0; step < 8 && !tex; step++) {
      tex = frames[DIRS[(target + step) % 8]] || frames[DIRS[(target - step + 8) % 8]];
    }
    if (tex && mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  };
  return spr;
}
