import { HandLandmarker } from '@mediapipe/tasks-vision';
import { FACE } from './headPose.js';

const FACE_POINTS = Object.values(FACE);

/**
 * 게임 중 "내 모습" 카메라 창. (#8, #10)
 * 좌우 반전된 웹캠 영상 위에 손 관절과 인식된 동작을 그린다.
 * 위치/크기는 styles/motion.css (.motion-cam)
 */
export class MotionDebugView {
  constructor(video, parent = document.body) {
    this.video = video;
    this.parent = parent;
    this.visible = false;

    this.el = document.createElement('div');
    this.el.className = 'motion-cam';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');

    const label = document.createElement('div');
    label.className = 'motion-cam-label';
    label.innerHTML = '<span class="rec"></span>내 모습';
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'motion-cam-status';
    this.statusEl.hidden = true;

    this.el.append(this.canvas, label, this.statusEl);
  }

  show() {
    if (!this.visible) this.parent.append(this.el);
    this.visible = true;
  }

  hide() {
    this.el.remove();
    this.visible = false;
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  /** 영상 대신 안내 문구 표시 (null이면 숨김) */
  setStatus(text) {
    this.statusEl.hidden = !text;
    this.statusEl.textContent = text ?? '';
    if (text) {
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * @param {object} frame { hands, face } MediaPipe 결과
   * @param {object} hand HandTracker 상태
   * @param {object} [extra] 아래쪽에 표시할 추가 정보 { label: value } (label이 ''이면 값만)
   */
  draw({ hands, face }, hand, extra = {}) {
    if (!this.visible) return;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // 거울처럼 좌우 반전
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
      for (const i of FACE_POINTS) if (fl[i]) ctx.fillRect(fl[i].x * w - 2, fl[i].y * h - 2, 4, 4);
    }
    ctx.restore();

    const flags = hand.detected
      ? [hand.isFist && '✊ 주먹', hand.isPointing && '☝️ 가리키기', hand.isPinching && '🤏 집기'].filter(Boolean).join(' ') || '🖐 손'
      : '손을 보여 주세요';
    const lines = [flags, ...Object.entries(extra).map(([k, v]) => (k ? `${k}: ${v}` : String(v)))];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 18 * lines.length - 6, w, 18 * lines.length + 6);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Jua, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 8, h - 18 * (lines.length - i) + 12));
  }

  dispose() {
    this.hide();
  }
}
