import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HandRoleAssigner, roleFromLabel, handScreenPos } from '../../src/motion/handRoles.js';
import { makeHand, POSES, NO_HAND } from './handFixtures.js';

/** 손 여러 개를 한 결과로 합친다. at은 카메라 원본 좌표 (화면에서는 좌우 반전) */
const hands = (...list) => {
  const parts = list.map(({ pose = POSES.open, at, label = 'Right' }) => {
    const r = makeHand(pose, at);
    r.handedness = [[{ categoryName: label, score: 0.9 }]];
    return r;
  });
  return {
    landmarks: parts.flatMap((p) => p.landmarks),
    worldLandmarks: parts.flatMap((p) => p.worldLandmarks),
    handedness: parts.flatMap((p) => p.handedness),
  };
};
// 화면 왼쪽 = 카메라 원본 오른쪽
const SCREEN_LEFT = { x: 0.75, y: 0.6 };
const SCREEN_RIGHT = { x: 0.25, y: 0.6 };

test('화면 위치는 좌우 반전된 값', () => {
  const p = handScreenPos(makeHand(POSES.open, SCREEN_LEFT).landmarks[0]);
  assert.ok(p.x < 0.5, `화면 왼쪽이어야 함 (x=${p.x.toFixed(2)})`);
});

test('라벨은 원본 영상 기준이라 반대로 읽는다', () => {
  assert.equal(roleFromLabel([{ categoryName: 'Left' }]), 'right');
  assert.equal(roleFromLabel([{ categoryName: 'Right' }]), 'left');
  assert.equal(roleFromLabel([{ categoryName: 'Left' }], false), 'left');
  assert.equal(roleFromLabel(undefined), null);
});

test('두 손: 라벨과 상관없이 화면 왼쪽 손이 왼손', () => {
  const a = new HandRoleAssigner();
  // 라벨을 일부러 둘 다 같게 줘도 위치로 나눈다
  const r = a.assign(hands({ at: SCREEN_RIGHT, pose: POSES.fist }, { at: SCREEN_LEFT }), 0);
  assert.deepEqual(r.index, { left: 1, right: 0 });
  assert.equal(r.right.landmarks.length, 1);
});

test('두 손: 결과에는 해당 손만 담긴다', () => {
  const a = new HandRoleAssigner();
  const r = a.assign(hands({ at: SCREEN_LEFT }, { at: SCREEN_RIGHT, pose: POSES.fist }), 0);
  assert.ok(handScreenPos(r.left.landmarks[0]).x < 0.5);
  assert.ok(handScreenPos(r.right.landmarks[0]).x > 0.5);
  assert.equal(r.right.worldLandmarks.length, 1);
});

test('한 손만, 기록 없음: 라벨로 판단', () => {
  const a = new HandRoleAssigner();
  assert.deepEqual(a.assign(hands({ at: SCREEN_RIGHT, label: 'Left' }), 0).index, { left: -1, right: 0 });
  a.reset();
  assert.deepEqual(a.assign(hands({ at: SCREEN_RIGHT, label: 'Right' }), 0).index, { left: 0, right: -1 });
});

test('한 손만: 직전에 같은 자리에 있던 손의 역할을 이어 간다 (라벨이 뒤집혀도)', () => {
  const a = new HandRoleAssigner();
  a.assign(hands({ at: SCREEN_LEFT }, { at: SCREEN_RIGHT }), 0);
  // 왼손이 화면 밖으로 나가고 오른손만 남음. 라벨은 '왼손'으로 잘못 나옴
  const r = a.assign(hands({ at: { x: 0.27, y: 0.62 }, label: 'Right' }), 0.033);
  assert.deepEqual(r.index, { left: -1, right: 0 });
  assert.equal(r.left.landmarks.length, 0);
});

test('한 손만: 오래 안 보였으면 직전 기록 대신 라벨', () => {
  const a = new HandRoleAssigner();
  a.assign(hands({ at: SCREEN_LEFT }, { at: SCREEN_RIGHT }), 0);
  a.assign(NO_HAND, 0.1);
  const r = a.assign(hands({ at: SCREEN_RIGHT, label: 'Right' }), 2);
  assert.deepEqual(r.index, { left: 0, right: -1 });
});

test('손이 없으면 둘 다 빈 결과', () => {
  const r = new HandRoleAssigner().assign(NO_HAND, 0);
  assert.deepEqual(r.index, { left: -1, right: -1 });
  assert.equal(r.left.landmarks.length, 0);
  assert.equal(r.right.landmarks.length, 0);
});
