/**
 * 손을 아래로 빠르게 내리는 동작 판정. (#34, #47 손바닥 누르기에 사용)
 *
 * 최근 windowMs 안에서 손이 minDrop(화면 높이 비율) 이상, minSpeed(화면 높이/초) 이상의 빠르기로
 * 내려갔으면 한 번 인식한다. 인식 뒤 pulseMs 동안 true를 유지해 다음 단계가 눌림 순간을 놓치지 않게 하고,
 * cooldownMs 동안은 다시 인식하지 않는다 (한 번 내려칠 때 여러 번 인식되지 않도록).
 *
 * 손을 천천히 내리는 건(조준 중 손 위치 조정) 빠르기 기준에 걸려 인식하지 않는다.
 */
export const SLAM_DEFAULTS = Object.freeze({
  windowMs: 300,
  minDrop: 0.12,
  minSpeed: 0.9,
  pulseMs: 150,
  cooldownMs: 700,
});

export class SlamDetector {
  #samples = []; // { y, t }
  #firedAt = -Infinity;

  constructor(options = {}) {
    this.options = { ...SLAM_DEFAULTS, ...options };
  }

  reset() {
    this.#samples = [];
    this.#firedAt = -Infinity;
  }

  /**
   * @param {number | null} y 손 위치 y (0 = 화면 위, 1 = 아래). 손이 없으면 null
   * @param {number} t 시각(초)
   * @returns {boolean} 내려치기 직후 pulseMs 동안 true
   */
  update(y, t) {
    const { windowMs, minDrop, minSpeed, pulseMs, cooldownMs } = this.options;
    const sinceFire = (t - this.#firedAt) * 1000;

    if (y == null) {
      this.#samples = [];
    } else {
      this.#samples.push({ y, t });
      while (this.#samples.length && (t - this.#samples[0].t) * 1000 > windowMs) this.#samples.shift();

      if (sinceFire >= cooldownMs && this.#detect(y, t, minDrop, minSpeed)) {
        this.#firedAt = t;
        this.#samples = []; // 같은 움직임으로 다시 인식하지 않도록
        return true;
      }
    }
    return (t - this.#firedAt) * 1000 < pulseMs;
  }

  #detect(y, t, minDrop, minSpeed) {
    for (const s of this.#samples) {
      const drop = y - s.y;
      const dt = t - s.t;
      if (dt > 0 && drop >= minDrop && drop / dt >= minSpeed) return true;
    }
    return false;
  }
}
