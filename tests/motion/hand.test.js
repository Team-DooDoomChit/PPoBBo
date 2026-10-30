import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyHand, fingerState, handAnchors, handTilt, handIsFlat } from '../../src/motion/handGestures.js';
import { OneEuroFilter, BoolDebouncer } from '../../src/motion/filters.js';
import { HandTracker } from '../../src/motion/HandTracker.js';
import { makeHand, POSES, NO_HAND } from './handFixtures.js';

const world = (pose) => makeHand(pose).worldLandmarks[0];
const pick = ({ isFist, isPointing, isPinching }) => ({ isFist, isPointing, isPinching });

// ---------------- 제스처 판별 ----------------

test('편 손: 아무 제스처도 아님', () => {
  assert.deepEqual(pick(classifyHand(world(POSES.open))), { isFist: false, isPointing: false, isPinching: false });
});

test('주먹', () => {
  assert.deepEqual(pick(classifyHand(world(POSES.fist))), { isFist: true, isPointing: false, isPinching: false });
});

test('주먹에서 엄지가 검지 위에 있어도 집기로 보지 않는다', () => {
  const r = classifyHand(world(POSES.fist));
  assert.ok(r.pinch < 0.5, `엄지-검지가 가까운 자세여야 함 (pinch=${r.pinch.toFixed(2)})`);
  assert.equal(r.isPinching, false);
});

test('검지 가리키기', () => {
  assert.deepEqual(pick(classifyHand(world(POSES.point))), { isFist: false, isPointing: true, isPinching: false });
});

test('엄지·검지 집기', () => {
  assert.deepEqual(pick(classifyHand(world(POSES.pinch))), { isFist: false, isPointing: false, isPinching: true });
});

test('OK 사인: 엄지·검지 동그라미 + 나머지 세 손가락 폄', () => {
  assert.equal(classifyHand(world(POSES.ok)).isOk, true);
});

test('OK 사인이 아닌 자세', () => {
  assert.equal(classifyHand(world(POSES.okBent)).isOk, false, '중지를 굽히면 OK 아님');
  assert.equal(classifyHand(world(POSES.open)).isOk, false, '편 손');
  assert.equal(classifyHand(world(POSES.fist)).isOk, false, '주먹');
});

test('손 크기가 달라도 같은 결과 (크기 비율로 판별)', () => {
  for (const s of [0.6, 1.5]) {
    const scaled = world(POSES.point).map((p) => ({ x: p.x * s, y: p.y * s, z: p.z * s }));
    assert.equal(classifyHand(scaled).isPointing, true, `scale ${s}`);
  }
});

test('손을 기울여도 같은 결과 (회전에 영향 없음)', () => {
  const a = 0.8;
  const rotated = world(POSES.fist).map((p) => ({
    x: p.x * Math.cos(a) - p.y * Math.sin(a),
    y: p.x * Math.sin(a) + p.y * Math.cos(a),
    z: p.z,
  }));
  assert.equal(classifyHand(rotated).isFist, true);
});

test('집기 히스테리시스: 살짝 벌어져도 집기 유지, 많이 벌리면 해제', () => {
  const w = world(POSES.pinch);
  const palm = Math.hypot(w[9].x, w[9].y, w[9].z);
  const withGap = (ratio) => {
    const c = w.map((p) => ({ ...p }));
    c[4] = { ...c[8], x: c[8].x - ratio * palm };
    return c;
  };
  assert.equal(classifyHand(withGap(0.42), { isPinching: false }).isPinching, false); // 새로 집기엔 부족
  assert.equal(classifyHand(withGap(0.42), { isPinching: true }).isPinching, true); // 집는 중엔 유지
  assert.equal(classifyHand(withGap(0.6), { isPinching: true }).isPinching, false);
});

test('손가락 상태: 편 손가락 / 굽힌 손가락', () => {
  assert.equal(fingerState(world(POSES.open), 'index'), 'extended');
  assert.equal(fingerState(world(POSES.fist), 'index'), 'curled');
});

test('화면 기준점은 좌우 반전된다', () => {
  const { landmarks } = makeHand(POSES.open, { x: 0.2, y: 0.5 });
  const a = handAnchors(landmarks[0]);
  assert.ok(a.palm.x > 0.7, `원본 왼쪽(0.2) → 반전 후 오른쪽 (${a.palm.x.toFixed(2)})`);
  assert.ok(a.indexTip.y < a.palm.y, '검지 끝이 손바닥보다 위');
});

