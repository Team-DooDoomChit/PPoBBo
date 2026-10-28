import { MACHINES } from '../../data/machines.js';
import { getDollsByMachine, RARITY } from '../../data/dolls.js';
import { getDollThumbnail } from '../../three/DollPreview.js';
import { eventBus } from '../../core/EventBus.js';
import { h, formatGold } from '../dom.js';
import { bindMachinePicking } from './machinePicking.js';

/** 기계 선택 화면: 카드 목록 + 선택한 기계로 카메라 미리보기 */
export function MachineSelectScreen(ctx, { machineId = MACHINES[0].id } = {}) {
  const { arcade, router } = ctx;
  let index = Math.max(0, MACHINES.findIndex((m) => m.id === machineId));

  const cards = MACHINES.map((machine, i) =>
    h(
      'button',
      { class: 'machine-card', style: { '--card-color': `#${machine.color.toString(16).padStart(6, '0')}` }, onClick: () => select(i) },
      h('div', { class: 'machine-card-name' }, machine.name),
      h('div', { class: 'machine-card-price' }, `🪙 ${formatGold(machine.price)} / 1회`),
      h(
        'div',
        { class: 'machine-card-dolls' },
        getDollsByMachine(machine.id).map((doll) =>
          h('img', { src: getDollThumbnail(doll), alt: doll.name, title: `${doll.name} (${RARITY[doll.rarity].label})` }),
        ),
      ),
    ),
  );

  const select = (i) => {
    index = (i + MACHINES.length) % MACHINES.length;
    cards.forEach((card, j) => card.classList.toggle('selected', j === index));
    arcade.machines.forEach((m) => m.setHighlight(m.config.id === MACHINES[index].id));
    arcade.previewMachine(MACHINES[index].id);
  };

  const play = () => router.go('game', { machineId: MACHINES[index].id });

  const unbindPicking = bindMachinePicking(ctx, (id) => {
    const i = MACHINES.findIndex((m) => m.id === id);
    if (i === index) play();
    else select(i);
  });

  // 모션 인식(B)이나 키보드 어댑터(#6)가 보내는 선택 이벤트
  const offs = [
    eventBus.on('input:select-prev', () => select(index - 1)),
    eventBus.on('input:select-next', () => select(index + 1)),
    eventBus.on('input:select-machine', ({ machineId: id }) => select(MACHINES.findIndex((m) => m.id === id))),
    eventBus.on('input:confirm', play),
  ];

  const el = h(
    'div',
    {},
    h('button', { class: 'btn btn-ghost back-btn', onClick: () => router.go('main') }, '← 뒤로'),
    h(
      'div',
      { class: 'select-panel' },
      h('button', { class: 'btn btn-round', onClick: () => select(index - 1), 'aria-label': '이전 기계' }, '◀'),
      h('div', { class: 'machine-cards' }, cards),
      h('button', { class: 'btn btn-round', onClick: () => select(index + 1), 'aria-label': '다음 기계' }, '▶'),
    ),
    h('button', { class: 'btn btn-primary btn-lg play-btn', onClick: play }, '플레이 ▶'),
  );

  select(index);

  return {
    el,
    dispose() {
      unbindPicking();
      offs.forEach((off) => off());
      arcade.machines.forEach((m) => m.setHighlight(false));
    },
  };
}
