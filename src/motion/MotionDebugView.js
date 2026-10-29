import { HandLandmarker } from '@mediapipe/tasks-vision';
import { FACE } from './headPose.js';

const FACE_POINTS = Object.values(FACE);

/**
 * 게임 중 "내 모습" 카메라 창. (#8, #10)
 * 좌우 반전된 웹캠 영상 위에 손 관절과 인식된 동작을 그린다. 손마다 역할(왼손 조이스틱 / 오른손 집게)을 색으로 구분한다.
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
   * @param {{ left: object, right: object, index: { left: number, right: number } }} hands
   *   손별 HandTracker 상태와 frame.hands 안에서의 순서 (#34)
   * @param {object} [extra] 아래쪽에 표시할 추가 정보 { label: value } (label이 ''이면 값만)
   */
  draw({ hands: result, face }, hands, extra = {}) {
    if (!this.visible) return;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // 거울처럼 좌우 반전
    if (this.video.readyState >= 2) ctx.drawImage(this.video, 0, 0, w, h);

    for (const role of ['left', 'right']) {
      const lm = result?.landmarks?.[hands.index[role]];
      if (!lm) continue;
      ctx.strokeStyle = handColor(role, hands[role]);
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

    // 머리 방향 계산에 쓰는 얼굴 기준점 (#9, 얼굴 인식을 켰을 때만)
    const fl = face?.faceLandmarks?.[0];
    if (fl) {
      ctx.fillStyle = '#ffd23f';
      for (const i of FACE_POINTS) if (fl[i]) ctx.fillRect(fl[i].x * w - 2, fl[i].y * h - 2, 4, 4);
    }
    ctx.restore();

    // 손 이름표 (반전된 화면 기준 위치)
    ctx.font = '13px Jua, sans-serif';
    for (const role of ['left', 'right']) {
      const lm = result?.landmarks?.[hands.index[role]];
      if (!lm) continue;
      const x = (1 - lm[0].x) * w;
      const y = lm[0].y * h + 16;
      const text = role === 'left' ? '왼손 🕹' : '오른손';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 24, y - 12, ctx.measureText(text).width + 8, 16);
      ctx.fillStyle = handColor(role, hands[role]);
      ctx.fillText(text, x - 20, y);
    }

    const lines = [describe('왼손', hands.left, '조이스틱'), describe('오른손', hands.right, '✊·내려치기 = 집게, 👌 = 코인'),
      ...Object.entries(extra).map(([k, v]) => (k ? `${k}: ${v}` : String(v)))];
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

/** 손 역할·동작별 선 색: 왼손 하늘색, 오른손 주황 / 주먹·내려치기 분홍, OK 노랑 */
function handColor(role, hand) {
  if (hand?.isOk) return '#ffd23f';
  if (role === 'right' && (hand?.isFist || hand?.isSlam)) return '#ff4fa3';
  return role === 'left' ? '#3de0ff' : '#ffa53d';
}

/** 아래쪽 안내 한 줄: 손이 없으면 무엇을 하는 손인지, 있으면 지금 동작 */
function describe(name, hand, role) {
  if (!hand?.detected) return `${name}: 보여 주세요 (${role})`;
  const now = [hand.isSlam && '💥 내려치기', hand.isFist && '✊ 주먹', hand.isOk && '👌 코인', hand.isPointing && '☝️'].filter(Boolean);
  return `${name}: ${now.join(' ') || role}`;
}
