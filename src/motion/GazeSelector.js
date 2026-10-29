/**
 * 머리 방향(yaw) → 바라보는 기계 선택. (#9)
 *
 * 기계들을 화면 왼쪽부터 순서대로 놓고 yaw 범위를 같은 폭으로 나눈다.
 * - 경계 근처에서 깜빡이지 않도록 경계를 margin만큼 넘어야 구역이 바뀐다.
 * - 한 구역을 dwellMs 동안 계속 바라봐야 선택(target)이 바뀐다.
 */
export const GAZE_DEFAULTS = Object.freeze({
  range: 0.35, // 가장 바깥 기계를 고르는 데 필요한 yaw (약 20도)
  margin: 0.04, // 경계 히스테리시스 (라디안)
  dwellMs: 1000,
});

export class GazeSelector {
  /** @param {string[]} ids 왼쪽 → 오른쪽 순서의 기계 id */
  constructor(ids, options = {}) {
    this.ids = ids;
    this.options = { ...GAZE_DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.zone = null; // 지금 바라보는 구역
    this.zoneSince = 0;
    this.target = null; // 확정된 선택
  }

  /** yaw가 속한 구역 번호 (히스테리시스 적용) */
  #zoneOf(yaw) {
    const { range, margin } = this.options;
    const n = this.ids.length;
    const width = (2 * range) / n;
    const raw = Math.min(n - 1, Math.max(0, Math.floor((yaw + range) / width)));
    if (this.zone === null || raw === this.zone) return raw;
    // 현재 구역의 경계에서 margin 이상 벗어났을 때만 바꾼다
    const lo = -range + this.zone * width;
    const hi = lo + width;
    if (yaw < lo - margin || yaw > hi + margin) return raw;
    return this.zone;
  }

  /**
   * @param {number | null} yaw 라디안 (얼굴이 없으면 null → 현재 선택 유지)
   * @param {number} t 시각(초)
   * @returns {string | null} 확정된 기계 id
   */
  update(yaw, t) {
    if (yaw == null || this.ids.length === 0) {
      this.zone = null;
      return this.target;
    }
    const zone = this.#zoneOf(yaw);
    if (zone !== this.zone) {
      this.zone = zone;
      this.zoneSince = t;
    }
    if ((t - this.zoneSince) * 1000 >= this.options.dwellMs) this.target = this.ids[zone];
    return this.target;
  }

  /** 지금 바라보는 구역의 응시 진행률 0~1 (UI 게이지용) */
  progress(t) {
    if (this.zone === null) return 0;
    if (this.ids[this.zone] === this.target) return 1;
    return Math.min(1, ((t - this.zoneSince) * 1000) / this.options.dwellMs);
  }
}
