import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel, peekModel } from './ModelLoader.js';
import { buildScarfBunny, buildScarfCat, buildScarfHamster, buildScarfMomonga } from './dolls/scarfDolls.js';
import { buildHulaHamster } from './dolls/hulaHamster.js';
import { buildHulaCat } from './dolls/hulaCat.js';

/**
 * 인형 3D 모델(절차적) 생성.
 * 원점 = 몸통 중심, +Y = 머리 방향, +Z = 얼굴 정면.
 * 물리 충돌체(DOLL_SHAPE)와 크기를 맞춘다.
 */
export const DOLL_SHAPE = {
  bodyRadius: 0.065,
  headRadius: 0.055,
  headOffsetY: 0.09,
};

const geo = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  cone: new THREE.ConeGeometry(1, 1, 16),
};

const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

/** 인형 하나가 만든(공유하지 않는) 머티리얼 표시. disposeDollMesh는 표시된 것만 해제한다. */
const owned = (material) => {
  material.userData.ownedByDoll = true;
  return material;
};

function part(geometry, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  mesh.castShadow = shadow; // 아주 작은 부품은 그림자를 만들지 않는다
  mesh.receiveShadow = true;
  return mesh;
}

const s = (r) => [r, r, r];

function createMaterials(doll) {
  const fur = owned(new THREE.MeshStandardMaterial({
    color: doll.color,
    roughness: 0.85,
    emissive: doll.glow ? doll.color : 0x000000,
    emissiveIntensity: doll.glow ? 0.35 : 0,
  }));
  const sub = owned(new THREE.MeshStandardMaterial({ color: doll.sub, roughness: 0.8 }));
  return { fur, sub };
}

function addFace(group, { headY, headR }) {
  const eyeZ = headR * 0.88;
  group.add(
    part(geo.sphere, black, { pos: [-0.02, headY + 0.012, eyeZ], scale: s(0.008) }),
    part(geo.sphere, black, { pos: [0.02, headY + 0.012, eyeZ], scale: s(0.008) }),
  );
}

const builders = {
  bunny(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br, br * 0.9] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.sphere, fur, { pos: [-0.022, hy + 0.075, 0], scale: [0.016, 0.045, 0.012], rot: [0, 0, 0.15] }),
      part(geo.sphere, fur, { pos: [0.022, hy + 0.075, 0], scale: [0.016, 0.045, 0.012], rot: [0, 0, -0.15] }),
      part(geo.sphere, sub, { pos: [-0.022, hy + 0.075, 0.007], scale: [0.009, 0.034, 0.008], rot: [0, 0, 0.15] }),
      part(geo.sphere, sub, { pos: [0.022, hy + 0.075, 0.007], scale: [0.009, 0.034, 0.008], rot: [0, 0, -0.15] }),
      part(geo.sphere, fur, { pos: [-0.03, -0.055, 0.03], scale: [0.024, 0.018, 0.032] }),
      part(geo.sphere, fur, { pos: [0.03, -0.055, 0.03], scale: [0.024, 0.018, 0.032] }),
      part(geo.sphere, sub, { pos: [0, -0.01, -br * 0.9], scale: s(0.02) }),
    );
    addFace(group, { headY: hy, headR: hr });
    group.add(part(geo.sphere, sub, { pos: [0, hy - 0.008, hr * 0.92], scale: s(0.007) }));
  },

  chick(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br * 1.05, br, br] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.cone, sub, { pos: [0, hy - 0.008, hr + 0.008], scale: [0.012, 0.022, 0.012], rot: [Math.PI / 2, 0, 0] }),
      part(geo.sphere, fur, { pos: [-0.066, 0.01, 0], scale: [0.012, 0.035, 0.028], rot: [0, 0, 0.4] }),
      part(geo.sphere, fur, { pos: [0.066, 0.01, 0], scale: [0.012, 0.035, 0.028], rot: [0, 0, -0.4] }),
      part(geo.cone, fur, { pos: [0, hy + hr + 0.008, 0], scale: [0.012, 0.025, 0.012] }),
      part(geo.sphere, sub, { pos: [-0.025, -0.065, 0.02], scale: [0.016, 0.008, 0.024] }),
      part(geo.sphere, sub, { pos: [0.025, -0.065, 0.02], scale: [0.016, 0.008, 0.024] }),
    );
    addFace(group, { headY: hy + 0.006, headR: hr });
  },

  cat(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br * 0.95, br * 0.9] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: [hr * 1.08, hr, hr] }),
      part(geo.cone, fur, { pos: [-0.032, hy + 0.05, 0], scale: [0.02, 0.035, 0.016], rot: [0, 0, 0.3] }),
      part(geo.cone, fur, { pos: [0.032, hy + 0.05, 0], scale: [0.02, 0.035, 0.016], rot: [0, 0, -0.3] }),
      part(geo.sphere, fur, { pos: [0, -0.02, -0.07], scale: [0.012, 0.012, 0.045], rot: [0.6, 0, 0] }),
      part(geo.sphere, fur, { pos: [-0.032, -0.055, 0.03], scale: s(0.022) }),
      part(geo.sphere, fur, { pos: [0.032, -0.055, 0.03], scale: s(0.022) }),
    );
    // 노란 눈
    group.add(
      part(geo.sphere, sub, { pos: [-0.02, hy + 0.01, hr * 0.86], scale: [0.011, 0.013, 0.006] }),
      part(geo.sphere, sub, { pos: [0.02, hy + 0.01, hr * 0.86], scale: [0.011, 0.013, 0.006] }),
      part(geo.sphere, black, { pos: [-0.02, hy + 0.01, hr * 0.86 + 0.005], scale: [0.004, 0.01, 0.003] }),
      part(geo.sphere, black, { pos: [0.02, hy + 0.01, hr * 0.86 + 0.005], scale: [0.004, 0.01, 0.003] }),
    );
  },
};

