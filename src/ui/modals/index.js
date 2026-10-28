import { eventBus } from '../../core/EventBus.js';
import { gameApi } from '../../integration/gameApi.js';
import { openAttendanceModal } from './AttendanceModal.js';
import { openChargeModal } from './ChargeModal.js';
import { openNightShiftModal } from './NightShiftModal.js';

const MODALS = {
  attendance: openAttendanceModal,
  charge: openChargeModal,
  nightShift: openNightShiftModal,
};

/**
 * HUD에 모달 버튼을 추가하고 'ui:open-modal' { name } 이벤트로도 열 수 있게 한다.
 * 오늘 출석하지 않았다면 시작 시 출석체크 팝업을 띄운다.
 */
export function setupModals(hud) {
  hud.addAction('📅', openAttendanceModal, '출석체크');
  hud.addAction('🌙', openNightShiftModal, '야간 근무');
  hud.addAction('💰 충전', openChargeModal, '골드 충전');

  eventBus.on('ui:open-modal', ({ name }) => MODALS[name]?.());

  if (!gameApi.getAttendance().claimedToday) openAttendanceModal();
}
