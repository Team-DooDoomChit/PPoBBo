/**
 * 게임 데이터 저장소 (LocalStorage).
 *
 * - 키마다 { v, data } 형태로 저장해 버전이 바뀌면 기본값으로 초기화한다.
 * - LocalStorage를 쓸 수 없는 환경(시크릿 모드, 테스트)에서는 메모리에 저장한다.
 * - 나중에 DB로 바꿀 때는 load/save만 교체하면 된다. (#13)
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

/** 테스트용: 저장소 교체 (인자 없으면 새 메모리 저장소) */
export function useStorageBackend(next = createMemoryBackend()) {
  backend = next;
}

/** 저장된 값이 없거나, 깨졌거나, 버전이 다르면 fallback 반환 */
export function load(key, fallback) {
  try {
    const raw = backend.getItem(PREFIX + key);
    if (raw == null) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    if (parsed?.v !== STORAGE_VERSION) return structuredClone(fallback);
    return parsed.data;
  } catch {
    return structuredClone(fallback);
  }
}

export function save(key, data) {
  try {
    backend.setItem(PREFIX + key, JSON.stringify({ v: STORAGE_VERSION, data }));
    return true;
  } catch {
    return false; // 용량 초과 등: 게임은 계속 진행
  }
}

/**
 * 다른 탭에서 같은 키를 바꾸면 callback 호출 (브라우저 'storage' 이벤트).
 * 저장소 전체가 지워진 경우(e.key === null)도 포함한다.
 * @returns 해제 함수
 */
export function onExternalChange(key, callback) {
  const handler = (e) => {
    if (e.key === null || e.key === PREFIX + key) callback();
  };
  globalThis.addEventListener?.('storage', handler);
  return () => globalThis.removeEventListener?.('storage', handler);
}

export function remove(key) {
  try {
    backend.removeItem(PREFIX + key);
  } catch {
    /* 무시 */
  }
}
