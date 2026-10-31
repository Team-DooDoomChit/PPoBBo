import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 훌라 햄스터 (#49): 꽃 화관 + 풀 치마를 입은 흰 햄스터.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 치수는 봉제 인형 사진 앞모습에서 잰 비율(머리 폭 455px = 0.148m)로 맞췄다.
 * 얼굴은 앞쪽에만 있고 뒷면은 흰색이다. 키링(볼체인·잎사귀)은 넣지 않는다.
 *
 * 모양이 고정이라, 같은 재질의 부품은 처음 한 번만 지오메트리를 합쳐 두고 모든 인형이 공유한다.
 * 그래서 인형 하나는 재질 수만큼(9개)의 메시만 만든다. 몸 색(fur)만 인형마다 다르다.
 */

// 머리 치수: 봉제 인형 사진(머리 폭 455px, 목~꼭대기 340px)에서 잰 비율. 단위 m.
const HEAD = { bottom: -0.004, height: 0.11, halfWidth: 0.074 }; // 폭 대비 키 1 : 0.74
// 머리 앞모습 실루엣 [t: 머리 아래(목)에서 위로 0~1, w: 최대 반폭 대비]. 공처럼 둥글고 볼 높이에서 가장 넓다.
const SILHOUETTE = [
  [0, 0.74], [0.04, 0.86], [0.1, 0.93], [0.2, 0.98], [0.3, 1], [0.4, 0.995], [0.5, 0.97], [0.6, 0.92],
  [0.7, 0.85], [0.8, 0.74], [0.88, 0.6], [0.94, 0.42], [0.98, 0.22], [1, 0],
];
const HEAD_PROFILE = [
  [0, HEAD.bottom - 0.003], // 아래 가운데를 닫는다 (몸통에 가려 보이지 않음)
  ...SILHOUETTE.map(([t, w]) => [w * HEAD.halfWidth, HEAD.bottom + t * HEAD.height]),
];
const HEAD_DEPTH = 0.75; // 앞뒤 두께 / 좌우 폭 (옆모습에서 잰 비율)
const at = (t) => HEAD.bottom + t * HEAD.height; // 머리 높이 비율 → y
const wx = (w) => w * HEAD.halfWidth; // 반폭 비율 → x

/** 머리 높이 y에서의 좌우 반지름 (실루엣 보간) */
function headRadius(y) {
  const p = HEAD_PROFILE;
  // 아래 닫는 점(반지름 0)을 뺀 옆면 구간에서 보간한다
  if (y <= p[1][1]) return p[1][0];
  for (let i = 1; i < p.length - 1; i++) {
    const [r0, y0] = p[i];
    const [r1, y1] = p[i + 1];
    if (y <= y1) return Math.max(1e-4, THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0)));
  }
  return 1e-4;
}

/** 머리 앞면 (x, y) → 표면 위 점(lift만큼 띄움)과 바깥 법선 */
function headPoint(x, y, lift = 0.0008) {
  const R = headRadius(y);
  const zAt = (px, py) => {
    const r = headRadius(py);
    return HEAD_DEPTH * r * Math.sqrt(Math.max(0, 1 - (px / r) ** 2));
  };
  const z = HEAD_DEPTH * R * Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
  const h = 0.0005;
  const dzdx = (zAt(x + h, y) - zAt(x - h, y)) / (2 * h);
  const dzdy = (zAt(x, y + h) - zAt(x, y - h)) / (2 * h);
  const normal = new THREE.Vector3(-dzdx, -dzdy, 1).normalize();
  return { point: new THREE.Vector3(x, y, z).addScaledVector(normal, lift), normal };
}

/** 머리 둘레(높이 y, 각도 a: 0 = 정면)의 점과 바깥 법선 */
function headRingPoint(y, a, lift) {
  const R = headRadius(y);
  const dR = (headRadius(y + 0.0005) - headRadius(y - 0.0005)) / 0.001;
  const x = R * Math.sin(a);
  const z = HEAD_DEPTH * R * Math.cos(a);
  const normal = new THREE.Vector3(x / R ** 2, -dR / R, z / (HEAD_DEPTH * R) ** 2).normalize();
  return { point: new THREE.Vector3(x, y, z).addScaledVector(normal, lift), normal };
}

const Z = new THREE.Vector3(0, 0, 1);

/** 원본 지오메트리를 복제해 크기·회전·위치를 적용 */
function placed(geometry, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], quat } = {}) {
  const q = quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  return geometry.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale)));
}

/** 머리 표면에 붙인 납작한 원판 (눈·볼) */
function faceDisc(x, y, rx, ry, lift) {
  const { point, normal } = headPoint(x, y, lift);
  return placed(BASE.sphere, { pos: point.toArray(), scale: [rx, ry, 0.0012], quat: new THREE.Quaternion().setFromUnitVectors(Z, normal) });
}

/** 머리 표면을 따라가는 가는 선 (눈썹·입) */
function faceLine(points, radius = 0.0008, lift = 0.0016) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => headPoint(x, y, lift).point));
  return new THREE.TubeGeometry(curve, Math.max(6, points.length * 4), radius, 5, false);
}

