import '../styles/motion.css';
import { inputState } from '../core/InputState.js';
import { eventBus } from '../core/EventBus.js';
import { MACHINES } from '../data/machines.js';
import { toast } from '../ui/toast.js';
import { MotionTracker } from './MotionTracker.js';
import { HandTracker } from './HandTracker.js';
import { HeadTracker } from './HeadTracker.js';
import { MotionBridge } from './MotionBridge.js';
import { MotionDebugView } from './MotionDebugView.js';

/**
 * 모션 인식을 앱에 연결한다. (#10)
 *
 * 웹캠 → MotionTracker → HandTracker / HeadTracker → MotionBridge → inputState → MotionBinding(#6)
 *
 * - 기계를 골라 게임 화면에 들어가면 카메라가 켜지고, 게임 화면을 나가면 꺼진다.
 * - 게임 중에는 "내 모습" 카메라 창을 보여준다. (V 키로 숨기기/보이기)
 * - 기계 선택 화면에서 모델을 미리 받아 두어 게임 시작 때 기다리는 시간을 줄인다.
 * - R 키: 머리 정면 다시 맞추기 + 지금 손 위치를 조이스틱 가운데로.
 */
const CAMERA_SCREEN = 'game';

const ERROR_TEXT = {
  unsupported: '이 브라우저에서는 카메라를 쓸 수 없어요\n(https 또는 localhost에서 열어 주세요)',
  'permission-denied': '카메라 권한이 거부됐어요\n주소창의 카메라 아이콘에서 허용해 주세요',
  'no-camera': '카메라를 찾을 수 없어요\n연결 상태나 다른 앱에서 사용 중인지 확인해 주세요',
  'load-failed': '모션 인식 모델을 불러오지 못했어요\n네트워크를 확인해 주세요',
};

/** 화면 왼쪽부터 기계 id (gazeTarget용) */
const machineOrder = () => [...MACHINES].sort((a, b) => a.position[0] - b.position[0]).map((m) => m.id);

export function setupMotion() {
  const hand = new HandTracker();
  const head = new HeadTracker(machineOrder());
  const bridge = new MotionBridge(inputState);
  let handState = hand.state;
  let screen = null;
  let failed = null; // 권한 거부 등으로 실패한 이유 (같은 안내를 반복하지 않기 위해)

  const tracker = new MotionTracker({
    onFrame: (frame) => {
      handState = hand.update(frame.hands, frame.t);
      const headState = head.update(frame.face, frame.t);
      bridge.push(handState, headState);
      view.draw(frame, handState, headState.calibrated ? {} : { '': '정면을 보고 잠시 기다려 주세요' });
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
      view.setStatus(`${ERROR_TEXT[result.reason] ?? '모션 인식을 시작하지 못했어요'}\n\n버튼과 키보드로도 플레이할 수 있어요`);
      if (failed !== result.reason) toast(ERROR_TEXT[result.reason]?.split('\n')[0] ?? '모션 인식을 시작하지 못했어요', { type: 'warn', duration: 3500 });
      failed = result.reason;
      eventBus.emit('motion:error', { reason: result.reason });
      return;
    }
    failed = null;
    hand.reset();
    head.recalibrate();
    view.setStatus(null);
    eventBus.emit('motion:started');
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
    if (handState.detected) bridge.recenter(handState.palm);
    toast('정면과 손 위치를 다시 맞췄어요', { duration: 1500 });
  }

  eventBus.on('screen:changed', ({ name }) => {
    screen = name;
    if (name === CAMERA_SCREEN) start();
    else stop();
    // 기계를 고르는 동안 모델을 미리 받아 둔다 (카메라 권한은 묻지 않음)
    if (name === 'select') tracker.preload().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (screen !== CAMERA_SCREEN || e.repeat || e.target.closest?.('input, textarea')) return;
    if (e.code === 'KeyV') view.toggle();
    if (e.code === 'KeyR' && tracker.running) recenter();
  });

  // 다른 탭으로 가면 카메라를 끄고, 게임 화면으로 돌아오면 다시 켠다
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else if (screen === CAMERA_SCREEN) start();
  });

  return { start, stop, recenter, tracker, hand, head, bridge, view };
}
