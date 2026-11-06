// Coordinates use world units; scale converts them to CSS screen pixels.
export const TEAM_COLORS = ['#74b9ff', '#b6ed63'];

export function healthBarBounds(x, headY, scale) {
  return {
    x: x - 12 / scale,
    y: headY - 8 / scale,
    width: 24 / scale,
    height: 4 / scale,
  };
}

export function drawHealthBar(ctx, unit, x, headY, scale, player, selected) {
  if (unit.hp >= unit.max && !selected) return;
  const bounds = healthBarBounds(x, headY, scale);
  const fraction = Math.max(0, Math.min(1, unit.hp / unit.max));
  ctx.save();
  ctx.fillStyle = '#091215';
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.fillStyle = unit.team === player ? '#51e078' : '#ff5353';
  ctx.fillRect(bounds.x, bounds.y, bounds.width * fraction, bounds.height);
  ctx.restore();
}

export function unitFeet(x, y, size, team) {
  // Feet in the SVG viewBoxes: cooks 69/72, rats 73/80.
  const footRatio = team === 1 ? 73 / 80 : 69 / 72;
  return { x, y: y - size + 5 + size * 1.125 * footRatio };
}

export function selectionRing(ctx, feet, size, scale, team) {
  ctx.save();
  ctx.strokeStyle = TEAM_COLORS[team];
  ctx.lineWidth = 2 / scale;
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y, size * 0.36, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawCargoRuby(ctx, x, headY, scale) {
  const radius = 4 / scale;
  const y = headY - 16 / scale;
  ctx.save();
  ctx.fillStyle = '#f12d61';
  ctx.strokeStyle = '#ffc1d2';
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
