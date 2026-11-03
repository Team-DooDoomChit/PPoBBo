import { MACHINE_SPEC, PLAY_FLOOR_Y, GLASS_TOP_Y } from '../three/machineSpec.js';
import { GROUP } from './PhysicsWorld.js';

const { innerHalf, chute } = MACHINE_SPEC;
const WALL = 0.02; // 충돌체 반두께
const CHUTE_GUARD_HEIGHT = 0.32;

/**
 * 기계 내부의 정적 충돌체: 바닥(배출구 구멍 제외), 유리 벽, 천장, 배출구 칸막이.
 * ClawMachine.#buildPlayFloor 의 외형과 같은 L자 형태를 쓴다.
 */
export function buildMachineColliders(physics) {
  const floorY = PLAY_FLOOR_Y - WALL;

  // 바닥: 배출구 뒤쪽 전체 + 배출구 왼쪽
  const backDepth = chute.minZ + innerHalf;
  physics.addStaticBox([innerHalf, WALL, backDepth / 2], [0, floorY, (chute.minZ - innerHalf) / 2]);
  const frontWidth = chute.minX + innerHalf;
  const frontDepth = innerHalf - chute.minZ;
  physics.addStaticBox([frontWidth / 2, WALL, frontDepth / 2], [(chute.minX - innerHalf) / 2, floorY, (chute.minZ + innerHalf) / 2]);

  // 유리 벽
  const h = (GLASS_TOP_Y - PLAY_FLOOR_Y) / 2;
  const cy = PLAY_FLOOR_Y + h;
  const outer = innerHalf + WALL;
  physics.addStaticBox([outer, h, WALL], [0, cy, outer]);
  physics.addStaticBox([outer, h, WALL], [0, cy, -outer]);
  physics.addStaticBox([WALL, h, outer], [outer, cy, 0]);
  physics.addStaticBox([WALL, h, outer], [-outer, cy, 0]);

  // 천장
  physics.addStaticBox([outer, WALL, outer], [0, GLASS_TOP_Y + WALL, 0]);

  // 배출구 칸막이 (인형이 굴러 들어가지 않도록). 쌓인 인형이 넘어 들어가지 않게 보이는 칸막이보다 높게 둔다.
  // 집게에 매달린 인형은 이보다 훨씬 높은 곳에서 옮기므로 걸리지 않는다
  // 보이는 높이 위쪽은 CHUTE_GUARD 그룹이라, 칸막이 바로 위로 내려온 집게는 보이는 칸막이 끝에서 멈춘다
  const chuteDepth = chute.maxZ - chute.minZ;
  const chuteWidth = chute.maxX - chute.minX;
  const parts = [
    { bottom: 0, top: chute.wallHeight, group: GROUP.STATIC },
    { bottom: chute.wallHeight, top: CHUTE_GUARD_HEIGHT, group: GROUP.CHUTE_GUARD },
  ];
  for (const { bottom, top, group } of parts) {
    const wh = (top - bottom) / 2;
    const y = PLAY_FLOOR_Y + bottom + wh;
    physics.addStaticBox([0.005, wh, chuteDepth / 2], [chute.minX, y, (chute.minZ + chute.maxZ) / 2], group);
    physics.addStaticBox([chuteWidth / 2, wh, 0.005], [(chute.minX + chute.maxX) / 2, y, chute.minZ], group);
  }
}

/** 인형이 배출구로 떨어졌는지 (로컬 좌표) */
export function isInChute(pos) {
  return pos.x > chute.minX && pos.x < chute.maxX && pos.z > chute.minZ && pos.z < chute.maxZ && pos.y < PLAY_FLOOR_Y - 0.1;
}

/** 배출구 영역 위인지 (인형 배치 시 제외용, 여유 margin 포함) */
export function isOverChute(x, z, margin = 0) {
  return x > chute.minX - margin && z > chute.minZ - margin;
}
