import * as THREE from 'three';
import { BASE, Z, createHead, hulaMesh, mergeAll, photoMapper, placed } from './hulaBase.js';

/**
 * 목도리 시리즈 (토끼·고양이·햄스터 #55, 모몬가 #73): 훌라 인형과 같은 체형·얼굴에 니트 목도리를 두르고 소품을 안았다.
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 머리·몸·얼굴은 세 인형이 모두 같고, 귀·머리 무늬·목도리 색·소품으로 캐릭터를 구분한다.
 * 머리·얼굴 좌표는 훌라 고양이(#53)와 같은 값이다.
 * 사진 기준: 머리 가운데 x = 263px, 머리 반폭 172px, 머리 아래 y = 354.5px, 머리 꼭대기 y = 92px. (y는 아래가 +)
 */

const PHOTO = { cx: 263, halfWidth: 172, bottom: 354.5, top: 92 };
const K = 0.061 / PHOTO.halfWidth; // 1px → m
const tAt = (y) => (PHOTO.bottom - y) / (PHOTO.bottom - PHOTO.top); // 사진 y(px) → 머리 높이 비율

// 머리 앞모습 실루엣: 가장 넓은 곳(볼 높이)을 가운데로 아래는 둥근 턱, 위는 조금 납작한 반타원
const WIDEST = tAt(250);
const SILHOUETTE = Array.from({ length: 33 }, (_, i) => {
  const t = i / 32;
  const [r, p] = t >= WIDEST ? [1 - WIDEST, 2.3] : [WIDEST, 2.5];
  return [t, Math.max(0, 1 - Math.abs((t - WIDEST) / r) ** p) ** (1 / p)];
});
const HEAD = createHead({
  bottom: -0.008 - (PHOTO.bottom - 342) * K,
  height: (PHOTO.bottom - PHOTO.top) * K,
  halfWidth: 0.061,
  depth: 0.75,
  silhouette: SILHOUETTE,
});
const { at } = HEAD;
const HEAD_TOP = at(1);

const GEO = {
  sphere: BASE.sphere,
  capsule: new THREE.CapsuleGeometry(1, 3, 8, 16), // 높이 5, 반지름 1
  box: new THREE.BoxGeometry(1, 1, 1),
  ring: new THREE.TorusGeometry(1, 0.3, 8, 40),
  strand: new THREE.CylinderGeometry(1, 1, 1, 6),
};

const FACE_MAT = {
  ink: new THREE.MeshStandardMaterial({ color: 0x33221f, roughness: 0.7 }), // 수놓은 진한 갈색
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xedb9c1, roughness: 0.9 }),
  tongue: new THREE.MeshStandardMaterial({ color: 0xf1cbd2, roughness: 0.9 }),
};

const mat = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
const HOPPANG_MAT = mat(0xfbf9f4, 0.75);
const BUNNY_MAT = { scarf: mat(0xe6bd45, 0.95), fringe: mat(0xf2db74) };
const CAT_MAT = { scarf: mat(0x7f9fe0, 0.95), fringe: mat(0x92afea) };
const HAMSTER_MAT = { scarf: mat(0xe88ba0, 0.95), fringe: mat(0xef9fb2) };
const MOMONGA_MAT = { scarf: mat(0xb7a9e2, 0.95), fringe: mat(0xc8bdee), nose: mat(0xd9e8f5, 1) };

/** 부품 메시 하나. 부품은 DollFactory의 mergeParts가 재질별로 합친다. */
function part(geometry, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true } = {}) {
  const mesh = hulaMesh(geometry, material, shadow);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  return mesh;
}

// ---------- 세 인형이 함께 쓰는 지오메트리 (한 번만 만든다) ----------

let sharedBody = null;
/** 머리 + 둥근 몸 + 짧은 다리 (팔은 holdingArmsGeometry) */
function bodyGeometry() {
  if (sharedBody) return sharedBody;
  const parts = [HEAD.geometry(), placed(BASE.sphere, { pos: [0, -0.03, 0], scale: [0.043, 0.03, 0.043 * HEAD.depth] })];
  for (const sx of [-1, 1]) {
    parts.push(placed(BASE.sphere, { pos: [sx * 0.0075, -0.0595, 0.003], scale: [0.0072, 0.009, 0.0086] }));
  }
  sharedBody = mergeAll(parts);
  return sharedBody;
}

