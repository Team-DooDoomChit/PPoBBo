import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 훌라 햄스터 (#49): 꽃 화관 + 풀 치마를 입은 흰 햄스터.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 모습은 참고 이미지 앞모습에서 픽셀로 잰 비율을 그대로 옮겼다. 크기는 다른 키링 인형과 비슷하게(머리 반폭 0.061m).
 * 사진 기준: 얼굴 가운데 x = 252px, 머리 반폭 236px, 목 y = 375px, 머리 꼭대기 y = 48px. (y는 아래가 +)
 * 얼굴은 앞쪽에만 있고 뒷면은 흰색이다. 키링(볼체인·잎사귀)은 넣지 않는다.
 *
 * 모양이 고정이라, 같은 재질의 부품은 처음 한 번만 지오메트리를 합쳐 두고 모든 인형이 공유한다.
 * 그래서 인형 하나는 재질 수만큼(8개)의 메시만 만든다. 몸 색(fur)만 인형마다 다르다.
 */

const PHOTO = { cx: 252, halfWidth: 236, bottom: 375, top: 48 };
const K = 0.061 / PHOTO.halfWidth; // 1px → m

// 머리 치수 (단위 m). 사진처럼 폭 대비 키 0.69의 넓적한 찹쌀떡 모양.
const HEAD = { bottom: -0.008, height: (PHOTO.bottom - PHOTO.top) * K, halfWidth: 0.061 };
// 머리 앞모습 실루엣 [t: 목(0)에서 꼭대기(1)까지, w: 최대 반폭 대비].
// 가장 넓은 볼 높이(사진 y 255px)를 가운데로 위는 둥근 돔(반타원), 아래는 볼이 통통한 초타원(지수 2.6).
// 아래는 목(t = 0, 반폭 0.78)을 지나 몸통 속에서 둥글게 닫힌다.
const WIDEST = (PHOTO.bottom - 255) / (PHOTO.bottom - PHOTO.top);
const BELOW = 0.45; // 아래 초타원 반지름 (t)
const SILHOUETTE = Array.from({ length: 41 }, (_, i) => {
  const t = WIDEST - BELOW + (i / 40) * (1 - WIDEST + BELOW);
  const r = t >= WIDEST ? 1 - WIDEST : BELOW;
  const p = t >= WIDEST ? 2 : 2.6;
  return [t, Math.max(0, 1 - Math.abs((t - WIDEST) / r) ** p) ** (1 / p)];
});
const HEAD_PROFILE = SILHOUETTE.map(([t, w]) => [w * HEAD.halfWidth, HEAD.bottom + t * HEAD.height]);
HEAD_PROFILE[0][0] = 0; // 아래 가운데를 닫는다 (몸통에 가려 보이지 않음)
HEAD_PROFILE[HEAD_PROFILE.length - 1][0] = 0; // 꼭대기를 닫는다
const HEAD_DEPTH = 0.82; // 앞뒤 두께 / 좌우 폭 (둥글게 보이도록)
const at = (t) => HEAD.bottom + t * HEAD.height; // 머리 높이 비율 → y
const tAt = (y) => (PHOTO.bottom - y) / (PHOTO.bottom - PHOTO.top); // 사진 y(px) → 머리 높이 비율

/** 머리 높이 y에서의 좌우 반지름 (실루엣 보간) */
function headRadius(y) {
  const p = HEAD_PROFILE;
  if (y <= p[0][1]) return 1e-4;
  for (let i = 0; i < p.length - 1; i++) {
    const [r0, y0] = p[i];
    const [r1, y1] = p[i + 1];
    if (y <= y1) return Math.max(1e-4, THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0)));
  }
  return 1e-4;
}

