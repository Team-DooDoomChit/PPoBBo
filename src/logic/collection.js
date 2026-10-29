import { eventBus } from '../core/EventBus.js';
import { DOLLS, getDoll } from '../data/dolls.js';
import { load, save, onExternalChange } from './storage.js';
import { now } from './clock.js';

/**
 * 뽑은 인형 저장 및 도감 데이터. (#13)
 *
 * 저장 형식: { [dollId]: { count, obtainedAt, lastObtainedAt } }
 * - 카탈로그(data/dolls.js)에 없는 ID는 새로 저장하지 않고 화면에도 보여주지 않지만,
 *   이미 저장된 기록은 지우지 않는다 (ID를 바꿨다가 되돌려도 복구되도록).
 * - 형식이 깨진 항목은 다음 저장 때 정리한다.
 * - 저장소는 storage.js를 거치므로 DB로 바꿀 때 load/save만 교체하면 된다.
 *
 * 이벤트: 'collection:changed' { collection }
 */
const KEY = 'collection';

function isValidEntry(e) {
  return (
    e &&
    Number.isSafeInteger(e.count) &&
    e.count > 0 &&
    Number.isFinite(e.obtainedAt) &&
    (e.lastObtainedAt === undefined || Number.isFinite(e.lastObtainedAt))
  );
}

/**
 * 저장된 기록 중 형식이 올바른 항목 전부 (카탈로그에 없는 ID도 포함).
 * 저장할 때는 이 값을 기준으로 해서, dolls.js에서 ID를 바꾸거나 빼도 기록이 지워지지 않게 한다.
 */
function readStored() {
  const raw = load(KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, entry]) => isValidEntry(entry)));
}

/** 화면에 보여줄 기록: 카탈로그에 있는 인형만 */
function readState() {
  return Object.fromEntries(Object.entries(readStored()).filter(([id]) => getDoll(id)));
}

const emitChanged = () => eventBus.emit('collection:changed', { collection: collection.getCollection() });

// 다른 탭에서 인형을 얻으면 이 탭의 도감에도 반영
onExternalChange(KEY, emitChanged);

export const collection = {
  /** @returns {{ [dollId]: { count, obtainedAt, lastObtainedAt } }} 복사본 */
  getCollection() {
    return structuredClone(readState());
  },

  /**
   * 인형 획득 기록. 매번 저장소에서 최신값을 읽어 다른 탭의 기록을 덮어쓰지 않는다.
   * @returns {{ ok: true, entry, isNew: boolean } | { ok: false, reason: 'unknown-doll' | 'save-failed' }}
   */
  addDoll(dollId) {
    if (!getDoll(dollId)) return { ok: false, reason: 'unknown-doll' };
    const stored = readStored(); // 카탈로그에서 빠진 인형 기록도 그대로 보존
    const at = now();
    const prev = stored[dollId];
    const entry = prev
      ? { ...prev, count: prev.count + 1, lastObtainedAt: at }
      : { count: 1, obtainedAt: at, lastObtainedAt: at };
    if (!save(KEY, { ...stored, [dollId]: entry })) return { ok: false, reason: 'save-failed' };
    emitChanged();
    return { ok: true, entry: { ...entry }, isNew: !prev };
  },

  /**
   * 수집률. machineId를 주면 해당 기계 인형만 계산한다.
   * @returns {{ owned: number, total: number, rate: number }} rate는 0~100 정수
   */
  getStats(machineId) {
    const state = readState();
    const pool = machineId ? DOLLS.filter((d) => d.machineId === machineId) : DOLLS;
    const owned = pool.filter((d) => state[d.id]).length;
    return { owned, total: pool.length, rate: pool.length ? Math.round((owned / pool.length) * 100) : 0 };
  },

  /** 도감 표시용 목록: 카탈로그 순서대로 보유 여부와 기록을 붙여 돌려준다 */
  getEntries(machineId) {
    const state = readState();
    return DOLLS.filter((d) => !machineId || d.machineId === machineId).map((doll) => ({
      doll,
      owned: Boolean(state[doll.id]),
      ...(state[doll.id] ?? { count: 0, obtainedAt: null, lastObtainedAt: null }),
    }));
  },
};

// 집게 게임에서 인형을 얻으면 도감에 저장
eventBus.on('doll:won', ({ dollId }) => {
  const result = collection.addDoll(dollId);
  if (!result.ok) {
    console.warn(`[collection] ${dollId} 저장 실패: ${result.reason}`);
    eventBus.emit('collection:error', { dollId, reason: result.reason });
  }
});
