import { eventBus } from '../core/EventBus.js';

/**
 * 게임 로직(팀원 B) 연동 어댑터.
 *
 * UI는 이 객체만 호출한다. 현재는 메모리 기반 Mock 구현이며,
 * B 팀원의 #11(골드) / #13(도감 저장) 모듈이 머지되면 각 메서드를 실제 모듈 호출로 교체한다.
 *
 * 이벤트 계약
 *   gold:changed        { gold }        골드가 바뀔 때 (B #11과 동일)
 *   collection:changed  { collection }  도감이 바뀔 때
 */
const state = {
  gold: 1000,
  collection: {}, // { [dollId]: { count, obtainedAt } }
};

const emitGold = () => eventBus.emit('gold:changed', { gold: state.gold });

export const gameApi = {
  getGold() {
    return state.gold;
  },

  /** @returns {{ ok: boolean, gold: number }} 잔액 부족 시 ok=false */
  spendGold(amount) {
    if (state.gold < amount) return { ok: false, gold: state.gold };
    state.gold -= amount;
    emitGold();
    return { ok: true, gold: state.gold };
  },

  addGold(amount, reason) {
    state.gold += amount;
    emitGold();
    return { ok: true, gold: state.gold, reason };
  },

  getCollection() {
    return structuredClone(state.collection);
  },

  addDoll(dollId) {
    const entry = state.collection[dollId] ?? { count: 0, obtainedAt: Date.now() };
    entry.count += 1;
    state.collection[dollId] = entry;
    eventBus.emit('collection:changed', { collection: this.getCollection() });
  },
};

// 인형 획득 시 도감에 저장 (B #13 구현 시 해당 모듈에서 구독하도록 이전)
eventBus.on('doll:won', ({ dollId }) => gameApi.addDoll(dollId));
