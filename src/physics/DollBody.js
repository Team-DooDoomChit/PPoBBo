import * as CANNON from 'cannon-es';
import { DOLL_SHAPE } from '../three/DollFactory.js';
import { GROUP } from './PhysicsWorld.js';

export const DOLL_MASK = GROUP.STATIC | GROUP.DOLL | GROUP.CLAW;
export const HELD_DOLL_MASK = GROUP.STATIC | GROUP.DOLL;

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
};

// 집게가 붙잡는 높이: 기본은 머리, 목도리 토끼는 귀 (체인 쪽을 집게가 감싼다)
const GRAB_Y = { keychainBunny: 0.17 };

const BASE_TOP = DOLL_SHAPE.headOffsetY + DOLL_SHAPE.headRadius;

/**
 * 인형 종류별 물리 치수.
 * @returns {{ top: number, grabY: number }} top: 충돌체 맨 위 높이, grabY: 집게가 붙잡는 높이
 */
export function dollProfile(type) {
  const extras = EXTRA_SHAPES[type] ?? [];
  return {
    top: Math.max(BASE_TOP, ...extras.map((e) => e.y + e.half[1])),
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
  body.addShape(new CANNON.Sphere(DOLL_SHAPE.bodyRadius));
  body.addShape(new CANNON.Sphere(DOLL_SHAPE.headRadius), new CANNON.Vec3(0, DOLL_SHAPE.headOffsetY, 0));
  for (const { half, y } of EXTRA_SHAPES[type] ?? []) {
    body.addShape(new CANNON.Box(new CANNON.Vec3(...half)), new CANNON.Vec3(0, y, 0));
  }
  body.sleepSpeedLimit = 0.05;
  body.sleepTimeLimit = 0.4;
  return body;
}
