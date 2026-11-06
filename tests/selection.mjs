import assert from 'node:assert/strict';
import { cameraBounds, unitsOfType, createPortraitTap } from '../public/game/selection.js';
const bounds = cameraBounds(-100, -200, 2, 400, 200);
assert.deepEqual(bounds, { minX: 50, maxX: 250, minY: 100, maxY: 200 });
const u = (id, x, y, team = 0, type = 'commis', hp = 50) => ({ id, x, y, team, type, hp });
const units = [
  u(1, 50, 100),
  u(2, 250, 200),
  u(3, 251, 150),
  u(4, 100, 99),
  u(5, 100, 150, 1),
  u(6, 100, 150, 0, 'knight'),
  u(7, 100, 150, 0, 'commis', 0),
];
let result = unitsOfType(units, 0, 'commis', bounds);
assert.deepEqual(
  result.visible.map((u) => u.id),
  [1, 2],
);
assert.deepEqual(
  result.total.map((u) => u.id),
  [1, 2, 3, 4],
);
assert.equal(
  unitsOfType(units, 0, 'commis', cameraBounds(-2000, 0, 1, 400, 200)).visible.length,
  0,
);
assert.equal(unitsOfType(units, 0, 'commis', cameraBounds(0, 0, 1, 400, 200)).visible.length, 4);
const tap = createPortraitTap();
assert.equal(tap.tap('commis', 0), 'visible');
assert.equal(tap.tap('commis', 349), 'all');
assert.equal(tap.tap('commis', 400), 'visible');
tap.reset();
assert.equal(tap.tap('commis', 0), 'visible');
assert.equal(tap.tap('commis', 350), 'visible');
tap.reset();
assert.equal(tap.tap('commis', 0), 'visible');
assert.equal(tap.tap('knight', 100), 'visible');
assert.equal(tap.tap('commis', 200), 'visible');
assert.equal(tap.tap('commis', 300), 'all');
tap.reset();
assert.equal(tap.tap('commis', 310), 'visible');
console.log(
  'PASS: camera bounds, edge inclusion, team/type/living filters, pan/zoom counts, 349/350ms taps, alternating portraits, triple tap and reset.',
);

const { unitsInBox } = await import('../public/game/selection.js');
assert.deepEqual(unitsInBox(units, 0, { x: 50, y: 100 }, { x: 250, y: 200 }).map((unit) => unit.id), [6]);
assert.deepEqual(unitsInBox(units.filter((unit) => unit.id !== 6), 0, { x: 250, y: 200 }, { x: 50, y: 100 }).map((unit) => unit.id), [1, 2]);
assert.deepEqual(unitsInBox(units, 0, { x: 1000, y: 1000 }, { x: 1100, y: 1100 }), []);
console.log('PASS: box selection prioritizes combat, excludes enemies and dead units, includes edges and supports reversed corners.');