/** 머리 앞면 (x, y) → 표면 위 점(lift만큼 띄움)과 바깥 법선 */
function headPoint(x, y, lift = 0.0008) {
  const R = headRadius(y);
  const zAt = (qx, qy) => {
    const r = headRadius(qy);
    return HEAD_DEPTH * r * Math.sqrt(Math.max(0, 1 - (qx / r) ** 2));
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
  ink: new THREE.MeshStandardMaterial({ color: 0x1d1717, roughness: 0.7 }), // 수놓은 거의 검은 선
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xe6adbb, roughness: 0.9 }),
  skirt: new THREE.MeshStandardMaterial({ color: 0xbde3a1, roughness: 1 }), // 털실
  skirtDeep: new THREE.MeshStandardMaterial({ color: 0xa6d28b, roughness: 1 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xf6dfe8, roughness: 0.8 }),
  pearl: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.25, metalness: 0.05 }),
};

// 사진 픽셀 → 인형 좌표 (y는 아래가 +)
const px = (dx) => dx * K;
const py = (y) => HEAD.bottom + (PHOTO.bottom - y) * K;
const pt = (dx, y) => [px(dx), py(y)];

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

function buildBody() {
  const head = new THREE.LatheGeometry(HEAD_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  head.scale(1, 1, HEAD_DEPTH);
  const parts = [
    head,
    // 몸통: 머리 아래에서 치마 허리(반폭 0.042)까지 통통하게 이어지는 둥근 흰 몸. 머리가 몸 위로 넓게 튀어나온다.
    placed(BASE.sphere, { pos: [0, -0.03, 0], scale: [0.042, 0.03, 0.042 * HEAD_DEPTH] }),
    // 발: 치마 속, 아래로 살짝 보이는 작은 발
    placed(BASE.sphere, { pos: [-0.011, -0.0642, 0.008], scale: [0.009, 0.006, 0.01] }),
    placed(BASE.sphere, { pos: [0.011, -0.0642, 0.008], scale: [0.009, 0.006, 0.01] }), // 발바닥 -0.0702
    // 팔 (사진처럼 비대칭인 큼직한 주걱 모양): 왼쪽(-x)은 아래로 내리고(끝 60px, 465px), 오른쪽(+x)은 옆으로 들어 끝이 조금 위로(끝 515px, 390px)
    placed(BASE.sphere, { pos: [px(-172), py(425), 0.006], scale: [0.014, 0.0085, 0.009], rot: [0, 0.35, 1.0] }),
    placed(BASE.sphere, { pos: [px(208), py(396), 0.004], scale: [0.016, 0.0082, 0.009], rot: [0, -0.3, 0.2] }),
  ];
  // 귀: 머리 꼭대기 양쪽(가운데에서 ±129px), 화관 위로 또렷이 솟은 둥근 귀 (꼭대기 사진 25px)
  for (const sx of [-1, 1]) {
    parts.push(placed(BASE.sphere, { pos: [sx * px(129), py(25) - 0.0085, -0.004], scale: [0.0088, 0.0085, 0.0078] }));
  }
  return mergeAll(parts);
}

function buildSkirt() {
  const front = [];
  const back = [];
  // 허리 (사진 y 470px, 반폭 163px): 털실을 꼬아 묶은 가는 띠 하나
  const waistY = py(470);
  front.push(placed(new THREE.TorusGeometry(1, 0.1, 8, 64), { pos: [0, waistY, 0], rot: [Math.PI / 2, 0, 0], scale: [0.042, 0.042 * HEAD_DEPTH, 0.018] }));
  // 가닥: 털실이 허리(반폭 163px)에서 아래 끝(사진 y 612px, 반폭 207px)까지 넓게 퍼지며 늘어진다.
  // 가닥 사이가 조금 성기게, 가닥마다 두 줄을 꼬아 털실 결을 낸다.
  const strandY = (waistY + py(612)) / 2;
  const layer = (list, count, r, tilt, height, offset, width) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2;
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      for (const side of [-1, 1]) {
        const q = qy.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, side * 0.14)));
        const local = new THREE.Vector3(side * 0.002, strandY, r).applyQuaternion(qy);
        local.z *= HEAD_DEPTH;
        list.push(placed(BASE.capsule, { pos: local.toArray(), quat: q, scale: [width, height / 5, 0.0034] }));
      }
    }
  };
  layer(front, 30, 0.048, 0.32, 0.037, 0, 0.0034);
  layer(back, 30, 0.044, 0.26, 0.035, 0.5, 0.0034);
  return { front: mergeAll(front), back: mergeAll(back) };
}

