import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { applyDeadzone, tiltToJoystick, JOYSTICK_DEFAULTS } from '../../src/motion/joystickMapping.js';
import { MotionBridge } from '../../src/motion/MotionBridge.js';
import { HandTracker } from '../../src/motion/HandTracker.js';
import { HandRoleAssigner, chooseControlRole } from '../../src/motion/handRoles.js';
import { inputState } from '../../src/core/InputState.js';
import { makeHand, POSES, NO_HAND } from './handFixtures.js';

/** update 호출을 기록하는 가짜 InputState */
const recorder = () => {
  const calls = [];
  return { calls, update: (partial, source) => calls.push({ partial, source }), reset: (source) => calls.push({ reset: source }) };
};
const R = JOYSTICK_DEFAULTS.range;
const hand = (over = {}) => ({
  detected: true, isFist: false, isPointing: false, isPinching: false, isOk: false, isPush: false,
  palm: { x: 0.3, y: 0.5 }, pointer: null, tilt: { x: 0, y: 0 }, ...over,
});
/** 조이스틱을 쥔 손 */
const grip = (over = {}) => hand({ isFist: true, ...over });
const NONE = { detected: false };
/** 오른손을 조작 손으로 */
const right = (h) => ({ hand: h, role: 'right' });
const nobody = { hand: NONE, role: null };
/** 기울기 0에서 오른손으로 쥔 브릿지 (기준 자세 = 0) */
const ready = (target = recorder()) => {
  const b = new MotionBridge(target);
  b.toInput(right(grip()));
  return b;
};
const head = (over = {}) => ({ detected: true, calibrated: true, yaw: 0, pitch: 0, gazeTarget: null, ...over });
const pickStick = (o) => [o.joystickX, o.joystickY];

beforeEach(() => {
  inputState.reset('motion');
  inputState.reset('keyboard');
});

// ---------------- 조이스틱 매핑 ----------------

test('데드존: 안쪽은 0, 바깥은 0~1로 다시 늘림', () => {
  assert.equal(applyDeadzone(0.1, 0.15), 0);
  assert.equal(applyDeadzone(1, 0.15), 1);
  assert.ok(Math.abs(applyDeadzone(-0.575, 0.15) + 0.5) < 1e-9);
});

test('기울기 → 조이스틱: 기준 자세면 0, 오른쪽/앞으로 끝까지 기울이면 +1', () => {
  assert.deepEqual(tiltToJoystick({ x: 0, y: 0 }), { joystickX: 0, joystickY: 0 });
  assert.deepEqual(tiltToJoystick({ x: R, y: R }), { joystickX: 1, joystickY: 1 });
  assert.deepEqual(tiltToJoystick({ x: -R, y: -R }), { joystickX: -1, joystickY: -1 });
});

test('기울기 → 조이스틱: 기준 자세에서 얼마나 기울었는지로 계산', () => {
  assert.deepEqual(tiltToJoystick({ x: 0.2, y: -0.1 }, { x: 0.2, y: -0.1 }), { joystickX: 0, joystickY: 0 });
  assert.equal(tiltToJoystick({ x: 0.2 + R, y: 0 }, { x: 0.2, y: 0 }).joystickX, 1);
});

test('범위를 넘게 기울여도 ±1', () => {
  assert.deepEqual(tiltToJoystick({ x: 2, y: -2 }), { joystickX: 1, joystickY: -1 });
});

test('살짝 기울어진 떨림은 0 (집게가 흘러가지 않음)', () => {
  assert.deepEqual(tiltToJoystick({ x: 0.05, y: -0.05 }), { joystickX: 0, joystickY: 0 });
});

// ---------------- 조이스틱 잡기 ----------------

test('손을 펴고 있으면 기울여도 0 (집게 멈춤)', () => {
  const b = new MotionBridge(recorder());
  assert.deepEqual(pickStick(b.toInput(right(hand({ tilt: { x: R, y: R } })))), [0, 0]);
  assert.equal(b.gripping, false);
});

test('쥐는 순간의 자세가 가운데: 쥔 채로 기울인 만큼만 움직인다', () => {
  const b = new MotionBridge(recorder());
  assert.deepEqual(pickStick(b.toInput(right(grip({ tilt: { x: 0.3, y: -0.2 } })))), [0, 0]);
  assert.equal(b.gripping, true);
  assert.equal(b.toInput(right(grip({ tilt: { x: 0.3, y: -0.2 + R } }))).joystickY, 1, '앞으로 숙이면 +');
  assert.equal(b.toInput(right(grip({ tilt: { x: 0.3 - R, y: -0.2 } }))).joystickX, -1, '왼쪽으로 기울이면 -');
});

