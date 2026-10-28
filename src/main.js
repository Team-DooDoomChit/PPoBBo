import './styles/main.css';
import { eventBus } from './core/EventBus.js';
import { SceneManager } from './three/SceneManager.js';
import { Arcade } from './three/Arcade.js';

const sceneManager = new SceneManager(document.getElementById('scene'));
const arcade = new Arcade(sceneManager);

// 기계 더블클릭 시 클로즈업, ESC로 전체 시점 복귀
sceneManager.canvas.addEventListener('dblclick', (e) => {
  const machine = arcade.pickMachine(e.clientX, e.clientY);
  if (machine) arcade.focusMachine(machine.config.id);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') arcade.focusOverview();
});

sceneManager.start();
eventBus.emit('app:ready');
