import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CendreSim as S } from '../public/game/sim.js';

function group(count, x = 390, y = 1750) {
  const state = S.create();
  state.units = [];
  for (let index = 0; index < count; index++) {
    S.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    const cell = S.nearest(x + index % 5 * 24, y + Math.floor(index / 5) * 24);
    unit.x = cell % S.COLS * S.CELL + 10;
    unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
  }
  return state;
}
function tick(state) {
  S.tick(state, 0.05);
  for (const unit of state.units) {
    assert(S.walk[Math.floor(unit.y / S.CELL) * S.COLS + Math.floor(unit.x / S.CELL)], 'Terrain praticable');
  }
}
function arrival() {
  const state = group(12);
  S.order(state, state.units.map((unit) => unit.id), 850, 1750);
  for (let step = 0; step < 500; step++) tick(state);
  assert.equal(state.units.length, 12);
  for (const [index, unit] of state.units.entries()) {
    assert.equal(unit.path.length, 0, 'Arrivée effective');
    assert(Math.hypot(unit.x - 850, unit.y - 1750) < 80);
    for (const other of state.units.slice(index + 1)) {
      assert(Math.hypot(unit.x - other.x, unit.y - other.y) >= 14);
    }
  }
  return state;
}
assert.deepEqual(arrival(), arrival(), 'Simulation déterministe');

function pathLength(x, y, path) {
  let length = 0;
  for (const point of path) {
    length += Math.hypot(point.x - x, point.y - y);
    x = point.x;
    y = point.y;
  }
  return length;
}

// IDs deliberately run right-to-left, opposite to the initial spatial order.
const line = group(9);
for (const [index, unit] of line.units.entries()) {
  unit.x = 930 - index * 20;
  unit.y = 1750;
}
const leftToRight = [...line.units].sort((a, b) => a.x - b.x);
S.order(line, line.units.map((unit) => unit.id), 850, 1650);
for (const unit of line.units) {
  const destination = unit.path.at(-1);
  assert(pathLength(unit.x, unit.y, unit.path) <=
    1.5 * Math.hypot(destination.x - unit.x, destination.y - unit.y));
}
for (let step = 0; step < 500; step++) tick(line);
let orderedPairs = 0;
let pairs = 0;
for (let i = 0; i < leftToRight.length; i++) {
  assert.equal(leftToRight[i].path.length, 0);
  for (let j = i + 1; j < leftToRight.length; j++) {
    pairs++;
    if (leftToRight[i].x <= leftToRight[j].x + 1) orderedPairs++;
  }
}
assert(orderedPairs / pairs >= 0.8, 'Ordre gauche-droite conservé à 80 %');

// Near cliff edges, nearby cells across the void must not become formation slots.
for (const [x, y] of [[1130, 450], [710, 250], [1050, 210]]) {
  const state = group(9);
  const cell = S.nearest(x, y);
  const targetX = cell % S.COLS * S.CELL + 10;
  const targetY = Math.floor(cell / S.COLS) * S.CELL + 10;
  S.order(state, state.units.map((unit) => unit.id), x, y);
  for (const unit of state.units) {
    const destination = unit.path.at(-1);
    const direct = Math.hypot(destination.x - targetX, destination.y - targetY);
    const path = S.route(targetX, targetY, destination.x, destination.y);
    assert(direct === 0 || path.length > 0, 'Case connectée à la cible');
    assert(pathLength(targetX, targetY, path) <= 1.5 * direct, 'Pas de détour derrière une falaise');
  }
}

// The northern forest corridor narrows to 220 px between clearings.
const passage = group(20, 650, 450);
S.order(passage, passage.units.map((unit) => unit.id), 1400, 450);
const progress = new Map(passage.units.map((unit) => [unit.id, { x: unit.x, y: unit.y, elapsed: 0 }]));
for (let step = 0; step < 650; step++) {
  tick(passage);
  for (const unit of passage.units) {
    const previous = progress.get(unit.id);
    if (!unit.path.length || Math.hypot(unit.x - previous.x, unit.y - previous.y) > 2) {
      previous.x = unit.x;
      previous.y = unit.y;
      previous.elapsed = 0;
    } else {
      previous.elapsed += 0.05;
      assert(previous.elapsed < 5, `Unité ${unit.id} bloquée`);
    }
  }
}
assert(passage.units.every((unit) => unit.path.length === 0));

// A stale waypoint against a cliff must be replaced after a second.
const blocked = group(1, 650, 210);
const unit = blocked.units[0];
unit.path = [{ x: 650, y: 100 }, { x: 650, y: 450 }];
for (let step = 0; step < 50; step++) tick(blocked);
assert(!unit.path.some((point) => point.x === 650 && point.y === 100));

// Coincident units at the edge must separate without entering the adjacent void.
const edge = group(12, 650, 210);
for (const unit of edge.units) {
  unit.x = 650;
  unit.y = 210;
  unit.path = [];
}
for (let step = 0; step < 200; step++) tick(edge);
assert(edge.units.some((unit) => Math.hypot(unit.x - 650, unit.y - 210) > 10));

// Combatants stay in range even with an overlapping ally.
const combat = group(2, 850, 1750);
S.spawn(combat, 'knight', 1);
const [fighter, ally, enemy] = combat.units;
ally.x = fighter.x;
ally.y = fighter.y;
enemy.x = fighter.x + 30;
enemy.y = fighter.y;
fighter.target = enemy;
enemy.target = fighter;
S.visibility(combat);
const position = { x: fighter.x, y: fighter.y };
tick(combat);
assert.equal(fighter.x, position.x);
assert.equal(fighter.y, position.y);

const benchmark = group(60);
S.order(benchmark, benchmark.units.map((unit) => unit.id), 950, 1750);
for (let step = 0; step < 100; step++) S.tick(benchmark, 0.01);
const start = performance.now();
for (let step = 0; step < 1000; step++) S.tick(benchmark, 0.01);
const milliseconds = (performance.now() - start) / 1000;
assert(milliseconds < 2, `Tick moyen de 60 unités : ${milliseconds.toFixed(3)} ms`);
console.log(`Séparation, formation, passage, anti-blocage, terrain, combat, déterminisme : OK ; 60 unités : ${milliseconds.toFixed(3)} ms/tick`);
