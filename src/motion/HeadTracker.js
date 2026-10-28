import { headRatios, estimateHeadPose } from './headPose.js';
import { OneEuroFilter } from './filters.js';
import { GazeSelector } from './GazeSelector.js';

/**
 * MediaPipe FaceLandmarker 결과 → 머리 방향 + 바라보는 기계. (#9)
 *
 * - 처음 얼굴이 보인 뒤 calibrationFrames 동안의 평균을 정면(0점)으로 삼는다.
 *   사용자가 카메라를 비스듬히 두고 있어도 그 자세가 정면이 된다.
 * - recalibrate()로 언제든 다시 맞출 수 있다.
 * 브라우저/MediaPipe에 의존하지 않아 Node 테스트가 가능하다.
 */
export const HEAD_DEFAULTS = Object.freeze({
  calibrationFrames: 15,
  lostMs: 500,
  filter: { minCutoff: 1.0, beta: 1.5 },
});

export class HeadTracker {
  #samples = [];
  #lastSeen = -Infinity;

  /**
   * @param {string[]} machineIds 왼쪽 → 오른쪽 순서의 기계 id
   */
  constructor(machineIds = [], options = {}) {
    this.options = { ...HEAD_DEFAULTS, ...options };
    this.gaze = new GazeSelector(machineIds, options.gaze);
    this.yawFilter = new OneEuroFilter(this.options.filter);
    this.pitchFilter = new OneEuroFilter(this.options.filter);
    this.zero = null; // { yawRatio, pitchRatio }
    this.state = { detected: false, calibrated: false, yaw: 0, pitch: 0, gazeTarget: null };
  }

  /** 다음 프레임들로 정면을 다시 잡는다 */
  recalibrate() {
    this.zero = null;
    this.#samples = [];
    this.yawFilter.reset();
    this.pitchFilter.reset();
  }

  /**
   * @param {{ faceLandmarks: Array }} result FaceLandmarker 결과
   * @param {number} t 시각(초)
   */
  update(result, t) {
    const lm = result?.faceLandmarks?.[0];
    const ratios = lm && headRatios(lm);

    if (!ratios) {
      if ((t - this.#lastSeen) * 1000 > this.options.lostMs) {
        // 얼굴이 사라지면 정면으로 돌아간 것으로 본다 (선택된 기계는 유지)
        this.state = { ...this.state, detected: false, yaw: 0, pitch: 0, gazeTarget: this.gaze.update(null, t) };
      }
      return { ...this.state };
    }
    this.#lastSeen = t;

    if (!this.zero) {
      this.#samples.push(ratios);
      if (this.#samples.length < this.options.calibrationFrames) {
        this.state = { ...this.state, detected: true, calibrated: false };
        return { ...this.state };
      }
      const avg = (k) => this.#samples.reduce((s, r) => s + r[k], 0) / this.#samples.length;
      this.zero = { yawRatio: avg('yawRatio'), pitchRatio: avg('pitchRatio') };
      this.#samples = [];
    }

    const pose = estimateHeadPose(lm, this.zero);
    const yaw = this.yawFilter.filter(pose.yaw, t);
    const pitch = this.pitchFilter.filter(pose.pitch, t);
    this.state = { detected: true, calibrated: true, yaw, pitch, gazeTarget: this.gaze.update(yaw, t) };
    return { ...this.state };
  }
}
