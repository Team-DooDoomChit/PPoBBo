import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { eventBus } from '../../src/core/EventBus.js';
import { useStorageBackend, getScope, STORAGE_VERSION } from '../../src/logic/storage.js';
import { setClock } from '../../src/logic/clock.js';
import { wallet, INITIAL_GOLD } from '../../src/logic/wallet.js';
import { createAuth, auth as defaultAuth } from '../../src/integration/auth.js';
import { readFirebaseConfig, signInErrorReason } from '../../src/integration/firebase.js';

/** Firebase Auth 대신 쓰는 가짜 provider */
function createFakeProvider() {
  let listener = null;
  return {
    nextError: null,
    redirect: false,
    onChange(cb) {
      listener = cb;
      queueMicrotask(() => cb(null)); // Firebase처럼 처음 한 번 현재 상태로 부른다
      return () => (listener = null);
    },
    async signIn() {
      if (this.nextError) throw Object.assign(new Error('x'), { reason: this.nextError });
      if (this.redirect) return { redirect: true };
      listener?.({ uid: 'alice', name: '앨리스', photoUrl: 'https://example.com/a.png' });
      return {};
    },
    async signOut() {
      listener?.(null);
    },
  };
}

function createFakeRemote() {
  const docs = new Map();
  return {
    docs,
    async get(uid) {
      return structuredClone(docs.get(uid) ?? null);
    },
    async update(uid, fn) {
      const next = fn(structuredClone(docs.get(uid) ?? null));
      docs.set(uid, structuredClone(next));
      return structuredClone(next);
    },
  };
}

/** 이벤트 큐·비동기 받기가 끝날 때까지 */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));
};

let provider;
let remote;
let api;
let events;
let offs;

beforeEach(async () => {
  useStorageBackend();
  wallet.reload();
  setClock(() => 1_000);
  provider = createFakeProvider();
  remote = createFakeRemote();
  events = [];
  offs = ['auth:changed', 'auth:needs-merge', 'sync:status'].map((name) =>
    eventBus.on(name, (payload) => events.push([name, payload])),
  );
  api = createAuth({ provider, remote, syncOptions: { debounceMs: 60_000, retryMs: [60_000] } });
  await settle();
});

afterEach(() => {
  offs.forEach((off) => off());
  api._sync?.dispose();
});

test('Firebase 설정이 없으면 게스트 전용 (테스트·로컬 개발)', async () => {
  assert.equal(defaultAuth.enabled, false);
  const guest = createAuth();
  assert.equal(guest.enabled, false);
  assert.equal(guest.getUser(), null);
  assert.deepEqual(await guest.signInWithGoogle(), { ok: false, reason: 'disabled' });
  assert.deepEqual(await guest.signOut(), { ok: true, unsynced: false });
  assert.equal(guest.getSyncStatus(), 'off');
  // 게임은 그대로 동작
  assert.equal(wallet.addGold(10).ok, true);
});

test('환경 변수에서 Firebase 설정 읽기: 필수 값이 없으면 null', () => {
  assert.equal(readFirebaseConfig({}), null);
  assert.equal(readFirebaseConfig({ VITE_FIREBASE_API_KEY: 'k' }), null);
  assert.deepEqual(
    readFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'k',
      VITE_FIREBASE_AUTH_DOMAIN: 'd',
      VITE_FIREBASE_PROJECT_ID: 'p',
      VITE_FIREBASE_APP_ID: 'a',
    }),
    { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' },
  );
});

test('Firebase 오류 코드 → reason', () => {
  assert.equal(signInErrorReason('auth/popup-closed-by-user'), 'cancelled');
  assert.equal(signInErrorReason('auth/network-request-failed'), 'network');
  assert.equal(signInErrorReason('auth/unauthorized-domain'), 'unauthorized-domain');
  assert.equal(signInErrorReason('auth/whatever'), 'unknown');
});

test('로그인하면 auth:changed와 함께 사용자 정보, 기록은 계정으로', async () => {
  wallet.addGold(5);
  assert.deepEqual(await api.signInWithGoogle(), { ok: true });
  await settle();

  assert.deepEqual(api.getUser(), { uid: 'alice', name: '앨리스', photoUrl: 'https://example.com/a.png' });
  assert.deepEqual(
    events.find(([n]) => n === 'auth:changed'),
    ['auth:changed', { user: { uid: 'alice', name: '앨리스', photoUrl: 'https://example.com/a.png' } }],
  );
  assert.equal(getScope(), 'u:alice');
  assert.equal(remote.docs.get('alice').data.wallet.gold, INITIAL_GOLD + 5);
  assert.equal(api.getSyncStatus(), 'saved');
  assert.ok(events.some(([n, p]) => n === 'sync:status' && p.status === 'saved'));
});

test('로그인 실패 reason을 그대로 돌려준다', async () => {
  provider.nextError = 'cancelled';
  assert.deepEqual(await api.signInWithGoogle(), { ok: false, reason: 'cancelled' });
  assert.equal(api.getUser(), null);
});

test('팝업이 막혀 리다이렉트로 넘어가면 redirect: true', async () => {
  provider.redirect = true;
  assert.deepEqual(await api.signInWithGoogle(), { ok: true, redirect: true });
});

test('로그인 버튼을 여러 번 눌러도 요청은 하나', async () => {
  const a = api.signInWithGoogle();
  const b = api.signInWithGoogle();
  assert.equal(a, b);
  await a;
});

test('게스트·계정 기록이 둘 다 있으면 auth:needs-merge → migrateGuestData', async () => {
  remote.docs.set('alice', { v: STORAGE_VERSION, data: { wallet: { gold: 9000, history: [] } }, updatedAt: { wallet: 500 } });
  wallet.addGold(5);
  await api.signInWithGoogle();
  await settle();

  const merge = events.find(([n]) => n === 'auth:needs-merge');
  assert.ok(merge);
  assert.equal(merge[1].guest.gold, INITIAL_GOLD + 5);
  assert.equal(merge[1].cloud.gold, 9000);
  assert.equal(merge[1].cloud.savedAt, 500);

  assert.deepEqual(await api.migrateGuestData('use-cloud'), { ok: true });
  assert.equal(wallet.getGold(), 9000);
});

test('로그아웃하면 게스트 기록으로 돌아가고 계정 기록은 기기에 남지 않는다', async () => {
  await api.signInWithGoogle();
  await settle();
  wallet.addGold(77);

  assert.deepEqual(await api.signOut(), { ok: true, unsynced: false });
  await settle();

  assert.equal(api.getUser(), null);
  assert.equal(getScope(), null);
  assert.equal(wallet.getGold(), INITIAL_GOLD);
  assert.equal(remote.docs.get('alice').data.wallet.gold, INITIAL_GOLD + 77);
  assert.deepEqual(events.filter(([n]) => n === 'auth:changed').at(-1), ['auth:changed', { user: null }]);
  assert.equal(api.getSyncStatus(), 'off');
});
