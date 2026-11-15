import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { resolveTap, unitHitbox } from '../public/game/tap.js';

const state = Sim.create();
state.visible[0].fill(1);
const mine = state.mines[2];
mine.owner = 1;
mine.depot = true;
state.units = [0, 1, 2].map((index) => ({
  id: 100 + index,
  team: 0,
  type: 'knight',
  hp: 100,
  x: 600 + index * 50,
  y: 1200,
}));
const selection = new Set(state.units.map((unit) => unit.id));
const point = { x: mine.site.x, y: mine.site.y };
const expectedOrder = { kind: 'attackMove', x: point.x, y: point.y };
assert.deepEqual(resolveTap(state, 0, selection, point), expectedOrder);
const offsetPoint = { x: point.x + 12, y: point.y - 8 };
assert.deepEqual(resolveTap(state, 0, selection, offsetPoint), {
  kind: 'attackMove',
  x: offsetPoint.x,
  y: offsetPoint.y,
});
assert.deepEqual(resolveTap(state, 0, new Set(), point), { kind: 'enemyBase', index: 2 });
assert.deepEqual(resolveTap(state, 0, selection, mine), { kind: 'move', index: 2 });
assert.deepEqual(resolveTap(state, 0, new Set(), mine), { kind: 'mine', index: 2 });

// The enemy sprite center is within the 6 px tie: unit priority wins.
const enemy = {
  id: 200,
  team: 1,
  type: 'knight',
  hp: 100,
  x: point.x + 5,
  y: point.y,
};
const hitbox = unitHitbox(enemy);
enemy.y += point.y - (hitbox.y + hitbox.height / 2);
state.units.push(enemy);
assert.deepEqual(resolveTap(state, 0, selection, point), { kind: 'attack', target: enemy });

// A building closer by more than 6 px still wins over the enemy priority.
enemy.x = point.x + 7;
assert.deepEqual(resolveTap(state, 0, selection, point), expectedOrder);
state.visible[0].fill(0);
enemy.x = point.x + 5;
assert.deepEqual(resolveTap(state, 0, selection, point), { kind: 'move' });
console.log('PASS: enemy depot attack-move, empty selection, unit priority, nearest target and mine taps.');
