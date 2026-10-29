import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MACHINES } from '../../src/data/machines.js';
import { getDollsByMachine, getDoll } from '../../src/data/dolls.js';

// 등급별 인형 수: 뽑힐 확률과 집기 난이도(grip)가 등급으로 정해지므로, 구성이 같으면 난이도도 같다
const rarityCount = (machineId) =>
  getDollsByMachine(machineId).reduce((acc, d) => ({ ...acc, [d.rarity]: (acc[d.rarity] ?? 0) + 1 }), {});

test('모든 기계의 가격이 100으로 같다', () => {
  for (const m of MACHINES) assert.equal(m.price, 100, m.id);
});

test('모든 기계의 등급 구성이 같다 (일반 2 · 레어 1 · 에픽 1)', () => {
  for (const m of MACHINES) assert.deepEqual(rarityCount(m.id), { common: 2, rare: 1, epic: 1 }, m.id);
});

test('목도리 토끼는 토끼 정원의 기본(첫 번째) 일반 인형이다', () => {
  assert.equal(getDoll('bunny-scarf').rarity, 'common');
  assert.equal(getDollsByMachine('bunny')[0].id, 'bunny-scarf');
});
