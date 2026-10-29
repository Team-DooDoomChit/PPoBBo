/**
 * 테스트용 가짜 손 랜드마크.
 * worldLandmarks(미터, 손목 원점, +y = 손가락 방향, -z = 손바닥 앞쪽)와
 * 화면 landmarks(0~1)를 함께 만든다.
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
 * @param {object} pose { index, middle, ring, pinky: 'extended'|'curled'|'half', thumb: 'open'|'tucked'|'pinch' }
 * @param {object} [at] 화면 위치 { x, y } (카메라 원본 기준, 반전 전)
 */
export function makeHand(pose, at = { x: 0.5, y: 0.6 }, scale = 2) {
  const world = new Array(21);
  world[0] = { x: 0, y: 0, z: 0 };
  for (const name of Object.keys(BASE)) finger(name, pose[name] ?? 'curled').forEach((pt, i) => (world[BASE[name] + i] = pt));
  const thumb = pose.thumb === 'pinch' ? THUMB.open : THUMB[pose.thumb ?? 'open'];
  thumb.forEach(([x, y, z], i) => (world[1 + i] = { x, y, z }));
  if (pose.thumb === 'pinch') world[4] = { ...world[8], x: world[8].x - 0.008 }; // 엄지 끝을 검지 끝에 붙인다

  const landmarks = world.map((p) => ({ x: at.x + p.x * scale, y: at.y - p.y * scale, z: p.z }));
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
