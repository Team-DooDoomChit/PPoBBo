import { load, save } from './storage.js';
import { dateKey } from './clock.js';
import { wallet } from './wallet.js';

/**
 * 출석체크 보상. (#11)
 *
 * - 하루 1회 (로컬 날짜 기준)
 * - 어제 출석했으면 연속 출석 유지, 하루라도 빠지면 1일차부터 다시
 * - 7일 주기로 보상 반복, 7일차는 보너스
 */
export const ATTENDANCE_REWARDS = Object.freeze([100, 100, 150, 150, 200, 200, 500]);
const KEY = 'attendance';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const defaultState = () => ({ streak: 0, lastDate: null });

function readState() {
  const s = load(KEY, defaultState());
  if (!Number.isSafeInteger(s?.streak) || s.streak < 0) return defaultState();
  // 깨진 값이나 예전 형식('Wed Oct 28 2026')이면 문자열 비교가 틀어지므로 초기화
  if (s.lastDate != null && !DATE_RE.test(s.lastDate)) return defaultState();
  return s;
}

export const attendance = {
  /** @returns {{ rewards: number[], streak: number, claimedToday: boolean, todayIndex: number }} */
  getAttendance() {
    const { streak, lastDate } = readState();
    const today = dateKey();
    // 기록이 오늘 또는 내일(시계를 하루 되돌린 경우, 시간대 이동)이면 오늘은 받은 것으로 본다.
    // 그보다 더 미래면 기기 시계가 잘못됐던 기록으로 보고 무시한다. (영구 잠김 방지)
    const claimedToday = lastDate === today || lastDate === dateKey(1);
    const continued = claimedToday || lastDate === dateKey(-1);
    const current = continued ? streak : 0;
    const n = ATTENDANCE_REWARDS.length;
    return {
      rewards: [...ATTENDANCE_REWARDS],
      streak: current,
      claimedToday,
      todayIndex: claimedToday ? (current - 1 + n) % n : current % n,
    };
  },

  /** @returns {{ ok: true, reward: number, day: number } | { ok: false, reason: string }} */
  claimAttendance() {
    const info = this.getAttendance();
    if (info.claimedToday) return { ok: false, reason: 'already-claimed' };

    const reward = ATTENDANCE_REWARDS[info.todayIndex];
    const prev = readState();
    // 출석 기록을 먼저 저장해 중복 지급을 막는다. 저장이 안 되면 지급하지 않는다.
    if (!save(KEY, { streak: info.streak + 1, lastDate: dateKey() })) return { ok: false, reason: 'save-failed' };
    if (!wallet.addGold(reward, 'attendance').ok) {
      save(KEY, prev); // 골드 지급 실패 시 출석 기록도 되돌려 다시 받을 수 있게 한다
      return { ok: false, reason: 'save-failed' };
    }
    return { ok: true, reward, day: info.todayIndex + 1 };
  },
};
