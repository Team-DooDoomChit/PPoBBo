/**
 * 왼손 기울기 → 조이스틱 값(-1 ~ 1). (#10, #34)
 *
 * 실제 조이스틱을 쥐듯 주먹을 쥐고, 쥔 순간의 자세(기준)에서 기울인 만큼 조이스틱이 기운다.
 * range(라디안)만큼 기울이면 끝까지, 기준 근처(deadzone)는 0으로 두어 손을 가만히 둬도 집게가 흘러가지 않게 한다.
 *
 *   joystickX: 손을 오른쪽으로 기울이면 +
 *   joystickY: 손끝을 앞(화면 쪽)으로 숙이면 + (기계 안쪽), 뒤로 젖히면 - (플레이어 쪽). docs/INTEGRATION.md
 *
 * 기준 자세는 MotionBridge가 왼손을 쥐는 순간 잡고, 손을 펴면 놓는다.
 */
export const JOYSTICK_DEFAULTS = Object.freeze({
  range: 0.45, // 약 26도 기울이면 ±1
  deadzone: 0.2, // ±1 기준, 이 안은 0 (약 5도)
});

const clamp = (v) => Math.max(-1, Math.min(1, v));

/** 데드존을 빼고 나머지 구간을 다시 0~1로 늘린다 (데드존 경계에서 값이 튀지 않게) */
export function applyDeadzone(v, deadzone) {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  return Math.sign(v) * Math.min(1, (a - deadzone) / (1 - deadzone));
}

/**
 * @param {{ x: number, y: number }} tilt 손 기울기 (handTilt, 라디안)
 * @param {{ x: number, y: number }} [base] 기준 자세의 기울기
 * @param {object} [config] JOYSTICK_DEFAULTS 형식
 * @returns {{ joystickX: number, joystickY: number }}
 */
export function tiltToJoystick(tilt, base = { x: 0, y: 0 }, config = JOYSTICK_DEFAULTS) {
  const { range, deadzone } = { ...JOYSTICK_DEFAULTS, ...config };
  return {
    joystickX: applyDeadzone(clamp((tilt.x - base.x) / range), deadzone),
    joystickY: applyDeadzone(clamp((tilt.y - base.y) / range), deadzone),
  };
}
