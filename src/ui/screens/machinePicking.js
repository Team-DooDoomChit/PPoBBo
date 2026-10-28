/**
 * 3D 화면에서 기계에 마우스를 올리면 강조하고, 클릭(드래그 아님)하면 onPick(machineId) 호출.
 * @returns 해제 함수
 */
export function bindMachinePicking({ arcade, sceneManager }, onPick) {
  const canvas = sceneManager.canvas;
  let hovered = null;
  let downAt = null;

  const setHover = (machine) => {
    if (hovered === machine) return;
    hovered?.setHighlight(false);
    hovered = machine;
    hovered?.setHighlight(true);
    canvas.style.cursor = machine ? 'pointer' : '';
  };

  const onMove = (e) => setHover(arcade.pickMachine(e.clientX, e.clientY));
  const onDown = (e) => (downAt = { x: e.clientX, y: e.clientY });
  const onUp = (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 5) return; // 카메라 드래그는 클릭으로 보지 않는다
    const machine = arcade.pickMachine(e.clientX, e.clientY);
    if (machine) onPick(machine.config.id);
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    setHover(null);
  };
}
