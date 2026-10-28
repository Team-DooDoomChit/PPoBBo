import { getMachine } from '../../data/machines.js';
import { getDoll, RARITY } from '../../data/dolls.js';
import { CLAW_STATE } from '../../physics/ClawController.js';
import { getDollThumbnail } from '../../three/DollPreview.js';
import { gameApi } from '../../integration/gameApi.js';
import { eventBus } from '../../core/EventBus.js';
import { h, formatGold } from '../dom.js';
import { toast } from '../toast.js';

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
  const { arcade, games, router, sceneManager, setActiveGame } = ctx;
  const machine = getMachine(machineId);
  const game = games.get(machineId);
  setActiveGame(game);
  arcade.focusMachine(machineId);

  const statusText = h('div', { class: 'game-status' });
  const timerText = h('div', { class: 'game-timer' });
  const backBtn = h('button', { class: 'btn btn-ghost back-btn', onClick: () => router.go('select', { machineId }) }, '← 나가기');
  const coinBtn = h('button', { class: 'btn btn-primary btn-lg', onClick: insertCoin }, `🪙 코인 넣기 (${formatGold(machine.price)})`);
  const dropBtn = h('button', { class: 'btn btn-drop btn-lg', onClick: () => game.claw.drop() }, '▼ 내리기');

  function insertCoin() {
    if (game.claw.isPlaying) return;
    const result = gameApi.spendGold(machine.price);
    if (!result.ok) {
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

  const showPrize = (dollId) => {
    const doll = getDoll(dollId);
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
        h('p', { class: 'hint' }, '도감에 등록되었어요 · 터치해서 닫기'),
      ),
    );
    el.append(popup);
  };

  const mine = (handler) => (payload) => payload.machineId === machineId && handler(payload);
  const offs = [
    eventBus.on('claw:state', mine(({ state }) => render(state))),
    eventBus.on('claw:grab', mine(({ success, dollId }) => dollId && toast(success ? '잡았다!' : '앗, 놓쳤다...', { type: success ? 'good' : 'warn' }))),
    eventBus.on('claw:slip', mine(() => toast('으악, 떨어졌다!', { type: 'warn' }))),
    eventBus.on('doll:won', mine(({ dollId }) => showPrize(dollId))),
    eventBus.on('input:coin', insertCoin),
    sceneManager.onUpdate(() => {
      timerText.textContent = `⏱ ${Math.ceil(game.claw.timeLeft)}`;
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
      h('p', { class: 'hint controls-hint' }, '✊ 주먹: 내리기 · 🤏 동전을 투입구로 · ⌨️ 방향키 / Space / C'),
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
