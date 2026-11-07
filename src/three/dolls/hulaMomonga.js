import * as THREE from 'three';
import { BASE, buildCrown, buildSkirt, faceFrom, hulaMesh, limb, mergeAll, placed, skirtFrom, skirtHips, standardBody, standardHead, STD_SKIRT } from './hulaBase.js';

/**
 * 인어섬 모몽가 (#65): 크고 둥근 귀, 볼 옆 털 뭉치, 연보라 꽃 화관, 풀 치마를 입은 흰 모몽가.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 머리·몸 비율은 호빵 시리즈와 같은 표준 체형(hulaBase.standardHead/standardBody)을 쓴다 (#80).
 * 얼굴은 참고 사진 앞모습(얼굴 가운데 497px, 눈 ±124px·447.5px)에서 잰 픽셀 좌표를 faceFrom으로 표준 얼굴에 옮겨,
 * 표정은 사진 그대로이고 얼굴 비율은 호빵 시리즈와 같다. 몸 윗부분이 앞뒤 모두 치마 위로 보여 목이 없어 보이지 않는다.
 * 얼굴은 앞쪽에만 있다.
 *
 * 같은 재질의 부품은 처음 한 번만 합쳐 모든 인형이 공유한다. 몸 색(fur)만 인형마다 다르다.
 */

const { head: HEAD, top: HEAD_TOP } = standardHead();
const BODY_DEPTH = 0.75; // 몸통·치마 앞뒤 두께 / 좌우 폭 (호빵 시리즈와 같다)

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

// ---------- 결정적 난수 (모든 인형이 같은 모양을 공유하도록 매번 같은 값) ----------
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

function buildBody() {
  const parts = [
    HEAD.geometry(),
    skirtHips(BODY_DEPTH, SKIRT), // 치마 속 몸 아랫부분 (치마 속이 비어 보이지 않게)
    // 몸통·다리: 호빵 시리즈와 같은 둥근 몸. 허리 위로 몸 윗부분이 보이고 그 아래가 치마다.
    ...standardBody(BODY_DEPTH),
    // 팔: 몸통 맨 위(머리 바로 아래, 목 가까이) 어깨에서 아래·바깥으로 내린 짧은 팔
    ...[-1, 1].map((sx) => limb([sx * 0.022, -0.005, 0.006], [sx * 0.05, -0.02, 0.011], 0.0068, 0.0076)),
  ];
  // 귀(바깥 흰 부분): 머리 위 양옆의 둥근 접시 모양 (지름 약 3.6cm). 위쪽이 바깥으로 기운다.
  // 밑동은 정수리 아래로 머리 속에 묻는다.
  for (const sx of [-1, 1]) {
    parts.push(placed(BASE.sphere, { pos: [sx * 0.0417, HEAD_TOP + 0.0035, -0.004], scale: [0.0179, 0.0189, 0.0068], rot: [0, -sx * 0.25, -sx * 0.3] }));
  }
  return mergeAll(parts);
}

/** 귀 안쪽 연한 하늘색: 흰 귀 앞면에 얹은 조금 작은 타원 (바깥쪽 가장자리는 흰 테두리로 남는다) */
function buildEarInner() {
  return mergeAll([-1, 1].map((sx) =>
    placed(BASE.sphere, { pos: [sx * 0.0404, HEAD_TOP + 0.0027, 0.0001], scale: [0.0146, 0.0161, 0.0042], rot: [0, -sx * 0.25, -sx * 0.3] }),
  ));
}

/**
 * 볼 옆 털 뭉치: 머리 양옆(볼 높이 바로 아래, 안쪽은 볼에 붙는다)에 위아래로 긴 구름 모양.
 * 폭 약 2.6cm, 높이 약 5.8cm.
 * 속 뭉치 둘레에 동글동글한 혹을 고르게(머리 쪽 제외) 붙인다. 혹은 높이마다 턱 쪽으로 좁아지는 머리 옆면을 따라 붙어 떨어져 보이지 않는다.
 */
function buildTufts() {
  const parts = [];
  const lump = new THREE.SphereGeometry(1, 10, 7); // 혹이 작아서 분할을 줄인다
  for (const sx of [-1, 1]) {
    const center = new THREE.Vector3(sx * 0.066, 0.0177, 0.003); // 볼 높이 바로 아래, 머리 옆
    const core = new THREE.Vector3(0.013, 0.029, 0.025); // 속 뭉치 반지름
    parts.push(placed(BASE.sphere, { pos: center.toArray(), scale: core.toArray() }));
    const rand = seeded(sx > 0 ? 7 : 11);
    const N = 36;
    for (let i = 0; i < N; i++) {
      // 고르게 퍼진 방향 (피보나치 구)
      const yy = 1 - (2 * (i + 0.5)) / N;
      const rr = Math.sqrt(1 - yy * yy);
      const th = i * 2.399963;
      const dir = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
      if (dir.x * sx < -0.3) continue; // 머리 속으로 파고드는 혹은 뺀다
      const pos = center.clone().add(new THREE.Vector3(dir.x * core.x, dir.y * core.y, dir.z * core.z).multiplyScalar(0.75));
      pos.x += sx * (HEAD.radius(pos.y) - HEAD.radius(center.y)); // 턱 쪽으로 좁아지는 머리에서 떨어지지 않게
      const size = 0.0105 + rand() * 0.003;
      parts.push(placed(lump, { pos: pos.toArray(), scale: [size, size * 0.92, size] }));
    }
  }
  lump.dispose();
  return mergeAll(parts);
}

// 풀 치마: 몸 가운데 허리에서 다리 위까지 (인어섬 시리즈 표준 치수). 굵게 꼰 털실.
const SKIRT = skirtFrom({ ...STD_SKIRT, count: 26, width: 0.0046 });

// 연보라 꽃 화관: 이마를 한 바퀴 두른 큰 꽃 14송이
const CROWN = { t: 0.78, count: 14, petalOffset: 0.0068, petalSize: 0.0074, petalThickness: 0.0026, pearlSize: 0.0024, lift: 0.0035, pearlLift: 0.0026 };

/** 꼬리: 뒤쪽 치마 허리 바로 위 등에 붙은 작고 보송한 연하늘색 공 */
function buildTail() {
  return placed(BASE.sphere, { pos: [0, -0.02, -0.033], scale: [0.0072, 0.0068, 0.0062] });
}

// 얼굴 좌표: 사진 앞모습에서 픽셀로 잰 값을 그대로 옮긴다 (얼굴 가운데 497px 기준, 가로·세로 같은 비율)
function buildFace() {
  // 사진 좌표(얼굴 가운데 497px 기준 가로 px, 높이 px)를 표준 얼굴로 옮긴다
  const { px, py, pt } = faceFrom({ dx: 124, y: 447.5 });
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
