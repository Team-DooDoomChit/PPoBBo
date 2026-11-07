import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 훌라 고양이(#53)를 만드는 부품과 도구 (머리 모양·얼굴 그리기·치마·화관).
 *
 * 원점 = 몸통 중심, +Y = 위, +Z = 얼굴 정면 (DollFactory와 같다). 단위 m.
 * 머리는 앞모습 실루엣을 돌린 회전체를 앞뒤로 눌러(depth) 만들고, 얼굴·화관은 그 표면에 붙인다.
 */

export const Z = new THREE.Vector3(0, 0, 1);

export const BASE = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  small: new THREE.SphereGeometry(1, 10, 6), // 꽃잎·진주·얼굴 원판처럼 작은 부품용 (정점 수를 줄인다)
  capsule: new THREE.CapsuleGeometry(1, 3, 2, 6), // 높이 5, 반지름 1
};

/** 원본 지오메트리를 복제해 크기·회전·위치를 적용 */
export function placed(geometry, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], quat } = {}) {
  const q = quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  return geometry.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale)));
}

/**
 * 어깨에서 손끝까지 이어지는 둥근 팔 (양 끝이 정확히 두 점에 닿는 타원체).
 * 어깨를 몸통 속에 두면 팔이 몸통에 붙어 떨어져 보이지 않는다.
 * @param {[number, number, number]} shoulder 어깨 (몸통 안쪽)
 * @param {[number, number, number]} hand 손끝
 * @param {number} thick 팔 굵기 (위아래 반지름)
 * @param {number} [flat] 팔 두께 (앞뒤 반지름)
 */
export function limb(shoulder, hand, thick, flat = thick) {
  const s = new THREE.Vector3(...shoulder);
  const h = new THREE.Vector3(...hand);
  const dir = h.clone().sub(s);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
  return placed(BASE.sphere, { pos: s.add(h).multiplyScalar(0.5).toArray(), quat, scale: [dir.length() / 2, thick, flat] });
}

/** 속성 구성을 맞춰 하나로 합친다 (Lathe·Tube 등 모두 index + position/normal/uv) */
export function mergeAll(list) {
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}

/**
 * 머리 모양과 표면 도구.
 * @param {object} spec
 * @param {number} spec.bottom 머리 아래(목) y
 * @param {number} spec.height 머리 키
 * @param {number} spec.halfWidth 최대 반폭
 * @param {number} spec.depth 앞뒤 두께 / 좌우 폭
 * @param {Array<[number, number]>} spec.silhouette [t: 아래에서 위로 0~1, w: 최대 반폭 대비] 앞모습 실루엣
 */
export function createHead({ bottom, height, halfWidth, depth, silhouette }) {
  const profile = [
    [0, bottom - 0.003], // 아래 가운데를 닫는다 (몸통에 가려 보이지 않음)
    ...silhouette.map(([t, w]) => [w * halfWidth, bottom + t * height]),
  ];
  const at = (t) => bottom + t * height; // 머리 높이 비율 → y
  const wx = (w) => w * halfWidth; // 반폭 비율 → x

  /** 머리 높이 y에서의 좌우 반지름 (실루엣 보간) */
  function radius(y) {
    const p = profile;
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
  function point(x, y, lift = 0.0008) {
    const R = radius(y);
    const zAt = (qx, qy) => {
      const r = radius(qy);
      return depth * r * Math.sqrt(Math.max(0, 1 - (qx / r) ** 2));
    };
    const z = depth * R * Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
    const h = 0.0005;
    const dzdx = (zAt(x + h, y) - zAt(x - h, y)) / (2 * h);
    const dzdy = (zAt(x, y + h) - zAt(x, y - h)) / (2 * h);
    const normal = new THREE.Vector3(-dzdx, -dzdy, 1).normalize();
    return { point: new THREE.Vector3(x, y, z).addScaledVector(normal, lift), normal };
  }

  /** 머리 둘레(높이 y, 각도 a: 0 = 정면)의 점과 바깥 법선 */
  function ringPoint(y, a, lift) {
    const R = radius(y);
    const dR = (radius(y + 0.0005) - radius(y - 0.0005)) / 0.001;
    const x = R * Math.sin(a);
    const z = depth * R * Math.cos(a);
    const normal = new THREE.Vector3(x / R ** 2, -dR / R, z / (depth * R) ** 2).normalize();
    return { point: new THREE.Vector3(x, y, z).addScaledVector(normal, lift), normal };
  }

  /** 머리 표면에 붙인 납작한 원판 (눈·볼) */
  function faceDisc(x, y, rx, ry, lift, base = BASE.sphere) {
    const { point: p, normal } = point(x, y, lift);
    return placed(base, { pos: p.toArray(), scale: [rx, ry, 0.0012], quat: new THREE.Quaternion().setFromUnitVectors(Z, normal) });
  }

  /** 머리 표면을 따라가는 가는 선 (눈썹·입) */
  function faceLine(points, lineRadius = 0.0008, lift = 0.0016) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => point(x, y, lift).point));
    return new THREE.TubeGeometry(curve, Math.max(6, points.length * 4), lineRadius, 5, false);
  }

  /** 머리 표면에 붙인 납작한 다각형 (입처럼 원판으로 안 되는 모양). points: 앞면 (x, y) 윤곽 */
  function faceShape(points, lift = 0.0008) {
    const g = new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const { point: p, normal } = point(pos.getX(i), pos.getY(i), lift);
      pos.setXYZ(i, p.x, p.y, p.z);
      nor.setXYZ(i, normal.x, normal.y, normal.z);
    }
    return g;
  }

  /** 머리 회전체 지오메트리 */
  function geometry(segments = 56) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
    g.scale(1, 1, depth);
    return g;
  }

  return { bottom, height, halfWidth, depth, profile, at, wx, radius, point, ringPoint, faceDisc, faceLine, faceShape, geometry };
}

