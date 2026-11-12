import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { eventBus } from '../../src/core/EventBus.js';
import { useStorageBackend, scoped, getScope, STORAGE_VERSION } from '../../src/logic/storage.js';
import { setClock } from '../../src/logic/clock.js';
import { wallet, INITIAL_GOLD } from '../../src/logic/wallet.js';
import { collection } from '../../src/logic/collection.js';
import { createCloudSync, mergeCollection, mergeKey, normalizeDoc } from '../../src/logic/cloudSync.js';

/** Firestore 대신 쓰는 가짜 백엔드. online=false면 모든 요청이 실패한다. */
function createFakeRemote() {
  const docs = new Map();
  const subs = new Map();
  const notify = (uid) => (subs.get(uid) ?? []).forEach((cb) => cb(structuredClone(docs.get(uid))));
  return {
    docs,
    online: true,
    writes: 0,
    async get(uid) {
      if (!this.online) throw new Error('offline');
      return structuredClone(docs.get(uid) ?? null);
    },
    async update(uid, fn) {
      if (!this.online) throw new Error('offline');
      const next = fn(structuredClone(docs.get(uid) ?? null));
      docs.set(uid, structuredClone(next));
      this.writes += 1;
      notify(uid);
      return structuredClone(next);
    },
    subscribe(uid, cb) {
      if (!subs.has(uid)) subs.set(uid, []);
      subs.get(uid).push(cb);
      return () => subs.set(uid, subs.get(uid).filter((f) => f !== cb));
    },
    /** 다른 기기가 저장한 것처럼 문서를 바꾸고 구독자에게 알림 */
    otherDevice(uid, patch) {
      const doc = structuredClone(docs.get(uid) ?? { v: STORAGE_VERSION, data: {}, updatedAt: {} });
      for (const [key, { value, at }] of Object.entries(patch)) {
        doc.data[key] = value;
        doc.updatedAt[key] = at;
      }
      docs.set(uid, doc);
      notify(uid);
    },
  };
}

const cloudDoc = (data, at = 500) => ({
  v: STORAGE_VERSION,
  data,
  updatedAt: Object.fromEntries(Object.keys(data).map((k) => [k, at])),
});

let remote;
let sync;
let statuses;
let merges;
let t;

beforeEach(() => {
  useStorageBackend();
  wallet.reload();
  t = 1_000;
  setClock(() => t);
  remote = createFakeRemote();
  statuses = [];
  merges = [];
  sync = createCloudSync({
    remote,
    debounceMs: 60_000, // 테스트에서는 flush()를 직접 부른다
    retryMs: [60_000],
    isOnline: () => remote.online,
    onStatus: (s) => statuses.push(s),
    onNeedsMerge: (p) => merges.push(p),
  });
});

afterEach(() => sync.dispose());

// ---------- 합치기 규칙 ----------

test('도감 합치기: 양쪽 인형을 모두 남기고 개수는 큰 쪽, 첫 획득은 이른 쪽', () => {
  const a = { cat: { count: 2, obtainedAt: 100, lastObtainedAt: 300 }, dog: { count: 1, obtainedAt: 50 } };
  const b = { cat: { count: 1, obtainedAt: 80, lastObtainedAt: 200 }, fox: { count: 3, obtainedAt: 10, lastObtainedAt: 20 } };
  assert.deepEqual(mergeCollection(a, b), {
    cat: { count: 2, obtainedAt: 80, lastObtainedAt: 300 },
    dog: { count: 1, obtainedAt: 50 },
    fox: { count: 3, obtainedAt: 10, lastObtainedAt: 20 },
  });
});

test('도감 합치기: 깨진 항목은 무시', () => {
  assert.deepEqual(mergeCollection({ cat: { count: 1, obtainedAt: 1 } }, { cat: { count: 'x' }, dog: null }), {
    cat: { count: 1, obtainedAt: 1 },
  });
});

test('골드 등은 나중에 저장한 쪽이 이긴다 (같으면 로컬)', () => {
  const local = { value: { gold: 10 }, at: 100 };
  assert.equal(mergeKey('wallet', local, { value: { gold: 20 }, at: 200 }).value.gold, 20);
  assert.equal(mergeKey('wallet', local, { value: { gold: 20 }, at: 50 }).value.gold, 10);
  assert.equal(mergeKey('wallet', local, { value: { gold: 20 }, at: 100 }).value.gold, 10);
  assert.equal(mergeKey('wallet', undefined, local), local);
});

test('버전이 다르거나 형식이 깨진 클라우드 문서는 없는 것으로 본다', () => {
  assert.equal(normalizeDoc(null), null);
  assert.equal(normalizeDoc({ v: 999, data: {} }), null);
  assert.deepEqual(normalizeDoc({ v: STORAGE_VERSION, data: { wallet: { gold: 1 }, junk: 1 } }), {
    v: STORAGE_VERSION,
    data: { wallet: { gold: 1 } },
    updatedAt: { wallet: 0 },
  });
});

