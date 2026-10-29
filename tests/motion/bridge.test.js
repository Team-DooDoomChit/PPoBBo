import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { applyDeadzone, palmToJoystick, JOYSTICK_DEFAULTS } from '../../src/motion/joystickMapping.js';
import { MotionBridge } from '../../src/motion/MotionBridge.js';
import { HandTracker } from '../../src/motion/HandTracker.js';
import { HandRoleAssigner } from '../../src/motion/handRoles.js';
import { inputState } from '../../src/core/InputState.js';
import { makeHand, POSES, NO_HAND } from './handFixtures.js';

/** update 호출을 기록하는 가짜 InputState */
const recorder = () => {
  const calls = [];
  return { calls, update: (partial, source) => calls.push({ partial, source }), reset: (source) => calls.push({ reset: source }) };
};
const C = JOYSTICK_DEFAULTS.center;
const hand = (over = {}) => ({
  detected: true, isFist: false, isPointing: false, isPinching: false, isOk: false, isSlam: false,
  palm: { ...C }, pointer: null, ...over,
});
const NONE = { detected: false };
const head = (over = {}) => ({ detected: true, calibrated: true, yaw: 0, pitch: 0, gazeTarget: null, ...over });

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

test('조이스틱 가운데는 왼손이 놓이는 화면 왼쪽', () => {
  assert.ok(C.x < 0.5);
  assert.deepEqual(palmToJoystick({ ...C }), { joystickX: 0, joystickY: 0 });
});

test('손이 가운데에서 오른쪽/위로 가면 +', () => {
  const r = palmToJoystick({ x: C.x + 0.18, y: C.y - 0.18 });
  assert.equal(r.joystickX, 1);
  assert.equal(r.joystickY, 1);
});

test('범위를 넘어가도 ±1', () => {
  assert.deepEqual(palmToJoystick({ x: 0, y: 1 }), { joystickX: -1, joystickY: -1 });
});

test('가운데 근처 떨림은 0 (집게가 흘러가지 않음)', () => {
  assert.deepEqual(palmToJoystick({ x: C.x + 0.02, y: C.y - 0.02 }), { joystickX: 0, joystickY: 0 });
});

// ---------------- 양손 역할 ----------------

test('왼손 위치만 조이스틱이 된다 (오른손을 움직여도 그대로)', () => {
  const b = new MotionBridge(recorder());
  const out = b.toInput({ left: hand({ palm: { x: C.x + 0.18, y: C.y } }), right: hand({ palm: { x: 0.9, y: 0.1 } }) });
  assert.equal(out.joystickX, 1);
  assert.equal(out.joystickY, 0);
  const onlyRight = b.toInput({ left: NONE, right: hand({ palm: { x: 0.9, y: 0.1 } }) });
  assert.equal(onlyRight.joystickX, 0);
  assert.equal(onlyRight.joystickY, 0);
});

test('오른손 주먹 → 집게 내리기, 왼손 주먹은 무시', () => {
  const b = new MotionBridge(recorder());
  assert.equal(b.toInput({ left: NONE, right: hand({ isFist: true }) }).isFist, true);
  assert.equal(b.toInput({ left: hand({ isFist: true }), right: hand() }).isFist, false);
});

test('오른손 내려치기 → 집게 내리기 (손이 화면 밖으로 나가도 인식 결과는 유지)', () => {
  const b = new MotionBridge(recorder());
  assert.equal(b.toInput({ left: NONE, right: hand({ isSlam: true }) }).isFist, true);
  assert.equal(b.toInput({ left: NONE, right: { detected: false, isSlam: true } }).isFist, true);
});

test('OK 사인과 가리키기는 어느 손이든 인정', () => {
  const b = new MotionBridge(recorder());
  assert.equal(b.toInput({ left: hand({ isOk: true }), right: NONE }).isOk, true);
  assert.equal(b.toInput({ left: NONE, right: hand({ isOk: true }) }).isOk, true);
  assert.equal(b.toInput({ left: hand({ isPointing: true }), right: NONE }).isPointing, true);
  assert.equal(b.toInput({ left: NONE, right: NONE }).isOk, false);
});

// ---------------- 보내는 값 ----------------

test('처음엔 손 값을 모두 보내고, source는 motion. 머리가 없으면 머리 값은 보내지 않음', () => {
  const rec = recorder();
  new MotionBridge(rec).push({ left: hand(), right: hand() });
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].source, 'motion');
  assert.deepEqual(Object.keys(rec.calls[0].partial).sort(), ['isFist', 'isOk', 'isPointing', 'joystickX', 'joystickY']);
});

test('머리 상태를 넘기면 머리 값도 보낸다', () => {
  const rec = recorder();
  new MotionBridge(rec).push({ left: NONE, right: NONE }, head({ yaw: 0.2, gazeTarget: 'bear' }));
  assert.equal(rec.calls[0].partial.gazeTarget, 'bear');
  assert.equal(rec.calls[0].partial.headYaw, 0.2);
});

test('값이 그대로면 보내지 않고, 바뀐 필드만 보낸다', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push({ left: hand(), right: hand() });
  assert.equal(b.push({ left: hand(), right: hand() }), null);
  b.push({ left: hand(), right: hand({ isFist: true }) });
  assert.deepEqual(rec.calls[1].partial, { isFist: true });
});

