import { tiltToJoystick, JOYSTICK_DEFAULTS } from './joystickMapping.js';

/**
 * 손/머리 트래커 상태 → InputState. (#10, #34, #47)
 *
 * 한 손 조작 (#47). 조작하는 손 하나로 모든 동작을 한다 (어느 손인지는 setupMotion이 고른다).
 *   주먹을 쥐고(조이스틱 잡기) 기울이기 → joystickX / joystickY
 *     (앞으로 숙이면 안쪽, 뒤로 젖히면 플레이어 쪽, 좌우로 기울이면 좌우)
 *     쥐는 순간의 자세가 가운데가 되고, 손을 펴면 조이스틱을 놓은 것처럼 바로 0 (집게 멈춤).
 *     다시 쥐면 그때 자세를 새 가운데로 잡으므로 손이 조금씩 틀어져도 쌓이지 않는다.
 *   손바닥을 아래로 향해 누르기 → isFist (집게 내리기. 필드 이름은 키보드 Space와 같이 쓰려고 그대로 둔다)
 *   OK 사인 → isOk (코인 투입), 가리키기 → isPointing
 *
 * - 값이 바뀐 필드만 inputState.update(partial, 'motion')로 보낸다.
 *   InputState가 입력원별로 값을 따로 두고 합치므로 키보드 입력과 섞이지는 않지만,
 *   매 프레임 같은 값을 보내면 구독자(MotionBinding)가 불필요하게 호출되므로 줄인다.
 * - 손이 사라지면 손 값은 중립으로 돌아가고, 바뀐 순간 한 번만 보낸다.
 * - 작은 떨림으로 매 프레임 값이 바뀌지 않도록 소수점을 반올림한다.
 */
const round = (v, step) => Math.round(v / step) * step;
const seen = (hand) => Boolean(hand?.detected);

const ZERO = Object.freeze({ joystickX: 0, joystickY: 0 });

export class MotionBridge {
  #sent = {};
  #base = null; // 조이스틱 기준 기울기 { x, y } (null이면 쥐고 있지 않음)
  #role = null; // 기준을 잡을 때의 조작 손 ('left' | 'right')

  /** @param {{ update(partial, source): void, reset(source): void }} inputState */
  constructor(inputState, { joystick = JOYSTICK_DEFAULTS } = {}) {
    this.inputState = inputState;
    this.joystick = { ...JOYSTICK_DEFAULTS, ...joystick };
  }

  /** 조이스틱을 쥐고 있는지 (카메라 창 안내용) */
  get gripping() {
    return this.#base !== null;
  }

  /** 지금 손 기울기를 조이스틱 가운데로 삼는다 (R 키, 쥐고 있을 때만 의미 있음) */
  recenter(tilt) {
    if (tilt && this.#base) this.#base = { ...tilt };
  }

  /** 조작 손 → 조이스틱. 쥐고 있을 때만 움직이고, 펴거나 손이 바뀌면 0부터 다시 */
  #stick(hand, role) {
    const grip = seen(hand) && hand.isFist && hand.tilt;
    if (!grip || role !== this.#role) {
      this.#base = null; // 놓음 또는 다른 손으로 바뀜: 다음에 쥘 때 그 자세를 새 가운데로
      this.#role = role;
      if (!grip) return ZERO;
    }
    this.#base ??= { ...hand.tilt }; // 쥐는 순간의 자세가 가운데
    return tiltToJoystick(hand.tilt, this.#base, this.joystick);
  }

  /**
   * 트래커 상태 → InputState에 넣을 값 (테스트용으로 분리). 손을 쥐고 펴는 상태도 여기서 따라간다.
   * @param {{ hand?: object, role?: 'left' | 'right' | null } | null} control 조작 손의 HandTracker 상태와 어느 손인지
   * @param {object | null} head HeadTracker 상태 (없으면 머리 값은 보내지 않음)
   */
  toInput(control, head) {
    const out = {};
    if (control) {
      const { hand, role = null } = control;
      const stick = this.#stick(hand, role);
      Object.assign(out, {
        joystickX: round(stick.joystickX, 0.02),
        joystickY: round(stick.joystickY, 0.02),
        // 누른 직후 손이 화면 밖으로 나가도 isPush는 잠깐 유지되므로 detected와 따로 본다
        isFist: Boolean(hand?.isPush),
        isPointing: seen(hand) && Boolean(hand.isPointing),
        isOk: seen(hand) && Boolean(hand.isOk),
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
  push(control, head = null) {
    const next = this.toInput(control, head);
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
    this.#role = null;
  }
}