// ---------------- 필터 ----------------

test('One Euro: 정지 상태의 떨림을 줄인다', () => {
  const f = new OneEuroFilter({ minCutoff: 1.5, beta: 4 });
  let maxDev = 0;
  for (let i = 0; i < 120; i++) {
    const noisy = 0.5 + (i % 2 ? 0.01 : -0.01);
    const out = f.filter(noisy, i / 30);
    if (i > 10) maxDev = Math.max(maxDev, Math.abs(out - 0.5));
  }
  assert.ok(maxDev < 0.005, `떨림 ±0.01 → ±${maxDev.toFixed(4)}`);
});

test('One Euro: 빠르게 움직이면 금방 따라간다', () => {
  const f = new OneEuroFilter({ minCutoff: 1.5, beta: 4 });
  let out = 0;
  for (let i = 0; i <= 10; i++) out = f.filter(i * 0.05, i / 30); // 0 → 0.5 (1/3초)
  assert.ok(out > 0.42, `지연이 작아야 함 (${out.toFixed(3)})`);
});

test('디바운서: 짧은 깜빡임은 무시, 유지되면 반영', () => {
  const d = new BoolDebouncer({ onMs: 80, offMs: 120 });
  assert.equal(d.update(true, 0), false);
  assert.equal(d.update(false, 0.03), false); // 30ms 만에 꺼짐 → 무시
  assert.equal(d.update(true, 0.1), false);
  assert.equal(d.update(true, 0.19), true); // 90ms 유지
  assert.equal(d.update(false, 0.25), true);
  assert.equal(d.update(false, 0.36), true); // 110ms: 아직 유지
  assert.equal(d.update(false, 0.38), false); // 130ms 지나면 꺼짐
});

// ---------------- HandTracker ----------------

function run(tracker, frames, from = 0) {
  let s;
  frames.forEach((f, i) => (s = tracker.update(f, from + i / 30)));
  return s;
}
const repeat = (frame, n) => Array.from({ length: n }, () => frame);

test('트래커: 주먹을 유지하면 isFist', () => {
  const s = run(new HandTracker(), repeat(makeHand(POSES.fist), 6));
  assert.equal(s.detected, true);
  assert.equal(s.isFist, true);
});

test('트래커: 한 프레임 오인식은 무시', () => {
  const frames = [...repeat(makeHand(POSES.open), 5), makeHand(POSES.fist), ...repeat(makeHand(POSES.open), 3)];
  const t = new HandTracker();
  const seen = frames.map((f, i) => t.update(f, i / 30).isFist);
  assert.ok(seen.every((v) => v === false));
});

test('트래커: 집는 중이면 커서가 엄지·검지 사이', () => {
  const s = run(new HandTracker(), repeat(makeHand(POSES.pinch), 8));
  assert.equal(s.isPinching, true);
  assert.ok(s.pointer.y < s.palm.y);
});

test('트래커: 손이 잠깐 사라지는 건 유지, 오래 사라지면 초기화', () => {
  const t = new HandTracker({ lostMs: 250 });
  run(t, repeat(makeHand(POSES.fist), 6));
  assert.equal(t.update(NO_HAND, 6 / 30 + 0.1).detected, true);
  const s = t.update(NO_HAND, 6 / 30 + 0.4);
  assert.equal(s.detected, false);
  assert.equal(s.isFist, false);
  assert.equal(s.pointer, null);
});

test('트래커: 오른손/왼손 정보', () => {
  assert.equal(run(new HandTracker(), [makeHand(POSES.open)]).handedness, 'Right');
});

test('트래커: OK 사인은 0.25초 이상 유지해야 켜진다 (코인 잘못 투입 방지)', () => {
  const t = new HandTracker();
  assert.equal(run(t, repeat(makeHand(POSES.ok), 6)).isOk, false, '0.17초');
  assert.equal(run(t, repeat(makeHand(POSES.ok), 4), 6 / 30).isOk, true, '0.3초');
});