test('움직이다 손을 펴면 바로 0, 다시 쥐면 그때 자세가 새 가운데', () => {
  const b = ready();
  assert.equal(b.toInput(right(grip({ tilt: { x: R, y: 0 } }))).joystickX, 1);
  assert.deepEqual(pickStick(b.toInput(right(hand({ tilt: { x: R, y: 0 } })))), [0, 0], '펴면 멈춤');
  assert.deepEqual(pickStick(b.toInput(right(grip({ tilt: { x: R, y: 0 } })))), [0, 0], '기울어진 채 다시 쥐어도 튀지 않음');
});

test('조작 손이 바뀌면 기준을 새로 잡는다 (쥔 채로 바뀌어도 튀지 않음)', () => {
  const b = ready();
  assert.equal(b.toInput(right(grip({ tilt: { x: R, y: 0 } }))).joystickX, 1);
  // 왼손이 쥔 채 기울어진 상태로 조작 손이 됨 → 그 자세가 새 가운데
  assert.deepEqual(pickStick(b.toInput({ hand: grip({ tilt: { x: -0.4, y: 0.2 } }), role: 'left' })), [0, 0]);
  assert.equal(b.toInput({ hand: grip({ tilt: { x: -0.4 + R, y: 0.2 } }), role: 'left' }).joystickX, 1);
});

test('손이 안 보이면 놓은 것으로 본다', () => {
  const b = ready();
  b.toInput(nobody);
  assert.equal(b.gripping, false);
});

test('recenter(R 키): 쥐고 있을 때 지금 기울기가 가운데가 된다', () => {
  const b = ready();
  b.recenter({ x: 0.1, y: 0.3 });
  assert.deepEqual(pickStick(b.toInput(right(grip({ tilt: { x: 0.1, y: 0.3 } })))), [0, 0]);
});

// ---------------- 동작 ----------------

test('손바닥 누르기 → 집게 내리기 (손이 화면 밖으로 나가도 인식 결과는 유지)', () => {
  const b = new MotionBridge(recorder());
  assert.equal(b.toInput(right(hand({ isPush: true }))).isFist, true);
  assert.equal(b.toInput(right({ detected: false, isPush: true })).isFist, true);
});

test('주먹은 집게를 내리지 않는다 (조이스틱 잡기)', () => {
  const b = new MotionBridge(recorder());
  assert.equal(b.toInput(right(grip())).isFist, false);
});

test('OK 사인 → 코인, 가리키기 → 확인', () => {
  const b = new MotionBridge(recorder());
  assert.equal(b.toInput(right(hand({ isOk: true }))).isOk, true);
  assert.equal(b.toInput(right(hand({ isPointing: true }))).isPointing, true);
  assert.equal(b.toInput(nobody).isOk, false);
});

// ---------------- 보내는 값 ----------------

test('처음엔 손 값을 모두 보내고, source는 motion. 머리가 없으면 머리 값은 보내지 않음', () => {
  const rec = recorder();
  new MotionBridge(rec).push(right(hand()));
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].source, 'motion');
  assert.deepEqual(Object.keys(rec.calls[0].partial).sort(), ['isFist', 'isOk', 'isPointing', 'joystickX', 'joystickY']);
});

test('머리 상태를 넘기면 머리 값도 보낸다', () => {
  const rec = recorder();
  new MotionBridge(rec).push(nobody, head({ yaw: 0.2, gazeTarget: 'bear' }));
  assert.equal(rec.calls[0].partial.gazeTarget, 'bear');
  assert.equal(rec.calls[0].partial.headYaw, 0.2);
});

test('값이 그대로면 보내지 않고, 바뀐 필드만 보낸다', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push(right(hand()));
  assert.equal(b.push(right(hand())), null);
  b.push(right(hand({ isOk: true })));
  assert.deepEqual(rec.calls[1].partial, { isOk: true });
});

test('아주 작은 떨림은 반올림으로 무시', () => {
  const rec = recorder();
  const b = ready(rec);
  b.push(right(grip({ tilt: { x: 0.3, y: 0 } })));
  b.push(right(grip({ tilt: { x: 0.3003, y: 0 } })));
  assert.equal(rec.calls.length, 1);
});

test('손이 사라지면 조이스틱을 한 번만 중립으로', () => {
  const rec = recorder();
  const b = ready(rec);
  b.push(right(grip({ tilt: { x: R, y: 0 } })));
  b.push(nobody);
  b.push(nobody);
  assert.equal(rec.calls.length, 2);
  assert.deepEqual(rec.calls[1].partial, { joystickX: 0 });
});

