import * as THREE from 'three';
import { BASE, Z, buildSkirt, faceFrom, hulaMesh, limb, mergeAll, placed, skirtFrom, skirtHips, standardBody, standardHead, STD_SKIRT } from './hulaBase.js';

/**
 * 인어섬 우사기 (#59): 긴 귀, 노란 꽃 화관, 풀 치마를 입고 횃불을 든 아이보리색 토끼.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 머리·몸 비율은 호빵 시리즈와 같은 표준 체형(hulaBase.standardHead/standardBody)을 쓴다 (#80).
 * 얼굴·횃불은 참고 사진 앞모습(얼굴 가운데 462px, 머리 반폭 285px, 눈 ±90.6px·456px, 발바닥 965px)에서 잰 픽셀 좌표를 옮겼다.
 * 얼굴은 faceFrom으로 표준 얼굴에 옮겨, 표정은 사진 그대로이고 얼굴 비율은 호빵 시리즈와 같다.
 * 얼굴은 앞쪽에만 있고, 뒷면은 아이보리색이다.
 *
 * 같은 재질의 부품은 처음 한 번만 합쳐 모든 인형이 공유한다. 몸 색(fur)만 인형마다 다르다.
 */

const PHOTO = { cx: 462, halfWidth: 285, bottom: 700, top: 250 };
const K = 0.061 / PHOTO.halfWidth; // 1px → m
const Y0 = -0.065 + 965 * K; // 사진 y 0px의 높이 (발바닥 965px이 몸통 구 아래 끝 -0.065에 오도록)
const X = (x) => (x - PHOTO.cx) * K; // 사진 x(px) → m
const Y = (y) => Y0 - y * K; // 사진 y(px) → m
const { head: HEAD, top: HEAD_TOP } = standardHead();
const BODY_DEPTH = 0.75; // 몸통·치마 앞뒤 두께 / 좌우 폭 (호빵 시리즈와 같다)

