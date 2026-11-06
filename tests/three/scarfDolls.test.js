import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createDollMesh, disposeDollMesh } from '../../src/three/DollFactory.js';
import { createDollBody, dollProfile } from '../../src/physics/DollBody.js';
import { getDoll, getDollsByMachine } from '../../src/data/dolls.js';

const IDS = ['bunny-scarf', 'cat-scarf', 'hamster-scarf', 'momonga-scarf'];
const meshes = (group) => {
  const list = [];
  group.traverse((o) => o.isMesh && list.push(o));
  return list;
};

test('치이카와 겨울 시리즈는 목도리 인형 4종이다', () => {
  assert.deepEqual(getDollsByMachine('bunny').map((d) => d.id), IDS);
});

test('네 인형의 몸(머리 폭·발바닥)이 같다', () => {
  for (const id of IDS) {
    const body = meshes(createDollMesh(getDoll(id))).find((m) => m.material.userData.ownedByDoll);
    const box = new THREE.Box3().setFromBufferAttribute(body.geometry.attributes.position);
    assert.ok(Math.abs(box.min.y - -0.0685) < 0.001, `${id} 발바닥 ${box.min.y.toFixed(4)}`);
    // 호빵 모몽가는 볼 옆 수염 판이 몸과 같은 재질로 합쳐져서 더 넓다
    const [low, high] = id === 'momonga-scarf' ? [0.085, 0.095] : [0.06, 0.07];
    assert.ok(box.max.x > low && box.max.x < high, `${id} 폭 ${box.max.x.toFixed(4)}`);
  }
});

test('호빵 모몽가의 꼬리는 발바닥 아래로 내려가지 않고 등 뒤에 있다', () => {
  const tail = meshes(createDollMesh(getDoll('momonga-scarf'))).find((m) => {
    const box = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position);
    return box.max.z < 0;
  });
  assert.ok(tail, '꼬리 메시');
  const box = new THREE.Box3().setFromBufferAttribute(tail.geometry.attributes.position);
  assert.ok(box.min.y > -0.0685, `꼬리 아래 ${box.min.y.toFixed(4)}`);
  assert.ok(box.min.z < -0.05, `꼬리 뒤 ${box.min.z.toFixed(4)}`);
});

test('모델 크기와 물리 충돌체가 맞는다 (위쪽 끝 차이 5mm 이내)', () => {
  for (const id of IDS) {
    const doll = getDoll(id);
    const box = new THREE.Box3().setFromObject(createDollMesh(doll));
    const { top, grabY } = dollProfile(doll.type);
    assert.ok(Math.abs(box.max.y - top) < 0.005, `${id} 모델 ${box.max.y.toFixed(3)} / 충돌체 ${top}`);
    assert.ok(grabY < top, `${id} 집는 높이 ${grabY}`);
  }
});

test('몸통 구 중심이 무게 중심(바디 원점)에 있어 넘어지지 않는다', () => {
  for (const id of IDS) {
    const body = createDollBody(undefined, [0, 0, 0], getDoll(id).type);
    assert.equal(body.shapeOffsets[0].y, 0, id);
  }
});

test('인형을 정리해도 공유 지오메트리는 해제하지 않는다', () => {
  for (const id of IDS) {
    const doll = createDollMesh(getDoll(id));
    let disposed = 0;
    meshes(doll).forEach((m) => m.geometry.addEventListener('dispose', () => disposed++));
    disposeDollMesh(doll);
    assert.equal(disposed, 0, id);
    assert.ok(meshes(createDollMesh(getDoll(id))).length > 0, id);
  }
});
