import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Renderer / Scene / Camera / 렌더 루프를 관리한다.
 * 다른 모듈은 onUpdate(dt)로 매 프레임 갱신 로직을 등록한다.
 */
export class SceneManager {
  #updaters = new Set();
  #cameraTween = null;
  #lastTime = 0;

  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0a1f);
    this.scene.fog = new THREE.Fog(0x0d0a1f, 9, 20);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
    this.camera.position.set(0, 2.2, 5.5);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.target.set(0, 1.2, 0);
    this.setControlLimits({ minDistance: 2, maxDistance: 8 });

    window.addEventListener('resize', () => this.#onResize());
  }

  /** 매 프레임 호출될 함수 등록. 반환값을 호출하면 해제된다. */
  onUpdate(fn) {
    this.#updaters.add(fn);
    return () => this.#updaters.delete(fn);
  }

  setControlLimits({
    minDistance = 2,
    maxDistance = 8,
    minPolarAngle = 0.2,
    maxPolarAngle = Math.PI / 2 - 0.05,
    minAzimuthAngle = -Infinity,
    maxAzimuthAngle = Infinity,
  } = {}) {
    Object.assign(this.controls, {
      minDistance,
      maxDistance,
      minPolarAngle,
      maxPolarAngle,
      minAzimuthAngle,
      maxAzimuthAngle,
    });
  }

  /** 카메라를 부드럽게 이동시킨다. 이동 중에는 OrbitControls 입력을 막는다. */
  moveCamera(position, target, duration = 1.2) {
    return new Promise((resolve) => {
      this.#cameraTween = {
        fromPos: this.camera.position.clone(),
        fromTarget: this.controls.target.clone(),
        toPos: position.clone(),
        toTarget: target.clone(),
        elapsed: 0,
        duration,
        resolve,
      };
      this.controls.enabled = false;
    });
  }

  start() {
    this.#lastTime = performance.now();
    this.renderer.setAnimationLoop((time) => {
      const dt = Math.min((time - this.#lastTime) / 1000, 0.1);
      this.#lastTime = time;

      this.#updateCameraTween(dt);
      this.#updaters.forEach((fn) => fn(dt, time / 1000));
      if (this.controls.enabled) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  #updateCameraTween(dt) {
    const tween = this.#cameraTween;
    if (!tween) return;

    tween.elapsed += dt;
    const t = easeInOutCubic(Math.min(tween.elapsed / tween.duration, 1));
    this.camera.position.lerpVectors(tween.fromPos, tween.toPos, t);
    this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, t);
    this.camera.lookAt(this.controls.target);

    if (t >= 1) {
      this.#cameraTween = null;
      this.controls.enabled = true;
      this.controls.update();
      tween.resolve();
    }
  }

  #onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
