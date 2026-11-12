import { scoped, setScope, onSave, notifyChanged, STORAGE_VERSION } from './storage.js';
import { now } from './clock.js';
import { INITIAL_GOLD } from './wallet.js';

/**
 * 로그인한 계정의 기록을 클라우드와 맞추는 동기화 엔진. (#38)
 *
 * Firebase를 직접 모른다. remote(아래 형태)만 주면 되므로 테스트에서는 가짜 백엔드를 쓴다.
 *   remote.get(uid)            → Promise<doc | null>
 *   remote.update(uid, fn)     → Promise<doc>   fn(현재 doc | null) → 새 doc (트랜잭션, 여러 번 불릴 수 있음)
 *   remote.subscribe?(uid, cb) → 해제 함수       다른 기기가 저장하면 cb(doc)
 *
 * 클라우드 문서 users/{uid}: { v, data: { wallet, attendance, nightShift, collection }, updatedAt: { [key]: ms } }
 *
 * 동작
 * - 게임 로직은 지금처럼 로컬(storage.js)에 동기로 저장한다. 로그인 중이면 저장된 키를 모아 짧게 기다렸다가 올린다.
 * - 로그인 직후 클라우드 기록을 받아 계정 영역에 넣고 화면을 갱신한다.
 * - 처음 받기 전(오프라인 등)에는 게스트 영역 그대로 플레이한다. 빈 기록이 클라우드 기록을 덮어쓰지 않도록.
 * - 이 기기에서 처음 로그인했는데 게스트 기록과 계정 기록이 둘 다 있으면 사용자에게 고르게 한다.
 * - 합치기 규칙: 도감은 합치고, 나머지는 나중에 저장한 쪽이 이긴다 (기기 시계 기준).
 * - 로그아웃하면 계정 기록을 이 기기에서 지우고 게스트 기록으로 돌아간다.
 *
 * 상태(onStatus): 'off'(게스트) | 'syncing' | 'saved' | 'offline' | 'error' | 'needs-merge'
 */
export const SYNC_KEYS = Object.freeze(['wallet', 'attendance', 'nightShift', 'collection']);
const META_KEY = 'sync'; // 계정 영역에 { updatedAt: { [key]: ms }, dirty: [key] }
const userScope = (uid) => `u:${uid}`;

// ---------- 합치기 규칙 (순수 함수) ----------

const isEntry = (e) => e && Number.isSafeInteger(e.count) && e.count > 0 && Number.isFinite(e.obtainedAt);
const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** 도감 합치기: 양쪽 인형을 모두 남기고, 개수는 큰 쪽, 첫 획득은 이른 쪽, 마지막 획득은 늦은 쪽 */
export function mergeCollection(a, b) {
  const out = isMap(a) ? { ...a } : {};
  if (!isMap(b)) return out;
  for (const [id, e] of Object.entries(b)) {
    const p = out[id];
    if (!isEntry(e)) continue;
    if (!isEntry(p)) {
      out[id] = e;
      continue;
    }
    out[id] = {
      count: Math.max(p.count, e.count),
      obtainedAt: Math.min(p.obtainedAt, e.obtainedAt),
      lastObtainedAt: Math.max(p.lastObtainedAt ?? p.obtainedAt, e.lastObtainedAt ?? e.obtainedAt),
    };
  }
  return out;
}

/**
 * 키 하나 합치기. 각 값은 { value, at } 또는 undefined(기록 없음).
 * 도감은 합치고, 나머지는 at이 큰 쪽(같으면 local).
 */
export function mergeKey(key, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  if (key === 'collection') {
    return { value: mergeCollection(local.value, remote.value), at: Math.max(local.at, remote.at) };
  }
  return remote.at > local.at ? remote : local;
}

/** 클라우드 문서 정리. 형식이 다르거나 버전이 다르면 null (없는 것으로 본다) */
export function normalizeDoc(doc) {
  if (!isMap(doc) || doc.v !== STORAGE_VERSION || !isMap(doc.data)) return null;
  const data = {};
  const updatedAt = {};
  for (const key of SYNC_KEYS) {
    if (doc.data[key] === undefined) continue;
    data[key] = doc.data[key];
    updatedAt[key] = Number.isFinite(doc.updatedAt?.[key]) ? doc.updatedAt[key] : 0;
  }
  return { v: STORAGE_VERSION, data, updatedAt };
}

