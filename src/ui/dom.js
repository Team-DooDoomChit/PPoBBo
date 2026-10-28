/**
 * 간단한 DOM 생성 헬퍼.
 * h('button', { class: 'btn', onClick: fn }, '텍스트')
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') setStyle(el, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else if (value !== false && value != null) el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// CSS 변수(--name)는 el.style에 프로퍼티로 넣으면 적용되지 않아 setProperty를 써야 한다
function setStyle(el, styles) {
  for (const [name, value] of Object.entries(styles)) {
    if (name.startsWith('--')) el.style.setProperty(name, value);
    else el.style[name] = value;
  }
}

export const formatGold = (gold) => gold.toLocaleString('ko-KR');