const BASE = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  small: new THREE.SphereGeometry(1, 10, 6), // 꽃잎·진주·얼굴 원판처럼 작은 부품용 (정점 수를 줄인다)
  capsule: new THREE.CapsuleGeometry(1, 3, 2, 6), // 높이 5, 반지름 1
};

const MAT = {
  ink: new THREE.MeshStandardMaterial({ color: 0x3a2823, roughness: 0.7 }), // 수놓은 진한 갈색
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xf0a9b4, roughness: 0.9 }),
  hatch: new THREE.MeshStandardMaterial({ color: 0x3a2823, roughness: 0.7 }),
  skirt: new THREE.MeshStandardMaterial({ color: 0xbde3a1, roughness: 1 }), // 털실
  skirtDeep: new THREE.MeshStandardMaterial({ color: 0xa6d28b, roughness: 1 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xf8d6de, roughness: 0.8 }),
  pearl: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.25, metalness: 0.05 }),
};

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

function buildBody() {
  const head = new THREE.LatheGeometry(HEAD_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  head.scale(1, 1, HEAD_DEPTH);
  const parts = [
    head,
    // 몸통: 머리와 치마 사이로 조금만 보이는 흰 원통 (머리 반폭의 0.74)
    placed(new THREE.CylinderGeometry(0.054, 0.056, 0.03, 40), { pos: [0, -0.015, 0], scale: [1, 1, HEAD_DEPTH] }),
  ];
  for (const sx of [-1, 1]) {
    parts.push(
      // 귀: 머리 꼭대기 양쪽, 화관 뒤로 반쯤 가려지는 작은 공
      placed(BASE.sphere, { pos: [sx * wx(0.5), at(0.97), -0.008], scale: [0.0088, 0.0088, 0.0082] }),
      // 팔: 머리 아래(몸통 위쪽) 옆으로 짧게 뻗은 둥근 팔
      placed(BASE.sphere, { pos: [sx * 0.064, -0.009, 0.004], scale: [0.016, 0.0105, 0.0115], rot: [0, sx * 0.3, sx * -0.3] }),
      // 발: 치마 아래로 살짝 보이는 작은 발
      placed(BASE.sphere, { pos: [sx * 0.015, -0.072, 0.014], scale: [0.013, 0.008, 0.015] }),
    );
  }
  return mergeAll(parts);
}

function buildSkirt() {
  const front = [];
  const back = [];
  // 허리: 털실을 모아 묶은 도톰한 띠 하나
  front.push(placed(new THREE.TorusGeometry(1, 0.1, 8, 64), { pos: [0, -0.021, 0], rot: [Math.PI / 2, 0, 0], scale: [0.061, 0.061 * HEAD_DEPTH, 0.05] }));
  // 가닥: 굵은 털실이 느슨하게 늘어지고 아래로 조금 퍼진다. 가닥마다 두 줄을 꼬아 털실 결을 낸다.
  const layer = (list, count, r, tilt, height, offset, width) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2;
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      for (const side of [-1, 1]) {
        const q = qy.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, side * 0.14)));
        const local = new THREE.Vector3(side * 0.0022, -0.0455, r).applyQuaternion(qy);
        local.z *= HEAD_DEPTH;
        list.push(placed(BASE.capsule, { pos: local.toArray(), quat: q, scale: [width, height / 5, 0.0034] }));
      }
    }
  };
  layer(front, 42, 0.063, 0.12, 0.05, 0, 0.0043);
  layer(back, 42, 0.059, 0.09, 0.048, 0.5, 0.0041);
  return { front: mergeAll(front), back: mergeAll(back) };
}

function buildCrown() {
  const petals = [];
  const pearls = [];
  const FLOWERS = 12;
  const ringY = at(0.84); // 사진처럼 눈썹 위 이마 쪽
  for (let i = 0; i < FLOWERS; i++) {
    const a = (i / FLOWERS) * Math.PI * 2;
    const { point, normal: surface } = headRingPoint(ringY, a, 0.0035);
    // 머리 표면 법선은 거의 위를 향해 꽃이 누워 보이므로, 바깥쪽으로 기울여 앞에서 꽃 모양이 보이게 한다
    const outward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const normal = surface.clone().add(outward.multiplyScalar(0.45)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Z, normal);
    const twist = new THREE.Quaternion().setFromAxisAngle(Z, i * 0.7); // 꽃마다 꽃잎 방향을 조금씩 다르게
    for (let k = 0; k < 5; k++) {
      const t = (k / 5) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(t) * 0.0071, Math.sin(t) * 0.0071, 0).applyQuaternion(twist).applyQuaternion(q);
      petals.push(placed(BASE.small, { pos: point.clone().add(offset).toArray(), quat: q, scale: [0.0079, 0.0079, 0.0029] }));
    }
    pearls.push(placed(BASE.small, { pos: point.clone().addScaledVector(normal, 0.0026).toArray(), scale: [0.0028, 0.0028, 0.0028] }));
  }
  return { petals: mergeAll(petals), pearls: mergeAll(pearls) };
}

