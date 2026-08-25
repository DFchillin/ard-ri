import * as THREE from 'three';

// Four isometric vantage corners; rotating steps through them (90° each).
const CORNERS = [
  [1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1],
];
const LABELS = ['N', 'E', 'S', 'W'];
const R = 80;
const PAN_LIMIT = 22;

export function createIsoCamera(viewSize, aspect) {
  const cam = new THREE.OrthographicCamera(
    -viewSize * aspect, viewSize * aspect, viewSize, -viewSize, 0.1, 1000
  );
  cam.userData.viewSize = viewSize;
  cam.userData.dir = 0;
  cam.userData.pan = { x: 0, z: 0 };
  applyPose(cam);
  return cam;
}

function applyPose(cam) {
  const c = CORNERS[cam.userData.dir];
  const p = cam.userData.pan;
  cam.position.set(c[0] * R + p.x, c[1] * R, c[2] * R + p.z);
  cam.lookAt(p.x, 0, p.z);
}

export function rotateIsoCamera(cam, delta) {
  cam.userData.dir = (cam.userData.dir + delta + 4) % 4;
  applyPose(cam);
  return LABELS[cam.userData.dir];
}

export function panIsoCamera(cam, dx, dz) {
  const p = cam.userData.pan;
  p.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, p.x + dx));
  p.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, p.z + dz));
  applyPose(cam);
}

export function cameraDirLabel(cam) {
  return LABELS[cam.userData.dir];
}

export function resizeIsoCamera(cam, aspect) {
  const v = cam.userData.viewSize;
  cam.left = -v * aspect;
  cam.right = v * aspect;
  cam.top = v;
  cam.bottom = -v;
  cam.updateProjectionMatrix();
}

// factor < 1 zooms in (smaller view), > 1 zooms out.
export function zoomIsoCamera(cam, factor, aspect) {
  cam.userData.viewSize = Math.max(3.5, Math.min(38, cam.userData.viewSize * factor));
  resizeIsoCamera(cam, aspect);
}
