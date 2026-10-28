import { eventBus } from '../core/EventBus.js';

/**
 * 화면 전환 관리.
 * 화면 팩토리: (ctx, params) => { el, dispose?, canLeave? }
 * canLeave()가 false를 반환하면 화면 전환을 막는다 (예: 게임 진행 중).
 */
export class ScreenRouter {
  #factories = new Map();
  #screen = null;

  constructor(root, ctx) {
    this.root = root;
    this.ctx = { ...ctx, router: this };
    this.current = null;
    this.previous = null;
  }

  register(name, factory) {
    this.#factories.set(name, factory);
    return this;
  }

  go(name, params = {}) {
    if (this.#screen?.canLeave?.() === false) return false;
    this.#screen?.dispose?.();
    this.#screen?.el.remove();

    this.previous = this.current;
    this.current = name;
    this.#screen = this.#factories.get(name)(this.ctx, params);
    this.#screen.el.classList.add('screen', `screen-${name}`);
    this.root.append(this.#screen.el);
    eventBus.emit('screen:changed', { name, params });
    return true;
  }

  back(fallback = 'main') {
    this.go(this.previous && this.previous !== this.current ? this.previous : fallback);
  }
}
