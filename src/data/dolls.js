/**
 * 인형 카탈로그 (도감 전체 목록).
 * type: 3D 모델 형태 / rarity: 등장 확률과 집게 그립(무게감)에 영향
 */
export const RARITY = {
  common: { label: '일반', weight: 60, grip: 0.9, color: '#a99fd0' },
  rare: { label: '레어', weight: 30, grip: 0.72, color: '#3de0ff' },
  epic: { label: '에픽', weight: 10, grip: 0.5, color: '#ffd23f' },
};

export const DOLLS = [
  // 인어섬 시리즈 (기계 id 'bear'): 꽃 화관 + 풀 치마 인형 (#49, #53)
  { id: 'hamster-hula', name: '인어섬 치이카와', machineId: 'bear', type: 'hulaHamster', rarity: 'common', color: 0xfbfbfd, sub: 0xf3e0ee },
  { id: 'cat-hula', name: '인어섬 하치와레', machineId: 'bear', type: 'hulaCat', rarity: 'common', color: 0xfbfbfd, sub: 0x8fa3ea },
  { id: 'bunny-hula', name: '인어섬 우사기', machineId: 'bear', type: 'hulaBunny', rarity: 'common', color: 0xf5ebdf, sub: 0xeec3d2 }, // #59
  { id: 'momonga-hula', name: '인어섬 모몽가', machineId: 'bear', type: 'hulaMomonga', rarity: 'common', color: 0xfafafc, sub: 0xdde8f6 }, // #65

  // modelUrl에 public/models 의 .glb 경로를 넣으면 그 모델로 교체된다 (예: '/models/keychain-bunny.glb')
  { id: 'bunny-scarf', name: '호빵 우사기', machineId: 'bunny', type: 'keychainBunny', rarity: 'common', color: 0xf7e4d8, sub: 0xf3a9b8, modelUrl: null },
  { id: 'cat-scarf', name: '호빵 하치와레', machineId: 'bunny', type: 'keychainCat', rarity: 'common', color: 0xf7f8fc, sub: 0x8badea, modelUrl: null },
  { id: 'hamster-scarf', name: '호빵 치이카와', machineId: 'bunny', type: 'keychainHamster', rarity: 'common', color: 0xf8f8fb, sub: 0xe88ba0, modelUrl: null },
  { id: 'momonga-scarf', name: '호빵 모몽가', machineId: 'bunny', type: 'keychainMomonga', rarity: 'common', color: 0xfafafc, sub: 0xd5e4f5, modelUrl: null }, // #73

  { id: 'chick-yellow', name: '노랑 병아리', machineId: 'chick', type: 'chick', rarity: 'common', color: 0xffe14d, sub: 0xff9a2e },
  { id: 'chick-cotton', name: '솜 병아리', machineId: 'chick', type: 'chick', rarity: 'common', color: 0xfff8e8, sub: 0xffb02e },
  { id: 'cat-black', name: '까만 고양이', machineId: 'chick', type: 'cat', rarity: 'rare', color: 0x2a2a35, sub: 0xffd23f },
  { id: 'chick-rainbow', name: '무지개 병아리', machineId: 'chick', type: 'chick', rarity: 'epic', color: 0xff6fd8, sub: 0x3de0ff, glow: true },
];

export const getDoll = (id) => DOLLS.find((d) => d.id === id);
export const getDollsByMachine = (machineId) => DOLLS.filter((d) => d.machineId === machineId);

/** 등급 가중치에 따라 기계의 인형 하나를 무작위로 고른다. */
export function pickRandomDoll(machineId, random = Math.random) {
  const pool = getDollsByMachine(machineId);
  const total = pool.reduce((sum, d) => sum + RARITY[d.rarity].weight, 0);
  let r = random() * total;
  for (const doll of pool) {
    r -= RARITY[doll.rarity].weight;
    if (r <= 0) return doll;
  }
  return pool[pool.length - 1];
}
