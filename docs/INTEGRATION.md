# 🤝 모션 인식·게임 로직 ↔ 3D·UI 연동 가이드

모션 인식·게임 로직 코드를 3D·UI 코드와 연결할 때 필요한 내용만 정리했습니다.

```
[웹캠] → MediaPipe → 모션 브릿지(#10) ─ inputState.update() ─→ MotionBinding(#6) → 집게 / 조이스틱 / 화면
                                                                                ↓ eventBus
                   게임 로직(#11~#13) ←──── integration/gameApi.js ←──────── UI(#4·#5)
```

## 1. 입력: `InputState` (`src/core/InputState.js`)

모션 브릿지는 매 프레임(또는 값이 바뀔 때) 아래처럼 넣기만 하면 됩니다. 넣지 않은 필드는 이전 값을 유지합니다.

```js
import { inputState } from './core/InputState.js';

inputState.update({ joystickX: 0.5, joystickY: 0, isFist: true });
inputState.reset('motion'); // 손을 놓쳤을 때: 모션 입력값만 초기화 (키보드 입력은 유지)
```

| 필드 | 타입 / 범위 | 의미 | 3D·게임 동작 |
| --- | --- | --- | --- |
| `joystickX` | `-1 ~ 1` | 왼쪽 − / 오른쪽 + | 게임: 집게 좌우 이동 + 조이스틱 기울기 · 선택: ±0.6을 넘는 순간 이전/다음 기계 |
| `joystickY` | `-1 ~ 1` | 앞쪽(플레이어 쪽) − / 안쪽 + | 게임: 집게 앞뒤 이동 + 조이스틱 기울기 |
| `isFist` | `boolean` | 주먹 쥐기 | 게임: `false→true` 순간 집게 내리기 + 버튼 눌림 · 메인/선택: 확인 |
| `isPointing` | `boolean` | 검지 가리키기 | 메인/선택: `false→true` 순간 확인(다음 화면 / 플레이) |
| `isPinching` | `boolean` | 엄지·검지 집기 | 게임: 집은 채로 `pointer`를 코인 투입구에 가져가 놓으면(`true→false`) 코인 투입. 놓는 순간 `pointer`가 `null`이면(손을 놓침) 무시 |
| `pointer` | `{ x, y }` 0~1 또는 `null` | 손 위치 (화면 정규화, **좌우 반전 처리된 값**, 좌상단 원점) | 값이 있으면 손 커서 표시, 동전 드롭 위치 판정 |
| `headYaw` | 라디안 | 오른쪽으로 돌리면 + | 게임: 지금 시점에서 기계 주위로 상대 회전 (마우스 드래그·줌과 함께 동작, 드래그 중엔 멈춤) |
| `headPitch` | 라디안 | 위를 보면 + | 게임: 카메라를 위아래로 상대 회전 |
| `gazeTarget` | 기계 id 또는 `null` | 바라보는 기계 (`'bear'`/`'bunny'`/`'chick'`) | 선택: 값이 바뀌면 해당 기계 선택 |

- `update(partial, source)`의 `source` 기본값은 `'motion'`입니다. **입력원마다 값을 따로 저장하고 합쳐서** 읽기 때문에 키보드와 모션이 서로 덮어쓰지 않습니다.
  - `joystickX/Y`: 입력원 값의 합(-1~1) · `isFist`/`isPointing`/`isPinching`: 하나라도 true면 true · `pointer`/`headYaw`/`headPitch`/`gazeTarget`: 값이 있는 입력원 중 가장 최근 것
  - `partial`에 `source`를 넣어도 무시됩니다. 합쳐진 상태의 `source`는 마지막으로 갱신한 입력원(읽기 전용)입니다.
