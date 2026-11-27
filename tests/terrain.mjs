import assert from 'node:assert/strict';
import { CendreSim } from '../public/game/sim.js';
import { groundRotation, hedgeOffset, obstacleVariant, terrainZone } from '../public/game/terrain.js';

const { W, H, CELL, COLS, ROWS, walk } = CendreSim;
const zoneAt = (x, y) => terrainZone(x, y, W, H);
const samples = Array.from({ length: ROWS * COLS }, (_, index) => {
  const x = (index % COLS + 0.5) * CELL;
  const y = (Math.floor(index / COLS) + 0.5) * CELL;
  return zoneAt(x, y);
});

assert(zoneAt(W / 2, H / 2)[2] > 0.5, 'Cœur des braises au centre');
assert.equal(zoneAt(W / 2 + 700, H / 2)[2], 0, 'Braises limitées au centre');

const coverage = [0, 0, 0];
let walkableCells = 0;
for (let row = 0; row < ROWS; row++) {
  for (let column = 0; column < COLS; column++) {
    const index = row * COLS + column;
    const weights = samples[index];
    assert.deepEqual(weights, samples[samples.length - 1 - index], 'Symétrie des masques');

    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (row + dy < 0 || row + dy >= ROWS || column + dx < 0 || column + dx >= COLS) continue;
        const neighbor = samples[index + dy * COLS + dx];
        neighbors.push(neighbor);
        const distance = CELL * Math.hypot(dx, dy);
        for (const [zone, strength] of [0.56, 0.62, 0.58].entries()) {
          // Maximum slope of a smoothstep spread across 400 world pixels.
          assert(Math.abs(neighbor[zone + 1] - weights[zone + 1]) <= 1.5 * strength * distance / 400);
        }
      }
    }

    if (!walk[index]) continue;
    walkableCells++;
    for (const zone of coverage.keys()) {
      // Count even the faint edges that bilinear interpolation can extend into this cell.
      if (neighbors.some((neighbor) => neighbor[zone + 1] > 0)) coverage[zone]++;
    }
  }
}
for (const cells of coverage) {
  assert(cells > 0 && cells / walkableCells <= 0.2, `Emprise praticable : ${100 * cells / walkableCells} %`);
}

for (let row = 0; row < ROWS; row += 3) {
  for (let column = 0; column < COLS; column += 3) {
    const x = (column + 0.37) * CendreSim.CELL;
    const y = (row + 0.16) * CendreSim.CELL;
    const weights = zoneAt(x, y);
    assert.deepEqual(weights, zoneAt(x, y), 'Teintes déterministes');
    const opposite = zoneAt(W - x, H - y);
    assert(weights.every((weight, zone) => Math.abs(weight - opposite[zone]) < 1e-12),
      'Symétrie par rotation de 180° entre les cases');
    assert(weights.every((weight) => weight >= 0 && weight <= 1));
    assert(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);

    const offset = hedgeOffset(row, column);
    assert.deepEqual(offset, hedgeOffset(row, column), 'Décalage déterministe');
    assert(offset.depth >= 6 && offset.depth <= 9.2);
    assert(Math.abs(offset.shift) <= 2.5);
  }
}
assert.notDeepEqual(hedgeOffset(17, 23), hedgeOffset(17, 24), 'Variation entre deux cases voisines');

// Use both odd and even grids. The map raster can have a central row of tiles.
for (const [rows, columns] of [[13, 22], [12, 21]]) {
  const rotations = new Set();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const oppositeRow = rows - 1 - row;
      const oppositeColumn = columns - 1 - column;
      const rotation = groundRotation(row, column, rows, columns);
      assert.equal(rotation, groundRotation(row, column, rows, columns), 'Orientation déterministe');
      assert.equal(groundRotation(oppositeRow, oppositeColumn, rows, columns), (rotation + 2) % 4);
      rotations.add(rotation);
    }
  }
  assert.deepEqual(rotations, new Set([0, 1, 2, 3]));
}

for (const count of [2, 3]) {
  const variants = new Set();
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLS; column++) {
      const variant = obstacleVariant(row, column, ROWS, COLS, count);
      assert.equal(variant, obstacleVariant(row, column, ROWS, COLS, count), 'Variante déterministe');
      assert.equal(variant, obstacleVariant(ROWS - 1 - row, COLS - 1 - column, ROWS, COLS, count));
      variants.add(variant);
    }
  }
  assert.deepEqual(variants, new Set(Array.from({ length: count }, (_, index) => index)));
}
