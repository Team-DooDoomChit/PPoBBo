import { h } from './dom.js';

let current = null;

/**
 * 공용 모달. 한 번에 하나만 열리며, 새로 열면 이전 모달은 닫힌다.
 * @returns {{ el: HTMLElement, body: HTMLElement, close(): void }}
 */
export function openModal({ title, className = '', onClose }) {
  current?.close();

  // 닫을 때 원래 자리로 포커스를 돌려준다 (키보드 사용자)
  const previousFocus = document.activeElement;
  const body = h('div', { class: 'modal-body' });
  const closeBtn = h('button', { class: 'btn-close', onClick: () => close(), 'aria-label': '닫기' }, '✕');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (current === modal) current = null;
    onClose?.();
    previousFocus?.focus?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();

  const overlay = h(
    'div',
    { class: 'modal-overlay', onClick: (e) => e.target === overlay && close() },
    h(
      'div',
      { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      closeBtn,
      h('h2', { class: 'modal-title' }, title),
      body,
    ),
  );

  document.getElementById('ui').append(overlay);
  document.addEventListener('keydown', onKey);
  // 호출 측이 본문을 채운 뒤 주요 버튼(없으면 닫기)으로 포커스 이동
  queueMicrotask(() => (body.querySelector('.modal-action:not(:disabled)') ?? closeBtn).focus());

  const modal = { el: overlay, body, close };
  current = modal;
  return modal;
}
