import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 훌라 햄스터 (#49): 꽃 화관 + 풀 치마를 입은 흰 햄스터.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 치수는 참고 이미지 앞모습에서 잰 비율(머리 폭 504px = 0.158m)로 맞췄다.
 * 얼굴은 앞쪽에만 있고 뒷면은 흰색이다. 키링(볼체인·잎사귀)은 넣지 않는다.
 *
 * 모양이 고정이라, 같은 재질의 부품은 처음 한 번만 지오메트리를 합쳐 두고 모든 인형이 공유한다.
 * 그래서 인형 하나는 재질 수만큼(9개)의 메시만 만든다. 몸 색(fur)만 인형마다 다르다.
 */

// 머리 치수: 참고 이미지 앞모습(머리 폭 504px, 높이 340px)에서 잰 비율. 단위 m.
const HEAD = { bottom: 0.0037, height: 0.1066, halfWidth: 0.079 };
// 머리 앞모습 실루엣 [t: 머리 아래(목)에서 위로 0~1, w: 최대 반폭 대비]. 위는 둥근 돔, 아래쪽 1/3 높이에서 가장 넓다.
const SILHOUETTE = [
  [0, 0.7], [0.03, 0.82], [0.09, 0.92], [0.2, 0.975], [0.32, 1], [0.45, 0.985], [0.6, 0.945], [0.74, 0.875],
  [0.82, 0.81], [0.91, 0.68], [0.96, 0.52], [0.99, 0.3], [1, 0],
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
  return placed(BASE.small, { pos: point.toArray(), scale: [rx, ry, 0.0012], quat: new THREE.Quaternion().setFromUnitVectors(Z, normal) });
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
  ink: new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.4 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xeeb0bb, roughness: 0.9 }),
  hatch: new THREE.MeshStandardMaterial({ color: 0x7a5560, roughness: 0.6 }),
  skirt: new THREE.MeshStandardMaterial({ color: 0xc2dba9, roughness: 0.95 }),
  skirtDeep: new THREE.MeshStandardMaterial({ color: 0xa9c58f, roughness: 0.95 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xf3e0ee, roughness: 0.6 }),
  pearl: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.25, metalness: 0.05 }),
};

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

function buildBody() {
  const head = new THREE.LatheGeometry(HEAD_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  head.scale(1, 1, HEAD_DEPTH);
  const parts = [
    head,
    // 몸통: 머리 아래(목)에서 치마 허리까지 보이는 흰 원통 (머리 반폭의 0.7)
    placed(new THREE.CylinderGeometry(0.0553, 0.057, 0.045, 40), { pos: [0, -0.016, 0], scale: [1, 1, HEAD_DEPTH] }),
  ];
  for (const sx of [-1, 1]) {
    parts.push(
      // 귀: 머리 꼭대기 양쪽(반폭의 절반 위치)에서 반쯤 튀어나온 공
      placed(BASE.sphere, { pos: [sx * wx(0.5), at(1.06), -0.004], scale: [0.0102, 0.0102, 0.0095] }),
      // 팔: 몸통 위쪽에서 옆(살짝 뒤)으로 짧게 뻗은 둥근 팔
      placed(BASE.sphere, { pos: [sx * 0.068, -0.003, -0.004], scale: [0.017, 0.0115, 0.0125], rot: [0, sx * 0.35, sx * -0.2] }),
    );
  }
  return mergeAll(parts);
}

function buildSkirt() {
  const front = [];
  const back = [];
  // 허리끈: 굵게 꼰 끈 (세 줄)
  for (const [dy, t] of [[0.0035, 0.0045], [-0.0015, 0.005], [-0.0062, 0.0042]]) {
    front.push(placed(new THREE.TorusGeometry(1, 0.1, 8, 56), { pos: [0, -0.0235 + dy, 0], rot: [Math.PI / 2, 0, 0], scale: [0.0605, 0.0605 * HEAD_DEPTH, t / 0.1] }));
  }
  // 가닥: 빈틈없이 촘촘하게, 아래로 갈수록 퍼진다. 가닥마다 두 줄을 꼬아 결을 낸다.
  const layer = (list, count, r, tilt, height, offset, width) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2;
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      for (const side of [-1, 1]) {
        const q = qy.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, side * 0.1)));
        const local = new THREE.Vector3(side * 0.0019, -0.0465, r).applyQuaternion(qy);
        local.z *= HEAD_DEPTH;
        list.push(placed(BASE.capsule, { pos: local.toArray(), quat: q, scale: [width, height / 5, 0.0028] }));
      }
    }
  };
  layer(front, 40, 0.062, 0.2, 0.047, 0, 0.0034);
  layer(back, 40, 0.058, 0.16, 0.045, 0.5, 0.0032);
  return { front: mergeAll(front), back: mergeAll(back) };
}

