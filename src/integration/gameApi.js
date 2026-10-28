import { eventBus } from '../core/EventBus.js';

/**
 * 게임 로직(팀원 B) 연동 어댑터.
 *
 * UI는 이 객체만 호출한다. 현재는 메모리 기반 Mock 구현이며,
 * B 팀원의 #11(골드·출석) / #12(야간 근무) / #13(도감 저장) 모듈이 머지되면
 * 각 메서드를 실제 모듈 호출로 교체한다. (반환 형태만 유지하면 UI 수정 없음)
 *
 * 이벤트 계약
 *   gold:changed        { gold }        골드가 바뀔 때 (B #11과 동일)
 *   collection:changed  { collection }  도감이 바뀔 때
 */
const ATTENDANCE_REWARDS = [100, 100, 150, 150, 200, 200, 500];
const CHARGE_PACKAGES = [
  { id: 'krw-1000', price: 1000, gold: 1000, bonus: 0 },
  { id: 'krw-3000', price: 3000, gold: 3300, bonus: 10 },
  { id: 'krw-5000', price: 5000, gold: 5750, bonus: 15 },
  { id: 'krw-10000', price: 10000, gold: 12000, bonus: 20 },
];
const NIGHT_SHIFT = { duration: 15, reward: 300, dailyMax: 5 };

const state = {
  gold: 1000,
  collection: {}, // { [dollId]: { count, obtainedAt } }
  attendance: { streak: 0, lastDate: null },
  nightShift: { date: null, count: 0, session: null },
};

const today = () => new Date().toDateString();
const emitGold = () => eventBus.emit('gold:changed', { gold: state.gold });

export const gameApi = {
  // ---------- 골드 (#11) ----------

  getGold() {
    return state.gold;
  },

  /** @returns {{ ok: boolean, gold: number }} 잔액 부족 시 ok=false */
  spendGold(amount) {
    if (state.gold < amount) return { ok: false, gold: state.gold };
    state.gold -= amount;
    emitGold();
    return { ok: true, gold: state.gold };
  },

  addGold(amount, reason) {
    state.gold += amount;
    emitGold();
    return { ok: true, gold: state.gold, reason };
  },

  // ---------- 충전 (#11) ----------

  getChargePackages() {
    return CHARGE_PACKAGES.map((p) => ({ ...p }));
  },

  /** 실제 결제 연동 전까지는 결제 성공으로 간주한다. */
  chargeGold(packageId) {
    const pkg = CHARGE_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return { ok: false, reason: 'invalid-package' };
    return { ...this.addGold(pkg.gold, 'charge'), amount: pkg.gold };
  },

  // ---------- 출석체크 (#11) ----------

  /** @returns {{ rewards: number[], streak: number, claimedToday: boolean, todayIndex: number }} */
  getAttendance() {
    const { streak, lastDate } = state.attendance;
    const claimedToday = lastDate === today();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const continued = claimedToday || lastDate === yesterday;
    const current = continued ? streak : 0;
    return {
      rewards: [...ATTENDANCE_REWARDS],
      streak: current,
      claimedToday,
      todayIndex: claimedToday ? (current - 1) % 7 : current % 7,
    };
  },

  claimAttendance() {
    const info = this.getAttendance();
    if (info.claimedToday) return { ok: false, reason: 'already-claimed' };
    const reward = ATTENDANCE_REWARDS[info.todayIndex];
    state.attendance = { streak: info.streak + 1, lastDate: today() };
    this.addGold(reward, 'attendance');
    return { ok: true, reward, day: info.todayIndex + 1 };
  },

  // ---------- 야간 근무 (#12) ----------

  getNightShiftStatus() {
    const count = state.nightShift.date === today() ? state.nightShift.count : 0;
    return { ...NIGHT_SHIFT, remaining: NIGHT_SHIFT.dailyMax - count };
  },

  startNightShift() {
    if (this.getNightShiftStatus().remaining <= 0) return { ok: false, reason: 'daily-limit' };
    const session = { id: crypto.randomUUID(), startedAt: Date.now() };
    state.nightShift.session = session;
    return { ok: true, sessionId: session.id, duration: NIGHT_SHIFT.duration, reward: NIGHT_SHIFT.reward };
  },

  /** 시청 시간이 충분할 때만 수당 지급 */
  completeNightShift(sessionId) {
    const session = state.nightShift.session;
    if (!session || session.id !== sessionId) return { ok: false, reason: 'invalid-session' };
    state.nightShift.session = null;
    if (Date.now() - session.startedAt < NIGHT_SHIFT.duration * 1000) return { ok: false, reason: 'too-short' };

    if (state.nightShift.date !== today()) state.nightShift = { date: today(), count: 0, session: null };
    state.nightShift.count += 1;
    this.addGold(NIGHT_SHIFT.reward, 'night-shift');
    return { ok: true, reward: NIGHT_SHIFT.reward };
  },

  cancelNightShift(sessionId) {
    if (state.nightShift.session?.id === sessionId) state.nightShift.session = null;
  },

  // ---------- 도감 (#13) ----------

  getCollection() {
    return structuredClone(state.collection);
  },

  addDoll(dollId) {
    const entry = state.collection[dollId] ?? { count: 0, obtainedAt: Date.now() };
    entry.count += 1;
    state.collection[dollId] = entry;
    eventBus.emit('collection:changed', { collection: this.getCollection() });
  },
};

// 인형 획득 시 도감에 저장 (B #13 구현 시 해당 모듈에서 구독하도록 이전)
eventBus.on('doll:won', ({ dollId }) => gameApi.addDoll(dollId));
