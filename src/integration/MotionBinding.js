import { inputState } from '../core/InputState.js';
import { eventBus } from '../core/EventBus.js';
import { CLAW_STATE } from '../physics/ClawController.js';
import { isModalOpen } from '../ui/modal.js';

const SELECT_THRESHOLD = 0.6; // 조이스틱을 이만큼 기울이면 이전/다음 기계
const JOYSTICK_SMOOTHING = 12;
const BUTTON_FLASH_TIME = 0.25;
// 고개 → 시점 넘기기 (#34)
// 고개 각도를 계속 따라가면 화면이 흔들려 어지럽다. 대신 고개를 확실히 돌리는 걸 "한 칸 넘기기" 신호로만 쓴다.
//   - |yaw|가 trigger를 넘는 순간 그 방향으로 step만큼 한 번 부드럽게 돈다
//   - 계속 돌리고 있어도 더 돌지 않고, 정면(rearm 안)으로 돌아와도 시점은 그대로다
//   - 다시 넘기려면 정면으로 돌아왔다가 다시 돌린다 (8번이면 한 바퀴)
const HEAD_STEP = Object.freeze({
  trigger: 0.25, // 라디안(약 14도). 이만큼 돌려야 넘어간다 (화면을 보며 생기는 작은 움직임은 무시)
  rearm: 0.1, // 이 안으로 돌아와야 다음 넘기기 준비
  step: Math.PI / 4, // 한 번에 45도
  ease: 6, // 클수록 빨리 도착 (약 0.5초)
});

/**
 * 고개 yaw → 넘기기 판정. 매 프레임 호출하고, 넘길 때만 ±1, 아니면 0을 돌려준다.
 * @returns {{ update(yaw: number): -1 | 0 | 1, reset(): void }}
 */
export function createHeadStepper({ trigger, rearm } = HEAD_STEP) {
  let armed = true;
  return {
    update(yaw) {
      if (Math.abs(yaw) <= rearm) armed = true;
      if (!armed || Math.abs(yaw) < trigger) return 0;
      armed = false;
      return Math.sign(yaw);
    },
    reset() {
      armed = false; // 화면이 바뀐 직후 고개가 이미 돌아가 있어도 바로 넘기지 않게, 정면을 한 번 거쳐야 한다
    },
  };
}

/**
 * InputState(모션/키보드) → 3D 오브젝트와 게임 동작 바인딩.
 *
 *   공통  : 모달이 열려 있으면 모든 입력 무시
 *   main  : 가리키기/주먹/Enter → 기계 선택 화면
 *   select: 조이스틱 좌우 → 이전/다음 기계, gazeTarget → 해당 기계, 가리키기/주먹 → 플레이
 *   game  : 조이스틱(손 쥐고 기울이기) → 집게 이동 + 조이스틱 기울기, isFist(손바닥 누르기 / Space) → 집게 내리기 + 버튼 눌림,
 *           OK 사인(isOk) → 코인 투입
 *           고개를 확실히 돌리면 그 방향으로 시점이 45도 넘어간다. 정면으로 돌아와도 시점은 그대로. (#34)
 *           마우스 드래그·휠도 그대로 쓸 수 있다.
 */
export function setupMotionBinding({ sceneManager, arcade, router, getActiveGame }) {
  let screen = router.current;
  const joystick = { x: 0, y: 0 };
  let buttonFlash = 0;
  const headStep = createHeadStepper();
  let turnLeft = 0; // 고개로 넘긴 뒤 아직 덜 돈 각도 (라디안)

  eventBus.on('screen:changed', ({ name }) => (screen = name));
  eventBus.on('input:confirm', () => screen === 'main' && router.go('select'));
  eventBus.on('claw:state', ({ state }) => state === CLAW_STATE.DESCENDING && (buttonFlash = BUTTON_FLASH_TIME));

  // ---------- 눌림/뗌 순간(엣지) 처리 ----------
  inputState.subscribe((next, prev) => {
    if (isModalOpen()) return; // 모달이 열려 있으면 뒤 화면은 조작하지 않는다
    const rising = (key) => next[key] && !prev[key];
    const gesture = rising('isPointing') || rising('isFist');

    if (screen === 'main' && gesture) {
      router.go('select');
    } else if (screen === 'select') {
      if (gesture) eventBus.emit('input:confirm');
      if (next.joystickX <= -SELECT_THRESHOLD && prev.joystickX > -SELECT_THRESHOLD) eventBus.emit('input:select-prev');
      if (next.joystickX >= SELECT_THRESHOLD && prev.joystickX < SELECT_THRESHOLD) eventBus.emit('input:select-next');
      if (next.gazeTarget && next.gazeTarget !== prev.gazeTarget) {
        eventBus.emit('input:select-machine', { machineId: next.gazeTarget });
      }
    } else if (screen === 'game') {
      if (rising('isFist')) getActiveGame()?.claw.drop();
      if (rising('isOk')) eventBus.emit('input:coin');
    }
  });

  // ---------- 매 프레임 연속 값 처리 ----------
  sceneManager.onUpdate((dt) => {
    const input = inputState.get();
    const blocked = isModalOpen();
    const game = screen === 'game' && !blocked ? getActiveGame() : null;
    const machine = arcade.focusedMachine;

    // 모달이 열려 있으면 집게를 멈춘다 (게임 진행 자체는 main.js에서 일시정지)
    getActiveGame()?.claw.setMoveInput(game ? input.joystickX : 0, game ? input.joystickY : 0);

    // 조이스틱 손잡이는 입력을 부드럽게 따라간다
    const k = 1 - Math.exp(-JOYSTICK_SMOOTHING * dt);
    joystick.x += ((game ? input.joystickX : 0) - joystick.x) * k;
    joystick.y += ((game ? input.joystickY : 0) - joystick.y) * k;
    buttonFlash = Math.max(0, buttonFlash - dt);
    machine?.setJoystick(joystick.x, joystick.y);
    machine?.setButtonPressed(Boolean(game) && (input.isFist || buttonFlash > 0));

    // 카메라 이동 중이거나 마우스로 드래그 중이면 고개로는 넘기지 않고, 돌던 것도 멈춘다
    const canTurn = game && !sceneManager.isCameraMoving && !sceneManager.isUserControlling;
    if (!canTurn) {
      headStep.reset();
      turnLeft = 0;
    } else {
      turnLeft += headStep.update(input.headYaw) * HEAD_STEP.step;
      const delta = Math.abs(turnLeft) < 1e-3 ? turnLeft : turnLeft * (1 - Math.exp(-HEAD_STEP.ease * dt));
      if (delta !== 0) sceneManager.orbitBy(delta, 0);
      turnLeft -= delta;
    }
  });
}
