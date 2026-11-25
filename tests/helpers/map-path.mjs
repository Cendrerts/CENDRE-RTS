import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../../public/game/sim.js';

export const cellAt = (x, y) => Math.floor(y / Sim.CELL) * Sim.COLS + Math.floor(x / Sim.CELL);

// Dijkstra on the collision grid, with the same diagonals and corner rule as route().
export function shortestPath(from, to, blocked = () => false) {
  const start = cellAt(from.x, from.y);
  const target = cellAt(to.x, to.y);
  const distances = new Float64Array(Sim.walk.length).fill(Infinity);
  const previous = new Int32Array(Sim.walk.length).fill(-1);
  const open = new Set([start]);
  const available = (cell) => Sim.walk[cell] && !blocked(
    (cell % Sim.COLS) * Sim.CELL + Sim.CELL / 2,
    Math.floor(cell / Sim.COLS) * Sim.CELL + Sim.CELL / 2,
  );
  distances[start] = 0;
  while (open.size) {
    let cell = -1;
    for (const candidate of open) {
      if (cell === -1 || distances[candidate] < distances[cell]) cell = candidate;
    }
    open.delete(cell);
    if (cell === target) {
      const points = [];
      for (let step = target; step !== start; step = previous[step]) points.push(step);
      return { length: distances[target], points };
    }
    const column = cell % Sim.COLS;
    const row = Math.floor(cell / Sim.COLS);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = column + dx;
        const y = row + dy;
        const next = y * Sim.COLS + x;
        if (x < 0 || y < 0 || x >= Sim.COLS || y >= Sim.ROWS || !available(next)) continue;
        if (dx && dy && (!available(cell + dx) || !available(cell + dy * Sim.COLS))) continue;
        const distance = distances[cell] + Sim.CELL * Math.hypot(dx, dy);
        if (distance >= distances[next]) continue;
        distances[next] = distance;
        previous[next] = cell;
        open.add(next);
      }
    }
  }
  assert.fail('Approche déconnectée');
}
