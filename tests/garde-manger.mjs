import assert from 'node:assert/strict';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';
import { resolveTap } from '../public/game/tap.js';
import { cellAt, shortestPath } from './helpers/map-path.mjs';

function create() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  return state;
}

function advance(state, seconds) {
  for (let tick = 0; tick < Math.round(seconds * 20); tick++) {
    Sim.tick(state, 0.05);
  }
}

function add(state, team, pantry, dx, dy = 0, type = 'knight') {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x: pantry.x + dx, y: pantry.y + dy, hold: true, cool: 999, harvest: null, path: [] });
  return unit;
}

const empty = create();
const [first, second] = empty.pantries;
assert.deepEqual(second, { x: Sim.W - first.x, y: Sim.H - first.y, stock: 0 });
const raidStarts = [];
for (const [team, pantry] of empty.pantries.entries()) {
  assert.equal(pantry.stock, 0);
  assert.equal(Sim.walk[cellAt(pantry.x, pantry.y)], 1);
  assert.equal(Sim.resolveTarget(empty, Sim.targetReference(pantry)), null);
  assert(Sim.visibleAt(empty, team, pantry.x, pantry.y));
  const distance = ({ x, y }) => Math.hypot(x - pantry.x, y - pantry.y);
  assert(distance(empty.bases[team]) < 500);
  const outsideWaypoints = Sim.lanes.flatMap(({ points }) => points.slice(2, -2));
  const approach = outsideWaypoints.map(([x, y]) => ({ x, y })).sort((a, b) => distance(a) - distance(b))[0];
  const choke = (x, y) => {
    if (team === 1) [x, y] = [Sim.W - x, Sim.H - y];
    return x >= 720 && x < 740 && y >= 1660 && y < 1840;
  };
  const path = shortestPath(approach, pantry);
  assert(path.length > 0);
  assert.equal(shortestPath(approach, pantry, choke).length, path.length);
  raidStarts[team] = approach;
  for (const point of [...empty.slots.flat(), ...empty.mines, empty.mines[2 + team].site]) {
    assert(Math.hypot(point.x - pantry.x, point.y - pantry.y) >= 75);
  }
}
advance(empty, 60);
assert.deepEqual(empty.pantries.map(({ stock }) => stock), [10, 10]);
advance(empty, 240);
assert.deepEqual(empty.pantries.map(({ stock }) => stock), [40, 40]);

for (const [team, count, expected] of [[0, 1, 10], [1, 1, 10], [1, 3, 30], [1, 5, 30]]) {
  const state = create();
  const pantry = state.pantries[1 - team];
  pantry.stock = 40;
  const direction = team === 1 ? 1 : -1;
  const offsets = [[100 * direction, 0], [0, -100 * direction], [0, 100 * direction], [40, 0], [0, 0]];
  for (const [dx, dy] of offsets.slice(0, count)) add(state, team, pantry, dx, dy);
  advance(state, 5);
  assert.equal(state.ingredients[team].conserves, expected);
  assert.equal(state.ingredients[1 - team].conserves, 0);
  assert.equal(pantry.stock, 40 - expected);
  const alerts = view(state, 1 - team).damageEvents.filter(({ kind }) => kind === 'pantryRaid');
  assert.equal(view(state, team).damageEvents.some(({ kind }) => kind === 'pantryRaid'), false);
  // The first alert has aged out of the network window by 5 s.
  assert.equal(alerts.length, 0);
  assert.equal(state.damageEvents.filter(({ kind }) => kind === 'pantryRaid').length, 1);
}

const guarded = create();
guarded.pantries[0].stock = 40;
add(guarded, 1, guarded.pantries[0], 0);
add(guarded, 0, guarded.pantries[0], 100);
advance(guarded, 5);
assert.deepEqual(guarded.ingredients.map(({ conserves }) => conserves), [0, 10]);
assert.equal(guarded.pantries[0].stock, 30);

const combat = create();
combat.pantries[0].stock = 40;
const raider = add(combat, 1, combat.pantries[0], 0);
const guard = add(combat, 0, combat.pantries[0], 20);
raider.cool = 0;
guard.cool = 0;
Sim.visibility(combat);
advance(combat, 1);
assert(raider.hp < raider.max);
assert.equal(guard.hp, guard.max);
assert.equal(combat.ingredients[1].conserves, 2);
advance(combat, 30);
assert(!combat.units.includes(raider));

