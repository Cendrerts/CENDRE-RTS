import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

function scenario(team) {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  state.watchtowers = [];
  state.braises = [];
  state.rubies = [0, 0];
  state.time = 240;
  return state;
}

function recruitAtRally(state, team, type) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  unit.x = state.bases[team].x + (team ? -110 : 110);
  unit.y = state.bases[team].y + (team ? 65 : -65);
  unit.path = [];
  return unit;
}

for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    for (const emergency of [false, true]) {
      const state = scenario(team);
      recruitAtRally(state, team, 'knight');
      const hero = recruitAtRally(state, team, 'hero');
      for (let index = 0; index < 14; index++) {
        recruitAtRally(state, team, 'knight');
      }
      Sim.spawn(state, 'knight', 1 - team);
      // Une observation lointaine active les deux gardes, sans menace locale.
      state.visible[team].fill(1);
      if (emergency) {
        state.rubies[team] = 800;
        // Les réserves dispersées imposent le passage par la vague de secours.
        for (const unit of state.units.filter((unit) => unit.team === team)) {
          unit.x += team ? -500 : 500;
        }
      }
      const controller = createAI(team, difficulty);
      controller.update(state);
      assert.equal(controller.metrics.waves, 1);
      assert.equal(hero.orderQueue.length > 0, difficulty === 'impitoyable' && emergency,
        'Impitoyable engage son héros dans la vague de secours uniquement');
      assert.equal(controller.metrics.waveSizes[0], 14,
        'Deux unités restent en garnison');
    }
  }
}


// Une partie prolongée doit pouvoir engager aussi les derniers gardes.
for (const team of [0, 1]) {
  const state = scenario(team);
  state.time = 1200;
  state.rubies[team] = 800;
  const hero = recruitAtRally(state, team, 'hero');
  for (let index = 0; index < 14; index++) {
    recruitAtRally(state, team, 'knight');
  }
  for (const unit of state.units) {
    unit.x += team ? -500 : 500;
  }
  Sim.spawn(state, 'knight', 1 - team);
  state.visible[team].fill(1);
  const controller = createAI(team, 'impitoyable');
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  assert.equal(controller.metrics.waveSizes[0], 15, 'Tous les gardes rejoignent les secours tardifs');
  assert(hero.orderQueue.length > 0);
}

console.log('PASS: garnison initiale conservée, héros engagé en secours par Impitoyable.');
