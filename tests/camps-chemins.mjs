import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command } from '../lib/match.mjs';
import { cellAt } from './helpers/map-path.mjs';

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const projection = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
  const ratio = Math.max(0, Math.min(1, projection));
  return Math.hypot(x - ax - ratio * dx, y - ay - ratio * dy);
}

const { camps } = Sim.create();
assert.equal(camps.length, 11);
assert.equal(camps.filter(({ name }) => name.startsWith('camp-chemin-')).length, 6);
const campPairs = [
  ['centre-ouest', 'centre-est', 1540, 750, 'centre', 'centre'],
  ['nord', 'sud', 1750, 450, 'nord', 'sud'],
  ['nord-est', 'sud-ouest', 2450, 550, 'nord', 'sud'],
];
for (const [first, second, x, y, firstLane, secondLane] of campPairs) {
  for (const [suffix, expectedX, expectedY, laneName] of [
    [first, x, y, firstLane],
    [second, Sim.W - x, Sim.H - y, secondLane],
  ]) {
    const name = `camp-chemin-${suffix}`;
    const camp = camps.find((site) => site.name === name);
    assert(camp, name);
    assert.deepEqual([camp.x, camp.y], [expectedX, expectedY], name);
    const { points } = Sim.lanes.find((lane) => lane.name === laneName);
    assert(points.slice(1).some((end, index) =>
      distanceToSegment(camp.x, camp.y, points[index], end) <= 60), `${name} à 60 px du chemin ${laneName}`);
    for (let row = Math.floor((camp.y - 40) / Sim.CELL) * Sim.CELL; row < camp.y + 40; row += Sim.CELL) {
      for (let column = Math.floor((camp.x - 40) / Sim.CELL) * Sim.CELL; column < camp.x + 40; column += Sim.CELL) {
        assert(Sim.walk[cellAt(column, row)], `${name} : case praticable à ${column},${row}`);
      }
    }
  }
}

const waypoints = Sim.lanes.find((lane) => lane.name === 'nord').points.slice(1);
function traverseNorth(kind, deadline, reachedGoal) {
  const state = Sim.create();
  Sim.spawn(state, 'knight', 0);
  const unit = state.units.at(-1);
  for (const [index, [x, y]] of waypoints.entries()) {
    const tolerance = index === waypoints.length - 1 ? 150 : 25;
    command(state, 0, { kind, ids: [unit.id], x, y });
    while (Math.hypot(unit.x - x, unit.y - y) >= tolerance && state.time < deadline && unit.hp > 0) {
      Sim.tick(state, 0.05);
      if (state.time < deadline && unit.hp > 0 && reachedGoal(state, unit)) return state.time;
    }
    if (state.time >= deadline || unit.hp <= 0) break;
  }
  return null;
}

const aggroTime = traverseNorth('attackMove', 90, (state, unit) =>
  state.monsters.some((monster) => monster.camp === 'camp-chemin-nord' && monster.targetId === unit.id));
assert(aggroTime !== null, 'Le camp nord prend le Garde-Manger pour cible avant 90 s');

const [lastX, lastY] = waypoints.at(-1);
const arrivalTime = traverseNorth('move', 120, (_state, unit) =>
  Math.hypot(unit.x - lastX, unit.y - lastY) < 150);
assert(arrivalTime !== null, 'Le Garde-Manger atteint la base ennemie en repli avant 120 s');
console.log(`PASS camps sur les chemins : agression à ${aggroTime.toFixed(2)} s, arrivée en repli à ${arrivalTime.toFixed(2)} s.`);
