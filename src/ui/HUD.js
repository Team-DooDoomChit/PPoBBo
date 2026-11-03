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
      h('button', { class: 'hud-logo', onClick: () => router.go('main') }, '🧸', h('span', { class: 'hud-logo-text' }, ' PPoBBo')),
      h('div', { class: 'hud-right' }, h('div', { class: 'gold-pill' }, '🪙 ', this.goldValue), this.actions),
    );
    root.append(this.el);

    eventBus.on('gold:changed', ({ gold }) => this.#setGold(gold));
  }

  /** 상단 바에 메뉴 버튼 추가. '아이콘 이름' 형태면 좁은 화면에서는 이름을 숨기고 아이콘만 보인다 */
  addAction(label, onClick, title = label) {
    const [icon, ...words] = label.split(' ');
    const content = words.length ? [icon, h('span', { class: 'hud-btn-text' }, ` ${words.join(' ')}`)] : [label];
    const button = h('button', { class: 'hud-btn', title, 'aria-label': title, onClick }, ...content);
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