test('release: 모션 입력원의 값만 지우고 키보드 값은 남긴다', () => {
  const b = ready(inputState);
  inputState.update({ joystickY: 1 }, 'keyboard');
  b.push(right(grip({ tilt: { x: R, y: 0 }, isOk: true })));
  assert.equal(inputState.get().isOk, true);

  b.release();
  const s = inputState.get();
  assert.equal(s.isOk, false);
  assert.equal(s.joystickX, 0);
  assert.equal(s.joystickY, 1, '키보드 값 유지');
  assert.equal(b.gripping, false);
});

test('release 후 다시 켜면 모든 값을 처음부터 다시 보낸다', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push(right(hand()));
  b.release();
  assert.deepEqual(rec.calls.at(-1), { reset: 'motion' });
  b.push(right(hand()));
  assert.equal(Object.keys(rec.calls.at(-1).partial).length, 5);
});

// ---------------- 실제 InputState와 함께 ----------------

test('손이 안 보이면 키보드 입력을 덮어쓰지 않는다', () => {
  const b = new MotionBridge(inputState);
  b.push(nobody); // 처음 한 번 중립
  inputState.update({ joystickX: 1 }, 'keyboard');
  for (let i = 0; i < 30; i++) b.push(nobody);
  assert.equal(inputState.get().joystickX, 1);
  assert.equal(inputState.get().source, 'keyboard');
});

test('전체 흐름: 웹캠 한 손 → 조작 손 → 트래커(기울기·누르기) → 브릿지 → InputState', () => {
  const roles = new HandRoleAssigner();
  const trackers = { left: new HandTracker(), right: new HandTracker() };
  const b = new MotionBridge(inputState);
  let role = null;
  const changes = [];
  const off = inputState.subscribe((next, prev) => {
    if (next.isFist && !prev.isFist) changes.push('drop');
    if (next.isOk && !prev.isOk) changes.push('coin');
  });

  let t = 0;
  const step = (frame) => {
    t += 1 / 30;
    const r = roles.assign(frame, t);
    const states = { left: trackers.left.update(r.left, t), right: trackers.right.update(r.right, t) };
    role = chooseControlRole(r.index, role);
    b.push({ hand: role ? states[role] : NONE, role });
  };
  // 한 손 (카메라 원본 왼쪽 = 화면 오른쪽)
  const H = (pose, tilt = {}, y = 0.5) => makeHand(pose, { x: 0.3, y }, 2, tilt);
  const FLAT = { forward: Math.PI / 2 }; // 손바닥을 아래로 향해 수평으로 편 손

  // OK 사인 0.3초 → 코인
  for (let i = 0; i < 10; i++) step(H(POSES.ok));
  assert.equal(inputState.get().isOk, true);
  // 편 손을 기울여도 움직이지 않음
  for (let i = 0; i < 10; i++) step(H(POSES.open, { forward: 0.5 }));
  assert.equal(inputState.get().joystickY, 0);
  // 쥐면 그 자세가 가운데, 앞으로 숙이면 안쪽(+), 왼쪽으로 기울이면 왼쪽(-)
  for (let i = 0; i < 10; i++) step(H(POSES.fist));
  assert.equal(b.gripping, true);
  for (let i = 0; i < 15; i++) step(H(POSES.fist, { forward: 0.5 }));
  assert.ok(inputState.get().joystickY > 0.8, `앞으로 숙임 → joystickY + (${inputState.get().joystickY})`);
  for (let i = 0; i < 15; i++) step(H(POSES.fist, { right: -0.5 }));
  assert.ok(inputState.get().joystickX < -0.8, `왼쪽으로 기울임 → joystickX - (${inputState.get().joystickX})`);
  assert.equal(inputState.get().isFist, false, '주먹으로는 집게가 내려가지 않음');
  // 손을 펴면 멈춤
  for (let i = 0; i < 10; i++) step(H(POSES.open));
  assert.equal(inputState.get().joystickX, 0, '펴면 멈춤');
  // 손바닥을 아래로 향해 수평으로 펴고 누르기 → 집게 내리기
  for (let i = 0; i < 5; i++) step(H(POSES.open, FLAT, 0.3));
  for (const y of [0.3, 0.38, 0.46, 0.54, 0.6]) step(H(POSES.open, FLAT, y));
  assert.ok(changes.includes('drop'));

  for (let i = 0; i < 12; i++) step(NO_HAND);
  assert.equal(inputState.get().joystickX, 0);
  off();
  assert.deepEqual(changes, ['coin', 'drop']);
});
