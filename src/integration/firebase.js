/**
 * Firebase(Auth + Firestore) 어댑터. (#38)
 *
 * auth.js가 쓰는 provider / remote 형태로 감싼다. SDK는 설정이 있을 때만 동적으로 불러와
 * 게스트만 쓰는 경우(설정 없음, 테스트) 번들을 받지 않는다.
 *
 * 환경 변수 (.env.local, 배포 환경 변수): .env.example 참고
 */
const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'];

/** VITE_FIREBASE_* 환경 변수 → Firebase 설정. 필수 값이 하나라도 없으면 null (게스트 전용) */
export function readFirebaseConfig(env = {}) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
  if (!REQUIRED.every((k) => config[k])) return null;
  return Object.fromEntries(Object.entries(config).filter(([, v]) => v));
}

// 팝업을 못 띄우는 환경이면 리다이렉트로 다시 시도
const POPUP_FALLBACK = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

/** Firebase 오류 코드 → UI가 문구를 고를 reason */
export function signInErrorReason(code) {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'cancelled';
    case 'auth/network-request-failed':
      return 'network';
    case 'auth/unauthorized-domain':
      return 'unauthorized-domain';
    case 'auth/too-many-requests':
      return 'too-many-requests';
    default:
      return 'unknown';
  }
}

const withReason = (reason, cause) => Object.assign(new Error(`sign-in failed: ${reason}`), { reason, cause });

const toUser = (u) => u && { uid: u.uid, name: u.displayName ?? '', photoUrl: u.photoURL ?? null };

export function createFirebaseBackend(config) {
  const ready = (async () => {
    const [{ initializeApp }, authMod, fs] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);
    const app = initializeApp(config);
    return { authMod, fbAuth: authMod.getAuth(app), fs, db: fs.getFirestore(app) };
  })();
  ready.catch((err) => console.warn('[auth] Firebase를 불러오지 못했습니다. 게스트로 계속합니다.', err));

  const userDoc = ({ fs, db }, uid) => fs.doc(db, 'users', uid);

  const provider = {
    /** 로그인 상태가 바뀔 때마다 cb(user | null). 처음 한 번은 현재 상태로 불린다. */
    onChange(cb) {
      let off = null;
      let cancelled = false;
      ready
        .then(({ authMod, fbAuth }) => {
          if (cancelled) return;
          // 리다이렉트 로그인에서 돌아온 경우 오류만 남긴다 (성공은 onAuthStateChanged로 들어온다)
          authMod.getRedirectResult(fbAuth).catch((err) => console.warn('[auth] 리다이렉트 로그인 실패', err?.code));
          off = authMod.onAuthStateChanged(fbAuth, (u) => cb(toUser(u)));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        off?.();
      };
    },

    /** @returns {Promise<{ redirect?: true }>} 실패하면 { reason } 이 붙은 Error */
    async signIn() {
      let m;
      try {
        m = await ready;
      } catch (err) {
        throw withReason('unavailable', err);
      }
      const { authMod, fbAuth } = m;
      const google = new authMod.GoogleAuthProvider();
      try {
        await authMod.signInWithPopup(fbAuth, google);
        return {};
      } catch (err) {
        if (!POPUP_FALLBACK.has(err?.code)) throw withReason(signInErrorReason(err?.code), err);
      }
      try {
        await authMod.signInWithRedirect(fbAuth, google); // 페이지가 이동한다
        return { redirect: true };
      } catch (err) {
        throw withReason(signInErrorReason(err?.code), err);
      }
    },

    async signOut() {
      const { authMod, fbAuth } = await ready;
      await authMod.signOut(fbAuth);
    },
  };

  const remote = {
    async get(uid) {
      const m = await ready;
      const snap = await m.fs.getDoc(userDoc(m, uid));
      return snap.exists() ? snap.data() : null;
    },

    /** 트랜잭션: 다른 기기가 동시에 저장해도 최신 문서를 기준으로 합친다 */
    async update(uid, fn) {
      const m = await ready;
      const ref = userDoc(m, uid);
      return m.fs.runTransaction(m.db, async (tx) => {
        const snap = await tx.get(ref);
        const next = fn(snap.exists() ? snap.data() : null);
        tx.set(ref, next);
        return next;
      });
    },

    subscribe(uid, cb) {
      let off = null;
      let cancelled = false;
      ready
        .then((m) => {
          if (cancelled) return;
          off = m.fs.onSnapshot(
            userDoc(m, uid),
            (snap) => {
              if (snap.exists() && !snap.metadata.hasPendingWrites) cb(snap.data());
            },
            (err) => console.warn('[auth] 실시간 동기화 끊김', err?.code),
          );
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        off?.();
      };
    },
  };

  return { provider, remote };
}