- `reset(source = 'motion')`은 그 입력원의 값만 지웁니다.
- 모달이 열려 있는 동안에는 모든 입력이 무시되고 게임(집게·타이머)이 일시정지됩니다.
- 정의되지 않은 필드를 넣으면 콘솔에 경고가 한 번 출력됩니다. 필드 추가가 필요하면 #6에서 합의 후 `DEFAULT_STATE`에 추가합니다.
- 버튼 동작(하강 / 확인)은 **엣지**(false→true)에서만 일어나므로, 디바운스된 boolean을 계속 넣어주면 됩니다.
- 기계 위치 → 화면 좌표가 필요하면 `arcade.getCoinSlotScreenPosition()`처럼 `Arcade`에 헬퍼를 추가해 사용합니다.

### 키보드 대체 입력 (`src/integration/KeyboardInput.js`)

| 키 | 동작 |
| --- | --- |
| 방향키 / WASD | `joystickX`, `joystickY` |
| Space | `isFist` (누르는 동안) |
| Enter | `input:confirm` |
| C | `input:coin` |

### 모션 입력 (`src/motion/`, B #8~#10)

기계를 골라 **게임 화면에 들어가면 카메라가 켜지고**, 게임 화면을 나가면 꺼집니다. 게임 중에는 왼쪽 아래(좁은 화면은 왼쪽 위)에 **내 모습** 카메라 창이 뜹니다. MediaPipe 모델(손·얼굴)은 기계 선택 화면에서 미리 받아 둡니다(카메라 권한은 묻지 않음).

```
웹캠 → MotionTracker → HandTracker(#8) / HeadTracker(#9) → MotionBridge(#10) → inputState.update(..., 'motion')
```

| InputState 필드 | 만드는 방법 |
| --- | --- |
| `joystickX` / `joystickY` | 손바닥 중심이 화면 가운데(0.5, 0.55)에서 벗어난 정도. 화면의 18% 이동 = ±1, 가운데 15%는 0 (데드존) |
| `isFist` / `isPointing` / `isPinching` | 손가락 펴짐/굽힘 비율로 판별, 80ms 이상 유지돼야 켜지고 120ms 이상 유지돼야 꺼짐 |
| `pointer` | 집는 중이면 엄지·검지 사이, 아니면 검지 끝 (좌우 반전, 떨림 보정) |
| `headYaw` / `headPitch` | 켜고 처음 0.5초 동안의 자세를 정면(0)으로 삼은 머리 회전 각도 |
| `gazeTarget` | yaw ±0.35rad 범위를 기계 수만큼 나눠 **1초 동안 응시**한 기계 |

- 값이 **바뀐 필드만** 보냅니다. 손이 안 보일 때는 손 관련 필드를 한 번만 중립으로 되돌리고 그 뒤로는 보내지 않아서, 모션을 켠 채로 키보드를 써도 덮어쓰지 않습니다.
- 게임 화면 단축키: **V** 카메라 창 숨기기/보이기, **R** 정면과 손 가운데 위치 다시 맞추기
- 다른 탭으로 가면 카메라를 끄고, 게임 화면으로 돌아오면 다시 켭니다.
- 카메라 권한이 거부되면 카메라 창에 안내가 뜨고, 버튼·키보드로 그대로 플레이할 수 있습니다.
- 게임 화면에서만 카메라를 켜므로, 메인·선택 화면의 모션 입력(가리키기로 확인, `gazeTarget`)은 지금은 동작하지 않습니다.
- 이벤트: `motion:started`, `motion:stopped`, `motion:error { reason }` (`permission-denied` / `no-camera` / `load-failed` / `unsupported`)

## 2. 이벤트 (`src/core/EventBus.js`)

```js
import { eventBus } from './core/EventBus.js';
const off = eventBus.on('doll:won', ({ machineId, dollId }) => { /* ... */ });
```

### 3D·게임이 발행하는 이벤트 (게임 로직 등에서 구독)

