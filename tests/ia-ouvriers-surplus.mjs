import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

function scenario(difficulty = 'brutal', rubies = 1200, workerCount = 15, knownBase = true) {
  const state = Sim.create();
  state.units = [];
  state.slots[0] = [];
  state.camps = [];
  state.monsters = [];
  state.watchtowers = [];
  state.rubies[0] = rubies;
  const mines = [0, 2, 4].map((index) => ({ ...state.mines[index], index }));
  for (const mine of mines) {
    state.mines[mine.index].owner = 0;
    state.mines[mine.index].depot = true;
  }
  mines.sort((first, second) =>
    Math.hypot(first.x - state.bases[0].x, first.y - state.bases[0].y) -
    Math.hypot(second.x - state.bases[0].x, second.y - state.bases[0].y));
  for (let index = 0; index < workerCount; index++) {
    Sim.spawn(state, 'commis', 0);
    const worker = state.units.at(-1);
    const mine = mines[Math.min(2, Math.floor(index / 5))];
    worker.x = mine.x;
    worker.y = mine.y;
    Sim.gather(state, 0, [worker.id], mine.index);
  }
  while (state.units.length + state.queues[0].length < Sim.unitLimit(0)) {
    state.queues[0].push({ type: 'knight' });
  }
  const controller = createAI(0, difficulty);
  if (knownBase) controller.intelligence.bases.push({ ...state.bases[1] });
  state.visible[0].fill(0);
  const workers = [...state.units];
  const sent = () => workers.filter((worker) => worker.attackDestination?.x === state.bases[1].x &&
    worker.attackDestination?.y === state.bases[1].y && worker.retreat === false);
  const advance = (seconds) => {
    for (; state.time <= seconds; state.time += 0.25) {
      controller.update(state);
    }
  };
  return { state, workers, mines, sent, advance };
}

for (const difficulty of ['brutal', 'impitoyable']) {
  const test = scenario(difficulty);
  test.advance(9.75);
  assert.equal(test.sent().length, 0);
  test.advance(10);
  assert.equal(test.sent().length, 2);
  const exposedMine = test.mines.at(-1);
  assert(test.sent().every((worker) => worker.x === exposedMine.x && worker.y === exposedMine.y));
  assert(test.sent().every((worker) => worker.harvest === null));
  test.advance(19.75);
  assert.equal(test.sent().length, 2, 'Deux départs au plus par tranche de 10 s');
  test.advance(20);
  assert.equal(test.sent().length, 4);
  test.advance(30);
  assert.equal(test.sent().length, 5);
  assert.equal(test.workers.filter((worker) => worker.harvest).length, 10);
  test.advance(40);
  assert.equal(test.sent().length, 5, 'Dix ouvriers doivent rester disponibles');
}

for (const args of [
  ['brutal', 800],
  ['normal', 1200],
  ['facile', 1200],
  ['difficile', 1200],
  ['brutal', 1200, 10],
  ['brutal', 1200, 15, false],
]) {
  const test = scenario(...args);
  test.advance(30);
  assert.equal(test.sent().length, 0, JSON.stringify(args));
}

// Le mode D30 reste actif entre les seuils, puis rend les ouvriers à l'économie.
{
  const test = scenario();
  test.advance(10);
  test.state.rubies[0] = 800;
  test.advance(20);
  assert.equal(test.sent().length, 4);
  test.state.rubies[0] = 399;
  test.advance(30);
  assert.equal(test.sent().length, 0);
  assert.equal(test.workers.filter((worker) => worker.harvest).length, 15);
}
console.log('PASS: ouvriers en surplus, cadence, mine exposée, seuils et difficultés.');
