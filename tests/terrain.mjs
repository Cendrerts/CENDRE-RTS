import assert from 'node:assert/strict';
import { CendreSim } from '../public/game/sim.js';
import { groundRotation, hedgeOffset, obstacleVariant, terrainZone } from '../public/game/terrain.js';

const { W, H, COLS, ROWS } = CendreSim;
const zoneAt = (x, y) => terrainZone(x, y, W, H);

assert.deepEqual(zoneAt(0.25 * W, 0.25 * H), [1, 0, 0], 'Cendres au nord-ouest');
assert.deepEqual(zoneAt(W / 2, H / 2), [0, 1, 0], 'Braises au centre');
assert.deepEqual(zoneAt(0.9 * W, 0.9 * H), [0, 0, 1], 'Marécage au sud-est');

for (const [start, end, channel] of [[0.57, 0.64, 1], [0.77, 0.83, 2]]) {
  let previous = zoneAt(start * W, start * H)[channel];
  for (let step = 1; step <= 10; step++) {
    const position = start + (end - start) * step / 10;
    const weights = zoneAt(position * W, position * H);
    assert(weights[channel] > 0 && weights[channel] < 1, 'Les couleurs se mélangent');
    const difference = weights[channel] - previous;
    assert(channel === 1 ? difference < 0 : difference > 0, 'Le fondu est monotone');
    assert(Math.abs(difference) < 0.2, 'Le fondu ne saute pas de teinte');
    previous = weights[channel];
  }
}

for (let row = 0; row < ROWS; row += 3) {
  for (let column = 0; column < COLS; column += 3) {
    const x = (column + 0.37) * CendreSim.CELL;
    const y = (row + 0.16) * CendreSim.CELL;
    const weights = zoneAt(x, y);
    assert.deepEqual(weights, zoneAt(x, y), 'Teintes déterministes');
    assert.deepEqual(weights, zoneAt(W - x, H - y), 'Symétrie par rotation de 180°');
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
