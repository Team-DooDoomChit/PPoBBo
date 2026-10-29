/**
 * 날짜 기준 로직(출석, 야간 근무 일일 제한)에서 쓰는 시계.
 * 테스트에서 날짜를 바꿀 수 있도록 now()를 교체할 수 있다.
 *
 * - now(): 기기 시계(Date.now). 날짜 계산·기록용
 * - elapsedNow(): 단조 시계(performance.now). 경과 시간 측정용
 *   기기 시간을 바꿔도 영향을 받지 않는다.
 */
const realNow = () => Date.now();
const realElapsed = () => globalThis.performance?.now?.() ?? Date.now();

let nowFn = realNow;
let elapsedFn = realElapsed;

export const now = () => nowFn();
export const elapsedNow = () => elapsedFn();

/**
 * 테스트용: 시계 교체 (인자 없으면 실제 시계로 복원)
 * elapsed를 따로 주지 않으면 경과 시간도 fn을 따라간다.
 */
export function setClock(fn, elapsed) {
  nowFn = fn ?? realNow;
  elapsedFn = elapsed ?? fn ?? realElapsed;
}

/** 로컬 시간 기준 날짜 키 'YYYY-MM-DD' (offsetDays로 어제/내일 계산) */
export function dateKey(offsetDays = 0) {
  const d = new Date(now());
  // 날짜 단위로 더해서 서머타임에도 하루가 정확히 바뀌게 한다
  const shifted = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);
  const mm = String(shifted.getMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${mm}-${dd}`;
}
