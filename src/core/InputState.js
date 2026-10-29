/**
 * 모션 인식 / 키보드 입력 → 3D·게임 사이의 공유 입력 상태.
 *
 * 입력원(source)마다 상태를 따로 두고, 읽을 때 하나로 합친다.
 * 그래서 키보드와 모션이 동시에 들어와도 서로의 값을 덮어쓰지 않는다.
 *   - joystickX/Y : 입력원 값의 합 (-1~1로 자름)
 *   - isFist / isPointing / isPinching : 하나라도 true면 true
 *   - pointer / headYaw / headPitch / gazeTarget : 값이 있는 입력원 중 가장 최근에 갱신한 쪽
 * 필드 설명은 docs/INTEGRATION.md 참고.
 */
const DEFAULT_STATE = Object.freeze({
  joystickX: 0, // -1(왼쪽) ~ 1(오른쪽)
  joystickY: 0, // -1(앞쪽/플레이어 방향) ~ 1(안쪽)
  isFist: false, // 주먹 쥐기 → 집게 내리기
  isPointing: false, // 검지 가리키기 → 선택/확인
  isPinching: false, // 엄지·검지 집기 → 동전 드래그
  pointer: null, // { x, y } 화면 정규화 좌표 (0~1, 좌상단 원점, 좌우 반전 처리된 값)
  headYaw: 0, // 라디안, 오른쪽으로 돌리면 +
  headPitch: 0, // 라디안, 위를 보면 +
  gazeTarget: null, // 바라보는 기계 id (예: 'bear')
  source: 'none', // 마지막으로 값을 넣은 입력원 (읽기 전용, update로 바꿀 수 없음)
});

const BUTTONS = ['isFist', 'isPointing', 'isPinching'];
const LATEST = ['pointer', 'headYaw', 'headPitch', 'gazeTarget'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const warned = new Set();

class InputState {
  #sources = new Map(); // source → 해당 입력원의 상태 (갱신 순서대로 정렬)
  #state = { ...DEFAULT_STATE };
  #listeners = new Set();

  /** 모든 입력원을 합친 현재 상태의 복사본 */
  get() {
    return { ...this.#state };
  }

  /**
   * 입력원 하나의 일부 필드만 갱신한다. 매 프레임 호출해도 된다.
   * @param {Partial<typeof DEFAULT_STATE>} partial
   * @param {string} [source='motion']
   */
  update(partial, source = 'motion') {
    const own = { ...(this.#sources.get(source) ?? DEFAULT_STATE) };
    for (const [key, value] of Object.entries(partial)) {
      if (key === 'source') continue; // 입력원은 두 번째 인자로만 정한다
      if (!(key in DEFAULT_STATE)) {
        if (!warned.has(key)) console.warn(`[InputState] 알 수 없는 필드 "${key}" (docs/INTEGRATION.md 참고)`);
        warned.add(key);
        continue;
      }
      own[key] = value;
    }
    own.joystickX = clamp(Number(own.joystickX) || 0, -1, 1);
    own.joystickY = clamp(Number(own.joystickY) || 0, -1, 1);

    // 가장 최근에 갱신한 입력원이 맨 뒤에 오도록 다시 넣는다
    this.#sources.delete(source);
    this.#sources.set(source, own);
    this.#commit(source);
  }

  /** 입력원 하나의 값을 모두 지운다 (손을 놓쳤을 때 등). 다른 입력원은 그대로 둔다. */
  reset(source = 'motion') {
    if (!this.#sources.delete(source)) return;
    this.#commit(source);
  }

  /** (next, prev) => void, 반환값을 호출하면 해제 */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #commit(source) {
    const prev = this.#state;
    const next = { ...DEFAULT_STATE, source };
    for (const own of this.#sources.values()) {
      next.joystickX += own.joystickX;
      next.joystickY += own.joystickY;
      for (const key of BUTTONS) next[key] ||= Boolean(own[key]);
      for (const key of LATEST) if (own[key] !== DEFAULT_STATE[key]) next[key] = own[key];
    }
    next.joystickX = clamp(next.joystickX, -1, 1);
    next.joystickY = clamp(next.joystickY, -1, 1);

    this.#state = next;
    this.#listeners.forEach((fn) => fn(next, prev));
  }
}

export const inputState = new InputState();
