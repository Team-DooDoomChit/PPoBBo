import { inputState } from '../core/InputState.js';
import { eventBus } from '../core/EventBus.js';
import { isModalOpen } from '../ui/modal.js';

const AXES = {
  ArrowLeft: ['joystickX', -1],
  KeyA: ['joystickX', -1],
  ArrowRight: ['joystickX', 1],
  KeyD: ['joystickX', 1],
  ArrowUp: ['joystickY', 1],
  KeyW: ['joystickY', 1],
  ArrowDown: ['joystickY', -1],
  KeyS: ['joystickY', -1],
};

/**
 * 키보드 → InputState 어댑터 (모션 인식 연동 전 테스트 / 대체 입력).
 *   방향키·WASD : 조이스틱      Space : 주먹(집게 내리기)
 *   Enter       : 확인          C     : 코인 넣기
 */
export function setupKeyboardInput() {
  const pressed = new Set();

  const push = () => {
    let joystickX = 0;
    let joystickY = 0;
    pressed.forEach((code) => {
      const axis = AXES[code];
      if (axis?.[0] === 'joystickX') joystickX += axis[1];
      if (axis?.[0] === 'joystickY') joystickY += axis[1];
    });
    inputState.update({ joystickX, joystickY, isFist: pressed.has('Space') }, 'keyboard');
  };

  window.addEventListener('keydown', (e) => {
    // 모달이 열려 있거나 입력창이면 브라우저 기본 키 동작(버튼 누르기 등)을 그대로 쓴다
    if (isModalOpen() || e.target.closest?.('input, textarea')) return;
    // Ctrl+C(복사), Ctrl+W 같은 단축키는 게임 입력으로 쓰지 않는다
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat) return;
    const isButtonKey = e.code === 'Space' || e.code === 'Enter';
    // 키보드(Tab)로 버튼에 포커스를 옮겨 둔 경우엔 그 버튼을 누르게 둔다
    if (isButtonKey && e.target.matches?.('button:focus-visible')) return;
    // 마우스 클릭으로 남은 포커스 때문에 버튼이 한 번 더 눌리지 않도록
    if (isButtonKey) document.activeElement?.blur?.();
    if (e.code === 'Enter') eventBus.emit('input:confirm');
    if (e.code === 'KeyC') eventBus.emit('input:coin');
    if (AXES[e.code] || e.code === 'Space') {
      e.preventDefault();
      pressed.add(e.code);
      push();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (pressed.delete(e.code)) push();
  });

  // 창이 포커스를 잃으면 눌린 키를 모두 해제
  window.addEventListener('blur', () => {
    if (pressed.size === 0) return;
    pressed.clear();
    push();
  });
}