let shortBrows = null;
/** 눈 위의 짧은 눈썹 (고양이·햄스터) */
function shortBrowsGeometry() {
  if (!shortBrows) {
    const { px, pt } = photoMapper(HEAD, PHOTO);
    shortBrows = mergeAll([-1, 1].map((sx) => HEAD.faceLine([pt(sx * 52.5, 199.5), pt(sx * 47, 197.3), pt(sx * 42, 195.5)], px(2.3))));
  }
  return shortBrows;
}

const sharedFaces = new Map();
/**
 * 눈썹·입을 뺀 얼굴: 큰 눈(갈색 + 흰 타원 + 아래 초승달), 빗금 볼터치
 * @param {number} [eye] 눈 크기 배율 (눈 가운데 기준)
 */
function faceGeometry(eye = 1) {
  if (sharedFaces.has(eye)) return sharedFaces.get(eye);
  const { px, py, pt } = photoMapper(HEAD, PHOTO);
  const ex = (v) => px(v * eye);
  const ey = (y) => py(241.5 + (y - 241.5) * eye);
  const ink = [];
  const white = [];
  const blush = [];
  for (const sx of [-1, 1]) {
    const m = (dx) => sx * dx; // 오른쪽 요소는 좌우 대칭
    const [x] = pt(m(51), 0);
    ink.push(HEAD.faceDisc(x, ey(241.5), ex(21), ex(19.5), 0.0004));
    white.push(HEAD.faceDisc(x, ey(236.5), ex(12.75), ex(9), 0.001));
    white.push(HEAD.faceDisc(x, ey(252.5), ex(11), ex(4), 0.001));
    ink.push(HEAD.faceDisc(x, ey(248), ex(11.5), ex(3), 0.0013));
    const cx = m(101.5);
    const [bx, by] = pt(cx, 270.5);
    blush.push(HEAD.faceDisc(bx, by, px(29.4), px(23), 0.0004));
    for (const dx of [-16, -5.3, 5.3, 16]) {
      ink.push(HEAD.faceLine([pt(cx + dx - 3.75, 278.75), pt(cx + dx + 3.75, 262.5)], px(2.2), 0.0012));
    }
  }
  const face = { ink: mergeAll(ink), white: mergeAll(white), blush: mergeAll(blush) };
  sharedFaces.set(eye, face);
  return face;
}

/**
 * 입: 윗선 + 벌린 U자 입(안쪽 갈색) + 혀 + 아래 미소 선. 좌표는 사진 px.
 * @param {Array<[number, number]>} upper 윗선 (dx, y)
 * @param {[number, number, number]} u U자 입 [top, bottom, peak] (폭 ±14.5px)
 * @param {[number, number, number]} t 혀 [top, bottom, peak] (폭 ±8px)
 * @param {number} [up] 입 전체를 위로 옮길 px
 */
function mouthGeometry(upper, u, t, up = 0) {
  const { px, pt } = photoMapper(HEAD, PHOTO);
  const mouth = (list) => list.map(([dx, y]) => pt(dx, y - up));
  const LINE = px(2.4);
  // U자 입 윤곽: 오른쪽 위에서 아래로 내려가 왼쪽 위로, 윗변은 윗선 아래쪽을 따라간다
  const uShape = (half, top, bottom, peak) => {
    const side = [[1, 0], [1.03, 0.3], [0.95, 0.55], [0.78, 0.76], [0.45, 0.93], [0, 1]].map(([w, f]) => [half * w, top + (bottom - top) * f]);
    const right = side.slice(0, -1);
    const left = right.map(([dx, y]) => [-dx, y]).reverse();
    return mouth([...right, side.at(-1), ...left, [-half * 0.5, top - 0.5], [0, peak], [half * 0.5, top - 0.5]]);
  };
  return {
    ink: mergeAll([
      HEAD.faceLine(mouth(upper), LINE),
      HEAD.faceShape(uShape(14.5, ...u), 0.0004),
      HEAD.faceLine(mouth([[-10, 312], [0, 317], [10, 312]]), LINE),
    ]),
    tongue: HEAD.faceShape(uShape(8, ...t), 0.001),
  };
}

let omegaMouth = null;
/** 기본 입: ω 윗선 (토끼) */
function omegaMouthGeometry() {
  omegaMouth ??= mouthGeometry(
    [[-20.25, 272], [-17.25, 276.25], [-11, 277.5], [-4.75, 274.5], [0, 268.75], [4.75, 274.5], [11, 277.5], [17.25, 276.25], [20.25, 272]],
    [276.5, 305, 272],
    [280, 299.5, 279],
  );
  return omegaMouth;
}

