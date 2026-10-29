/**
 * 손 위치(화면 정규화, 좌우 반전) → 조이스틱 값(-1 ~ 1). (#10)
 *
 * 화면 가운데(center)에 손을 두면 0, range만큼 움직이면 끝까지 기운다.
 * 가운데 근처(deadzone)는 0으로 두어 손을 가만히 둬도 집게가 흘러가지 않게 한다.
 *
 *   joystickX: 손을 오른쪽으로 → +
 *   joystickY: 손을 위로 → + (기계 안쪽, docs/INTEGRATION.md)
 */
export const JOYSTICK_DEFAULTS = Object.freeze({
  center: Object.freeze({ x: 0.5, y: 0.55 }),
  range: 0.18, // 화면 폭/높이 대비, 이만큼 움직이면 ±1
  deadzone: 0.15, // ±1 기준, 이 안은 0
});

const clamp = (v) => Math.max(-1, Math.min(1, v));

/** 데드존을 빼고 나머지 구간을 다시 0~1로 늘린다 (데드존 경계에서 값이 튀지 않게) */
export function applyDeadzone(v, deadzone) {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  return Math.sign(v) * Math.min(1, (a - deadzone) / (1 - deadzone));
}

/**
 * @param {{ x: number, y: number }} palm 손바닥 중심
 * @param {object} [config] JOYSTICK_DEFAULTS 형식
 * @returns {{ joystickX: number, joystickY: number }}
 */
export function palmToJoystick(palm, config = JOYSTICK_DEFAULTS) {
  const { center, range, deadzone } = { ...JOYSTICK_DEFAULTS, ...config };
  return {
    joystickX: applyDeadzone(clamp((palm.x - center.x) / range), deadzone),
    joystickY: applyDeadzone(clamp((center.y - palm.y) / range), deadzone),
  };
}