// ---------- 로그인 ----------

test('처음 로그인한 계정: 게스트 기록을 계정으로 옮기고 게스트 쪽은 비운다', async () => {
  wallet.addGold(500);
  collection.addDoll('chick-yellow');

  await sync.start('alice');

  assert.equal(getScope(), 'u:alice');
  assert.equal(wallet.getGold(), INITIAL_GOLD + 500);
  assert.equal(remote.docs.get('alice').data.wallet.gold, INITIAL_GOLD + 500);
  assert.ok(remote.docs.get('alice').data.collection['chick-yellow']);
  assert.equal(scoped.has(null, 'wallet'), false, '게스트 기록은 계정으로 옮겨져 사라진다');
  assert.equal(sync.getStatus(), 'saved');
});

test('게스트 기록이 없으면 클라우드 기록을 받아 화면 갱신 이벤트를 낸다', async () => {
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 7777, history: [] } }));
  const seen = [];
  const off = eventBus.on('gold:changed', ({ gold }) => seen.push(gold));

  await sync.start('alice');
  off();

  assert.equal(wallet.getGold(), 7777);
  assert.deepEqual(seen, [7777]);
  assert.equal(merges.length, 0);
});

test('게스트·계정 기록이 둘 다 있으면 needs-merge로 멈추고, 그동안은 게스트로 플레이', async () => {
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 7777, history: [] } }));
  wallet.addGold(100);

  await sync.start('alice');

  assert.equal(sync.getStatus(), 'needs-merge');
  assert.deepEqual(merges[0].guest, { gold: INITIAL_GOLD + 100, dolls: 0, streak: 0 });
  assert.equal(merges[0].cloud.gold, 7777);
  assert.equal(getScope(), null);
  assert.equal(wallet.getGold(), INITIAL_GOLD + 100);
});

test("migrateGuestData('use-cloud'): 계정 기록을 쓰고 게스트 기록은 남겨 둔다", async () => {
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 7777, history: [] } }));
  wallet.addGold(100);
  await sync.start('alice');

  assert.deepEqual(await sync.migrateGuestData('use-cloud'), { ok: true });
  assert.equal(wallet.getGold(), 7777);
  assert.equal(remote.docs.get('alice').data.wallet.gold, 7777);

  await sync.stop();
  assert.equal(wallet.getGold(), INITIAL_GOLD + 100, '로그아웃하면 게스트 기록으로 돌아간다');
});

test("migrateGuestData('upload'): 골드는 게스트 쪽, 도감은 합친다", async () => {
  remote.docs.set(
    'alice',
    cloudDoc({ wallet: { gold: 7777, history: [] }, collection: { 'cat-scarf': { count: 1, obtainedAt: 10, lastObtainedAt: 10 } } }),
  );
  wallet.addGold(100);
  collection.addDoll('chick-yellow');
  await sync.start('alice');

  t = 2_000;
  assert.deepEqual(await sync.migrateGuestData('upload'), { ok: true });

  assert.equal(wallet.getGold(), INITIAL_GOLD + 100);
  assert.deepEqual(Object.keys(collection.getCollection()).sort(), ['cat-scarf', 'chick-yellow']);
  const doc = remote.docs.get('alice');
  assert.equal(doc.data.wallet.gold, INITIAL_GOLD + 100);
  assert.deepEqual(Object.keys(doc.data.collection).sort(), ['cat-scarf', 'chick-yellow']);
  assert.equal(scoped.has(null, 'wallet'), false);
});

test('고를 게 없거나 잘못된 선택이면 실패', async () => {
  assert.deepEqual(await sync.migrateGuestData('upload'), { ok: false, reason: 'no-pending' });
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 1, history: [] } }));
  wallet.addGold(1);
  await sync.start('alice');
  assert.deepEqual(await sync.migrateGuestData('both'), { ok: false, reason: 'invalid-choice' });
});

// ---------- 저장 동기화 ----------

test('로그인 중 저장하면 바뀐 키를 모아 클라우드에 올린다', async () => {
  await sync.start('alice');
  const before = remote.writes;

  t = 2_000;
  wallet.addGold(10);
  wallet.addGold(20);
  assert.equal(sync.getStatus(), 'syncing');
  await sync.flush();

  assert.equal(remote.writes, before + 1, '두 번 저장해도 한 번에 올린다');
  assert.equal(remote.docs.get('alice').data.wallet.gold, INITIAL_GOLD + 30);
  assert.equal(remote.docs.get('alice').updatedAt.wallet, 2_000);
  assert.equal(sync.getStatus(), 'saved');
});

