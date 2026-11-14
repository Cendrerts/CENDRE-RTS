import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';

for (const team of [0, 1]) {
  const state = Sim.create();
  state.units = [];
  for (const type of ['knight', 'archer', 'mage']) {
    Sim.spawn(state, type, team);
  }
  const ids = state.units.map((unit) => unit.id);
  const base = state.bases[team];
  const destination = Sim.lanes[0].points[team ? 4 : 2];
  const speeds = state.units.map((unit) => Sim.stats(unit.type, team).speed);
  const speed = Math.min(...speeds);
  Sim.orderFormation(state, ids, ...destination);
  assert(state.units.every((unit) => unit.orderSpeed === speed));
  const starts = state.units.map((unit) => ({ x: unit.x, y: unit.y }));
  for (let step = 0; step < 100; step++) {
    Sim.tick(state, 0.1);
  }
  const distances = state.units.map((unit, index) => Math.hypot(unit.x - starts[index].x, unit.y - starts[index].y));
  assert(Math.max(...distances) - Math.min(...distances) < 40, `Team ${team}: wave dispersed, distances ${distances}`);
  assert.deepEqual(state.units.map((unit) => Sim.stats(unit.type, team).speed), speeds);
  Sim.order(state, ids, base.x, base.y, null, true);
  assert(state.units.every((unit) => unit.orderSpeed === null && unit.retreat));

  // A queued flank keeps the same pace, and prediction matches authoritative
  // movement before combat, without changing the public unit statistics.
  Sim.orderFormation(state, ids, ...destination);
  Sim.orderFormation(state, ids, ...Sim.lanes[0].points[3], true);
  const predicted = structuredClone(state.units[0]);
  const before = { x: predicted.x, y: predicted.y };
  Sim.predictMotion(state, predicted, { kind: 'move' }, 0.1);
  const travelled = Math.hypot(predicted.x - before.x, predicted.y - before.y);
  assert(travelled <= speed * 0.1 + 1e-6);
  assert(state.units.every((unit) => unit.orderSpeed === speed && unit.orderQueue.length > 0));
}
console.log('PASS: AI formation pace, unchanged stats, queued orders, retreat and prediction.');
