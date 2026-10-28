import { eventBus } from '../core/EventBus.js';
import { load, save } from './storage.js';
import { now } from './clock.js';

/**
 * 골드(재화) 지갑. (#11)
 *
 * 모든 골드 변경은 이 모듈을 거친다.
 * 변경 시 'gold:changed' { gold } 이벤트를 발생시킨다.
 */
export const INITIAL_GOLD = 1000;
const HISTORY_LIMIT = 50;
const KEY = 'wallet';

export const CHARGE_PACKAGES = Object.freeze([
  { id: 'krw-1000', price: 1000, gold: 1000, bonus: 0 },
  { id: 'krw-3000', price: 3000, gold: 3300, bonus: 10 },
  { id: 'krw-5000', price: 5000, gold: 5750, bonus: 15 },
  { id: 'krw-10000', price: 10000, gold: 12000, bonus: 20 },
]);

const defaultState = () => ({ gold: INITIAL_GOLD, history: [] });

let state = readState();

function readState() {
  const s = load(KEY, defaultState());
  // 손상된 값 방어
  if (!Number.isSafeInteger(s?.gold) || s.gold < 0) return defaultState();
  if (!Array.isArray(s.history)) s.history = [];
  return s;
}

const isValidAmount = (n) => Number.isSafeInteger(n) && n > 0;

function apply(delta, reason) {
  state.gold += delta;
  state.history.push({ delta, reason, gold: state.gold, at: now() });
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
  save(KEY, state);
  eventBus.emit('gold:changed', { gold: state.gold });
}

export const wallet = {
  getGold() {
    return state.gold;
  },

  /** @returns {{ ok: boolean, gold: number, reason?: string }} 잔액 부족 시 ok=false */
  spendGold(amount, reason = 'spend') {
    if (!isValidAmount(amount)) return { ok: false, gold: state.gold, reason: 'invalid-amount' };
    if (state.gold < amount) return { ok: false, gold: state.gold, reason: 'not-enough-gold' };
    apply(-amount, reason);
    return { ok: true, gold: state.gold };
  },

  /** @returns {{ ok: boolean, gold: number, reason: string }} */
  addGold(amount, reason = 'reward') {
    if (!isValidAmount(amount)) return { ok: false, gold: state.gold, reason: 'invalid-amount' };
    apply(amount, reason);
    return { ok: true, gold: state.gold, reason };
  },

  getChargePackages() {
    return CHARGE_PACKAGES.map((p) => ({ ...p }));
  },

  /** 실제 결제 연동 전까지는 결제 성공으로 간주한다. */
  chargeGold(packageId) {
    const pkg = CHARGE_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return { ok: false, reason: 'invalid-package' };
    return { ...this.addGold(pkg.gold, `charge:${pkg.id}`), amount: pkg.gold };
  },

  /** 최근 골드 변경 내역 (최신순) */
  getHistory() {
    return state.history.slice().reverse();
  },

  /** 테스트/디버그용: 저장소에서 다시 읽기 */
  reload() {
    state = readState();
  },
};
