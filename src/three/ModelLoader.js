import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map(); // url → Promise<gltf | null>
const loaded = new Map(); // url → gltf (로드가 끝난 것만)

/** 복제본은 지오메트리·머티리얼을 원본과 공유한다 (해제하면 다른 복제본에도 영향) */
function cloneScene(gltf) {
  const model = gltf.scene.clone(true);
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return model;
}

/**
 * .glb/.gltf 모델을 로드한다. 같은 URL은 한 번만 내려받고 clone해서 돌려준다.
 * 파일이 없거나 로드에 실패하면 null을 반환하므로, 호출 측에서 절차적 모델로 대체한다.
 */
export async function loadModel(url) {
  if (!url) return null;

  if (!cache.has(url)) {
    cache.set(
      url,
      loader
        .loadAsync(url)
        .then((gltf) => {
          loaded.set(url, gltf);
          return gltf;
        })
        .catch((err) => {
          console.warn(`[ModelLoader] ${url} 로드 실패, 기본 모델을 사용합니다.`, err);
          return null;
        }),
    );
  }

  const gltf = await cache.get(url);
  return gltf ? cloneScene(gltf) : null;
}

/** 이미 로드가 끝난 모델이면 바로(동기) 복제본을 돌려준다. 아직이면 null */
export function peekModel(url) {
  const gltf = loaded.get(url);
  return gltf ? cloneScene(gltf) : null;
}
