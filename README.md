# 🧸 PPoBBo

웹캠 모션 인식으로 조작하는 3D 인형뽑기 오락실

| 파트 | 담당 | 기술 |
| --- | --- | --- |
| 3D 그래픽 & 프론트엔드 | 팀원 A | Three.js, cannon-es, Vite |
| AI 모션 인식 & 게임 로직 | 팀원 B | MediaPipe Hands / Face Mesh |

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
