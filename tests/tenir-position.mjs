import assert from 'node:assert/strict';
import { command } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';

const state = Sim.create();
state.units = [];
state.monsters = [];
state.camps = [];
Sim.spawn(state, 'knight', 0);
Sim.spawn(state, 'knight', 1);
Sim.spawn(state, 'knight', 0);
Sim.spawn(state, 'knight', 0);
const [unit, enemy, deadUnit, unselectedUnit] = state.units;
enemy.x = state.bases[1].x;
enemy.y = state.bases[1].y;
deadUnit.hp = 0;

const destination = { x: unit.x + 100, y: unit.y };
Object.assign(unit, {
  devour: { corpseId: 1 },
  orderQueue: [{ kind: 'move', ...destination }],
  queueActive: true,
  patrol: { from: { x: unit.x, y: unit.y }, to: destination },
  manual: { dx: 1, dy: 0, left: 0.65 },
  followId: unselectedUnit.id,
  harvest: {},
  target: enemy,
  retreat: true,
  path: [destination],
  stuck: { x: unit.x, y: unit.y },
  attackDestination: destination,
  chasing: true,
  autoTargetId: enemy.id,
});
const ids = [unit.id, enemy.id, deadUnit.id];
const duel = structuredClone(state);
const [beforeHold, ...excludedUnits] = structuredClone(state.units);
const expectedUnit = {
  ...beforeHold,
  devour: null,
  orderQueue: [],
  queueActive: false,
  patrol: null,
  manual: null,
  followId: null,
  harvest: null,
  target: null,
  retreat: false,
  path: [],
  hold: true,
  stuck: null,
};
Sim.hold(state, 0, ids);
assert.deepEqual(state.units, [expectedUnit, ...excludedUnits]);

command(duel, 0, { kind: 'hold', ids });
assert.deepEqual(duel.units, state.units);

state.units = [unit, enemy];
const { x, y } = unit;
for (let step = 0; step < 40; step++) {
  Sim.tick(state, 0.05);
  assert(Math.hypot(unit.x - x, unit.y - y) <= 2, 'Déplacement limité à 2 px pendant 2 s');
}