/**
 * 참고 사진 앞모습의 픽셀 좌표 → 머리 앞면 좌표.
 * 가로·세로 모두 같은 비율(사진 머리 반폭 = head.halfWidth)로 옮겨 얼굴 요소 사이 간격을 그대로 지킨다.
 * @param {{ cx: number, halfWidth: number, bottom: number, stretchY?: number }} photo 얼굴 가운데 x, 머리 반폭, 머리 아래 y (px, y는 아래가 +)
 */
export function photoMapper(head, { cx, halfWidth, bottom, stretchY = 1 }) {
  const k = head.halfWidth / halfWidth; // 1px → m
  const px = (dx) => dx * k; // 가로 픽셀(가운데 기준) → m
  const py = (y) => head.bottom + (bottom - y) * k * stretchY; // 세로 픽셀(이미지 y) → m
  return { cx, px, py, pt: (dx, y) => [px(dx), py(y)] };
}

// ---------- 인어섬 시리즈 공통 체형 (호빵 시리즈와 같은 머리·몸 비율) ----------

/** 표준 머리 사진 좌표 (호빵 시리즈·인어섬 하치와레와 같다): 가운데 263px, 반폭 172px, 턱 354.5px, 정수리 92px */
export const STD_PHOTO = { cx: 263, halfWidth: 172, bottom: 354.5, top: 92 };
/** 표준 얼굴: 눈 가운데 ±51px, 높이 241.5px */
export const STD_EYE = { dx: 51, y: 241.5 };

let stdHead = null;
/**
 * 호빵 시리즈와 같은 머리 (반폭 0.061, 앞뒤 두께 0.75, 볼 높이가 가장 넓고 둥근 턱).
 * 인어섬 인형은 모두 이 머리를 써서 머리·얼굴 비율을 호빵 시리즈와 맞춘다.
 */
export function standardHead() {
  if (stdHead) return stdHead;
  const P = STD_PHOTO;
  const K = 0.061 / P.halfWidth;
  const tAt = (y) => (P.bottom - y) / (P.bottom - P.top);
  const widest = tAt(250);
  const silhouette = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const [r, p] = t >= widest ? [1 - widest, 2.3] : [widest, 2.5];
    return [t, Math.max(0, 1 - Math.abs((t - widest) / r) ** p) ** (1 / p)];
  });
  const head = createHead({ bottom: -0.008 - (P.bottom - 342) * K, height: (P.bottom - P.top) * K, halfWidth: 0.061, depth: 0.75, silhouette });
  stdHead = { head, top: head.at(1), tAt, mapper: photoMapper(head, P) };
  return stdHead;
}

/** 호빵 시리즈와 같은 몸: 둥근 몸통 + 치마 아래로 보이는 짧은 두 다리 (발바닥 -0.0685) */
// 머리보다 작은 둥근 몸(반폭 0.039). 위쪽은 머리 아랫부분 속까지 올라와(위 끝 +0.004) 머리와 끊기지 않고 이어지고, 팔은 몸통 맨 위(목 가까이)에서 나온다
export const STD_BODY = { center: -0.029, rx: 0.039, ry: 0.033 };
export function standardBody(depth = 0.75) {
  return [
    placed(BASE.sphere, { pos: [0, STD_BODY.center, 0], scale: [STD_BODY.rx, STD_BODY.ry, STD_BODY.rx * depth] }),
    ...[-1, 1].map((sx) => placed(BASE.sphere, { pos: [sx * 0.0075, -0.0595, 0.002], scale: [0.0072, 0.009, 0.0086] })),
  ];
}

