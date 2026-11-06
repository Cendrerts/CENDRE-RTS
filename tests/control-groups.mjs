import assert from 'node:assert/strict';
import { createControlGroups, assignGroup, groupUnits, dominantType, createGroupTap, isGroupHold } from '../public/game/control-groups.js';
import { createPortraitTap, unitsOfType } from '../public/game/selection.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const units = [
  { id: 1, type: 'knight', hp: 50, team: 0, x: 10, y: 20 },
  { id: 2, type: 'archer', hp: 50, team: 0, x: 30, y: 40 },
  { id: 3, type: 'knight', hp: 50, team: 0, x: 50, y: 60 },
  { id: 4, type: 'mage', hp: 0, team: 0 },
  { id: 5, type: 'mage', hp: 50, team: 1 },
];
const groups = createControlGroups();
const selection = new Set([1, 2, 3, 4, 5]);
for (let index = 0; index < 4; index++) {
  assert.deepEqual(assignGroup(groups, index, selection, units, 0).map((unit) => unit.id), [1, 2, 3]);
}
selection.clear();
assert.deepEqual(groups[0], [1, 2, 3], 'assignment copies selection');
assert.equal(dominantType(groupUnits(groups, 0, units, 0)), 'knight');
units[0].hp = 0;
assert.deepEqual(groupUnits(groups, 0, units, 0).map((unit) => unit.id), [2, 3]);
assert.deepEqual(groups[0], [2, 3], 'dead units removed from stored group');
assert.deepEqual(groupUnits(groups, 0, units.filter((unit) => unit.id !== 3), 0).map((unit) => unit.id), [2]);
assert.deepEqual(assignGroup(groups, 3, new Set(), units, 0), []);
assert.equal(dominantType([]), null);
assert.equal(isGroupHold(100, 499), false);
assert.equal(isGroupHold(100, 500), true);

const taps = createGroupTap();
const portraits = createPortraitTap();
assert.equal(portraits.tap('knight', 0), 'visible');
assert.deepEqual(taps.tap(0, 10), { center: false });
assert.equal(portraits.tap('knight', 100), 'all');
assert.deepEqual(taps.tap(0, 359), { center: true });
assert.deepEqual(taps.tap(0, 400), { center: false });
assert.deepEqual(taps.tap(0, 750), { center: false });
assert.deepEqual(taps.tap(1, 760), { center: false });
taps.reset();
assert.deepEqual(taps.tap(1, 770), { center: false });
const beforePortrait = structuredClone(groups);
unitsOfType(units, 0, 'archer', { minX: 0, maxX: 100, minY: 0, maxY: 100 });
assert.deepEqual(groups, beforePortrait, 'portrait selection leaves control groups intact');
const state = Sim.create();
state.controlGroups = groups;
const restored = JSON.parse(JSON.stringify(state));
assert.deepEqual(restored.controlGroups, groups, 'solo state retains all four groups');
console.log('PASS: assignment, living selection, pruning, dominant type, hold threshold, double tap camera request, independent portraits and solo serialization.');
