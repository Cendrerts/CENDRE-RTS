import { TEAM_COLORS } from './unit-overlays.js';
import { CendreSim as Sim } from './sim.js';

const campColors = {
  sanglier: '#c0604a',
  lezard: '#ff9a3c',
  veine: '#ffd477',
};

export function exploredCamps(state, player) {
  const { CELL, COLS } = Sim;
  const explored = state.explored[player];
  return (state.camps ?? [])
    .filter(({ x, y }) => explored[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)])
    .map(({ x, y, name, espece }) => ({ x, y, espece: name === 'camp-veine' ? 'veine' : espece }));
}

export function minimapPoint(x, y, width, height, worldWidth, worldHeight) {
  return { x: x * width / worldWidth, y: y * height / worldHeight };
}

export function drawMinimap(ctx, { terrain, fog, units, mines, camps = [], bases = [], watchtowers = [], caches = [], braises = [], pantries = [], fieldKitchens = [], camera, player, worldWidth, worldHeight }) {
  const { width, height } = ctx.canvas;
  const point = (x, y) => minimapPoint(x, y, width, height, worldWidth, worldHeight);
  ctx.save();
  ctx.fillStyle = '#080e14';
  ctx.fillRect(0, 0, width, height);
  if (terrain.complete && terrain.naturalWidth) ctx.drawImage(terrain, 0, 0, width, height);
  ctx.drawImage(fog, 0, 0, width, height);
  for (const camp of camps) {
    const position = point(camp.x, camp.y);
    const radius = camp.espece === 'veine' ? 3.5 : 2.5;
    // La mine centrale et le camp de la Veine partagent les mêmes coordonnées.
    if (mines.some((mine) => mine.x === camp.x && mine.y === camp.y)) {
      position.x += 8;
    }
    ctx.strokeStyle = campColors[camp.espece];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(position.x, position.y - radius);
    ctx.lineTo(position.x + radius, position.y);
    ctx.lineTo(position.x, position.y + radius);
    ctx.lineTo(position.x - radius, position.y);
    ctx.closePath();
    ctx.stroke();
  }
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
  for (const tower of watchtowers) {
    const position = point(tower.x, tower.y);
    ctx.fillStyle = tower.owner === -1 ? '#a0a0a0' : TEAM_COLORS[tower.owner];
    ctx.beginPath();
    ctx.arc(position.x, position.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cache of caches) {
    const position = point(cache.x, cache.y);
    ctx.fillStyle = '#fff2bd';
    ctx.strokeStyle = '#38251b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(position.x, position.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const foyer of braises) {
    if (!foyer.lit) continue;
    const position = point(foyer.x, foyer.y);
    ctx.fillStyle = '#ff952b';
    ctx.beginPath();
    ctx.arc(position.x, position.y, 3, 0, Math.PI * 2);
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
  for (const pantry of [...pantries, ...fieldKitchens]) {
    const position = point(pantry.x, pantry.y);
    ctx.fillStyle = TEAM_COLORS[pantry.team];
    ctx.strokeStyle = '#071015';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(position.x, position.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
