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
  { id: 'bear-brown', name: '갈색 곰', machineId: 'bear', type: 'bear', rarity: 'common', color: 0x9b6a43, sub: 0xe8c9a0 },
  { id: 'bear-white', name: '하얀 곰', machineId: 'bear', type: 'bear', rarity: 'common', color: 0xf3efe8, sub: 0xffd6e0 },
  { id: 'bear-pink', name: '핑크 곰', machineId: 'bear', type: 'bear', rarity: 'rare', color: 0xff8fc4, sub: 0xffffff },
  { id: 'bear-gold', name: '황금 곰', machineId: 'bear', type: 'bear', rarity: 'epic', color: 0xffc928, sub: 0xfff3b0, glow: true },

  // modelUrl에 public/models 의 .glb 경로를 넣으면 그 모델로 교체된다 (예: '/models/keychain-bunny.glb')
  { id: 'bunny-scarf', name: '목도리 토끼', machineId: 'bunny', type: 'keychainBunny', rarity: 'common', color: 0xf7e4d8, sub: 0xf3a9b8, modelUrl: null },
  { id: 'bunny-gray', name: '회색 토끼', machineId: 'bunny', type: 'bunny', rarity: 'common', color: 0xa8a8b8, sub: 0xf0f0f0 },
  { id: 'bunny-mint', name: '민트 토끼', machineId: 'bunny', type: 'bunny', rarity: 'rare', color: 0x8ff0d0, sub: 0xffffff },
  { id: 'bunny-galaxy', name: '우주 토끼', machineId: 'bunny', type: 'bunny', rarity: 'epic', color: 0x6c4dff, sub: 0x3de0ff, glow: true },

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
