import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estimateHeadPose, headRatios } from '../../src/motion/headPose.js';
import { GazeSelector } from '../../src/motion/GazeSelector.js';
import { HeadTracker } from '../../src/motion/HeadTracker.js';
import { makeFace, NO_FACE } from './faceFixtures.js';

const lm = (yaw, pitch, at) => makeFace(yaw, pitch, at).faceLandmarks[0];
const zeroAt = (yaw = 0, pitch = 0) => headRatios(lm(yaw, pitch));
const deg = (r) => (r * 180) / Math.PI;

// ---------------- 머리 각도 ----------------

test('정면이면 0', () => {
  const p = estimateHeadPose(lm(0, 0), zeroAt());
  assert.ok(Math.abs(p.yaw) < 1e-9 && Math.abs(p.pitch) < 1e-9);
});

test('오른쪽으로 돌리면 yaw +, 왼쪽이면 -', () => {
  assert.ok(estimateHeadPose(lm(0.3, 0), zeroAt()).yaw > 0);
  assert.ok(estimateHeadPose(lm(-0.3, 0), zeroAt()).yaw < 0);
});

test('yaw 크기가 실제 회전과 비슷하다 (±2도)', () => {
  for (const a of [0.1, 0.25, 0.4]) {
    const est = estimateHeadPose(lm(a, 0), zeroAt()).yaw;
    assert.ok(Math.abs(deg(est - a)) < 2, `${deg(a).toFixed(0)}도 → ${deg(est).toFixed(1)}도`);
  }
});

test('위를 보면 pitch +, 아래면 -', () => {
  assert.ok(estimateHeadPose(lm(0, 0.25), zeroAt()).pitch > 0);
  assert.ok(estimateHeadPose(lm(0, -0.25), zeroAt()).pitch < 0);
});

test('yaw만 돌려도 pitch는 거의 그대로', () => {
  assert.ok(Math.abs(estimateHeadPose(lm(0.35, 0), zeroAt()).pitch) < 0.03);
});

test('카메라와의 거리·화면 위치가 달라도 같은 각도', () => {
  const a = estimateHeadPose(lm(0.3, 0), zeroAt()).yaw;
  const b = estimateHeadPose(lm(0.3, 0, { x: 0.3, y: 0.6, scale: 1.2 }), zeroAt()).yaw;
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('정면 보정: 비스듬히 앉아 있어도 그 자세가 0', () => {
  const p = estimateHeadPose(lm(0.2, 0.1), zeroAt(0.2, 0.1));
  assert.ok(Math.abs(p.yaw) < 1e-9 && Math.abs(p.pitch) < 1e-9);
});

test('랜드마크가 없으면 null', () => {
  assert.equal(estimateHeadPose(undefined), null);
  assert.equal(estimateHeadPose([]), null);
});

// ---------------- 바라보는 기계 선택 ----------------

const IDS = ['bear', 'bunny', 'chick'];

function hold(sel, yaw, from, seconds, fps = 30) {
  let target;
  for (let i = 0; i <= seconds * fps; i++) target = sel.update(yaw, from + i / fps);
  return target;
}

test('응시: 1초 바라봐야 선택된다', () => {
  const sel = new GazeSelector(IDS);
  assert.equal(hold(sel, 0.3, 0, 0.5), null);
  assert.equal(hold(sel, 0.3, 0.5, 0.6), 'chick');
});

test('응시: 왼쪽 / 가운데 / 오른쪽', () => {
  const sel = new GazeSelector(IDS);
  assert.equal(hold(sel, -0.3, 0, 1.2), 'bear');
  assert.equal(hold(sel, 0, 2, 1.2), 'bunny');
  assert.equal(hold(sel, 0.3, 4, 1.2), 'chick');
});

test('응시: 범위 밖으로 많이 돌려도 끝 기계', () => {
  const sel = new GazeSelector(IDS);
  assert.equal(hold(sel, 1.2, 0, 1.2), 'chick');
});

test('응시: 경계 근처에서 흔들려도 구역이 바뀌지 않는다', () => {
  const sel = new GazeSelector(IDS); // 경계 ±0.1167
  hold(sel, 0, 0, 1.2); // bunny
  let t = 1.3;
  for (let i = 0; i < 60; i++) sel.update(i % 2 ? 0.13 : 0.1, (t += 1 / 30)); // 경계(0.117)를 살짝 넘나듦
  assert.equal(sel.target, 'bunny');
  assert.equal(sel.zone, 1);
});

test('응시: 중간에 다른 곳을 보면 시간이 처음부터', () => {
  const sel = new GazeSelector(IDS);
  hold(sel, 0.3, 0, 0.7);
  hold(sel, 0, 0.8, 0.2);
  assert.equal(hold(sel, 0.3, 1.1, 0.7), null);
});

test('응시: 얼굴이 없으면 선택 유지', () => {
  const sel = new GazeSelector(IDS);
  hold(sel, -0.3, 0, 1.2);
  assert.equal(sel.update(null, 2), 'bear');
});

test('응시 진행률', () => {
  const sel = new GazeSelector(IDS);
  sel.update(0.3, 0);
  assert.ok(Math.abs(sel.progress(0.5) - 0.5) < 1e-9);
});

// ---------------- HeadTracker ----------------

function feed(tracker, frames, from = 0) {
  let s;
  frames.forEach((f, i) => (s = tracker.update(f, from + i / 30)));
  return s;
}
const repeat = (f, n) => Array.from({ length: n }, () => f);

test('트래커: 처음 15프레임으로 정면을 잡는다', () => {
  const tr = new HeadTracker(IDS);
  const before = feed(tr, repeat(makeFace(0.15, 0), 14));
  assert.equal(before.calibrated, false);
  const s = feed(tr, repeat(makeFace(0.15, 0), 10), 1);
  assert.equal(s.calibrated, true);
  assert.ok(Math.abs(s.yaw) < 0.01, `비스듬한 자세가 정면 (${s.yaw.toFixed(3)})`);
});

test('트래커: 보정 후 고개를 돌리면 yaw와 응시 대상이 바뀐다', () => {
  const tr = new HeadTracker(IDS);
  feed(tr, repeat(makeFace(0, 0), 20));
  const s = feed(tr, repeat(makeFace(0.3, 0), 45), 1);
  assert.ok(s.yaw > 0.25, `yaw ${s.yaw.toFixed(3)}`);
  assert.equal(s.gazeTarget, 'chick');
});

test('트래커: 얼굴이 사라지면 yaw 0, 선택은 유지', () => {
  const tr = new HeadTracker(IDS);
  feed(tr, repeat(makeFace(0, 0), 20));
  feed(tr, repeat(makeFace(-0.3, 0), 45), 1);
  tr.update(NO_FACE, 3);
  const s = tr.update(NO_FACE, 3.6);
  assert.equal(s.detected, false);
  assert.equal(s.yaw, 0);
  assert.equal(s.gazeTarget, 'bear');
});

test('트래커: recalibrate하면 다시 정면을 잡는다', () => {
  const tr = new HeadTracker(IDS);
  feed(tr, repeat(makeFace(0, 0), 20));
  tr.recalibrate();
  const s = feed(tr, repeat(makeFace(0.2, 0), 25), 1);
  assert.ok(Math.abs(s.yaw) < 0.01);
});
