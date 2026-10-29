import * as CANNON from 'cannon-es';
import { DOLL_SHAPE } from '../three/DollFactory.js';
import { GROUP } from './PhysicsWorld.js';

export const DOLL_MASK = GROUP.STATIC | GROUP.DOLL | GROUP.CLAW;
export const HELD_DOLL_MASK = GROUP.STATIC | GROUP.DOLL;

/**
 * 몸통·머리 구 { r: 반지름, y: 중심 높이 }. 기본은 DOLL_SHAPE,
 * 목도리 햄스터는 머리가 낮고 넓어서(반폭 0.078, 중심 0.036) 따로 둔다.
 */
const DEFAULT_SPHERES = [
  { r: DOLL_SHAPE.bodyRadius, y: 0 },
  { r: DOLL_SHAPE.headRadius, y: DOLL_SHAPE.headOffsetY },
];
const BASE_SPHERES = {
  keychainHamster: [
    { r: 0.048, y: -0.022 }, // 몸통 (발 바닥 -0.07)
    { r: 0.068, y: 0.036 }, // 머리 (위쪽 끝 0.104)
  ],
};

/**
 * 몸통·머리 구 위로 크게 튀어나오는 부분(귀, 키링 체인)에 붙이는 상자 충돌체.
 * half: 상자 반크기 [x, y, z], y: 중심 높이 (인형 원점 기준). 모델(DollFactory)의 치수와 맞춘다.
 */
const EXTRA_SHAPES = {
  bunny: [{ half: [0.038, 0.045, 0.012], y: 0.165 }], // 귀 0.12 ~ 0.21
  keychainBunny: [
    { half: [0.033, 0.04, 0.016], y: 0.154 }, // 귀 0.114 ~ 0.194
    { half: [0.02, 0.028, 0.005], y: 0.222 }, // 볼체인 0.194 ~ 0.25
  ],
  keychainCat: [
    { half: [0.056, 0.02, 0.014], y: 0.122 }, // 귀 0.102 ~ 0.142
    { half: [0.014, 0.04, 0.005], y: 0.178 }, // 볼체인 0.138 ~ 0.218
  ],
  keychainHamster: [{ half: [0.058, 0.0125, 0.012], y: 0.1 }], // 귀 0.0875 ~ 0.1125
};

// 집게가 붙잡는 높이: 기본은 머리, 목도리 토끼는 귀, 목도리 고양이는 정수리 (체인 쪽을 집게가 감싼다), 햄스터는 머리
const GRAB_Y = { keychainBunny: 0.17, keychainCat: 0.125, keychainHamster: 0.045 };

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

/** 몸통 + 머리 구 두 개(+ 종류별 귀·체인 상자)로 이루어진 인형 물리 바디 */
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
