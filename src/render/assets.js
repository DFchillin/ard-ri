import * as THREE from 'three';

// Loads the sliced pixel-art PNGs and turns them into billboard sprites.
// Textures load async; sizing callbacks run once each image arrives.
const V = '15';
const PPT = 128; // pixels per map tile the art was authored at
const loader = new THREE.TextureLoader();
const cache = new Map();

export function tex(path) {
  if (cache.has(path)) return cache.get(path);
  const t = loader.load(path + '?v=' + V, () => {
    t.needsUpdate = true;
    for (const fn of t._cbs || []) fn();
    t._cbs = [];
  });
  t._cbs = [];
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(path, t);
  return t;
}

function onReady(texture, fn) {
  if (texture.image && texture.image.width) fn();
  else (texture._cbs = texture._cbs || []).push(fn);
}

// Size a sprite from the art's own pixels (image / PPT), scaled by k.
export function sizeSprite(sprite, texture, k = 1) {
  onReady(texture, () => {
    const i = texture.image;
    sprite.scale.set((i.width / PPT) * k, (i.height / PPT) * k, 1);
  });
}

// Size a sprite to a fixed world width, keeping the art's aspect ratio.
export function fitWidth(sprite, texture, worldWidth) {
  onReady(texture, () => {
    const i = texture.image;
    sprite.scale.set(worldWidth, worldWidth * (i.height / i.width), 1);
  });
}

export function spriteFrom(texture, k = 1) {
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.12 });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0); // base-centre: sits on the ground
  s.scale.set(1, 1, 1);
  sizeSprite(s, texture, k);
  return s;
}

export { PPT };
