/**
 * 얼굴 랜드마크(Face Mesh 468/478개) → 머리 회전 각도. (#9)
 *
 * 코끝이 얼굴 윤곽(양 볼, 이마~턱)의 중심에서 얼마나 벗어났는지로 각도를 추정한다.
 * 비율만 쓰므로 카메라와의 거리, 화면 비율에 영향을 받지 않는다.
 *
 * 부호 (docs/INTEGRATION.md 와 같음)
 *   yaw   : 사용자가 오른쪽으로 돌리면 +
 *   pitch : 위를 보면 +
 */
export const FACE = Object.freeze({
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  CHEEK_A: 234, // 원본 영상 기준 왼쪽 윤곽 (사용자의 오른쪽 볼)
  CHEEK_B: 454,
});

/**
 * 얼굴 모델 비율: 코끝이 얼굴 윤곽 평면에서 튀어나온 정도 ÷ 얼굴 반폭(반높이).
 * 회전 θ일 때 화면상 비율 ≈ K × tan(θ) 이므로 θ = atan(비율 ÷ K).
 * 사람마다 조금씩 다르지만 정면 보정(calibration)으로 0점은 맞춘다.
 */
export const FACE_MODEL = Object.freeze({ yawK: 0.9, pitchK: 0.45 });

/**
 * 보정 전 원시 비율. (calibration 기준값으로 저장해 두었다가 뺀다)
 * @returns {{ yawRatio: number, pitchRatio: number } | null}
 */
export function headRatios(lm) {
  const nose = lm?.[FACE.NOSE_TIP];
  const a = lm?.[FACE.CHEEK_A];
  const b = lm?.[FACE.CHEEK_B];
  const top = lm?.[FACE.FOREHEAD];
  const chin = lm?.[FACE.CHIN];
  if (!nose || !a || !b || !top || !chin) return null;

  // 셀피처럼 좌우 반전한 x에서: 오른쪽으로 돌리면 코가 오른쪽(+)으로 간다
  const mx = (p) => 1 - p.x;
  const halfW = Math.abs(mx(b) - mx(a)) / 2;
  // 화면 y는 아래가 +이므로 위쪽이 +가 되도록 뒤집는다
  const up = (p) => -p.y;
  const halfH = (up(top) - up(chin)) / 2;
  if (halfW < 1e-4 || halfH < 1e-4) return null;

  return {
    yawRatio: (mx(nose) - (mx(a) + mx(b)) / 2) / halfW,
    pitchRatio: (up(nose) - (up(top) + up(chin)) / 2) / halfH,
  };
}

/**
 * @param lm 얼굴 랜드마크 (화면 정규화 좌표)
 * @param {{ yawRatio: number, pitchRatio: number }} [zero] 정면 보정값
 * @returns {{ yaw: number, pitch: number } | null} 라디안
 */
export function estimateHeadPose(lm, zero = { yawRatio: 0, pitchRatio: 0 }, model = FACE_MODEL) {
  const r = headRatios(lm);
  if (!r) return null;
  return {
    yaw: Math.atan((r.yawRatio - zero.yawRatio) / model.yawK),
    pitch: Math.atan((r.pitchRatio - zero.pitchRatio) / model.pitchK),
  };
}
