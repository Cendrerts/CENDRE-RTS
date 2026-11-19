import { CendreSim as Sim } from './sim.js';

const cellCount = Sim.COLS * Sim.ROWS;

export function encodeFogGrid(grid) {
  // La première plage compte les 0, même si la grille commence par un 1.
  const runs = [];
  let value = 0;
  let start = 0;
  for (let cell = 0; cell < cellCount; cell++) {
    if (grid[cell] === value) continue;
    runs.push((cell - start).toString(36));
    value ^= 1;
    start = cell;
  }
  runs.push((cellCount - start).toString(36));
  return runs.join(',');
}

export function decodeSnapshotFog(state, team) {
  for (const field of ['visible', 'explored']) {
    if (typeof state?.[field] !== 'string') continue;
    const grid = new Array(cellCount);
    let start = 0;
    let value = 0;
    for (const run of state[field].split(',')) {
      const end = start + parseInt(run, 36);
      grid.fill(value, start, end);
      start = end;
      value ^= 1;
    }
    const grids = [];
    grids[team] = grid;
    grids[1 - team] = new Array(cellCount).fill(0);
    state[field] = grids;
  }
}