| 이벤트 | payload | 시점 |
| --- | --- | --- |
| `doll:won` | `{ machineId, dollId }` | 인형이 배출구로 떨어짐 (도감 저장 #13) |
| `claw:state` | `{ machineId, state }` | 집게 상태 변경 (`idle`, `ready`, `descending`, `grabbing`, `ascending`, `returning`, `releasing`) |
| `claw:grab` | `{ machineId, success, dollId, chance }` | 집기 시도 결과 |
| `claw:slip` | `{ machineId, dollId }` | 운반 중 인형이 미끄러짐 |
| `claw:round-end` | `{ machineId }` | 한 판 종료 |
| `screen:changed` | `{ name, params }` | 화면 전환 (`main`, `select`, `game`, `collection`) |

### 입력·게임 로직이 발행 → 3D·UI가 처리하는 이벤트

| 이벤트 | payload | 처리 |
| --- | --- | --- |
| `gold:changed` | `{ gold }` | HUD 골드 표시 갱신 (#11) |
| `input:confirm` | – | 메인: 기계 선택으로 · 선택: 플레이 |
| `input:select-prev` / `input:select-next` | – | 선택 화면 이전/다음 기계 |
| `input:select-machine` | `{ machineId }` | 선택 화면에서 해당 기계 선택 |
| `input:coin` | – | 게임 화면 코인 투입 (골드 차감 후 라운드 시작) |
| `ui:open-modal` | `{ name: 'attendance' \| 'charge' \| 'nightShift' }` | 모달 열기 |

## 3. 게임 로직: `gameApi` (`src/integration/gameApi.js`)

UI는 이 객체만 호출합니다. 현재는 **메모리 Mock**이며, 게임 로직 모듈이 준비되면 각 메서드 내부를 해당 모듈 호출로 바꾸면 됩니다. **반환 형태만 유지하면 UI 수정은 필요 없습니다.**

| 메서드 | 반환 | 이슈 |
| --- | --- | --- |
| `getGold()` | `number` | #11 |
| `spendGold(amount)` | `{ ok, gold }` (부족 시 `ok: false`) | #11 |
| `addGold(amount, reason)` | `{ ok, gold }` | #11 |
| `getChargePackages()` | `[{ id, price, gold, bonus }]` | #11 |
| `chargeGold(packageId)` | `{ ok, gold, amount }` | #11 |
| `getAttendance()` | `{ rewards[7], streak, claimedToday, todayIndex }` | #11 |
| `claimAttendance()` | `{ ok, reward, day }` / `{ ok: false, reason }` | #11 |
| `getNightShiftStatus()` | `{ duration, reward, dailyMax, remaining }` | #12 |
| `startNightShift()` | `{ ok, sessionId, duration, reward }` / `{ ok: false, reason }` | #12 |
| `completeNightShift(sessionId)` | `{ ok, reward }` / `{ ok: false, reason }` | #12 |
| `cancelNightShift(sessionId)` | – (모달을 중간에 닫으면 호출) | #12 |
| `getCollection()` | `{ [dollId]: { count, obtainedAt } }` | #13 |
| `addDoll(dollId)` | – | #13 |

- 골드가 바뀌면 반드시 `gold:changed { gold }`를 발행해 주세요.
- 현재 `doll:won → addDoll` 구독은 `gameApi.js` 하단에 있습니다. #13에서 저장 모듈이 직접 구독하도록 옮기면 이 줄은 삭제합니다.
- 인형 목록(`id`, `name`, `rarity`, `machineId`)은 `src/data/dolls.js`를 사용합니다.

## 4. 디버깅

개발 서버(`npm run dev`)에서는 브라우저 콘솔에서 `window.__ppobbo`로 접근할 수 있습니다.

```js
const { inputState, router, games, motion } = window.__ppobbo;
router.go('game', { machineId: 'bear' });
inputState.update({ pointer: { x: 0.5, y: 0.8 }, isPinching: true }); // 손 커서/동전 표시 확인
inputState.update({ headYaw: 0.3 });                                    // 시점 이동 확인
router.go('game', { machineId: 'bear' });                               // 카메라 켜짐 (motion.hand / motion.head 로 트래커 상태 확인)
```
