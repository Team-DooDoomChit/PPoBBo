/**
 * 게임 데이터 저장소 (LocalStorage).
 *
 * - 키마다 { v, data } 형태로 저장해 버전이 바뀌면 기본값으로 초기화한다.
 * - LocalStorage를 쓸 수 없는 환경(시크릿 모드, 테스트)에서는 메모리에 저장한다.
 * - 나중에 DB로 바꿀 때는 load/save만 교체하면 된다. (#13)
 *
 * 저장 영역(scope) (#38)
 * - 게스트: 'ppobbo:<key>' (예전과 같은 키라 기존 기록이 그대로 이어진다)
 * - 로그인: 'ppobbo:u:<uid>:<key>' — 로그인하면 이 영역으로 바꿔 쓰고, 로그아웃하면 지운다.
 * - 게임 로직(wallet 등)은 영역을 몰라도 된다. load/save는 항상 지금 영역을 쓴다.
 */
const PREFIX = 'ppobbo:';
export const STORAGE_VERSION = 1;

function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function detectBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = `${PREFIX}__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return createMemoryBackend();
  }
}

let backend = detectBackend();
/** null = 게스트, 문자열 = 계정 영역 이름 (예: 'u:abc123') */
let scope = null;

const prefixOf = (s) => (s ? `${PREFIX}${s}:` : PREFIX);

/** 테스트용: 저장소 교체 (인자 없으면 새 메모리 저장소). 영역도 게스트로 돌린다. */
export function useStorageBackend(next = createMemoryBackend()) {
  backend = next;
  scope = null;
}

// ---------- 영역 지정 읽기/쓰기 (동기화 모듈용) ----------

/** 저장된 값. 없거나, 깨졌거나, 버전이 다르면 undefined */
function readFrom(s, key) {
  try {
    const raw = backend.getItem(prefixOf(s) + key);
    if (raw == null) return undefined;
    const parsed = JSON.parse(raw);
    return parsed?.v === STORAGE_VERSION ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeTo(s, key, data) {
  try {
    backend.setItem(prefixOf(s) + key, JSON.stringify({ v: STORAGE_VERSION, data }));
    return true;
  } catch {
    return false; // 용량 초과 등: 게임은 계속 진행
  }
}

function removeFrom(s, key) {
  try {
    backend.removeItem(prefixOf(s) + key);
  } catch {
    /* 무시 */
  }
}

/**
 * 지금 영역과 상관없이 특정 영역을 직접 읽고 쓴다. (클라우드 동기화용)
 * 여기로 쓴 값은 onSave 구독자에게 알리지 않는다. 화면 갱신이 필요하면 notifyChanged를 부른다.
 */
export const scoped = {
  has: (s, key) => readFrom(s, key) !== undefined,
  read: (s, key) => readFrom(s, key),
  write: (s, key, data) => writeTo(s, key, data),
  remove: (s, key) => removeFrom(s, key),
};

// ---------- 게임 로직용 (지금 영역) ----------

/** 저장된 값이 없거나, 깨졌거나, 버전이 다르면 fallback 반환 */
export function load(key, fallback) {
  const data = readFrom(scope, key);
  return data === undefined ? structuredClone(fallback) : data;
}

const saveListeners = new Set();

export function save(key, data) {
  if (!writeTo(scope, key, data)) return false;
  for (const listener of [...saveListeners]) {
    try {
      listener(key, scope);
    } catch (err) {
      console.warn('[storage] onSave 처리 실패', err);
    }
  }
  return true;
}

export function remove(key) {
  removeFrom(scope, key);
}

/**
 * save가 성공할 때마다 listener(key, scope) 호출. (클라우드 동기화가 바뀐 키를 모을 때 사용)
 * @returns 해제 함수
 */
export function onSave(listener) {
  saveListeners.add(listener);
  return () => saveListeners.delete(listener);
}

// ---------- 영역 전환 ----------

export function getScope() {
  return scope;
}

/** 영역을 바꾸고, 모든 키의 구독자에게 다시 읽으라고 알린다. */
export function setScope(next = null) {
  if (next === scope) return;
  scope = next;
  notifyChanged(null);
}

// ---------- 바깥에서 바뀐 값 알림 ----------

const changeListeners = new Set(); // { key, callback }

/** 이 탭 안에서 저장소 내용이 통째로 바뀌었을 때 (영역 전환, 클라우드 기록 반영). keys가 null이면 전부. */
export function notifyChanged(keys) {
  for (const entry of [...changeListeners]) {
    if (keys == null || keys.includes(entry.key)) entry.callback();
  }
}

/**
 * 같은 키가 바깥에서 바뀌면 callback 호출.
 * - 다른 탭에서 바꾼 경우 (브라우저 'storage' 이벤트, 저장소 전체가 지워진 e.key === null 포함)
 * - 로그인·로그아웃으로 영역이 바뀌거나 클라우드 기록이 반영된 경우 (notifyChanged)
 * @returns 해제 함수
 */
export function onExternalChange(key, callback) {
  const handler = (e) => {
    if (e.key === null || e.key === prefixOf(scope) + key) callback();
  };
  const entry = { key, callback };
  changeListeners.add(entry);
  globalThis.addEventListener?.('storage', handler);
  return () => {
    changeListeners.delete(entry);
    globalThis.removeEventListener?.('storage', handler);
  };
}
