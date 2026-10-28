import { h } from '../dom.js';
import { bindMachinePicking } from './machinePicking.js';

/** 메인 오락실 화면: 전체 시점 + 시작 메뉴 */
export function MainScreen(ctx) {
  const { arcade, router } = ctx;
  arcade.focusOverview();

  const unbindPicking = bindMachinePicking(ctx, (machineId) => router.go('select', { machineId }));

  const el = h(
    'div',
    {},
    h(
      'div',
      { class: 'main-menu' },
      h('h1', { class: 'title' }, 'PPoBBo'),
      h('p', { class: 'subtitle' }, '손짓으로 즐기는 3D 인형뽑기 오락실'),
      h(
        'div',
        { class: 'menu-buttons' },
        h('button', { class: 'btn btn-primary btn-lg', onClick: () => router.go('select') }, '🎮 기계 고르기'),
        h('button', { class: 'btn btn-ghost btn-lg', onClick: () => router.go('collection') }, '📖 인형 도감'),
      ),
      h('p', { class: 'hint' }, '기계를 클릭해도 바로 고를 수 있어요'),
    ),
  );

  return { el, dispose: unbindPicking };
}