let closedMouth = null;
/** 다문 입: 양 끝이 위로 말려 올라간 둥근 ω 선 + 아래 짧은 턱 선 (고양이) */
function closedMouthGeometry() {
  if (!closedMouth) {
    const { px, pt } = photoMapper(HEAD, PHOTO);
    const line = (list) => HEAD.faceLine(list.map(([dx, y]) => pt(dx, y)), px(2.4));
    const half = [[19.4, 268.3], [20.7, 274.2], [17.1, 280.6], [10.4, 282.4], [4, 279.2]]; // 바깥 위 → 안쪽 아래
    closedMouth = {
      ink: mergeAll([
        line([...half.map(([dx, y]) => [-dx, y]), [0, 273.3], ...[...half].reverse()]),
        line([[-6, 289.5], [0, 291.5], [6, 289.5]]),
      ]),
    };
  }
  return closedMouth;
}

/** 공통 몸과 얼굴. 눈썹·입은 기본값이 짧은 눈썹·ω 입이다 */
function addBase(group, fur, { brows = shortBrowsGeometry(), mouth = omegaMouthGeometry(), eye = 1 } = {}) {
  const face = faceGeometry(eye);
  group.add(
    hulaMesh(bodyGeometry(), fur),
    hulaMesh(holdingArmsGeometry(), fur),
    hulaMesh(brows, FACE_MAT.ink, false),
    hulaMesh(face.ink, FACE_MAT.ink, false),
    hulaMesh(face.white, FACE_MAT.white, false),
    hulaMesh(face.blush, FACE_MAT.blush, false),
    hulaMesh(mouth.ink, FACE_MAT.ink, false),
  );
  if (mouth.tongue) group.add(hulaMesh(mouth.tongue, FACE_MAT.tongue, false));
}

const NECK_Y = -0.014;

/** 니트 목도리: 턱 아래를 감싸는 밴드 + 니트 결 + 앞쪽으로 늘어진 끝자락과 술 */
function addScarf(group, { scarf, fringe }) {
  const r = 0.0365;
  const rz = r * 0.82;
  group.add(part(GEO.ring, scarf, { pos: [0, NECK_Y, 0.001], scale: [r, rz, 0.034], rot: [Math.PI / 2, 0, 0] }));
  for (const dy of [-0.006, -0.002, 0.002, 0.006]) {
    group.add(part(GEO.ring, scarf, { pos: [0, NECK_Y + dy, 0.001], scale: [r + 0.0002, rz + 0.0002, 0.004], rot: [Math.PI / 2, 0, 0], shadow: false }));
  }
  const tail = new THREE.Group();
  tail.scale.setScalar(0.62);
  tail.position.set(-0.026, NECK_Y - 0.004, 0.032);
  tail.rotation.set(0.15, -0.5, 0.35);
  tail.add(part(GEO.box, scarf, { pos: [0, -0.024, 0], scale: [0.024, 0.048, 0.009] }));
  for (let i = 0; i < 7; i++) {
    tail.add(part(GEO.strand, fringe, { pos: [-0.0105 + i * 0.0035, -0.056, 0], scale: [0.0015, 0.018, 0.0015], rot: [0, 0, (i - 3) * 0.06], shadow: false }));
  }
  group.add(tail);
}

// ---------- 호빵 하치와레 머리 무늬·귀 ----------

/** 파란 무늬 아래 끝 (머리 높이 비율). a: 머리 둘레 각도 (0 = 정면). 정면 가운데는 흰 가르마 */
function capEdge(a) {
  const dip = 11.25 * Math.exp(-(((Math.abs(a) - 0.6) / 0.3) ** 2));
  const gap = 32.5 * Math.exp(-((a / 0.24) ** 2));
  return tAt(183.25 + dip - gap);
}

