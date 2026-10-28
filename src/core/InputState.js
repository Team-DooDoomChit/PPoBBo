/**
 * 모션 인식 / 키보드 입력 → 3D·게임 사이의 공유 입력 상태.
 *
 * 입력 쪽은 update()로 값을 밀어 넣고, 3D 쪽은 get()/subscribe()로 읽는다.
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
  source: 'none', // 마지막으로 값을 넣은 입력원 ('motion' | 'keyboard' | ...)
});

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const warned = new Set();

class InputState {
  #state = { ...DEFAULT_STATE };
  #listeners = new Set();

  /** 현재 상태의 복사본 */
  get() {
    return { ...this.#state };
  }

  /**
   * 일부 필드만 갱신한다. 매 프레임 호출해도 된다.
   * @param {Partial<typeof DEFAULT_STATE>} partial
   * @param {string} [source='motion']
   */
  update(partial, source = 'motion') {
    const prev = this.#state;
    const next = { ...prev, source };

    for (const [key, value] of Object.entries(partial)) {
      if (!(key in DEFAULT_STATE)) {
        if (!warned.has(key)) console.warn(`[InputState] 알 수 없는 필드 "${key}" (docs/INTEGRATION.md 참고)`);
        warned.add(key);
        continue;
      }
      next[key] = value;
    }
    next.joystickX = clamp(Number(next.joystickX) || 0, -1, 1);
    next.joystickY = clamp(Number(next.joystickY) || 0, -1, 1);

    this.#state = next;
    this.#listeners.forEach((fn) => fn(next, prev));
  }

  /** 초기 상태로 되돌린다 (손이 화면에서 사라졌을 때 등) */
  reset(source = 'none') {
    this.update({ ...DEFAULT_STATE }, source);
  }

  /** (next, prev) => void, 반환값을 호출하면 해제 */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
}

export const inputState = new InputState();
