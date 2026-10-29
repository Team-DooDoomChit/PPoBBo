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
| `isFist` | `boolean` | 집게 내리기 동작 (모션: **오른손** 주먹 쥐기 또는 아래로 내려치기) | 게임: `false→true` 순간 집게 내리기 + 버튼 눌림 · 메인/선택: 확인 |
| `isPointing` | `boolean` | 검지 가리키기 | 메인/선택: `false→true` 순간 확인(다음 화면 / 플레이) |
| `isOk` | `boolean` | OK 사인 👌 (엄지·검지 동그라미 + 나머지 세 손가락 폄, 어느 손이든) | 게임: `false→true` 순간 코인 투입 (#34) |
| `isPinching` | `boolean` | 엄지·검지 집기 | 현재 쓰는 곳 없음 (#34에서 동전 드래그를 OK 사인으로 바꿈) |
| `pointer` | `{ x, y }` 0~1 또는 `null` | 손 위치 (화면 정규화, **좌우 반전 처리된 값**, 좌상단 원점) | 현재 쓰는 곳 없음 (#34에서 손 커서 제거) |
| `headYaw` | 라디안 | 오른쪽으로 돌리면 + | 게임: 약 0.25rad를 넘는 순간 그 방향으로 시점 45° 넘기기. 계속 돌려도 더 돌지 않고, 0.1rad 안으로 돌아와야 다음 넘기기 (#34) |
| `headPitch` | 라디안 | 위를 보면 + | 현재 쓰는 곳 없음 (#34) |
| `gazeTarget` | 기계 id 또는 `null` | 바라보는 기계 (`'bear'`/`'bunny'`/`'chick'`) | 선택: 값이 바뀌면 해당 기계 선택 |

- `update(partial, source)`의 `source` 기본값은 `'motion'`입니다. **입력원마다 값을 따로 저장하고 합쳐서** 읽기 때문에 키보드와 모션이 서로 덮어쓰지 않습니다.
  - `joystickX/Y`: 입력원 값의 합(-1~1) · `isFist`/`isPointing`/`isPinching`/`isOk`: 하나라도 true면 true · `pointer`/`headYaw`/`headPitch`/`gazeTarget`: 값이 있는 입력원 중 가장 최근 것
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

### 모션 입력 (`src/motion/`, #8~#10, #34)

기계를 골라 **게임 화면에 들어가면 카메라가 켜지고**, 게임 화면을 나가면 꺼집니다. 게임 중에는 왼쪽 아래(좁은 화면은 왼쪽 위)에 **내 모습** 카메라 창이 뜹니다. MediaPipe 손 모델은 기계 선택 화면에서 미리 받아 둡니다(카메라 권한은 묻지 않음).

| 손 | 동작 | 결과 |
| --- | --- | --- |
| 왼손 | 주먹을 쥐고(조이스틱 잡기) 기울이기: 앞(화면 쪽)으로 숙이면 안쪽, 뒤로 젖히면 내 쪽, 좌우로 기울이면 좌우. **펴면 바로 멈춤** | 집게 이동 (`joystickX/Y`) |
| 오른손 | 주먹 쥐기 또는 아래로 빠르게 내려치기 | 집게 내리기 (`isFist`) |
| 어느 손이든 | OK 사인 👌 0.25초 유지 | 코인 투입 (`isOk`) |

| 고개 | 한쪽으로 확실히(약 14° 이상) 돌리기 | 그 방향으로 시점 45° 넘기기. 정면으로 돌아와도 시점은 그대로, 다시 넘기려면 정면을 거쳐 다시 돌리기 (#34) |

- 시점은 기계 주위를 **360°** 돌 수 있습니다(고개 넘기기 또는 마우스 드래그·휠). 카메라가 옆 기계 안으로 들어가면 그 기계는 잠시 숨깁니다.
- 예전처럼 고개 각도를 계속 따라 시점을 돌리면 어지러워서, 고개는 "한 칸 넘기기" 신호로만 씁니다.
- 왼손 주먹은 집게를 내리지 않습니다(조이스틱 조작 중 오작동 방지).

```
웹캠 → MotionTracker(손 2개 + 얼굴) → HandRoleAssigner(#34) → 왼손/오른손 HandTracker(#8) ┐
                                    └→ HeadTracker(#9) ──────────────────────────────────┴→ MotionBridge(#10) → inputState.update(..., 'motion')
```

| 단계 | 방법 |
| --- | --- |
| 왼손/오른손 구분 | 두 손이 보이면 화면 위치(거울 화면에서 왼쪽 = 왼손). 한 손만 보이면 직전 0.5초 안에 가까이 있던 손의 역할을 이어 가고, 없으면 MediaPipe handedness 라벨(원본 영상 기준이라 반대로 읽음) |
| `joystickX` / `joystickY` | 왼손 기울기(손목 → 중지 뿌리 방향, worldLandmarks)가 기준 자세에서 벗어난 각도. 약 26° = ±1, 약 5° 안은 0 (데드존). 기준 자세는 **왼손을 쥐는 순간**의 자세이고, 손을 펴면(또는 손이 안 보이면) 바로 0. 다시 쥐면 그때 자세가 새 기준 |
| 주먹 / 가리키기 / OK | 손가락 펴짐/굽힘 비율로 판별, 80ms(OK는 250ms) 이상 유지돼야 켜지고 120ms 이상 유지돼야 꺼짐 |
| 내려치기 | 오른손이 300ms 안에 화면 높이의 12% 이상, 초당 0.9 이상 빠르기로 내려가면 인식. 150ms 동안 `isFist`를 켜고 700ms 동안 다시 인식하지 않음 |

- 값이 **바뀐 필드만** 보냅니다(작은 떨림은 반올림해서 무시). 키보드와는 InputState가 입력원별로 합치므로 섞이지 않고, 이렇게 하면 구독자 호출 횟수가 줄어듭니다. 손이 안 보이면 그 손의 값을 한 번만 중립으로 되돌리고, 카메라를 끌 때는 `inputState.reset('motion')`으로 모션 값만 지웁니다.
- 게임 화면 단축키: **V** 카메라 창 숨기기/보이기, **R** 머리 정면 다시 맞추기 + (쥐고 있으면) 지금 왼손 자세를 조이스틱 가운데로 (모달이 열려 있거나 Ctrl/Alt/⌘ 조합일 때는 무시)
- 다른 탭으로 가면 카메라를 끄고, 게임 화면으로 돌아오면 다시 켭니다.
- 카메라 권한이 거부되면 카메라 창에 안내가 뜨고, 버튼·키보드로 그대로 플레이할 수 있습니다.
- 게임 화면에서만 카메라를 켜므로, 메인·선택 화면의 모션 입력(가리키기로 확인, `gazeTarget`)은 지금은 동작하지 않습니다.
- 이벤트: `motion:started`, `motion:stopped`, `motion:error { reason }` (`permission-denied` / `no-camera` / `load-failed` / `unsupported` / 실행 중 멈춤 `runtime-error`)

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
inputState.update({ isOk: true }); inputState.update({ isOk: false }); // 코인 투입 확인
router.go('game', { machineId: 'bear' });                              // 카메라 켜짐 (motion.hand.left / motion.hand.right 로 손별 상태 확인)
```
