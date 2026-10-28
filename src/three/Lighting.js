import * as THREE from 'three';

/** 오락실 전체 조명: 은은한 환경광 + 그림자용 주광 + 네온 포인트 라이트 */
export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight(0x8a7dff, 0x1a0f2e, 0.6);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const neonPink = new THREE.PointLight(0xff4fa3, 6, 8, 2);
  neonPink.position.set(-3.5, 2.6, -2);
  scene.add(neonPink);

  const neonCyan = new THREE.PointLight(0x3de0ff, 6, 8, 2);
  neonCyan.position.set(3.5, 2.6, -2);
  scene.add(neonCyan);

  return { hemi, key, neonPink, neonCyan };
}