// 얼굴 좌표: 봉제 인형 사진 앞모습에서 픽셀로 잰 값을 그대로 옮긴다.
// 기준: 얼굴 가운데 x = 335px, 머리 반폭 221px, 머리 아래(목) y = 650px. (y는 아래가 +)
// 가로·세로 모두 같은 비율(머리 반폭 221px = HEAD.halfWidth)로 옮겨 얼굴 요소 사이 간격을 그대로 지킨다.
const FACE_PX = { cx: 335, halfWidth: 221, bottom: 650 };
const PX = HEAD.halfWidth / FACE_PX.halfWidth; // 1px → m
const px = (dx) => dx * PX; // 가로 픽셀 → m
const py = (y) => HEAD.bottom + (FACE_PX.bottom - y) * PX; // 세로 픽셀(이미지 y) → m
const pt = (dx, y) => [px(dx), py(y)];

function buildFace() {
  const ink = [];
  const white = [];
  const blush = [];
  const hatch = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    // 눈 (가운데 ±67px, y 510): 눈 전체가 진한 갈색 타원(27×25.5px)
    //   → 그 안 위쪽에 큰 흰 타원(16×12px, 5px 위)
    //   → 아래쪽 흰 초승달(폭 25px, 가운데 두께 4px): 흰 타원 위에 갈색 타원을 살짝 위로 겹쳐 아랫부분만 남긴다
    const ex = m(67);
    const ey = 510;
    const [x, y] = pt(ex, ey);
    ink.push(faceDisc(x, y, px(27), px(25.5), 0.0004));
    white.push(faceDisc(x, py(ey - 5), px(16), px(12), 0.001));
    white.push(faceDisc(x, py(ey + 15), px(12.5), px(4.6), 0.001));
    ink.push(faceDisc(x, py(ey + 11.5), px(11.5), px(4.5), 0.0013)); // 위쪽 흰 타원(아래 끝 +7px)과 겹치지 않게
    // 눈썹 (y 441): 눈 위의 완만한 호, 길이 46px
    ink.push(faceLine([[-23, 3], [0, -3], [23, 3]].map(([dx, dy]) => pt(m(67) + m(dx), 441 + dy)), px(3.4)));
    // 볼터치 (가운데 ±133px, y 547): 분홍 타원(37×27px) + "/" 빗금 4줄
    const cx = m(133);
    const [bx, by] = pt(cx, 547);
    blush.push(faceDisc(bx, by, px(37), px(27), 0.0004));
    for (const dx of [-20, -7, 7, 20]) {
      hatch.push(faceLine([pt(cx + dx - 5, 561), pt(cx + dx + 5, 533)], px(3), 0.0012));
    }
  }
  // 입 (가운데): 폭 50px의 ω 윗선 → 그 아래 둥글게 벌린 입(폭 22px) → 아래쪽 작은 미소 선
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y));
  const LINE = px(3.2);
  ink.push(faceLine(mouth([[-25, 547], [-19, 559], [-11, 563], [-4, 559], [0, 553], [4, 559], [11, 563], [19, 559], [25, 547]]), LINE));
  ink.push(faceLine(mouth([[-8, 560], [-11, 571], [-6, 581], [0, 583], [6, 581], [11, 571], [8, 560]]), LINE));
  ink.push(faceLine(mouth([[-10, 599], [0, 605], [10, 599]]), LINE));
  return { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush), hatch: mergeAll(hatch) };
}

/** 속성 구성을 맞춰 하나로 합친다 (Lathe·Tube 등 모두 index + position/normal/uv) */
function mergeAll(list) {
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}

let shared = null;
function sharedGeometry() {
  if (!shared) {
    const skirt = buildSkirt();
    const crown = buildCrown();
    shared = { body: buildBody(), skirt, crown, face: buildFace() };
  }
  return shared;
}

/** 물리 충돌체(DollBody)와 맞춘 치수 */
export const HULA_HAMSTER_SIZE = Object.freeze({
  top: 0.117, // 귀 꼭대기
  bottom: -0.08, // 발바닥
  headHalfWidth: 0.074,
});

/**
 * @param {THREE.Group} group 인형 그룹
 * @param {object} doll 인형 데이터
 * @param {{ fur: THREE.Material }} materials fur = 몸 색 (인형마다 만든 머티리얼)
 */
export function buildHulaHamster(group, doll, { fur }) {
  const g = sharedGeometry();
  const mesh = (geometry, material, shadow = true) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };
  group.add(
    mesh(g.body, fur),
    mesh(g.skirt.front, MAT.skirt),
    mesh(g.skirt.back, MAT.skirtDeep, false),
    mesh(g.crown.petals, MAT.petal),
    mesh(g.crown.pearls, MAT.pearl, false),
    mesh(g.face.ink, MAT.ink, false),
    mesh(g.face.white, MAT.white, false),
    mesh(g.face.blush, MAT.blush, false),
    mesh(g.face.hatch, MAT.hatch, false),
  );
}
