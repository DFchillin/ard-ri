import * as THREE from 'three';

export class Grid {
  constructor(scene, size = 24, tile = 1) {
    this.size = size;
    this.tile = tile;
    this.half = (size * tile) / 2;

    const group = new THREE.Group();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size * tile, size * tile),
      new THREE.MeshLambertMaterial({ color: 0x4a6b3a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'ground';
    this.ground = ground;
    group.add(ground);

    const grid = new THREE.GridHelper(size * tile, size, 0x2c3f28, 0x39512f);
    grid.position.y = 0.01;
    group.add(grid);

    scene.add(group);
    this.group = group;
  }

  // World XZ -> integer tile coords, or null if off the board.
  worldToTile(x, z) {
    const tx = Math.floor((x + this.half) / this.tile);
    const tz = Math.floor((z + this.half) / this.tile);
    if (tx < 0 || tz < 0 || tx >= this.size || tz >= this.size) return null;
    return { tx, tz };
  }

  // Tile center in world space.
  tileToWorld(tx, tz) {
    return {
      x: tx * this.tile - this.half + this.tile / 2,
      z: tz * this.tile - this.half + this.tile / 2,
    };
  }
}
