import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { limb } from '../../src/three/dolls/hulaBase.js';

test('팔은 어깨에서 손끝까지 정확히 이어진다 (어깨를 몸통 속에 두면 떨어져 보이지 않는다)', () => {
  const shoulder = new THREE.Vector3(0.03, -0.01, 0.004);
  const hand = new THREE.Vector3(0.062, -0.022, 0.012);
  const g = limb(shoulder.toArray(), hand.toArray(), 0.007, 0.008);
  const pos = g.attributes.position;
  const axis = hand.clone().sub(shoulder).normalize();
  let lo = Infinity;
  let hi = -Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = p.fromBufferAttribute(pos, i).sub(shoulder).dot(axis);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  assert.ok(Math.abs(lo) < 1e-4, `어깨 끝 ${lo}`);
  assert.ok(Math.abs(hi - hand.distanceTo(shoulder)) < 1e-4, `손끝 ${hi}`);
});