const mat = (color, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const MAT = {
  ink: mat(0x1c1a1a, 0.6), // 수놓은 검은 선
  white: mat(0xffffff, 0.3),
  blush: mat(0xe7b0bd),
  tongue: mat(0xf1c0cd),
  earPink: mat(0xeaafc5, 1), // 귀 안쪽 보송한 분홍
  skirt: mat(0xbde3a1, 1), // 털실
  skirtDeep: mat(0xa6d28b, 1),
  petal: mat(0xf3eeb4, 0.8), // 연노랑 꽃
  pearl: mat(0xeee3cc, 0.25, 0.1),
  stick: mat(0xf0f0f4, 0.5), // 횃불 막대
  flame: mat(0xe0a271, 0.95), // 주황 불꽃 (보송한 천)
  flameCore: mat(0xf3ead2, 0.9), // 불꽃 안쪽 흰 불씨
};

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

// 귀: 머리 위로 곧게 선 통통하고 긴 귀 두 개 (서로 맞닿음). 머리 위로 약 4.9cm 솟고, 밑동은 정수리 아래 1cm까지 묻힌다. 옆모습 두께는 폭의 1.15배.
const EAR = { x: 0.0124, r: 0.0124, top: HEAD_TOP + 0.049, base: HEAD_TOP - 0.0107, depth: 1.15 };

function buildBody() {
  const parts = [
    HEAD.geometry(),
    skirtHips(BODY_DEPTH, SKIRT), // 치마 속 몸 아랫부분 (치마 속이 비어 보이지 않게)
    // 몸통·다리: 호빵 시리즈와 같은 둥근 몸. 허리 위로 몸 윗부분이 보이고 그 아래가 치마다.
    ...standardBody(BODY_DEPTH),
    // 팔: 몸통 맨 위(머리 바로 아래, 목 가까이) 어깨에서 나온다
    // 오른팔(+x): 옆·아래로 뻗은 짧은 팔
    limb([0.022, -0.005, 0.006], [0.05, -0.019, 0.011], 0.0068, 0.0074),
    // 왼팔(-x): 옆으로 들어 횃불을 쥔 팔 (손이 횃불 막대를 쥔다)
    limb([-0.022, -0.005, 0.006], [-0.0565, -0.003, 0.0135], 0.0068, 0.0074),
  ];
  // 귀 (캡슐을 머리 속까지 내려 밑동을 묻는다)
  const len = EAR.top - EAR.base - 2 * EAR.r;
  const ear = new THREE.CapsuleGeometry(EAR.r, len, 8, 20);
  for (const sx of [-1, 1]) {
    parts.push(placed(ear, { pos: [sx * EAR.x, (EAR.top + EAR.base) / 2, -0.002], scale: [1, 1, EAR.depth] }));
  }
  ear.dispose();
  return mergeAll(parts);
}

/**
 * 귀 안쪽 분홍: 귀 바깥 앞쪽(정면에서 바깥으로 26°)을 귀 끝 바로 아래부터 밑동(화관 뒤)까지
 * 길게 덮는 띠. 귀 표면을 따라 휘어지고 위 끝은 둥글다. 띠 폭은 귀 폭의 절반 남짓(약 60px).
 */
function buildEarPink() {
  const parts = [];
  const NU = 10; // 띠 폭 방향 칸 수
  const NV = 28; // 띠 길이 방향 칸 수
  const LIFT = 1.04; // 귀 표면에서 살짝 띄운다 (반지름 배율)
  const top = EAR.top - 0.0077;
  const bottom = EAR.top - 0.0531;
  const capStart = EAR.top - EAR.r; // 이보다 위는 귀 끝의 반구
  const roundFrom = top - 0.012; // 띠 위 끝을 둥글게 좁히기 시작하는 높이
  for (const sx of [-1, 1]) {
    const theta = sx * 0.45; // 띠 가운데 방향
    const HALF = 0.62; // 띠 반폭 (rad)
    const ex = sx * EAR.x;
    const positions = [];
    const uvs = [];
    for (let j = 0; j <= NV; j++) {
      const y = bottom + ((top - bottom) * j) / NV;
      const shrink = y > capStart ? Math.sqrt(Math.max(0, 1 - ((y - capStart) / EAR.r) ** 2)) : 1;
      const half = y > roundFrom ? HALF * Math.sqrt(Math.max(0, 1 - ((y - roundFrom) / (top - roundFrom)) ** 2)) : HALF;
      for (let i = 0; i <= NU; i++) {
        const phi = theta + half * ((2 * i) / NU - 1);
        positions.push(
          ex + Math.sin(phi) * EAR.r * shrink * LIFT,
          y,
          -0.002 + Math.cos(phi) * EAR.r * EAR.depth * shrink * LIFT,
        );
        uvs.push(i / NU, j / NV);
      }
    }
    const index = [];
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const p = j * (NU + 1) + i;
        const q = p + NU + 1;
        // 바깥(귀 표면 밖)을 앞면으로
        index.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeAll(parts);
}

// 풀 치마: 몸 가운데 허리에서 다리 위까지 (인어섬 시리즈 표준 치수). 굵게 꼰 털실.
const SKIRT = skirtFrom({ ...STD_SKIRT, count: 24, width: 0.0047 });

/**
 * 노란 꽃 화관: 앞쪽 정수리에만 얹은 꽃 5송이 (뒤에서는 양옆 끝만 살짝 보인다).
 * 꽃 지름 약 90px, 꽃잎 5장 + 가운데 진주.
 */
function buildCrown() {
  const petals = [];
  const pearls = [];
  const ringY = HEAD.at(0.88);
  // 앞쪽 정수리에만 5송이 (가운데에서 0, ±63, ±128px. 화관 폭은 머리 폭의 60%)
  const ANGLES = [-0.85, -0.37, 0, 0.37, 0.85];
  ANGLES.forEach((a, i) => {
    const { point, normal: surface } = HEAD.ringPoint(ringY, a, 0.004);
    // 정수리 쪽이라 법선이 거의 위를 향한다. 앞·바깥으로 기울여 앞에서 꽃 모양이 보이게 한다
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const normal = surface.clone().add(out.multiplyScalar(0.7)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Z, normal);
    const twist = new THREE.Quaternion().setFromAxisAngle(Z, i * 0.9);
    for (let k = 0; k < 5; k++) {
      const s = (k / 5) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(s) * 0.0056, Math.sin(s) * 0.0056, 0).applyQuaternion(twist).applyQuaternion(q);
      petals.push(placed(BASE.small, { pos: point.clone().add(offset).toArray(), quat: q, scale: [0.0062, 0.0062, 0.0018] }));
    }
    pearls.push(placed(BASE.small, { pos: point.clone().addScaledVector(normal, 0.0022).toArray(), scale: [0.0024, 0.0024, 0.0024] }));
  });
  return { petals: mergeAll(petals), pearls: mergeAll(pearls) };
}

// 횃불: 왼손에 쥔 흰 막대(아래 끝 225px·730px → 위 끝 120px·520px, 작은 몸에 맞춰 1.2cm 안쪽으로) 위에 주황 불꽃과 흰 불씨
const TORCH = {
  bottom: new THREE.Vector3(X(225) + 0.012, Y(730), 0.014),
  top: new THREE.Vector3(X(120) + 0.012, Y(520), 0.014),
  stickRadius: 0.003,
};
// 불꽃 꽃잎 단면 (r: 최대 폭 대비, y: 길이 대비). 아래는 둥글고 끝이 뾰족한 물방울 모양
const TEARDROP = [[0, 0], [0.55, 0.06], [0.9, 0.2], [1, 0.35], [0.85, 0.55], [0.55, 0.75], [0.25, 0.92], [0.0001, 1]];

function buildTorch() {
  const axis = TORCH.top.clone().sub(TORCH.bottom);
  const length = axis.length();
  axis.normalize();
  const toAxis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  // 막대: 양 끝이 둥근 흰 막대
  const stick = new THREE.CapsuleGeometry(TORCH.stickRadius, length, 4, 12);
  stick.applyQuaternion(toAxis);
  stick.translate(...TORCH.bottom.clone().add(TORCH.top).multiplyScalar(0.5).toArray());

  // 불꽃 (사진 폭 145px, 높이 230px. 화면에서 작아 보여 조금 키웠다): 아래가 둥글고 통통한 불꽃 몸통 위로
  // 끝이 뾰족한 불길 5갈래가 바깥으로 살짝 벌어지며 솟고, 앞쪽 가운데에 흰 불씨가 있다
  const drop = new THREE.LatheGeometry(TEARDROP.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const flame = [];
  const local = []; // 축이 +Y인 불꽃 좌표계에서 만든 뒤 한꺼번에 옮긴다
  local.push(placed(drop, { pos: [0, -0.004, 0], scale: [0.018, 0.044, 0.011] }));
  const TIPS = [[-0.012, 0.024], [-0.006, 0.029], [0, 0.033], [0.006, 0.028], [0.012, 0.023]]; // [x, 길이]
  for (const [x, L] of TIPS) {
    local.push(placed(drop, { pos: [x, 0.014, 0], rot: [0, 0, -x * 20], scale: [0.0068, L, 0.0072] }));
  }
  const core = placed(drop, { pos: [0, 0.001, 0.0092], rot: [0.1, 0, 0], scale: [0.0078, 0.03, 0.003] });
  const place = new THREE.Matrix4().compose(TORCH.top.clone().addScaledVector(axis, 0.002), toAxis, new THREE.Vector3(1, 1, 1));
  for (const g of local) flame.push(g.applyMatrix4(place));
  core.applyMatrix4(place);
  drop.dispose();
  return { stick, flame: mergeAll(flame), core };
}

// 얼굴 좌표: 사진 앞모습에서 픽셀로 잰 값을 그대로 옮긴다 (가로·세로 같은 비율)
function buildFace() {
  // 사진 좌표(얼굴 가운데 462px 기준 가로 px, 높이 px)를 표준 얼굴로 옮긴다
  const { px, py, pt } = faceFrom({ dx: 90.6, y: 456 });
  const ink = [];
  const white = [];
  const blush = [];
  const tongue = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    // 눈 (가운데 ±90.6px, y 456): 검은 타원(36×31px)
    //   → 위쪽 흰 타원(18×12.25px, y 448.75)
    //   → 아래 흰 초승달(폭 28px, 가운데 두께 약 7px): 흰 타원(14×5px, y 469.5) 위에 검은 타원(14.5×3px, y 464)을 겹쳐 아랫부분만 남긴다
    const x = px(m(90.6));
    ink.push(HEAD.faceDisc(x, py(456), px(36), px(31), 0.0004));
    white.push(HEAD.faceDisc(x, py(448.75), px(18), px(12.25), 0.001));
    white.push(HEAD.faceDisc(x, py(469.5), px(14), px(5), 0.001));
    ink.push(HEAD.faceDisc(x, py(464), px(14.5), px(3), 0.0013));
    // 눈썹: 눈 바깥 아래(±185px, 427px)에서 위로 크게 휘어 안쪽(±70px, 313px)에서 끝나는 긴 호
    ink.push(HEAD.faceLine([[185, 427.5], [181, 390], [161, 355], [131.5, 330], [101, 317.5], [70, 313.5]].map(([dx, y]) => pt(m(dx), y)), px(4)));
    // 볼터치 (가운데 ±166.7px, y 512.5): 분홍 타원(52.5×40px) + "/" 빗금 4줄 (두 볼 모두 같은 방향)
    const cx = m(166.7);
    const [bx, by] = pt(cx, 512.5);
    blush.push(HEAD.faceDisc(bx, by, px(52.5), px(40), 0.0004));
    for (const dx of [-30, -10, 10, 30]) {
      ink.push(HEAD.faceLine([pt(cx + dx - 6, 525), pt(cx + dx + 6, 497.5)], px(4), 0.0019)); // 볼 원판 위로 올라오게
    }
  }
  // 입 (가운데): 양 끝이 말려 올라간 ω 윗선 → 그 아래 U자로 벌린 입(검정, 폭 50px, 512~582px) 안에 분홍 혀 → 아래 작은 미소 선
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y));
  const LINE = px(4);
  ink.push(HEAD.faceLine(mouth([[-39, 507.5], [-34, 515], [-27, 520], [-17, 518], [-8, 510], [0, 495], [8, 510], [17, 518], [27, 520], [34, 515], [39, 507.5]]), LINE));
  // U 윤곽: 오른쪽 위에서 아래로 내려가 왼쪽 위로, 윗변은 ω 아래쪽을 따라간다
  const uShape = (half, top, bottom, peak) => {
    const side = [[1, 0], [1.03, 0.3], [0.95, 0.55], [0.78, 0.76], [0.45, 0.93], [0, 1]].map(([w, f]) => [half * w, top + (bottom - top) * f]);
    const right = side.slice(0, -1);
    const left = right.map(([dx, y]) => [-dx, y]).reverse();
    return mouth([...right, side.at(-1), ...left, [-half * 0.5, top - 1], [0, peak], [half * 0.5, top - 1]]);
  };
  ink.push(HEAD.faceShape(uShape(25, 514, 582.5, 500), 0.0004));
  tongue.push(HEAD.faceShape(uShape(11, 525, 570, 522), 0.001));
  ink.push(HEAD.faceLine(mouth([[-14.25, 597.5], [0, 608.5], [14.25, 597.5]]), px(3.5)));
  return { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush), tongue: mergeAll(tongue) };
}

