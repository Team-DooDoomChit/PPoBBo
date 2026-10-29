import * as THREE from 'three';
import { loadModel } from './ModelLoader.js';

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
  capsule: new THREE.CapsuleGeometry(1, 3, 8, 16), // 높이 5, 반지름 1
  box: new THREE.BoxGeometry(1, 1, 1),
  link: new THREE.TorusGeometry(1, 0.32, 6, 12), // 체인 고리
  ring: new THREE.TorusGeometry(1, 0.3, 8, 24),
  smile: new THREE.TorusGeometry(1, 0.22, 6, 16, Math.PI), // 반원 (입)
  strand: new THREE.CylinderGeometry(1, 1, 1, 6),
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

  /**
   * 키링 토끼: 큰 머리와 몸이 이어진 달걀형, 서로 붙은 긴 귀, 귀 끝의 볼체인,
   * 노란 니트 목도리(한쪽으로 늘어진 술 장식), 품에 안은 주먹밥.
   */
  keychainBunny(group, doll, { fur, sub }) {
    const mat = {
      scarf: new THREE.MeshStandardMaterial({ color: 0xe6bd45, roughness: 0.95 }),
      fringe: new THREE.MeshStandardMaterial({ color: 0xf2db74, roughness: 0.9 }),
      rice: new THREE.MeshStandardMaterial({ color: 0xfbf9f4, roughness: 0.75 }),
      chain: new THREE.MeshStandardMaterial({ color: 0xd8d09c, roughness: 0.35, metalness: 0.8 }),
      blush: new THREE.MeshStandardMaterial({ color: 0xf4a6b6, roughness: 0.9 }),
      shine: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
      ink: new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.4 }),
    };
    const headY = 0.07;

    // 머리 + 몸 (하나로 이어진 달걀형)
    group.add(
      part(geo.sphere, fur, { pos: [0, headY, 0], scale: [0.062, 0.058, 0.056] }),
      part(geo.sphere, fur, { pos: [0, -0.008, 0.002], scale: [0.05, 0.05, 0.046] }),
    );

    // 귀: 위로 곧게 서서 서로 붙어 있고, 앞쪽 안은 분홍
    const earY = headY + 0.084; // 아래쪽이 머리에 묻히도록
    for (const sx of [-1, 1]) {
      const tilt = [0, 0, -sx * 0.04];
      group.add(
        part(geo.capsule, fur, { pos: [sx * 0.0165, earY, -0.004], scale: [0.0165, 0.016, 0.014], rot: tilt }),
        part(geo.capsule, sub, { pos: [sx * 0.0165, earY - 0.004, 0.0085], scale: [0.0095, 0.012, 0.006], rot: tilt }),
      );
    }

    // 볼체인: 귀 끝 두 곳에서 위쪽 고리로
    const tipY = earY + 0.04;
    const topY = tipY + 0.05;
    const LINKS = 9;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < LINKS; i++) {
        const t = (i + 0.5) / LINKS;
        const x = sx * THREE.MathUtils.lerp(0.0165, 0.011, t);
        group.add(
          part(geo.link, mat.chain, {
            pos: [x, THREE.MathUtils.lerp(tipY, topY, t), -0.004],
            scale: s(0.0028),
            rot: [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2],
          }),
        );
      }
    }
    // 체인 위쪽 막대형 고리
    group.add(part(geo.capsule, mat.chain, { pos: [0, topY + 0.003, -0.004], scale: [0.0032, 0.0055, 0.0032], rot: [0, 0, Math.PI / 2] }));

    // 목도리: 머리와 몸 사이를 감싸는 니트 + 결
    const neckY = 0.02;
    // (토러스를 눕히면 로컬 z 스케일이 밴드 높이가 된다)
    group.add(part(geo.ring, mat.scarf, { pos: [0, neckY, 0.002], scale: [0.045, 0.045, 0.065], rot: [Math.PI / 2, 0, 0] }));
    // 니트 결: 밴드 표면에서 살짝만 튀어나온 가는 줄
    for (const dy of [-0.012, -0.004, 0.004, 0.012]) {
      group.add(part(geo.ring, mat.scarf, { pos: [0, neckY + dy, 0.002], scale: [0.0452, 0.0452, 0.007], rot: [Math.PI / 2, 0, 0] }));
    }
    // 앞쪽(보는 사람 기준 왼쪽)으로 늘어진 끝자락 + 술
    const tail = new THREE.Group();
    tail.position.set(-0.034, neckY - 0.004, 0.036);
    tail.rotation.set(0.15, -0.5, 0.45);
    tail.add(part(geo.box, mat.scarf, { pos: [0, -0.026, 0], scale: [0.024, 0.052, 0.009] }));
    for (let i = 0; i < 7; i++) {
      const x = -0.0105 + i * 0.0035;
      tail.add(part(geo.strand, mat.fringe, { pos: [x, -0.061, 0], scale: [0.0015, 0.02, 0.0015], rot: [0, 0, (i - 3) * 0.06] }));
    }
    group.add(tail);

    // 팔, 발
    for (const sx of [-1, 1]) {
      group.add(
        part(geo.sphere, fur, { pos: [sx * 0.046, 0.002, 0.026], scale: [0.016, 0.013, 0.016] }),
        part(geo.sphere, fur, { pos: [sx * 0.022, -0.056, 0.012], scale: [0.018, 0.014, 0.02] }),
      );
    }

    // 주먹밥 (아래가 넓은 둥근 삼각형)
    const rice = new THREE.Group();
    rice.position.set(0, 0.01, 0.062); // 목도리 앞으로 안고 있음
    rice.rotation.x = -0.2;
    rice.add(
      part(geo.sphere, mat.rice, { pos: [0, 0, 0], scale: [0.032, 0.026, 0.018] }),
      part(geo.sphere, mat.rice, { pos: [0, 0.017, -0.001], scale: [0.02, 0.02, 0.015] }),
    );
    group.add(rice);

    // 얼굴 (오리지널): 동그란 눈 + 하이라이트, 둥근 볼터치, 작은 미소
    for (const sx of [-1, 1]) {
      group.add(
        part(geo.sphere, mat.ink, { pos: [sx * 0.021, headY + 0.008, 0.051], scale: [0.0085, 0.011, 0.004] }),
        part(geo.sphere, mat.shine, { pos: [sx * 0.019 - 0.002, headY + 0.012, 0.0545], scale: s(0.0028) }),
        part(geo.sphere, mat.blush, { pos: [sx * 0.037, headY - 0.006, 0.044], scale: [0.011, 0.007, 0.003], rot: [0, sx * 0.6, 0] }),
      );
    }
    group.add(part(geo.smile, mat.ink, { pos: [0, headY - 0.002, 0.055], scale: s(0.006), rot: [0, 0, Math.PI] }));
  },
};

