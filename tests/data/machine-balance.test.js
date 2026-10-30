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

test('모든 기계에 레어·에픽이 1개씩 있다 (토끼 정원만 일반 인형이 하나 더 많다)', () => {
  for (const m of MACHINES) {
    const common = m.id === 'bunny' ? 3 : 2;
    assert.deepEqual(rarityCount(m.id), { common, rare: 1, epic: 1 }, m.id);
  }
});

test('목도리 토끼는 토끼 정원의 기본(첫 번째) 일반 인형이다', () => {
  assert.equal(getDoll('bunny-scarf').rarity, 'common');
  assert.equal(getDollsByMachine('bunny')[0].id, 'bunny-scarf');
});

test('목도리 고양이는 토끼 정원의 일반 인형이다', () => {
  assert.equal(getDoll('cat-scarf').machineId, 'bunny');
  assert.equal(getDoll('cat-scarf').rarity, 'common');
});
