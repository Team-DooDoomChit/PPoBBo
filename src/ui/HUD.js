import { eventBus } from '../core/EventBus.js';
import { gameApi } from '../integration/gameApi.js';
import { h, formatGold } from './dom.js';

/** 모든 화면 위에 고정되는 상단 바 (로고, 골드, 메뉴 버튼) */
export class HUD {
  constructor(root, router) {
    this.goldValue = h('span', { class: 'gold-value' }, formatGold(gameApi.getGold()));
    this.actions = h('div', { class: 'hud-actions' });

    this.el = h(
      'header',
      { class: 'hud' },
      h('button', { class: 'hud-logo', onClick: () => router.go('main') }, '🧸 PPoBBo'),
      h('div', { class: 'hud-right' }, h('div', { class: 'gold-pill' }, '🪙 ', this.goldValue), this.actions),
    );
    root.append(this.el);

    eventBus.on('gold:changed', ({ gold }) => this.#setGold(gold));
  }

  /** 상단 바에 메뉴 버튼 추가 */
  addAction(label, onClick, title = label) {
    const button = h('button', { class: 'hud-btn', title, onClick }, label);
    this.actions.append(button);
    return button;
  }

  #setGold(gold) {
    this.goldValue.textContent = formatGold(gold);
    this.goldValue.parentElement.classList.remove('bump');
    void this.goldValue.offsetWidth; // 애니메이션 재시작
    this.goldValue.parentElement.classList.add('bump');
  }
}
