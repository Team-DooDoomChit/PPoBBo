import { load, save } from './storage.js';
import { dateKey, now } from './clock.js';
import { wallet } from './wallet.js';

/**
 * 야간 근무(광고 시청) 보상 검증. (#12)
 *
 * 수당은 아래를 모두 통과해야 지급한다.
 * - 진행 중인 세션과 ID가 같을 것 (세션은 메모리에만 있어 새로고침하면 무효)
 * - 시작 후 duration초 이상 지났을 것
 * - 시청 중에 탭을 숨기거나 다른 탭으로 가지 않았을 것
 * - 오늘 지급 횟수가 dailyMax 미만일 것
 */
export const NIGHT_SHIFT = Object.freeze({ duration: 15, reward: 300, dailyMax: 5 });
const KEY = 'nightShift';
const LOG_LIMIT = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const defaultState = () => ({ date: null, count: 0, log: [] });

function readState() {
  const s = load(KEY, defaultState());
  if (!Number.isSafeInteger(s?.count) || s.count < 0) return defaultState();
  if (s.date != null && !DATE_RE.test(s.date)) return defaultState();
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

/** 오늘 받은 횟수 (날짜가 바뀌면 0) */
const todayCount = (s) => (s.date === dateKey() ? s.count : 0);

let session = null; // { id, startedAt, interrupted }

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${now()}-${Math.random().toString(36).slice(2)}`;

export const nightShift = {
  /** @returns {{ duration, reward, dailyMax, remaining }} */
  getStatus() {
    return { ...NIGHT_SHIFT, remaining: Math.max(0, NIGHT_SHIFT.dailyMax - todayCount(readState())) };
  },

  /** @returns {{ ok: true, sessionId, duration, reward } | { ok: false, reason: 'daily-limit' }} */
  start() {
    if (this.getStatus().remaining <= 0) return { ok: false, reason: 'daily-limit' };
    // 새로 시작하면 이전 세션은 무효 (동시에 여러 개 진행 불가)
    session = { id: newId(), startedAt: now(), interrupted: false };
    return { ok: true, sessionId: session.id, duration: NIGHT_SHIFT.duration, reward: NIGHT_SHIFT.reward };
  },

  /**
   * @returns {{ ok: true, reward } | { ok: false, reason: 'invalid-session' | 'interrupted' | 'too-short' | 'daily-limit' | 'save-failed' }}
   */
  complete(sessionId) {
    if (!session || session.id !== sessionId) return { ok: false, reason: 'invalid-session' };
    const { startedAt, interrupted } = session;
    session = null; // 성공/실패와 관계없이 세션은 한 번만 쓸 수 있다

    if (interrupted) return { ok: false, reason: 'interrupted' };
    if (now() - startedAt < NIGHT_SHIFT.duration * 1000) return { ok: false, reason: 'too-short' };

    const prev = readState();
    const count = todayCount(prev);
    if (count >= NIGHT_SHIFT.dailyMax) return { ok: false, reason: 'daily-limit' };

    // 횟수를 먼저 저장해 중복 지급을 막고, 골드 지급이 실패하면 되돌린다
    const next = {
      date: dateKey(),
      count: count + 1,
      log: [...prev.log, { at: now(), reward: NIGHT_SHIFT.reward }].slice(-LOG_LIMIT),
    };
    if (!save(KEY, next)) return { ok: false, reason: 'save-failed' };
    if (!wallet.addGold(NIGHT_SHIFT.reward, 'night-shift').ok) {
      save(KEY, prev);
      return { ok: false, reason: 'save-failed' };
    }
    return { ok: true, reward: NIGHT_SHIFT.reward };
  },

  cancel(sessionId) {
    if (session?.id === sessionId) session = null;
  },

  /** 탭이 숨겨지면 진행 중인 근무를 중단 처리 (브라우저에서는 자동 연결됨) */
  notifyHidden() {
    if (session) session.interrupted = true;
  },

  /** 진행 중인 근무가 중단됐는지 (UI에서 바로 안내할 때 사용) */
  isInterrupted(sessionId) {
    return session?.id === sessionId && session.interrupted;
  },

  /** 최근 지급 내역 (최신순) */
  getLog() {
    return readState().log.slice().reverse();
  },
};

globalThis.document?.addEventListener?.('visibilitychange', () => {
  if (document.visibilityState === 'hidden') nightShift.notifyHidden();
});