const emptyDoc = () => ({ v: STORAGE_VERSION, data: {}, updatedAt: {} });
const entryOf = (doc, key) => (doc && doc.data[key] !== undefined ? { value: doc.data[key], at: doc.updatedAt[key] ?? 0 } : undefined);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 기록 고르기 모달에 보여줄 요약 */
export function summarize(data = {}, updatedAt = null) {
  const coll = isMap(data.collection) ? data.collection : {};
  const summary = {
    gold: Number.isSafeInteger(data.wallet?.gold) ? data.wallet.gold : INITIAL_GOLD,
    dolls: Object.values(coll).filter(isEntry).length,
    streak: Number.isSafeInteger(data.attendance?.streak) ? data.attendance.streak : 0,
  };
  if (updatedAt) summary.savedAt = Math.max(0, ...Object.values(updatedAt)) || null;
  return summary;
}

// ---------- 동기화 엔진 ----------

const DEFAULT_RETRY_MS = [2000, 5000, 15000, 60000];

export function createCloudSync({
  remote,
  debounceMs = 1500,
  retryMs = DEFAULT_RETRY_MS,
  isOnline = () => globalThis.navigator?.onLine !== false,
  onStatus = () => {},
  onNeedsMerge = () => {},
} = {}) {
  let uid = null;
  let pulled = false; // 이 계정의 클라우드 기록을 받은 적이 있는지 (= 계정 영역을 쓰는 중)
  let pendingMerge = null; // { doc } 사용자가 고르기를 기다리는 중
  let generation = 0; // 로그아웃·계정 전환 뒤에 도착한 이전 요청 결과를 버리기 위한 번호
  let status = 'off';
  let flushTimer = null;
  let retryTimer = null;
  let retryCount = 0;
  let inflight = null;
  let flushAgain = false;
  let unsubscribeRemote = null;

  const setStatus = (next) => {
    if (next === status) return;
    status = next;
    onStatus(next);
  };

  const scopeName = () => userScope(uid);

  function readMeta() {
    const m = scoped.read(scopeName(), META_KEY);
    return {
      updatedAt: isMap(m?.updatedAt) ? { ...m.updatedAt } : {},
      dirty: Array.isArray(m?.dirty) ? m.dirty.filter((k) => SYNC_KEYS.includes(k)) : [],
    };
  }
  const writeMeta = (meta) => scoped.write(scopeName(), META_KEY, meta);

  const localEntry = (meta, key) => {
    const value = scoped.read(scopeName(), key);
    return value === undefined ? undefined : { value, at: meta.updatedAt[key] ?? 0 };
  };

  const hasGuestData = () => SYNC_KEYS.some((k) => scoped.has(null, k));
  const readGuest = () => Object.fromEntries(SYNC_KEYS.filter((k) => scoped.has(null, k)).map((k) => [k, scoped.read(null, k)]));

  // ---------- 타이머 ----------

  function clearTimers() {
    clearTimeout(flushTimer);
    clearTimeout(retryTimer);
    flushTimer = retryTimer = null;
  }

  function scheduleFlush() {
    if (flushTimer) return; // 짧게 모아서 한 번에 쓴다
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, debounceMs);
  }

  function onFailure(err) {
    setStatus(isOnline() ? 'error' : 'offline');
    if (isOnline()) console.warn('[cloudSync] 동기화 실패', err);
    clearTimeout(retryTimer);
    const delay = retryMs[Math.min(retryCount, retryMs.length - 1)];
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retry();
    }, delay);
  }

  function retry() {
    if (!uid || pendingMerge) return Promise.resolve();
    return pulled ? flush() : pull();
  }

  // 다시 연결되면 바로 올린다
  const handleOnline = () => {
    retryCount = 0;
    retry();
  };
  // 탭을 닫거나 숨길 때 모아 둔 것을 바로 올린다 (최선)
  const handleHidden = () => {
    if (globalThis.document?.visibilityState === 'hidden' && flushTimer) flush();
  };
  globalThis.addEventListener?.('online', handleOnline);
  globalThis.document?.addEventListener?.('visibilitychange', handleHidden);

  // 로그인 중 게임 로직이 저장하면 바뀐 키로 표시하고 올리기 예약
  const offSave = onSave((key, s) => {
    if (!uid || !pulled || s !== scopeName() || !SYNC_KEYS.includes(key)) return;
    const meta = readMeta();
    meta.updatedAt[key] = now();
    if (!meta.dirty.includes(key)) meta.dirty.push(key);
    writeMeta(meta);
    setStatus('syncing');
    scheduleFlush();
  });

  // ---------- 로컬 ↔ 클라우드 ----------

  /**
   * 클라우드 문서를 계정 영역에 반영. 키마다 mergeKey 규칙으로 합친다.
   * 로컬이 바뀐 키는 화면 갱신을 알리고, 합친 결과가 클라우드와 다르면 다시 올리도록 표시한다.
   */
  function applyRemote(doc) {
    const meta = readMeta();
    const changed = [];
    for (const key of SYNC_KEYS) {
      const local = localEntry(meta, key);
      const remoteEntry = entryOf(doc, key);
      const merged = mergeKey(key, local, remoteEntry);
      if (!merged) continue;
      if (!local || !same(local.value, merged.value)) {
        scoped.write(scopeName(), key, merged.value);
        changed.push(key);
      }
      meta.updatedAt[key] = merged.at;
      if (!remoteEntry || !same(remoteEntry.value, merged.value)) {
        if (!meta.dirty.includes(key)) meta.dirty.push(key);
      }
    }
    writeMeta(meta);
    if (changed.length) notifyChanged(changed);
    if (meta.dirty.length) scheduleFlush();
    else if (!inflight) setStatus('saved');
  }

  /** 계정 영역을 클라우드 기록으로 채우고 계정 영역으로 전환 */
  function adoptCloud(doc) {
    const s = scopeName();
    for (const key of SYNC_KEYS) {
      if (doc.data[key] === undefined) scoped.remove(s, key);
      else scoped.write(s, key, doc.data[key]);
    }
    writeMeta({ updatedAt: { ...doc.updatedAt }, dirty: [] });
    pulled = true;
    setScope(s);
  }

  /** 게스트 기록을 계정 영역으로 옮기고(게스트 쪽은 지움) 올리도록 표시 */
  function adoptGuest() {
    const s = scopeName();
    const guest = readGuest();
    const at = now();
    const meta = { updatedAt: {}, dirty: [] };
    for (const key of SYNC_KEYS) {
      if (guest[key] === undefined) {
        scoped.remove(s, key);
        continue;
      }
      scoped.write(s, key, guest[key]);
      meta.updatedAt[key] = at;
      meta.dirty.push(key);
    }
    writeMeta(meta);
    // 옮긴 기록이 게스트에도 남으면 로그아웃 후 같은 골드로 다른 계정에 또 옮길 수 있다
    for (const key of SYNC_KEYS) scoped.remove(null, key);
    pulled = true;
    setScope(s);
  }

  function startRealtime(gen) {
    unsubscribeRemote?.();
    unsubscribeRemote =
      remote.subscribe?.(uid, (raw) => {
        if (gen !== generation || !pulled) return;
        const doc = normalizeDoc(raw);
        if (doc) applyRemote(doc);
      }) ?? null;
  }

  /** 클라우드 기록 받기 */
  async function pull() {
    const gen = generation;
    setStatus('syncing');
    let doc;
    try {
      doc = normalizeDoc(await remote.get(uid));
    } catch (err) {
      if (gen === generation) onFailure(err);
      return;
    }
    if (gen !== generation) return;
    retryCount = 0;

    if (!pulled) {
      if (doc && hasGuestData()) {
        pendingMerge = { doc };
        setStatus('needs-merge');
        onNeedsMerge({ guest: summarize(readGuest()), cloud: summarize(doc.data, doc.updatedAt) });
        return;
      }
      if (doc) adoptCloud(doc);
      else adoptGuest(); // 처음 로그인한 계정: 이 기기의 게스트 기록이 계정 기록이 된다
    }
    applyRemote(doc ?? emptyDoc());
    startRealtime(gen);
    if (readMeta().dirty.length) await flush();
  }

  /** 바뀐 키를 클라우드에 올리기. 동시에 하나만 실행하고, 실행 중에 또 불리면 끝난 뒤 한 번 더 */
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!uid || !pulled || pendingMerge) return Promise.resolve();
    if (inflight) {
      flushAgain = true;
      return inflight;
    }
    inflight = upload().finally(() => {
      inflight = null;
      if (flushAgain) {
        flushAgain = false;
        flush();
      }
    });
    return inflight;
  }

  async function upload() {
    const gen = generation;
    const meta = readMeta();
    if (!meta.dirty.length) {
      setStatus('saved');
      return;
    }
    const sent = {};
    const local = {};
    for (const key of meta.dirty) {
      sent[key] = meta.updatedAt[key] ?? 0;
      local[key] = localEntry(meta, key);
    }
    setStatus('syncing');

    let result;
    try {
      result = await remote.update(uid, (current) => {
        const doc = normalizeDoc(current) ?? emptyDoc();
        for (const key of Object.keys(local)) {
          const merged = mergeKey(key, local[key], entryOf(doc, key));
          if (!merged) continue;
          doc.data[key] = merged.value;
          doc.updatedAt[key] = merged.at;
        }
        return doc;
      });
    } catch (err) {
      if (gen === generation) onFailure(err);
      return;
    }
    if (gen !== generation) return;
    retryCount = 0;

    // 올리는 사이에 다시 바뀐 키는 dirty로 남긴다
    const after = readMeta();
    after.dirty = after.dirty.filter((k) => !(k in sent) || after.updatedAt[k] !== sent[k]);
    writeMeta(after);
    // 클라우드 쪽이 이긴 키(다른 기기가 더 나중에 저장)나 합쳐진 도감을 로컬에 반영
    const doc = normalizeDoc(result);
    if (doc) applyRemote(doc);
    if (!readMeta().dirty.length) setStatus('saved');
  }

  // ---------- 공개 API ----------

  return {
    /** 로그인: 이 기기에 계정 기록이 있으면 바로 쓰고, 클라우드 기록을 받아 맞춘다. 받기가 끝나면 resolve */
    start(nextUid) {
      if (!nextUid || nextUid === uid) return Promise.resolve();
      if (uid) throw new Error('cloudSync: 먼저 stop()을 불러야 합니다');
      uid = nextUid;
      generation += 1;
      retryCount = 0;
      pulled = scoped.has(scopeName(), META_KEY);
      if (pulled) setScope(scopeName()); // 지난번에 받은 기록으로 먼저 보여준다
      return pull();
    },

    /**
     * 로그아웃: 남은 변경을 올려 보고(온라인일 때, 최대 flushTimeoutMs), 계정 기록을 이 기기에서 지운 뒤 게스트로.
     * @returns {Promise<{ unsynced: boolean }>} 올리지 못하고 지운 변경이 있으면 true
     */
    async stop({ flushTimeoutMs = 3000 } = {}) {
      if (!uid) return { unsynced: false };
      clearTimers();
      if (pulled && readMeta().dirty.length && isOnline()) {
        let timer;
        await Promise.race([flush(), new Promise((r) => (timer = setTimeout(r, flushTimeoutMs)))]);
        clearTimeout(timer);
      }
      const unsynced = pulled && readMeta().dirty.length > 0;
      generation += 1;
      clearTimers();
      unsubscribeRemote?.();
      unsubscribeRemote = null;
      const s = scopeName();
      for (const key of [...SYNC_KEYS, META_KEY]) scoped.remove(s, key);
      uid = null;
      pulled = false;
      pendingMerge = null;
      setScope(null);
      setStatus('off');
      return { unsynced };
    },

    /**
     * 게스트·계정 기록이 둘 다 있을 때 고르기.
     * - 'upload': 이 기기(게스트) 기록을 계정으로 옮긴다. 골드·출석 등은 게스트 쪽, 도감은 합친다.
     * - 'use-cloud': 계정 기록을 쓴다. 게스트 기록은 이 기기에 그대로 남아 로그아웃하면 돌아온다.
     */
    async migrateGuestData(choice) {
      if (!pendingMerge) return { ok: false, reason: 'no-pending' };
      if (choice !== 'upload' && choice !== 'use-cloud') return { ok: false, reason: 'invalid-choice' };
      const { doc } = pendingMerge;
      pendingMerge = null;
      if (choice === 'upload') adoptGuest();
      else adoptCloud(doc);
      applyRemote(doc);
      startRealtime(generation);
      await flush();
      return { ok: true };
    },

    flush,
    /** 지금 다시 시도 (받기 전이면 받기, 아니면 올리기). 'online' 이벤트에서도 불린다 */
    retry,
    getStatus: () => status,
    getUid: () => uid,
    isPendingMerge: () => Boolean(pendingMerge),

    /** 테스트용: 구독·타이머 정리 */
    dispose() {
      clearTimers();
      unsubscribeRemote?.();
      offSave();
      globalThis.removeEventListener?.('online', handleOnline);
      globalThis.document?.removeEventListener?.('visibilitychange', handleHidden);
    },
  };
}