let sharedCap = null;
/** 머리 윗부분을 덮는 무늬 + 끝이 둥근 삼각형 귀 (uv는 쓰지 않아 mergeParts에서 지운다) */
function capGeometry() {
  if (sharedCap) return sharedCap;
  const A = 96; // 둘레 칸 수
  const N = 22; // 위아래 칸 수
  const LIFT = 0.0007;
  const TOP_T = 0.995;
  const positions = [];
  const normals = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= A; i++) {
      const a = -Math.PI + (i / A) * Math.PI * 2;
      const edge = capEdge(a);
      const { point, normal } = HEAD.ringPoint(at(edge + (TOP_T - edge) * (j / N)), a, LIFT);
      positions.push(...point.toArray());
      normals.push(...normal.toArray());
    }
  }
  const pole = positions.length / 3; // 꼭대기를 닫는 점
  positions.push(0, HEAD_TOP + LIFT, 0);
  normals.push(0, 1, 0);
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
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cap.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  cap.setIndex(index);

  // 귀: 끝 (±90px, 62px), 밑동은 머리 안에 묻히고, 앞뒤로 얇고 바깥으로 살짝 기운다
  const EAR_PROFILE = [[1, -0.4], [1, 0], [0.95, 0.3], [0.78, 0.55], [0.52, 0.77], [0.28, 0.92], [0.12, 0.98], [0.0001, 1]];
  const unit = new THREE.LatheGeometry(EAR_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const H = (122 - 62) * K;
  const R = 0.0165;
  const TILT = 0.3;
  const tip = { x: 90 * K, y: HEAD.bottom + (PHOTO.bottom - 62) * K };
  const ears = [-1, 1].map((sx) =>
    placed(unit, { pos: [sx * (tip.x - H * Math.sin(TILT)), tip.y - H * Math.cos(TILT), 0], scale: [R, H, R * 0.5], rot: [0, 0, -sx * TILT] }),
  );
  unit.dispose();
  sharedCap = mergeAll([cap, ...ears]);
  return sharedCap;
}

// ---------- 호빵 우사기 눈썹, 세 인형의 호빵을 쥔 팔 ----------

const EYE_Y = 0.0277; // 눈 높이 (사진 y 241.5px)

let archedBrows = null;
/** 토끼의 포인트: 눈 위로 높이 올라간 굵은 호 눈썹. 안쪽 위에서 바깥 아래로 휘고 양 끝이 둥글다 */
function archedBrowsGeometry() {
  if (archedBrows) return archedBrows;
  const RADIUS = 0.0009;
  const LIFT = 0.0016;
  const parts = [];
  for (const sx of [-1, 1]) {
    const points = Array.from({ length: 13 }, (_, i) => {
      const a = ((80 + (92 * i) / 12) * Math.PI) / 180;
      return [sx * (0.018 - 0.024 * Math.cos(a)), EYE_Y + 0.008 + 0.024 * Math.sin(a)];
    });
    parts.push(HEAD.faceLine(points, RADIUS, LIFT));
    for (const [x, y] of [points[0], points[12]]) {
      parts.push(placed(BASE.small, { pos: HEAD.point(x, y, LIFT).point.toArray(), scale: [RADIUS, RADIUS, RADIUS] }));
    }
  }
  archedBrows = mergeAll(parts);
  return archedBrows;
}

// 호빵 위치·크기: 몸 앞에 두 손으로 쥔다
const HOPPANG = { pos: [0, -0.031, 0.036], rx: 0.027, ry: 0.023, rz: 0.021 };

let holdingArms = null;
/** 몸에서 앞으로 뻗어 호빵 양옆을 쥐는 짧고 통통한 팔 */
function holdingArmsGeometry() {
  holdingArms ??= mergeAll([-1, 1].map((sx) => {
    const shoulder = new THREE.Vector3(sx * 0.04, -0.019, 0.006);
    const hand = new THREE.Vector3(sx * (HOPPANG.rx - 0.001), HOPPANG.pos[1] + 0.002, HOPPANG.pos[2] + 0.004);
    const dir = hand.clone().sub(shoulder);
    return placed(BASE.sphere, {
      pos: shoulder.clone().add(hand).multiplyScalar(0.5).toArray(),
      quat: new THREE.Quaternion().setFromUnitVectors(Z, dir.clone().normalize()),
      scale: [0.0118, 0.0108, dir.length() / 2 + 0.006],
    });
  }));
  return holdingArms;
}

// ---------- 호빵 치이카와 표정 ----------

