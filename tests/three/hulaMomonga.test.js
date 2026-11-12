import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { buildHulaMomonga } from '../../src/three/dolls/hulaMomonga.js';
import { createDollMesh, disposeDollMesh } from '../../src/three/DollFactory.js';
import { dollProfile } from '../../src/physics/DollBody.js';
import { getDoll } from '../../src/data/dolls.js';

const build = (fur = new THREE.MeshStandardMaterial()) => {
  const group = new THREE.Group();
  buildHulaMomonga(group, {}, { fur });
  return group;
};
const meshes = (group) => {
  const list = [];
  group.traverse((o) => o.isMesh && list.push(o));
  return list;
};
const boxOf = (mesh) => new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);

test('인형 하나는 재질 수만큼(11개)의 메시만 만든다', () => {
  assert.equal(meshes(build()).length, 11);
});

test('모양 지오메트리와 몸 외 재질은 모든 인형이 공유하고, 몸 색만 인형마다 다르다', () => {
  const furA = new THREE.MeshStandardMaterial();
  const furB = new THREE.MeshStandardMaterial();
  const a = meshes(build(furA));
  const b = meshes(build(furB));
  a.forEach((m, i) => assert.equal(m.geometry, b[i].geometry, `${i}번 지오메트리 공유`));
  assert.equal(a[0].material, furA);
  assert.equal(a[1].material, furA, '털 뭉치도 몸 색');
  assert.equal(b[0].material, furB);
  a.slice(2).forEach((m, i) => assert.equal(m.material, b[i + 2].material, `${i + 2}번 재질 공유`));
});

test('얼굴(코·눈·입·볼)은 앞쪽(+z)에만 있고 뒷면에는 없다', () => {
  // buildHulaMomonga는 … → 코 → 얼굴(선 · 흰 부분 · 볼) 순서로 마지막에 넣는다
  for (const m of meshes(build()).slice(-4)) {
    const { min } = boxOf(m);
    assert.ok(min.z > 0.02, `얼굴 부품이 옆·뒤로 가면 안 됨 (min z ${min.z.toFixed(3)})`);
  }
});

test('앞뒤 어디서 봐도 머리 바로 아래에서 치마가 시작해 목이 따로 보이지 않는다 (빈틈 없음)', () => {
  const group = build();
  group.updateMatrixWorld(true);
  // 머리 아래 끝(-0.006)부터 치마 위쪽(-0.02)까지, 앞·뒤에서 가운데로 광선을 쏘면 머리·치마·몸 중 하나에 맞아야 한다
  for (const z of [0.2, -0.2]) {
    for (let y = -0.004; y >= -0.02; y -= 0.004) {
      const ray = new THREE.Raycaster(new THREE.Vector3(0, y, z), new THREE.Vector3(0, 0, -Math.sign(z)));
      assert.ok(ray.intersectObject(group, true).length > 0, `${z > 0 ? '앞' : '뒤'} y ${y.toFixed(3)} 높이에 빈틈`);
    }
  }
});

test('귀·털 뭉치까지 모델 크기와 물리 충돌체가 맞는다', () => {
  const box = new THREE.Box3().setFromObject(build());
  const { top } = dollProfile('hulaMomonga');
  assert.ok(Math.abs(box.max.y - top) < 0.005, `모델 ${box.max.y.toFixed(3)} / 충돌체 ${top}`);
  assert.ok(Math.abs(box.min.y - -0.065) < 0.004, `치마 아래 끝 ${box.min.y.toFixed(3)}`);
  assert.ok(box.max.x < 0.1 && box.min.x > -0.1, `털 뭉치 좌우 끝 ${box.min.x.toFixed(3)} ~ ${box.max.x.toFixed(3)}`);
});

test('인형을 정리해도 공유 지오메트리는 해제하지 않는다 (다른 인형이 계속 쓴다)', () => {
  const doll = createDollMesh(getDoll('momonga-hula'));
  // DollFactory가 같은 재질 부품을 합칠 수 있어서(mergeParts), 숫자 대신 처음 만든 인형과 비교한다
  const count = meshes(doll).length;
  let disposed = 0;
  meshes(doll).forEach((m) => m.geometry.addEventListener('dispose', () => disposed++));
  disposeDollMesh(doll);
  assert.equal(disposed, 0);
  assert.equal(meshes(createDollMesh(getDoll('momonga-hula'))).length, count, '정리한 뒤에도 새 인형을 만들 수 있다');
});

test('인어섬 시리즈 기계(bear)에 인어섬 모몽가로 등록돼 있다', () => {
  const doll = getDoll('momonga-hula');
  assert.equal(doll.machineId, 'bear');
  assert.equal(doll.type, 'hulaMomonga');
  assert.equal(doll.name, '인어섬 모몽가');
});
