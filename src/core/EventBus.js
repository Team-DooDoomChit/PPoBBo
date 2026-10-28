/**
 * 모듈 간 통신용 전역 이벤트 버스.
 * 3D(A) ↔ UI(A) ↔ 게임 로직(B) 사이의 결합도를 낮추기 위해 사용한다.
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
    this.#handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

export const eventBus = new EventBus();
