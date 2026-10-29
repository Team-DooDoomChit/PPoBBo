import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { useStorageBackend, save } from '../../src/logic/storage.js';
import { setClock } from '../../src/logic/clock.js';
import { wallet, INITIAL_GOLD } from '../../src/logic/wallet.js';
import { nightShift, NIGHT_SHIFT } from '../../src/logic/nightShift.js';

let t = 0;
const advance = (sec) => (t += sec * 1000);
const setDay = (y, m, d, hh = 12) => (t = new Date(y, m - 1, d, hh).getTime());
const { duration, reward, dailyMax } = NIGHT_SHIFT;

/** 근무 한 번을 끝까지 수행 */
function work() {
  const s = nightShift.start();
  if (!s.ok) return s;
  advance(duration);
  return nightShift.complete(s.sessionId);
}

beforeEach(() => {
  useStorageBackend();
  wallet.reload();
  setDay(2026, 10, 29);
  setClock(() => t);
  nightShift.cancel(nightShift.start().sessionId); // 이전 테스트의 세션 정리
});

test('끝까지 시청하면 수당 지급', () => {
  assert.deepEqual(work(), { ok: true, reward });
  assert.equal(wallet.getGold(), INITIAL_GOLD + reward);
  assert.equal(nightShift.getStatus().remaining, dailyMax - 1);
});

test('시청 시간이 모자라면 지급하지 않는다', () => {
  const s = nightShift.start();
  advance(duration - 1);
  assert.deepEqual(nightShift.complete(s.sessionId), { ok: false, reason: 'too-short' });
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});

test('세션은 한 번만 쓸 수 있다 (같은 ID로 두 번 완료 불가)', () => {
  const s = nightShift.start();
  advance(duration);
  assert.equal(nightShift.complete(s.sessionId).ok, true);
  assert.equal(nightShift.complete(s.sessionId).reason, 'invalid-session');
  assert.equal(wallet.getGold(), INITIAL_GOLD + reward);
});

test('너무 빨리 완료를 시도해 실패하면 그 세션은 끝난다', () => {
  const s = nightShift.start();
  assert.equal(nightShift.complete(s.sessionId).reason, 'too-short');
  advance(duration);
  assert.equal(nightShift.complete(s.sessionId).reason, 'invalid-session');
});

test('모르는 세션 ID / 취소된 세션은 거부', () => {
  assert.equal(nightShift.complete('fake').reason, 'invalid-session');
  const s = nightShift.start();
  nightShift.cancel(s.sessionId);
  advance(duration);
  assert.equal(nightShift.complete(s.sessionId).reason, 'invalid-session');
});

test('새로 시작하면 이전 세션은 무효', () => {
  const a = nightShift.start();
  advance(duration);
  const b = nightShift.start();
  assert.equal(nightShift.complete(a.sessionId).reason, 'invalid-session');
  // 옛 ID로 완료를 시도해도 현재 세션(b)은 그대로 유지된다
  advance(duration);
  assert.equal(nightShift.complete(b.sessionId).ok, true);
});

test('시청 중 탭을 숨기면 중단 처리', () => {
  const s = nightShift.start();
  advance(5);
  nightShift.notifyHidden();
  assert.equal(nightShift.isInterrupted(s.sessionId), true);
  advance(duration);
  assert.deepEqual(nightShift.complete(s.sessionId), { ok: false, reason: 'interrupted' });
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});

test('근무 중이 아닐 때 탭을 숨긴 건 다음 근무에 영향 없음', () => {
  nightShift.notifyHidden();
  assert.equal(work().ok, true);
});

test(`하루 최대 ${dailyMax}회`, () => {
  for (let i = 0; i < dailyMax; i++) assert.equal(work().ok, true, `${i + 1}회차`);
  assert.deepEqual(nightShift.start(), { ok: false, reason: 'daily-limit' });
  assert.equal(nightShift.getStatus().remaining, 0);
  assert.equal(wallet.getGold(), INITIAL_GOLD + reward * dailyMax);
});

test('시작은 했는데 그 사이 다른 탭에서 한도를 채웠으면 지급하지 않는다', () => {
  const s = nightShift.start();
  save('nightShift', { date: '2026-10-29', count: dailyMax, log: [] });
  advance(duration);
  assert.equal(nightShift.complete(s.sessionId).reason, 'daily-limit');
});

test('날짜가 바뀌면 횟수 초기화', () => {
  for (let i = 0; i < dailyMax; i++) work();
  setDay(2026, 10, 30);
  assert.equal(nightShift.getStatus().remaining, dailyMax);
  assert.equal(work().ok, true);
});

test('저장 실패 시 지급하지 않는다', () => {
  const map = new Map();
  useStorageBackend({
    getItem: (k) => map.get(k) ?? null,
    setItem: () => { throw new Error('quota'); },
    removeItem: (k) => map.delete(k),
  });
  wallet.reload();
  assert.equal(work().reason, 'save-failed');
  assert.equal(wallet.getGold(), INITIAL_GOLD);
  assert.equal(nightShift.getStatus().remaining, dailyMax);
});

test('골드 지급만 실패하면 횟수를 되돌린다', () => {
  const map = new Map();
  useStorageBackend({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { if (k === 'ppobbo:wallet') throw new Error('quota'); map.set(k, v); },
    removeItem: (k) => map.delete(k),
  });
  wallet.reload();
  assert.equal(work().reason, 'save-failed');
  assert.equal(nightShift.getStatus().remaining, dailyMax);
});

test('깨진 저장값이면 초기화', () => {
  save('nightShift', { date: 'Wed Oct 29 2026', count: 3 });
  assert.equal(nightShift.getStatus().remaining, dailyMax);
  save('nightShift', { date: '2026-10-29', count: -1 });
  assert.equal(nightShift.getStatus().remaining, dailyMax);
});

test('지급 내역 기록 (최신순)', () => {
  work();
  advance(60);
  work();
  const log = nightShift.getLog();
  assert.equal(log.length, 2);
  assert.ok(log[0].at > log[1].at);
});

test('시청 중 기기 시간을 앞으로 돌려도 시청 시간은 단조 시계로 잰다', () => {
  let mono = 0;
  setClock(() => t, () => mono);
  const s = nightShift.start();
  advance(60 * 60); // 기기 시계만 1시간 앞으로
  mono += (duration - 1) * 1000; // 실제로는 duration - 1초만 지남
  assert.deepEqual(nightShift.complete(s.sessionId), { ok: false, reason: 'too-short' });

  const s2 = nightShift.start();
  mono += duration * 1000;
  assert.equal(nightShift.complete(s2.sessionId).ok, true);
});