let shared = null;
function sharedGeometry() {
  if (!shared) {
    shared = {
      body: buildBody(),
      earPink: buildEarPink(),
      skirt: buildSkirt({ depth: BODY_DEPTH }, SKIRT),
      crown: buildCrown(),
      torch: buildTorch(),
      face: buildFace(),
    };
  }
  return shared;
}

/**
 * @param {THREE.Group} group 인형 그룹
 * @param {object} doll 인형 데이터
 * @param {{ fur: THREE.Material }} materials fur = 몸 색 (인형마다 만든 머티리얼)
 */
export function buildHulaBunny(group, doll, { fur }) {
  const g = sharedGeometry();
  group.add(
    hulaMesh(g.body, fur),
    hulaMesh(g.earPink, MAT.earPink, false),
    hulaMesh(g.skirt.front, MAT.skirt),
    hulaMesh(g.skirt.back, MAT.skirtDeep, false),
    hulaMesh(g.crown.petals, MAT.petal),
    hulaMesh(g.crown.pearls, MAT.pearl, false),
    hulaMesh(g.torch.stick, MAT.stick),
    hulaMesh(g.torch.flame, MAT.flame),
    hulaMesh(g.torch.core, MAT.flameCore, false),
    hulaMesh(g.face.ink, MAT.ink, false),
    hulaMesh(g.face.white, MAT.white, false),
    hulaMesh(g.face.blush, MAT.blush, false),
    hulaMesh(g.face.tongue, MAT.tongue, false),
  );
}
