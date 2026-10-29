import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel, peekModel } from './ModelLoader.js';

/**
 * 인형 3D 모델(절차적) 생성.
 * 원점 = 몸통 중심, +Y = 머리 방향, +Z = 얼굴 정면.
 * 물리 충돌체(DOLL_SHAPE)와 크기를 맞춘다.
 */
export const DOLL_SHAPE = {
  bodyRadius: 0.065,
  headRadius: 0.055,
  headOffsetY: 0.09,
};

const geo = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  cone: new THREE.ConeGeometry(1, 1, 16),
  capsule: new THREE.CapsuleGeometry(1, 3, 8, 16), // 높이 5, 반지름 1
  box: new THREE.BoxGeometry(1, 1, 1),
  link: new THREE.TorusGeometry(1, 0.32, 6, 12), // 체인 고리
  ring: new THREE.TorusGeometry(1, 0.3, 8, 24),
  strand: new THREE.CylinderGeometry(1, 1, 1, 6),
  disc: new THREE.CylinderGeometry(1, 1, 1, 24),
  // 위·아래 반구: 높이를 따로 늘려 달걀형(아래가 긴) 머리를 만든다
  domeTop: new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  domeBottom: new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
};

const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

// 목도리 토끼의 색이 고정된 부품 머티리얼 (모든 인스턴스가 공유)
const KEYCHAIN_MAT = {
  scarf: new THREE.MeshStandardMaterial({ color: 0xe6bd45, roughness: 0.95 }),
  fringe: new THREE.MeshStandardMaterial({ color: 0xf2db74, roughness: 0.9 }),
  rice: new THREE.MeshStandardMaterial({ color: 0xfbf9f4, roughness: 0.75 }),
  chain: new THREE.MeshStandardMaterial({ color: 0xd8d09c, roughness: 0.35, metalness: 0.8 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xf4a6b6, roughness: 0.9 }),
  shine: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.4 }),
};

// 목도리 고양이 전용 공유 머티리얼 (볼·눈·선은 KEYCHAIN_MAT을 같이 쓴다)
const CAT_MAT = {
  scarf: new THREE.MeshStandardMaterial({ color: 0x7f9fe0, roughness: 0.95 }),
  fringe: new THREE.MeshStandardMaterial({ color: 0x92afea, roughness: 0.9 }),
  innerEar: new THREE.MeshStandardMaterial({ color: 0xa9c1f2, roughness: 0.9 }),
  chain: new THREE.MeshStandardMaterial({ color: 0xa9b9c6, roughness: 0.35, metalness: 0.8 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xf3e3c6, roughness: 0.8 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xe2b85a, roughness: 0.6 }),
};

// 목도리 햄스터 전용 공유 머티리얼
const HAMSTER_MAT = {
  scarf: new THREE.MeshStandardMaterial({ color: 0xe88ba0, roughness: 0.95 }),
  fringe: new THREE.MeshStandardMaterial({ color: 0xef9fb2, roughness: 0.9 }),
  bun: new THREE.MeshStandardMaterial({ color: 0xf5efd9, roughness: 0.85 }),
};

/** 인형 하나가 만든(공유하지 않는) 머티리얼 표시. disposeDollMesh는 표시된 것만 해제한다. */
const owned = (material) => {
  material.userData.ownedByDoll = true;
  return material;
};

function part(geometry, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  mesh.castShadow = shadow; // 아주 작은 부품은 그림자를 만들지 않는다
  mesh.receiveShadow = true;
  return mesh;
}

const s = (r) => [r, r, r];

// ---------- 목도리 토끼 얼굴: 머리(타원체) 표면에 붙여 그리는 선·점 ----------

const KB_HEAD = { y: 0.07, rx: 0.062, ry: 0.058, rz: 0.056 };
const KB_EYE_Y = 0.066;

/** 머리(타원체) 앞면의 (x, y) 지점 → 표면 위 점(lift만큼 띄움)과 바깥 법선 */
function headSurface(x, y, lift = 0.0012, head = KB_HEAD) {
  // 아래쪽 높이(ryBottom)가 따로 있는 머리는 중심보다 아래에서 그 값을 쓴다
  const ry = y < head.y && head.ryBottom ? head.ryBottom : head.ry;
  const nx = x / head.rx;
  const ny = (y - head.y) / ry;
  const z = head.rz * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const normal = new THREE.Vector3(x / head.rx ** 2, (y - head.y) / ry ** 2, z / head.rz ** 2).normalize();
  return { point: new THREE.Vector3(x, y, z).addScaledVector(normal, lift), normal };
}

/** 표면을 따라가는 선 지오메트리 (양 끝은 작은 구로 둥글게) */
function surfaceLine(points, radius, lift = 0.0012, head = KB_HEAD) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => headSurface(x, y, lift, head).point));
  const caps = [curve.getPoint(0), curve.getPoint(1)].map((p) =>
    new THREE.SphereGeometry(radius, 8, 6).translate(p.x, p.y, p.z),
  );
  return [new THREE.TubeGeometry(curve, 32, radius, 6, false), ...caps];
}

