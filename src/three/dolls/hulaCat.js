import * as THREE from 'three';
import { BASE, buildCrown, buildSkirt, createHead, hulaMesh, limb, mergeAll, photoMapper, placed, skirtHips } from './hulaBase.js';

/**
 * 훌라 고양이 (#53): 파란 모자 무늬 + 뾰족한 귀, 하늘색 꽃 화관, 풀 치마를 입은 흰 고양이.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 모습은 참고 이미지(앞·뒤·양옆)에서 픽셀로 잰 비율을 그대로 옮겼다. 머리 반폭은 훌라 햄스터와 같은 0.061m.
 * 사진 기준: 머리 가운데 x = 263px, 머리 반폭 172px, 머리 아래(목) y = 342px, 머리 꼭대기 y = 92px. (y는 아래가 +)
 * 얼굴은 앞쪽에만 있고, 뒷면은 파란 모자 무늬와 흰색이다.
 *
 * 훌라 햄스터처럼 같은 재질의 부품은 한 번만 합쳐 모든 인형이 공유한다 (메시 10개). 몸 색(fur)만 인형마다 다르다.
 */

// bottom: 둥근 턱 아래 끝 (팔·몸통에 가려 보이지 않는 부분까지 이어 그린 값). 목(몸통과 만나는 곳)은 342px.
const PHOTO = { cx: 263, halfWidth: 172, bottom: 354.5, top: 92 };
const K = 0.061 / PHOTO.halfWidth; // 1px → m
const tAt = (y) => (PHOTO.bottom - y) / (PHOTO.bottom - PHOTO.top); // 사진 y(px) → 머리 높이 비율

// 머리 앞모습 실루엣: 가장 넓은 곳(사진 y 250px, 볼 높이)을 가운데로
// 아래는 둥근 턱으로 모이는 초타원(지수 2.5), 위는 조금 납작한 반타원(지수 2.3).
const WIDEST = tAt(250);
const SILHOUETTE = Array.from({ length: 33 }, (_, i) => {
  const t = i / 32;
  const [r, p] = t >= WIDEST ? [1 - WIDEST, 2.3] : [WIDEST, 2.5];
  return [t, Math.max(0, 1 - Math.abs((t - WIDEST) / r) ** p) ** (1 / p)];
});
// 목 높이를 훌라 햄스터와 같은 -0.008에 둔다. 옆모습에서 잰 앞뒤 두께는 좌우 폭의 0.72~0.74라 0.75로 둔다.
const HEAD = createHead({
  bottom: -0.008 - (PHOTO.bottom - 342) * K,
  height: (PHOTO.bottom - PHOTO.top) * K,
  halfWidth: 0.061,
  depth: 0.75,
  silhouette: SILHOUETTE,
});
const { at } = HEAD;

const MAT = {
  ink: new THREE.MeshStandardMaterial({ color: 0x33221f, roughness: 0.7 }), // 수놓은 진한 갈색
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xedb9c1, roughness: 0.9 }),
  tongue: new THREE.MeshStandardMaterial({ color: 0xf1cbd2, roughness: 0.9 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x8fa3ea, roughness: 0.95 }), // 모자 무늬·귀 (보송한 천)
  skirt: new THREE.MeshStandardMaterial({ color: 0xbde3a1, roughness: 1 }), // 털실
  skirtDeep: new THREE.MeshStandardMaterial({ color: 0xa6d28b, roughness: 1 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xdfe6f8, roughness: 0.8 }),
  pearl: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.25, metalness: 0.05 }),
};

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

function buildBody() {
  const parts = [
    HEAD.geometry(),
    skirtHips(HEAD.depth, SKIRT), // 치마 속 몸 아랫부분 (치마 속이 비어 보이지 않게)
    // 몸통: 머리와 치마 사이로 보이는 둥근 흰 몸 (사진 반폭 121px). 모서리 없이 봉제 인형처럼 둥글게.
    placed(BASE.sphere, { pos: [0, -0.03, 0], scale: [0.043, 0.03, 0.043 * HEAD.depth] }),
  ];
  for (const sx of [-1, 1]) {
    parts.push(
      // 팔: 목 아래 옆으로, 조금 앞·아래로 뻗은 작고 둥근 팔 (사진 끝 185px = 0.066m, 높이 338~385px).
      // 어깨를 몸통 속에 두어 팔이 몸통에서 떨어져 보이지 않게 한다.
      limb([sx * 0.028, -0.012, 0.006], [sx * 0.0624, -0.0201, 0.0155], 0.0078, 0.0105),
      // 다리: 치마 아래로 보이는 짧은 두 다리 (사진 222~306px, 발바닥 510px)
      placed(BASE.sphere, { pos: [sx * 0.0075, -0.0595, 0.003], scale: [0.0072, 0.009, 0.0086] }),
    );
  }
  return mergeAll(parts);
}

