/**
 * 게임 로직이 돌려주는 실패 사유(reason) → 안내 문구.
 * 공통 문구를 한곳에서 관리하고, 화면마다 다른 문구는 overrides로 덮어쓴다.
 *   failText('save-failed')                                   → 공통 문구
 *   failText(reason, { 'already-claimed': '...', default: '...' }) → 화면 전용 문구 우선
 */
const COMMON = {
  'save-failed': '저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요',
  'not-enough-gold': '골드가 부족해요',
  'invalid-amount': '처리할 수 없는 금액이에요',
  'daily-limit': '오늘 가능한 횟수를 모두 사용했어요',
  'unknown-doll': '도감에 없는 인형이에요',
  default: '처리하지 못했어요. 잠시 후 다시 시도해 주세요',
};

export function failText(reason, overrides = {}) {
  return overrides[reason] ?? COMMON[reason] ?? overrides.default ?? COMMON.default;
}