const arc = (cx, cy, r, from, to, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

let kbFaceLines = null;
/** 눈썹·볼 빗금·입 선을 지오메트리 하나로 합친다. 모든 목도리 토끼가 같으므로 한 번만 만든다. */
function keychainFaceLines() {
  if (kbFaceLines) return kbFaceLines;
  const lines = [];
  for (const sx of [-1, 1]) {
    // 눈썹: 눈 위로 높이, 안쪽 위에서 바깥 아래로 휘는 두꺼운 호
    const brow = arc(-0.018, KB_EYE_Y + 0.008, 0.024, (80 * Math.PI) / 180, (172 * Math.PI) / 180);
    lines.push(...surfaceLine(brow.map(([x, y]) => [x * -sx, y]), 0.0017));
    // 볼 빗금 ////
    for (const dx of [-0.0057, -0.0019, 0.0019, 0.0057]) {
      const cx = sx * 0.037 + dx;
      const cy = KB_EYE_Y - 0.012;
      // 볼터치 위에 보이도록 더 띄운다
      lines.push(...surfaceLine([[cx - 0.0016, cy - 0.0036], [cx + 0.0016, cy + 0.0036]], 0.0008, 0.0026));
    }
  }
  // 입: 작은 ω, 오른쪽 끝이 살짝 올라감
  const my = KB_EYE_Y - 0.011;
  lines.push(
    ...surfaceLine(
      [
        [-0.0085, my + 0.0022],
        [-0.0068, my - 0.0012],
        [-0.0042, my - 0.0024],
        [-0.0018, my - 0.0008],
        [-0.0004, my + 0.0012],
        [0.0012, my - 0.0008],
        [0.0038, my - 0.0024],
        [0.0062, my - 0.0012],
        [0.0074, my + 0.0012],
        [0.0084, my + 0.0036],
      ],
      0.0011,
    ),
  );
  kbFaceLines = mergeGeometries(lines.map((g) => g.toNonIndexed()));
  lines.forEach((g) => g.dispose());
  return kbFaceLines;
}

// ---------- 목도리 고양이: 머리 무늬(모자)와 얼굴 선. 머리 타원체는 목도리 토끼와 같다 ----------

// 고양이 눈 높이: 머리 위쪽에 가깝게 (참고 이미지 비율: 정수리 → 눈 = 머리 반폭의 0.78배)
const KC_EYE_Y = 0.08;

// 머리 무늬 아래 경계: [정면에서 돈 각도 |φ|, 경계 높이(머리 타원체 정규화 y)]. 참고 이미지에서 잰 값.
// 정면은 5:5 가르마: 양쪽 파란 머리가 정확히 가운데(φ = 0)에서 만나 흰 이마가 끝이 뾰족한 아치가 되고,
// 아치 양옆은 눈썹 위 높이에서 수평으로 옆머리까지 이어진다.
// 뒤쪽은 가운데가 살짝 올라가 양옆 두 덩어리로 갈라진다.
const CAP_EDGE = [
  [0, 0.693], [0.21, 0.629], [0.344, 0.555], [0.446, 0.484], [0.62, 0.47], [0.91, 0.464],
  [1.57, 0.44], [2.4, 0.37], [2.89, 0.32], [Math.PI, 0.39],
];

/** 경계 곡선의 기울기 (가르마 꼭짓점은 한쪽 기울기라 뾰족하고, 맨 뒤는 좌우 대칭이라 0) */
function capSlope(i) {
  if (i === 0) return (CAP_EDGE[1][1] - CAP_EDGE[0][1]) / CAP_EDGE[1][0];
  if (i === CAP_EDGE.length - 1) return 0;
  return (CAP_EDGE[i + 1][1] - CAP_EDGE[i - 1][1]) / (CAP_EDGE[i + 1][0] - CAP_EDGE[i - 1][0]);
}

function capEdge(phi) {
  const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
  for (let i = 1; i < CAP_EDGE.length; i++) {
    const [p0, y0] = CAP_EDGE[i - 1];
    const [p1, y1] = CAP_EDGE[i];
    if (a > p1) continue;
    const u = (a - p0) / (p1 - p0);
    // 점 사이는 기울기를 이어 주는 3차 곡선(Catmull-Rom)으로 부드럽게 잇는다
    const h = p1 - p0;
    const m0 = capSlope(i - 1) * h;
    const m1 = capSlope(i) * h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
  }
  return CAP_EDGE.at(-1)[1];
}

/** 머리 타원체를 scale배 한 표면 위의 점 (θ: 위에서 내려온 각, φ: 정면에서 돈 각) */
const headPoint = (theta, phi, scale) =>
  new THREE.Vector3(
    KB_HEAD.rx * scale * Math.sin(theta) * Math.sin(phi),
    KB_HEAD.y + KB_HEAD.ry * scale * Math.cos(theta),
    KB_HEAD.rz * scale * Math.sin(theta) * Math.cos(phi),
  );

let kcCap = null;
/** 정수리부터 경계까지 덮는 파란 무늬 + 경계를 따라 도톰한 테두리 (모든 고양이 공용) */
function keychainCatCap() {
  if (kcCap) return kcCap;
  const COLS = 72;
  const ROWS = 14;
  const SCALE = 1.03;
  const positions = [];
  const normals = [];
  const index = [];
  for (let c = 0; c <= COLS; c++) {
    const phi = Math.PI + (c / COLS) * Math.PI * 2; // 이음매는 뒤쪽에
    const edge = Math.acos(capEdge(phi));
    for (let r = 0; r <= ROWS; r++) {
      const p = headPoint((edge * r) / ROWS, phi, SCALE);
      positions.push(...p.toArray());
      // 타원체 법선 (기울기 방향)
      normals.push(
        ...new THREE.Vector3(p.x / KB_HEAD.rx ** 2, (p.y - KB_HEAD.y) / KB_HEAD.ry ** 2, p.z / KB_HEAD.rz ** 2).normalize().toArray(),
      );
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const a = c * (ROWS + 1) + r;
      const b = a + ROWS + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  shell.setIndex(index);

  const rimPoints = Array.from({ length: COLS }, (_, c) => {
    const phi = (c / COLS) * Math.PI * 2;
    return headPoint(Math.acos(capEdge(phi)), phi, 1.02);
  });
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints, true), 144, 0.0019, 8, true);
  rim.deleteAttribute('uv');

  kcCap = mergeGeometries([shell.toNonIndexed(), rim.toNonIndexed()]);
  shell.dispose();
  rim.dispose();
  return kcCap;
}

let kcFaceLines = null;
/** 고양이 눈썹·볼 빗금·입·턱 선 (하나로 합침) */
function keychainCatFaceLines() {
  if (kcFaceLines) return kcFaceLines;
  const lines = [];
  for (const sx of [-1, 1]) {
    // 눈썹: 눈 바로 위의 짧은 선
    lines.push(...surfaceLine([[sx * 0.0225, KC_EYE_Y + 0.0127], [sx * 0.0168, KC_EYE_Y + 0.0123]], 0.0013));
    // 볼 빗금 ////
    for (const dx of [-0.0051, -0.0017, 0.0017, 0.0051]) {
      const cx = sx * 0.035 + dx;
      const cy = KC_EYE_Y - 0.011;
      lines.push(...surfaceLine([[cx - 0.001, cy - 0.0032], [cx + 0.001, cy + 0.0032]], 0.0008, 0.0026));
    }
  }
  // 눈동자: 흰자 아래쪽의 ◡ 모양 굵은 선
  for (const sx of [-1, 1]) {
    const ex = sx * 0.0188;
    lines.push(...surfaceLine(arc(ex, KC_EYE_Y + 0.0004, 0.0032, (-160 * Math.PI) / 180, (-20 * Math.PI) / 180, 8), 0.0014, 0.0026));
  }
  // 입: 양끝이 위로 말려 올라간 고양이 입
  const my = KC_EYE_Y - 0.0135;
  const half = [
    [0.0086, my + 0.0034],
    [0.0092, my + 0.0008],
    [0.0076, my - 0.0022],
    [0.0046, my - 0.003],
    [0.0018, my - 0.0016],
  ];
  const mouth = [...half.map(([x, y]) => [-x, y]), [0, my + 0.0012], ...[...half].reverse()];
  lines.push(...surfaceLine(mouth, 0.0011));
  // 입 아래 짧은 턱 선
  lines.push(...surfaceLine([[-0.0029, KC_EYE_Y - 0.0205], [0.0029, KC_EYE_Y - 0.0205]], 0.001));
  kcFaceLines = mergeGeometries(lines.map((g) => g.toNonIndexed()));
  lines.forEach((g) => g.dispose());
  return kcFaceLines;
}

// ---------- 목도리 햄스터: 넓적한 찹쌀떡형 머리. 치수는 참고 이미지(정면)에서 잰 값 ----------

// 가장 넓은 곳(볼 높이)이 중심. 위는 납작하고 아래는 길게 내려와 목도리 위까지 넓은 폭을 유지한다.
// 머리·귀·얼굴·목도리는 이 치수로 만들고, 그룹째 줄이고 옮겨서 다른 키링 인형과 머리 폭·목 높이를 맞춘다.
const KH_HEAD = { y: 0.036, rx: 0.078, ry: 0.062, ryBottom: 0.082, rz: 0.068 };
const KH_SCALE = KB_HEAD.rx / KH_HEAD.rx; // 머리 폭을 목도리 토끼·고양이와 같게
const KH_CENTER_Y = 0.057; // 줄인 머리의 중심 높이: 목도리가 다른 키링 인형과 같은 목 높이(0.022)에 온다
const KH_EYE_Y = KH_HEAD.y + 0.0078;
const KH_EYE_X = 0.0263;

let khFaceLines = null;
/** 햄스터 얼굴 선: 검은 선(눈썹·볼 빗금·입)과 흰 선(눈 아래 초승달)을 각각 하나로 합친다 */
function keychainHamsterFaceLines() {
  if (khFaceLines) return khFaceLines;
  const E = KH_EYE_Y;
  const line = (points, radius, lift = 0.0012) => surfaceLine(points, radius, lift, KH_HEAD);
  const ink = [];
  const shine = [];
  // 눈썹: 왼쪽은 물결(~), 오른쪽은 위로 볼록한 호
  ink.push(
    ...line([[-0.0341, E + 0.0218], [-0.0316, E + 0.0242], [-0.0285, E + 0.0234], [-0.0254, E + 0.0215], [-0.0224, E + 0.022], [-0.0199, E + 0.024]], 0.0013),
    ...line([[0.0172, E + 0.023], [0.0211, E + 0.0249], [0.0259, E + 0.0253], [0.0298, E + 0.0242], [0.0328, E + 0.0224]], 0.0013),
  );
  for (const sx of [-1, 1]) {
    // 볼 빗금 ||||
    for (const dx of [-0.0075, -0.0025, 0.0025, 0.0075]) {
      const cx = sx * 0.047 + dx;
      const cy = E - 0.0135;
      ink.push(...line([[cx - 0.0008, cy - 0.0045], [cx + 0.0008, cy + 0.0045]], 0.001, 0.0026));
    }
    // 눈 아래쪽 흰 초승달 (◡)
    shine.push(...line(arc(sx * KH_EYE_X, E - 0.0005, 0.0045, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180, 8), 0.0009, 0.0024));
  }
  // 입: 윗선은 양끝이 올라가고 가운데가 뾰족한 ^ 모양, 아랫선은 바닥이 평평한 U
  ink.push(
    ...line([[-0.0125, E - 0.0162], [-0.0096, E - 0.0185], [-0.0066, E - 0.0195], [-0.0033, E - 0.0172], [0, E - 0.014], [0.0033, E - 0.0172], [0.0066, E - 0.0195], [0.0096, E - 0.0185], [0.0125, E - 0.0162]], 0.0015),
    ...line([[-0.0062, E - 0.0196], [-0.0058, E - 0.0225], [-0.0047, E - 0.0268], [-0.0026, E - 0.0287], [0, E - 0.029], [0.0026, E - 0.0287], [0.0047, E - 0.0268], [0.0058, E - 0.0225], [0.0062, E - 0.0196]], 0.0013),
  );
  const merge = (lines) => {
    const merged = mergeGeometries(lines.map((g) => g.toNonIndexed()));
    lines.forEach((g) => g.dispose());
    return merged;
  };
  khFaceLines = { ink: merge(ink), shine: merge(shine) };
  return khFaceLines;
}

/**
 * 니트 목도리 + 한쪽으로 늘어진 끝자락과 술 (목도리 인형 공용).
 * size: 둘레·끝자락 크기 배율, band: 밴드 높이 배율, depth: 앞뒤 폭 배율 (머리가 얕은 인형용)
 */
function addScarf(group, { scarf, fringe }, neckY, { size = 1, band = 1, depth = 1 } = {}) {
  const r = 0.045 * size;
  const rz = r * depth; // 눕힌 토러스의 로컬 y가 앞뒤 방향
  // (토러스를 눕히면 로컬 z 스케일이 밴드 높이가 된다)
  group.add(part(geo.ring, scarf, { pos: [0, neckY, 0.002], scale: [r, rz, 0.065 * band], rot: [Math.PI / 2, 0, 0] }));
  // 니트 결: 밴드 표면에서 살짝만 튀어나온 가는 줄
  for (const dy of [-0.012, -0.004, 0.004, 0.012]) {
    group.add(part(geo.ring, scarf, { pos: [0, neckY + dy * band, 0.002], scale: [r + 0.0002, rz + 0.0002, 0.007 * band], rot: [Math.PI / 2, 0, 0], shadow: false }));
  }
  // 앞쪽(보는 사람 기준 왼쪽)으로 늘어진 끝자락 + 술
  const tail = new THREE.Group();
  tail.scale.setScalar(size);
  tail.position.set(-0.034 * size, neckY - 0.004, 0.036 * size * depth);
  tail.rotation.set(0.15, -0.5, 0.45);
  tail.add(part(geo.box, scarf, { pos: [0, -0.026, 0], scale: [0.024, 0.052, 0.009] }));
  for (let i = 0; i < 7; i++) {
    const x = -0.0105 + i * 0.0035;
    tail.add(part(geo.strand, fringe, { pos: [x, -0.061, 0], scale: [0.0015, 0.02, 0.0015], rot: [0, 0, (i - 3) * 0.06], shadow: false }));
  }
  group.add(tail);
}

/**
 * 정수리 고리에서 위로 늘어진 볼체인 (목도리 고양이·햄스터 공용, 크기가 같다).
 * crownY: 고리가 붙는 정수리 표면 높이. 고리 높이 = crownY + 0.004, 맨 위 막대 = 고리 + 0.08
 */
function addCrownChain(group, material, crownY) {
  const hookY = crownY + 0.004;
  group.add(part(geo.link, material, { pos: [0, hookY, 0], scale: s(0.0042), shadow: false }));
  const baseY = hookY + 0.005;
  const topY = baseY + 0.072;
  const LINKS = 16;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < LINKS; i++) {
      const t = (i + 0.5) / LINKS;
      // 아래는 한 점에서 모이고 위로 갈수록 벌어진다
      const x = sx * 0.011 * Math.sin((t * Math.PI) / 2);
      group.add(
        part(geo.link, material, {
          pos: [x, THREE.MathUtils.lerp(baseY, topY, t), 0],
          scale: s(0.0022),
          rot: [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2],
          shadow: false,
        }),
      );
    }
  }
  group.add(part(geo.capsule, material, { pos: [0, topY + 0.003, 0], scale: [0.0032, 0.0055, 0.0032], rot: [0, 0, Math.PI / 2] }));
}

