import { PhysicsWorld } from './PhysicsWorld.js';
import { buildMachineColliders, isInChute, isOverChute } from './MachineColliders.js';
import { createDollBody } from './DollBody.js';
import { ClawController, CLAW_STATE } from './ClawController.js';
import { createDollMesh, disposeDollMesh } from '../three/DollFactory.js';
import { pickRandomDoll } from '../data/dolls.js';
import { MACHINE_SPEC, PLAY_FLOOR_Y } from '../three/machineSpec.js';
import { eventBus } from '../core/EventBus.js';

const INITIAL_DOLLS = 16;
const MIN_DOLLS = 10;
const SPAWN_RANGE = MACHINE_SPEC.innerHalf - 0.08;

/**
 * 기계 1대의 물리 세션: 충돌체 + 인형들 + 집게.
 * 발생 이벤트 (모두 payload에 machineId 포함):
 *   claw:state { state } / claw:grab { success, dollId } / claw:slip { dollId }
 *   claw:release { dollId } / claw:round-end / doll:won { dollId }
 */
export class ClawGame {
  constructor(machine) {
    this.machine = machine;
    this.machineId = machine.config.id;
    this.physics = new PhysicsWorld();
    this.dolls = [];

    buildMachineColliders(this.physics);
    this.claw = new ClawController({
      machine,
      physics: this.physics,
      getDolls: () => this.dolls,
      onEvent: (event, payload) => this.#emit(event, payload),
    });

    this.#spawnLayers(INITIAL_DOLLS);
    this.physics.settle(2.5);
  }

  update(dt) {
    this.claw.update(dt);
    this.physics.step(dt);
    this.#checkPrizes();
  }

  // ---------- 인형 ----------

  #spawnDoll(position) {
    const data = pickRandomDoll(this.machineId);
    const mesh = createDollMesh(data);
    const body = createDollBody(this.physics.materials.doll, position);
    body.quaternion.setFromEuler(Math.random() * 0.6 - 0.3, Math.random() * Math.PI * 2, Math.random() * 0.6 - 0.3);
    this.machine.group.add(mesh);
    this.physics.addBody(body, mesh);
    const doll = { data, body, mesh };
    this.dolls.push(doll);
    return doll;
  }

  #removeDoll(doll) {
    this.physics.removeBody(doll.body);
    this.machine.group.remove(doll.mesh);
    disposeDollMesh(doll.mesh);
    this.dolls.splice(this.dolls.indexOf(doll), 1);
  }

  /** 바닥부터 층층이 배치 (배출구 위 제외) */
  #spawnLayers(count) {
    const spacing = 0.15;
    const cells = [];
    for (let x = -SPAWN_RANGE; x <= SPAWN_RANGE + 1e-6; x += spacing) {
      for (let z = -SPAWN_RANGE; z <= SPAWN_RANGE + 1e-6; z += spacing) {
        if (!isOverChute(x, z, 0.1)) cells.push([x, z]);
      }
    }
    // 한쪽에 몰리지 않도록 칸 순서를 섞는다
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    for (let i = 0; i < count; i++) {
      const [x, z] = cells[i % cells.length];
      const layer = Math.floor(i / cells.length);
      const jitter = () => (Math.random() - 0.5) * 0.03;
      this.#spawnDoll([x + jitter(), PLAY_FLOOR_Y + 0.08 + layer * 0.17, z + jitter()]);
    }
  }

  /** 인형이 줄어들면 위에서 떨어뜨려 채운다 */
  #refill() {
    while (this.dolls.length < MIN_DOLLS) {
      let x, z;
      do {
        x = (Math.random() * 2 - 1) * SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * SPAWN_RANGE;
      } while (isOverChute(x, z, 0.1));
      this.#spawnDoll([x, PLAY_FLOOR_Y + 0.6, z]);
    }
  }

  #checkPrizes() {
    for (const doll of [...this.dolls]) {
      const p = doll.body.position;
      if (isInChute(p)) {
        this.#removeDoll(doll);
        this.#emit('doll:won', { dollId: doll.data.id });
      } else if (p.y < 0) {
        // 혹시 기계 밖으로 빠진 경우
        this.#removeDoll(doll);
      }
    }
    if (this.claw.state === CLAW_STATE.IDLE && this.dolls.length < MIN_DOLLS) this.#refill();
  }

  #emit(event, payload = {}) {
    eventBus.emit(event, { machineId: this.machineId, ...payload });
  }
}
