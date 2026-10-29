/**
 * 인형뽑기 기계 규격 (단위: m, 기계 로컬 좌표, 원점 = 바닥 중심, +Z = 정면).
 * 3D 모델과 물리 충돌체가 같은 값을 공유한다.
 */
export const MACHINE_SPEC = {
  width: 1.0,
  depth: 1.0,
  baseHeight: 0.9, // 인형이 놓이는 바닥 높이
  glassHeight: 0.9,
  roofHeight: 0.15,
  innerHalf: 0.46, // 유리 안쪽 반폭

  // 배출구(정면 오른쪽 모서리)
  chute: { minX: 0.18, maxX: 0.46, minZ: 0.18, maxZ: 0.46, wallHeight: 0.16 },

  // 집게
  claw: {
    railY: 1.74,
    range: 0.4, // 집게 중심이 움직일 수 있는 X/Z 반경 (벽에 붙은 인형 위까지. 벽 근처에선 집게발을 덜 벌린다)
    home: { x: 0.32, z: 0.32 }, // 배출구 위
    minCable: 0.08,
    maxCable: 0.72,
  },

  // 조작 패널
  panel: { y: 0.9, z: 0.62, depth: 0.25 },
};

export const PLAY_FLOOR_Y = MACHINE_SPEC.baseHeight;
export const GLASS_TOP_Y = MACHINE_SPEC.baseHeight + MACHINE_SPEC.glassHeight;
