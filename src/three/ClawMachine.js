import * as THREE from 'three';
import { MACHINE_SPEC, PLAY_FLOOR_Y, GLASS_TOP_Y } from './machineSpec.js';
import { createTextTexture } from './textures.js';
import { loadModel } from './ModelLoader.js';

const { width, depth, innerHalf, chute, claw, panel } = MACHINE_SPEC;

const PRONG_COUNT = 3;
const PRONG_CLOSED = 0.12;
const PRONG_OPEN = 0.75;

const shadowed = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * 인형뽑기 기계 1대.
 * - cabinet: 정적인 외형 (GLB 모델로 교체 가능)
 * - claw / joystick / button: 애니메이션되는 부품 (항상 절차적 모델)
 */
export class ClawMachine {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.name = `ClawMachine:${config.id}`;
    this.group.userData.machineId = config.id;
    this.group.position.fromArray(config.position);

    this.materials = {
      body: new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.35, metalness: 0.2 }),
      accent: new THREE.MeshStandardMaterial({ color: config.accent, roughness: 0.3, metalness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15102a, roughness: 0.8 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xd8d8e8, roughness: 0.25, metalness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0xcfefff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };

    this.cabinet = new THREE.Group();
    this.group.add(this.cabinet);

    this.#buildBase();
    this.#buildGlass();
    this.#buildRoof();
    this.#buildPlayFloor();
    this.#buildClaw();
    this.#buildControls();

    this.setClawPosition(claw.home.x, claw.home.z);
    this.setCableLength(claw.minCable);
    this.setProngOpen(0);
    this.setButtonPressed(false);
  }

  /** 마우스 오버 / 선택 강조 */
  setHighlight(on) {
    this.materials.body.emissive.set(on ? this.config.color : 0x000000);
    this.materials.body.emissiveIntensity = on ? 0.35 : 0;
  }

  /** config.modelUrl 의 GLB가 있으면 캐비닛 외형을 교체한다. */
  async loadExternalModel() {
    const model = await loadModel(this.config.modelUrl);
    if (!model) return false;
    this.cabinet.visible = false;
    this.group.add(model);
    return true;
  }

  // ---------- 집게 / 조작부 API ----------

  /** 집게 중심의 로컬 X/Z (기계 중심 기준) */
  setClawPosition(x, z) {
    this.clawCarriage.position.x = THREE.MathUtils.clamp(x, -claw.range, claw.range);
    this.clawCarriage.position.z = THREE.MathUtils.clamp(z, -claw.range, claw.range);
    this.gantryBridge.position.z = this.clawCarriage.position.z;
  }

  /** 레일에서 집게 머리까지 줄 길이 */
  setCableLength(length) {
    const l = THREE.MathUtils.clamp(length, claw.minCable, claw.maxCable);
    this.cable.scale.y = l;
    this.cable.position.y = -l / 2;
    this.clawHead.position.y = -l;
  }

  /** 0 = 닫힘, 1 = 완전히 벌어짐 */
  setProngOpen(t) {
    const angle = THREE.MathUtils.lerp(PRONG_CLOSED, PRONG_OPEN, THREE.MathUtils.clamp(t, 0, 1));
    this.prongHinges.forEach((hinge) => (hinge.rotation.z = angle));
  }

  /** x, y: -1 ~ 1 (y > 0 = 앞으로 밀기 = 기계 안쪽) */
  setJoystick(x, y) {
    this.joystickPivot.rotation.z = -x * 0.4;
    this.joystickPivot.rotation.x = -y * 0.4;
  }

  setButtonPressed(pressed) {
    this.buttonCap.position.y = pressed ? 0.008 : 0.02;
  }

  /** 집게 머리의 월드 좌표 */
  getClawHeadWorldPosition(target = new THREE.Vector3()) {
    return this.clawHead.getWorldPosition(target);
  }

  // ---------- 모델 생성 ----------

  #buildBase() {
    const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, PLAY_FLOOR_Y, depth), this.materials.body));
    base.position.y = PLAY_FLOOR_Y / 2;
    this.cabinet.add(base);

    // 경품 배출 문 (배출구 아래 정면)
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.02), this.materials.dark);
    door.position.set((chute.minX + chute.maxX) / 2, 0.32, depth / 2 + 0.005);
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.015), this.materials.accent);
    doorFrame.position.copy(door.position).add(new THREE.Vector3(0, 0, -0.004));
    this.cabinet.add(doorFrame, door);

    // 장식 띠
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.01, 0.05, depth + 0.01), this.materials.accent);
    stripe.position.y = 0.12;
    this.cabinet.add(stripe);
  }

  #buildGlass() {
    const h = MACHINE_SPEC.glassHeight;
    const y = PLAY_FLOOR_Y + h / 2;
    const half = innerHalf + 0.01;
    const panes = [
      { size: [width, h], pos: [0, y, half], rotY: 0 },
      { size: [width, h], pos: [0, y, -half], rotY: 0 },
      { size: [depth, h], pos: [half, y, 0], rotY: Math.PI / 2 },
      { size: [depth, h], pos: [-half, y, 0], rotY: Math.PI / 2 },
    ];
    panes.forEach(({ size, pos, rotY }) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(...size), this.materials.glass);
      pane.position.set(...pos);
      pane.rotation.y = rotY;
      pane.renderOrder = 1;
      this.cabinet.add(pane);
    });

    // 모서리 기둥
    const postGeo = new THREE.BoxGeometry(0.05, h, 0.05);
    [-1, 1].forEach((sx) =>
      [-1, 1].forEach((sz) => {
        const post = shadowed(new THREE.Mesh(postGeo, this.materials.metal));
        post.position.set(sx * (width / 2 - 0.025), y, sz * (depth / 2 - 0.025));
        this.cabinet.add(post);
      }),
    );
  }

  #buildRoof() {
    const roof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, MACHINE_SPEC.roofHeight, depth), this.materials.body));
    roof.position.y = GLASS_TOP_Y + MACHINE_SPEC.roofHeight / 2;
    this.cabinet.add(roof);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.22),
      new THREE.MeshBasicMaterial({
        map: createTextTexture(this.config.name, { glow: `#${this.config.accent.toString(16).padStart(6, '0')}` }),
        transparent: true,
        toneMapped: false,
      }),
    );
    sign.position.set(0, GLASS_TOP_Y + MACHINE_SPEC.roofHeight / 2, depth / 2 + 0.006);
    this.cabinet.add(sign);

    // 내부 조명
    const light = new THREE.PointLight(0xfff2e0, 1.2, 1.6, 2);
    light.position.set(0, GLASS_TOP_Y - 0.05, 0);
    this.group.add(light);
  }

  #buildPlayFloor() {
    // 배출구 구멍을 제외한 바닥 (L자 형태 = 박스 2개)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xf6e7ff, roughness: 0.9 });
    const t = 0.01;
    const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(innerHalf * 2, t, chute.minZ + innerHalf), floorMat));
    back.position.set(0, PLAY_FLOOR_Y + t / 2, (chute.minZ - innerHalf) / 2);
    const front = shadowed(new THREE.Mesh(new THREE.BoxGeometry(chute.minX + innerHalf, t, innerHalf - chute.minZ), floorMat));
    front.position.set((chute.minX - innerHalf) / 2, PLAY_FLOOR_Y + t / 2, (chute.minZ + innerHalf) / 2);
    this.cabinet.add(back, front);

    // 배출구 구멍(어두운 면) + 투명 칸막이
    const hole = new THREE.Mesh(
      new THREE.PlaneGeometry(chute.maxX - chute.minX, chute.maxZ - chute.minZ),
      this.materials.dark,
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set((chute.minX + chute.maxX) / 2, PLAY_FLOOR_Y + 0.002, (chute.minZ + chute.maxZ) / 2);
    this.cabinet.add(hole);

    const wallMat = this.materials.glass.clone();
    wallMat.opacity = 0.3;
    const wallH = chute.wallHeight;
    const wallX = new THREE.Mesh(new THREE.PlaneGeometry(chute.maxZ - chute.minZ, wallH), wallMat);
    wallX.rotation.y = Math.PI / 2;
    wallX.position.set(chute.minX, PLAY_FLOOR_Y + wallH / 2, (chute.minZ + chute.maxZ) / 2);
    const wallZ = new THREE.Mesh(new THREE.PlaneGeometry(chute.maxX - chute.minX, wallH), wallMat);
    wallZ.position.set((chute.minX + chute.maxX) / 2, PLAY_FLOOR_Y + wallH / 2, chute.minZ);
    this.cabinet.add(wallX, wallZ);
  }

  #buildClaw() {
    const railY = claw.railY;

    // 좌우 레일 + 앞뒤로 움직이는 브릿지
    const railGeo = new THREE.BoxGeometry(0.03, 0.03, innerHalf * 2);
    [-1, 1].forEach((sx) => {
      const rail = new THREE.Mesh(railGeo, this.materials.metal);
      rail.position.set(sx * (innerHalf - 0.02), railY + 0.02, 0);
      this.group.add(rail);
    });
    this.gantryBridge = new THREE.Mesh(new THREE.BoxGeometry(innerHalf * 2, 0.025, 0.04), this.materials.metal);
    this.gantryBridge.position.y = railY + 0.02;
    this.group.add(this.gantryBridge);

    // 캐리지 (레일 위에서 X/Z 이동)
    this.clawCarriage = new THREE.Group();
    this.clawCarriage.position.y = railY;
    this.group.add(this.clawCarriage);

    const carriageBox = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), this.materials.accent));
    this.clawCarriage.add(carriageBox);

    // 줄 (높이 1짜리 실린더를 scale.y로 늘린다)
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), this.materials.dark);
    this.clawCarriage.add(this.cable);

    // 집게 머리 + 집게발
    this.clawHead = new THREE.Group();
    this.clawCarriage.add(this.clawHead);

    const head = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.06, 16), this.materials.metal));
    head.position.y = -0.03;
    this.clawHead.add(head);

    this.prongHinges = [];
    const armGeo = new THREE.BoxGeometry(0.012, 0.1, 0.02);
    const tipGeo = new THREE.BoxGeometry(0.012, 0.045, 0.02);
    for (let i = 0; i < PRONG_COUNT; i++) {
      const around = new THREE.Group();
      around.rotation.y = (i / PRONG_COUNT) * Math.PI * 2;
      around.position.y = -0.06;
      this.clawHead.add(around);

      const hinge = new THREE.Group();
      hinge.position.x = 0.04;
      around.add(hinge);

      const arm = shadowed(new THREE.Mesh(armGeo, this.materials.metal));
      arm.position.y = -0.05;
      const tip = shadowed(new THREE.Mesh(tipGeo, this.materials.metal));
      tip.position.set(-0.012, -0.11, 0);
      tip.rotation.z = -0.9;
      hinge.add(arm, tip);
      this.prongHinges.push(hinge);
    }
  }

  #buildControls() {
    const panelMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, panel.depth), this.materials.accent));
    panelMesh.position.set(0, panel.y - 0.04, panel.z);
    this.cabinet.add(panelMesh);

    const panelTop = panel.y;

    // 조이스틱
    this.joystick = new THREE.Group();
    this.joystick.position.set(-0.22, panelTop, panel.z);
    this.group.add(this.joystick);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.015, 20), this.materials.dark);
    base.position.y = 0.0075;
    this.joystick.add(base);

    this.joystickPivot = new THREE.Group();
    this.joystickPivot.position.y = 0.015;
    this.joystick.add(this.joystickPivot);

    const stick = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), this.materials.metal));
    stick.position.y = 0.045;
    const ball = shadowed(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xff3355, roughness: 0.2 }),
      ),
    );
    ball.position.y = 0.095;
    this.joystickPivot.add(stick, ball);

    // 하강 버튼
    this.button = new THREE.Group();
    this.button.position.set(0.22, panelTop, panel.z);
    this.group.add(this.button);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24), this.materials.dark);
    ring.position.y = 0.006;
    this.buttonCap = shadowed(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.025, 24),
        new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x119944, emissiveIntensity: 0.6 }),
      ),
    );
    this.button.add(ring, this.buttonCap);
  }
}
