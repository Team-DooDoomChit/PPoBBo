import './styles/main.css';
import { eventBus } from './core/EventBus.js';
import { SceneManager } from './three/SceneManager.js';
import { Arcade } from './three/Arcade.js';
import { ClawGame } from './physics/ClawGame.js';

const sceneManager = new SceneManager(document.getElementById('scene'));
const arcade = new Arcade(sceneManager);
const games = new Map([...arcade.machines].map(([id, machine]) => [id, new ClawGame(machine)]));

// 물리는 현재 플레이 중인 기계만 시뮬레이션한다 (나머지는 쌓인 상태로 정지)
let activeGame = null;
sceneManager.onUpdate((dt) => activeGame?.update(dt));

// 기계 더블클릭 시 클로즈업, ESC로 전체 시점 복귀
sceneManager.canvas.addEventListener('dblclick', (e) => {
  const machine = arcade.pickMachine(e.clientX, e.clientY);
  if (!machine) return;
  activeGame = games.get(machine.config.id);
  arcade.focusMachine(machine.config.id);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') arcade.focusOverview();
});

if (import.meta.env.DEV) window.__ppobbo = { sceneManager, arcade, games, eventBus };

sceneManager.start();
eventBus.emit('app:ready');
