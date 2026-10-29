import { getMachine } from '../../data/machines.js';
import { getDoll, RARITY } from '../../data/dolls.js';
import { CLAW_STATE } from '../../physics/ClawController.js';
import { getDollThumbnail } from '../../three/DollPreview.js';
import { gameApi } from '../../integration/gameApi.js';
import { eventBus } from '../../core/EventBus.js';
import { h, formatGold } from '../dom.js';
import { toast } from '../toast.js';
import { failText } from '../failText.js';

const STATE_TEXT = {
  [CLAW_STATE.IDLE]: '코인을 넣어 주세요',
  [CLAW_STATE.READY]: '집게를 움직이고 내리기!',
  [CLAW_STATE.DESCENDING]: '내려가는 중...',
  [CLAW_STATE.GRABBING]: '집는 중...',
  [CLAW_STATE.ASCENDING]: '올라가는 중...',
  [CLAW_STATE.RETURNING]: '배출구로 이동 중...',
  [CLAW_STATE.RELEASING]: '두근두근...',
};

/** 게임 플레이 화면: 기계 클로즈업 + 코인/하강 버튼, 타이머, 획득 팝업 */
export function GameScreen(ctx, { machineId }) {
  const { arcade, getGame, router, sceneManager, setActiveGame } = ctx;
  const machine = getMachine(machineId);
  const game = getGame(machineId);
  setActiveGame(game);
  arcade.focusMachine(machineId);

  const statusText = h('div', { class: 'game-status' });
  const timerText = h('div', { class: 'game-timer' });
  let shownSeconds = null;
  const backBtn = h('button', { class: 'btn btn-ghost back-btn', onClick: () => router.go('select', { machineId }) }, '← 나가기');
  const coinBtn = h('button', { class: 'btn btn-primary btn-lg', onClick: insertCoin }, `🪙 코인 넣기 (${formatGold(machine.price)})`);
  const dropBtn = h('button', { class: 'btn btn-drop btn-lg', onClick: () => game.claw.drop() }, '▼ 내리기');

  function insertCoin() {
    if (game.claw.isPlaying) return;
    const result = gameApi.spendGold(machine.price);
    if (!result.ok) {
      // 잔액 부족이 아닌 실패(예: invalid-amount)는 충전을 권하지 않는다
      if (result.reason && result.reason !== 'not-enough-gold') {
        toast(failText(result.reason), { type: 'warn' });
        return;
      }
      toast('골드가 부족해요! 충전하거나 야간 근무를 해보세요', { type: 'warn' });
      eventBus.emit('ui:open-modal', { name: 'charge' });
      return;
    }
    game.claw.startRound();
  }

  function render(state = game.claw.state) {
    const playing = state !== CLAW_STATE.IDLE;
    statusText.textContent = STATE_TEXT[state];
    coinBtn.hidden = playing;
    dropBtn.hidden = state !== CLAW_STATE.READY;
    timerText.hidden = state !== CLAW_STATE.READY;
    backBtn.disabled = playing;
  }

  // 도감 저장 실패(#13, collection:error)는 doll:won을 처리하는 같은 emit 안에서 온다.
  // 팝업을 마이크로태스크로 미뤄 띄우면 구독 순서와 상관없이 저장 결과를 먼저 받은 뒤 그린다.
  const saveFailed = new Map(); // dollId → reason
  const prizeHint = (reason) =>
    reason
      ? `⚠️ ${failText(reason, { 'save-failed': '도감 저장에 실패했어요 (저장 공간을 확인해 주세요)' })} · 터치해서 닫기`
      : '도감에 등록되었어요 · 터치해서 닫기';
  // payload에 machineId가 없어서, 이 기계의 인형인지로 거른다
  const onSaveFailed = ({ dollId, reason }) => getDoll(dollId)?.machineId === machineId && saveFailed.set(dollId, reason);

  const showPrize = (dollId) => {
    const doll = getDoll(dollId);
    if (!doll) return;
    const reason = saveFailed.get(dollId);
    saveFailed.delete(dollId);
    const popup = h(
      'div',
      { class: 'prize-popup', onClick: () => popup.remove() },
      h(
        'div',
        { class: 'prize-card' },
        h('div', { class: 'prize-title' }, '🎉 획득!'),
        h('img', { src: getDollThumbnail(doll), alt: doll.name }),
        h('div', { class: 'prize-name' }, doll.name),
        h('div', { class: `rarity rarity-${doll.rarity}` }, RARITY[doll.rarity].label),
        h('p', { class: reason ? 'hint prize-warn' : 'hint' }, prizeHint(reason)),
      ),
    );
    el.append(popup);
  };

  const mine = (handler) => (payload) => payload.machineId === machineId && handler(payload);
  const offs = [
    eventBus.on('claw:state', mine(({ state }) => render(state))),
    eventBus.on('claw:grab', mine(({ success, dollId }) => dollId && toast(success ? '잡았다!' : '앗, 놓쳤다...', { type: success ? 'good' : 'warn' }))),
    eventBus.on('claw:slip', mine(() => toast('으악, 떨어졌다!', { type: 'warn' }))),
    eventBus.on('doll:won', mine(({ dollId }) => queueMicrotask(() => showPrize(dollId)))),
    eventBus.on('collection:error', onSaveFailed),
    eventBus.on('input:coin', insertCoin),
    // 타이머는 보일 때(READY), 초가 바뀔 때만 DOM을 갱신한다
    sceneManager.onUpdate(() => {
      if (game.claw.state !== CLAW_STATE.READY) return;
      const seconds = Math.ceil(game.claw.timeLeft);
      if (seconds !== shownSeconds) {
        shownSeconds = seconds;
        timerText.textContent = `⏱ ${seconds}`;
      }
    }),
  ];

  const el = h(
    'div',
    {},
    backBtn,
    h(
      'div',
      { class: 'game-panel' },
      timerText,
      statusText,
      h('div', { class: 'game-buttons' }, coinBtn, dropBtn),
      h('p', { class: 'hint controls-hint' }, '🕹 왼손 쥐고 기울이기: 이동(펴면 멈춤) · ✊ 오른손 주먹/내려치기: 내리기 · 👌 OK: 코인 · 🖱 드래그: 시점 · ⌨️ 방향키 / Space / C'),
    ),
  );
  render();

  return {
    el,
    canLeave() {
      if (game.claw.isPlaying) toast('게임이 끝난 뒤에 이동할 수 있어요', { type: 'warn' });
      return !game.claw.isPlaying;
    },
    dispose() {
      offs.forEach((off) => off());
      setActiveGame(null);
    },
  };
}
