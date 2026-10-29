import { classifyHand, handAnchors } from './handGestures.js';
import { BoolDebouncer, PointFilter } from './filters.js';

/**
 * MediaPipe HandLandmarker 결과 → 안정된 손 상태. (#8)
 *
 * - 제스처는 일정 시간 유지되어야 바뀐다 (BoolDebouncer)
 * - 위치는 One Euro Filter로 떨림을 줄인다
 * - 손이 잠깐(lostMs) 안 보이는 건 무시하고, 그 이상이면 detected=false
 *
 * 브라우저/MediaPipe에 의존하지 않아 Node 테스트가 가능하다.
 */
export const HAND_DEFAULTS = Object.freeze({
  lostMs: 250,
  gestureOnMs: 80,
  gestureOffMs: 120,
  filter: { minCutoff: 1.5, beta: 4 },
});

const EMPTY = Object.freeze({
  detected: false,
  isFist: false,
  isPointing: false,
  isPinching: false,
  palm: null, // { x, y } 손바닥 중심 (화면 정규화, 좌우 반전)
  pointer: null, // { x, y } 커서 위치 (집는 중이면 엄지·검지 사이, 아니면 검지 끝)
  handedness: null, // 'Left' | 'Right'
});

export class HandTracker {
  #raw = { isPinching: false };
  #lastSeen = -Infinity;

  constructor(options = {}) {
    this.options = { ...HAND_DEFAULTS, ...options };
    const { gestureOnMs: onMs, gestureOffMs: offMs, filter } = this.options;
    this.debounce = {
      isFist: new BoolDebouncer({ onMs, offMs }),
      isPointing: new BoolDebouncer({ onMs, offMs }),
      isPinching: new BoolDebouncer({ onMs, offMs }),
    };
    this.palmFilter = new PointFilter(filter);
    this.pointerFilter = new PointFilter(filter);
    this.state = { ...EMPTY };
  }

  reset() {
    Object.values(this.debounce).forEach((d) => d.reset());
    this.palmFilter.reset();
    this.pointerFilter.reset();
    this.#raw = { isPinching: false };
    this.state = { ...EMPTY };
  }

  /**
   * @param {{ landmarks: Array, worldLandmarks: Array, handedness?: Array }} result HandLandmarker 결과
   * @param {number} t 시각(초)
   * @returns 현재 손 상태 (매번 새 객체)
   */
  update(result, t) {
    const image = result?.landmarks?.[0];
    const world = result?.worldLandmarks?.[0];

    if (!image || !world) {
      if ((t - this.#lastSeen) * 1000 > this.options.lostMs && this.state.detected) this.reset();
      return { ...this.state };
    }
    this.#lastSeen = t;

    this.#raw = classifyHand(world, this.#raw);
    const g = {};
    for (const key of ['isFist', 'isPointing', 'isPinching']) g[key] = this.debounce[key].update(this.#raw[key], t);

    const anchors = handAnchors(image);
    const pointerRaw = g.isPinching ? anchors.pinchPoint : anchors.indexTip;

    this.state = {
      detected: true,
      ...g,
      palm: this.palmFilter.filter(anchors.palm, t),
      pointer: this.pointerFilter.filter(pointerRaw, t),
      handedness: result.handedness?.[0]?.[0]?.categoryName ?? null,
    };
    return { ...this.state };
  }
}
