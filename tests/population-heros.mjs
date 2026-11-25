import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

function workerScenario(freePlaces) {
  const state = Sim.create();
  state.units = [];
  state.slots[0] = [];
  state.camps = [];
  state.monsters = [];
  state.watchtowers = [];
  state.rubies[0] = 1200;
  const mines = [0, 2, 4].map((index) => ({ ...state.mines[index], index }));
  for (const mine of mines) {
    state.mines[mine.index].owner = 0;
    state.mines[mine.index].depot = true;
  }
  mines.sort((first, second) =>
    Math.hypot(first.x - state.bases[0].x, first.y - state.bases[0].y) -
    Math.hypot(second.x - state.bases[0].x, second.y - state.bases[0].y));
  Sim.spawn(state, 'hero', 0);
  for (let index = 0; index < 15; index++) {
    Sim.spawn(state, 'commis', 0);
    const worker = state.units.at(-1);
    const mine = mines[Math.min(2, Math.floor(index / 5))];
    worker.x = mine.x;
    worker.y = mine.y;
    Sim.gather(state, 0, [worker.id], mine.index);
  }
  while (Sim.populationUsed(state, 0) < Sim.unitLimit(0) - freePlaces) {
    state.queues[0].push({ type: 'knight' });
  }
  assert.equal(Sim.populationUsed(state, 0), Sim.unitLimit(0) - freePlaces);
  const workers = state.units.filter((unit) => unit.type === 'commis');
  const controller = createAI(0, 'brutal');
  controller.intelligence.bases.push({ ...state.bases[1] });
  state.visible[0].fill(0);
  for (; state.time <= 10; state.time += 0.25) {
    controller.update(state);
  }
  return workers.filter((worker) => worker.attackDestination?.x === state.bases[1].x &&
    worker.attackDestination?.y === state.bases[1].y && worker.retreat === false);
}

assert.equal(workerScenario(0).length, 2, 'Le héros compte pour trois places au plafond');
assert.equal(workerScenario(1).length, 0, 'Aucun départ sous le plafond');

function festinScenario(population) {
  const state = Sim.create();
  state.units = [];
  state.camps = [];
  state.monsters = [];
  state.ingredients[1].viande = 40;
  Sim.spawn(state, 'hero', 1);
  state.units.at(-1).hold = true;
  while (Sim.populationUsed(state, 1) < population) {
    Sim.spawn(state, 'knight', 1, state.bases[1]);
    state.units.at(-1).hold = true;
  }
  assert.equal(Sim.populationUsed(state, 1), population);
  return state;
}

for (const population of [42, 43]) {
  const state = festinScenario(population);
  const result = Sim.cookDish(state, 1, 'festin');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Population/);
}

const state = festinScenario(41);
assert.equal(Sim.cookDish(state, 1, 'festin').ok, true);
for (let step = 0; step < 160; step++) {
  Sim.tick(state, 0.1);
  assert(Sim.populationUsed(state, 1) <= 45, 'Le Festin respecte le plafond avec le Roi-Rat');
}
assert.equal(Sim.populationUsed(state, 1), 45);

// La population peut aussi augmenter pendant les quinze secondes de préparation.
const crowded = festinScenario(41);
assert.equal(Sim.cookDish(crowded, 1, 'festin').ok, true);
Sim.spawn(crowded, 'knight', 1, crowded.bases[1]);
Sim.tick(crowded, 15);
assert.equal(Sim.populationUsed(crowded, 1), 45);
console.log('PASS : population du héros, ouvriers en surplus et plafond du Festin.');
