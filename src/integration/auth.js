import { eventBus } from '../core/EventBus.js';
import { createCloudSync } from '../logic/cloudSync.js';
import { readFirebaseConfig, createFirebaseBackend } from './firebase.js';

/**
 * 구글 로그인(선택)과 계정 기록 동기화. (#38) UI(#37)는 이 객체만 호출한다.
 *
 * 게스트 플레이가 기본이다. 로그인하지 않으면 지금처럼 이 기기(LocalStorage)에만 저장하고,
 * 로그인하면 같은 기록을 Firestore users/{uid}에 올려 다른 기기에서도 이어 한다.
 * Firebase 설정(VITE_FIREBASE_*)이 없으면 enabled=false, 게스트로만 동작한다.
 *
 *   auth.enabled                    // 로그인 기능을 쓸 수 있는지 (false면 로그인 버튼을 숨긴다)
 *   auth.getUser()                  // { uid, name, photoUrl } | null
 *   auth.signInWithGoogle()         // Promise<{ ok: true, redirect? } | { ok: false, reason }>
 *   auth.signOut()                  // Promise<{ ok: true, unsynced }>
 *   auth.migrateGuestData(choice)   // 'upload' | 'use-cloud' → Promise<{ ok } | { ok: false, reason }>
 *   auth.getSyncStatus()            // 'off' | 'syncing' | 'saved' | 'offline' | 'error' | 'needs-merge'
 *
 * 이벤트
 *   auth:changed      { user }           로그인·로그아웃
 *   auth:needs-merge  { guest, cloud }   게스트·계정 기록이 둘 다 있음 → migrateGuestData로 고르기
 *                                        각각 { gold, dolls, streak }, cloud에는 savedAt(ms)도 있음
 *   sync:status       { status }         동기화 상태
 */
export function createAuth({ provider = null, remote = null, syncOptions = {} } = {}) {
  const enabled = Boolean(provider && remote);
  let user = null;
  let signingIn = null;

  const sync = enabled
    ? createCloudSync({
        remote,
        ...syncOptions,
        onStatus: (status) => eventBus.emit('sync:status', { status }),
        onNeedsMerge: (payload) => eventBus.emit('auth:needs-merge', payload),
      })
    : null;

  // 로그인 상태 변경과 로그아웃이 겹치지 않도록 순서대로 처리
  let queue = Promise.resolve();
  const enqueue = (job) => {
    const run = queue.then(job);
    queue = run.catch((err) => console.warn('[auth]', err));
    return run;
  };

  const emitChanged = () => eventBus.emit('auth:changed', { user: api.getUser() });

  async function handleChange(next) {
    if (next?.uid === user?.uid) {
      if (next) user = { ...next }; // 이름·사진만 바뀐 경우
      return;
    }
    if (user) await sync.stop();
    user = next ? { ...next } : null;
    emitChanged();
    // 기록 받기는 기다리지 않는다 (오프라인이면 오래 걸릴 수 있음). 결과는 gold:changed 등으로 온다.
    if (user) sync.start(user.uid).catch((err) => console.warn('[auth] 기록 받기 실패', err));
  }

  const api = {
    enabled,

    getUser: () => (user ? { ...user } : null),

    signInWithGoogle() {
      if (!enabled) return Promise.resolve({ ok: false, reason: 'disabled' });
      if (user) return Promise.resolve({ ok: true });
      signingIn ??= provider
        .signIn()
        .then(
          (r) => (r?.redirect ? { ok: true, redirect: true } : { ok: true }),
          (err) => ({ ok: false, reason: err?.reason ?? 'unknown' }),
        )
        .finally(() => (signingIn = null));
      return signingIn;
    },

    signOut() {
      if (!enabled) return Promise.resolve({ ok: true, unsynced: false });
      return enqueue(async () => {
        if (!user) return { ok: true, unsynced: false };
        const { unsynced } = await sync.stop();
        user = null;
        emitChanged();
        await provider.signOut().catch((err) => console.warn('[auth] 로그아웃 실패', err));
        return { ok: true, unsynced };
      });
    },

    migrateGuestData(choice) {
      if (!enabled) return Promise.resolve({ ok: false, reason: 'disabled' });
      return sync.migrateGuestData(choice);
    },

    getSyncStatus: () => (sync ? sync.getStatus() : 'off'),

    /** 테스트용 */
    _sync: sync,
  };

  if (enabled) provider.onChange((next) => enqueue(() => handleChange(next)));

  return api;
}

function createDefaultAuth() {
  const config = readFirebaseConfig(import.meta.env ?? {});
  return config ? createAuth(createFirebaseBackend(config)) : createAuth();
}

export const auth = createDefaultAuth();
