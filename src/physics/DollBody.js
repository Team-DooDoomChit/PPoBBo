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
};

/**
 * 몸통·머리 구 위로 크게 튀어나오는 부분(귀)에 붙이는 상자 충돌체.
 * half: 상자 반크기 [x, y, z], y: 중심 높이 (인형 원점 기준). 모델(DollFactory)의 치수와 맞춘다.
 */
const EXTRA_SHAPES = {
  bunny: [{ half: [0.038, 0.045, 0.012], y: 0.165 }], // 귀 0.12 ~ 0.21
  keychainBunny: [{ half: [0.033, 0.033, 0.016], y: 0.112 }], // 귀 0.079 ~ 0.145
  keychainCat: [{ half: [0.044, 0.008, 0.009], y: 0.083 }], // 귀 끝 0.075 ~ 0.091
  keychainMomonga: [
    { half: [0.087, 0.03, 0.026], y: 0.013 }, // 볼 옆 털 뭉치 (좌우 끝 ±0.087, -0.017 ~ 0.043)
    { half: [0.064, 0.0104, 0.008], y: 0.0943 }, // 크고 둥근 귀 두 개 중 머리 위로 나온 부분 (0.084 ~ 0.1047)
  ],
  hulaHamster: [{ half: [0.059, 0.022, 0.045], y: 0.023 }], // 머리 구보다 넓은 볼 쪽 (반폭 0.061, 가장 넓은 높이 0.023)
  hulaCat: [{ half: [0.059, 0.022, 0.044], y: 0.028 }], // 머리 구보다 넓은 볼 쪽 (반폭 0.061)
};

// 집게가 붙잡는 높이: 기본은 머리, 호빵 우사기는 귀 아래쪽, 호빵 하치와레·치이카와는 머리 위쪽
const GRAB_Y = { keychainBunny: 0.1, keychainCat: 0.058, keychainHamster: 0.058, keychainMomonga: 0.058, hulaHamster: 0.055, hulaCat: 0.058 };

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
  for (const { half, y } of EXTRA_SHAPES[type] ?? []) {
    body.addShape(new CANNON.Box(new CANNON.Vec3(...half)), new CANNON.Vec3(0, y, 0));
  }
  body.sleepSpeedLimit = 0.05;
  body.sleepTimeLimit = 0.4;
  return body;
}
