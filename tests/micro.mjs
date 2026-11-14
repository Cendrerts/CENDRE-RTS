import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack } from '../lib/match.mjs';
import { filterSelection } from '../public/game/selection.js';

function combat() {
  const state = S.create();
  const [unit, enemy] = state.units;
  for (const item of state.units) {
    item.harvest = null;
    item.path = [];
    item.hold = true;
    item.cool = 0;
    item.hp = 10000;
  }
  unit.type = 'archer';
  unit.x = 790;
  unit.y = 450;
  enemy.x = 850;
  enemy.y = 450;
  S.visibility(state);
  return { state, unit, enemy };
}
function advance(state, seconds) {
  for (let time = 0; time < seconds; time += 0.05) S.tick(state, 0.05);
}

// Commands use the same movement/combat rules as solo.
{
  const { state, unit, enemy } = combat();
  command(state, 0, { kind: 'move', ids: [unit.id], x: 650, y: 450 });
  const hp = enemy.hp;
  advance(state, 0.5);
  assert.equal(enemy.hp, hp, 'A simple move never retaliates in transit');
  assert(unit.x < 790);
  advance(state, 3);
  assert.equal(unit.retreat, false, 'Normal combat resumes upon arrival');
}
{
  const { state, unit, enemy } = combat();
  command(state, 0, { kind: 'attackMove', ids: [unit.id], x: 950, y: 450 });
  advance(state, 0.1);
  assert(enemy.hp < 10000, 'Attack move engages an encountered enemy');
  assert.equal(unit.retreat, false);
}
{
  const { state, unit, enemy } = combat();
  const distance = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
  command(state, 0, { kind: 'retreat', ids: [unit.id, enemy.id] });
  assert.equal(enemy.retreat, false, 'Commands cannot move enemy units');
  advance(state, 0.5);
  assert(Math.hypot(unit.x - enemy.x, unit.y - enemy.y) > distance);
  assert.equal(enemy.hp, 10000, 'Disengaging does not fire');
  assert(unit.path.at(-1).x < 790, 'Destination is away from the enemy');
}
{
  const { state, unit, enemy } = combat();
  state.bases[1].x = 300;
  state.bases[1].y = unit.y;
  state.visible[0].fill(1);
  assert(S.canSee(state, 0, state.bases[1]), 'The distant opposing base is visible');
  command(state, 0, { kind: 'retreat', ids: [unit.id] });
  assert(unit.path.at(-1).x < unit.x, 'Retreat goes away from the skirmish despite the base on the opposite side');
  assert.equal(unit.retreat, true);
}
{
  const units = [
    { id: 1, type: 'knight', hp: 10 },
    { id: 2, type: 'archer', hp: 10 },
    { id: 3, type: 'knight', hp: 10 },
    { id: 4, type: 'mage', hp: 10 },
  ];
  const selection = new Set([1, 2, 3]);
  assert.deepEqual([...filterSelection(selection, units, 'knight')], [1, 3]);
  assert.deepEqual([...filterSelection(selection, units, 'knight', true)], [2]);
  assert.deepEqual([...selection], [1, 2, 3]);
}
{
  const { state, unit, enemy } = combat();
  S.spawn(state, 'commis', 1);
  const other = state.units.at(-1);
  other.x = 815;
  other.y = 450;
  other.harvest = null;
  other.hold = true;
  S.visibility(state);
  command(state, 0, { kind: 'move', ids: [unit.id], x: enemy.x, y: enemy.y, target: { id: enemy.id } });
  advance(state, 0.2);
  assert.equal(unit.target, enemy);
  assert.equal(other.hp, other.max, 'The nearer enemy does not replace the explicit target');
  const restored = unpack(pack(state));
  assert.equal(restored.units[0].target, restored.units.find((item) => item.id === enemy.id));
  enemy.x = 1390;
  enemy.y = 330;
  S.visibility(state);
  advance(state, 0.1);
  assert.equal(unit.target, null, 'An invisible target is released');
  enemy.x = 850;
  enemy.y = 450;
  S.visibility(state);
  S.order(state, [unit.id], enemy.x, enemy.y, enemy);
  enemy.hp = 0;
  advance(state, 0.1);
  assert.equal(unit.target, null, 'A dead target is released');
}

{
  const { state, unit, enemy } = combat();
  // Acquire an enemy outside weapon range, then resume the original route after contact.
  enemy.x = 950;
  S.visibility(state);
  S.order(state, [unit.id], 1130, 450, null, false);
  const destination = unit.attackDestination;
  advance(state, 0.1);
  assert.equal(unit.chasing, true);
  enemy.hp = 0;
  advance(state, 0.1);
  assert.deepEqual(unit.path.at(-1), { x: destination.x, y: destination.y });
  assert.equal(unit.chasing, false);
}

console.log(
  'Micro: move, attack move and resumption, disengage, selection filtering and forced target passed',
);

{
  const { state, unit, enemy } = combat();
  enemy.x = 1300;
  enemy.y = 330;
  const origin = { x: unit.x, y: unit.y };
  command(state, 0, { kind: 'patrol', ids: [unit.id, enemy.id], x: 950, y: 450 });
  assert.equal(enemy.patrol, null, 'Une patrouille ne commande pas un ennemi');
  assert.deepEqual(unit.patrol.points[0], origin);
  let changes = 0;
  let previous = unit.patrol.index;
  for (let step = 0; step < 500 && changes < 3; step++) {
    S.tick(state, 0.05);
    if (unit.patrol.index !== previous) {
      changes++;
      previous = unit.patrol.index;
    }
  }
  assert(changes >= 3, 'La patrouille alterne plusieurs fois entre les deux points');
  command(state, 0, { kind: 'move', ids: [unit.id], x: 790, y: 450 });
  assert.equal(unit.patrol, null, 'Un nouvel ordre annule la patrouille');
  assert.throws(() => command(state, 0, { kind: 'patrol', ids: [unit.id], x: NaN, y: 450 }));
}
{
  const { state, unit, enemy } = combat();
  command(state, 0, { kind: 'patrol', ids: [unit.id], x: 950, y: 450 });
  advance(state, 0.1);
  assert(enemy.hp < 10000, 'La patrouille engage les ennemis en chemin');
  const restored = unpack(pack(state));
  assert.deepEqual(restored.units[0].patrol, unit.patrol);
}