let hamsterBrows = null;
/** 왼쪽은 물결(~), 오른쪽은 위로 볼록한 호 눈썹. 각 눈 위에 오도록 눈 위치 기준으로 둔다 */
function hamsterBrowsGeometry() {
  if (hamsterBrows) return hamsterBrows;
  const EYE_X = 51 * K;
  const RADIUS = 0.001;
  const LIFT = 0.0016;
  const brows = [
    [-EYE_X, [[-0.0058, 0.0173], [-0.0038, 0.0192], [-0.0014, 0.0186], [0.0011, 0.0171], [0.0035, 0.0175], [0.0054, 0.0191]]],
    [EYE_X, [[-0.0061, 0.0183], [-0.003, 0.0198], [0.0008, 0.0201], [0.0039, 0.0192], [0.0063, 0.0178]]],
  ];
  const parts = [];
  for (const [ex, line] of brows) {
    const points = line.map(([dx, dy]) => [ex + dx, EYE_Y + dy]);
    parts.push(HEAD.faceLine(points, RADIUS, LIFT));
    for (const [x, y] of [points[0], points.at(-1)]) {
      parts.push(placed(BASE.small, { pos: HEAD.point(x, y, LIFT).point.toArray(), scale: [RADIUS, RADIUS, RADIUS] }));
    }
  }
  hamsterBrows = mergeAll(parts);
  return hamsterBrows;
}

let hamsterMouth = null;
/** 양 끝(입꼬리)이 올라가고 가운데가 뾰족한 윗선. ω보다 넓다 */
function hamsterMouthGeometry() {
  hamsterMouth ??= mouthGeometry(
    [[-28, 277.8], [-21.6, 283.2], [-14.8, 285.5], [-7.4, 280.2], [0, 272.8], [7.4, 280.2], [14.8, 285.5], [21.6, 283.2], [28, 277.8]],
    [283.5, 305, 274],
    [286, 299.5, 285],
    4,
  );
  return hamsterMouth;
}

// ---------- 호빵 모몬가: 인어섬 모몬가(#65)와 같은 캐릭터 ----------

let momongaFace = null;
/**
 * 화난 눈썹, 두 눈 사이 하늘색 코, 입(ω 윗선 + 왼쪽 아래 υ 선 + 오른쪽 짧은 선), 입 양옆 작은 동그라미.
 * 입은 인어섬 모몬가의 사진 좌표(머리 반폭 300px)를 이 얼굴(172px)로 줄여 ω 꼭짓점을 다른 인형의 ω 꼭짓점에 맞춘다.
 */
function momongaFaceGeometry() {
  if (momongaFace) return momongaFace;
  const { px, py, pt } = photoMapper(HEAD, PHOTO);
  const line = (list) => HEAD.faceLine(list.map(([dx, y]) => pt(dx, y)), px(2.4));
  const S = PHOTO.halfWidth / 300;
  const from = (list) => list.map(([dx, y]) => [(dx - 5) * S, 268.75 + (y - 507.5) * S]);
  const upsilon = from([[-44.5, 541], [-42, 566], [-32, 575], [-19.5, 568.5], [-17, 551]]); // ω 바로 아래에 붙인다 (사진보다 14px 위)
  const ink = [
    line(from([[-36, 517.5], [-30, 528], [-20, 535], [-9, 530], [3, 512], [5, 507.5], [7, 512], [19, 530], [30, 535], [40, 528], [45, 517.5]])),
    line(upsilon),
    line(from([[-8, 546], [6, 549], [20.5, 545]])),
  ];
  const white = [];
  for (const sx of [-1, 1]) {
    const [x, y] = pt(sx * 46, 287);
    ink.push(HEAD.faceDisc(x, y, px(7.5), px(7.5), 0.0004));
    white.push(HEAD.faceDisc(x, y, px(4.8), px(4.8), 0.001));
  }
  momongaFace = {
    // 눈 안쪽 위의 짧은 사선 (바깥 위 → 안쪽 아래). 미간이 좁고 눈 바로 위에 붙는다
    brows: mergeAll([-1, 1].map((sx) => line([[sx * 31, 209], [sx * 26, 213], [sx * 21, 217]]))),
    mouth: { ink: mergeAll(ink) },
    white: mergeAll(white),
    nose: HEAD.faceDisc(0, py(249), px(19), px(16), 0.0006),
  };
  return momongaFace;
}

const MOMONGA_EYE = 1.12; // 모몬가는 눈이 조금 더 크다