function buildCrown() {
  const petals = [];
  const pearls = [];
  const FLOWERS = 12;
  const ringY = at(tAt(138)); // 사진처럼 눈썹 위 이마 쪽, 꽃 위로 둥근 정수리가 보이게 (위에서 찍은 사진의 앞 꽃 가운데 y 125px)
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
      const offset = new THREE.Vector3(Math.cos(t) * 0.0062, Math.sin(t) * 0.0062, 0).applyQuaternion(twist).applyQuaternion(q);
      petals.push(placed(BASE.small, { pos: point.clone().add(offset).toArray(), quat: q, scale: [0.0068, 0.0068, 0.0026] }));
    }
    pearls.push(placed(BASE.small, { pos: point.clone().addScaledVector(normal, 0.0026).toArray(), scale: [0.002, 0.002, 0.002] }));
  }
  return { petals: mergeAll(petals), pearls: mergeAll(pearls) };
}

// 얼굴 좌표: 사진 앞모습에서 픽셀로 잰 값을 그대로 옮긴다 (가로·세로 같은 비율).
function buildFace() {
  const ink = [];
  const white = [];
  const blush = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    // 눈 (가운데 ±76px, y 266): 검은 타원(31×30px)
    //   → 그 안 위쪽에 큰 흰 타원(18.3×13.7px, y 259.7)
    //   → 아래 흰 초승달(폭 28px, 가운데 두께 5px): 흰 타원(14×5px, y 283) 위에 검은 타원(14.5×3.5px, y 279.5)을 겹쳐 아랫부분만 남긴다
    const x = px(m(76));
    ink.push(faceDisc(x, py(266), px(31), px(30), 0.0004));
    white.push(faceDisc(x, py(259.7), px(18.3), px(13.7), 0.001));
    white.push(faceDisc(x, py(283), px(14), px(5), 0.001));
    ink.push(faceDisc(x, py(279.5), px(14.5), px(3.5), 0.0013));
    // 눈썹: 안쪽은 평평하고 바깥 끝이 내려가는 호 (가운데에서 52~100px, y 180~192.5)
    ink.push(faceLine([[52, 182], [64, 179.8], [76, 180], [89, 184.5], [100, 192.5]].map(([dx, y]) => pt(m(dx), y)), px(2.7)));
    // 볼터치 (가운데 ±151.6px, y 304.5): 분홍 타원(43×33.8px) + "/" 빗금 4줄 (두 볼 모두 같은 방향)
    const cx = m(151.6);
    const [bx, by] = pt(cx, 304.5);
    blush.push(faceDisc(bx, by, px(43), px(33.8), 0.0004));
    for (const dx of [-27, -9, 9, 27]) {
      ink.push(faceLine([pt(cx + dx - 5, 315), pt(cx + dx + 5, 290)], px(3.5), 0.0019)); // 볼 원판 위로 올라오게
    }
  }
  // 입 (가운데): 폭 52px의 ω 윗선 → 그 아래 속이 하얀 U자로 벌린 입(폭 25px) → 아래쪽 작은 미소 선
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y));
  const LINE = px(3.3);
  ink.push(faceLine(mouth([[-26, 316], [-22, 323.5], [-15, 327], [-8, 324], [-3, 316], [0, 312], [3, 316], [8, 324], [15, 327], [22, 323.5], [26, 316]]), LINE));
  ink.push(faceLine(mouth([[-12, 327], [-12.5, 335], [-10, 344], [-5, 349.5], [0, 350.5], [5, 349.5], [10, 344], [12.5, 335], [12, 327]]), LINE));
  ink.push(faceLine(mouth([[-11.5, 367], [0, 371.5], [11.5, 367]]), px(2.6)));
  return { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush) };
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
  );
}