/**
 * 인어섬 풀 치마 표준 치수: 작은 몸의 허리(-0.026)에서 다리 위(-0.055)까지. 짧은 다리가 치마 아래로 조금 보인다.
 * 허리 위로 몸 윗부분이 보여서 원피스가 아니라 치마로 보인다.
 */
export const STD_SKIRT = { waistY: -0.026, hemY: -0.055, topR: 0.041, hemR: 0.049 };

/**
 * 각 인형 사진의 얼굴 좌표(px)를 표준 얼굴로 옮기는 좌표 변환.
 * 두 눈 간격을 표준(±51px)에 맞춰 같은 비율로 줄이고, 눈 높이를 표준 눈 높이(241.5px)에 맞춘다.
 * 그래서 표정(눈·입·눈썹 모양)은 그 인형 그대로이고, 얼굴 비율은 호빵 시리즈와 같아진다.
 * @param {{ dx: number, y: number }} eye 그 인형 사진의 눈 가운데 (얼굴 가운데에서 가로 px, 높이 px)
 */
export function faceFrom(eye) {
  const { px, py } = standardHead().mapper;
  const s = STD_EYE.dx / eye.dx;
  const fpx = (v) => px(v * s);
  const fpy = (y) => py(STD_EYE.y + (y - eye.y) * s);
  return { px: fpx, py: fpy, pt: (dx, y) => [fpx(dx), fpy(y)], scale: s };
}

/**
 * 얼굴 좌표를 얼굴 가운데(anchorY 높이, 가로 가운데) 기준으로 같은 비율로 줄인다.
 * 눈·눈썹·코·입·볼의 위치와 크기, 선 굵기가 모두 함께 줄어 얼굴 생김새는 그대로이고 크기만 작아진다.
 * @param {{ px: (dx: number) => number, py: (y: number) => number }} mapper photoMapper 결과
 * @param {number} scale 크기 배율 (1 = 그대로)
 * @param {number} anchorY 기준 높이 (사진 y px)
 */
export function scaledFace({ px, py }, scale, anchorY) {
  const spx = (v) => px(v * scale);
  const spy = (y) => py(anchorY + (y - anchorY) * scale);
  return { px: spx, py: spy, pt: (dx, y) => [spx(dx), spy(y)] };
}

/**
 * 허리·치마 끝 높이와 반폭으로 풀 치마 치수를 만든다 (buildSkirt에 그대로 넘긴다).
 * 가닥은 허리(topR)에서 치마 끝(hemR)까지 곧게 퍼지고, 안쪽 겹은 조금 안쪽·짧게 둔다.
 * @param {{ waistY: number, hemY: number, topR: number, hemR: number, count?: number, width?: number, waistThick?: number }} spec
 */
export function skirtFrom({ waistY, hemY, topR, hemR, count = 28, width = 0.0042, waistThick = 0.026 }) {
  const length = waistY - hemY;
  const tilt = Math.atan((hemR - topR) / length);
  const height = length / Math.cos(tilt) + 0.002; // 위 끝이 허리띠 속에 조금 묻히게
  return {
    waistY,
    waistR: topR,
    waistThick,
    strandY: (waistY + hemY) / 2,
    front: { count, r: (topR + hemR) / 2 + 0.002, tilt, height, offset: 0, width },
    back: { count, r: (topR + hemR) / 2 - 0.002, tilt: tilt * 0.85, height: height - 0.003, offset: 0.5, width: width * 0.95 },
  };
}

/**
 * 풀 치마: 털실을 모아 묶은 허리띠 + 아래로 늘어지는 가닥 두 겹(앞 겹 · 안쪽 겹).
 * 가닥마다 두 줄을 꼬아 털실 결을 낸다.
 */
export function buildSkirt(head, { waistY, waistR, waistThick, strandY, front, back }) {
  const frontList = [];
  const backList = [];
  // 허리띠: 도넛을 눕혀 앞뒤로 머리처럼 누른다. waistThick는 띠 굵기 배율 (도넛 단면 반지름 0.1 기준)
  frontList.push(placed(new THREE.TorusGeometry(1, 0.1, 8, 64), { pos: [0, waistY, 0], rot: [Math.PI / 2, 0, 0], scale: [waistR, waistR * head.depth, waistThick] }));
  const layer = (list, { count, r, tilt, height, offset, width }) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2;
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      for (const side of [-1, 1]) {
        const q = qy.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, side * 0.14)));
        const local = new THREE.Vector3(side * 0.002, strandY, r).applyQuaternion(qy);
        local.z *= head.depth;
        list.push(placed(BASE.capsule, { pos: local.toArray(), quat: q, scale: [width, height / 5, 0.0034] }));
      }
    }
  };
  layer(frontList, front);
  layer(backList, back);
  backList.push(skirtLining(head.depth, { strandY, back }));
  return { front: mergeAll(frontList), back: mergeAll(backList) };
}

