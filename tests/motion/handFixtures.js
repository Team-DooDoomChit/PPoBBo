/**
 * 테스트용 가짜 손 랜드마크.
 * 화면 landmarks(0~1)와 worldLandmarks(미터, 손목 원점)를 함께 만든다.
 * worldLandmarks 축은 MediaPipe와 같다: +x = 원본 영상 오른쪽, +y = 아래, -z = 카메라 쪽.
 * 기본 자세는 손가락이 위(-y)를 향하고 손바닥이 카메라를 보는 손이다.
 * 아래 손가락 좌표는 보기 편하게 위쪽을 +로 적고, 마지막에 y를 뒤집는다.
 */
const MCP = { index: [-0.025, 0.085], middle: [0, 0.088], ring: [0.02, 0.083], pinky: [0.038, 0.072] };
const BASE = { index: 5, middle: 9, ring: 13, pinky: 17 };

function finger(name, pose) {
  const [x, y] = MCP[name];
  const p = (dy, dz) => ({ x, y: y + dy, z: dz });
  if (pose === 'extended') return [p(0, 0), p(0.04, 0), p(0.065, 0), p(0.085, 0)];
  if (pose === 'half') return [p(0, 0), p(0.035, -0.01), p(0.05, -0.025), p(0.05, -0.035)];
  return [p(0, 0), p(0.03, -0.015), p(0.015, -0.035), p(-0.01, -0.025)]; // curled
}

const THUMB = {
  open: [[-0.03, 0.02, 0], [-0.05, 0.04, 0], [-0.065, 0.06, 0], [-0.08, 0.075, 0]],
  tucked: [[-0.03, 0.02, -0.01], [-0.035, 0.045, -0.025], [-0.02, 0.065, -0.035], [-0.005, 0.07, -0.035]],
};

/**
 * 손목을 기준으로 손을 기울인다 (라디안, #34 왼손 조이스틱).
 * forward: + = 손끝이 카메라 쪽(앞)으로 숙여짐, right: + = 사용자 기준 오른쪽(원본 영상 -x)으로 기울어짐
 */
function tiltPoint({ x, y, z }, { forward = 0, right = 0 }) {
  // 앞뒤: x축 회전 (위(-y)를 향한 손끝이 -z 쪽으로)
  const y1 = y * Math.cos(forward) - z * Math.sin(forward);
  const z1 = y * Math.sin(forward) + z * Math.cos(forward);
  // 좌우: z축 회전 (위(-y)를 향한 손끝이 -x 쪽으로)
  return { x: x * Math.cos(right) + y1 * Math.sin(right), y: -x * Math.sin(right) + y1 * Math.cos(right), z: z1 };
}

/**
 * @param {object} pose { index, middle, ring, pinky: 'extended'|'curled'|'half', thumb: 'open'|'tucked'|'pinch' }
 * @param {object} [at] 화면 위치 { x, y } (카메라 원본 기준, 반전 전)
 * @param {number} [scale] 미터 → 화면 비율
 * @param {{ forward?: number, right?: number }} [tilt] 손 기울기 (라디안)
 */
export function makeHand(pose, at = { x: 0.5, y: 0.6 }, scale = 2, tilt = {}) {
  const world = new Array(21);
  world[0] = { x: 0, y: 0, z: 0 };
  for (const name of Object.keys(BASE)) finger(name, pose[name] ?? 'curled').forEach((pt, i) => (world[BASE[name] + i] = pt));
  const thumb = pose.thumb === 'pinch' ? THUMB.open : THUMB[pose.thumb ?? 'open'];
  thumb.forEach(([x, y, z], i) => (world[1 + i] = { x, y, z }));
  if (pose.thumb === 'pinch') world[4] = { ...world[8], x: world[8].x - 0.008 }; // 엄지 끝을 검지 끝에 붙인다
  // MediaPipe 축(+y = 아래)으로 뒤집고 기울인다
  world.forEach((p, i) => (world[i] = tiltPoint({ x: p.x, y: -p.y, z: p.z }, tilt)));

  const landmarks = world.map((p) => ({ x: at.x + p.x * scale, y: at.y + p.y * scale, z: p.z }));
  return { landmarks: [landmarks], worldLandmarks: [world], handedness: [[{ categoryName: 'Right', score: 0.98 }]] };
}

export const POSES = {
  open: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended', thumb: 'open' },
  fist: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled', thumb: 'tucked' },
  point: { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled', thumb: 'tucked' },
  pinch: { index: 'half', middle: 'extended', ring: 'extended', pinky: 'extended', thumb: 'pinch' },
  // OK 사인 👌 = 나머지 세 손가락을 편 채로 엄지·검지를 붙인 자세
  ok: { index: 'half', middle: 'extended', ring: 'extended', pinky: 'extended', thumb: 'pinch' },
  // 엄지·검지를 붙였지만 중지를 굽힌 자세 (OK 아님)
  okBent: { index: 'half', middle: 'curled', ring: 'extended', pinky: 'extended', thumb: 'pinch' },
};

export const NO_HAND = { landmarks: [], worldLandmarks: [], handedness: [] };