const MODEL_HEIGHT = 0.21; // .glb 인형을 맞출 높이 (절차적 인형과 비슷하게)

/**
 * .glb 모델을 인형 좌표계에 맞춘다: 높이 MODEL_HEIGHT, 좌우·앞뒤 가운데, 바닥은 몸통 아래.
 * 물리 충돌체(DOLL_SHAPE)는 그대로라 비슷한 크기·비율의 모델이 자연스럽다.
 */
function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = MODEL_HEIGHT / Math.max(size.y, 1e-6);
  model.scale.multiplyScalar(scale);
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  model.position.set(-center.x, -DOLL_SHAPE.bodyRadius - box.min.y * scale, -center.z);
}

/**
 * 인형 데이터(data/dolls.js 항목)로 Three.js 그룹을 만든다.
 * doll.modelUrl이 있으면 절차적 모델을 먼저 보여 주고, .glb가 로드되면 교체한다 (실패 시 그대로 유지).
 */
export function createDollMesh(doll) {
  const group = new THREE.Group();
  group.name = `Doll:${doll.id}`;
  group.userData.dollId = doll.id;
  builders[doll.type](group, doll, createMaterials(doll));

  if (doll.modelUrl) {
    loadModel(doll.modelUrl).then((model) => {
      if (!model) return;
      fitModel(model);
      disposeDollMesh(group);
      group.clear();
      group.add(model);
    });
  }
  return group;
}

/** createDollMesh로 만든 인형의 머티리얼 해제 (지오메트리와 눈 머티리얼은 공유라 제외) */
export function disposeDollMesh(group) {
  group.traverse((obj) => {
    if (obj.isMesh && obj.material !== black) obj.material.dispose();
  });
}
