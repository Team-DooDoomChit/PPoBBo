import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ClawGame } from '../../src/physics/ClawGame.js';
import { isInChute } from '../../src/physics/MachineColliders.js';
import { MACHINES } from '../../src/data/machines.js';

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
