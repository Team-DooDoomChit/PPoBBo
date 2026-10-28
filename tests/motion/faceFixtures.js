/**
 * 테스트용 가짜 얼굴 랜드마크.
 * 단순한 3D 얼굴(미터, +x = 사용자의 오른쪽, +y = 위, +z = 카메라 쪽)을 회전시켜 화면에 투영한다.
 * headPose.js 에서 쓰는 5개 점만 채운다.
 */
import { FACE, FACE_MODEL } from '../../src/motion/headPose.js';

const W = 0.07; // 얼굴 반폭
const MODEL = {
  [FACE.NOSE_TIP]: [0, -0.01, FACE_MODEL.yawK * W],
  [FACE.CHEEK_A]: [W, 0, 0], // 원본 영상 왼쪽 = 사용자의 오른쪽 볼
  [FACE.CHEEK_B]: [-W, 0, 0],
  [FACE.FOREHEAD]: [0, 0.09, 0.02],
  [FACE.CHIN]: [0, -0.1, 0.01],
};

/**
 * @param {number} yaw 라디안 (오른쪽으로 돌리면 +)
 * @param {number} pitch 라디안 (위를 보면 +)
 * @param {{ x: number, y: number, scale: number }} [at] 화면 위치/크기
 */
export function makeFace(yaw = 0, pitch = 0, at = { x: 0.5, y: 0.45, scale: 2.5 }) {
  const lm = new Array(478);
  for (const [i, [x, y, z]] of Object.entries(MODEL)) {
    // yaw: y축 회전 → pitch: x축 회전
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) + z1 * Math.sin(pitch);
    // 화면: 원본 영상은 좌우가 반대 (사용자의 오른쪽 = 화면 왼쪽)
    lm[i] = { x: at.x - x1 * at.scale, y: at.y - y2 * at.scale, z: 0 };
  }
  return { faceLandmarks: [lm] };
}

export const NO_FACE = { faceLandmarks: [] };