/**
 * 파란 모자 무늬의 아래 끝 (머리 높이 비율). a: 머리 둘레 각도 (0 = 정면).
 * 둘레는 대체로 사진 y 183px, 앞쪽 눈썹 위(가운데에서 ±90px)에서 194px까지 내려오고,
 * 정면 가운데는 흰 가르마가 화관 뒤(151px)까지 올라간다. 가르마 폭은 y 182px에서 ±39px.
 */
function capEdge(a) {
  const dip = 11.25 * Math.exp(-(((Math.abs(a) - 0.6) / 0.3) ** 2));
  const part = 32.5 * Math.exp(-((a / 0.24) ** 2));
  return tAt(183.25 + dip - part);
}

/** 머리 윗부분을 덮는 파란 모자 무늬: 머리 표면을 따라 살짝 띄운 껍질 (이음매는 뒤쪽) */
function buildCap() {
  const A = 96; // 둘레 칸 수
  const N = 22; // 위아래 칸 수
  const LIFT = 0.0007;
  const TOP_T = 0.995;
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= A; i++) {
      const a = -Math.PI + (i / A) * Math.PI * 2;
      const edge = capEdge(a);
      const t = edge + (TOP_T - edge) * (j / N);
      const { point, normal } = HEAD.ringPoint(at(t), a, LIFT);
      positions.push(...point.toArray());
      normals.push(...normal.toArray());
      uvs.push(i / A, j / (N + 1));
    }
  }
  // 꼭대기를 닫는 점
  const pole = positions.length / 3;
  positions.push(0, at(1) + LIFT, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 1);

  const index = [];
  const row = (j) => j * (A + 1);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < A; i++) {
      const p = row(j) + i;
      const q = row(j + 1) + i;
      index.push(p, p + 1, q, p + 1, q + 1, q);
    }
  }
  for (let i = 0; i < A; i++) index.push(row(N) + i, row(N) + i + 1, pole);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

// 귀 단면 (r: 밑동 반지름 대비, y: 귀 높이 대비). 끝이 둥근 삼각형, 밑동은 머리 안으로 묻힌다.
const EAR_PROFILE = [[1, -0.4], [1, 0], [0.95, 0.3], [0.78, 0.55], [0.52, 0.77], [0.28, 0.92], [0.12, 0.98], [0.0001, 1]];

