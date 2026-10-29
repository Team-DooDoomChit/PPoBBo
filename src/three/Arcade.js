import * as THREE from 'three';
import { ArcadeRoom } from './ArcadeRoom.js';
import { ClawMachine } from './ClawMachine.js';
import { setupLighting } from './Lighting.js';
import { MACHINES } from '../data/machines.js';

const OVERVIEW = {
  position: new THREE.Vector3(0, 2.4, 4.2),
  target: new THREE.Vector3(0, 1.1, -1.2),
};

// 기계 클로즈업 시점 (기계 위치 기준 오프셋)
const FOCUS = {
  position: new THREE.Vector3(0, 1.7, 1.85),
  target: new THREE.Vector3(0, 1.25, 0),
};

/**
 * 오락실 전체(방 + 조명 + 기계들)와 카메라 시점 전환을 담당한다.
 */
export class Arcade {
  #raycaster = new THREE.Raycaster();
  #pointer = new THREE.Vector2();

  constructor(sceneManager) {
    this.sm = sceneManager;
    this.room = new ArcadeRoom();
    this.lights = setupLighting(sceneManager.scene);
    this.machines = new Map(MACHINES.map((config) => [config.id, new ClawMachine(config)]));
    this.focusedMachine = null;

    sceneManager.scene.add(this.room.group);
    this.machines.forEach((m) => {
      sceneManager.scene.add(m.group);
      m.loadExternalModel();
    });

    sceneManager.camera.position.copy(OVERVIEW.position);
    sceneManager.controls.target.copy(OVERVIEW.target);
  }

  getMachine(id) {
    return this.machines.get(id);
  }

  /** 오락실 전체 시점 */
  async focusOverview(duration = 1.2) {
    this.focusedMachine = null;
    this.sm.setControlLimits({ minDistance: 2, maxDistance: 7 });
    await this.sm.moveCamera(OVERVIEW.position, OVERVIEW.target, duration);
  }

  /** 기계 정면 시점 (선택 화면에서 미리보기용) */
  async previewMachine(id, duration = 0.9) {
    const machine = this.machines.get(id);
    const base = machine.group.position;
    await this.sm.moveCamera(
      base.clone().add(new THREE.Vector3(0, 1.6, 2.6)),
      base.clone().add(new THREE.Vector3(0, 1.2, 0)),
      duration,
    );
  }

  /** 기계 클로즈업 시점 (게임 플레이) */
  async focusMachine(id, duration = 1.2) {
    const machine = this.machines.get(id);
    this.focusedMachine = machine;
    const base = machine.group.position;
    const target = base.clone().add(FOCUS.target);
    this.sm.setControlLimits({
      minDistance: 1.0,
      maxDistance: 2.6,
      minPolarAngle: 0.5,
      maxPolarAngle: Math.PI / 2 - 0.1,
      minAzimuthAngle: -0.7,
      maxAzimuthAngle: 0.7,
    });
    await this.sm.moveCamera(base.clone().add(FOCUS.position), target, duration);
  }

  /** 기계 코인 투입구의 화면 정규화 좌표 { x, y } (0~1, 좌상단 원점) */
  getCoinSlotScreenPosition(machine = this.focusedMachine) {
    if (!machine) return null;
    const p = machine.coinSlot.getWorldPosition(new THREE.Vector3()).project(this.sm.camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }

  /** 화면 좌표(clientX/Y)에 있는 기계를 찾는다. 없으면 null */
  pickMachine(clientX, clientY) {
    this.#pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.#raycaster.setFromCamera(this.#pointer, this.sm.camera);
    const groups = [...this.machines.values()].map((m) => m.group);
    const hit = this.#raycaster.intersectObjects(groups, true)[0];
    if (!hit) return null;

    let obj = hit.object;
    while (obj && !obj.userData.machineId) obj = obj.parent;
    return obj ? this.machines.get(obj.userData.machineId) : null;
  }
}
