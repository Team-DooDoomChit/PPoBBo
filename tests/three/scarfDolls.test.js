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
    const [low, high] = id === 'momonga-scarf' ? [0.075, 0.09] : [0.06, 0.07];
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

test('호빵 모몽가 수염 선은 머리 밖 판 위에 있고, 수염 판 충돌체가 판을 덮는다', () => {
  const doll = getDoll('momonga-scarf');
  const list = meshes(createDollMesh(doll));
  const OUT = 0.064; // 머리 반폭 0.061보다 바깥
  const ink = list.find((m) => m.material.color?.getHex() === 0x33221f);
  const inkBox = new THREE.Box3().setFromBufferAttribute(ink.geometry.attributes.position);
  assert.ok(inkBox.max.x > 0.075 && inkBox.min.x < -0.075, `수염 선 좌우 끝 ${inkBox.min.x.toFixed(4)} ~ ${inkBox.max.x.toFixed(4)}`);

  // 몸 메시 중 머리 밖으로 나온 볼 높이 부분 = 수염 판
  const fur = list.find((m) => m.material.userData.ownedByDoll);
  const pad = new THREE.Box3();
  const p = fur.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (Math.abs(v.x) > OUT && v.y > -0.03 && v.y < 0.06) pad.expandByPoint(v);
  }
  assert.ok(!pad.isEmpty(), '수염 판');
  const body = createDollBody(undefined, [0, 0, 0], doll.type);
  const i = body.shapes.findIndex((s, k) => s.halfExtents?.x > OUT && Math.abs(body.shapeOffsets[k].y) < 0.05); // 귀 상자(y 0.094)가 아닌 볼 높이 상자
  assert.ok(i >= 0, '수염 판 상자');
  const { halfExtents: h } = body.shapes[i];
  const o = body.shapeOffsets[i];
  const box = new THREE.Box3(new THREE.Vector3(o.x - h.x, o.y - h.y, o.z - h.z), new THREE.Vector3(o.x + h.x, o.y + h.y, o.z + h.z)).expandByScalar(0.001);
  assert.ok(box.containsBox(pad), `판 ${pad.min.toArray().map((x) => x.toFixed(4))} ~ ${pad.max.toArray().map((x) => x.toFixed(4))}`);
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
