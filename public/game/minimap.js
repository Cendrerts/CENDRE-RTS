export function minimapPoint(x, y, width, height, worldWidth, worldHeight) {
  return { x: x * width / worldWidth, y: y * height / worldHeight };
}

export function drawMinimap(ctx, { terrain, fog, units, mines, bases = [], camera, player, worldWidth, worldHeight }) {
  const { width, height } = ctx.canvas;
  const point = (x, y) => minimapPoint(x, y, width, height, worldWidth, worldHeight);
  ctx.save();
  ctx.fillStyle = '#080e14';
  ctx.fillRect(0, 0, width, height);
  if (terrain.complete && terrain.naturalWidth) ctx.drawImage(terrain, 0, 0, width, height);
  ctx.drawImage(fog, 0, 0, width, height);
  for (const mine of mines) {
    const position = point(mine.x, mine.y);
    ctx.fillStyle = '#ffd477';
    ctx.beginPath();
    ctx.moveTo(position.x, position.y - 3);
    ctx.lineTo(position.x + 3, position.y);
    ctx.lineTo(position.x, position.y + 3);
    ctx.lineTo(position.x - 3, position.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const base of bases) {
    const position = point(base.x, base.y);
    ctx.fillStyle = base.team === player ? '#65ff97' : '#ff4545';
    ctx.fillRect(position.x - 3, position.y - 3, 6, 6);
    ctx.strokeStyle = '#fff2bd';
    ctx.lineWidth = 1;
    ctx.strokeRect(position.x - 3, position.y - 3, 6, 6);
  }
  for (const unit of units) {
    const position = point(unit.x, unit.y);
    ctx.fillStyle = unit.team === player ? '#65ff97' : '#ff4545';
    ctx.fillRect(position.x - 1.5, position.y - 1.5, 3, 3);
  }
  const topLeft = point(camera.x, camera.y);
  const size = point(camera.width, camera.height);
  ctx.strokeStyle = '#071015';
  ctx.lineWidth = 4;
  ctx.strokeRect(topLeft.x, topLeft.y, size.x, size.y);
  ctx.strokeStyle = '#fff2bd';
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, size.x, size.y);
  ctx.restore();
}
