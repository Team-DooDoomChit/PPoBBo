import * as THREE from 'three';
import { BASE, buildCrown, buildSkirt, createHead, hulaMesh, limb, mergeAll, photoMapper, placed } from './hulaBase.js';

/**
 * 인어섬 모몬가 (#65): 크고 둥근 귀, 볼 옆 털 뭉치, 연보라 꽃 화관, 풀 치마를 입은 흰 모몬가.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 모습은 참고 이미지(앞·뒤·양옆)에서 픽셀로 잰 값을 그대로 옮겼다. 머리 반폭은 다른 훌라 인형과 같은 0.061m.
 * 사진 기준(앞모습): 얼굴 가운데 x = 497px(얼굴 요소), 머리 가운데 x = 475px(귀·털 뭉치처럼 머리 기준 부품. 사진이 살짝 돌아가 있다), 머리 반폭 300px,
 * 가장 넓은 높이 y = 450px, 정수리 y = 180px, 머리 아래 끝 y = 664px, 귀 끝 y = 25px, 치마 아래 끝 y = 955px. (y는 아래가 +)
 * 참고 이미지 뒷모습은 머리가 치마에 바로 붙어 목이 없어 보이지만, 앞모습처럼 머리와 치마 사이에 몸통이 둘레 전체로 보이게 했다.
 * 얼굴은 앞쪽에만 있다.
 *
 * 같은 재질의 부품은 처음 한 번만 합쳐 모든 인형이 공유한다. 몸 색(fur)만 인형마다 다르다.
 */

const PHOTO = { cx: 497, headCx: 475, halfWidth: 300, bottom: 664, top: 180 };
const K = 0.061 / PHOTO.halfWidth; // 1px → m
const Y0 = -0.065 + 955 * K; // 사진 y 0px의 높이 (치마 아래 끝 955px이 몸통 구 아래 끝 -0.065에 오도록)
const Y = (y) => Y0 - y * K; // 사진 y(px) → m
const tAt = (y) => (PHOTO.bottom - y) / (PHOTO.bottom - PHOTO.top); // 사진 y(px) → 머리 높이 비율

// 머리 앞모습 실루엣: 가장 넓은 높이(450px)를 가운데로 위는 둥근 돔(지수 2.2), 아래는 평평하고 넓적한 턱(지수 3.5)
const WIDEST = tAt(450);
const SILHOUETTE = Array.from({ length: 41 }, (_, i) => {
  const t = i / 40;
  const [r, p] = t >= WIDEST ? [1 - WIDEST, 2.2] : [WIDEST, 3.5];
  return [t, Math.max(0, 1 - Math.abs((t - WIDEST) / r) ** p) ** (1 / p)];
});
// 옆모습에서 잰 머리 앞뒤 두께는 좌우 폭의 0.88
const HEAD = createHead({ bottom: Y(PHOTO.bottom), height: (PHOTO.bottom - PHOTO.top) * K, halfWidth: 0.061, depth: 0.88, silhouette: SILHOUETTE });
const BODY_DEPTH = 0.85; // 몸통·치마 앞뒤 두께 / 좌우 폭

