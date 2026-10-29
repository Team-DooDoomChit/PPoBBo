import { classifyHand, handAnchors, handTilt } from './handGestures.js';
import { BoolDebouncer, PointFilter } from './filters.js';
import { SlamDetector } from './slamDetector.js';

/**
 * MediaPipe HandLandmarker 결과 → 안정된 손 상태. (#8)
 *
 * - 제스처는 일정 시간 유지되어야 바뀐다 (BoolDebouncer)
 * - 위치는 One Euro Filter로 떨림을 줄인다
 * - 손이 잠깐(lostMs) 안 보이는 건 무시하고, 그 이상이면 detected=false
 * - OK 사인은 코인 투입이라 잘못 들어가지 않도록 더 오래(okOnMs) 유지해야 켜진다 (#34)
 * - slam 옵션을 켜면 손을 아래로 내려치는 동작도 판정한다 (isSlam, #34 오른손)
 *
 * 브라우저/MediaPipe에 의존하지 않아 Node 테스트가 가능하다.
 */
export const HAND_DEFAULTS = Object.freeze({
  lostMs: 250,
  gestureOnMs: 80,
  gestureOffMs: 120,
  okOnMs: 250,
  slam: false, // true 또는 SlamDetector 옵션
  filter: { minCutoff: 1.5, beta: 4 },
  tiltFilter: { minCutoff: 1.0, beta: 0.6 }, // 기울기(라디안)용: 가만히 있을 땐 떨림을 강하게 줄인다
});

const EMPTY = Object.freeze({
  detected: false,
  isFist: false,
  isPointing: false,
  isPinching: false,
  isOk: false,
  isSlam: false,
  palm: null, // { x, y } 손바닥 중심 (화면 정규화, 좌우 반전)
  pointer: null, // { x, y } 커서 위치 (집는 중이면 엄지·검지 사이, 아니면 검지 끝)
  tilt: null, // { x, y } 손 기울기 라디안 (x: 오른쪽 +, y: 앞으로 숙이면 +), handTilt() 참고
  handedness: null, // 'Left' | 'Right'
});

export class HandTracker {
  #raw = { isPinching: false, isOk: false };
  #lastSeen = -Infinity;

  constructor(options = {}) {
    this.options = { ...HAND_DEFAULTS, ...options };
    const { gestureOnMs: onMs, gestureOffMs: offMs, okOnMs, slam, filter, tiltFilter } = this.options;
    this.debounce = {
      isFist: new BoolDebouncer({ onMs, offMs }),
      isPointing: new BoolDebouncer({ onMs, offMs }),
      isPinching: new BoolDebouncer({ onMs, offMs }),
      isOk: new BoolDebouncer({ onMs: okOnMs, offMs }),
    };
    this.slam = slam ? new SlamDetector(slam === true ? {} : slam) : null;
    this.palmFilter = new PointFilter(filter);
    this.pointerFilter = new PointFilter(filter);
    this.tiltFilter = new PointFilter(tiltFilter);
    this.state = { ...EMPTY };
  }

  reset() {
    Object.values(this.debounce).forEach((d) => d.reset());
    this.palmFilter.reset();
    this.pointerFilter.reset();
    this.tiltFilter.reset();
    this.slam?.reset();
    this.#raw = { isPinching: false, isOk: false };
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
      // 내려친 직후 손이 화면 밖으로 나가도 인식 결과(잠깐 true)는 그대로 흘려보낸다
      if (this.slam) this.state = { ...this.state, isSlam: this.slam.update(null, t) };
      return { ...this.state };
    }
    this.#lastSeen = t;

    this.#raw = classifyHand(world, this.#raw);
    const g = {};
    for (const key of ['isFist', 'isPointing', 'isPinching', 'isOk']) g[key] = this.debounce[key].update(this.#raw[key], t);

    const anchors = handAnchors(image);
    const pointerRaw = g.isPinching ? anchors.pinchPoint : anchors.indexTip;

    this.state = {
      detected: true,
      ...g,
      isSlam: this.slam ? this.slam.update(anchors.palm.y, t) : false, // 필터 지연 없이 원래 위치로 판정
      palm: this.palmFilter.filter(anchors.palm, t),
      pointer: this.pointerFilter.filter(pointerRaw, t),
      tilt: this.tiltFilter.filter(handTilt(world), t),
      handedness: result.handedness?.[0]?.[0]?.categoryName ?? null,
    };
    return { ...this.state };
  }
}