/** 단위 구를 늘려 만든 도톰한 판. 법선은 늘린 비율로 다시 맞춘다 (구의 이음매가 보이지 않게) */
function stretchedSphere(base, fx) {
  const g = base.clone();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const [x, y, z, sx, sy, sz] = fx(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
    v.set(n.getX(i) / sx, n.getY(i) / sy, n.getZ(i) / sz).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

let momongaEars = null;
/**
 * 모몬가 귀: 위가 조금 넓고 아래가 좁은 둥근 귀. 앞면 바깥쪽에 하늘색 안쪽, 가운데에 접힌 주름(수놓은 선).
 * 귀 좌표 (u: 바깥쪽 +, v: 위 +, -1 ~ 1)에서 만들어 머리 위 양옆으로 옮긴다.
 */
function momongaEarsGeometry() {
  if (momongaEars) return momongaEars;
  const W = 0.0205;
  const H = 0.0225;
  const D = 0.0075;
  const widen = (v) => 1 + 0.12 * v; // 위로 갈수록 넓다
  const frontZ = (u, v) => D * Math.sqrt(Math.max(0, 1 - (u / widen(v)) ** 2 - v ** 2));
  const front = (sx, u, v, lift) => {
    const h = 0.01;
    const n = new THREE.Vector3(
      -(frontZ(u + h, v) - frontZ(u - h, v)) / (2 * h * W) * sx,
      -(frontZ(u, v + h) - frontZ(u, v - h)) / (2 * h * H),
      1,
    ).normalize();
    return { p: new THREE.Vector3(sx * u * W, v * H, frontZ(u, v)).addScaledVector(n, lift), n };
  };
  const outer = [];
  const inner = [];
  const ink = [];
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(sx * 0.042, HEAD_TOP + 0.002, -0.004),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -sx * 0.25, -sx * 0.3)),
      new THREE.Vector3(1, 1, 1),
    );
    outer.push(stretchedSphere(BASE.sphere, (x, y, z) => [x * W * widen(y), y * H, z * D, W * widen(y), H, D]).applyMatrix4(m));
    // 하늘색 안쪽: 앞면 바깥 위쪽
    const c = front(sx, 0.33, 0.12, -0.0002);
    inner.push(placed(BASE.sphere, { pos: c.p.toArray(), scale: [0.42 * W, 0.5 * H, 0.0011], quat: new THREE.Quaternion().setFromUnitVectors(Z, c.n) }).applyMatrix4(m));
    // 접힌 주름: 위에서 아래로 내려오는 선 + 아래쪽에서 바깥으로 갈라지는 짧은 선
    const R = 0.00075;
    const stroke = (list) => {
      const pts = list.map(([u, v]) => front(sx, u, v, 0.0004).p);
      ink.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, R, 6).applyMatrix4(m));
      for (const q of [pts[0], pts.at(-1)]) ink.push(placed(BASE.small, { pos: q.toArray(), scale: [R, R, R] }).applyMatrix4(m));
    };
    stroke([[-0.12, 0.5], [-0.08, 0.2], [-0.02, -0.1], [0.04, -0.35]]);
    stroke([[-0.02, -0.1], [0.2, -0.17], [0.42, -0.2]]);
  }
  momongaEars = { outer: mergeAll(outer), inner: mergeAll(inner), ink: mergeAll(ink) };
  return momongaEars;
}

let momongaTufts = null;
/** 볼 옆 털 뭉치: 머리 양옆에 위아래로 긴 구름 모양 (속 뭉치 + 둘레의 작은 혹, 머리 쪽 혹은 뺀다) */
function momongaTuftsGeometry() {
  if (momongaTufts) return momongaTufts;
  const lump = new THREE.SphereGeometry(1, 12, 8);
  const R = [0.012, 0.025, 0.02];
  const N = 30;
  const parts = [];
  for (const sx of [-1, 1]) {
    const c = [sx * 0.066, 0.013, 0];
    parts.push(placed(BASE.sphere, { pos: c, scale: R }));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const dir = [Math.cos(i * 2.399963) * r, y, Math.sin(i * 2.399963) * r];
      if (dir[0] * sx < -0.3) continue;
      const size = 0.0095 + 0.0007 * ((i * 7) % 5);
      parts.push(placed(lump, { pos: c.map((v, k) => v + dir[k] * R[k] * 0.72), scale: [size, size * 0.9, size] }));
    }
  }
  lump.dispose();
  momongaTufts = mergeAll(parts);
  return momongaTufts;
}

