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

export function drawCargoRuby(ctx, x, headY, scale, unit) {
  if (unit.type !== 'commis' || !(unit.cargo > 0)) return;
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

// Crystal geometry is in world units: a normal cluster spans 36 CSS px at zoom 2.
export function drawMine(ctx, mine, scale, time = 0) {
  const size = mine.boost ? 1.5 : 1;
  ctx.save();
  if (mine.boost) {
    ctx.fillStyle = `rgba(241,45,97,${0.12 + 0.04 * Math.sin(time * 2)})`;
    ctx.beginPath();
    ctx.ellipse(mine.x, mine.y - 4, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = TEAM_COLORS[mine.owner] ?? '#969ca5';
  ctx.lineWidth = 1.5 / scale;
  ctx.beginPath();
  ctx.ellipse(mine.x, mine.y + 2 * size, 11 * size, 4 * size, 0, 0, Math.PI * 2);
  ctx.stroke();
  const crystals = [
    { x: -6, y: 0, width: 3, height: 9 },
    { x: 6, y: 0, width: 3, height: 11 },
    { x: 0, y: 2, width: 4, height: 17 },
  ];
  ctx.lineWidth = 1 / scale;
  ctx.strokeStyle = '#ffc1d2';
  for (const crystal of crystals) {
    const x = mine.x + crystal.x * size;
    const y = mine.y + crystal.y * size;
    const width = crystal.width * size;
    const height = crystal.height * size;
    ctx.fillStyle = '#f12d61';
    ctx.beginPath();
    ctx.moveTo(x, y - height);
    ctx.lineTo(x + width, y - height * 0.65);
    ctx.lineTo(x + width * 0.6, y);
    ctx.lineTo(x - width * 0.6, y);
    ctx.lineTo(x - width, y - height * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
