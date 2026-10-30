/**
 * 손 랜드마크(21개) → 제스처 판별. (#8)
 *
 * 판별에는 MediaPipe의 worldLandmarks(손 중심 기준 3D, 미터 단위)를 쓴다.
 * 화면 좌표와 달리 카메라와의 거리·화면 비율에 영향을 받지 않는다.
 *
 * 랜드마크 번호
 *   0 손목 / 엄지 1~4 / 검지 5~8 / 중지 9~12 / 약지 13~16 / 소지 17~20
 *   (각 손가락: MCP, PIP, DIP, TIP 순)
 */
export const LM = Object.freeze({
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
});

const FINGERS = Object.freeze({
  index: [5, 6, 8],
  middle: [9, 10, 12],
  ring: [13, 14, 16],
  pinky: [17, 18, 20],
});

/**
 * 판별 기준값. 손 크기(손목~중지 MCP 거리)에 대한 비율이라 사람마다 손 크기가 달라도 같다.
 * - extended / curled: 손목~손끝 거리 ÷ 손목~MCP 거리
 * - pinchOn / pinchOff: 엄지 끝~검지 끝 거리 ÷ 손 크기 (켜짐/꺼짐 값을 달리해 떨림 방지)
 */
export const GESTURE_THRESHOLDS = Object.freeze({
  extended: 1.55,
  curled: 1.3,
  pinchOn: 0.35,
  pinchOff: 0.5,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** 손 크기 (손목 → 중지 MCP) */
export const palmSize = (lm) => dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);

/**
 * 손가락 하나의 상태.
 * @returns {'extended' | 'curled' | 'unknown'} 중간 값은 'unknown' (직전 판정 유지용)
 */
export function fingerState(lm, finger, t = GESTURE_THRESHOLDS) {
  const [mcp, , tip] = FINGERS[finger];
  const ratio = dist(lm[LM.WRIST], lm[tip]) / dist(lm[LM.WRIST], lm[mcp]);
  if (ratio >= t.extended) return 'extended';
  if (ratio <= t.curled) return 'curled';
  return 'unknown';
}

/** 엄지 끝~검지 끝 거리 ÷ 손 크기 */
export const pinchRatio = (lm) => dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / palmSize(lm);

/**
 * 한 프레임의 제스처 판별.
 * @param {Array<{x,y,z}>} world worldLandmarks 21개
 * @param {{ isPinching?: boolean, isOk?: boolean }} [prev] 직전 결과 (집기·OK 판정 히스테리시스용)
 * @returns {{ isFist: boolean, isPointing: boolean, isPinching: boolean, isOk: boolean, fingers: object, pinch: number }}
 */
export function classifyHand(world, prev = {}, t = GESTURE_THRESHOLDS) {
  const fingers = Object.fromEntries(Object.keys(FINGERS).map((f) => [f, fingerState(world, f, t)]));
  const others = [fingers.middle, fingers.ring, fingers.pinky];

  const isFist = fingers.index === 'curled' && others.every((s) => s === 'curled');
  const isPointing = fingers.index === 'extended' && others.every((s) => s === 'curled');

  const pinch = pinchRatio(world);
  // 주먹을 쥐면 엄지가 검지 위에 놓여 집기처럼 보이므로 주먹이 우선이다
  const isPinching = !isFist && (prev.isPinching ? pinch < t.pinchOff : pinch < t.pinchOn);
  // OK 사인 👌: 엄지·검지 끝을 붙여 동그라미 + 나머지 세 손가락은 편다 (#34 코인 투입)
  const isOk = others.every((s) => s === 'extended') && (prev.isOk ? pinch < t.pinchOff : pinch < t.pinchOn);

  return { isFist, isPointing, isPinching, isOk, fingers, pinch };
}

/**
 * 화면 좌표(landmarks, 0~1)에서 커서/조이스틱용 기준점을 뽑는다.
 * 셀피 화면처럼 보이도록 x는 좌우 반전한다.
 * @returns {{ palm: {x,y}, indexTip: {x,y}, pinchPoint: {x,y} }}
 */
export function handAnchors(image) {
  const mirror = (p) => ({ x: 1 - p.x, y: p.y });
  const avg = (ids) => ({
    x: ids.reduce((s, i) => s + image[i].x, 0) / ids.length,
    y: ids.reduce((s, i) => s + image[i].y, 0) / ids.length,
  });
  const palm = avg([LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP]);
  return {
    palm: mirror(palm),
    indexTip: mirror(image[LM.INDEX_TIP]),
    pinchPoint: mirror(avg([LM.THUMB_TIP, LM.INDEX_TIP])),
  };
}

/**
 * 손 기울기 (라디안). 조이스틱을 쥐듯 손을 세웠을 때 0. (#34 왼손 조이스틱)
 *
 * 손목 → 중지 뿌리(MCP) 방향이 위(-y)에서 얼마나 기울었는지 본다. 중지가 손의 가운데 축에 가장 가깝다.
 * 주먹을 쥐든 펴든, 손목을 축으로 손을 돌려도(손바닥 방향) 값이 같다.
 *   x: 사용자 기준 오른쪽으로 기울이면 + (원본 영상 -x 쪽)
 *   y: 손끝을 앞(카메라 쪽)으로 숙이면 +, 뒤로 젖히면 -
 * @param {Array<{x,y,z}>} world worldLandmarks (MediaPipe 축: +y 아래, -z 카메라 쪽)
 * @returns {{ x: number, y: number }}
 */
export function handTilt(world) {
  const w = world[LM.WRIST];
  const m = world[LM.MIDDLE_MCP];
  const dx = m.x - w.x;
  const up = -(m.y - w.y);
  const dz = (m.z ?? 0) - (w.z ?? 0);
  return { x: Math.atan2(-dx, up), y: Math.atan2(-dz, up) };
}

/** 손이 수평으로 누워 있다고 볼 기준: 손목 → 중지 뿌리 방향의 위아래 성분이 이보다 작으면 수평 */
export const FLAT_MAX_VERTICAL = 0.6; // 약 37도 (세로에서 53도 이상 눕힘)

/**
 * 손이 수평인지 (손바닥 누르기 판정용, #47).
 * 손바닥을 아래로 향해 누를 때는 손끝이 앞이나 옆을 향해 손이 눕는다.
 * 손을 세웠거나(손끝이 위) 그냥 내려놓아 손끝이 아래로 처진 자세는 수평이 아니다.
 * @param {Array<{x,y,z}>} world worldLandmarks
 */
export function handIsFlat(world, maxVertical = FLAT_MAX_VERTICAL) {
  const w = world[LM.WRIST];
  const m = world[LM.MIDDLE_MCP];
  const dx = m.x - w.x;
  const dy = m.y - w.y;
  const dz = (m.z ?? 0) - (w.z ?? 0);
  const len = Math.hypot(dx, dy, dz) || 1;
  return Math.abs(dy) / len < maxVertical;
}
