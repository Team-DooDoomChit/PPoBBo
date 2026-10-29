import { HandLandmarker } from '@mediapipe/tasks-vision';
import { FACE } from './headPose.js';

const FACE_POINTS = Object.values(FACE);

/**
 * 디버그 화면: 좌우 반전된 웹캠 영상 위에 손 관절과 인식 상태를 그린다. (#8)
 * 화면 왼쪽 아래 작은 창으로 표시된다.
 */
const STYLE = {
  position: 'fixed',
  left: '12px',
  bottom: '12px',
  width: '240px',
  height: '180px',
  borderRadius: '12px',
  border: '2px solid rgba(108, 77, 255, 0.8)',
  background: '#000',
  zIndex: '50',
  pointerEvents: 'none',
};

export class MotionDebugView {
  constructor(video, parent = document.body) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.canvas.className = 'motion-debug';
    Object.assign(this.canvas.style, STYLE);
    this.ctx = this.canvas.getContext('2d');
    this.parent = parent;
    this.visible = false;
  }

  show() {
    if (!this.visible) this.parent.append(this.canvas);
    this.visible = true;
  }

  hide() {
    this.canvas.remove();
    this.visible = false;
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  /**
   * @param {object} frame { hands } MediaPipe 결과
   * @param {object} hand HandTracker 상태
   * @param {object} [extra] 아래쪽에 표시할 추가 정보 { label: value }
   */
  draw({ hands, face }, hand, extra = {}) {
    if (!this.visible) return;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // 셀피처럼 좌우 반전
    if (this.video.readyState >= 2) ctx.drawImage(this.video, 0, 0, w, h);

    const lm = hands?.landmarks?.[0];
    if (lm) {
      ctx.strokeStyle = hand.isFist ? '#ff4fa3' : hand.isPinching ? '#ffd23f' : '#3de0ff';
      ctx.lineWidth = 2;
      for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(lm[start].x * w, lm[start].y * h);
        ctx.lineTo(lm[end].x * w, lm[end].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      lm.forEach((p) => ctx.fillRect(p.x * w - 2, p.y * h - 2, 4, 4));
    }

    // 머리 방향 계산에 쓰는 얼굴 기준점 (#9)
    const fl = face?.faceLandmarks?.[0];
    if (fl) {
      ctx.fillStyle = '#ffd23f';
      for (const i of FACE_POINTS) if (fl[i]) ctx.fillRect(fl[i].x * w - 3, fl[i].y * h - 3, 6, 6);
    }
    ctx.restore();

    // 커서 위치 (이미 반전된 좌표)
    if (hand.pointer) {
      ctx.fillStyle = '#33ff88';
      ctx.beginPath();
      ctx.arc(hand.pointer.x * w, hand.pointer.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const flags = hand.detected
      ? [hand.isFist && '✊ 주먹', hand.isPointing && '☝️ 가리키기', hand.isPinching && '🤏 집기'].filter(Boolean).join(' ') || '🖐 손'
      : '손 없음';
    const lines = [flags, ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`)];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 16 * lines.length - 6, w, 16 * lines.length + 6);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 6, h - 16 * (lines.length - i) + 10));
  }

  dispose() {
    this.hide();
  }
}
