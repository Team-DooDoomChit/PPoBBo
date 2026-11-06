import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ClawGame } from '../../src/physics/ClawGame.js';
import { isInChute } from '../../src/physics/MachineColliders.js';
import { MACHINES } from '../../src/data/machines.js';
import { MACHINE_SPEC, PLAY_FLOOR_Y } from '../../src/three/machineSpec.js';

const newGame = (id) => new ClawGame({ config: { id }, group: new THREE.Group(), setClawPosition() {}, setCableLength() {}, setProngOpen() {} });
const uprightRatio = (dolls) => {
  const upright = dolls.filter(({ body: { quaternion: q } }) => 1 - 2 * (q.x * q.x + q.z * q.z) > Math.cos(Math.PI / 6));
  return upright.length / dolls.length;
};

for (const { id } of MACHINES) {
  test(`${id}: 인형 30개가 쓰러져 쌓이고, 저절로 배출구에 들어가지 않는다`, () => {
    const game = newGame(id);
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    assert.equal(game.dolls.length, 30);
    assert.ok(game.dolls.every((d) => !isInChute(d.body.position)));
    assert.ok(uprightRatio(game.dolls) < 0.7, `똑바로 선 비율 ${uprightRatio(game.dolls)}`);
  });
}

const { chute } = MACHINE_SPEC;
const chuteMidZ = (chute.minZ + chute.maxZ) / 2;

test('집게가 칸막이 바로 위로 내려오면 보이는 칸막이 끝에서 멈춘다', () => {
  const game = newGame('bear');
  for (const d of game.dolls) d.body.collisionFilterGroup = 0; // 인형 없이 칸막이만 본다
  game.claw.startRound();
  game.claw.x = chute.minX;
  game.claw.z = chuteMidZ;
  game.claw.drop();
  for (let i = 0; i < 600 && game.claw.state === 'descending'; i++) game.update(1 / 60);
  assert.equal(game.claw.state, 'grabbing');
  const height = game.claw.body.position.y - PLAY_FLOOR_Y;
  assert.ok(height < chute.wallHeight + 0.15, `칸막이 위 멈춘 높이 ${height}`);
});

test('보이는 칸막이보다 높이 날아온 인형도 배출구로 넘어가지 못한다', () => {
  const game = newGame('bear');
  const { body } = game.dolls[0];
  body.wakeUp();
  body.position.set(chute.minX - 0.12, PLAY_FLOOR_Y + chute.wallHeight + 0.09, chuteMidZ);
  body.velocity.set(1.5, 0, 0);
  for (let i = 0; i < 30; i++) game.update(1 / 60);
  assert.ok(body.position.x < chute.minX, `인형 x ${body.position.x}`);
});
