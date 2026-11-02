import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { buildHulaCat } from '../../src/three/dolls/hulaCat.js';
import { createDollMesh, disposeDollMesh } from '../../src/three/DollFactory.js';
import { dollProfile } from '../../src/physics/DollBody.js';
import { getDoll, getDollsByMachine } from '../../src/data/dolls.js';

const build = (fur = new THREE.MeshStandardMaterial()) => {
  const group = new THREE.Group();
  buildHulaCat(group, {}, { fur });
  return group;
};
const meshes = (group) => {
  const list = [];
  group.traverse((o) => o.isMesh && list.push(o));
  return list;
};
const boxOf = (mesh) => new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);

test('인형 하나는 재질 수만큼(10개)의 메시만 만든다', () => {
  assert.equal(meshes(build()).length, 10);
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

test('얼굴(눈·입·볼·혀)은 앞쪽(+z)에만 있고 뒷면에는 없다', () => {
  // buildHulaCat은 몸 → 파란 모자·귀 → 치마 2겹 → 꽃잎 → 진주 → 얼굴(선 · 흰 부분 · 볼 · 혀) 순서로 넣는다
  for (const m of meshes(build()).slice(-4)) {
    const { min } = boxOf(m);
    assert.ok(min.z > 0.02, `얼굴 부품이 옆·뒤로 가면 안 됨 (min z ${min.z.toFixed(3)})`);
  }
});

test('파란 모자 무늬는 머리 윗부분만 덮고, 뾰족한 귀가 머리 위로 솟는다', () => {
  const [body, blue] = meshes(build());
  const head = boxOf(body);
  const cap = boxOf(blue);
  assert.ok(cap.min.y > 0.03, `모자 아래 끝이 눈 위에 있어야 함 (${cap.min.y.toFixed(3)})`);
  assert.ok(cap.max.y > head.max.y + 0.008, `귀가 머리 위로 솟아야 함 (귀 ${cap.max.y.toFixed(3)} / 머리 ${head.max.y.toFixed(3)})`);
});

test('모델 크기와 물리 충돌체가 맞는다 (위쪽 끝 차이 5mm 이내)', () => {
  const box = new THREE.Box3().setFromObject(build());
  const { top } = dollProfile('hulaCat');
  assert.ok(Math.abs(box.max.y - top) < 0.005, `모델 ${box.max.y.toFixed(3)} / 충돌체 ${top}`);
  assert.ok(box.min.y > -0.085 && box.min.y < -0.06, `발바닥 ${box.min.y.toFixed(3)}`);
  assert.ok(box.max.x < 0.085, `좌우 반폭 ${box.max.x.toFixed(3)}`);
});

test('인형을 정리해도 공유 지오메트리는 해제하지 않는다 (다른 인형이 계속 쓴다)', () => {
  const doll = createDollMesh(getDoll('cat-hula'));
  let disposed = 0;
  meshes(doll).forEach((m) => m.geometry.addEventListener('dispose', () => disposed++));
  disposeDollMesh(doll);
  assert.equal(disposed, 0);
  assert.equal(meshes(createDollMesh(getDoll('cat-hula'))).length, 10, '정리한 뒤에도 새 인형을 만들 수 있다');
});

test('인어섬 시리즈 기계(bear)에 인어섬 치이카와와 함께 인어섬 하치와레로 등록돼 있다', () => {
  const doll = getDoll('cat-hula');
  assert.equal(doll.machineId, 'bear');
  assert.equal(doll.type, 'hulaCat');
  assert.equal(doll.name, '인어섬 하치와레');
  assert.deepEqual(getDollsByMachine('bear').map((d) => d.id), ['hamster-hula', 'cat-hula']);
});
