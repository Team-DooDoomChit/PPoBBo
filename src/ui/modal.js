import { h } from './dom.js';

let current = null;

/**
 * 공용 모달. 한 번에 하나만 열리며, 새로 열면 이전 모달은 닫힌다.
 * @returns {{ el: HTMLElement, body: HTMLElement, close(): void }}
 */
export function openModal({ title, className = '', onClose }) {
  current?.close();

  const body = h('div', { class: 'modal-body' });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (current === modal) current = null;
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();

  const overlay = h(
    'div',
    { class: 'modal-overlay', onClick: (e) => e.target === overlay && close() },
    h(
      'div',
      { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('button', { class: 'btn-close', onClick: close, 'aria-label': '닫기' }, '✕'),
      h('h2', { class: 'modal-title' }, title),
      body,
    ),
  );

  document.getElementById('ui').append(overlay);
  document.addEventListener('keydown', onKey);

  const modal = { el: overlay, body, close };
  current = modal;
  return modal;
}
