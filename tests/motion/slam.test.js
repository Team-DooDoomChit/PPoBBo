import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SlamDetector } from '../../src/motion/slamDetector.js';

/** y 값 목록을 30fps로 넣고 결과 목록을 돌려준다 */
const run = (d, ys, t0 = 0) => ys.map((y, i) => d.update(y, t0 + i / 30));

test('빠르게 내려치면 한 번 인식', () => {
  const out = run(new SlamDetector(), [0.4, 0.4, 0.45, 0.53, 0.62, 0.7, 0.72, 0.72]);
  assert.equal(out.indexOf(true), 3, '0.12 이상 내려간 첫 프레임(0.4 → 0.53)에서 인식');
  assert.equal(out.lastIndexOf(true), 7, '이후 150ms 동안만 true 유지');
});

test('천천히 내리면 인식하지 않음', () => {
  // 1초에 0.3 내려감 (0.3/초 < 0.9/초)
  const ys = Array.from({ length: 31 }, (_, i) => 0.4 + i * 0.01);
  assert.ok(!run(new SlamDetector(), ys).includes(true));
});

test('조금만 내려가면 빨라도 인식하지 않음', () => {
  assert.ok(!run(new SlamDetector(), [0.4, 0.44, 0.48, 0.5, 0.5]).includes(true));
});

test('위로 빠르게 올리면 인식하지 않음', () => {
  assert.ok(!run(new SlamDetector(), [0.7, 0.6, 0.5, 0.4, 0.3]).includes(true));
});

test('인식 뒤 잠깐(150ms) true를 유지했다가 false', () => {
  const d = new SlamDetector();
  run(d, [0.4, 0.5, 0.6]); // t=2/30에 인식
  assert.equal(d.update(0.6, 0.1), true);
  assert.equal(d.update(0.6, 0.25), false);
});

test('쿨다운 동안은 다시 내려쳐도 인식하지 않고, 지나면 다시 인식', () => {
  const d = new SlamDetector();
  const first = run(d, [0.3, 0.4, 0.5]);
  assert.ok(first.includes(true));
  // 0.3초 뒤 다시 내려침 (쿨다운 0.7초 안)
  assert.ok(!run(d, [0.3, 0.4, 0.5, 0.6], 0.4).includes(true));
  const later = run(d, [0.3, 0.4, 0.5, 0.6], 1.2);
  assert.ok(later.includes(true));
});

test('손이 사라지면 기록을 비운다 (다시 나타난 위치와 이어서 계산하지 않음)', () => {
  const d = new SlamDetector();
  d.update(0.2, 0);
  d.update(null, 0.033);
  assert.equal(d.update(0.8, 0.066), false);
});
