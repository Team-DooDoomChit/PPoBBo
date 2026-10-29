import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { applyDeadzone, tiltToJoystick, JOYSTICK_DEFAULTS } from '../../src/motion/joystickMapping.js';
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
const R = JOYSTICK_DEFAULTS.range;
const hand = (over = {}) => ({
  detected: true, isFist: false, isPointing: false, isPinching: false, isOk: false, isSlam: false,
  palm: { x: 0.3, y: 0.5 }, pointer: null, tilt: { x: 0, y: 0 }, ...over,
});
/** 기준 자세(기울기 0)를 이미 잡은 브릿지 */
const ready = (target = recorder()) => {
  const b = new MotionBridge(target);
  b.recenter({ x: 0, y: 0 });
  return b;
};
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

// ---------------- 왼손 기준 자세 ----------------

test('왼손이 처음 보이면 0.5초 동안의 자세를 기준으로 잡고, 그동안은 0', () => {
  const b = new MotionBridge(recorder());
  const tilted = hand({ tilt: { x: 0.3, y: -0.2 } }); // 원래 손이 조금 기울어진 사람
  for (let i = 0; i < JOYSTICK_DEFAULTS.calibrateFrames - 1; i++) {
    assert.deepEqual(pickStick(b.toInput({ left: tilted, right: NONE })), [0, 0]);
    assert.equal(b.calibrated, false);
  }
  assert.deepEqual(pickStick(b.toInput({ left: tilted, right: NONE })), [0, 0]);
  assert.equal(b.calibrated, true);
  // 기준에서 앞으로 숙이면 +
  assert.equal(b.toInput({ left: hand({ tilt: { x: 0.3, y: -0.2 + R } }), right: NONE }).joystickY, 1);
});
const pickStick = (o) => [o.joystickX, o.joystickY];

test('recenter(R 키): 지금 기울기가 조이스틱 가운데가 된다', () => {
  const b = ready();
  b.recenter({ x: 0.1, y: 0.3 });
  assert.deepEqual(pickStick(b.toInput({ left: hand({ tilt: { x: 0.1, y: 0.3 } }), right: NONE })), [0, 0]);
});

test('release 후 다시 켜면 기준 자세를 새로 잡는다', () => {
  const b = ready();
  b.release();
  assert.equal(b.calibrated, false);
});

// ---------------- 양손 역할 ----------------

test('왼손 기울기만 조이스틱이 된다 (오른손을 기울여도 그대로)', () => {
  const b = ready();
  const out = b.toInput({ left: hand({ tilt: { x: R, y: 0 } }), right: hand({ tilt: { x: -R, y: R } }) });
  assert.equal(out.joystickX, 1);
  assert.equal(out.joystickY, 0);
  const onlyRight = b.toInput({ left: NONE, right: hand({ tilt: { x: R, y: R } }) });
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
  const b = ready(rec);
  b.push({ left: hand({ tilt: { x: 0.3, y: 0 } }), right: NONE });
  b.push({ left: hand({ tilt: { x: 0.3003, y: 0 } }), right: NONE });
  assert.equal(rec.calls.length, 1);
});

test('왼손이 사라지면 조이스틱을 한 번만 중립으로', () => {
  const rec = recorder();
  const b = ready(rec);
  b.push({ left: hand({ tilt: { x: R, y: 0 } }), right: NONE });
  b.push({ left: NONE, right: NONE });
  b.push({ left: NONE, right: NONE });
  assert.equal(rec.calls.length, 2);
  assert.deepEqual(rec.calls[1].partial, { joystickX: 0 });
});

test('release: 모션 입력원의 값만 지우고 키보드 값은 남긴다', () => {
  const b = ready(inputState);
  inputState.update({ joystickY: 1 }, 'keyboard');
  b.push({ left: hand({ tilt: { x: R, y: 0 } }), right: hand({ isOk: true }) });
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

test('전체 흐름: 웹캠 두 손 → 역할 구분 → 트래커(기울기) → 브릿지 → InputState', () => {
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
    const a = makeHand(l.pose, l.at, 2, l.tilt);
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
  const L = (pose, tilt = {}) => ({ pose, at: { x: 0.75, y: 0.6 }, tilt }); // 화면 왼쪽
  const Rh = (pose, y = 0.5) => ({ pose, at: { x: 0.25, y } }); // 화면 오른쪽

  // 왼손 주먹을 세우고 기다리면 기준 자세를 잡는다 (그동안 조이스틱 0)
  for (let i = 0; i < 20; i++) step(both(L(POSES.fist), Rh(POSES.open)));
  assert.equal(b.calibrated, true);
  assert.equal(inputState.get().joystickY, 0);
  // 앞으로 숙이면 안쪽(+), 왼쪽으로 기울이면 왼쪽(-)
  for (let i = 0; i < 15; i++) step(both(L(POSES.fist, { forward: 0.5 }), Rh(POSES.open)));
  assert.ok(inputState.get().joystickY > 0.8, `앞으로 숙임 → joystickY + (${inputState.get().joystickY})`);
  for (let i = 0; i < 15; i++) step(both(L(POSES.fist, { forward: -0.5 }), Rh(POSES.open)));
  assert.ok(inputState.get().joystickY < -0.8, `뒤로 젖힘 → joystickY - (${inputState.get().joystickY})`);
  for (let i = 0; i < 15; i++) step(both(L(POSES.fist, { right: -0.5 }), Rh(POSES.open)));
  assert.ok(inputState.get().joystickX < -0.8, `왼쪽으로 기울임 → joystickX - (${inputState.get().joystickX})`);
  assert.equal(inputState.get().isFist, false, '왼손 주먹은 집게를 내리지 않음');

  // 오른손 OK 사인 0.3초 → 코인
  for (let i = 0; i < 10; i++) step(both(L(POSES.fist), Rh(POSES.ok)));
  assert.equal(inputState.get().isOk, true);
  for (let i = 0; i < 6; i++) step(both(L(POSES.fist), Rh(POSES.open)));

  // 오른손 내려치기 → 집게 내리기
  for (const y of [0.3, 0.38, 0.46, 0.54, 0.6]) step(both(L(POSES.fist), Rh(POSES.open, y)));
  assert.ok(changes.includes('drop'));

  for (let i = 0; i < 12; i++) step(NO_HAND);
  assert.equal(inputState.get().joystickX, 0);
  off();
  assert.deepEqual(changes, ['coin', 'drop']);
});
