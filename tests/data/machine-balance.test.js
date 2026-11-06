import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MACHINES } from '../../src/data/machines.js';
import { getDollsByMachine, getDoll } from '../../src/data/dolls.js';

// 등급별 인형 수: 뽑힐 확률과 집기 난이도(grip)가 등급으로 정해진다
const rarityCount = (machineId) =>
  getDollsByMachine(machineId).reduce((acc, d) => ({ ...acc, [d.rarity]: (acc[d.rarity] ?? 0) + 1 }), {});

test('모든 기계의 가격이 100으로 같다', () => {
  for (const m of MACHINES) assert.equal(m.price, 100, m.id);
});

test('병아리 농장은 일반 2개, 레어·에픽 1개씩', () => {
  assert.deepEqual(rarityCount('chick'), { common: 2, rare: 1, epic: 1 });
});

test('인어섬 시리즈는 인어섬 치이카와·하치와레·우사기·모몽가 4종, 모두 일반', () => {
  assert.equal(MACHINES.find((m) => m.id === 'bear').name, '인어섬 시리즈');
  assert.deepEqual(getDollsByMachine('bear').map((d) => d.id), ['hamster-hula', 'cat-hula', 'bunny-hula', 'momonga-hula']);
  assert.deepEqual(rarityCount('bear'), { common: 4 });
});

test('치이카와 겨울 시리즈는 호빵 우사기(기본)·하치와레·치이카와 3종, 모두 일반', () => {
  assert.equal(MACHINES.find((m) => m.id === 'bunny').name, '치이카와 겨울 시리즈');
  assert.deepEqual(getDollsByMachine('bunny').map((d) => d.id), ['bunny-scarf', 'cat-scarf', 'hamster-scarf']);
  assert.deepEqual(rarityCount('bunny'), { common: 3 });
});