/** 표면에 납작하게 붙는 타원 (+Z를 법선 방향으로 돌린다) */
function surfaceDot(material, x, y, scale, lift, head = KB_HEAD) {
  const { point, normal } = headSurface(x, y, lift, head);
  const mesh = part(geo.sphere, material, { pos: point.toArray(), scale, shadow: false });
  mesh.lookAt(point.clone().add(normal));
  return mesh;
}

function createMaterials(doll) {
  const fur = owned(new THREE.MeshStandardMaterial({
    color: doll.color,
    roughness: 0.85,
    emissive: doll.glow ? doll.color : 0x000000,
    emissiveIntensity: doll.glow ? 0.35 : 0,
  }));
  const sub = owned(new THREE.MeshStandardMaterial({ color: doll.sub, roughness: 0.8 }));
  return { fur, sub };
}

function addFace(group, { headY, headR, muzzle }) {
  const eyeZ = headR * 0.88;
  group.add(
    part(geo.sphere, black, { pos: [-0.02, headY + 0.012, eyeZ], scale: s(0.008) }),
    part(geo.sphere, black, { pos: [0.02, headY + 0.012, eyeZ], scale: s(0.008) }),
  );
  if (muzzle) {
    group.add(part(geo.sphere, muzzle, { pos: [0, headY - 0.012, headR * 0.82], scale: [0.024, 0.018, 0.016] }));
    group.add(part(geo.sphere, black, { pos: [0, headY - 0.005, headR * 0.82 + 0.015], scale: s(0.007) }));
  }
}

