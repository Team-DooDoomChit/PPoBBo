import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDollMesh, disposeDollMesh } from './DollFactory.js';

const FRAME_PADDING = 1.2;

/**
 * 인형 전체(귀, 키링 체인 등 포함)가 화면에 들어오도록 카메라를 맞춘다.
 * @returns {{ center: THREE.Vector3, distance: number }}
 */
function frameObject(camera, object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitHeight = size.y / 2 / Math.tan(halfFov);
  const fitWidth = Math.max(size.x, size.z) / 2 / (Math.tan(halfFov) * camera.aspect);
  const distance = Math.max(fitHeight, fitWidth) * FRAME_PADDING + Math.max(size.x, size.z) / 2;
  camera.position.set(center.x, center.y + distance * 0.08, center.z + distance);
  camera.lookAt(center);
  return { center, distance };
}

function createStage() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x443366, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(0.5, 1, 1);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x3de0ff, 1.2);
  rim.position.set(-1, 0.5, -1);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
  return { scene, camera };
}

// ---------- 썸네일 (공유 렌더러 1개로 이미지 생성 후 캐시) ----------

const thumbCache = new Map();
let thumbRenderer = null;
let thumbStage = null;

export function getDollThumbnail(doll, size = 256) {
  if (thumbCache.has(doll.id)) return thumbCache.get(doll.id);

  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
    thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    thumbStage = createStage();
  }
  thumbRenderer.setSize(size, size, false);

  const mesh = createDollMesh(doll);
  mesh.rotation.y = -0.35;
  thumbStage.scene.add(mesh);
  frameObject(thumbStage.camera, mesh);
  thumbRenderer.render(thumbStage.scene, thumbStage.camera);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  thumbStage.scene.remove(mesh);
  disposeDollMesh(mesh); // 이미지로 남겼으니 GPU 리소스는 바로 해제

  thumbCache.set(doll.id, url);
  return url;
}

// ---------- 360° 뷰어 ----------

/**
 * 캔버스에 인형 하나를 띄우고 드래그로 360° 회전, 자동 회전을 지원한다.
 * @returns {{ setAutoRotate(on: boolean): void, dispose(): void }}
 */
export function createDollViewer(canvas, doll) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const { scene, camera } = createStage();
  const mesh = createDollMesh(doll);
  scene.add(mesh);

  const { center, distance } = frameObject(camera, mesh);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(center);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = distance * 0.55;
  controls.maxDistance = distance * 1.6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 3;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      // dispose()만으로는 WebGL 컨텍스트가 반납되지 않아, 여러 번 열면 메인 씬 컨텍스트가 끊길 수 있다
      renderer.forceContextLoss();
    },
  };
}