// 별도 파일로 만든 인형 (#49, #53, #55)
builders.keychainBunny = buildScarfBunny;
builders.keychainCat = buildScarfCat;
builders.keychainHamster = buildScarfHamster;
builders.keychainMomonga = buildScarfMomonga; // #73
builders.hulaHamster = buildHulaHamster;
builders.hulaCat = buildHulaCat;

// 인형 종류별로 합쳐 둔 부품 지오메트리 (같은 종류 인형끼리 공유, 해제하지 않음)
const mergedParts = new Map();

/**
 * 같은 머티리얼·그림자 설정의 부품을 메시 하나로 합친다 (그리기 호출 수 = 머티리얼 수 정도).
 * 빌더는 종류마다 부품 구성이 같고 머티리얼만 다르므로, 지오메트리는 종류별로 한 번만 합친다.
 */
function mergeParts(group, type) {
  group.updateMatrixWorld(true); // 그룹은 아직 원점이라 matrixWorld = 그룹 기준 변환
  const buckets = [];
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    let bucket = buckets.find((b) => b.material === obj.material && b.castShadow === obj.castShadow);
    if (!bucket) buckets.push((bucket = { material: obj.material, castShadow: obj.castShadow, parts: [] }));
    bucket.parts.push(obj);
  });

  let geometries = mergedParts.get(type);
  if (!geometries) {
    geometries = buckets.map(({ parts }) => {
      const indexed = parts.every((mesh) => mesh.geometry.index);
      return mergeGeometries(parts.map((mesh) => {
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        g.deleteAttribute('uv'); // 텍스처를 쓰지 않는다. 직접 만든 지오메트리에는 uv가 없어 맞춘다
        return indexed || !g.index ? g : g.toNonIndexed();
      }));
    });
    mergedParts.set(type, geometries);
  }

  group.clear();
  buckets.forEach(({ material, castShadow }, i) => {
    const mesh = new THREE.Mesh(geometries[i], material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}

const MODEL_HEIGHT = 0.21; // .glb 인형을 맞출 높이 (절차적 인형과 비슷하게)

/**
 * .glb 모델을 인형 좌표계에 맞춘다: 높이 MODEL_HEIGHT, 좌우·앞뒤 가운데, 바닥은 몸통 아래.
 * 물리 충돌체(DOLL_SHAPE)는 그대로라 비슷한 크기·비율의 모델이 자연스럽다.
 */
function fitModel(model) {
  model.position.set(0, 0, 0); // 루트가 원점에서 떨어져 있어도 아래 계산이 맞도록
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = MODEL_HEIGHT / Math.max(size.y, 1e-6);
  model.scale.multiplyScalar(scale);
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  model.position.set(-center.x, -DOLL_SHAPE.bodyRadius - box.min.y * scale, -center.z);
}

function useModel(group, model) {
  fitModel(model);
  disposeOwnedMaterials(group);
  group.clear();
  group.add(model);
}

/**
 * 인형 데이터(data/dolls.js 항목)로 Three.js 그룹을 만든다.
 * doll.modelUrl의 .glb가 이미 로드돼 있으면 바로 쓰고, 아니면 절차적 모델을 먼저 보여 준 뒤
 * 로드되면 교체하고 그룹에 'modelloaded' 이벤트를 보낸다 (실패 시 절차적 모델 유지).
 */
export function createDollMesh(doll) {
  const group = new THREE.Group();
  group.name = `Doll:${doll.id}`;
  group.userData.dollId = doll.id;

  const ready = doll.modelUrl && peekModel(doll.modelUrl);
  if (ready) {
    fitModel(ready);
    group.add(ready);
    return group;
  }

  builders[doll.type](group, doll, createMaterials(doll));
  mergeParts(group, doll.type);
  if (doll.modelUrl) {
    loadModel(doll.modelUrl).then((model) => {
      // 로드 전에 제거된 인형(획득, 썸네일용 등)에는 붙이지 않는다
      if (!model || group.userData.disposed) return;
      useModel(group, model);
      group.dispatchEvent({ type: 'modelloaded' });
    });
  }
  return group;
}

/** 인형이 직접 만든 머티리얼만 해제 (공유 머티리얼, .glb 복제본이 공유하는 머티리얼은 제외) */
function disposeOwnedMaterials(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const material of [obj.material].flat()) if (material?.userData.ownedByDoll) material.dispose();
  });
}

/** 다 쓴 인형 정리. 이후 끝나는 .glb 로드는 이 인형에 붙지 않는다. */
export function disposeDollMesh(group) {
  group.userData.disposed = true;
  disposeOwnedMaterials(group);
}
