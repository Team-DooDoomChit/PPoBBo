import * as THREE from 'three';

/** 캔버스에 글자를 그려 간판용 텍스처를 만든다. */
export function createTextTexture(text, { color = '#ffffff', glow = '#ff4fa3', bg = 'transparent', width = 512, height = 128 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  // 글자가 캔버스 폭을 넘으면 글꼴 크기를 줄여 맞춘다
  let fontSize = Math.floor(height * 0.6);
  ctx.font = `${fontSize}px Jua, sans-serif`;
  const maxWidth = width * 0.9;
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth) {
    fontSize = Math.floor((fontSize * maxWidth) / measured);
    ctx.font = `${fontSize}px Jua, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = height * 0.2;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 오락실 바닥용 체크무늬 텍스처 */
export function createCheckerTexture(colorA = '#241a45', colorB = '#1a1233', repeat = 10) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colorB;
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}