const mat = (color, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const MAT = {
  ink: mat(0x141414, 0.5), // 수놓은 검은 선
  white: mat(0xffffff, 0.3),
  blush: mat(0xe6b3bb),
  nose: mat(0xe2eef8, 1), // 하늘색 코 (보송한 천)
  pale: mat(0xcfdff5, 1), // 귀 안쪽·꼬리의 연한 하늘색
  skirt: mat(0xbde3a1, 1), // 털실
  skirtDeep: mat(0xa6d28b, 1),
  petal: mat(0xbab0ea, 0.85), // 연보라 꽃
  pearl: mat(0xe8e4f4, 0.25, 0.1),
};

const { px, py, pt } = photoMapper(HEAD, PHOTO);

// ---------- 결정적 난수 (모든 인형이 같은 모양을 공유하도록 매번 같은 값) ----------
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

// 몸통: 머리 아래(655px)에서 치마 허리(740px)까지 보이는 둥근 흰 원통 (반폭 235px). 뒤쪽에도 같은 높이로 보인다.
const TORSO = { r: 235 * K, top: Y(640), bottom: Y(750) };

function buildBody() {
  const torsoH = TORSO.top - TORSO.bottom;
  const parts = [
    HEAD.geometry(),
    placed(new THREE.CylinderGeometry(TORSO.r, TORSO.r + 0.001, torsoH, 40), { pos: [0, (TORSO.top + TORSO.bottom) / 2, 0], scale: [1, 1, BODY_DEPTH] }),
    // 팔: 몸통 옆에서 아래·바깥으로 내린 짧은 팔 (끝 165px·755px / 770px·735px). 어깨는 몸통 속에 묻는다.
    ...[-1, 1].map((sx) => limb([sx * 0.036, -0.006, 0.004], [sx * 0.0615, -0.0225, 0.008], 0.0068, 0.0075)),
    // 발: 치마 속, 아래로 살짝 보이는 작은 발
    placed(BASE.sphere, { pos: [-0.012, -0.059, 0.008], scale: [0.009, 0.006, 0.01] }),
    placed(BASE.sphere, { pos: [0.012, -0.059, 0.008], scale: [0.009, 0.006, 0.01] }),
  ];
  // 귀(바깥 흰 부분): 머리 위 양옆의 크고 둥근 접시 모양 (가운데에서 ±219px, 지름 약 230px, 끝 25px 근처). 위쪽이 바깥으로 기운다.
  for (const sx of [-1, 1]) {
    parts.push(placed(BASE.sphere, { pos: [sx * px(219), Y(135), -0.004], scale: [px(115), px(122), 0.0078], rot: [0, -sx * 0.25, -sx * 0.3] }));
  }
  return mergeAll(parts);
}

/** 귀 안쪽 연한 하늘색: 흰 귀 앞면에 얹은 조금 작은 타원 (바깥쪽 가장자리는 흰 테두리로 남는다) */
function buildEarInner() {
  return mergeAll([-1, 1].map((sx) =>
    placed(BASE.sphere, { pos: [sx * px(212), Y(140), 0.0005], scale: [px(95), px(104), 0.0047], rot: [0, -sx * 0.25, -sx * 0.3] }),
  ));
}

/**
 * 볼 옆 털 뭉치: 머리 양옆(가운데에서 ±340px, 485px. 안쪽은 볼에 붙는다)에 위아래로 긴 보송한 털.
 * 앞에서는 폭 200px·높이 320px, 옆에서는 지름 약 300px. 속 뭉치에서 가는 털이 사방(머리 쪽 제외)으로 뻗는다.
 */
function buildTufts() {
  const parts = [];
  const spike = new THREE.ConeGeometry(1, 1, 4, 1, true);
  spike.translate(0, 0.5, 0); // 밑동을 원점에 둔다
  const up = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) {
    const center = new THREE.Vector3(sx * px(340), Y(485), 0.003);
    const core = new THREE.Vector3(0.012, 0.028, 0.026); // 속 뭉치 반지름
    parts.push(placed(BASE.sphere, { pos: center.toArray(), scale: core.toArray() }));
    const rand = seeded(sx > 0 ? 7 : 11);
    const N = 700;
    for (let i = 0; i < N; i++) {
      // 고르게 퍼진 방향 (피보나치 구) + 조금씩 흔들기
      const yy = 1 - (2 * (i + 0.5)) / N;
      const rr = Math.sqrt(1 - yy * yy);
      const th = i * 2.399963 + rand() * 0.3;
      const dir = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
      if (dir.x * sx < -0.6) continue; // 머리 속으로 파고드는 털은 뺀다
      const base = center.clone().add(new THREE.Vector3(dir.x * core.x, dir.y * core.y, dir.z * core.z).multiplyScalar(0.85));
      const len = 0.008 + rand() * 0.007;
      const out = dir.clone().add(new THREE.Vector3((rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4)).normalize();
      parts.push(placed(spike, { pos: base.toArray(), quat: new THREE.Quaternion().setFromUnitVectors(up, out), scale: [0.0017, len, 0.0017] }));
    }
  }
  spike.dispose();
  return mergeAll(parts);
}

// 풀 치마: 허리(740px, 반폭 240px)에서 아래 끝(955px, 반폭 277px)까지 굵게 꼰 털실
const SKIRT = {
  waistY: Y(740),
  waistR: 0.049,
  waistThick: 0.03,
  strandY: (Y(740) + Y(955)) / 2,
  front: { count: 26, r: 0.0528, tilt: 0.25, height: 0.044, offset: 0, width: 0.0046 },
  back: { count: 26, r: 0.0488, tilt: 0.2, height: 0.042, offset: 0.5, width: 0.0044 },
};

// 연보라 꽃 화관: 머리 둘레(앞 가운데 315px)를 한 바퀴 두른 큰 꽃 14송이 (꽃 지름 약 110px)
const CROWN = { t: tAt(315), count: 14, petalOffset: 0.0068, petalSize: 0.0074, petalThickness: 0.0026, pearlSize: 0.0024, lift: 0.0035, pearlLift: 0.0026 };

/** 꼬리: 뒤쪽 치마 허리 바로 위의 작고 보송한 연하늘색 공 */
function buildTail() {
  return placed(BASE.sphere, { pos: [0, Y(705), -(TORSO.r * BODY_DEPTH + 0.004)], scale: [0.0072, 0.0068, 0.0062] });
}

// 얼굴 좌표: 사진 앞모습에서 픽셀로 잰 값을 그대로 옮긴다 (얼굴 가운데 497px 기준, 가로·세로 같은 비율)
function buildFace() {
  const ink = [];
  const white = [];
  const blush = [];
  const nose = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    // 눈 (가운데 ±124px, y 447.5): 큰 가로 타원 검은 테두리(60×45px)
    //   → 위쪽 흰 타원(41×21px, y 441)
    //   → 아래 흰 초승달(폭 62px, 가운데 두께 약 14px): 흰 타원(31×12.5px, y 470) 위에 검은 타원(34×3.5px, y 465)을 겹쳐 아랫부분만 남긴다
    const x = px(m(124));
    ink.push(HEAD.faceDisc(x, py(447.5), px(60), px(45), 0.0004));
    white.push(HEAD.faceDisc(x, py(441), px(41), px(21), 0.001));
    white.push(HEAD.faceDisc(x, py(470), px(31), px(12.5), 0.001));
    ink.push(HEAD.faceDisc(x, py(465), px(34), px(3.5), 0.0013));
    // 눈썹: 코 위 양옆의 짧은 사선 (바깥 위 → 안쪽 아래, 화난 눈썹)
    ink.push(HEAD.faceLine([pt(m(75), 383), pt(m(64), 393), pt(m(53), 404)], px(3.5)));
    // 볼터치 (가운데 ±223px, y 506): 분홍 타원(50×42px) + "/" 빗금 4줄 (두 볼 모두 같은 방향)
    const cx = m(223);
    const [bx, by] = pt(cx, 506);
    blush.push(HEAD.faceDisc(bx, by, px(50), px(42), 0.0004));
    for (const dx of [-31, -10, 11, 32]) {
      ink.push(HEAD.faceLine([pt(cx + dx - 6, 520), pt(cx + dx + 6, 487.5)], px(3.5), 0.0019)); // 볼 원판 위로 올라오게
    }
  }
  // 코: 두 눈 사이 하늘색 둥근 코(47.5×41px, y 451) + 콧구멍 두 점(±10.75px, y 445)
  nose.push(HEAD.faceDisc(px(3), py(451), px(47.5), px(41), 0.0006));
  for (const sx of [-1, 1]) ink.push(HEAD.faceDisc(px(3 + sx * 10.75), py(445), px(5.5), px(8.5), 0.0016));
  // 입: 가운데에서 5px 오른쪽의 ω 윗선 → 그 아래 왼쪽 "υ" 모양 선 + 오른쪽 짧은 선
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y));
  const LINE = px(4.5);
  ink.push(HEAD.faceLine(mouth([[-36, 517.5], [-30, 528], [-20, 535], [-9, 530], [3, 512], [5, 507.5], [7, 512], [19, 530], [30, 535], [40, 528], [45, 517.5]]), LINE));
  ink.push(HEAD.faceLine(mouth([[-44.5, 555], [-42, 580], [-32, 589], [-19.5, 582.5], [-17, 565]]), LINE));
  ink.push(HEAD.faceLine(mouth([[-8, 558], [6, 561], [20.5, 557]]), LINE));
  return { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush), nose: mergeAll(nose) };
}

let shared = null;
function sharedGeometry() {
  if (!shared) {
    shared = {
      body: buildBody(),
      tufts: buildTufts(),
      pale: mergeAll([buildEarInner(), buildTail()]),
      skirt: buildSkirt({ depth: BODY_DEPTH }, SKIRT),
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
export function buildHulaMomonga(group, doll, { fur }) {
  const g = sharedGeometry();
  group.add(
    hulaMesh(g.body, fur),
    hulaMesh(g.tufts, fur),
    hulaMesh(g.pale, MAT.pale),
    hulaMesh(g.skirt.front, MAT.skirt),
    hulaMesh(g.skirt.back, MAT.skirtDeep, false),
    hulaMesh(g.crown.petals, MAT.petal),
    hulaMesh(g.crown.pearls, MAT.pearl, false),
    hulaMesh(g.face.nose, MAT.nose, false),
    hulaMesh(g.face.ink, MAT.ink, false),
    hulaMesh(g.face.white, MAT.white, false),
    hulaMesh(g.face.blush, MAT.blush, false),
  );
}
