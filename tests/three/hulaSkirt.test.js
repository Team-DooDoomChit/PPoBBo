import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { skirtHips, skirtLining } from '../../src/three/dolls/hulaBase.js';
import { createDollMesh } from '../../src/three/DollFactory.js';
import { getDoll } from '../../src/data/dolls.js';

const SKIRT = { waistY: -0.021, strandY: -0.043, back: { r: 0.0488, tilt: 0.2, height: 0.042 } };
const boxOf = (g) => new THREE.Box3().setFromBufferAttribute(g.attributes.position);

test('치마 안감은 양면이고 치마 끝보다 조금 위에서 끝난다', () => {
  const g = skirtLining(0.85, SKIRT);
  const { min, max } = boxOf(g);
  const hem = SKIRT.strandY - (Math.cos(SKIRT.back.tilt) * SKIRT.back.height) / 2;
  assert.ok(min.y > hem, `안감 아래 끝 ${min.y.toFixed(3)} / 치마 끝 ${hem.toFixed(3)}`);
  assert.ok(max.y <= SKIRT.waistY + 0.002, '안감 위 끝은 허리 근처');
  // 같은 꼭짓점이 바깥·안쪽 두 벌 (양면)
  const normals = g.attributes.normal;
  let outward = 0;
  let inward = 0;
  for (let i = 0; i < normals.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
    const n = new THREE.Vector3().fromBufferAttribute(normals, i);
    if (n.x * p.x + n.z * p.z > 0) outward++;
    else inward++;
  }
  assert.equal(outward, inward);
});

test('치마 속 몸 아랫부분은 안감 안쪽에 들어간다', () => {
  const hips = boxOf(skirtHips(0.85, SKIRT));
  const lining = boxOf(skirtLining(0.85, SKIRT));
  assert.ok(hips.max.x < lining.max.x && hips.max.z < lining.max.z, '몸이 안감 밖으로 나오면 안 됨');
  assert.ok(hips.max.y <= SKIRT.waistY + 1e-6 && hips.min.y > lining.min.y - 0.002, '허리에서 치마 끝 바로 위까지');
});

for (const id of ['hamster-hula', 'cat-hula', 'bunny-hula', 'momonga-hula']) {
  test(`${id}: 치마 속이 몸으로 채워져 있다 (허리 아래에도 몸이 있다)`, () => {
    const doll = createDollMesh(getDoll(id));
    doll.updateMatrixWorld(true);
    const [body] = doll.children;
    const skirt = doll.children.find((m) => m.material.color?.getHex() === 0xbde3a1);
    const hem = new THREE.Box3().setFromObject(skirt).min.y;
    // 치마 끝 바로 위 높이에서 가운데를 옆으로 지나는 광선이 몸에 맞아야 한다 (예전에는 발 사이 빈 공간)
    const y = hem + 0.012;
    const ray = new THREE.Raycaster(new THREE.Vector3(-0.2, y, 0), new THREE.Vector3(1, 0, 0));
    const hit = ray.intersectObject(body).find((h) => Math.abs(h.point.x) < 0.045);
    assert.ok(hit, `치마 끝 위 ${y.toFixed(3)} 높이에 몸이 있어야 함`);
  });
}
