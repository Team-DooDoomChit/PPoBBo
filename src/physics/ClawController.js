import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { MACHINE_SPEC } from '../three/machineSpec.js';
import { RARITY } from '../data/dolls.js';
import { GROUP } from './PhysicsWorld.js';
import { DOLL_MASK, HELD_DOLL_MASK } from './DollBody.js';

const { claw: CLAW } = MACHINE_SPEC;

export const CLAW_STATE = {
  IDLE: 'idle', // 코인 대기 (홈 위치)
  READY: 'ready', // 플레이어가 집게를 움직이는 중
  DESCENDING: 'descending',
  GRABBING: 'grabbing',
  ASCENDING: 'ascending',
  RETURNING: 'returning',
  RELEASING: 'releasing',
};

const MOVE_SPEED = 0.32; // m/s
const DROP_SPEED = 0.35;
const LIFT_SPEED = 0.28;
const RETURN_SPEED = 0.3;
const CLOSE_TIME = 0.6;
const RELEASE_TIME = 0.9;
const HEAD_BOTTOM = 0.06; // 집게 머리 원점 → 머리 아래면
const PRONG_REACH = 0.1; // 머리 아래면에서 이 거리 안에 물체가 닿으면 하강을 멈춘다
const GRAB_RADIUS = 0.1; // 수평으로 이 거리 안의 인형만 집을 수 있다
export const PLAY_TIME = 20;

/**
 * 집게 상태 머신 + 물리.
 * - 집게 머리는 키네마틱 바디라 하강할 때 인형을 밀어낸다.
 * - 집은 인형은 PointToPointConstraint로 매달려 흔들린다 (무게감).
 * - 등급(grip)과 중심에서 벗어난 정도에 따라 집기 실패 / 운반 중 미끄러짐이 발생한다.
 */
export class ClawController {
  #ray = new CANNON.RaycastResult();
  #stateTime = 0;
  #moveInput = { x: 0, y: 0 };
  #held = null; // { doll, constraint, grip, offset }
  #prongOpen = 0;
  #grabTried = false;

