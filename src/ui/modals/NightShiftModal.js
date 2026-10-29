import { gameApi } from '../../integration/gameApi.js';
import { h, formatGold } from '../dom.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { failText } from '../failText.js';

const AD_SCENES = ['🧹 오락실 바닥 청소 중...', '🧸 인형 채워 넣는 중...', '🪙 동전 정리 중...', '✨ 유리창 닦는 중...'];
// #12 nightShift.complete()의 실패 사유별 문구 (save-failed는 공통 문구 사용)
const FAIL_TEXT = {
  interrupted: '다른 화면으로 이동해서 근무가 중단됐어요',
  'too-short': '광고를 끝까지 보지 않아 수당이 지급되지 않았어요',
  'daily-limit': '오늘 근무 횟수를 모두 채워서 수당이 지급되지 않았어요',
  'invalid-session': '근무 정보가 만료됐어요. 다시 시작해 주세요',
  default: '근무 확인에 실패해 수당이 지급되지 않았어요',
};

/**
 * 야간 근무(광고 시청) UI.
 * 시청 시작/완료를 gameApi에 알리고, 지급 여부 검증은 게임 로직(#12)에 맡긴다.
 * 중간에 닫거나 다른 탭/앱으로 이동하면 근무가 취소되어 수당이 지급되지 않는다.
 */
export function openNightShiftModal() {
  let session = null;
  let timer = null;

  const stop = () => {
    clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  // 광고 중 화면이 숨겨지면 바로 중단한다 (돌아왔을 때 완료로 처리되지 않도록)
  const onVisibilityChange = () => {
    if (!document.hidden || !session) return;
    stop();
    gameApi.cancelNightShift(session.sessionId);
    session = null;
    renderResult({ ok: false, reason: 'interrupted' });
  };

  const modal = openModal({
    title: '🌙 야간 근무',
    className: 'modal-night',
    onClose: () => {
      if (!session) return;
      stop();
      gameApi.cancelNightShift(session.sessionId);
      toast('근무를 중단해서 수당을 받지 못했어요', { type: 'warn' });
    },
  });

  const renderIntro = () => {
    const { duration, reward, remaining, dailyMax } = gameApi.getNightShiftStatus();
    modal.body.replaceChildren(
      h('div', { class: 'night-hero' }, '🌃'),
      h('p', {}, `광고를 ${duration}초 동안 끝까지 보면 야간 수당 🪙 ${formatGold(reward)}을 받아요.`),
      h('p', { class: 'hint' }, `오늘 남은 근무 ${remaining} / ${dailyMax}회 · 중간에 닫으면 수당이 지급되지 않아요`),
      h('button', { class: 'btn btn-primary btn-lg modal-action', disabled: remaining <= 0, onClick: start }, remaining > 0 ? '근무 시작' : '오늘 근무는 끝났어요'),
    );
  };

  const start = () => {
    const result = gameApi.startNightShift();
    if (!result.ok) {
      toast('오늘은 더 이상 근무할 수 없어요', { type: 'warn' });
      renderIntro();
      return;
    }
    session = result;

    const sceneText = h('div', { class: 'ad-scene' }, AD_SCENES[0]);
    const bar = h('div', { class: 'ad-progress-fill' });
    const remainText = h('span', {}, `${result.duration}`);
    modal.body.replaceChildren(
      h('div', { class: 'ad-screen' }, h('div', { class: 'ad-badge' }, 'AD'), h('div', { class: 'ad-moon' }, '🌙'), sceneText),
      h('div', { class: 'ad-progress' }, bar),
      h('p', { class: 'hint' }, remainText, '초 남음 · 건너뛸 수 없어요'),
    );

    document.addEventListener('visibilitychange', onVisibilityChange);
    const startedAt = performance.now();
    timer = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const t = Math.min(elapsed / result.duration, 1);
      bar.style.width = `${t * 100}%`;
      remainText.textContent = Math.max(0, Math.ceil(result.duration - elapsed));
      sceneText.textContent = AD_SCENES[Math.floor(elapsed / 4) % AD_SCENES.length];
      if (t >= 1) finish();
    }, 100);
  };

  const finish = () => {
    stop();
    const result = gameApi.completeNightShift(session.sessionId);
    session = null;
    renderResult(result);
    if (result.ok) toast(`야간 수당 🪙 ${formatGold(result.reward)}`, { type: 'good' });
  };

  const renderResult = (result) => {
    modal.body.replaceChildren(
      h('div', { class: 'night-hero' }, result.ok ? '🎉' : '😢'),
      h('p', {}, result.ok ? `수고했어요! 야간 수당 🪙 ${formatGold(result.reward)} 지급` : failText(result.reason, FAIL_TEXT)),
      h('button', { class: 'btn btn-ghost btn-lg modal-action', onClick: renderIntro }, '확인'),
    );
  };

  renderIntro();
  return modal;
}
