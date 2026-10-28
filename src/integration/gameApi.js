import { eventBus } from '../core/EventBus.js';
import { wallet } from '../logic/wallet.js';
import { attendance } from '../logic/attendance.js';
import { nightShift } from '../logic/nightShift.js';

/**
 * 게임 로직(팀원 B) 연동 어댑터.
 *
 * UI는 이 객체만 호출한다.
 *   - #11 골드·충전·출석, #12 야간 근무: src/logic 모듈 연결 완료 (LocalStorage 저장)
 *   - #13 도감: 아직 메모리 Mock, 구현 후 교체 (반환 형태만 유지하면 UI 수정 없음)
 *
 * 이벤트 계약
 *   gold:changed        { gold }        골드가 바뀔 때 (B #11과 동일)
 *   collection:changed  { collection }  도감이 바뀔 때
 */
// #13 구현 전까지 사용하는 메모리 Mock
const state = {
  collection: {}, // { [dollId]: { count, obtainedAt } }
};

export const gameApi = {
  // ---------- 골드 / 충전 (#11) ----------

  getGold: () => wallet.getGold(),

  /** @returns {{ ok: boolean, gold: number }} 잔액 부족 시 ok=false */
  spendGold: (amount, reason) => wallet.spendGold(amount, reason),

  addGold: (amount, reason) => wallet.addGold(amount, reason),

  getChargePackages: () => wallet.getChargePackages(),

  /** 실제 결제 연동 전까지는 결제 성공으로 간주한다. */
  chargeGold: (packageId) => wallet.chargeGold(packageId),

  // ---------- 출석체크 (#11) ----------

  /** @returns {{ rewards: number[], streak: number, claimedToday: boolean, todayIndex: number }} */
  getAttendance: () => attendance.getAttendance(),

  claimAttendance: () => attendance.claimAttendance(),

  // ---------- 야간 근무 (#12) ----------

  getNightShiftStatus: () => nightShift.getStatus(),

  startNightShift: () => nightShift.start(),

  /** 시청 시간 충족 + 탭 이탈 없음 + 일일 제한 이내일 때만 수당 지급 */
  completeNightShift: (sessionId) => nightShift.complete(sessionId),

  cancelNightShift: (sessionId) => nightShift.cancel(sessionId),

  /** 시청 중 탭 이탈로 이미 실패가 확정됐는지 (UI에서 바로 안내할 때 사용, 선택) */
  isNightShiftInterrupted: (sessionId) => nightShift.isInterrupted(sessionId),

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