function buildCrown() {
  const petals = [];
  const pearls = [];
  const FLOWERS = 14;
  const ringY = at(0.9);
  for (let i = 0; i < FLOWERS; i++) {
    const a = (i / FLOWERS) * Math.PI * 2;
    const { point, normal } = headRingPoint(ringY, a, 0.0035);
    const q = new THREE.Quaternion().setFromUnitVectors(Z, normal);
    const twist = new THREE.Quaternion().setFromAxisAngle(Z, i * 0.7); // 꽃마다 꽃잎 방향을 조금씩 다르게
    for (let k = 0; k < 5; k++) {
      const t = (k / 5) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(t) * 0.0068, Math.sin(t) * 0.0068, 0).applyQuaternion(twist).applyQuaternion(q);
      petals.push(placed(BASE.small, { pos: point.clone().add(offset).toArray(), quat: q, scale: [0.0072, 0.0072, 0.0028] }));
    }
    pearls.push(placed(BASE.small, { pos: point.clone().addScaledVector(normal, 0.0026).toArray(), scale: [0.0028, 0.0028, 0.0028] }));
  }
  return { petals: mergeAll(petals), pearls: mergeAll(pearls) };
}

function buildFace() {
  const ink = [];
  const white = [];
  const blush = [];
  const hatch = [];
  const EYE_Y = at(0.485);
  const EYE_R = wx(0.122); // 눈 지름 = 머리 폭의 약 12%
  for (const sx of [-1, 1]) {
    const ex = sx * wx(0.3);
    // 눈: 굵은 검은 테두리 → 흰자 → 위쪽으로 치우친 큰 눈동자 → 눈동자 아래쪽 흰 초승달
    ink.push(faceDisc(ex, EYE_Y, EYE_R, EYE_R, 0.0004));
    white.push(faceDisc(ex, EYE_Y, EYE_R * 0.78, EYE_R * 0.78, 0.001));
    ink.push(faceDisc(ex, EYE_Y + EYE_R * 0.12, EYE_R * 0.56, EYE_R * 0.56, 0.0016));
    const arc = [];
    for (let k = 0; k <= 6; k++) {
      const t = THREE.MathUtils.lerp(Math.PI * 1.15, Math.PI * 1.85, k / 6);
      arc.push([ex + Math.cos(t) * EYE_R * 0.36, EYE_Y + EYE_R * 0.12 + Math.sin(t) * EYE_R * 0.36]);
    }
    white.push(faceLine(arc, 0.0006, 0.0022));
    // 눈썹: 눈 위 멀찍이 떨어진 완만한 호
    const by = at(0.7);
    ink.push(faceLine([[ex - wx(0.11), by - 0.0012], [ex, by + 0.0012], [ex + wx(0.11), by - 0.0006]], 0.00075));
    // 볼터치: 분홍 타원 + 빗금 4줄
    const cx = sx * wx(0.56);
    const cy = at(0.34);
    blush.push(faceDisc(cx, cy, wx(0.15), wx(0.11), 0.0004));
    for (const dx of [-0.0057, -0.0019, 0.0019, 0.0057]) {
      hatch.push(faceLine([[cx + dx - 0.0012, cy - 0.0034], [cx + dx + 0.0012, cy + 0.0034]], 0.0006, 0.0012));
    }
  }
  // 입: ω 모양 윗선 + 그 아래 벌린 입 + 아래쪽 작은 미소 선
  const my = at(0.324);
  ink.push(faceLine([[-0.0066, my + 0.0002], [-0.0034, my - 0.0029], [0, my - 0.0006], [0.0034, my - 0.0029], [0.0066, my + 0.0002]], 0.0007));
  ink.push(faceLine([[-0.0038, my - 0.0016], [-0.0033, my - 0.0068], [0, my - 0.0092], [0.0033, my - 0.0068], [0.0038, my - 0.0016]], 0.0007));
  const sy = at(0.162);
  ink.push(faceLine([[-0.0048, sy + 0.0012], [0, sy - 0.0012], [0.0048, sy + 0.0012]], 0.0007));
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
  top: 0.124, // 귀 꼭대기
  bottom: -0.07, // 치마 끝
  headHalfWidth: 0.079,
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
