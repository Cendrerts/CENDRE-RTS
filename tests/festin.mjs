import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { command, view, pack, unpack } from '../lib/match.mjs';

function createState() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  return state;
}
function fillPopulation(state, count) {
  while (state.units.length < count) {
    Sim.spawn(state, 'knight', 1, state.bases[1]);
    state.units.at(-1).hold = true;
  }
}
const state = createState();
assert.match(Sim.cookDish(state, 1, 'festin').reason, /Ingrédients/);
state.ingredients[1] = 80;
assert.match(Sim.cookDish(state, 0, 'festin').reason, /Rats-Goût/);
assert.throws(() => command(state, 0, { kind: 'cookDish', dish: 'festin' }), /Rats-Goût/);
fillPopulation(state, 42);
assert.match(Sim.cookDish(state, 1, 'festin').reason, /Population/);
state.units = [];
Sim.setRally(state, 1, { buildingId: 'main_1', x: 1200, y: 450 });
const rubies = [...state.rubies];
command(state, 1, { kind: 'cookDish', dish: 'festin' });
assert.equal(state.festin.readyAt, 15);
assert.equal(state.ingredients[1], 40);
assert.match(Sim.cookDish(state, 1, 'festin').reason, /préparation/);
assert.throws(() => command(state, 1, { kind: 'cookDish', dish: 'festin' }), /préparation/);
assert.deepEqual(unpack(pack(state)).festin, state.festin);
assert.deepEqual(view(state, 1).festin, state.festin);
const replica = unpack(pack(state));
Sim.tick(state, 14.9);
assert.equal(state.units.length, 0);
Sim.tick(state, 0.1);
Sim.tick(replica, 14.9);
Sim.tick(replica, 0.1);
assert.equal(pack(state), pack(replica), 'Résultat déterministe après sérialisation');
assert.equal(state.units.length, 4);
for (const unit of state.units) {
  assert.equal(unit.team, 1);
  assert.equal(unit.type, 'knight');
  assert(Sim.walk[Math.floor(unit.y / Sim.CELL) * Sim.COLS + Math.floor(unit.x / Sim.CELL)]);
  assert(Math.hypot(unit.x - state.bases[1].x, unit.y - state.bases[1].y) < 150);
  assert(unit.path.length > 0, 'Le rat rejoint le ralliement');
}
assert.deepEqual(state.rubies, rubies);
assert.equal(state.ingredients[1], 40);
assert.equal(state.festin.readyAt, null);
for (const population of [43, 45]) {
  const crowded = createState();
  crowded.ingredients[1] = 40;
  assert(Sim.cookDish(crowded, 1, 'festin').ok);
  fillPopulation(crowded, population);
  assert.match(Sim.cookDish(crowded, 1, 'festin').reason, /Population/, 'Population prioritaire sur préparation et ingrédients');
  Sim.tick(crowded, 15);
  assert.equal(crowded.units.length, 45);
}
const queued = createState();
queued.ingredients[1] = 40;
fillPopulation(queued, 41);
queued.queues[1].push({});
assert.match(Sim.cookDish(queued, 1, 'festin').reason, /Population/);
for (const difficulty of ['normal', 'facile']) {
  const aiState = createState();
  aiState.ingredients[1] = 40;
  aiState.rubies = [0, 0];
  const ai = createAI(1, difficulty);
  for (let step = 0; step < 40 && aiState.festin.readyAt === null; step++) {
    ai.update(aiState);
    Sim.tick(aiState, 0.1);
  }
  if (difficulty === 'normal') {
    assert(aiState.festin.readyAt !== null);
    assert(aiState.time < 5);
  } else {
    assert.equal(aiState.festin.readyAt, null);
  }
}
console.log('PASS : Festin, refus, serveur, déterminisme, ralliement, population et IA.');
