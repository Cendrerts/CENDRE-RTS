import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

assert.equal(Sim.orderFormation, undefined);
for (const team of [0, 1]) {
  const state = Sim.create();
  state.units = [];
  // Isoler les vagues de combat : aucun camp à chasser dans ce scénario.
  state.camps = [];
  state.monsters = [];
  for (let index = 0; index < 24; index++) {
    Sim.spawn(state, ['knight', 'archer', 'mage'][index % 3], team);
    const unit = state.units.at(-1);
    unit.x = state.bases[team].x + (team ? -110 : 110);
    unit.y = state.bases[team].y + (team ? 65 : -65);
    unit.path = [];
  }
  state.time = 240;
  state.rubies[team] = 0;
  state.visible[team].fill(0);
  const controller = createAI(team, 'brutal');
  controller.update(state);
  const members = state.units;
  const point = { ...members[0].orderQueue[0] };
  assert(members.every((unit) => unit.orderQueue.length > 0));
  for (const unit of members.slice(0, 16)) {
    unit.x = point.x;
    unit.y = point.y;
    unit.path = [];
    unit.orderQueue = [];
    unit.queueActive = false;
  }
  for (const unit of members.slice(16)) {
    unit.x = point.x + 500;
    unit.y = point.y;
  }
  state.time++;
  controller.update(state);
  assert(members.slice(0, 16).every((unit) => unit.path.length === 0), 'Below 70%, arrivals wait');
  members[16].x = point.x;
  members[16].y = point.y;
  state.time++;
  controller.update(state);
  assert(members.slice(0, 16).every((unit) => unit.orderQueue.length > 0), 'At 70%, next stage is queued');
  assert(state.units.every((unit) => !Object.hasOwn(unit, 'orderSpeed')));
}
console.log('PASS: AI waypoints wait for 70% without changing unit speeds.');
