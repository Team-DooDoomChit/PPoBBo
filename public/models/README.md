# 3D 모델 (.glb / .gltf)

이 폴더의 파일은 `/models/<파일명>` 경로로 서빙됩니다.

## 인형뽑기 기계 외형 교체
1. 캐비닛 외형만 포함된 `.glb`를 이 폴더에 넣습니다. (집게·조이스틱·버튼은 코드에서 애니메이션하므로 제외)
2. 모델 기준: 원점 = 바닥 중심, +Z = 정면, 가로/세로 1m, 인형 바닥 높이 0.9m (`src/three/machineSpec.js` 참고)
3. `src/data/machines.js`의 `modelUrl`에 경로를 지정합니다. 예) `modelUrl: '/models/claw-machine-bear.glb'`

로드 실패 시 자동으로 절차적(Procedural) 모델을 사용합니다.