let momongaTail = null;
/** 하늘색 꼬리: 등에 세로로 길게 붙은 납작한 타원. 엉덩이에서 머리 뒤 가운데까지 오고, 위쪽이 등을 따라 조금 뒤로 눕는다 */
function momongaTailGeometry() {
  momongaTail ??= placed(BASE.sphere, { pos: [0, -0.006, -0.035], scale: [0.029, 0.056, 0.02], rot: [-0.15, 0, 0] });
  return momongaTail;
}

/** 호빵: 둥글고 위가 살짝 볼록한 찐빵, 윗면이 보는 쪽으로 조금 기운다 */
function addHoppang(group) {
  const hoppang = new THREE.Group();
  hoppang.position.set(...HOPPANG.pos);
  hoppang.rotation.x = 0.3;
  hoppang.add(
    part(GEO.sphere, HOPPANG_MAT, { scale: [HOPPANG.rx, HOPPANG.ry, HOPPANG.rz] }),
    part(GEO.sphere, HOPPANG_MAT, { pos: [0, HOPPANG.ry - 0.0005, 0], scale: [0.0035, 0.002, 0.0035], shadow: false }),
  );
  group.add(hoppang);
}

// ---------- 인형별 빌더 ----------

/** 호빵 우사기: 긴 귀(안쪽 분홍), 높이 올라간 호 눈썹, 노란 목도리, 두 손으로 쥔 호빵 */
export function buildScarfBunny(group, doll, { fur, sub }) {
  addBase(group, fur, { brows: archedBrowsGeometry() });
  const earY = HEAD_TOP + 0.024; // 아래쪽이 머리에 묻히도록
  for (const sx of [-1, 1]) {
    const tilt = [0, 0, -sx * 0.04];
    group.add(
      part(GEO.capsule, fur, { pos: [sx * 0.0165, earY, -0.004], scale: [0.0165, 0.016, 0.014], rot: tilt }),
      part(GEO.capsule, sub, { pos: [sx * 0.0165, earY - 0.004, 0.0085], scale: [0.0095, 0.012, 0.006], rot: tilt }),
    );
  }
  addScarf(group, BUNNY_MAT);
  addHoppang(group);
}

/** 호빵 하치와레: 파란 머리 무늬와 뾰족한 귀, 다문 입, 파란 목도리, 꼬리 방울, 두 손으로 쥔 호빵 */
export function buildScarfCat(group, doll, { fur, sub }) {
  addBase(group, fur, { mouth: closedMouthGeometry() });
  group.add(hulaMesh(capGeometry(), sub));
  addScarf(group, CAT_MAT);
  group.add(part(GEO.sphere, CAT_MAT.scarf, { pos: [0.008, -0.044, -0.034], scale: [0.014, 0.014, 0.014] }));
  addHoppang(group);
}

/** 호빵 치이카와: 둥근 귀, 물결·호 눈썹, 입꼬리가 올라간 입, 분홍 목도리, 두 손으로 쥔 호빵 */
export function buildScarfHamster(group, doll, { fur }) {
  addBase(group, fur, { brows: hamsterBrowsGeometry(), mouth: hamsterMouthGeometry() });
  for (const sx of [-1, 1]) {
    group.add(part(GEO.sphere, fur, { pos: [sx * 0.036, HEAD_TOP - 0.008, -0.004], scale: [0.0125, 0.0115, 0.0095] }));
  }
  addScarf(group, HAMSTER_MAT);
  addHoppang(group);
}

/** 호빵 모몬가: 모몬가 귀(하늘색 안쪽·주름), 볼 옆 털 뭉치, 등의 하늘색 꼬리, 조금 큰 눈, 화난 눈썹, 하늘색 코, υ 입, 연보라 목도리, 두 손으로 쥔 호빵 */
export function buildScarfMomonga(group, doll, { fur, sub }) {
  const face = momongaFaceGeometry();
  const ears = momongaEarsGeometry();
  addBase(group, fur, { brows: face.brows, mouth: face.mouth, eye: MOMONGA_EYE });
  group.add(
    hulaMesh(ears.outer, fur),
    hulaMesh(ears.inner, sub, false),
    hulaMesh(ears.ink, FACE_MAT.ink, false),
    hulaMesh(momongaTuftsGeometry(), fur),
    hulaMesh(momongaTailGeometry(), sub),
    hulaMesh(face.nose, MOMONGA_MAT.nose, false),
    hulaMesh(face.white, FACE_MAT.white, false),
  );
  addScarf(group, MOMONGA_MAT);
  addHoppang(group);
}
