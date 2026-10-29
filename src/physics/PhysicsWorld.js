import * as CANNON from 'cannon-es';

/** 충돌 그룹 (collisionFilterGroup / Mask 용 비트) */
export const GROUP = {
  STATIC: 1,
  DOLL: 2,
  CLAW: 4,
};

const FIXED_STEP = 1 / 120;
const MAX_SUB_STEPS = 6;

/**
 * cannon-es World 래퍼.
 * 바디와 Three.js 오브젝트를 link() 해두면 step() 후 위치/회전이 동기화된다.
 * 좌표계는 기계 로컬 좌표를 그대로 쓴다 (메시는 기계 그룹의 자식).
 */
export class PhysicsWorld {
  #links = new Map();

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;

    this.materials = {
      doll: new CANNON.Material('doll'),
      static: new CANNON.Material('static'),
    };
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.materials.doll, this.materials.doll, { friction: 0.6, restitution: 0.05 }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.materials.doll, this.materials.static, { friction: 0.45, restitution: 0.1 }),
    );
  }

  addStaticBox(halfExtents, position) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.materials.static,
      shape: new CANNON.Box(new CANNON.Vec3(...halfExtents)),
      position: new CANNON.Vec3(...position),
      collisionFilterGroup: GROUP.STATIC,
      collisionFilterMask: GROUP.DOLL,
    });
    this.world.addBody(body);
    return body;
  }

  addBody(body, object3d) {
    this.world.addBody(body);
    if (object3d) this.#links.set(body, object3d);
  }

  removeBody(body) {
    this.world.removeBody(body);
    this.#links.delete(body);
  }

  step(dt) {
    this.world.step(FIXED_STEP, dt, MAX_SUB_STEPS);
    this.#sync();
  }

  /** 화면에 그리기 전 미리 시뮬레이션해서 인형이 쌓인 상태로 만든다. */
  settle(seconds) {
    const steps = Math.ceil(seconds / FIXED_STEP);
    for (let i = 0; i < steps; i++) this.world.step(FIXED_STEP);
    this.#sync();
  }

  #sync() {
    this.#links.forEach((object3d, body) => {
      object3d.position.copy(body.position);
      object3d.quaternion.copy(body.quaternion);
    });
  }
}
