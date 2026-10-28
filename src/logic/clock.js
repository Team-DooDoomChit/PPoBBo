/**
 * 날짜 기준 로직(출석, 야간 근무 일일 제한)에서 쓰는 시계.
 * 테스트에서 날짜를 바꿀 수 있도록 now()를 교체할 수 있다.
 */
let nowFn = () => Date.now();

export const now = () => nowFn();

/** 테스트용: 현재 시각 함수 교체 (인자 없으면 실제 시계로 복원) */
export function setClock(fn = () => Date.now()) {
  nowFn = fn;
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
