# 🧸 PPoBBo

웹캠 모션 인식으로 조작하는 3D 인형뽑기 오락실

| 파트 | 기술 |
| --- | --- |
| 3D 그래픽 & 프론트엔드 | Three.js, cannon-es, Vite |
| AI 모션 인식 & 게임 로직 | MediaPipe Hands / Face Mesh |

## 🚀 실행

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/ 생성
```

| 조작 | 모션 | 키보드 |
| --- | --- | --- |
| 집게 이동 | 손 이동 | 방향키 / WASD |
| 집게 내리기 | ✊ 주먹 쥐기 | Space |
| 코인 넣기 | 🤏 동전 집어서 투입구로 | C |
| 확인 / 플레이 | ☝️ 가리키기 | Enter |
| 시점 이동 | 고개 돌리기 | 마우스 드래그 / 휠 (모션과 함께 사용 가능) |

모션 인식·게임 로직과 3D·UI 사이의 연동 규약은 [docs/INTEGRATION.md](docs/INTEGRATION.md)를 참고하세요.

## 🌿 브랜치 전략 (Git Flow)

| 브랜치 | 용도 |
| --- | --- |
| `main` | 배포 가능한 안정 버전 |
| `develop` | 기능 통합 브랜치 (모든 feature PR의 대상) |
| `feature/#<이슈번호>-<작업명>` | 기능 개발 (develop에서 분기) |
| `fix/#<이슈번호>-<작업명>` | 버그 수정 (develop에서 분기) |
| `hotfix/<작업명>` | 배포 버전 긴급 수정 (main에서 분기) |

### 작업 순서
1. GitHub 이슈 등록
2. `develop`에서 `feature/#<이슈번호>-<작업명>` 브랜치 생성
3. 작업 후 커밋 → push
4. `develop`으로 PR 생성 (본문에 `Closes #<이슈번호>`)
5. 리뷰 후 머지, 브랜치 삭제

### 커밋 컨벤션
```
<type>: <설명> (#<이슈번호>)
```
| type | 의미 |
| --- | --- |
| `feat` | 새로운 기능 |
| `fix` | 버그 수정 |
| `refactor` | 리팩토링 |
| `style` | 코드 포맷, 스타일(CSS) 변경 |
| `docs` | 문서 수정 |
| `chore` | 빌드, 설정, 패키지 |
