import * as CANNON from 'cannon-es';
import { DOLL_SHAPE } from '../three/DollFactory.js';
import { GROUP } from './PhysicsWorld.js';

export const DOLL_MASK = GROUP.STATIC | GROUP.DOLL | GROUP.CLAW;
export const HELD_DOLL_MASK = GROUP.STATIC | GROUP.DOLL;

/** 몸통 + 머리 두 개의 구로 이루어진 인형 물리 바디 */
export function createDollBody(material, position) {
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
  body.sleepSpeedLimit = 0.05;
  body.sleepTimeLimit = 0.4;
  return body;
}
