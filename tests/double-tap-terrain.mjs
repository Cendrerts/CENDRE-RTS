import assert from 'node:assert/strict';
import { createFieldDoubleTap, cameraBounds, unitsOfType } from '../public/game/selection.js';
import { resolveTap, unitHitbox } from '../public/game/tap.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const detector = createFieldDoubleTap();
assert.equal(detector.tap('commis', 100, 100, 0), 'single');
assert.equal(detector.tap('commis', 123, 132, 349), 'double');
assert.equal(detector.tap('commis', 123, 132, 350), 'single', 'A third tap starts a new pair');

for (const [type, x, y, time] of [
  ['knight', 100, 100, 100],
  ['commis', 100, 100, 350],
  ['commis', 100, 100, 351],
  ['commis', 140, 100, 100],
  ['commis', 141, 100, 100],
  ['commis', 130, 130, 100],
  ['commis', 100, 100, -1],
]) {
  detector.reset();
  assert.equal(detector.tap('commis', 100, 100, 0), 'single');
  assert.equal(detector.tap(type, x, y, time), 'single');
}
detector.reset();
assert.equal(detector.tap('commis', 100, 100, 0), 'single');
detector.reset();
assert.equal(detector.tap('commis', 100, 100, 100), 'single');

// The field uses resolveTap for both taps, including its screen-pixel snapping.
for (const player of [0, 1]) {
  for (const scale of [0.5, 1, 1.75]) {
    const state = Sim.create();
    state.visible[player].fill(1);
    state.slots[player] = [];
    state.mines = [];
    const unit = { id: 100, team: player, type: 'commis', hp: 50, x: 700, y: 500 };
    state.units = [
      unit,
      { ...unit, id: 101, x: 750 },
      { ...unit, id: 102, team: 1 - player },
      { ...unit, id: 103, type: 'knight', x: 800 },
      { ...unit, id: 104, hp: 0 },
      { ...unit, id: 105, hp: -1 },
      { ...unit, id: 106, x: 1000 },
      { ...unit, id: 107, y: 800 },
    ];
    const bounds = cameraBounds(-600 * scale, -400 * scale, scale, 300 * scale, 200 * scale);
    const hitbox = unitHitbox(unit);
    const point = { x: unit.x - 24 / scale, y: hitbox.y + hitbox.height / 2 };
    if (scale <= 1) {
      assert.ok(point.x < hitbox.x, 'The tap is outside the sprite and uses tactile snapping');
    }
    let selected = new Set();
    detector.reset();
    for (const time of [0, 100, 200]) {
      const action = resolveTap(state, player, selected, point, scale);
      assert.equal(action.kind, 'select', 'Neither tap issues an order');
      const target = state.units.find((candidate) => candidate.id === action.id);
      const tap = detector.tap(target.type, point.x * scale, point.y * scale, time);
      selected = new Set((tap === 'double'
        ? unitsOfType(state.units, player, target.type, bounds).visible
        : [target]).map((candidate) => candidate.id));
      assert.deepEqual([...selected], time === 100 ? [100, 101] : [100]);
    }
  }
}
console.log('PASS: field double-tap thresholds, reset, triple tap, tactile snapping and visible own living units.');
