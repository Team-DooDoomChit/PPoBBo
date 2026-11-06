import * as CANNON from 'cannon-es';
import { DOLL_SHAPE } from '../three/DollFactory.js';
import { GROUP } from './PhysicsWorld.js';

export const DOLL_MASK = GROUP.STATIC | GROUP.CHUTE_GUARD | GROUP.DOLL | GROUP.CLAW;
export const HELD_DOLL_MASK = GROUP.STATIC | GROUP.CHUTE_GUARD | GROUP.DOLL;

/**
 * 몸통·머리 구 { r: 반지름, y: 중심 높이 }. 기본은 DOLL_SHAPE.
 * 목도리 시리즈(#55)는 머리가 낮고 넓어서 따로 둔다. 몸통 구 중심을 바디 원점(무게 중심)에 둬야 인형이 넘어지지 않는다.
 * 훌라 햄스터(#49)는 머리가 넓고 낮아서 머리 구만 따로 맞춘다.
 * 훌라 고양이(#53)도 같은 이유로 머리 구만 따로 맞춘다.
 */
const DEFAULT_SPHERES = [
  { r: DOLL_SHAPE.bodyRadius, y: 0 },
  { r: DOLL_SHAPE.headRadius, y: DOLL_SHAPE.headOffsetY },
];
const SCARF_SPHERES = [
  { r: DOLL_SHAPE.bodyRadius, y: 0 }, // 몸통 + 머리 아래쪽 (머리 반폭 0.061)
  { r: 0.042, y: 0.042 }, // 머리 위쪽 (위쪽 끝 0.084)
];
const BASE_SPHERES = {
  keychainBunny: SCARF_SPHERES,
  keychainCat: SCARF_SPHERES,
  keychainHamster: SCARF_SPHERES,
  keychainMomonga: SCARF_SPHERES,
  hulaHamster: [
    // 몸통: 다른 인형과 같은 크기의 구를 원점(무게 중심)에 둔다. 구 중심이 무게 중심보다 아래면 인형이 넘어진다.
    { r: DOLL_SHAPE.bodyRadius, y: 0 },
    { r: 0.046, y: 0.0365 }, // 머리 (위쪽 끝 0.0825 = 귀 꼭대기, 앞뒤 두께 0.05)
  ],
  hulaCat: [
    // 몸통: 다른 인형과 같은 크기의 구를 원점(무게 중심)에 둔다. 구 중심이 무게 중심보다 아래면 인형이 넘어진다.
    { r: DOLL_SHAPE.bodyRadius, y: 0 },
    { r: 0.046, y: 0.045 }, // 머리 (위쪽 끝 0.091 = 귀 끝, 앞뒤 두께 0.046)
  ],
  // 인어섬 우사기(#59): 머리가 크고 공처럼 두꺼워서 머리 구를 크게 둔다
  hulaBunny: [
    { r: DOLL_SHAPE.bodyRadius, y: 0 },
    { r: 0.05, y: 0.039 }, // 머리 (위쪽 끝 0.089 = 정수리, 앞뒤 두께 0.056)
  ],
  // 인어섬 모몽가(#65): 머리가 높고 넓적해서 머리 구를 크게 둔다
  hulaMomonga: [
    { r: DOLL_SHAPE.bodyRadius, y: 0 },
    { r: 0.05, y: 0.043 }, // 머리 (위쪽 끝 0.093 = 정수리)
  ],
};

/**
 * 몸통·머리 구 위로 크게 튀어나오는 부분(귀, 꼬리, 키링 체인, 손에 든 소품)에 붙이는 상자 충돌체.
 * half: 상자 반크기 [x, y, z], y: 중심 높이, x·z: 좌우·앞뒤 중심 (없으면 0, 인형 원점 기준).
 * 모델(DollFactory)의 치수와 맞춘다.
 */
