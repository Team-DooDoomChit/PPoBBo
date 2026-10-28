import { wallet } from '../logic/wallet.js';
import { attendance } from '../logic/attendance.js';
import { nightShift } from '../logic/nightShift.js';
import { collection } from '../logic/collection.js';

/**
 * 게임 로직(팀원 B) 연동 어댑터.
 *
 * UI는 이 객체만 호출한다.
 *   - #11 골드·충전·출석, #12 야간 근무, #13 도감: src/logic 모듈 연결 완료 (LocalStorage 저장)
 *   - 반환 형태만 유지하면 내부 구현(예: DB)을 바꿔도 UI 수정 없음
 *
 * 이벤트 계약
 *   gold:changed        { gold }        골드가 바뀔 때 (B #11과 동일)
 *   collection:changed  { collection }  도감이 바뀔 때
 *   collection:error    { dollId, reason }  획득한 인형 저장 실패 (저장 공간 부족 등)
 */
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

  /** @returns {{ [dollId]: { count, obtainedAt, lastObtainedAt } }} */
  getCollection: () => collection.getCollection(),

  /** @returns {{ ok: boolean, entry?, isNew?: boolean, reason?: string }} */
  addDoll: (dollId) => collection.addDoll(dollId),

  /** @returns {{ owned, total, rate }} machineId 생략 시 전체 */
  getCollectionStats: (machineId) => collection.getStats(machineId),
};

// 'doll:won' → 도감 저장은 src/logic/collection.js에서 구독한다.