const builders = {
  bear(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br * 0.95, br * 0.9] }),
      part(geo.sphere, sub, { pos: [0, -0.005, br * 0.62], scale: [0.04, 0.045, 0.025] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.sphere, fur, { pos: [-0.04, hy + 0.04, 0], scale: s(0.02) }),
      part(geo.sphere, fur, { pos: [0.04, hy + 0.04, 0], scale: s(0.02) }),
      // 팔다리
      part(geo.sphere, fur, { pos: [-0.06, 0.01, 0.02], scale: [0.02, 0.032, 0.02] }),
      part(geo.sphere, fur, { pos: [0.06, 0.01, 0.02], scale: [0.02, 0.032, 0.02] }),
      part(geo.sphere, fur, { pos: [-0.032, -0.055, 0.03], scale: s(0.024) }),
      part(geo.sphere, fur, { pos: [0.032, -0.055, 0.03], scale: s(0.024) }),
    );
    addFace(group, { headY: hy, headR: hr, muzzle: sub });
  },

  bunny(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br, br * 0.9] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.sphere, fur, { pos: [-0.022, hy + 0.075, 0], scale: [0.016, 0.045, 0.012], rot: [0, 0, 0.15] }),
      part(geo.sphere, fur, { pos: [0.022, hy + 0.075, 0], scale: [0.016, 0.045, 0.012], rot: [0, 0, -0.15] }),
      part(geo.sphere, sub, { pos: [-0.022, hy + 0.075, 0.007], scale: [0.009, 0.034, 0.008], rot: [0, 0, 0.15] }),
      part(geo.sphere, sub, { pos: [0.022, hy + 0.075, 0.007], scale: [0.009, 0.034, 0.008], rot: [0, 0, -0.15] }),
      part(geo.sphere, fur, { pos: [-0.03, -0.055, 0.03], scale: [0.024, 0.018, 0.032] }),
      part(geo.sphere, fur, { pos: [0.03, -0.055, 0.03], scale: [0.024, 0.018, 0.032] }),
      part(geo.sphere, sub, { pos: [0, -0.01, -br * 0.9], scale: s(0.02) }),
    );
    addFace(group, { headY: hy, headR: hr });
    group.add(part(geo.sphere, sub, { pos: [0, hy - 0.008, hr * 0.92], scale: s(0.007) }));
  },

  chick(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br * 1.05, br, br] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: s(hr) }),
      part(geo.cone, sub, { pos: [0, hy - 0.008, hr + 0.008], scale: [0.012, 0.022, 0.012], rot: [Math.PI / 2, 0, 0] }),
      part(geo.sphere, fur, { pos: [-0.066, 0.01, 0], scale: [0.012, 0.035, 0.028], rot: [0, 0, 0.4] }),
      part(geo.sphere, fur, { pos: [0.066, 0.01, 0], scale: [0.012, 0.035, 0.028], rot: [0, 0, -0.4] }),
      part(geo.cone, fur, { pos: [0, hy + hr + 0.008, 0], scale: [0.012, 0.025, 0.012] }),
      part(geo.sphere, sub, { pos: [-0.025, -0.065, 0.02], scale: [0.016, 0.008, 0.024] }),
      part(geo.sphere, sub, { pos: [0.025, -0.065, 0.02], scale: [0.016, 0.008, 0.024] }),
    );
    addFace(group, { headY: hy + 0.006, headR: hr });
  },

  cat(group, doll, { fur, sub }) {
    const { bodyRadius: br, headRadius: hr, headOffsetY: hy } = DOLL_SHAPE;
    group.add(
      part(geo.sphere, fur, { scale: [br, br * 0.95, br * 0.9] }),
      part(geo.sphere, fur, { pos: [0, hy, 0], scale: [hr * 1.08, hr, hr] }),
      part(geo.cone, fur, { pos: [-0.032, hy + 0.05, 0], scale: [0.02, 0.035, 0.016], rot: [0, 0, 0.3] }),
      part(geo.cone, fur, { pos: [0.032, hy + 0.05, 0], scale: [0.02, 0.035, 0.016], rot: [0, 0, -0.3] }),
      part(geo.sphere, fur, { pos: [0, -0.02, -0.07], scale: [0.012, 0.012, 0.045], rot: [0.6, 0, 0] }),
      part(geo.sphere, fur, { pos: [-0.032, -0.055, 0.03], scale: s(0.022) }),
      part(geo.sphere, fur, { pos: [0.032, -0.055, 0.03], scale: s(0.022) }),
    );
    // 노란 눈
    group.add(
      part(geo.sphere, sub, { pos: [-0.02, hy + 0.01, hr * 0.86], scale: [0.011, 0.013, 0.006] }),
      part(geo.sphere, sub, { pos: [0.02, hy + 0.01, hr * 0.86], scale: [0.011, 0.013, 0.006] }),
      part(geo.sphere, black, { pos: [-0.02, hy + 0.01, hr * 0.86 + 0.005], scale: [0.004, 0.01, 0.003] }),
      part(geo.sphere, black, { pos: [0.02, hy + 0.01, hr * 0.86 + 0.005], scale: [0.004, 0.01, 0.003] }),
    );
  },

  /**
   * 키링 토끼: 큰 머리와 몸이 이어진 달걀형, 서로 붙은 긴 귀, 귀 끝의 볼체인,
   * 노란 니트 목도리(한쪽으로 늘어진 술 장식), 품에 안은 주먹밥.
   */
  keychainBunny(group, doll, { fur, sub }) {
    const mat = KEYCHAIN_MAT;
    const headY = 0.07;

    // 머리 + 몸 (하나로 이어진 달걀형)
    group.add(
      part(geo.sphere, fur, { pos: [0, headY, 0], scale: [0.062, 0.058, 0.056] }),
      part(geo.sphere, fur, { pos: [0, -0.008, 0.002], scale: [0.05, 0.05, 0.046] }),
    );

    // 귀: 위로 곧게 서서 서로 붙어 있고, 앞쪽 안은 분홍
    const earY = headY + 0.084; // 아래쪽이 머리에 묻히도록
    for (const sx of [-1, 1]) {
      const tilt = [0, 0, -sx * 0.04];
      group.add(
        part(geo.capsule, fur, { pos: [sx * 0.0165, earY, -0.004], scale: [0.0165, 0.016, 0.014], rot: tilt }),
        part(geo.capsule, sub, { pos: [sx * 0.0165, earY - 0.004, 0.0085], scale: [0.0095, 0.012, 0.006], rot: tilt }),
      );
    }

    // 볼체인: 귀 끝 두 곳에서 위쪽 고리로
    const tipY = earY + 0.04;
    const topY = tipY + 0.05;
    const LINKS = 9;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < LINKS; i++) {
        const t = (i + 0.5) / LINKS;
        const x = sx * THREE.MathUtils.lerp(0.0165, 0.011, t);
        group.add(
          part(geo.link, mat.chain, {
            pos: [x, THREE.MathUtils.lerp(tipY, topY, t), -0.004],
            scale: s(0.0028),
            rot: [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2],
            shadow: false,
          }),
        );
      }
    }
    // 체인 위쪽 막대형 고리
    group.add(part(geo.capsule, mat.chain, { pos: [0, topY + 0.003, -0.004], scale: [0.0032, 0.0055, 0.0032], rot: [0, 0, Math.PI / 2] }));

    // 목도리: 머리와 몸 사이를 감싸는 니트 + 결
    addScarf(group, mat, 0.02);

    // 팔, 발
    for (const sx of [-1, 1]) {
      group.add(
        part(geo.sphere, fur, { pos: [sx * 0.046, 0.002, 0.026], scale: [0.016, 0.013, 0.016] }),
        part(geo.sphere, fur, { pos: [sx * 0.022, -0.056, 0.012], scale: [0.018, 0.014, 0.02] }),
      );
    }

    // 주먹밥 (아래가 넓은 둥근 삼각형)
    const rice = new THREE.Group();
    rice.position.set(0, 0.01, 0.062); // 목도리 앞으로 안고 있음
    rice.rotation.x = -0.2;
    rice.add(
      part(geo.sphere, mat.rice, { pos: [0, 0, 0], scale: [0.032, 0.026, 0.018] }),
      part(geo.sphere, mat.rice, { pos: [0, 0.017, -0.001], scale: [0.02, 0.02, 0.015] }),
      // 앞면 가운데 작은 돌기
      part(geo.sphere, mat.rice, { pos: [0, 0.006, 0.0172], scale: [0.0032, 0.0042, 0.0028], shadow: false }),
    );
    group.add(rice);

    // 얼굴: 높이 올라간 눈썹, 아래쪽 흰 초승달이 있는 눈, 빗금 볼터치, ω 입
    for (const sx of [-1, 1]) {
      const ex = sx * 0.0178;
      group.add(
        surfaceDot(mat.ink, ex, KB_EYE_Y, [0.0073, 0.0079, 0.0022], 0.0006), // 눈 (검은 테두리)
        surfaceDot(mat.shine, ex, KB_EYE_Y - 0.0012, [0.0054, 0.0052, 0.0016], 0.0013), // 흰 초승달
        surfaceDot(mat.ink, ex, KB_EYE_Y + 0.0014, [0.0041, 0.0037, 0.0016], 0.0019), // 눈동자
        surfaceDot(mat.blush, sx * 0.037, KB_EYE_Y - 0.012, [0.0115, 0.0078, 0.0016], 0.0004), // 볼
      );
    }
    group.add(part(keychainFaceLines(), mat.ink, { shadow: false }));
  },

  /**
   * 키링 고양이: 목도리 토끼와 같은 달걀형 몸에, 앞이마가 물결 모양인 파란 머리 무늬와 뾰족한 귀,
   * 정수리의 볼체인, 파란 니트 목도리, 꼬리 방울, 한 손에 든 마카롱.
   */
  keychainCat(group, doll, { fur, sub }) {
    const mat = { ...KEYCHAIN_MAT, ...CAT_MAT };
    const headY = KB_HEAD.y;

    group.add(
      part(geo.sphere, fur, { pos: [0, headY, 0], scale: [KB_HEAD.rx, KB_HEAD.ry, KB_HEAD.rz] }),
      part(geo.sphere, fur, { pos: [0, -0.008, 0.002], scale: [0.05, 0.05, 0.046] }),
      part(keychainCatCap(), sub),
    );

    // 귀: 머리 위 양쪽 모서리에 거의 곧게 선다
    for (const sx of [-1, 1]) {
      const tilt = [0, 0, -sx * 0.12];
      group.add(
        part(geo.cone, sub, { pos: [sx * 0.033, headY + 0.052, -0.006], scale: [0.023, 0.04, 0.016], rot: tilt }),
        part(geo.cone, mat.innerEar, { pos: [sx * 0.033, headY + 0.05, 0.005], scale: [0.014, 0.027, 0.005], rot: tilt, shadow: false }),
      );
    }

    // 볼체인: 정수리(머리 무늬 위) 고리에서 위로
    addCrownChain(group, mat.chain, headY + KB_HEAD.ry * 1.03);

    // 목도리는 턱 선 바로 아래
    addScarf(group, mat, 0.024);

    // 팔, 발, 꼬리 방울
    for (const sx of [-1, 1]) {
      group.add(
        part(geo.sphere, fur, { pos: [sx * 0.046, 0.002, 0.026], scale: [0.016, 0.013, 0.016] }),
        part(geo.sphere, fur, { pos: [sx * 0.022, -0.056, 0.012], scale: [0.018, 0.014, 0.02] }),
      );
    }
    group.add(part(geo.sphere, mat.scarf, { pos: [0.012, -0.042, -0.048], scale: s(0.02) }));

    // 마카롱: 노란 받침 위 크림색 마카롱, 오른손(보는 사람 기준 오른쪽)에 들고 있다
    const macaron = new THREE.Group();
    macaron.position.set(0.064, 0.004, 0.036);
    macaron.scale.setScalar(1.2);
    macaron.rotation.set(1.15, 0.35, -0.55);
    macaron.add(
      part(geo.disc, mat.plate, { pos: [0, -0.004, 0], scale: [0.025, 0.004, 0.023] }),
      part(geo.disc, mat.cream, { pos: [0, 0.003, 0], scale: [0.023, 0.008, 0.021] }),
      part(geo.sphere, mat.cream, { pos: [0, 0.007, 0], scale: [0.023, 0.011, 0.021] }),
      part(geo.disc, mat.cream, { pos: [0.003, 0.019, 0.002], scale: [0.0025, 0.004, 0.0025], shadow: false }),
    );
    group.add(macaron);

    // 얼굴: 테두리 눈, 짧은 눈썹, |||| 볼터치, 고양이 입
    for (const sx of [-1, 1]) {
      const ex = sx * 0.0188;
      group.add(
        surfaceDot(mat.ink, ex, KC_EYE_Y, [0.0082, 0.0082, 0.0012], 0.0006), // 검은 테두리
        surfaceDot(mat.shine, ex, KC_EYE_Y + 0.0003, [0.0055, 0.0055, 0.0012], 0.0012), // 흰자 (눈동자는 얼굴 선에)
        surfaceDot(mat.blush, sx * 0.035, KC_EYE_Y - 0.011, [0.0097, 0.0072, 0.0016], 0.0004), // 볼
      );
    }
    group.add(part(keychainCatFaceLines(), mat.ink, { shadow: false }));
  },

  /**
   * 키링 햄스터: 아래가 넓은 찹쌀떡형 큰 머리, 둥근 귀, 정수리의 볼체인, 분홍 니트 목도리, 두 손으로 안은 만두.
   * 몸통·팔·발과 볼체인은 목도리 토끼·고양이와 같은 크기. 머리가 낮아 물리 충돌체는 따로 둔다 (DollBody의 BASE_SPHERES).
   */
  keychainHamster(group, doll, { fur }) {
    const mat = { ...KEYCHAIN_MAT, ...HAMSTER_MAT };
    const H = KH_HEAD;

    // 머리·귀·얼굴·목도리 (KH_HEAD 치수로 만들고 그룹째 줄여서 옮긴다)
    const head = new THREE.Group();
    head.scale.setScalar(KH_SCALE);
    head.position.y = KH_CENTER_Y - H.y * KH_SCALE;
    group.add(head);

    head.add(
      part(geo.domeTop, fur, { pos: [0, H.y, 0], scale: [H.rx, H.ry, H.rz] }),
      part(geo.domeBottom, fur, { pos: [0, H.y, 0], scale: [H.rx, H.ryBottom, H.rz] }),
    );
    // 둥근 귀: 머리 위 양쪽 모서리
    for (const sx of [-1, 1]) {
      head.add(part(geo.sphere, fur, { pos: [sx * 0.0445, 0.099, -0.004], scale: [0.0145, 0.0135, 0.011] }));
    }

    // 목도리: 머리보다 넓고 얇은 밴드, 머리 아래쪽이 위로 살짝 덮는다
    addScarf(head, mat, -0.008, { size: 1.22, band: 0.65, depth: 0.9 });

    // 볼체인: 목도리 고양이와 같은 크기 (줄인 머리 그룹이 아니라 인형 그룹에 붙인다)
    addCrownChain(group, CAT_MAT.chain, KH_CENTER_Y + H.ry * KH_SCALE);

    // 몸통, 팔, 발: 목도리 토끼·고양이와 같다
    group.add(part(geo.sphere, fur, { pos: [0, -0.008, 0.002], scale: [0.05, 0.05, 0.046] }));
    for (const sx of [-1, 1]) {
      group.add(
        part(geo.sphere, fur, { pos: [sx * 0.046, 0.002, 0.026], scale: [0.016, 0.013, 0.016] }),
        part(geo.sphere, fur, { pos: [sx * 0.022, -0.056, 0.012], scale: [0.018, 0.014, 0.02] }),
      );
    }

    // 만두: 둥근 몸통 위쪽을 주름(가운데로 모이는 결)과 꼭지로 오므렸다. 윗면이 보는 쪽으로 기운다.
    // 목도리 토끼의 주먹밥처럼 목도리 바로 아래 몸통 앞에 안고 있다 (크기는 머리와 같은 비율로 줄임)
    const bun = new THREE.Group();
    bun.position.set(0, -0.008, 0.062);
    bun.scale.setScalar(KH_SCALE);
    bun.rotation.x = 0.5;
    bun.add(
      part(geo.sphere, mat.bun, { scale: [0.03, 0.027, 0.026] }),
      part(geo.sphere, mat.bun, { pos: [0, 0.026, 0], scale: [0.004, 0.005, 0.004], shadow: false }),
    );
    for (let i = 0; i < 7; i++) {
      const pleat = new THREE.Group();
      pleat.rotation.y = (i / 7) * Math.PI * 2;
      pleat.add(part(geo.sphere, mat.bun, { pos: [0, 0.022, 0.009], scale: [0.0022, 0.0018, 0.011], rot: [0.75, 0, 0], shadow: false }));
      bun.add(pleat);
    }
    group.add(bun);

    // 얼굴: 테두리 눈(흰자 + 아래 초승달), 이마 점, 빗금 볼터치, 턱 아래 두 점
    const dot = (material, x, y, scale, lift) => surfaceDot(material, x, y, scale, lift, H);
    for (const sx of [-1, 1]) {
      const ex = sx * KH_EYE_X;
      head.add(
        dot(mat.ink, ex, KH_EYE_Y, [0.0107, 0.0107, 0.0012], 0.0006), // 검은 테두리
        dot(mat.shine, ex, KH_EYE_Y + 0.0023, [0.0058, 0.0047, 0.0012], 0.0012), // 흰자
        dot(mat.blush, sx * 0.047, KH_EYE_Y - 0.0135, [0.0137, 0.0101, 0.0016], 0.0004), // 볼
        dot(mat.ink, sx * 0.0031, KH_EYE_Y - 0.0367, [0.0016, 0.0025, 0.0012], 0.0006), // 턱 아래 점
      );
    }
    head.add(dot(mat.ink, -0.0137, KH_EYE_Y + 0.0201, [0.0016, 0.0019, 0.0012], 0.0006)); // 이마 점
    const lines = keychainHamsterFaceLines();
    head.add(part(lines.ink, mat.ink, { shadow: false }), part(lines.shine, mat.shine, { shadow: false }));
  },
};