test('트래커: slam 옵션을 켜면 아래로 내려치는 동작을 인식', () => {
  const t = new HandTracker({ slam: true });
  const frames = [0.3, 0.3, 0.38, 0.47, 0.56].map((y) => makeHand(POSES.open, { x: 0.3, y }));
  const seen = frames.map((f, i) => t.update(f, i / 30).isSlam);
  assert.ok(seen.includes(true));
  assert.equal(new HandTracker().update(frames[0], 0).isSlam, false, '옵션이 꺼져 있으면 항상 false');
});

test('트래커: 내려친 직후 손이 화면 밖으로 나가도 isSlam이 잠깐 유지된다', () => {
  const t = new HandTracker({ slam: true });
  [0.3, 0.4, 0.5].forEach((y, i) => t.update(makeHand(POSES.open, { x: 0.3, y }), i / 30));
  assert.equal(t.update(NO_HAND, 0.1).isSlam, true);
  assert.equal(t.update(NO_HAND, 0.3).isSlam, false);
});

// ---------------- 손 기울기 (#34) ----------------

test('기울기: 손을 세우면 0, 주먹이든 편 손이든 같다', () => {
  for (const pose of [POSES.fist, POSES.open]) {
    const t = handTilt(makeHand(pose).worldLandmarks[0]);
    assert.ok(Math.abs(t.x) < 0.05 && Math.abs(t.y) < 0.15, `${JSON.stringify(t)}`);
  }
});

test('기울기: 앞으로 숙이면 y+, 뒤로 젖히면 y-', () => {
  const base = handTilt(makeHand(POSES.fist).worldLandmarks[0]).y;
  const fwd = handTilt(makeHand(POSES.fist, undefined, 2, { forward: 0.4 }).worldLandmarks[0]).y - base;
  const back = handTilt(makeHand(POSES.fist, undefined, 2, { forward: -0.4 }).worldLandmarks[0]).y - base;
  assert.ok(Math.abs(fwd - 0.4) < 0.05, `fwd=${fwd}`);
  assert.ok(Math.abs(back + 0.4) < 0.05, `back=${back}`);
});

test('기울기: 오른쪽으로 기울이면 x+, 왼쪽은 x-', () => {
  const r = handTilt(makeHand(POSES.fist, undefined, 2, { right: 0.3 }).worldLandmarks[0]);
  const l = handTilt(makeHand(POSES.fist, undefined, 2, { right: -0.3 }).worldLandmarks[0]);
  assert.ok(Math.abs(r.x - 0.3) < 0.05, `r=${r.x}`);
  assert.ok(Math.abs(l.x + 0.3) < 0.05, `l=${l.x}`);
});

test('트래커: 손 기울기를 떨림 보정해서 알려 준다', () => {
  const s = run(new HandTracker(), repeat(makeHand(POSES.fist, undefined, 2, { forward: 0.3, right: -0.2 }), 10));
  assert.ok(Math.abs(s.tilt.y - 0.3) < 0.05, `y=${s.tilt.y}`);
  assert.ok(Math.abs(s.tilt.x + 0.2) < 0.05, `x=${s.tilt.x}`);
  assert.equal(new HandTracker().state.tilt, null, '손이 없으면 null');
});

// ---------------- 손 수평 (#47 손바닥 누르기) ----------------

test('수평: 손끝을 앞이나 옆으로 눕힌 손은 수평', () => {
  const w = (tilt) => makeHand(POSES.open, undefined, 2, tilt).worldLandmarks[0];
  assert.equal(handIsFlat(w({ forward: Math.PI / 2 })), true, '손끝이 앞(화면 쪽)');
  assert.equal(handIsFlat(w({ right: Math.PI / 2 })), true, '손끝이 옆');
  assert.equal(handIsFlat(w({ forward: 1.1 })), true, '약 63도 눕힘');
});

test('수평 아님: 세운 손, 손끝이 아래로 처진 손', () => {
  const w = (tilt) => makeHand(POSES.open, undefined, 2, tilt).worldLandmarks[0];
  assert.equal(handIsFlat(w({})), false, '세운 손');
  assert.equal(handIsFlat(w({ forward: 0.5 })), false, '조금만 숙임');
  assert.equal(handIsFlat(w({ forward: Math.PI })), false, '손끝이 아래 (내려놓은 손)');
});
