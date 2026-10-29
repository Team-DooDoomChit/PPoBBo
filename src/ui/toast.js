import { h } from './dom.js';

let container = null;

/** 화면 상단에 잠깐 떴다 사라지는 알림 */
export function toast(message, { type = 'info', duration = 1800 } = {}) {
  if (!container) {
    container = h('div', { class: 'toast-container' });
    document.getElementById('ui').append(container);
  }
  const el = h('div', { class: `toast toast-${type}` }, message);
  container.append(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}
