import { inputState } from '../core/InputState.js';
import { eventBus } from '../core/EventBus.js';
import { CLAW_STATE } from '../physics/ClawController.js';
import { h } from '../ui/dom.js';
import { isModalOpen } from '../ui/modal.js';

const SELECT_THRESHOLD = 0.6; // 조이스틱을 이만큼 기울이면 이전/다음 기계
const COIN_DROP_RADIUS_PX = 70; // 동전을 놓았을 때 투입구로 인정하는 거리
const JOYSTICK_SMOOTHING = 12;
const HEAD_LOOK_SMOOTHING = 3;
const HEAD_LOOK_GAIN = { yaw: 0.9, pitch: 0.5 }; // 머리 각도 → 카메라 회전 배율
const HEAD_LOOK_LIMIT = { yaw: 0.6, pitch: 0.4 };
const BUTTON_FLASH_TIME = 0.25;

const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));

/**
 * InputState(모션/키보드) → 3D 오브젝트와 게임 동작 바인딩.
 *
 *   공통  : 손 위치 커서 표시 (pointer가 있을 때), 모달이 열려 있으면 모든 입력 무시
 *   main  : 가리키기/주먹/Enter → 기계 선택 화면
 *   select: 조이스틱 좌우 → 이전/다음 기계, gazeTarget → 해당 기계, 가리키기/주먹 → 플레이
 *   game  : 조이스틱 → 집게 이동 + 조이스틱 기울기, 주먹 → 집게 내리기 + 버튼 눌림,
 *           집기(pinch) 상태로 투입구까지 끌어와 놓기 → 코인 투입,
 *           머리 회전 → 현재 시점에서 상대적으로 카메라 회전 (마우스 드래그·줌과 함께 사용 가능)
 */
export function setupMotionBinding({ sceneManager, arcade, router, getActiveGame }) {
  let screen = router.current;
  const joystick = { x: 0, y: 0 };
  let buttonFlash = 0;
  // 헤드룩: 목표 각도를 부드럽게 따라가고(look), 이미 카메라에 적용한 만큼(applied)과의 차이만 회전한다
  const look = { yaw: 0, pitch: 0 };
  const applied = { yaw: 0, pitch: 0 };

  const cursor = h('div', { class: 'motion-cursor', hidden: true });
  document.getElementById('ui').append(cursor);

  const isOverCoinSlot = (pointer) => {
    const slot = pointer && arcade.getCoinSlotScreenPosition();
    if (!slot) return false;
    const dx = (pointer.x - slot.x) * window.innerWidth;
    const dy = (pointer.y - slot.y) * window.innerHeight;
    return Math.hypot(dx, dy) < COIN_DROP_RADIUS_PX;
  };

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
      // 손 추적이 끊겨 pointer가 사라진 경우는 '놓기'로 보지 않는다
      if (prev.isPinching && !next.isPinching && next.pointer && isOverCoinSlot(next.pointer)) eventBus.emit('input:coin');
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

    // 머리 회전 → 지금 시점 기준으로 상대 회전. 거리(줌)와 마우스로 돌린 각도는 유지된다.
    const kLook = 1 - Math.exp(-HEAD_LOOK_SMOOTHING * dt);
    look.yaw += ((game ? clamp(input.headYaw, HEAD_LOOK_LIMIT.yaw) * HEAD_LOOK_GAIN.yaw : 0) - look.yaw) * kLook;
    look.pitch += ((game ? clamp(input.headPitch, HEAD_LOOK_LIMIT.pitch) * HEAD_LOOK_GAIN.pitch : 0) - look.pitch) * kLook;
    // 카메라 이동 중이거나 사용자가 드래그 중이면 회전하지 않고 기준만 맞춘다 (끝난 뒤 튀지 않도록)
    if (game && !sceneManager.isCameraMoving && !sceneManager.isUserControlling) {
      sceneManager.orbitBy(look.yaw - applied.yaw, -(look.pitch - applied.pitch));
    }
    applied.yaw = look.yaw;
    applied.pitch = look.pitch;

    // 손 위치 커서 (pointer는 모션 입력만 넣는다)
    const showCursor = Boolean(input.pointer) && !blocked;
    cursor.hidden = !showCursor;
    if (showCursor) {
      const holdingCoin = Boolean(game) && input.isPinching;
      cursor.style.transform = `translate(${input.pointer.x * window.innerWidth}px, ${input.pointer.y * window.innerHeight}px)`;
      cursor.textContent = holdingCoin ? '🪙' : '';
      cursor.classList.toggle('holding', holdingCoin);
      cursor.classList.toggle('over-slot', holdingCoin && isOverCoinSlot(input.pointer));
    }
  });
}
