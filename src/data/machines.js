/**
 * 오락실에 배치되는 인형뽑기 기계 목록.
 * modelUrl에 public/models 의 .glb 경로를 지정하면 외형(캐비닛)을 해당 모델로 교체한다.
 * (null 이면 절차적 모델 사용)
 */
export const MACHINES = [
  {
    id: 'bear',
    name: '곰돌이 하우스',
    price: 100,
    color: 0xff4fa3,
    accent: 0xffd23f,
    position: [-1.8, 0, -1.2],
    modelUrl: null, // 예: '/models/claw-machine-bear.glb'
  },
  {
    id: 'bunny',
    name: '치이카와 겨울 시리즈',
    price: 100,
    color: 0x3de0ff,
    accent: 0xff4fa3,
    position: [0, 0, -1.4],
    modelUrl: null, // 예: '/models/claw-machine-bunny.glb'
  },
  {
    id: 'chick',
    name: '병아리 농장',
    price: 100,
    color: 0xffd23f,
    accent: 0x6c4dff,
    position: [1.8, 0, -1.2],
    modelUrl: null, // 예: '/models/claw-machine-chick.glb'
  },
];

export const getMachine = (id) => MACHINES.find((m) => m.id === id);
