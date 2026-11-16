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

// Une menace sur le trajet d'une extension ne doit pas rappeler puis relancer
// la même vague au plafond, même quand aucun ennemi n'est près d'une mine.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    for (const persistentThreat of [false, true]) {
      const state = scenario(team);
      for (let index = 0; index < 9; index++) {
        recruitAtRally(state, team, 'knight');
      }
      while (Sim.populationUsed(state, team) < Sim.unitLimit(team)) {
        recruitAtRally(state, team, 'commis');
      }
      Sim.spawn(state, 'knight', 1 - team);
      const enemy = state.units.at(-1);
      state.visible[team].fill(1);
      const controller = createAI(team, difficulty);
      controller.update(state);
      assert.equal(controller.metrics.waves, 1);
      const mine = state.mines[4];
      mine.owner = team;
      mine.depot = true;
      const worker = state.units.find((unit) => unit.team === team && unit.type === 'commis');
      worker.x = mine.x + 200;
      worker.y = mine.y;
      enemy.x = mine.x + 410;
      enemy.y = mine.y;
      for (let step = 1; step < 50; step++) {
        state.time = 240 + step * 0.2;
        if (!persistentThreat && step === 5) {
          state.units = state.units.filter((unit) => unit !== enemy);
        }
        controller.update(state);
        assert.equal(controller.metrics.waves, 1,
          'Aucune unité ne doit repartir moins de dix secondes après son départ');
      }
      state.time = 250.2;
      controller.update(state);
      assert.equal(controller.metrics.waves, persistentThreat ? 1 : 2,
        'Le plafond relance après dix secondes seulement si le rappel est terminé');
      if (persistentThreat) {
        state.time = 370;
        state.rubies[team] = 800;
        controller.update(state);
        assert.equal(controller.metrics.waves, 1,
          'La vague de secours respecte aussi le rappel économique');
      }
    }
  }
}

// Une menace lointaine sur un ouvrier bloque la vague du tick, sans annuler la tour.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = scenario(team);
    state.time = 30;
    const soldier = recruitAtRally(state, team, 'knight');
    const base = state.bases[team];
    const tower = { x: base.x + (team ? -200 : 200), y: base.y, owner: null };
    state.watchtowers = [tower];
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(soldier.retreat, true);
    soldier.path = [];
    const worker = recruitAtRally(state, team, 'commis');
    const mine = state.mines[4];
    worker.x = mine.x + 200;
    worker.y = mine.y;
    Sim.spawn(state, 'knight', 1 - team);
    const enemy = state.units.at(-1);
    enemy.x = mine.x + 410;
    enemy.y = mine.y;
    state.visible[team].fill(1);
    state.time = 150;
    state.rubies[team] = 800;
    const originalOrder = Sim.order;
    const orders = [];
    try {
      Sim.order = (...argumentsList) => {
        orders.push(argumentsList);
        return originalOrder(...argumentsList);
      };
      controller.update(state);
    } finally {
      Sim.order = originalOrder;
    }
    assert(orders.some(([, ids, x, y, , retreat]) =>
      ids.includes(soldier.id) && x === tower.x && y === tower.y && retreat),
    'La capture continue malgré le rappel économique lointain');
    assert.equal(controller.metrics.waves, 0);
  }
}

// Un envahisseur près de la tour principale laisse partir le secours et ses deux gardes.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = scenario(team);
    state.rubies[team] = 1000;
    const guard = recruitAtRally(state, team, 'knight');
    const hero = recruitAtRally(state, team, 'hero');
    for (let index = 0; index < 14; index++) {
      const unit = recruitAtRally(state, team, 'knight');
      unit.x += team ? -500 : 500;
    }
    Sim.spawn(state, 'knight', 1 - team);
    const enemy = state.units.at(-1);
    enemy.x = state.bases[team].x + (team ? -100 : 100);
    enemy.y = state.bases[team].y;
    state.visible[team].fill(1);
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1,
      'Un envahisseur à 100 px ne bloque pas la vague de secours');
    assert.equal(controller.metrics.waveSizes[0], 14);
    assert.equal(guard.orderQueue.length, 0);
    assert.equal(hero.orderQueue.length, 0);
  }
}

// La supériorité numérique engage la vague avant la découverte de la base adverse.
for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = scenario(team);
    state.time = 480;
    for (let index = 0; index < 16; index++) {
      recruitAtRally(state, team, 'knight');
    }
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1);
    assert.equal(controller.intelligence.bases.length, 0);
    const worker = recruitAtRally(state, team, 'commis');
    const mine = state.mines[4];
    worker.x = mine.x + 200;
    worker.y = mine.y;
    Sim.spawn(state, 'knight', 1 - team);
    const enemy = state.units.at(-1);
    enemy.x = mine.x + 410;
    enemy.y = mine.y;
    state.visible[team].fill(1);
    const enemyBase = state.bases[1 - team];
    const originalCanSee = Sim.canSee;
    const originalOrder = Sim.order;
    const orders = [];
    try {
      Sim.canSee = (currentState, observer, target) => {
        if (observer === team && target === enemyBase) return false;
        return originalCanSee(currentState, observer, target);
      };
      Sim.order = (...argumentsList) => {
        orders.push(argumentsList);
        return originalOrder(...argumentsList);
      };
      state.time += 1;
      controller.update(state);
    } finally {
      Sim.canSee = originalCanSee;
      Sim.order = originalOrder;
    }
    assert.equal(controller.intelligence.bases.length, 0);
    assert(orders.some(([, ids, , , , retreat]) => ids.includes(worker.id) && retreat),
      'La menace lointaine provoque bien une évacuation économique');
    assert(!orders.some(([, ids, x, y]) =>
      ids.some((id) => id !== worker.id) && x === enemy.x && y === enemy.y),
    'La vague supérieure engagée ne doit pas être rappelée vers la menace lointaine');
  }
}

console.log('PASS: garnison, plafond, seuil de force et absence de relance pendant le rappel économique.');
