import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { applyDeadzone, palmToJoystick } from '../../src/motion/joystickMapping.js';
import { MotionBridge } from '../../src/motion/MotionBridge.js';
import { HandTracker } from '../../src/motion/HandTracker.js';
import { HeadTracker } from '../../src/motion/HeadTracker.js';
import { inputState } from '../../src/core/InputState.js';
import { makeHand, POSES, NO_HAND } from './handFixtures.js';
import { makeFace } from './faceFixtures.js';

/** update 호출을 기록하는 가짜 InputState */
const recorder = () => {
  const calls = [];
  return { calls, update: (partial, source) => calls.push({ partial, source }) };
};
const hand = (over = {}) => ({
  detected: true, isFist: false, isPointing: false, isPinching: false,
  palm: { x: 0.5, y: 0.55 }, pointer: { x: 0.5, y: 0.4 }, ...over,
});
const head = (over = {}) => ({ detected: true, calibrated: true, yaw: 0, pitch: 0, gazeTarget: null, ...over });

beforeEach(() => inputState.reset());

// ---------------- 조이스틱 매핑 ----------------

test('데드존: 안쪽은 0, 바깥은 0~1로 다시 늘림', () => {
  assert.equal(applyDeadzone(0.1, 0.15), 0);
  assert.equal(applyDeadzone(1, 0.15), 1);
  assert.ok(Math.abs(applyDeadzone(-0.575, 0.15) + 0.5) < 1e-9);
});

test('손이 가운데면 0, 오른쪽/위로 가면 +', () => {
  assert.deepEqual(palmToJoystick({ x: 0.5, y: 0.55 }), { joystickX: 0, joystickY: 0 });
  const r = palmToJoystick({ x: 0.68, y: 0.37 });
  assert.equal(r.joystickX, 1);
  assert.equal(r.joystickY, 1);
});

test('범위를 넘어가도 ±1', () => {
  assert.deepEqual(palmToJoystick({ x: 0, y: 1 }), { joystickX: -1, joystickY: -1 });
});

test('가운데 근처 떨림은 0 (집게가 흘러가지 않음)', () => {
  assert.deepEqual(palmToJoystick({ x: 0.52, y: 0.53 }), { joystickX: 0, joystickY: 0 });
});

// ---------------- MotionBridge ----------------

test('처음엔 모든 값을 보내고, source는 motion', () => {
  const rec = recorder();
  new MotionBridge(rec).push(hand(), head());
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].source, 'motion');
  assert.deepEqual(Object.keys(rec.calls[0].partial).sort(),
    ['gazeTarget', 'headPitch', 'headYaw', 'isFist', 'isPinching', 'isPointing', 'joystickX', 'joystickY', 'pointer']);
});

test('값이 그대로면 보내지 않고, 바뀐 필드만 보낸다', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push(hand(), head());
  assert.equal(b.push(hand(), head()), null);
  b.push(hand({ isFist: true }), head());
  assert.deepEqual(rec.calls[1].partial, { isFist: true });
});

test('아주 작은 떨림은 반올림으로 무시', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push(hand(), head());
  b.push(hand({ pointer: { x: 0.5004, y: 0.4003 } }), head({ yaw: 0.001 }));
  assert.equal(rec.calls.length, 1);
});

test('손이 사라지면 손 값을 한 번만 중립으로', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push(hand({ isFist: true, palm: { x: 0.8, y: 0.55 } }), null);
  b.push({ detected: false }, null);
  b.push({ detected: false }, null);
  assert.equal(rec.calls.length, 2);
  assert.deepEqual(rec.calls[1].partial, { joystickX: 0, isFist: false, pointer: null });
});

test('recenter: 지금 손 위치가 조이스틱 가운데가 된다', () => {
  const b = new MotionBridge(recorder());
  b.recenter({ x: 0.3, y: 0.7 });
  const out = b.toInput(hand({ palm: { x: 0.3, y: 0.7 } }), null);
  assert.equal(out.joystickX, 0);
  assert.equal(out.joystickY, 0);
});

test('release: 모든 모션 값을 중립으로 되돌린다', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push(hand({ isPinching: true }), head({ yaw: 0.3, gazeTarget: 'chick' }));
  b.release();
  const last = rec.calls.at(-1).partial;
  assert.equal(last.isPinching, false);
  assert.equal(last.headYaw, 0);
  assert.equal(last.gazeTarget, null);
});

// ---------------- 실제 InputState와 함께 ----------------

test('손이 안 보이면 키보드 입력을 덮어쓰지 않는다', () => {
  const b = new MotionBridge(inputState);
  b.push({ detected: false }, null); // 처음 한 번 중립
  inputState.update({ joystickX: 1 }, 'keyboard');
  for (let i = 0; i < 30; i++) b.push({ detected: false }, null);
  assert.equal(inputState.get().joystickX, 1);
  assert.equal(inputState.get().source, 'keyboard');
});

test('전체 흐름: 웹캠 결과 → 트래커 → 브릿지 → InputState', () => {
  const handT = new HandTracker();
  const headT = new HeadTracker(['bear', 'bunny', 'chick']);
  const b = new MotionBridge(inputState);
  const changes = [];
  const off = inputState.subscribe((next, prev) => {
    if (next.isFist && !prev.isFist) changes.push('fist-down');
    if (next.gazeTarget !== prev.gazeTarget) changes.push(`gaze:${next.gazeTarget}`);
  });

  let t = 0;
  const step = (handFrame, yaw) => {
    t += 1 / 30;
    b.push(handT.update(handFrame, t), headT.update(makeFace(yaw, 0), t));
  };
  // 정면 보정 (편 손, 화면 오른쪽 → 원본 영상 왼쪽)
  for (let i = 0; i < 20; i++) step(makeHand(POSES.open, { x: 0.25, y: 0.6 }), 0);
  const s1 = inputState.get();
  assert.ok(s1.joystickX > 0.5, `손이 화면 오른쪽 → joystickX + (${s1.joystickX})`);
  assert.equal(s1.source, 'motion');

  for (let i = 0; i < 6; i++) step(makeHand(POSES.fist, { x: 0.25, y: 0.6 }), 0);
  assert.equal(inputState.get().isFist, true);

  for (let i = 0; i < 40; i++) step(makeHand(POSES.open), -0.3); // 고개를 왼쪽으로 1.3초
  assert.equal(inputState.get().gazeTarget, 'bear');
  assert.ok(inputState.get().headYaw < -0.2);

  for (let i = 0; i < 12; i++) step(NO_HAND, 0);
  assert.equal(inputState.get().pointer, null);
  off();
  assert.deepEqual(changes, ['fist-down', 'gaze:bear']);
});
