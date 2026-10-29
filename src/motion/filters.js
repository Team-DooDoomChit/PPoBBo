/**
 * 손 떨림 보정용 필터. (#8)
 */

/**
 * One Euro Filter: 천천히 움직일 땐 강하게 떨림을 줄이고, 빠르게 움직일 땐 지연을 줄인다.
 * (Casiez et al., 2012)
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.2, beta = 0.02, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  static #alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param value 새 값 @param t 시각(초) */
  filter(value, t) {
    if (this.x === null || this.t === null || t <= this.t) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = t - this.t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.#alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.#alpha(cutoff, dt) * (value - this.x);
    this.t = t;
    return this.x;
  }
}

/** {x, y} 점을 축별 One Euro Filter로 보정 */
export class PointFilter {
  constructor(options) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }

  filter(p, t) {
    return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) };
  }
}

/**
 * boolean 디바운서: 새 값이 일정 시간 이상 유지되어야 바뀐다.
 * 켜질 때(onMs)와 꺼질 때(offMs)를 따로 줄 수 있다.
 */
export class BoolDebouncer {
  constructor({ onMs = 80, offMs = 120 } = {}) {
    Object.assign(this, { onMs, offMs });
    this.reset();
  }

  reset(value = false) {
    this.value = value;
    this.pending = null; // { value, since }
  }

  /** @param raw 이번 프레임 값 @param t 시각(초) @returns 디바운스된 값 */
  update(raw, t) {
    if (raw === this.value) {
      this.pending = null;
      return this.value;
    }
    if (!this.pending || this.pending.value !== raw) this.pending = { value: raw, since: t };
    const wait = (raw ? this.onMs : this.offMs) / 1000;
    if (t - this.pending.since >= wait) {
      this.value = raw;
      this.pending = null;
    }
    return this.value;
  }
}
