import { gameApi } from '../../integration/gameApi.js';
import { h, formatGold } from '../dom.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';

/** 출석체크 팝업: 7일 보상 달력 + 오늘 보상 받기 */
export function openAttendanceModal() {
  const modal = openModal({ title: '📅 출석체크', className: 'modal-attendance' });

  const render = () => {
    const { rewards, streak, claimedToday, todayIndex } = gameApi.getAttendance();
    const claimedInCycle = claimedToday ? todayIndex + 1 : todayIndex;

    const days = rewards.map((reward, i) =>
      h(
        'div',
        {
          class: [
            'attend-day',
            i < claimedInCycle && 'claimed',
            i === todayIndex && 'today',
            i === rewards.length - 1 && 'bonus',
          ]
            .filter(Boolean)
            .join(' '),
        },
        h('div', { class: 'attend-label' }, `${i + 1}일차`),
        h('div', { class: 'attend-icon' }, i < claimedInCycle ? '✅' : i === rewards.length - 1 ? '🎁' : '🪙'),
        h('div', { class: 'attend-reward' }, formatGold(reward)),
      ),
    );

    modal.body.replaceChildren(
      h('p', { class: 'hint' }, `연속 출석 ${streak}일째 · 7일차엔 보너스!`),
      h('div', { class: 'attend-grid' }, days),
      h(
        'button',
        { class: 'btn btn-primary btn-lg modal-action', disabled: claimedToday, onClick: claim },
        claimedToday ? '오늘은 이미 받았어요' : `오늘 보상 받기 (🪙 ${formatGold(rewards[todayIndex])})`,
      ),
    );
  };

  const claim = () => {
    const result = gameApi.claimAttendance();
    if (result.ok) toast(`${result.day}일차 출석! 🪙 ${formatGold(result.reward)} 지급`, { type: 'good' });
    else toast('오늘은 이미 출석했어요', { type: 'warn' });
    render();
  };

  render();
  return modal;
}
