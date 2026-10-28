import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { eventBus } from '../../src/core/EventBus.js';
import { useStorageBackend, save, load } from '../../src/logic/storage.js';
import { setClock } from '../../src/logic/clock.js';
import { collection } from '../../src/logic/collection.js';
import { DOLLS, getDollsByMachine } from '../../src/data/dolls.js';

let t = 1_000;
beforeEach(() => {
  useStorageBackend();
  t = 1_000;
  setClock(() => t);
});

test('처음엔 비어 있다', () => {
  assert.deepEqual(collection.getCollection(), {});
  assert.deepEqual(collection.getStats(), { owned: 0, total: DOLLS.length, rate: 0 });
});

test('처음 얻으면 새 인형으로 저장', () => {
  const r = collection.addDoll('bear-brown');
  assert.equal(r.ok, true);
  assert.equal(r.isNew, true);
  assert.deepEqual(collection.getCollection()['bear-brown'], { count: 1, obtainedAt: 1000, lastObtainedAt: 1000 });
});

test('중복 획득 시 개수 증가, 첫 획득 시각은 유지', () => {
  collection.addDoll('bear-brown');
  t = 5_000;
  const r = collection.addDoll('bear-brown');
  assert.equal(r.isNew, false);
  assert.deepEqual(r.entry, { count: 2, obtainedAt: 1000, lastObtainedAt: 5000 });
});

test('카탈로그에 없는 인형은 저장하지 않는다', () => {
  assert.deepEqual(collection.addDoll('dragon-x'), { ok: false, reason: 'unknown-doll' });
  assert.deepEqual(collection.getCollection(), {});
});

test('doll:won 이벤트로 자동 저장', () => {
  eventBus.emit('doll:won', { machineId: 'bunny', dollId: 'bunny-mint' });
  assert.equal(collection.getCollection()['bunny-mint'].count, 1);
});

test('저장되면 collection:changed 발생', () => {
  const seen = [];
  const off = eventBus.on('collection:changed', ({ collection: c }) => seen.push(Object.keys(c)));
  collection.addDoll('chick-yellow');
  off();
  assert.deepEqual(seen, [['chick-yellow']]);
});

test('getCollection은 복사본 (밖에서 바꿔도 저장값 그대로)', () => {
  collection.addDoll('bear-brown');
  collection.getCollection()['bear-brown'].count = 999;
  assert.equal(collection.getCollection()['bear-brown'].count, 1);
});

test('수집률: 전체 / 기계별', () => {
  const bears = getDollsByMachine('bear');
  bears.forEach((d) => collection.addDoll(d.id));
  collection.addDoll('bear-brown'); // 중복은 수집률에 영향 없음
  assert.deepEqual(collection.getStats('bear'), { owned: bears.length, total: bears.length, rate: 100 });
  const all = collection.getStats();
  assert.equal(all.owned, bears.length);
  assert.equal(all.rate, Math.round((bears.length / DOLLS.length) * 100));
});

test('도감 목록: 카탈로그 순서 + 보유 여부', () => {
  collection.addDoll('bunny-gray');
  const entries = collection.getEntries('bunny');
  assert.deepEqual(entries.map((e) => e.doll.id), getDollsByMachine('bunny').map((d) => d.id));
  const gray = entries.find((e) => e.doll.id === 'bunny-gray');
  assert.equal(gray.owned, true);
  assert.equal(gray.count, 1);
  assert.equal(entries.find((e) => e.doll.id === 'bunny-white').owned, false);
});

test('새로고침 후에도 유지 (저장소에서 다시 읽음)', () => {
  collection.addDoll('cat-black');
  assert.equal(load('collection', {})['cat-black'].count, 1);
});

test('다른 탭에서 얻은 인형을 덮어쓰지 않는다', () => {
  collection.addDoll('bear-brown');
  // 다른 탭이 bear-white를 저장
  save('collection', { ...load('collection', {}), 'bear-white': { count: 1, obtainedAt: 2, lastObtainedAt: 2 } });
  collection.addDoll('bear-pink');
  assert.deepEqual(Object.keys(collection.getCollection()).sort(), ['bear-brown', 'bear-pink', 'bear-white']);
});

test('깨진 항목과 카탈로그에 없는 항목은 버리고 나머지는 살린다', () => {
  save('collection', {
    'bear-brown': { count: 2, obtainedAt: 10 },
    'bear-white': { count: -1, obtainedAt: 10 },
    'bear-pink': 'broken',
    'removed-doll': { count: 1, obtainedAt: 10 },
  });
  assert.deepEqual(Object.keys(collection.getCollection()), ['bear-brown']);
  save('collection', ['not', 'an', 'object']);
  assert.deepEqual(collection.getCollection(), {});
});

test('저장 실패 시 ok=false, collection:error 발생', () => {
  useStorageBackend({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {} });
  assert.deepEqual(collection.addDoll('bear-brown'), { ok: false, reason: 'save-failed' });
  const errors = [];
  const off = eventBus.on('collection:error', (p) => errors.push(p));
  eventBus.emit('doll:won', { dollId: 'bear-brown' });
  off();
  assert.deepEqual(errors, [{ dollId: 'bear-brown', reason: 'save-failed' }]);
});
