import { eventBus } from '../core/EventBus.js';
import { load, save, onExternalChange } from './storage.js';
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

/** 저장소의 최신값으로 갱신하고, 골드가 바뀌었으면 이벤트 발생 */
function refresh() {
  const prev = state.gold;
  state = readState();
  if (state.gold !== prev) eventBus.emit('gold:changed', { gold: state.gold });
}

// 다른 탭에서 골드가 바뀌면 이 탭에도 반영
onExternalChange(KEY, refresh);

const isValidAmount = (n) => Number.isSafeInteger(n) && n > 0;

/**
 * 골드 변경. 다른 탭의 변경을 덮어쓰지 않도록 최신값을 읽은 뒤 적용하고,
 * 저장에 성공했을 때만 반영한다. (실패 시 새로고침하면 되돌아가는 문제 방지)
 * @returns {boolean} 저장 성공 여부
 */
function apply(delta, reason) {
  const base = readState();
  const next = {
    gold: base.gold + delta,
    history: [...base.history, { delta, reason, gold: base.gold + delta, at: now() }].slice(-HISTORY_LIMIT),
  };
  if (!save(KEY, next)) {
    state = base;
    return false;
  }
  state = next;
  eventBus.emit('gold:changed', { gold: state.gold });
  return true;
}

export const wallet = {
  getGold() {
    return state.gold;
  },

  /** @returns {{ ok: boolean, gold: number, reason?: string }} 잔액 부족 시 ok=false */
  spendGold(amount, reason = 'spend') {
    if (!isValidAmount(amount)) return { ok: false, gold: state.gold, reason: 'invalid-amount' };
    refresh();
    if (state.gold < amount) return { ok: false, gold: state.gold, reason: 'not-enough-gold' };
    if (!apply(-amount, reason)) return { ok: false, gold: state.gold, reason: 'save-failed' };
    return { ok: true, gold: state.gold };
  },

  /** @returns {{ ok: boolean, gold: number, reason: string }} */
  addGold(amount, reason = 'reward') {
    if (!isValidAmount(amount)) return { ok: false, gold: state.gold, reason: 'invalid-amount' };
    if (!apply(amount, reason)) return { ok: false, gold: state.gold, reason: 'save-failed' };
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
