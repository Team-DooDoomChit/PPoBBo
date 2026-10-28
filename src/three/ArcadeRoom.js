import * as THREE from 'three';
import { createCheckerTexture, createTextTexture } from './textures.js';

const ROOM = { width: 12, depth: 10, height: 4 };

/** 오락실 내부 공간(바닥, 벽, 네온 장식, 간판) */
export class ArcadeRoom {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ArcadeRoom';
    this.#buildFloor();
    this.#buildWalls();
    this.#buildNeon();
    this.#buildSign();
  }

  #buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
      new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.55, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  #buildWalls() {
    const material = new THREE.MeshStandardMaterial({ color: 0x1c1438, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), material);
    back.position.set(0, ROOM.height / 2, -ROOM.depth / 2);
    back.receiveShadow = true;

    const left = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), material);
    left.rotation.y = Math.PI / 2;
    left.position.set(-ROOM.width / 2, ROOM.height / 2, 0);
    left.receiveShadow = true;

    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.x = ROOM.width / 2;

    this.group.add(back, left, right);
  }

  #buildNeon() {
    const strips = [
      { color: 0xff4fa3, y: 3.4 },
      { color: 0x3de0ff, y: 0.15 },
    ];
    strips.forEach(({ color, y }) => {
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 });
      const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM.width, 0.04, 0.04), material);
      back.position.set(0, y, -ROOM.depth / 2 + 0.03);
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, ROOM.depth), material);
      left.position.set(-ROOM.width / 2 + 0.03, y, 0);
      const right = left.clone();
      right.position.x = ROOM.width / 2 - 0.03;
      this.group.add(back, left, right);
    });
  }

  #buildSign() {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshBasicMaterial({
        map: createTextTexture('PPoBBo ARCADE', { glow: '#ff4fa3' }),
        transparent: true,
        toneMapped: false,
      }),
    );
    sign.position.set(0, 3.0, -ROOM.depth / 2 + 0.05);
    this.group.add(sign);
  }
}
