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
    for (const { emergency, time } of [
      { emergency: false, time: 240 },
      { emergency: true, time: 240 },
      { emergency: true, time: 1200 },
    ]) {
      const state = scenario(team);
      state.time = time;
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
      assert.equal(hero.orderQueue.length, 0,
        'La garnison conserve son héros, y compris pendant les secours');
      assert.equal(controller.metrics.waveSizes[0], 14,
        'Deux unités restent en garnison');
    }
  }
}

// Après le délai de trajet, les survivants blessés doivent aussi se regrouper.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = scenario(team);
    for (let index = 0; index < 16; index++) {
      recruitAtRally(state, team, 'knight');
    }
    Sim.spawn(state, 'knight', 1 - team);
    state.visible[team].fill(1);
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    for (const unit of state.units.filter((unit) => unit.team === team)) {
      unit.hp = Sim.stats('knight', 0).hp * 0.3;
      unit.path = [];
      unit.orderQueue = [];
    }
    state.time = 400;
    controller.update(state);
    assert.equal(controller.metrics.waves, 1,
      'Le délai de trajet ne doit pas relancer les survivants sous le seuil normal');
  }
}

// La disparition des ennemis observés ouvre une contre-attaque, sans force suffisante.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = scenario(team);
    for (let index = 0; index < 7; index++) {
      const unit = recruitAtRally(state, team, 'knight');
      unit.hp = Sim.stats('knight', 0).hp * 0.5;
    }
    for (let index = 0; index < 3; index++) {
      Sim.spawn(state, 'knight', 1 - team);
    }
    state.visible[team].fill(1);
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(controller.metrics.waves, 0);
    state.units = state.units.filter((unit) => unit.team === team);
    state.time += 1;
    controller.update(state);
    assert.equal(controller.metrics.waves, 0,
      'La fenêtre de contre-attaque ne doit pas lancer cinq blessés de force 2,5');
  }
}

// Au plafond, les blessés partent même sous le seuil de force normal.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = scenario(team);
    for (let index = 0; index < 9; index++) {
      const unit = recruitAtRally(state, team, 'knight');
      unit.hp = Sim.stats('knight', 0).hp * 0.5;
    }
    while (Sim.populationUsed(state, team) < Sim.unitLimit(team)) {
      recruitAtRally(state, team, 'commis');
    }
    Sim.spawn(state, 'knight', 1 - team);
    state.visible[team].fill(1);
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1,
      'Une population pleine doit lancer sept attaquants de force 3,5');
    assert.equal(controller.metrics.waveSizes[0], 7);
  }
}

console.log('PASS: garnison conservée, départ au plafond et seuil de force respecté sous le plafond.');