/** 뾰족한 고양이 귀 두 개: 끝 (±90px, 62px), 밑동 반폭 0.0165, 앞뒤로 얇게(폭의 0.5), 바깥으로 0.3rad 기울임 */
function buildEars() {
  const unit = new THREE.LatheGeometry(EAR_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const H = (122 - 62) * K; // 밑동(사진 122px, 머리 안에 묻힘)에서 끝(62px)까지
  const R = 0.0165;
  const TILT = 0.3;
  const tip = { x: 90 * K, y: HEAD.bottom + (PHOTO.bottom - 62) * K };
  const ears = [-1, 1].map((sx) =>
    placed(unit, {
      pos: [sx * (tip.x - H * Math.sin(TILT)), tip.y - H * Math.cos(TILT), 0],
      scale: [R, H, R * 0.5],
      rot: [0, 0, -sx * TILT],
    }),
  );
  unit.dispose();
  return ears;
}

// 풀 치마: 허리띠(사진 396px, 반폭 128px)에서 아래(492px, 반폭 162px)로 퍼진다
const SKIRT = {
  waistY: HEAD.bottom - (396 - PHOTO.bottom) * K,
  waistR: 0.0454,
  waistThick: 0.03,
  strandY: -0.0425,
  // 가닥 사이로 몸·다리가 조금 보이도록 사진처럼 성기게, 끝은 다리보다 위에서 끝난다
  front: { count: 28, r: 0.05, tilt: 0.42, height: 0.031, offset: 0, width: 0.0034 },
  back: { count: 28, r: 0.046, tilt: 0.36, height: 0.029, offset: 0.5, width: 0.0034 },
};

// 꽃 화관: 모자 무늬 위(사진 150px)를 두르는 하늘빛 흰 꽃 12송이 (꽃 지름 약 55px)
const CROWN = { t: tAt(149.5), count: 12, petalOffset: 0.0054, petalSize: 0.0062, petalThickness: 0.0026, pearlSize: 0.0024, lift: 0.0035, pearlLift: 0.0026 };

// 얼굴 좌표: 사진 앞모습에서 픽셀로 잰 값을 그대로 옮긴다 (가로·세로 같은 비율)
const { px, py, pt } = photoMapper(HEAD, PHOTO);

function buildFace() {
  const ink = [];
  const white = [];
  const blush = [];
  const tongue = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    // 눈 (가운데 ±51px, y 241.5): 진한 갈색 타원(21×19.5px)
    //   → 위쪽 큰 흰 타원(12.75×9px, y 236.5)
    //   → 아래 흰 초승달(가운데 두께 약 5px): 흰 타원(11×4px, y 252.5) 위에 갈색 타원(11.5×3px, y 248)을 겹쳐 아랫부분만 남긴다
    const [x] = pt(m(51), 0);
    ink.push(HEAD.faceDisc(x, py(241.5), px(21), px(19.5), 0.0004));
    white.push(HEAD.faceDisc(x, py(236.5), px(12.75), px(9), 0.001));
    white.push(HEAD.faceDisc(x, py(252.5), px(11), px(4), 0.001));
    ink.push(HEAD.faceDisc(x, py(248), px(11.5), px(3), 0.0013));
    // 눈썹 (y 197.5): 눈 위의 짧은 선(11px), 안쪽 끝이 조금 높다
    ink.push(HEAD.faceLine([pt(m(52.5), 199.5), pt(m(47), 197.3), pt(m(42), 195.5)], px(2.3)));
    // 볼터치 (가운데 ±101.5px, y 270.5): 분홍 타원(29.4×23px) + "/" 빗금 4줄 (두 볼 모두 같은 방향)
    const cx = m(101.5);
    const [bx, by] = pt(cx, 270.5);
    blush.push(HEAD.faceDisc(bx, by, px(29.4), px(23), 0.0004));
    for (const dx of [-16, -5.3, 5.3, 16]) {
      ink.push(HEAD.faceLine([pt(cx + dx - 3.75, 278.75), pt(cx + dx + 3.75, 262.5)], px(2.2), 0.0012));
    }
  }
  // 입 (가운데): 폭 41px의 ω 윗선 → ω 아래에 매달린 U자로 벌린 입(갈색, 폭 30px, 277~305px) 안에 분홍 혀 → 아래 작은 미소 선
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y));
  const LINE = px(2.4);
  ink.push(HEAD.faceLine(mouth([[-20.25, 272], [-17.25, 276.25], [-11, 277.5], [-4.75, 274.5], [0, 268.75], [4.75, 274.5], [11, 277.5], [17.25, 276.25], [20.25, 272]]), LINE));
  // U 윤곽: 오른쪽 위에서 아래로 내려가 왼쪽 위로, 윗변은 ω 아래쪽을 따라간다
  const uShape = (half, top, bottom, peak) => {
    const side = [[1, 0], [1.03, 0.3], [0.95, 0.55], [0.78, 0.76], [0.45, 0.93], [0, 1]].map(([w, f]) => [half * w, top + (bottom - top) * f]);
    const right = side.slice(0, -1);
    const left = right.map(([dx, y]) => [-dx, y]).reverse();
    return mouth([...right, side.at(-1), ...left, [-half * 0.5, top - 0.5], [0, peak], [half * 0.5, top - 0.5]]);
  };
  ink.push(HEAD.faceShape(uShape(14.5, 276.5, 305, 272), 0.0004));
  tongue.push(HEAD.faceShape(uShape(8, 280, 299.5, 279), 0.001));
  ink.push(HEAD.faceLine(mouth([[-10, 312], [0, 317], [10, 312]]), LINE));
  return { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush), tongue: mergeAll(tongue) };
}

let shared = null;
function sharedGeometry() {
  if (!shared) {
    shared = {
      body: buildBody(),
      blue: mergeAll([buildCap(), ...buildEars()]),
      skirt: buildSkirt(HEAD, SKIRT),
      crown: buildCrown(HEAD, CROWN),
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
export function buildHulaCat(group, doll, { fur }) {
  const g = sharedGeometry();
  group.add(
    hulaMesh(g.body, fur),
    hulaMesh(g.blue, MAT.blue),
    hulaMesh(g.skirt.front, MAT.skirt),
    hulaMesh(g.skirt.back, MAT.skirtDeep, false),
    hulaMesh(g.crown.petals, MAT.petal),
    hulaMesh(g.crown.pearls, MAT.pearl, false),
    hulaMesh(g.face.ink, MAT.ink, false),
    hulaMesh(g.face.white, MAT.white, false),
    hulaMesh(g.face.blush, MAT.blush, false),
    hulaMesh(g.face.tongue, MAT.tongue, false),
  );
}