test('아주 작은 떨림은 반올림으로 무시', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push({ left: hand({ palm: { x: C.x + 0.1, y: C.y } }), right: NONE });
  b.push({ left: hand({ palm: { x: C.x + 0.1003, y: C.y } }), right: NONE });
  assert.equal(rec.calls.length, 1);
});

test('왼손이 사라지면 조이스틱을 한 번만 중립으로', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push({ left: hand({ palm: { x: C.x + 0.18, y: C.y } }), right: NONE });
  b.push({ left: NONE, right: NONE });
  b.push({ left: NONE, right: NONE });
  assert.equal(rec.calls.length, 2);
  assert.deepEqual(rec.calls[1].partial, { joystickX: 0 });
});

test('recenter: 지금 손 위치가 조이스틱 가운데가 된다', () => {
  const b = new MotionBridge(recorder());
  b.recenter({ x: 0.6, y: 0.7 });
  const out = b.toInput({ left: hand({ palm: { x: 0.6, y: 0.7 } }), right: NONE });
  assert.equal(out.joystickX, 0);
  assert.equal(out.joystickY, 0);
});

test('release: 모션 입력원의 값만 지우고 키보드 값은 남긴다', () => {
  const b = new MotionBridge(inputState);
  inputState.update({ joystickY: 1 }, 'keyboard');
  b.push({ left: hand({ palm: { x: C.x + 0.18, y: C.y } }), right: hand({ isOk: true }) });
  assert.equal(inputState.get().isOk, true);

  b.release();
  const s = inputState.get();
  assert.equal(s.isOk, false);
  assert.equal(s.joystickX, 0);
  assert.equal(s.joystickY, 1, '키보드 값 유지');
});

test('release 후 다시 켜면 모든 값을 처음부터 다시 보낸다', () => {
  const rec = recorder();
  const b = new MotionBridge(rec);
  b.push({ left: hand(), right: hand() });
  b.release();
  assert.deepEqual(rec.calls.at(-1), { reset: 'motion' });
  b.push({ left: hand(), right: hand() });
  assert.equal(Object.keys(rec.calls.at(-1).partial).length, 5);
});

// ---------------- 실제 InputState와 함께 ----------------

test('손이 안 보이면 키보드 입력을 덮어쓰지 않는다', () => {
  const b = new MotionBridge(inputState);
  b.push({ left: NONE, right: NONE }); // 처음 한 번 중립
  inputState.update({ joystickX: 1 }, 'keyboard');
  for (let i = 0; i < 30; i++) b.push({ left: NONE, right: NONE });
  assert.equal(inputState.get().joystickX, 1);
  assert.equal(inputState.get().source, 'keyboard');
});

test('전체 흐름: 웹캠 두 손 → 역할 구분 → 트래커 → 브릿지 → InputState', () => {
  const roles = new HandRoleAssigner();
  const left = new HandTracker();
  const right = new HandTracker({ slam: true });
  const b = new MotionBridge(inputState);
  const changes = [];
  const off = inputState.subscribe((next, prev) => {
    if (next.isFist && !prev.isFist) changes.push('drop');
    if (next.isOk && !prev.isOk) changes.push('coin');
  });

  // 두 손을 한 결과로 합친다 (카메라 원본 좌표: x가 클수록 화면 왼쪽)
  const both = (l, r) => {
    const a = makeHand(l.pose, l.at);
    const c = makeHand(r.pose, r.at);
    return {
      landmarks: [...c.landmarks, ...a.landmarks],
      worldLandmarks: [...c.worldLandmarks, ...a.worldLandmarks],
      handedness: [...c.handedness, ...a.handedness],
    };
  };
  let t = 0;
  const step = (frame) => {
    t += 1 / 30;
    const r = roles.assign(frame, t);
    b.push({ left: left.update(r.left, t), right: right.update(r.right, t) });
  };
  const L = (pose, y = 0.6) => ({ pose, at: { x: 0.85, y } }); // 화면 왼쪽 (반전 후 x≈0.15)
  const R = (pose, y = 0.5) => ({ pose, at: { x: 0.25, y } }); // 화면 오른쪽

  // 왼손을 화면 왼쪽 끝에 → 조이스틱 왼쪽
  for (let i = 0; i < 10; i++) step(both(L(POSES.open), R(POSES.open)));
  assert.ok(inputState.get().joystickX < -0.5, `왼손이 가운데보다 왼쪽 → joystickX - (${inputState.get().joystickX})`);
  assert.equal(inputState.get().isFist, false);

  // 왼손 주먹은 무시
  for (let i = 0; i < 6; i++) step(both(L(POSES.fist), R(POSES.open)));
  assert.equal(inputState.get().isFist, false);

  // 오른손 OK 사인 0.3초 → 코인
  for (let i = 0; i < 10; i++) step(both(L(POSES.open), R(POSES.ok)));
  assert.equal(inputState.get().isOk, true);
  for (let i = 0; i < 6; i++) step(both(L(POSES.open), R(POSES.open)));

  // 오른손 내려치기 → 집게 내리기
  for (const y of [0.3, 0.38, 0.46, 0.54, 0.6]) step(both(L(POSES.open), R(POSES.open, y)));
  assert.ok(changes.includes('drop'));

  for (let i = 0; i < 12; i++) step(NO_HAND);
  assert.equal(inputState.get().joystickX, 0);
  off();
  assert.deepEqual(changes, ['coin', 'drop']);
});
