import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

/**
 * .glb/.gltf 모델을 로드한다. 같은 URL은 한 번만 내려받고 clone해서 돌려준다.
 * 파일이 없거나 로드에 실패하면 null을 반환하므로, 호출 측에서 절차적 모델로 대체한다.
 */
export async function loadModel(url) {
  if (!url) return null;

  if (!cache.has(url)) {
    cache.set(
      url,
      loader.loadAsync(url).catch((err) => {
        console.warn(`[ModelLoader] ${url} 로드 실패, 기본 모델을 사용합니다.`, err);
        return null;
      }),
    );
  }

  const gltf = await cache.get(url);
  if (!gltf) return null;

  const model = gltf.scene.clone(true);
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return model;
}