test('오프라인이면 로컬에만 저장하고, 다시 연결되면 올린다', async () => {
  await sync.start('alice');
  remote.online = false;

  wallet.addGold(10);
  await sync.flush();
  assert.equal(sync.getStatus(), 'offline');
  assert.equal(wallet.getGold(), INITIAL_GOLD + 10, '로컬에는 저장돼 있다');
  assert.equal(remote.docs.get('alice')?.data.wallet, undefined);

  remote.online = true;
  await sync.retry();
  assert.equal(remote.docs.get('alice').data.wallet.gold, INITIAL_GOLD + 10);
  assert.equal(sync.getStatus(), 'saved');
});

test('로그인할 때 오프라인이면 게스트로 계속 플레이하고, 연결되면 다시 받는다', async () => {
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 7777, history: [] } }));
  remote.online = false;
  await sync.start('alice');
  assert.equal(sync.getStatus(), 'offline');
  assert.equal(getScope(), null);
  assert.equal(wallet.getGold(), INITIAL_GOLD);

  remote.online = true;
  await sync.retry(); // 브라우저에서는 'online' 이벤트로 불린다
  assert.equal(getScope(), 'u:alice');
  assert.equal(wallet.getGold(), 7777);
});

// ---------- 두 기기 ----------

test('다른 기기가 나중에 저장한 골드는 이 기기에 반영되고, 도감은 합쳐진다', async () => {
  await sync.start('alice');
  t = 2_000;
  collection.addDoll('chick-yellow');
  await sync.flush();

  remote.otherDevice('alice', {
    wallet: { value: { gold: 4242, history: [] }, at: 3_000 },
    collection: { value: { 'cat-scarf': { count: 1, obtainedAt: 2_500, lastObtainedAt: 2_500 } }, at: 2_500 },
  });

  assert.equal(wallet.getGold(), 4242);
  assert.deepEqual(Object.keys(collection.getCollection()).sort(), ['cat-scarf', 'chick-yellow']);
  await sync.flush(); // 합친 도감을 다시 올림
  assert.deepEqual(Object.keys(remote.docs.get('alice').data.collection).sort(), ['cat-scarf', 'chick-yellow']);
});

test('이 기기가 더 나중에 저장했으면 이 기기 골드가 이긴다', async () => {
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 100, history: [] } }, 500));
  await sync.start('alice');

  remote.online = false;
  t = 5_000;
  wallet.addGold(1); // 101, at 5000 (오프라인)
  remote.otherDevice('alice', { wallet: { value: { gold: 999, history: [] }, at: 3_000 } });
  remote.online = true;
  await sync.flush();

  assert.equal(wallet.getGold(), 101);
  assert.equal(remote.docs.get('alice').data.wallet.gold, 101);
});

// ---------- 로그아웃 ----------

test('로그아웃: 남은 변경을 올리고 계정 기록을 이 기기에서 지운 뒤 게스트로', async () => {
  await sync.start('alice');
  wallet.addGold(50);

  assert.deepEqual(await sync.stop(), { unsynced: false });

  assert.equal(remote.docs.get('alice').data.wallet.gold, INITIAL_GOLD + 50);
  assert.equal(getScope(), null);
  assert.equal(scoped.has('u:alice', 'wallet'), false);
  assert.equal(scoped.has('u:alice', 'sync'), false);
  assert.equal(wallet.getGold(), INITIAL_GOLD);
  assert.equal(sync.getStatus(), 'off');
});

test('오프라인에서 로그아웃하면 올리지 못한 변경이 있다고 알려준다', async () => {
  await sync.start('alice');
  remote.online = false;
  wallet.addGold(50);
  assert.deepEqual(await sync.stop(), { unsynced: true });
});

test('다시 로그인하면 클라우드 기록으로 이어 한다 (다른 브라우저)', async () => {
  await sync.start('alice');
  wallet.addGold(300);
  collection.addDoll('chick-yellow');
  await sync.stop();

  useStorageBackend(); // 다른 브라우저
  wallet.reload();
  await sync.start('alice');
  assert.equal(wallet.getGold(), INITIAL_GOLD + 300);
  assert.ok(collection.getCollection()['chick-yellow']);
});

test('로그아웃 뒤 늦게 도착한 클라우드 응답은 무시한다', async () => {
  remote.docs.set('alice', cloudDoc({ wallet: { gold: 7777, history: [] } }));
  let release;
  const slowGet = remote.get.bind(remote);
  remote.get = (uid) => new Promise((r) => (release = () => r(slowGet(uid))));

  const pending = sync.start('alice');
  await sync.stop();
  release();
  await pending;

  assert.equal(getScope(), null);
  assert.equal(wallet.getGold(), INITIAL_GOLD);
});
