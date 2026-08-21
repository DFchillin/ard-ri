import * as THREE from 'three';

export function createIsoCamera(viewSize, aspect) {
  const cam = new THREE.OrthographicCamera(
    -viewSize * aspect, viewSize * aspect,
    viewSize, -viewSize,
    0.1, 1000
  );
  // (1,1,1) look-at-origin yields the true isometric ~35.26° pitch at 45° yaw.
  cam.position.set(60, 60, 60);
  cam.lookAt(0, 0, 0);
  cam.userData.viewSize = viewSize;
  return cam;
}

export function resizeIsoCamera(cam, aspect) {
  const v = cam.userData.viewSize;
  cam.left = -v * aspect;
  cam.right = v * aspect;
  cam.top = v;
  cam.bottom = -v;
  cam.updateProjectionMatrix();
}

export function zoomIsoCamera(cam, viewSize, aspect) {
  cam.userData.viewSize = viewSize;
  resizeIsoCamera(cam, aspect);
}
