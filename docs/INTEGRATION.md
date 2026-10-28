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
inputState.reset(); // 손을 놓쳤을 때 등 모두 초기화
```

| 필드 | 타입 / 범위 | 의미 | 3D·게임 동작 |
| --- | --- | --- | --- |
| `joystickX` | `-1 ~ 1` | 왼쪽 − / 오른쪽 + | 게임: 집게 좌우 이동 + 조이스틱 기울기 · 선택: ±0.6을 넘는 순간 이전/다음 기계 |
| `joystickY` | `-1 ~ 1` | 앞쪽(플레이어 쪽) − / 안쪽 + | 게임: 집게 앞뒤 이동 + 조이스틱 기울기 |
| `isFist` | `boolean` | 주먹 쥐기 | 게임: `false→true` 순간 집게 내리기 + 버튼 눌림 · 메인/선택: 확인 |
| `isPointing` | `boolean` | 검지 가리키기 | 메인/선택: `false→true` 순간 확인(다음 화면 / 플레이) |
| `isPinching` | `boolean` | 엄지·검지 집기 | 게임: 집은 채로 `pointer`를 코인 투입구에 가져가 놓으면(`true→false`) 코인 투입 |
| `pointer` | `{ x, y }` 0~1 또는 `null` | 손 위치 (화면 정규화, **좌우 반전 처리된 값**, 좌상단 원점) | 손 커서 표시, 동전 드롭 위치 판정 |
| `headYaw` | 라디안 | 오른쪽으로 돌리면 + | 게임: 카메라가 기계 주위로 회전 (시점 전환) |
| `headPitch` | 라디안 | 위를 보면 + | 게임: 카메라 높이 |
| `gazeTarget` | 기계 id 또는 `null` | 바라보는 기계 (`'bear'`/`'bunny'`/`'chick'`) | 선택: 값이 바뀌면 해당 기계 선택 |

- `update(partial, source)`의 `source` 기본값은 `'motion'`입니다. 손 커서와 머리 시점 이동은 `source === 'motion'`일 때만 동작합니다.
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
const { inputState, router, games } = window.__ppobbo;
router.go('game', { machineId: 'bear' });
inputState.update({ pointer: { x: 0.5, y: 0.8 }, isPinching: true }); // 손 커서/동전 표시 확인
inputState.update({ headYaw: 0.3 });                                    // 시점 이동 확인
```
