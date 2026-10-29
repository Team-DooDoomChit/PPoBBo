import { tiltToJoystick, JOYSTICK_DEFAULTS } from './joystickMapping.js';

/**
 * 손/머리 트래커 상태 → InputState. (#10, #34)
 *
 * 양손 역할 (#34)
 *   왼손  : 주먹을 쥐고(조이스틱 잡기) 기울이기 → joystickX / joystickY
 *           (앞으로 숙이면 안쪽, 뒤로 젖히면 플레이어 쪽, 좌우로 기울이면 좌우)
 *           쥐는 순간의 자세가 가운데가 되고, 손을 펴면 조이스틱을 놓은 것처럼 바로 0 (집게 멈춤).
 *           다시 쥐면 그때 자세를 새 가운데로 잡으므로 손이 조금씩 틀어져도 쌓이지 않는다.
 *   오른손: 주먹 쥐기 또는 아래로 내려치기 → isFist (집게 내리기)
 *   양손  : OK 사인 → isOk (코인 투입), 가리키기 → isPointing
 *   왼손 주먹은 집게를 내리지 않는다 (조이스틱을 잡다가 주먹이 쥐어져도 오작동하지 않게).
 *
 * - 값이 바뀐 필드만 inputState.update(partial, 'motion')로 보낸다.
 *   InputState가 입력원별로 값을 따로 두고 합치므로 키보드 입력과 섞이지는 않지만,
 *   매 프레임 같은 값을 보내면 구독자(MotionBinding)가 불필요하게 호출되므로 줄인다.
 * - 손이 사라지면 그 손의 값은 중립으로 돌아가고, 바뀐 순간 한 번만 보낸다.
 * - 작은 떨림으로 매 프레임 값이 바뀌지 않도록 소수점을 반올림한다.
 */
const round = (v, step) => Math.round(v / step) * step;
const seen = (hand) => Boolean(hand?.detected);

const ZERO = Object.freeze({ joystickX: 0, joystickY: 0 });

export class MotionBridge {
  #sent = {};
  #base = null; // 왼손 기준 기울기 { x, y } (null이면 아직 쥐지 않음)

  /** @param {{ update(partial, source): void, reset(source): void }} inputState */
  constructor(inputState, { joystick = JOYSTICK_DEFAULTS } = {}) {
    this.inputState = inputState;
    this.joystick = { ...JOYSTICK_DEFAULTS, ...joystick };
  }

  /** 왼손으로 조이스틱을 쥐고 있는지 (카메라 창 안내용) */
  get gripping() {
    return this.#base !== null;
  }

  /** 지금 왼손 기울기를 조이스틱 가운데로 삼는다 (R 키, 쥐고 있을 때만 의미 있음) */
  recenter(tilt) {
    if (tilt && this.#base) this.#base = { ...tilt };
  }

  /** 왼손 → 조이스틱. 쥐고 있을 때만 움직이고, 펴면 0 */
  #stick(left) {
    const grip = seen(left) && left.isFist && left.tilt;
    if (!grip) {
      this.#base = null; // 놓음: 다음에 쥘 때 그 자세를 새 가운데로
      return ZERO;
    }
    this.#base ??= { ...left.tilt }; // 쥐는 순간의 자세가 가운데
    return tiltToJoystick(left.tilt, this.#base, this.joystick);
  }

  /**
   * 트래커 상태 → InputState에 넣을 값 (테스트용으로 분리). 왼손을 쥐고 펴는 상태도 여기서 따라간다.
   * @param {{ left?: object, right?: object } | null} hands 손별 HandTracker 상태
   * @param {object | null} head HeadTracker 상태 (없으면 머리 값은 보내지 않음)
   */
  toInput(hands, head) {
    const out = {};
    if (hands) {
      const { left, right } = hands;
      const stick = this.#stick(left);
      Object.assign(out, {
        joystickX: round(stick.joystickX, 0.02),
        joystickY: round(stick.joystickY, 0.02),
        // 내려친 직후 손이 화면 밖으로 나가도 isSlam은 잠깐 유지되므로 detected와 따로 본다
        isFist: (seen(right) && right.isFist) || Boolean(right?.isSlam),
        isPointing: [left, right].some((h) => seen(h) && h.isPointing),
        isOk: [left, right].some((h) => seen(h) && h.isOk),
      });
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
  push(hands, head = null) {
    const next = this.toInput(hands, head);
    const changed = {};
    for (const [key, value] of Object.entries(next)) {
      if (!(key in this.#sent) || this.#sent[key] !== value) changed[key] = value;
    }
    if (Object.keys(changed).length === 0) return null;
    Object.assign(this.#sent, changed);
    this.inputState.update(changed, 'motion');
    return changed;
  }

  /** 모션 입력을 끌 때: 모든 모션 값을 중립으로 */
  release() {
    this.inputState.reset('motion'); // 모션 입력원의 값만 지운다 (키보드는 그대로)
    this.#sent = {};
    this.#base = null;
  }
}
