import * as THREE from 'three';

// Loads the sliced pixel-art PNGs and turns them into billboard sprites.
// Textures load async; sizing callbacks run once each image arrives.
const V = 'CBUST';
const PPT = 128; // pixels per map tile the art was authored at
const loader = new THREE.TextureLoader();
const cache = new Map();

export function tex(path, onError) {
  let t = cache.get(path);
  if (!t) {
    t = loader.load(path + '?v=' + V, () => {
      t.needsUpdate = true;
      for (const fn of t._cbs || []) fn();
      t._cbs = [];
    }, undefined, () => { t._failed = true; for (const fn of t._errCbs || []) fn(t); t._errCbs = []; });
    t._cbs = []; t._errCbs = [];
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(path, t);
  }
  if (onError) { if (t._failed) onError(t); else t._errCbs.push(onError); }
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

// --- Walker facing: map a world movement vector to one of 8 screen directions ---
let _cam = null;
const _f = new THREE.Vector3(), _r = new THREE.Vector3();
const OCT = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']; // clockwise from toward-camera
export function setCamera(cam) { _cam = cam; }
export function screenDir(dx, dz) {
  if (!_cam || (!dx && !dz)) return 's';
  _cam.getWorldDirection(_f); _f.y = 0; _f.normalize(); // into the screen, on the ground
  _r.set(-_f.z, 0, _f.x);                                // camera right
  const sx = dx * _r.x + dz * _r.z;                      // screen-right component
  const sy = dx * _f.x + dz * _f.z;                      // into-screen component
  const ang = Math.atan2(sx, -sy);                       // 0 = toward camera, +90° = right
  const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return OCT[i];
}

export { PPT };