const EXTRA_SHAPES = {
  bunny: [{ half: [0.038, 0.045, 0.012], y: 0.165 }], // 귀 0.12 ~ 0.21
  keychainBunny: [{ half: [0.028, 0.0283, 0.015], y: 0.1073 }], // 귀 0.079 ~ 0.1356 (좌우 끝 ±0.028)
  keychainCat: [{ half: [0.044, 0.008, 0.009], y: 0.083 }], // 귀 끝 0.075 ~ 0.091
  keychainMomonga: [
    { half: [0.09, 0.017, 0.0075], y: 0.019 }, // 볼 옆 수염 판 (좌우 끝 ±0.09, 0.002 ~ 0.036, 앞뒤 ±0.0075)
    { half: [0.064, 0.0104, 0.008], y: 0.0943 }, // 귀 두 개 중 머리 위로 나온 부분 (0.084 ~ 0.1047)
    { half: [0.029, 0.0536, 0.0122], y: -0.006, z: -0.052 }, // 등의 타원 꼬리 (x ±0.029, y -0.06 ~ 0.048, z -0.064 ~ -0.04)
  ],
  hulaHamster: [{ half: [0.059, 0.022, 0.045], y: 0.023 }], // 머리 구보다 넓은 볼 쪽 (반폭 0.061, 가장 넓은 높이 0.023)
  hulaCat: [{ half: [0.059, 0.022, 0.044], y: 0.028 }], // 머리 구보다 넓은 볼 쪽 (반폭 0.061)
  hulaBunny: [
    { half: [0.059, 0.022, 0.05], y: 0.0345 }, // 머리 구보다 넓은 볼 쪽 (반폭 0.061, 가장 넓은 높이 0.0345)
    { half: [0.025, 0.0245, 0.0135], y: 0.1125 }, // 긴 귀 두 개 0.088 ~ 0.137 (좌우 끝 ±0.025)
    // 왼손 횃불 위쪽(불꽃 x -0.107 ~ -0.06, y 0.02 ~ 0.074): 몸통 구 밖으로 나온 부분이 옆 인형을 파고들지 않게
    { half: [0.024, 0.027, 0.012], x: -0.083, y: 0.047, z: 0.015 },
  ],
  hulaMomonga: [
    { half: [0.095, 0.034, 0.035], y: 0.031, z: 0.003 }, // 볼 옆 털 뭉치까지 (모델 좌우 끝 ±0.094, -0.008 ~ 0.07)
    { half: [0.067, 0.0225, 0.01], y: 0.1015, z: -0.004 }, // 크고 둥근 귀 두 개 0.079 ~ 0.124
  ],
};

// 집게가 붙잡는 높이: 기본은 머리, 호빵 우사기는 귀 아래쪽, 호빵 하치와레·치이카와는 머리 위쪽
const GRAB_Y = { keychainBunny: 0.1, keychainCat: 0.058, keychainHamster: 0.058, keychainMomonga: 0.058, hulaHamster: 0.055, hulaCat: 0.058, hulaBunny: 0.065, hulaMomonga: 0.065 };

/**
 * 인형 종류별 물리 치수.
 * @returns {{ top: number, grabY: number }} top: 충돌체 맨 위 높이, grabY: 집게가 붙잡는 높이
 */
export function dollProfile(type) {
  const spheres = BASE_SPHERES[type] ?? DEFAULT_SPHERES;
  const extras = EXTRA_SHAPES[type] ?? [];
  return {
    top: Math.max(...spheres.map((s) => s.y + s.r), ...extras.map((e) => e.y + e.half[1])),
    grabY: GRAB_Y[type] ?? DOLL_SHAPE.headOffsetY,
  };
}

/** 몸통 + 머리 구 두 개(+ 종류별 귀 상자)로 이루어진 인형 물리 바디 */
export function createDollBody(material, position, type) {
  const body = new CANNON.Body({
    mass: 0.12,
    material,
    position: new CANNON.Vec3(...position),
    linearDamping: 0.15,
    angularDamping: 0.5,
    collisionFilterGroup: GROUP.DOLL,
    collisionFilterMask: DOLL_MASK,
  });
  for (const { r, y } of BASE_SPHERES[type] ?? DEFAULT_SPHERES) {
    body.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, y, 0));
  }
  for (const { half, x = 0, y, z = 0 } of EXTRA_SHAPES[type] ?? []) {
    body.addShape(new CANNON.Box(new CANNON.Vec3(...half)), new CANNON.Vec3(x, y, z));
  }
  body.sleepSpeedLimit = 0.05;
  body.sleepTimeLimit = 0.4;
  return body;
}
