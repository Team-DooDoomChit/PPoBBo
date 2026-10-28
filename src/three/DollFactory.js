import * as THREE from 'three';

/**
 * 인형 3D 모델(절차적) 생성.
 * 원점 = 몸통 중심, +Y = 머리 방향, +Z = 얼굴 정면.
 * 물리 충돌체(DOLL_SHAPE)와 크기를 맞춘다.
 */
export const DOLL_SHAPE = {
  bodyRadius: 0.065,
  headRadius: 0.055,
  headOffsetY: 0.09,
};

const geo = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  cone: new THREE.ConeGeometry(1, 1, 16),
};

const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

function part(geometry, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const s = (r) => [r, r, r];

function createMaterials(doll) {
  const fur = new THREE.MeshStandardMaterial({
    color: doll.color,
    roughness: 0.85,
    emissive: doll.glow ? doll.color : 0x000000,
    emissiveIntensity: doll.glow ? 0.35 : 0,
  });
  const sub = new THREE.MeshStandardMaterial({ color: doll.sub, roughness: 0.8 });
  return { fur, sub };
}

function addFace(group, { headY, headR, muzzle }) {
  const eyeZ = headR * 0.88;
  group.add(
    part(geo.sphere, black, { pos: [-0.02, headY + 0.012, eyeZ], scale: s(0.008) }),
    part(geo.sphere, black, { pos: [0.02, headY + 0.012, eyeZ], scale: s(0.008) }),
  );
  if (muzzle) {
    group.add(part(geo.sphere, muzzle, { pos: [0, headY - 0.012, headR * 0.82], scale: [0.024, 0.018, 0.016] }));
    group.add(part(geo.sphere, black, { pos: [0, headY - 0.005, headR * 0.82 + 0.015], scale: s(0.007) }));
  }
}

const builders = {
  bear(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br * 0.95, br * 0.9] }),
      part(geo.sphere, sub, { pos: [0, -0.005, br * 0.62], scale: [0.04, 0.045, 0.025] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.sphere, fur, { pos: [-0.04, hy + 0.04, 0], scale: s(0.02) }),
      part(geo.sphere, fur, { pos: [0.04, hy + 0.04, 0], scale: s(0.02) }),
      // 팔다리
      part(geo.sphere, fur, { pos: [-0.06, 0.01, 0.02], scale: [0.02, 0.032, 0.02] }),
      part(geo.sphere, fur, { pos: [0.06, 0.01, 0.02], scale: [0.02, 0.032, 0.02] }),
      part(geo.sphere, fur, { pos: [-0.032, -0.055, 0.03], scale: s(0.024) }),
      part(geo.sphere, fur, { pos: [0.032, -0.055, 0.03], scale: s(0.024) }),
    );
    addFace(group, { headY: hy, headR: hr, muzzle: sub });
  },

  bunny(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br, br * 0.9] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.sphere, fur, { pos: [-0.022, hy + 0.075, 0], scale: [0.016, 0.045, 0.012], rot: [0, 0, 0.15] }),
      part(geo.sphere, fur, { pos: [0.022, hy + 0.075, 0], scale: [0.016, 0.045, 0.012], rot: [0, 0, -0.15] }),
      part(geo.sphere, sub, { pos: [-0.022, hy + 0.075, 0.007], scale: [0.009, 0.034, 0.008], rot: [0, 0, 0.15] }),
      part(geo.sphere, sub, { pos: [0.022, hy + 0.075, 0.007], scale: [0.009, 0.034, 0.008], rot: [0, 0, -0.15] }),
      part(geo.sphere, fur, { pos: [-0.03, -0.055, 0.03], scale: [0.024, 0.018, 0.032] }),
      part(geo.sphere, fur, { pos: [0.03, -0.055, 0.03], scale: [0.024, 0.018, 0.032] }),
      part(geo.sphere, sub, { pos: [0, -0.01, -br * 0.9], scale: s(0.02) }),
    );
    addFace(group, { headY: hy, headR: hr });
    group.add(part(geo.sphere, sub, { pos: [0, hy - 0.008, hr * 0.92], scale: s(0.007) }));
  },

  chick(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br * 1.05, br, br] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.cone, sub, { pos: [0, hy - 0.008, hr + 0.008], scale: [0.012, 0.022, 0.012], rot: [Math.PI / 2, 0, 0] }),
      part(geo.sphere, fur, { pos: [-0.066, 0.01, 0], scale: [0.012, 0.035, 0.028], rot: [0, 0, 0.4] }),
      part(geo.sphere, fur, { pos: [0.066, 0.01, 0], scale: [0.012, 0.035, 0.028], rot: [0, 0, -0.4] }),
      part(geo.cone, fur, { pos: [0, hy + hr + 0.008, 0], scale: [0.012, 0.025, 0.012] }),
      part(geo.sphere, sub, { pos: [-0.025, -0.065, 0.02], scale: [0.016, 0.008, 0.024] }),
      part(geo.sphere, sub, { pos: [0.025, -0.065, 0.02], scale: [0.016, 0.008, 0.024] }),
    );
    addFace(group, { headY: hy + 0.006, headR: hr });
  },

  cat(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br * 0.95, br * 0.9] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: [hr * 1.08, hr, hr] }),
      part(geo.cone, fur, { pos: [-0.032, hy + 0.05, 0], scale: [0.02, 0.035, 0.016], rot: [0, 0, 0.3] }),
      part(geo.cone, fur, { pos: [0.032, hy + 0.05, 0], scale: [0.02, 0.035, 0.016], rot: [0, 0, -0.3] }),
      part(geo.sphere, fur, { pos: [0, -0.02, -0.07], scale: [0.012, 0.012, 0.045], rot: [0.6, 0, 0] }),
      part(geo.sphere, fur, { pos: [-0.032, -0.055, 0.03], scale: s(0.022) }),
      part(geo.sphere, fur, { pos: [0.032, -0.055, 0.03], scale: s(0.022) }),
    );
    // 노란 눈
    group.add(
      part(geo.sphere, sub, { pos: [-0.02, hy + 0.01, hr * 0.86], scale: [0.011, 0.013, 0.006] }),
      part(geo.sphere, sub, { pos: [0.02, hy + 0.01, hr * 0.86], scale: [0.011, 0.013, 0.006] }),
      part(geo.sphere, black, { pos: [-0.02, hy + 0.01, hr * 0.86 + 0.005], scale: [0.004, 0.01, 0.003] }),
      part(geo.sphere, black, { pos: [0.02, hy + 0.01, hr * 0.86 + 0.005], scale: [0.004, 0.01, 0.003] }),
    );
  },
};

/** 인형 데이터(data/dolls.js 항목)로 Three.js 그룹을 만든다. */
export function createDollMesh(doll) {
  const group = new THREE.Group();
  group.name = `Doll:${doll.id}`;
  group.userData.dollId = doll.id;
  builders[doll.type](group, doll, createMaterials(doll));
  return group;
}