const MODEL_HEIGHT = 0.21; // .glb 인형을 맞출 높이 (절차적 인형과 비슷하게)

/**
 * .glb 모델을 인형 좌표계에 맞춘다: 높이 MODEL_HEIGHT, 좌우·앞뒤 가운데, 바닥은 몸통 아래.
 * 물리 충돌체(DOLL_SHAPE)는 그대로라 비슷한 크기·비율의 모델이 자연스럽다.
 */
function fitModel(model) {
  model.position.set(0, 0, 0); // 루트가 원점에서 떨어져 있어도 아래 계산이 맞도록
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = MODEL_HEIGHT / Math.max(size.y, 1e-6);
  model.scale.multiplyScalar(scale);
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  model.position.set(-center.x, -DOLL_SHAPE.bodyRadius - box.min.y * scale, -center.z);
}

function useModel(group, model) {
  fitModel(model);
  disposeOwnedMaterials(group);
  group.clear();
  group.add(model);
}

/**
 * 인형 데이터(data/dolls.js 항목)로 Three.js 그룹을 만든다.
 * doll.modelUrl의 .glb가 이미 로드돼 있으면 바로 쓰고, 아니면 절차적 모델을 먼저 보여 준 뒤
 * 로드되면 교체하고 그룹에 'modelloaded' 이벤트를 보낸다 (실패 시 절차적 모델 유지).
 */
export function createDollMesh(doll) {
  const group = new THREE.Group();
  group.name = `Doll:${doll.id}`;
  group.userData.dollId = doll.id;

  const ready = doll.modelUrl && peekModel(doll.modelUrl);
  if (ready) {
    fitModel(ready);
    group.add(ready);
    return group;
  }

  builders[doll.type](group, doll, createMaterials(doll));
  if (doll.modelUrl) {
    loadModel(doll.modelUrl).then((model) => {
      // 로드 전에 제거된 인형(획득, 썸네일용 등)에는 붙이지 않는다
      if (!model || group.userData.disposed) return;
      useModel(group, model);
      group.dispatchEvent({ type: 'modelloaded' });
    });
  }
  return group;
}

/** 인형이 직접 만든 머티리얼만 해제 (공유 머티리얼, .glb 복제본이 공유하는 머티리얼은 제외) */
function disposeOwnedMaterials(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const material of [obj.material].flat()) if (material?.userData.ownedByDoll) material.dispose();
  });
}

/** 다 쓴 인형 정리. 이후 끝나는 .glb 로드는 이 인형에 붙지 않는다. */
export function disposeDollMesh(group) {
  group.userData.disposed = true;
  disposeOwnedMaterials(group);
}
