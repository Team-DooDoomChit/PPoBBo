import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { DOLLS, RARITY } from '../data/dolls.js';
import { MACHINES } from '../data/machines.js';
import { createDollMesh, disposeDollMesh } from '../three/DollFactory.js';
import { dollProfile } from '../physics/DollBody.js';

/**
 * 개발자 전용 인형 모아보기 (/dolls.html, #66).
 * 카탈로그(data/dolls.js)의 인형을 기계별 목록으로 보여 주고, 하나를 골라 돌려 보거나 전부 늘어놓고 본다.
 * 게임 화면·로직과는 연결하지 않는다. 고른 인형은 주소 뒤 #id로 남아서 새로고침해도 유지된다.
 */

const stage = document.getElementById('stage');
const list = document.getElementById('list');
const info = document.getElementById('info');

// ---------- 화면 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
stage.prepend(renderer.domElement);

const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
stage.append(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1b22);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(0.6, 1.2, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2 });
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-1, 0.4, -0.8);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x24242c, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------- 인형 ----------
const shown = new THREE.Group();
scene.add(shown);
let selectedId = null;
let allMode = false;

function clearShown() {
  for (const obj of [...shown.children]) {
    obj.traverse((o) => o.isCSS2DObject && o.element.remove());
    if (obj.userData.dollId) disposeDollMesh(obj);
    shown.remove(obj);
  }
}

/** 인형 하나를 바닥 위에 세운다 (바닥 = 몸통 구 아래 끝, 원점은 몸통 중심) */
function placeDoll(doll, x = 0, z = 0) {
  const mesh = createDollMesh(doll);
  mesh.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const bottom = new THREE.Box3().setFromObject(mesh).min.y;
  mesh.position.set(x, -bottom, z);
  shown.add(mesh);
  return mesh;
}

function stats(mesh) {
  let meshes = 0;
  let triangles = 0;
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  return { meshes, triangles, size };
}

function showOne(id) {
  const doll = DOLLS.find((d) => d.id === id) ?? DOLLS[0];
  selectedId = doll.id;
  allMode = false;
  clearShown();
  const mesh = placeDoll(doll);
  const { meshes, triangles, size } = stats(mesh);
  const height = size.y;
  controls.target.set(0, height * 0.5, 0);
  setView('front', height);
  const machine = MACHINES.find((m) => m.id === doll.machineId);
  info.textContent = [
    `${doll.name}  (${doll.id})`,
    `기계 ${machine?.name ?? doll.machineId} · 종류 ${doll.type} · 등급 ${RARITY[doll.rarity]?.label ?? doll.rarity}`,
    `메시 ${meshes}개 · 삼각형 ${Math.round(triangles).toLocaleString()}개`,
    `크기 가로 ${(size.x * 100).toFixed(1)} × 세로 ${(size.y * 100).toFixed(1)} × 깊이 ${(size.z * 100).toFixed(1)} cm · 충돌체 위쪽 끝 ${(dollProfile(doll.type).top * 100).toFixed(1)} cm(원점 기준)`,
  ].join('\n');
  history.replaceState(null, '', `#${doll.id}`);
  updateButtons();
}

/** 모든 인형을 기계별 줄로 늘어놓는다 (이름표 포함) */
function showAll() {
  allMode = true;
  clearShown();
  const GAP = 0.26;
  const rows = MACHINES.map((m) => DOLLS.filter((d) => d.machineId === m.id)).filter((r) => r.length);
  let maxCols = 1;
  rows.forEach((row, r) => {
    maxCols = Math.max(maxCols, row.length);
    row.forEach((doll, c) => {
      const mesh = placeDoll(doll, (c - (row.length - 1) / 2) * GAP, (r - (rows.length - 1) / 2) * GAP * 1.4);
      const el = document.createElement('div');
      el.className = 'label';
      el.textContent = doll.name;
      const label = new CSS2DObject(el);
      label.position.set(0, -0.005, 0.09);
      mesh.add(label);
    });
  });
  const span = Math.max(maxCols * GAP, rows.length * GAP * 1.4);
  controls.target.set(0, 0.08, 0);
  camera.position.set(0, span * 0.9, span * 1.35);
  info.textContent = `모든 인형 ${DOLLS.length}개 (기계별 한 줄)`;
  history.replaceState(null, '', '#all');
  updateButtons();
}

const VIEWS = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
function setView(name, height = controls.target.y * 2) {
  if (allMode) return;
  const a = VIEWS[name];
  const dist = Math.max(0.45, height * 2.6);
  camera.position.set(Math.sin(a) * dist, controls.target.y + height * 0.15, Math.cos(a) * dist);
  controls.update();
}

// ---------- 목록·버튼 ----------
function updateButtons() {
  for (const b of list.querySelectorAll('button.doll')) b.setAttribute('aria-current', String(!allMode && b.dataset.id === selectedId));
  document.getElementById('all').setAttribute('aria-pressed', String(allMode));
}

for (const machine of MACHINES) {
  const dolls = DOLLS.filter((d) => d.machineId === machine.id);
  if (!dolls.length) continue;
  const h2 = document.createElement('h2');
  h2.textContent = `${machine.name} (${dolls.length})`;
  list.append(h2);
  for (const doll of dolls) {
    const b = document.createElement('button');
    b.className = 'doll';
    b.dataset.id = doll.id;
    b.innerHTML = `<span class="dot"></span><span>${doll.name}<br><span class="meta">${doll.id} · ${doll.type}</span></span>`;
    b.querySelector('.dot').style.background = RARITY[doll.rarity]?.color ?? '#888';
    b.addEventListener('click', () => showOne(doll.id));
    list.append(b);
  }
}

for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
document.getElementById('spin').addEventListener('click', (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate));
});
document.getElementById('all').addEventListener('click', () => (allMode ? showOne(selectedId) : showAll()));

// ---------- 시작 ----------
resize();
const start = decodeURIComponent(location.hash.slice(1));
if (start === 'all') showAll();
else showOne(start || DOLLS[0].id);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
