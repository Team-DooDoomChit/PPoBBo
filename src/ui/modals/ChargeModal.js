import { gameApi } from '../../integration/gameApi.js';
import { h, formatGold } from '../dom.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';

/** 골드 충전 모달: 1천 / 3천 / 5천 / 1만원 상품 선택 → 결제 */
export function openChargeModal() {
  const modal = openModal({ title: '💰 골드 충전', className: 'modal-charge' });
  const packages = gameApi.getChargePackages();
  let selected = packages[0];

  const payBtn = h('button', { class: 'btn btn-primary btn-lg modal-action', onClick: pay });
  const options = packages.map((pkg) =>
    h(
      'button',
      { class: 'charge-option', onClick: () => select(pkg) },
      pkg.bonus > 0 && h('div', { class: 'charge-bonus' }, `+${pkg.bonus}%`),
      h('div', { class: 'charge-gold' }, `🪙 ${formatGold(pkg.gold)}`),
      h('div', { class: 'charge-price' }, `${formatGold(pkg.price)}원`),
    ),
  );

  function select(pkg) {
    selected = pkg;
    options.forEach((el, i) => el.classList.toggle('selected', packages[i] === pkg));
    payBtn.textContent = `${formatGold(pkg.price)}원 결제하기`;
  }

  function pay() {
    const result = gameApi.chargeGold(selected.id);
    if (!result.ok) {
      toast('결제에 실패했어요. 다시 시도해 주세요', { type: 'warn' });
      return;
    }
    toast(`🪙 ${formatGold(result.amount)} 충전 완료!`, { type: 'good' });
    modal.close();
  }

  modal.body.append(
    h('div', { class: 'charge-grid' }, options),
    payBtn,
    h('p', { class: 'hint' }, '※ 데모 버전으로 실제 결제는 이루어지지 않습니다'),
  );
  select(selected);
  return modal;
}
