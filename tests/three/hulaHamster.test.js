import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { buildHulaHamster } from '../../src/three/dolls/hulaHamster.js';
import { createDollMesh, disposeDollMesh } from '../../src/three/DollFactory.js';
import { dollProfile } from '../../src/physics/DollBody.js';
import { getDoll } from '../../src/data/dolls.js';
import { MACHINES } from '../../src/data/machines.js';

const build = (fur = new THREE.MeshStandardMaterial()) => {
  const group = new THREE.Group();
  buildHulaHamster(group, {}, { fur });
  return group;
};
const meshes = (group) => {
  const list = [];
  group.traverse((o) => o.isMesh && list.push(o));
  return list;
};

test('인형 하나는 재질 수만큼(8개)의 메시만 만든다', () => {
  assert.equal(meshes(build()).length, 8);
});

test('모양 지오메트리와 몸 외 재질은 모든 인형이 공유하고, 몸 색만 인형마다 다르다', () => {
  const furA = new THREE.MeshStandardMaterial();
  const furB = new THREE.MeshStandardMaterial();
  const a = meshes(build(furA));
  const b = meshes(build(furB));
  a.forEach((m, i) => assert.equal(m.geometry, b[i].geometry, `${i}번 지오메트리 공유`));
  assert.equal(a[0].material, furA);
  assert.equal(b[0].material, furB);
  a.slice(1).forEach((m, i) => assert.equal(m.material, b[i + 1].material, `${i + 1}번 재질 공유`));
});

test('얼굴(눈·입·볼)은 앞쪽(+z)에만 있고 뒷면에는 없다', () => {
  // buildHulaHamster는 몸 → 치마 2겹 → 꽃잎 → 진주 → 얼굴(선 · 흰 부분 · 볼) 순서로 넣는다
  const face = meshes(build()).slice(-3);
  for (const m of face) {
    const box = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position);
    assert.ok(box.min.z > 0.02, `얼굴 부품이 옆·뒤로 가면 안 됨 (min z ${box.min.z.toFixed(3)})`);
  }
});

test('모델 크기와 물리 충돌체가 맞는다 (위쪽 끝 차이 5mm 이내)', () => {
  const box = new THREE.Box3().setFromObject(build());
  const { top } = dollProfile('hulaHamster');
  assert.ok(Math.abs(box.max.y - top) < 0.005, `모델 ${box.max.y.toFixed(3)} / 충돌체 ${top}`);
  assert.ok(box.min.y > -0.085 && box.min.y < -0.07, `발바닥 ${box.min.y.toFixed(3)}`);
  assert.ok(box.max.x < 0.085, `좌우 반폭 ${box.max.x.toFixed(3)}`);
});

test('인형을 정리해도 공유 지오메트리는 해제하지 않는다 (다른 인형이 계속 쓴다)', () => {
  const doll = createDollMesh(getDoll('hamster-hula'));
  let disposed = 0;
  meshes(doll).forEach((m) => m.geometry.addEventListener('dispose', () => disposed++));
  disposeDollMesh(doll);
  assert.equal(disposed, 0);
  assert.equal(meshes(createDollMesh(getDoll('hamster-hula'))).length, 8, '정리한 뒤에도 새 인형을 만들 수 있다');
});

test('인어섬 시리즈 기계(bear)의 인어섬 치이카와로 등록돼 있다', () => {
  const doll = getDoll('hamster-hula');
  assert.equal(doll.machineId, 'bear');
  assert.equal(doll.type, 'hulaHamster');
  assert.equal(doll.name, '인어섬 치이카와');
  assert.equal(MACHINES.find((m) => m.id === 'bear').name, '인어섬 시리즈');
});
