/**
 * 두 손 → 역할(왼손 = 조이스틱, 오른손 = 집게 내리기) 구분. (#34)
 *
 * - 두 손이 보이면 화면 위치로 나눈다. 거울처럼 보이는 화면에서 왼쪽에 있는 손이 왼손이다.
 * - 한 손만 보이면, 직전 프레임에 비슷한 위치에 있던 손의 역할을 이어 간다.
 *   (MediaPipe의 왼손/오른손 라벨은 손을 쥐었다 펴는 순간 가끔 뒤집히기 때문)
 * - 직전 기록이 없으면 MediaPipe handedness 라벨을 쓴다.
 *   MediaPipe는 입력 영상이 거울처럼 뒤집혀 있다고 가정하고 라벨을 붙이는데,
 *   우리는 원본 영상을 넘기므로 라벨을 반대로 읽는다 (HANDEDNESS_SWAPPED).
 *
 * 브라우저/MediaPipe에 의존하지 않아 Node 테스트가 가능하다.
 */
export const HANDEDNESS_SWAPPED = true;
const KEEP_ROLE_DISTANCE = 0.2; // 직전 위치와 이만큼(화면 비율) 가까우면 같은 손으로 본다
const KEEP_ROLE_MS = 500; // 이보다 오래 안 보였으면 직전 기록을 쓰지 않는다

/** 손 하나의 화면 x (좌우 반전, 0 = 화면 왼쪽). 손목과 중지 MCP의 가운데 */
export const handScreenPos = (landmarks) => ({
  x: 1 - (landmarks[0].x + landmarks[9].x) / 2,
  y: (landmarks[0].y + landmarks[9].y) / 2,
});

/** MediaPipe 라벨 → 사용자 기준 'left' | 'right' | null */
export function roleFromLabel(handedness, swapped = HANDEDNESS_SWAPPED) {
  const label = handedness?.[0]?.categoryName;
  if (label !== 'Left' && label !== 'Right') return null;
  const isLeft = label === 'Left';
  return isLeft !== swapped ? 'left' : 'right';
}

/** HandLandmarker 결과에서 i번째 손만 담은 결과 (HandTracker 입력 형식) */
export const pickHand = (result, i) => ({
  landmarks: [result.landmarks[i]],
  worldLandmarks: [result.worldLandmarks[i]],
  handedness: result.handedness?.[i] ? [result.handedness[i]] : [],
});

const EMPTY_HAND = Object.freeze({ landmarks: [], worldLandmarks: [], handedness: [] });

export class HandRoleAssigner {
  #last = { left: null, right: null }; // 역할별 마지막 위치 { x, y, t }

  reset() {
    this.#last = { left: null, right: null };
  }

  /**
   * @param {object} result HandLandmarker 결과 (손 0~2개)
   * @param {number} t 시각(초)
   * @returns {{ left: object, right: object, index: { left: number, right: number } }}
   *   left/right: 해당 손만 담은 결과 (없으면 빈 결과), index: 원래 결과에서의 순서 (없으면 -1)
   */
  assign(result, t) {
    const count = Math.min(result?.landmarks?.length ?? 0, result?.worldLandmarks?.length ?? 0);
    const pos = Array.from({ length: count }, (_, i) => handScreenPos(result.landmarks[i]));
    const index = { left: -1, right: -1 };

    if (count >= 2) {
      // 화면 왼쪽에 있는 손이 왼손
      const [a, b] = pos[0].x <= pos[1].x ? [0, 1] : [1, 0];
      index.left = a;
      index.right = b;
    } else if (count === 1) {
      index[this.#roleForSingle(pos[0], result.handedness?.[0], t)] = 0;
    }

    for (const role of ['left', 'right']) {
      if (index[role] >= 0) this.#last[role] = { ...pos[index[role]], t };
    }
    return {
      left: index.left >= 0 ? pickHand(result, index.left) : EMPTY_HAND,
      right: index.right >= 0 ? pickHand(result, index.right) : EMPTY_HAND,
      index,
    };
  }

  #roleForSingle(p, handedness, t) {
    const near = (role) => {
      const last = this.#last[role];
      if (!last || (t - last.t) * 1000 > KEEP_ROLE_MS) return Infinity;
      return Math.hypot(p.x - last.x, p.y - last.y);
    };
    const dl = near('left');
    const dr = near('right');
    if (Math.min(dl, dr) < KEEP_ROLE_DISTANCE) return dl <= dr ? 'left' : 'right';
    // 라벨이 없으면 화면 위치로 (가운데보다 왼쪽이면 왼손)
    return roleFromLabel(handedness) ?? (p.x < 0.5 ? 'left' : 'right');
  }
}
