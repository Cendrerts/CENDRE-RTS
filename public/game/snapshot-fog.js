import { CendreSim as Sim } from './sim.js';

const cellCount = Sim.COLS * Sim.ROWS;

export function encodeFogGrid(grid) {
  const bytes = new Uint8Array(Math.ceil(cellCount / 8));
  for (let cell = 0; cell < cellCount; cell++) {
    bytes[cell >> 3] |= grid[cell] << (cell & 7);
  }
  return btoa(String.fromCharCode(...bytes));
}

export function decodeSnapshotFog(state, team) {
  if (typeof state?.visible !== 'string') return;

  for (const field of ['visible', 'explored']) {
    const bytes = atob(state[field]);
    const grid = new Array(cellCount);
    for (let cell = 0; cell < cellCount; cell++) {
      grid[cell] = (bytes.charCodeAt(cell >> 3) >> (cell & 7)) & 1;
    }
    const grids = [];
    grids[team] = grid;
    grids[1 - team] = new Array(cellCount).fill(0);
    state[field] = grids;
  }
}
