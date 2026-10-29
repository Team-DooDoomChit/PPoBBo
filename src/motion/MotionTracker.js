import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * 웹캠 + MediaPipe 실행기 (브라우저 전용). (#8)
 *
 * start() → 카메라 권한 요청, 모델 로드, 프레임 루프 시작.
 * 매 프레임 onFrame({ hands, t }) 호출 (hands = HandLandmarker 결과).
 *
 * 실패 시 start()가 { ok: false, reason } 반환:
 *   'unsupported'       getUserMedia 미지원 (http 접속 등)
 *   'permission-denied' 카메라 권한 거부
 *   'no-camera'         카메라 없음 / 다른 앱이 사용 중 / 영상 재생 실패
 *   'load-failed'       MediaPipe 모델/WASM 로드 실패 (네트워크 등)
 *
 * 실행 중 인식이 실패하면(GPU 컨텍스트 손실 등) 멈추고 onError({ reason: 'runtime-error', error }) 호출.
 */
const VERSION = '0.10.35'; // package.json의 @mediapipe/tasks-vision 버전과 맞춘다
export const MEDIAPIPE_URLS = Object.freeze({
  wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`,
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
});

async function createWithFallback(Task, vision, options) {
  try {
    return await Task.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (err) {
    console.warn('[MotionTracker] GPU 사용 불가, CPU로 실행합니다.', err);
    return Task.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

function cameraErrorReason(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'permission-denied';
  if (err?.name === 'NotFoundError' || err?.name === 'NotReadableError' || err?.name === 'OverconstrainedError') return 'no-camera';
  return 'no-camera';
}

export class MotionTracker {
  #stream = null;
  #rafId = 0;
  #lastVideoTime = -1;
  #running = false;

  constructor({ onFrame, onError, urls = MEDIAPIPE_URLS } = {}) {
    this.onFrame = onFrame;
    this.onError = onError;
    this.urls = urls;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.hands = null;
    this.fps = 0;
  }

  get running() {
    return this.#running;
  }

  async start() {
    if (this.#running) return { ok: true };
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'unsupported' };

    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      console.warn('[MotionTracker] 카메라를 열 수 없습니다.', err);
      return { ok: false, reason: cameraErrorReason(err) };
    }

    try {
      await this.#loadModels();
    } catch (err) {
      console.warn('[MotionTracker] MediaPipe 로드 실패', err);
      this.stop();
      return { ok: false, reason: 'load-failed' };
    }

    try {
      this.video.srcObject = this.#stream;
      await this.video.play();
    } catch (err) {
      // 재생이 막히거나(AbortError 등) 스트림이 끊긴 경우: 카메라를 닫고 실패로 돌려준다
      console.warn('[MotionTracker] 영상 재생 실패', err);
      this.stop();
      return { ok: false, reason: 'no-camera' };
    }
    this.#running = true;
    this.#loop();
    return { ok: true };
  }

  stop() {
    this.#running = false;
    cancelAnimationFrame(this.#rafId);
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.video.srcObject = null;
  }

  /** 모델 정리 (다시 start() 하면 다시 로드) */
  dispose() {
    this.stop();
    this.hands?.close();
    this.hands = null;
  }

  async #loadModels() {
    if (this.hands) return;
    const vision = await FilesetResolver.forVisionTasks(this.urls.wasm);
    this.hands = await createWithFallback(HandLandmarker, vision, {
      baseOptions: { modelAssetPath: this.urls.hand },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
  }

  #loop = () => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#loop);
    // 새 영상 프레임이 들어왔을 때만 처리
    if (this.video.readyState < 2 || this.video.currentTime === this.#lastVideoTime) return;
    this.#lastVideoTime = this.video.currentTime;

    const nowMs = performance.now();
    try {
      const hands = this.hands.detectForVideo(this.video, nowMs);
      this.#measureFps(nowMs);
      this.onFrame?.({ hands, t: nowMs / 1000 });
    } catch (err) {
      // GPU 컨텍스트 손실 등: 매 프레임 같은 에러가 반복되지 않도록 멈추고 알린다
      console.warn('[MotionTracker] 인식 중 오류로 멈춥니다.', err);
      this.stop();
      this.onError?.({ reason: 'runtime-error', error: err });
    }
  };

  #fpsFrames = 0;
  #fpsSince = 0;
  #measureFps(nowMs) {
    this.#fpsFrames++;
    if (nowMs - this.#fpsSince >= 1000) {
      this.fps = Math.round((this.#fpsFrames * 1000) / (nowMs - this.#fpsSince));
      this.#fpsFrames = 0;
      this.#fpsSince = nowMs;
    }
  }
}
