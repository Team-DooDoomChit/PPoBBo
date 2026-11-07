import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { buildHulaBunny } from '../../src/three/dolls/hulaBunny.js';
import { createDollMesh, disposeDollMesh } from '../../src/three/DollFactory.js';
import * as CANNON from 'cannon-es';
import { createDollBody, dollProfile } from '../../src/physics/DollBody.js';
import { getDoll } from '../../src/data/dolls.js';
import { MACHINES } from '../../src/data/machines.js';

const build = (fur = new THREE.MeshStandardMaterial()) => {
  const group = new THREE.Group();
  buildHulaBunny(group, {}, { fur });
  return group;
};
const meshes = (group) => {
  const list = [];
  group.traverse((o) => o.isMesh && list.push(o));
  return list;
};
const boxOf = (mesh) => new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);

test('인형 하나는 재질 수만큼(13개)의 메시만 만든다', () => {
  assert.equal(meshes(build()).length, 13);
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
  // buildHulaBunny는 … → 얼굴(선 · 흰 부분 · 볼 · 혀) 순서로 마지막에 넣는다
  for (const m of meshes(build()).slice(-4)) {
    const { min } = boxOf(m);
    assert.ok(min.z > 0.02, `얼굴 부품이 옆·뒤로 가면 안 됨 (min z ${min.z.toFixed(3)})`);
  }
});

test('긴 귀가 머리 위로 솟고, 횃불은 왼쪽(-x)에 있다', () => {
  const [body, , , , , , stick, flame] = meshes(build());
  const head = new THREE.Box3().setFromBufferAttribute(body.geometry.attributes.position);
  assert.ok(head.max.y > 0.12, `귀 끝 ${head.max.y.toFixed(3)}`);
  assert.ok(boxOf(stick).max.x < -0.03, '횃불 막대는 왼쪽');
  assert.ok(boxOf(flame).min.y > boxOf(stick).min.y, '불꽃은 막대 위쪽');
});

test('몸통 구 밖으로 나온 횃불 불꽃은 상자 충돌체 안에 들어간다', () => {
  const flame = boxOf(meshes(build())[7]);
  const body = createDollBody(new CANNON.Material(), [0, 0, 0], 'hulaBunny');
  const covers = body.shapes.some((shape, i) => {
    if (!(shape instanceof CANNON.Box)) return false;
    const c = body.shapeOffsets[i];
    const h = shape.halfExtents;
    const EPS = 0.004; // 불꽃 끝의 뾰족한 부분은 4mm까지 밖으로 나와도 된다
    return flame.min.x > c.x - h.x - EPS && flame.max.x < c.x + h.x + EPS && flame.max.y < c.y + h.y + EPS && flame.min.z > c.z - h.z - EPS && flame.max.z < c.z + h.z + EPS;
  });
  assert.ok(covers, `불꽃 x ${flame.min.x.toFixed(3)}~${flame.max.x.toFixed(3)}, y ~${flame.max.y.toFixed(3)}, z ${flame.min.z.toFixed(3)}~${flame.max.z.toFixed(3)}`);
});

test('모델 크기와 물리 충돌체가 맞는다 (위쪽 끝 차이 5mm 이내, 발바닥은 몸통 구 아래 끝 근처)', () => {
  const box = new THREE.Box3().setFromObject(build());
  const { top } = dollProfile('hulaBunny');
  assert.ok(Math.abs(box.max.y - top) < 0.005, `모델 ${box.max.y.toFixed(3)} / 충돌체 ${top}`);
  assert.ok(Math.abs(box.min.y - -0.065) < 0.004, `발바닥 ${box.min.y.toFixed(3)}`);
});

test('인형을 정리해도 공유 지오메트리는 해제하지 않는다 (다른 인형이 계속 쓴다)', () => {
  const doll = createDollMesh(getDoll('bunny-hula'));
  let disposed = 0;
  meshes(doll).forEach((m) => m.geometry.addEventListener('dispose', () => disposed++));
  disposeDollMesh(doll);
  assert.equal(disposed, 0);
  assert.equal(meshes(createDollMesh(getDoll('bunny-hula'))).length, 13, '정리한 뒤에도 새 인형을 만들 수 있다');
});

test('인어섬 시리즈 기계(bear)에 인어섬 우사기로 등록돼 있다', () => {
  const doll = getDoll('bunny-hula');
  assert.equal(doll.machineId, 'bear');
  assert.equal(doll.type, 'hulaBunny');
  assert.equal(doll.name, '인어섬 우사기');
  assert.equal(MACHINES.find((m) => m.id === 'bear').name, '인어섬 시리즈');
});
