import * as THREE from 'three';
import { BASE, buildCrown, buildSkirt, faceFrom, hulaMesh, limb, mergeAll, placed, skirtFrom, skirtHips, standardBody, standardHead, STD_SKIRT } from './hulaBase.js';

/**
 * 인어섬 치이카와 (훌라 햄스터, #49): 꽃 화관 + 풀 치마를 입은 흰 햄스터.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 머리·몸 비율은 호빵 시리즈와 같은 표준 체형(hulaBase.standardHead/standardBody)을 쓴다 (#80).
 * 얼굴은 참고 사진 앞모습에서 잰 픽셀 좌표(얼굴 가운데 252px, 눈 ±76px·266px 기준)를 faceFrom으로 표준 얼굴에 옮겨,
 * 표정은 사진 그대로이고 얼굴 비율은 호빵 시리즈와 같다.
 * 얼굴은 앞쪽에만 있고 뒷면은 흰색이다. 키링(볼체인·잎사귀)은 넣지 않는다.
 *
 * 같은 재질의 부품은 처음 한 번만 합쳐 모든 인형이 공유한다 (메시 8개). 몸 색(fur)만 인형마다 다르다.
 */

const { head: HEAD, top: HEAD_TOP } = standardHead();

const MAT = {
  ink: new THREE.MeshStandardMaterial({ color: 0x1d1717, roughness: 0.7 }), // 수놓은 거의 검은 선
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xe6adbb, roughness: 0.9 }),
  skirt: new THREE.MeshStandardMaterial({ color: 0xbde3a1, roughness: 1 }), // 털실
  skirtDeep: new THREE.MeshStandardMaterial({ color: 0xa6d28b, roughness: 1 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xf6dfe8, roughness: 0.8 }),
  pearl: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.25, metalness: 0.05 }),
};

// ---------- 부품별 지오메트리 (한 번만 만든다) ----------

// 풀 치마: 몸 가운데 허리에서 다리 위까지 (인어섬 시리즈 표준 치수)
const SKIRT = skirtFrom({ ...STD_SKIRT, count: 30, width: 0.0036 });

// 연분홍 꽃 화관: 눈썹 위 이마를 두르는 큰 꽃 12송이
const CROWN = { t: 0.78, count: 12, petalOffset: 0.0058, petalSize: 0.0064, petalThickness: 0.0025, pearlSize: 0.002, lift: 0.0035, pearlLift: 0.0025 };

function buildBody() {
  const parts = [
    HEAD.geometry(),
    skirtHips(HEAD.depth, SKIRT), // 치마 속 몸 아랫부분 (치마 속이 비어 보이지 않게)
    // 몸통·다리: 호빵 시리즈와 같은 둥근 몸. 허리 위로 몸 윗부분이 보이고 그 아래가 치마다.
    ...standardBody(HEAD.depth),
    // 팔 (사진처럼 비대칭인 주걱 모양): 왼쪽(-x)은 아래로 내리고, 오른쪽(+x)은 옆으로 들어 끝이 조금 위로
    limb([-0.022, -0.005, 0.006], [-0.049, -0.022, 0.011], 0.0076, 0.0085),
    limb([0.022, -0.005, 0.006], [0.056, -0.002, 0.011], 0.0074, 0.0085),
  ];
  // 귀: 머리 꼭대기 양쪽, 화관 위로 솟은 작고 둥근 귀 (호빵 치이카와와 같은 자리)
  for (const sx of [-1, 1]) {
    parts.push(placed(BASE.sphere, { pos: [sx * 0.036, HEAD_TOP - 0.007, -0.004], scale: [0.011, 0.0105, 0.009] }));
  }
  return mergeAll(parts);
}

function buildFace() {
  // 사진 좌표(얼굴 가운데 252px 기준 가로 px, 높이 px)를 표준 얼굴로 옮긴다
  const { px, py, pt } = faceFrom({ dx: 76, y: 266 });
  const ink = [];
  const white = [];
  const blush = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    // 눈 (가운데 ±76px, y 266): 검은 타원(31×30px)
    //   → 그 안 위쪽에 큰 흰 타원(18.3×13.7px, y 259.7)
    //   → 아래 흰 초승달: 흰 타원(14×5px, y 283) 위에 검은 타원(14.5×3.5px, y 279.5)을 겹쳐 아랫부분만 남긴다
    const x = px(m(76));
    ink.push(HEAD.faceDisc(x, py(266), px(31), px(30), 0.0004));
    white.push(HEAD.faceDisc(x, py(259.7), px(18.3), px(13.7), 0.001));
    white.push(HEAD.faceDisc(x, py(283), px(14), px(5), 0.001));
    ink.push(HEAD.faceDisc(x, py(279.5), px(14.5), px(3.5), 0.0013));
    // 눈썹: 안쪽은 평평하고 바깥 끝이 내려가는 호 (가운데에서 52~100px, y 180~192.5)
    ink.push(HEAD.faceLine([[52, 182], [64, 179.8], [76, 180], [89, 184.5], [100, 192.5]].map(([dx, y]) => pt(m(dx), y)), px(3)));
    // 볼터치 (가운데 ±151.6px, y 304.5): 분홍 타원(43×33.8px) + "/" 빗금 4줄
    const cx = m(151.6);
    const [bx, by] = pt(cx, 304.5);
    blush.push(HEAD.faceDisc(bx, by, px(43), px(33.8), 0.0004));
    for (const dx of [-27, -9, 9, 27]) {
      ink.push(HEAD.faceLine([pt(cx + dx - 5, 315), pt(cx + dx + 5, 290)], px(3.5), 0.0019)); // 볼 원판 위로 올라오게
    }
  }
  // 입 (가운데): ω 윗선 → 그 아래 속이 하얀 U자로 벌린 입 → 아래쪽 작은 미소 선
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y));
  const LINE = px(3.5);
  ink.push(HEAD.faceLine(mouth([[-26, 316], [-22, 323.5], [-15, 327], [-8, 324], [-3, 316], [0, 312], [3, 316], [8, 324], [15, 327], [22, 323.5], [26, 316]]), LINE));
  ink.push(HEAD.faceLine(mouth([[-12, 327], [-12.5, 335], [-10, 344], [-5, 349.5], [0, 350.5], [5, 349.5], [10, 344], [12.5, 335], [12, 327]]), LINE));
  ink.push(HEAD.faceLine(mouth([[-11.5, 367], [0, 371.5], [11.5, 367]]), px(3)));
  return { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush) };
}

let shared = null;
function sharedGeometry() {
  if (!shared) {
    shared = { body: buildBody(), skirt: buildSkirt(HEAD, SKIRT), crown: buildCrown(HEAD, CROWN), face: buildFace() };
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
  group.add(
    hulaMesh(g.body, fur),
    hulaMesh(g.skirt.front, MAT.skirt),
    hulaMesh(g.skirt.back, MAT.skirtDeep, false),
    hulaMesh(g.crown.petals, MAT.petal),
    hulaMesh(g.crown.pearls, MAT.pearl, false),
    hulaMesh(g.face.ink, MAT.ink, false),
    hulaMesh(g.face.white, MAT.white, false),
    hulaMesh(g.face.blush, MAT.blush, false),
  );
}
