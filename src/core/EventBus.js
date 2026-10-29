/**
 * 모듈 간 통신용 전역 이벤트 버스.
 * 3D · UI · 게임 로직 사이의 결합도를 낮추기 위해 사용한다.
 */
class EventBus {
  #handlers = new Map();

  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(event, handler) {
    this.#handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    // 복사본을 순회한다: 핸들러 안에서 새로 등록된 핸들러가 같은 emit에서 바로 불리지 않도록
    const handlers = this.#handlers.get(event);
    if (handlers) [...handlers].forEach((handler) => handler(payload));
  }
}

export const eventBus = new EventBus();