  constructor({ machine, physics, getDolls, onEvent }) {
    this.machine = machine;
    this.physics = physics;
    this.getDolls = getDolls;
    this.onEvent = onEvent;

    this.x = CLAW.home.x;
    this.z = CLAW.home.z;
    this.cable = CLAW.minCable;
    this.state = CLAW_STATE.IDLE;
    this.timeLeft = 0;

    this.body = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Sphere(0.05),
      collisionFilterGroup: GROUP.CLAW,
      collisionFilterMask: GROUP.DOLL,
    });
    this.body.position.copy(this.#headBottom());
    physics.addBody(this.body);
  }

  get isPlaying() {
    return this.state !== CLAW_STATE.IDLE;
  }

  /** 코인 투입 후 라운드 시작 */
  startRound() {
    if (this.state !== CLAW_STATE.IDLE) return false;
    this.timeLeft = PLAY_TIME;
    this.#setState(CLAW_STATE.READY);
    return true;
  }

  /** x, y: -1 ~ 1 (y > 0 = 안쪽으로) */
  setMoveInput(x, y) {
    this.#moveInput.x = THREE.MathUtils.clamp(x, -1, 1);
    this.#moveInput.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  /** 하강 버튼 / 주먹 쥐기 */
  drop() {
    if (this.state !== CLAW_STATE.READY) return false;
    this.#setState(CLAW_STATE.DESCENDING);
    return true;
  }

  update(dt) {
    this.#stateTime += dt;
    const prev = this.#headBottom();

    switch (this.state) {
      case CLAW_STATE.READY:
        this.#updateReady(dt);
        break;
      case CLAW_STATE.DESCENDING:
        this.#updateDescending(dt);
        break;
      case CLAW_STATE.GRABBING:
        this.#updateGrabbing();
        break;
      case CLAW_STATE.ASCENDING:
        this.cable = Math.max(CLAW.minCable, this.cable - LIFT_SPEED * dt);
        this.#checkSlip(dt, 1.4); // 끌어올릴 때 더 잘 미끄러진다
        if (this.cable <= CLAW.minCable) this.#setState(CLAW_STATE.RETURNING);
        break;
      case CLAW_STATE.RETURNING:
        this.#updateReturning(dt);
        break;
      case CLAW_STATE.RELEASING:
        this.#updateReleasing();
        break;
    }

    this.#applyToBody(prev, dt);
    this.#applyToModel();
  }

  // ---------- 상태별 처리 ----------

  #updateReady(dt) {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.x = THREE.MathUtils.clamp(this.x + this.#moveInput.x * MOVE_SPEED * dt, -CLAW.range, CLAW.range);
    this.z = THREE.MathUtils.clamp(this.z - this.#moveInput.y * MOVE_SPEED * dt, -CLAW.range, CLAW.range);
    if (this.timeLeft <= 0) this.#setState(CLAW_STATE.DESCENDING);
  }

  #updateDescending(dt) {
    this.#prongOpen = Math.min(1, this.#prongOpen + dt * 3);
    this.cable = Math.min(CLAW.maxCable, this.cable + DROP_SPEED * dt);

    const from = this.#headBottom();
    const to = new CANNON.Vec3(from.x, from.y - 1, from.z);
    this.#ray.reset();
    this.physics.world.raycastClosest(
      from,
      to,
      { collisionFilterMask: GROUP.STATIC | GROUP.DOLL, skipBackfaces: true },
      this.#ray,
    );
    const blocked = this.#ray.hasHit && this.#ray.distance <= PRONG_REACH;
    if (blocked || this.cable >= CLAW.maxCable) this.#setState(CLAW_STATE.GRABBING);
  }

  #updateGrabbing() {
    const t = Math.min(this.#stateTime / CLOSE_TIME, 1);
    // 인형을 잡았으면 완전히 닫히지 않는다
    const closedTo = this.#held ? 0.35 : 0;
    this.#prongOpen = THREE.MathUtils.lerp(1, closedTo, t);

    if (t >= 0.5 && !this.#held && !this.#grabTried) {
      this.#grabTried = true;
      this.#tryGrab();
    }
    if (t >= 1) this.#setState(CLAW_STATE.ASCENDING);
  }

  #updateReturning(dt) {
    const dx = CLAW.home.x - this.x;
    const dz = CLAW.home.z - this.z;
    const dist = Math.hypot(dx, dz);
    const step = RETURN_SPEED * dt;
    if (dist <= step) {
      this.x = CLAW.home.x;
      this.z = CLAW.home.z;
      this.#setState(CLAW_STATE.RELEASING);
    } else {
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
    }
    this.#checkSlip(dt, 1);
  }

  #updateReleasing() {
    const t = Math.min(this.#stateTime / RELEASE_TIME, 1);
    this.#prongOpen = t < 0.5 ? t * 2 : 2 - t * 2;
    if (t >= 0.2 && this.#held) this.#release('drop');
    if (t >= 1) {
      this.#prongOpen = 0;
      this.#setState(CLAW_STATE.IDLE);
      this.onEvent('claw:round-end', {});
    }
  }

  // ---------- 집기 / 놓기 ----------

  #tryGrab() {
    const head = this.#headBottom();
    let best = null;
    for (const doll of this.getDolls()) {
      const p = doll.body.position;
      const offset = Math.hypot(p.x - head.x, p.z - head.z);
      const below = head.y - p.y;
      if (offset < GRAB_RADIUS && below > 0 && below < 0.35 && (!best || offset < best.offset)) {
        best = { doll, offset };
      }
    }
    if (!best) {
      this.onEvent('claw:grab', { success: false, dollId: null });
      return;
    }

    const grip = RARITY[best.doll.data.rarity].grip;
    const centered = 1 - best.offset / GRAB_RADIUS;
    const chance = grip * Math.pow(centered, 0.6);
    const success = Math.random() < chance;
    this.onEvent('claw:grab', { success, dollId: best.doll.data.id, chance });
    if (!success) return;

    const { body } = best.doll;
    // 인형 머리 근처를 잡는다. 집게 기준 피벗은 현재 위치 그대로 → 처음엔 튀지 않고, 들어 올리면 매달려 흔들린다.
    const grabPoint = body.pointToWorldFrame(new CANNON.Vec3(0, 0.09, 0));
    const pivotA = this.body.pointToLocalFrame(grabPoint);
    const pivotB = body.pointToLocalFrame(grabPoint);
    const constraint = new CANNON.PointToPointConstraint(this.body, pivotA, body, pivotB, 5);

    body.wakeUp();
    body.collisionFilterMask = HELD_DOLL_MASK;
    this.physics.world.addConstraint(constraint);
    this.#held = { doll: best.doll, constraint, grip, offset: best.offset };
  }

  #checkSlip(dt, factor) {
    if (!this.#held) return;
    const { grip, offset } = this.#held;
    const slipPerSecond = ((1 - grip) * 0.45 + (offset / GRAB_RADIUS) * 0.35) * factor;
    if (Math.random() < slipPerSecond * dt) this.#release('slip');
  }

  #release(reason) {
    const { doll, constraint } = this.#held;
    this.physics.world.removeConstraint(constraint);
    doll.body.collisionFilterMask = DOLL_MASK;
    doll.body.wakeUp();
    this.#held = null;
    this.onEvent(reason === 'slip' ? 'claw:slip' : 'claw:release', { dollId: doll.data.id });
  }

  // ---------- 동기화 ----------

  #setState(state) {
    this.state = state;
    this.#stateTime = 0;
    this.#grabTried = false;
    this.onEvent('claw:state', { state });
  }

  #headBottom() {
    return new CANNON.Vec3(this.x, CLAW.railY - this.cable - HEAD_BOTTOM, this.z);
  }

  #applyToBody(prev, dt) {
    const next = this.#headBottom();
    this.body.position.copy(next);
    if (dt > 0) this.body.velocity.set((next.x - prev.x) / dt, (next.y - prev.y) / dt, (next.z - prev.z) / dt);
  }

  #applyToModel() {
    this.machine.setClawPosition(this.x, this.z);
    this.machine.setCableLength(this.cable);
    this.machine.setProngOpen(this.#prongOpen);
  }
}
