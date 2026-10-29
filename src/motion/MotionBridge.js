import { palmToJoystick, JOYSTICK_DEFAULTS } from './joystickMapping.js';

/**
 * 손/머리 트래커 상태 → InputState. (#10)
 *
 * - 값이 바뀐 필드만 inputState.update(partial, 'motion')로 보낸다.
 *   (손이 안 보일 때 매 프레임 0을 넣으면 키보드 입력을 덮어쓰기 때문)
 * - 손이 사라지면 손 관련 필드를 한 번만 중립으로 되돌린다.
 * - 작은 떨림으로 매 프레임 값이 바뀌지 않도록 소수점을 반올림한다.
 */
const HAND_NEUTRAL = Object.freeze({
  joystickX: 0,
  joystickY: 0,
  isFist: false,
  isPointing: false,
  isPinching: false,
  pointer: null,
});

const round = (v, step) => Math.round(v / step) * step;
const roundPoint = (p) => (p ? { x: round(p.x, 0.002), y: round(p.y, 0.002) } : null);
const same = (a, b) => (a && typeof a === 'object' && b && typeof b === 'object' ? a.x === b.x && a.y === b.y : a === b);

export class MotionBridge {
  #sent = {};

  /** @param {{ update(partial, source): void }} inputState */
  constructor(inputState, { joystick = JOYSTICK_DEFAULTS } = {}) {
    this.inputState = inputState;
    this.joystick = { ...JOYSTICK_DEFAULTS, ...joystick };
  }

  /** 지금 손 위치를 조이스틱 가운데로 삼는다 */
  recenter(palm) {
    if (palm) this.joystick = { ...this.joystick, center: { ...palm } };
  }

  /** 트래커 상태 → InputState에 넣을 값 (테스트용으로 분리) */
  toInput(hand, head) {
    const out = {};
    if (hand) {
      if (hand.detected && hand.palm) {
        const { joystickX, joystickY } = palmToJoystick(hand.palm, this.joystick);
        Object.assign(out, {
          joystickX: round(joystickX, 0.02),
          joystickY: round(joystickY, 0.02),
          isFist: hand.isFist,
          isPointing: hand.isPointing,
          isPinching: hand.isPinching,
          pointer: roundPoint(hand.pointer),
        });
      } else {
        Object.assign(out, HAND_NEUTRAL);
      }
    }
    if (head) {
      Object.assign(out, {
        headYaw: round(head.yaw, 0.005),
        headPitch: round(head.pitch, 0.005),
        gazeTarget: head.gazeTarget,
      });
    }
    return out;
  }

  /**
   * 한 프레임 처리. 바뀐 값만 보낸다.
   * @returns {object | null} 보낸 값 (없으면 null)
   */
  push(hand, head) {
    const next = this.toInput(hand, head);
    const changed = {};
    for (const [key, value] of Object.entries(next)) {
      if (!(key in this.#sent) || !same(this.#sent[key], value)) changed[key] = value;
    }
    if (Object.keys(changed).length === 0) return null;
    Object.assign(this.#sent, changed);
    this.inputState.update(changed, 'motion');
    return changed;
  }

  /** 모션 입력을 끌 때: 모든 모션 값을 중립으로 */
  release() {
    this.push({ detected: false }, { yaw: 0, pitch: 0, gazeTarget: null });
    this.#sent = {};
  }
}
