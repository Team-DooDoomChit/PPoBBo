import './styles/main.css';
import './styles/ui.css';
import './styles/modals.css';
import { eventBus } from './core/EventBus.js';
import { SceneManager } from './three/SceneManager.js';
import { Arcade } from './three/Arcade.js';
import { ClawGame } from './physics/ClawGame.js';
import { ScreenRouter } from './ui/ScreenRouter.js';
import { HUD } from './ui/HUD.js';
import { MainScreen } from './ui/screens/MainScreen.js';
import { MachineSelectScreen } from './ui/screens/MachineSelectScreen.js';
import { GameScreen } from './ui/screens/GameScreen.js';
import { CollectionScreen } from './ui/screens/CollectionScreen.js';
import { setupModals } from './ui/modals/index.js';
import { inputState } from './core/InputState.js';
import { setupKeyboardInput } from './integration/KeyboardInput.js';
import { setupMotionBinding } from './integration/MotionBinding.js';
import { setupMotion } from './motion/setupMotion.js';

const sceneManager = new SceneManager(document.getElementById('scene'));
const arcade = new Arcade(sceneManager);
const games = new Map([...arcade.machines].map(([id, machine]) => [id, new ClawGame(machine)]));
let activeGame = null;

const uiRoot = document.getElementById('ui');
const router = new ScreenRouter(uiRoot, {
  sceneManager,
  arcade,
  games,
  setActiveGame: (game) => (activeGame = game),
});
const hud = new HUD(uiRoot, router);
router.ctx.hud = hud;

router
  .register('main', MainScreen)
  .register('select', MachineSelectScreen)
  .register('game', GameScreen)
  .register('collection', CollectionScreen);

hud.addAction('📖 도감', () => router.go('collection'), '인형 도감');

// 입력(모션/키보드) → 3D 바인딩이 먼저 돌고, 그 다음 물리를 진행한다
setupKeyboardInput();
setupMotionBinding({ sceneManager, arcade, router, getActiveGame: () => activeGame });
// 물리는 현재 플레이 중인 기계만 시뮬레이션한다 (나머지는 쌓인 상태로 정지)
sceneManager.onUpdate((dt) => activeGame?.update(dt));

router.go('main');
setupModals(hud);
// 웹캠 모션 인식 (게임 화면에 들어가면 카메라 켜짐)
const motion = setupMotion();

if (import.meta.env.DEV) window.__ppobbo = { sceneManager, arcade, games, router, eventBus, inputState, motion };
sceneManager.start();
eventBus.emit('app:ready');
