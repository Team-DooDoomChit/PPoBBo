import '../styles/motion.css';
import { inputState } from '../core/InputState.js';
import { eventBus } from '../core/EventBus.js';
import { MACHINES } from '../data/machines.js';
import { toast } from '../ui/toast.js';
import { isModalOpen } from '../ui/modal.js';
import { MotionTracker } from './MotionTracker.js';
import { HandTracker } from './HandTracker.js';
import { HandRoleAssigner } from './handRoles.js';
import { HeadTracker } from './HeadTracker.js';
import { MotionBridge } from './MotionBridge.js';
import { MotionDebugView } from './MotionDebugView.js';

/**
 * 모션 인식을 앱에 연결한다. (#10, #34)
 *
 * 웹캠 → MotionTracker → HandRoleAssigner → 왼손/오른손 HandTracker ┐
 *                       └→ HeadTracker(#9) ─────────────────────────┴→ MotionBridge → inputState → MotionBinding(#6)
 *
 * - 왼손은 조이스틱(쥐듯이 세우고 기울이기), 오른손은 주먹·내려치기로 집게 내리기, OK 사인은 코인 투입 (#34)
 * - 기계를 골라 게임 화면에 들어가면 카메라가 켜지고, 게임 화면을 나가면 꺼진다.
 * - 게임 중에는 "내 모습" 카메라 창을 보여준다. (V 키로 숨기기/보이기)
 * - 기계 선택 화면에서 모델을 미리 받아 두어 게임 시작 때 기다리는 시간을 줄인다.
 * - 고개를 돌리면 시점이 그 방향으로 살짝 움직인다 (MotionBinding, 크게 도는 건 마우스로)
 * - R 키: 머리 정면 다시 맞추기 + (쥐고 있으면) 지금 왼손 자세를 조이스틱 가운데로.
 *   왼손 가운데는 쥘 때마다 자동으로 잡는다.
 */
const CAMERA_SCREEN = 'game';

const ERROR_TEXT = {
  unsupported: '이 브라우저에서는 카메라를 쓸 수 없어요\n(https 또는 localhost에서 열어 주세요)',
  'permission-denied': '카메라 권한이 거부됐어요\n주소창의 카메라 아이콘에서 허용해 주세요',
  'no-camera': '카메라를 찾을 수 없어요\n연결 상태나 다른 앱에서 사용 중인지 확인해 주세요',
  'load-failed': '모션 인식 모델을 불러오지 못했어요\n네트워크를 확인해 주세요',
  'runtime-error': '모션 인식이 멈췄어요\n게임 화면을 나갔다 다시 들어오면 다시 켜져요',
};

/** 화면 왼쪽부터 기계 id (gazeTarget용) */
const machineOrder = () => [...MACHINES].sort((a, b) => a.position[0] - b.position[0]).map((m) => m.id);

export function setupMotion() {
  const roles = new HandRoleAssigner();
  const hand = { left: new HandTracker(), right: new HandTracker({ slam: true }) };
  const head = new HeadTracker(machineOrder());
  const bridge = new MotionBridge(inputState);
  let handState = { left: hand.left.state, right: hand.right.state, index: { left: -1, right: -1 } };
  let screen = null;
  let failed = null; // 권한 거부 등으로 실패한 이유 (같은 안내를 반복하지 않기 위해)

  const tracker = new MotionTracker({
    onFrame: (frame) => {
      const split = roles.assign(frame.hands, frame.t);
      handState = {
        left: hand.left.update(split.left, frame.t),
        right: hand.right.update(split.right, frame.t),
        index: split.index,
      };
      const headState = head.update(frame.face, frame.t);
      bridge.push(handState, headState);
      const notes = [];
      if (headState.detected && !headState.calibrated) notes.push('정면을 보고 잠시 기다려 주세요');
      if (handState.left.detected && !bridge.gripping) notes.push('왼손을 쥐면 집게가 움직여요 (펴면 멈춤)');
      view.draw(frame, handState, notes.length ? { '': notes[0] } : {});
    },
    // 인식 중 오류(GPU 컨텍스트 손실 등)로 멈췄을 때
    onError: ({ reason }) => {
      bridge.release();
      showError(reason);
    },
  });
  const view = new MotionDebugView(tracker.video);

  async function start() {
    if (tracker.running) return;
    view.setStatus('카메라 켜는 중...\n카메라 권한을 허용해 주세요');
    view.show();
    const result = await tracker.start();
    if (result.reason === 'cancelled') return; // 켜는 도중에 게임 화면을 나감

    if (!result.ok) {
      showError(result.reason);
      return;
    }
    failed = null;
    roles.reset();
    head.recalibrate();
    hand.left.reset();
    hand.right.reset();
    view.setStatus(null);
    eventBus.emit('motion:started');
  }

  /** 카메라 창 안내 + (같은 이유면 한 번만) 토스트 + motion:error */
  function showError(reason) {
    const text = ERROR_TEXT[reason] ?? '모션 인식을 시작하지 못했어요';
    view.setStatus(`${text}\n\n버튼과 키보드로도 플레이할 수 있어요`);
    if (failed !== reason) toast(text.split('\n')[0], { type: 'warn', duration: 3500 });
    failed = reason;
    eventBus.emit('motion:error', { reason });
  }

  function stop() {
    const wasRunning = tracker.running;
    tracker.stop();
    view.hide();
    bridge.release();
    if (wasRunning) eventBus.emit('motion:stopped');
  }

  function recenter() {
    head.recalibrate();
    if (!bridge.gripping) {
      toast('정면을 다시 맞췄어요', { duration: 1500 });
      return;
    }
    bridge.recenter(handState.left.tilt);
    toast('정면과 왼손 자세를 다시 맞췄어요', { duration: 1500 });
  }

  eventBus.on('screen:changed', ({ name }) => {
    screen = name;
    if (name === CAMERA_SCREEN) start();
    else stop();
    // 기계를 고르는 동안 모델을 미리 받아 둔다 (카메라 권한은 묻지 않음)
    if (name === 'select') tracker.preload().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (screen !== CAMERA_SCREEN || e.repeat) return;
    // 모달·입력창에서는 쓰지 않고, Ctrl+V(붙여넣기)·Ctrl+R(새로고침) 같은 조합키도 무시한다 (KeyboardInput과 같은 조건)
    if (isModalOpen() || e.target.closest?.('input, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyV') view.toggle();
    if (e.code === 'KeyR' && tracker.running) recenter();
  });

  // 다른 탭으로 가면 카메라를 끄고, 게임 화면으로 돌아오면 다시 켠다
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else if (screen === CAMERA_SCREEN) start();
  });

  return { start, stop, recenter, tracker, roles, hand, head, bridge, view };
}
