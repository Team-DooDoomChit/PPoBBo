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

const defaultState = () => ({ streak: 0, lastDate: null });

function readState() {
  const s = load(KEY, defaultState());
  if (!Number.isSafeInteger(s?.streak) || s.streak < 0) return defaultState();
  return s;
}

export const attendance = {
  /** @returns {{ rewards: number[], streak: number, claimedToday: boolean, todayIndex: number }} */
  getAttendance() {
    const { streak, lastDate } = readState();
    const today = dateKey();
    // 기기 시계를 과거로 돌려도 이미 받은 날 이전에는 다시 받을 수 없다
    const claimedToday = lastDate != null && lastDate >= today;
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
    // 출석 기록을 먼저 저장해 중복 지급을 막는다
    save(KEY, { streak: info.streak + 1, lastDate: dateKey() });
    wallet.addGold(reward, 'attendance');
    return { ok: true, reward, day: info.todayIndex + 1 };
  },
};
