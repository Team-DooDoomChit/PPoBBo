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
 * 웹캠 → MotionTracker → HandTracker / HeadTracker → MotionBridge → inputState → MotionBinding(A)
 *
 * - HUD의 📷 버튼으로 켜고 끈다 (페이지를 열자마자 카메라 권한을 묻지 않도록).
 * - 켜져 있는 동안 왼쪽 아래에 웹캠 미리보기(디버그 화면)를 보여준다. V 키로 숨기기/보이기.
 * - R 키: 머리 정면 다시 맞추기 + 지금 손 위치를 조이스틱 가운데로.
 */
const ERROR_TEXT = {
  unsupported: '이 브라우저에서는 카메라를 쓸 수 없어요 (https 또는 localhost에서 열어 주세요)',
  'permission-denied': '카메라 권한이 거부됐어요. 주소창의 카메라 아이콘에서 허용해 주세요',
  'no-camera': '카메라를 찾을 수 없어요. 연결 상태나 다른 앱에서 사용 중인지 확인해 주세요',
  'load-failed': '모션 인식 모델을 불러오지 못했어요. 네트워크를 확인해 주세요',
};

/** 화면 왼쪽부터 기계 id (gazeTarget용) */
const machineOrder = () => [...MACHINES].sort((a, b) => a.position[0] - b.position[0]).map((m) => m.id);

export function setupMotion({ hud }) {
  const hand = new HandTracker();
  const head = new HeadTracker(machineOrder());
  const bridge = new MotionBridge(inputState);
  let handState = hand.state;

  const tracker = new MotionTracker({
    onFrame: (frame) => {
      handState = hand.update(frame.hands, frame.t);
      const headState = head.update(frame.face, frame.t);
      bridge.push(handState, headState);
      view.draw(frame, handState, {
        fps: tracker.fps,
        yaw: headState.calibrated ? `${Math.round((headState.yaw * 180) / Math.PI)}°` : '정면 맞추는 중...',
        gaze: headState.gazeTarget ?? '-',
      });
    },
  });
  const view = new MotionDebugView(tracker.video);

  let starting = false;
  const button = hud.addAction('📷', () => toggle(), '모션 인식 켜기/끄기');

  const setButton = (state) => {
    button.textContent = { off: '📷', loading: '⏳', on: '📷 ON' }[state];
    button.classList.toggle('active', state === 'on');
    button.disabled = state === 'loading';
  };

  async function start() {
    if (tracker.running || starting) return;
    starting = true;
    setButton('loading');
    toast('카메라와 모션 인식 모델을 준비하는 중...', { duration: 2500 });
    const result = await tracker.start();
    starting = false;
    if (!result.ok) {
      setButton('off');
      toast(ERROR_TEXT[result.reason] ?? '모션 인식을 시작하지 못했어요', { type: 'warn', duration: 4000 });
      eventBus.emit('motion:error', { reason: result.reason });
      return;
    }
    hand.reset();
    head.recalibrate();
    view.show();
    setButton('on');
    toast('모션 인식 ON · 정면을 보고 잠시 기다려 주세요', { type: 'good', duration: 2500 });
    eventBus.emit('motion:started');
  }

  function stop() {
    tracker.stop();
    view.hide();
    bridge.release();
    setButton('off');
    eventBus.emit('motion:stopped');
  }

  function toggle() {
    if (tracker.running) stop();
    else start();
  }

  function recenter() {
    head.recalibrate();
    if (handState.detected) bridge.recenter(handState.palm);
    toast('정면과 손 위치를 다시 맞췄어요', { duration: 1500 });
  }

  window.addEventListener('keydown', (e) => {
    if (!tracker.running || e.repeat || e.target.closest?.('input, textarea')) return;
    if (e.code === 'KeyV') view.toggle();
    if (e.code === 'KeyR') recenter();
  });

  // 다른 탭으로 가면 카메라를 끈다 (배터리, 다른 앱의 카메라 사용)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && tracker.running) stop();
  });

  return { start, stop, toggle, recenter, tracker, hand, head, bridge, view };
}