const limited = create();
const pantry = limited.pantries[0];
pantry.stock = 5;
add(limited, 1, pantry, -40, 0, 'commis');
add(limited, 1, pantry, 0);
advance(limited, 1);
assert.equal(limited.ingredients[1].conserves, 2);
assert.equal(pantry.stock, 3);
assert.deepEqual(view(limited, 0).damageEvents.filter(({ kind }) => kind === 'pantryRaid'), [
  { x: pantry.x, y: pantry.y, team: 0, time: limited.time, kind: 'pantryRaid' },
]);
advance(limited, 3);
assert.equal(limited.ingredients[1].conserves, 5);
assert.equal(pantry.stock, 0);

const workers = create();
workers.pantries[0].stock = 40;
add(workers, 1, workers.pantries[0], 0, 0, 'commis');
add(workers, 1, workers.pantries[0], 110);
advance(workers, 5);
assert.equal(workers.pantries[0].stock, 40);
assert.equal(workers.ingredients[1].conserves, 0);

const alertCooldown = create();
alertCooldown.pantries[0].stock = 40;
add(alertCooldown, 1, alertCooldown.pantries[0], 0);
advance(alertCooldown, 1);
const firstAlertAt = alertCooldown.pantryTimers[0].lastAlertAt;
assert.equal(firstAlertAt, alertCooldown.time);
for (let second = 2; second <= 10; second++) {
  advance(alertCooldown, 1);
  assert.equal(alertCooldown.pantryTimers[0].lastAlertAt, firstAlertAt);
}
advance(alertCooldown, 1);
assert.equal(alertCooldown.pantryTimers[0].lastAlertAt, alertCooldown.time);
assert.equal(alertCooldown.damageEvents.filter(({ kind }) => kind === 'pantryRaid').length, 1);

for (const [team, dish] of [[0, 'banquet'], [1, 'peste']]) {
  const state = create();
  Sim.tick(state, 84);
  const target = state.pantries[1 - team];
  assert.equal(target.stock, 14);
  assert.equal(state.ingredients[team].conserves, 0);
  const approach = raidStarts[1 - team];
  const unit = add(state, team, approach, 0);
  command(state, team, { kind: 'attackMove', ids: [unit.id], x: target.x, y: target.y });
  advance(state, 11);
  assert.equal(state.ingredients[team].conserves, 15);
  state.bases[team].niveau = 3;
  Object.assign(state.ingredients[team], { viande: 30, epices: 20 });
  command(state, team, { kind: 'cookDish', dish });
  assert(state[dish].readyAt > state.time);
  assert.equal(state.ingredients[team].conserves, 0);
}

const restored = Sim.restore(Sim.serialize(limited));
assert.deepEqual(restored.pantries, limited.pantries);
assert.deepEqual(restored.pantryTimers, limited.pantryTimers);
assert.deepEqual(unpack(pack(limited)).pantryTimers, limited.pantryTimers);
const [own, opponent] = view(limited, 0).pantries;
assert.deepEqual(own, pantry);
assert.deepEqual(opponent, { ...limited.pantries[1], stock: null });
Object.assign(restored.pantries[0], { x: 650, y: 1750, stock: 9 });
Object.assign(restored.pantries[1], { x: 3350, y: 450 });
restored.pantryTimers[0].raidTime = { 1: 0.5 };
const migrated = Sim.restore(Sim.serialize(restored));
assert.deepEqual(migrated.pantries, [{ ...first, stock: 9 }, { ...second, stock: 0 }]);
assert.deepEqual(migrated.pantryTimers[0], { ...limited.pantryTimers[0], raidTime: {} });
delete restored.pantries;
delete restored.pantryTimers;
assert.deepEqual(Sim.restore(Sim.serialize(restored)).pantries, create().pantries);
assert.deepEqual(Sim.migrateState(restored).pantries, create().pantries);

const tapping = create();
const target = tapping.pantries[1];
const attacker = add(tapping, 0, target, -100);
Sim.visibility(tapping);
assert.deepEqual(resolveTap(tapping, 0, new Set(), target), { kind: 'enemyPantry' });
const selected = new Set([attacker.id]);
const order = resolveTap(tapping, 0, selected, target);
assert.deepEqual(order, { kind: 'attackMove', x: target.x, y: target.y });
command(tapping, 0, { ...order, ids: [attacker.id] });
assert.equal(attacker.retreat, false);
assert.deepEqual(attacker.path.at(-1), { x: target.x, y: target.y });
const defender = add(tapping, 1, target, 6);
assert.deepEqual(resolveTap(tapping, 0, selected, target), { kind: 'attack', target: defender });

console.log('Garde-manger : accès, cadence, pillage, alerte, confidentialité, migration et tap validés.');
