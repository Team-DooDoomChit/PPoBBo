import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

/**
 * 웹캠 + MediaPipe 실행기 (브라우저 전용). (#8 손, #9 얼굴)
 *
 * preload() → 모델만 미리 받기 (권한 불필요)
 * start()   → 카메라 권한 요청, 모델 로드, 프레임 루프 시작 / stop() → 카메라 끄기
 * 매 프레임 onFrame({ hands, face, t }) 호출
 *   hands = HandLandmarker 결과, face = FaceLandmarker 결과 (face: false면 null)
 * 얼굴은 손보다 덜 급하므로 faceEvery 프레임마다 한 번만 인식하고 그 사이엔 직전 결과를 넘긴다.
 *
 * 실패 시 start()가 { ok: false, reason } 반환:
 *   'unsupported'       getUserMedia 미지원 (http 접속 등)
 *   'permission-denied' 카메라 권한 거부
 *   'no-camera'         카메라 없음 / 다른 앱이 사용 중
 *   'load-failed'       MediaPipe 모델/WASM 로드 실패 (네트워크 등)
 *   'cancelled'         시작하는 도중 stop() 호출됨
 */
const VERSION = '0.10.35'; // package.json의 @mediapipe/tasks-vision 버전과 맞춘다
export const MEDIAPIPE_URLS = Object.freeze({
  wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`,
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
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

  #frame = 0;
  #models = null; // preload() Promise
  #starting = null; // 진행 중인 시작 { id, cancelled, promise }
  #startId = 0;
  #lastFace = null;

  constructor({ onFrame, urls = MEDIAPIPE_URLS, face = true, faceEvery = 2 } = {}) {
    this.onFrame = onFrame;
    this.urls = urls;
    this.useFace = face;
    this.faceEvery = faceEvery;
    this.faces = null;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.hands = null;
    this.fps = 0;
  }

  get running() {
    return this.#running;
  }

  /**
   * 카메라 없이 모델만 미리 받는다 (카메라 권한이 필요 없음).
   * 여러 번 불러도 한 번만 받고, 실패하면 다음 호출 때 다시 시도한다.
   */
  preload() {
    this.#models ??= this.#loadModels().catch((err) => {
      this.#models = null;
      throw err;
    });
    return this.#models;
  }

  /**
   * 동시에 여러 번 불러도 한 번만 시작한다.
   * 시작하는 도중 stop()이 불리면 카메라를 다시 끄고 { ok: false, reason: 'cancelled' }
   * 취소된 시작이 아직 정리 중일 때 다시 부르면, 정리가 끝난 뒤 새로 시작한다.
   */
  start() {
    if (this.#running) return Promise.resolve({ ok: true });
    const prev = this.#starting;
    if (prev && !prev.cancelled) return prev.promise;

    const attempt = { id: ++this.#startId, cancelled: false };
    attempt.promise = (prev?.promise ?? Promise.resolve())
      .then(() => this.#start(attempt))
      .finally(() => {
        if (this.#starting === attempt) this.#starting = null;
      });
    this.#starting = attempt;
    return attempt.promise;
  }

  async #start(attempt) {
    const cancelled = () => attempt.cancelled;
    if (cancelled()) return { ok: false, reason: 'cancelled' };
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'unsupported' };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      console.warn('[MotionTracker] 카메라를 열 수 없습니다.', err);
      return { ok: false, reason: cameraErrorReason(err) };
    }
    const release = () => stream.getTracks().forEach((track) => track.stop());
    if (cancelled()) return release(), { ok: false, reason: 'cancelled' };

    try {
      await this.preload();
    } catch (err) {
      console.warn('[MotionTracker] MediaPipe 로드 실패', err);
      release();
      return { ok: false, reason: 'load-failed' };
    }
    if (cancelled()) return release(), { ok: false, reason: 'cancelled' };

    this.#stream = stream;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
    if (cancelled()) return { ok: false, reason: 'cancelled' }; // stop()이 이미 정리함

    this.#running = true;
    this.#loop();
    return { ok: true };
  }

  stop() {
    if (this.#starting) this.#starting.cancelled = true; // 진행 중인 start()는 취소
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
    this.faces?.close();
    this.hands = null;
    this.faces = null;
    this.#models = null;
  }

  async #loadModels() {
    const needFace = this.useFace && !this.faces;
    if (this.hands && !needFace) return;
    const vision = await FilesetResolver.forVisionTasks(this.urls.wasm);
    // 두 모델을 동시에 받는다
    const [hands, faces] = await Promise.all([
      this.hands ??
        createWithFallback(HandLandmarker, vision, {
          baseOptions: { modelAssetPath: this.urls.hand },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        }),
      needFace
        ? createWithFallback(FaceLandmarker, vision, {
            baseOptions: { modelAssetPath: this.urls.face },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          })
        : this.faces,
    ]);
    this.hands = hands;
    this.faces = faces;
  }

  #loop = () => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#loop);
    // 새 영상 프레임이 들어왔을 때만 처리
    if (this.video.readyState < 2 || this.video.currentTime === this.#lastVideoTime) return;
    this.#lastVideoTime = this.video.currentTime;

    const nowMs = performance.now();
    const hands = this.hands.detectForVideo(this.video, nowMs);
    if (this.faces && this.#frame++ % this.faceEvery === 0) this.#lastFace = this.faces.detectForVideo(this.video, nowMs);
    this.#measureFps(nowMs);
    this.onFrame?.({ hands, face: this.#lastFace, t: nowMs / 1000 });
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
