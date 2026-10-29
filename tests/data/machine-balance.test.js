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

test('곰돌이 하우스·병아리 농장은 일반 2개, 레어·에픽 1개씩', () => {
  for (const id of ['bear', 'chick']) assert.deepEqual(rarityCount(id), { common: 2, rare: 1, epic: 1 }, id);
});

test('치이카와 겨울 시리즈는 목도리 토끼(기본)·고양이·햄스터 3종, 모두 일반', () => {
  assert.equal(MACHINES.find((m) => m.id === 'bunny').name, '치이카와 겨울 시리즈');
  assert.deepEqual(getDollsByMachine('bunny').map((d) => d.id), ['bunny-scarf', 'cat-scarf', 'hamster-scarf']);
  assert.deepEqual(rarityCount('bunny'), { common: 3 });
});
