import * as THREE from 'three';

// Loads the sliced pixel-art PNGs and turns them into correctly-scaled billboard
// sprites. Art is authored at PPT pixels per map tile, so a sprite's world size
// is just its image size / PPT. Textures load async; sprites self-size on load.
const V = '14';
const PPT = 128;
const loader = new THREE.TextureLoader();
const cache = new Map();

export function tex(path) {
  if (cache.has(path)) return cache.get(path);
  const t = loader.load(path + '?v=' + V, () => {
    t.needsUpdate = true;
    for (const s of t._waiting || []) sizeSprite(s, t, s._k || 1);
    t._waiting = [];
  });
  t._waiting = [];
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(path, t);
  return t;
}

export function sizeSprite(sprite, texture, k = 1) {
  const img = texture.image;
  if (img && img.width) {
    sprite.scale.set((img.width / PPT) * k, (img.height / PPT) * k, 1);
  } else {
    sprite._k = k;
    (texture._waiting = texture._waiting || []).push(sprite);
  }
}

export function spriteFrom(texture, k = 1) {
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.12 });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0); // base-centre anchor: sits on the ground
  s.scale.set(1, 1, 1);
  sizeSprite(s, texture, k);
  return s;
}

export { PPT };
