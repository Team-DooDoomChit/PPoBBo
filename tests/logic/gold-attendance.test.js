import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { eventBus } from '../../src/core/EventBus.js';
import { useStorageBackend, save, load, remove } from '../../src/logic/storage.js';
import { setClock } from '../../src/logic/clock.js';
import { wallet, INITIAL_GOLD } from '../../src/logic/wallet.js';
import { attendance, ATTENDANCE_REWARDS } from '../../src/logic/attendance.js';

/** 로컬 시간 기준 날짜로 시계 고정 */
const setDay = (y, m, d, hh = 12) => setClock(() => new Date(y, m - 1, d, hh).getTime());

beforeEach(() => {
  useStorageBackend(); // 테스트마다 빈 메모리 저장소
  wallet.reload();
  setDay(2026, 10, 28);
});

// ---------------- 골드 ----------------

test('처음 시작하면 기본 골드를 가진다', () => {
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});

test('골드 차감: 잔액이 충분하면 성공', () => {
  const r = wallet.spendGold(300);
  assert.deepEqual(r, { ok: true, gold: INITIAL_GOLD - 300 });
});

test('골드 차감: 잔액 부족이면 실패하고 골드는 그대로', () => {
  const r = wallet.spendGold(INITIAL_GOLD + 1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-enough-gold');
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});

test('잔액을 정확히 다 쓰면 0이 된다 (음수 불가)', () => {
  assert.equal(wallet.spendGold(INITIAL_GOLD).ok, true);
  assert.equal(wallet.getGold(), 0);
  assert.equal(wallet.spendGold(1).ok, false);
});

test('잘못된 금액(0, 음수, 소수, 문자열)은 거부', () => {
  for (const bad of [0, -100, 1.5, '100', NaN, Infinity]) {
    assert.equal(wallet.spendGold(bad).ok, false, `spend ${bad}`);
    assert.equal(wallet.addGold(bad).ok, false, `add ${bad}`);
  }
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});

test('골드 변경 시 gold:changed 이벤트 발생', () => {
  const seen = [];
  const off = eventBus.on('gold:changed', (p) => seen.push(p.gold));
  wallet.addGold(50);
  wallet.spendGold(20);
  wallet.spendGold(999999); // 실패 → 이벤트 없음
  off();
  assert.deepEqual(seen, [INITIAL_GOLD + 50, INITIAL_GOLD + 30]);
});

test('충전: 패키지만큼 골드 지급, 없는 패키지는 실패', () => {
  const r = wallet.chargeGold('krw-3000');
  assert.equal(r.ok, true);
  assert.equal(r.amount, 3300);
  assert.equal(wallet.getGold(), INITIAL_GOLD + 3300);
  assert.equal(wallet.chargeGold('krw-999').ok, false);
});

test('getChargePackages는 복사본을 돌려준다 (원본 변경 불가)', () => {
  wallet.getChargePackages()[0].gold = 999999;
  assert.equal(wallet.chargeGold('krw-1000').amount, 1000);
});

test('새로고침(다시 읽기) 후에도 골드 유지', () => {
  wallet.spendGold(400);
  wallet.reload();
  assert.equal(wallet.getGold(), INITIAL_GOLD - 400);
});

test('저장 데이터가 깨져 있으면 기본값으로 시작', () => {
  save('wallet', { gold: -50, history: 'x' });
  wallet.reload();
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});

test('변경 내역이 최신순으로 기록된다', () => {
  wallet.addGold(10, 'a');
  wallet.spendGold(5, 'b');
  const [last, prev] = wallet.getHistory();
  assert.equal(last.reason, 'b');
  assert.equal(last.delta, -5);
  assert.equal(prev.reason, 'a');
});

// ---------------- 저장소 ----------------

test('저장소: 버전이 다르면 기본값', () => {
  save('x', { a: 1 });
  assert.deepEqual(load('x', {}), { a: 1 });
  remove('x');
  assert.deepEqual(load('x', { d: 1 }), { d: 1 });
});

// ---------------- 출석체크 ----------------

test('첫 출석: 1일차 보상 지급', () => {
  const r = attendance.claimAttendance();
  assert.deepEqual(r, { ok: true, reward: ATTENDANCE_REWARDS[0], day: 1 });
  assert.equal(wallet.getGold(), INITIAL_GOLD + ATTENDANCE_REWARDS[0]);
});

test('같은 날 두 번 받을 수 없다', () => {
  attendance.claimAttendance();
  setDay(2026, 10, 28, 23); // 같은 날 밤
  const r = attendance.claimAttendance();
  assert.deepEqual(r, { ok: false, reason: 'already-claimed' });
  assert.equal(wallet.getGold(), INITIAL_GOLD + ATTENDANCE_REWARDS[0]);
});

test('연속 출석하면 다음 일차 보상', () => {
  attendance.claimAttendance();
  setDay(2026, 10, 29);
  assert.deepEqual(attendance.claimAttendance(), { ok: true, reward: ATTENDANCE_REWARDS[1], day: 2 });
  assert.equal(attendance.getAttendance().streak, 2);
});

test('자정이 지나면 바로 다음 날로 인정', () => {
  setDay(2026, 10, 28, 23);
  attendance.claimAttendance();
  setDay(2026, 10, 29, 0);
  assert.equal(attendance.claimAttendance().day, 2);
});

test('하루 빠지면 1일차부터 다시', () => {
  attendance.claimAttendance();
  setDay(2026, 10, 29);
  attendance.claimAttendance();
  setDay(2026, 10, 31); // 30일 빠짐
  const info = attendance.getAttendance();
  assert.equal(info.streak, 0);
  assert.equal(info.todayIndex, 0);
  assert.equal(attendance.claimAttendance().day, 1);
});

test('7일 연속 후 8일째는 다시 1일차, 7일차는 보너스', () => {
  const rewards = [];
  for (let d = 0; d < 8; d++) {
    setDay(2026, 11, 1 + d);
    rewards.push(attendance.claimAttendance().reward);
  }
  assert.deepEqual(rewards, [...ATTENDANCE_REWARDS, ATTENDANCE_REWARDS[0]]);
});

test('월말 → 월초도 연속으로 인정', () => {
  setDay(2026, 10, 31);
  attendance.claimAttendance();
  setDay(2026, 11, 1);
  assert.equal(attendance.claimAttendance().day, 2);
});

test('받은 뒤 getAttendance는 오늘 칸을 가리킨다 (UI 표시용)', () => {
  attendance.claimAttendance();
  const info = attendance.getAttendance();
  assert.equal(info.claimedToday, true);
  assert.equal(info.streak, 1);
  assert.equal(info.todayIndex, 0);
});

test('기기 시계를 과거로 돌려도 다시 받을 수 없다', () => {
  attendance.claimAttendance();
  setDay(2026, 10, 27);
  assert.equal(attendance.claimAttendance().ok, false);
});

test('출석 기록도 새로고침 후 유지', () => {
  attendance.claimAttendance();
  wallet.reload();
  assert.equal(attendance.getAttendance().claimedToday, true);
  assert.equal(wallet.getGold(), INITIAL_GOLD + ATTENDANCE_REWARDS[0]);
});
