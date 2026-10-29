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
import { isModalOpen } from './ui/modal.js';
import { inputState } from './core/InputState.js';
import { setupKeyboardInput } from './integration/KeyboardInput.js';
import { setupMotionBinding } from './integration/MotionBinding.js';
import { setupMotion } from './motion/setupMotion.js';
import { preloadDollModels } from './three/DollPreview.js';
import { DOLLS } from './data/dolls.js';

// .glb 인형 모델이 있으면 미리 받아 둔다 (기계 안 인형·썸네일이 처음부터 .glb로 보이도록)
preloadDollModels(DOLLS);

const sceneManager = new SceneManager(document.getElementById('scene'));
const arcade = new Arcade(sceneManager);
// 기계마다 인형 배치(물리 사전 안정화)에 수십 ms가 걸린다.
// 첫 화면을 먼저 그린 뒤 한 대씩 만들고, 그 전에 게임 화면에 들어가면 그때 바로 만든다.
const games = new Map();
const getGame = (id) => {
  if (!games.has(id)) games.set(id, new ClawGame(arcade.getMachine(id)));
  return games.get(id);
};
[...arcade.machines.keys()].forEach((id, i) => setTimeout(() => getGame(id), 100 * (i + 1)));
let activeGame = null;

const uiRoot = document.getElementById('ui');
const router = new ScreenRouter(uiRoot, {
  sceneManager,
  arcade,
  getGame,
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
// 모달이 열려 있는 동안은 일시정지 (집게·타이머가 모달 뒤에서 움직이지 않도록)
sceneManager.onUpdate((dt) => !isModalOpen() && activeGame?.update(dt));

router.go('main');
setupModals(hud);
// 웹캠 모션 인식 (게임 화면에 들어가면 카메라 켜짐)
const motion = setupMotion();

if (import.meta.env.DEV) window.__ppobbo = { sceneManager, arcade, games, router, eventBus, inputState, motion };
sceneManager.start();
eventBus.emit('app:ready');
