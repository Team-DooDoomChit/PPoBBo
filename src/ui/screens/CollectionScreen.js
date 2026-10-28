import { DOLLS, RARITY } from '../../data/dolls.js';
import { MACHINES } from '../../data/machines.js';
import { getDollThumbnail, createDollViewer } from '../../three/DollPreview.js';
import { gameApi } from '../../integration/gameApi.js';
import { h } from '../dom.js';

const formatDate = (time) => new Date(time).toLocaleDateString('ko-KR');

/** 인형 도감: 보유/미보유 그리드 + 360° 뷰어 */
export function CollectionScreen(ctx) {
  const { router } = ctx;
  const collection = gameApi.getCollection();
  const owned = DOLLS.filter((d) => collection[d.id]);
  let filter = 'all';

  const grid = h('div', { class: 'collection-grid' });
  const tabs = [{ id: 'all', name: '전체' }, ...MACHINES].map((m) =>
    h('button', { class: 'tab', onClick: () => setFilter(m.id), 'data-id': m.id }, m.name),
  );

  function setFilter(id) {
    filter = id;
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.id === id));
    renderGrid();
  }

  function renderGrid() {
    const dolls = DOLLS.filter((d) => filter === 'all' || d.machineId === filter);
    grid.replaceChildren(
      ...dolls.map((doll) => {
        const entry = collection[doll.id];
        return h(
          'button',
          { class: `doll-card ${entry ? 'owned' : 'locked'}`, disabled: !entry, onClick: () => openViewer(doll, entry) },
          h('img', { src: getDollThumbnail(doll), alt: entry ? doll.name : '미획득' }),
          h('div', { class: 'doll-card-name' }, entry ? doll.name : '???'),
          h('div', { class: `rarity rarity-${doll.rarity}` }, RARITY[doll.rarity].label),
          entry && h('div', { class: 'doll-count' }, `×${entry.count}`),
        );
      }),
    );
  }

  let viewer = null;
  function openViewer(doll, entry) {
    const canvas = h('canvas', { class: 'viewer-canvas' });
    const autoBtn = h('button', { class: 'btn btn-ghost', onClick: toggleAuto }, '⏸ 자동 회전');
    let auto = true;
    function toggleAuto() {
      auto = !auto;
      viewer.setAutoRotate(auto);
      autoBtn.textContent = auto ? '⏸ 자동 회전' : '▶ 자동 회전';
    }
    const close = () => {
      viewer?.dispose();
      viewer = null;
      overlay.remove();
    };
    const overlay = h(
      'div',
      { class: 'viewer-overlay', onClick: (e) => e.target === overlay && close() },
      h(
        'div',
        { class: 'viewer-panel' },
        h('button', { class: 'btn-close', onClick: close, 'aria-label': '닫기' }, '✕'),
        canvas,
        h('div', { class: 'viewer-info' },
          h('h3', {}, doll.name),
          h('div', { class: `rarity rarity-${doll.rarity}` }, RARITY[doll.rarity].label),
          h('p', {}, `보유 ${entry.count}개 · 첫 획득 ${formatDate(entry.obtainedAt)}`),
          h('p', { class: 'hint' }, '드래그해서 360° 돌려보기 · 휠로 확대'),
          autoBtn,
        ),
      ),
    );
    el.append(overlay);
    viewer = createDollViewer(canvas, doll);
  }

  const rate = Math.round((owned.length / DOLLS.length) * 100);
  const el = h(
    'div',
    { class: 'collection-overlay' },
    h(
      'div',
      { class: 'collection-panel' },
      h(
        'div',
        { class: 'collection-header' },
        h('h2', {}, '📖 인형 도감'),
        h('div', { class: 'collection-rate' }, `${owned.length} / ${DOLLS.length} 수집 (${rate}%)`,
          h('div', { class: 'rate-bar' }, h('div', { style: { width: `${rate}%` } }))),
        h('button', { class: 'btn-close', onClick: () => router.back(), 'aria-label': '닫기' }, '✕'),
      ),
      h('div', { class: 'tabs' }, tabs),
      grid,
    ),
  );

  setFilter('all');

  return {
    el,
    dispose: () => viewer?.dispose(),
  };
}