/**
 * 치마 속 몸 아랫부분: 허리에서 치마 끝 바로 위까지 이어지는 둥근 몸 (몸 색으로 칠한다).
 * 치마 속이 비어 보이지 않고, 아래에서 봐도 몸 아래쪽과 발이 보이게 한다.
 * @param {number} depth 앞뒤 두께 / 좌우 폭 (가닥과 같은 값)
 * @param {{ waistY: number, strandY: number, back: { r: number, tilt: number, height: number } }} skirt 치마 치수
 */
export function skirtHips(depth, { waistY, strandY, back: { r, tilt, height } }) {
  const bottom = strandY - Math.cos(tilt) * height / 2 + 0.004;
  const center = (waistY + bottom) / 2;
  const radius = r + (strandY - center) * Math.tan(tilt) - 0.006; // 가운데 높이에서 안감보다 4mm 안쪽
  return placed(BASE.sphere, { pos: [0, center, 0], scale: [radius, (waistY - bottom) / 2, radius * depth] });
}

/**
 * 치마 안감: 안쪽 가닥 바로 안에 두른 원뿔대 (허리 → 치마 끝 조금 위).
 * 가닥 사이 틈과 치마 속이 비어 보이지 않게 막는다. 안·밖 어느 쪽에서 봐도 보이도록 양면으로 만든다.
 * @param {number} depth 앞뒤 두께 / 좌우 폭 (가닥과 같은 값)
 * @param {{ strandY: number, back: { r: number, tilt: number, height: number } }} skirt 안쪽 가닥 치수
 */
export function skirtLining(depth, { strandY, back: { r, tilt, height } }) {
  const half = height / 2;
  const top = strandY + Math.cos(tilt) * half;
  const bottom = strandY - Math.cos(tilt) * half + 0.003; // 치마 끝 아래로 비치지 않게 조금 위에서 끝낸다
  const radiusAt = (y) => r + (strandY - y) * Math.tan(tilt) - 0.002; // 가닥보다 2mm 안쪽
  const outer = new THREE.CylinderGeometry(radiusAt(top), radiusAt(bottom), top - bottom, 64, 1, true);
  outer.translate(0, (top + bottom) / 2, 0);
  outer.scale(1, 1, depth);
  // 안쪽 면: 같은 면을 뒤집어(삼각형 순서·법선 반대) 붙인다
  const inner = outer.clone();
  const idx = inner.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const n = inner.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return mergeAll([outer, inner]);
}

/** 꽃 화관: 머리 둘레(높이 비율 t)에 꽃잎 5장 + 가운데 진주인 꽃을 고르게 두른다 */
export function buildCrown(head, { t, count, petalOffset, petalSize, petalThickness, pearlSize, lift, pearlLift, outward = 0.45, twistStep = 0.7 }) {
  const petals = [];
  const pearls = [];
  const ringY = head.at(t);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const { point, normal: surface } = head.ringPoint(ringY, a, lift);
    // 머리 표면 법선은 거의 위를 향해 꽃이 누워 보이므로, 바깥쪽으로 기울여 앞에서 꽃 모양이 보이게 한다
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const normal = surface.clone().add(out.multiplyScalar(outward)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Z, normal);
    const twist = new THREE.Quaternion().setFromAxisAngle(Z, i * twistStep); // 꽃마다 꽃잎 방향을 조금씩 다르게
    for (let k = 0; k < 5; k++) {
      const s = (k / 5) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(s) * petalOffset, Math.sin(s) * petalOffset, 0).applyQuaternion(twist).applyQuaternion(q);
      petals.push(placed(BASE.small, { pos: point.clone().add(offset).toArray(), quat: q, scale: [petalSize, petalSize, petalThickness] }));
    }
    pearls.push(placed(BASE.small, { pos: point.clone().addScaledVector(normal, pearlLift).toArray(), scale: [pearlSize, pearlSize, pearlSize] }));
  }
  return { petals: mergeAll(petals), pearls: mergeAll(pearls) };
}

/** 메시 하나 (그림자 설정 포함) */
export function hulaMesh(geometry, material, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
