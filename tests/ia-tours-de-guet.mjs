import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function setup(difficulty = 'normal') {
  const state = Sim.create();
  state.rubies = [0, 0];
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  const tower = [...state.watchtowers].sort((a, b) =>
    distance(a, state.bases[0]) - distance(b, state.bases[0]))[0];
  return { state, tower, controller: createAI(0, difficulty) };
}
const originalOrder = Sim.order;
let orders = [];
Sim.order = (...args) => {
  orders.push(args);
  return originalOrder(...args);
};
try {
  {
    const { state, tower, controller } = setup();
    const closest = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis')
      .sort((a, b) => distance(a, tower) - distance(b, tower))[0];
    orders = [];
    while (state.time < 90 && tower.owner !== 0) {
      controller.update(state);
      Sim.tick(state, 0.1);
    }
    assert.equal(tower.owner, 0, 'Capture de la tour proche avant 90 secondes');
    const captureOrders = orders.filter(([, , x, y]) => x === tower.x && y === tower.y);
    assert(captureOrders.length > 0);
    assert(captureOrders.every(([, ids]) => ids.length === 1 && ids[0] === closest.id));
    assert(distance(closest, tower) < 60);
    // La seconde tour est déjà alliée : vérifier le retour au ralliement.
    for (const candidate of state.watchtowers) {
      candidate.owner = 0;
    }
    state.time += 1;
    orders = [];
    controller.update(state);
    assert(orders.some(([, ids, x, y]) => ids.includes(closest.id) &&
      x === state.bases[0].x + 110 && y === state.bases[0].y - 65));
  }
  {
    const { state, tower, controller } = setup();
    for (let index = 0; index < 4; index++) {
      Sim.spawn(state, 'knight', 1);
      const enemy = state.units.at(-1);
      enemy.x = tower.x + 150;
      enemy.y = tower.y;
      enemy.hold = true;
      enemy.cool = 999;
    }
    orders = [];
    for (let step = 0; step < 300; step++) {
      state.visible[0].fill(1);
      controller.update(state);
      Sim.tick(state, 0.1);
    }
    assert(!orders.some(([, , x, y]) => state.watchtowers.some((candidate) =>
      x === candidate.x && y === candidate.y)), 'Aucun départ vers une tour menacée');
  }
  {
    const { state, tower, controller } = setup();
    orders = [];
    controller.update(state);
    const captureOrder = orders.find(([, , x, y]) => x === tower.x && y === tower.y);
    const capturer = state.units.find((unit) => unit.id === captureOrder[1][0]);
    state.time = 120;
    state.rubies[0] = 800;
    orders = [];
    controller.update(state);
    assert.equal(controller.metrics.waves, 1, 'La vague urgente interrompt la capture');
    assert(orders.some(([, ids]) => ids.includes(capturer.id)));
    assert(!orders.some(([, , x, y]) => x === tower.x && y === tower.y));
    state.time = 121;
    state.rubies[0] = 0;
    orders = [];
    controller.update(state);
    assert(!orders.some(([, , x, y]) => x === tower.x && y === tower.y));
  }
  {
    const { state, tower, controller } = setup();
    Sim.spawn(state, 'knight', 0);
    state.visible[0].fill(1);
    orders = [];
    controller.update(state);
    const captureOrder = orders.find(([, , x, y]) => x === tower.x && y === tower.y);
    const capturer = state.units.find((unit) => unit.id === captureOrder[1][0]);
    const hunters = state.units.filter((unit) => unit.team === 0 &&
      unit.type !== 'commis' && unit.id !== capturer.id);
    assert.equal(hunters.length, 6);
    assert(hunters.every((unit) => unit.target?.type === 'sanglier'),
      'Les six autres militaires continuent la chasse');
    assert.equal(capturer.target, null, 'La chasse ne détourne pas le captureur');
  }
  for (const difficulty of ['normal', 'difficile', 'brutal', 'impitoyable']) {
    const { state, tower, controller } = setup(difficulty);
    state.time = 60;
    orders = [];
    controller.update(state);
    const scouting = orders.find(([, , x, y, , retreat]) => retreat &&
      x === state.bases[1].x && y === state.bases[1].y);
    const capturing = orders.find(([, , x, y]) => x === tower.x && y === tower.y);
    assert(scouting);
    assert(capturing);
    assert(!capturing[1].includes(scouting[1][0]), 'L’éclaireur garde sa mission');
  }
  {
    const { state, tower, controller } = setup();
    Sim.spawn(state, 'knight', 1);
    const invader = state.units.at(-1);
    invader.x = state.bases[0].x;
    invader.y = state.bases[0].y;
    state.visible[0].fill(1);
    orders = [];
    controller.update(state);
    assert(!orders.some(([, , x, y]) => x === tower.x && y === tower.y),
      'La défense de base interdit une mission de capture');
  }
  for (const difficulty of ['facile', 'normal']) {
    const { state, tower, controller } = setup(difficulty);
    orders = [];
    controller.update(state);
    const captureOrder = orders.find(([, , x, y]) => x === tower.x && y === tower.y);
    if (difficulty === 'facile') {
      assert.equal(captureOrder, undefined);
      continue;
    }
    const id = captureOrder[1][0];
    state.units = state.units.filter((unit) => unit.id !== id);
    state.time = 1;
    controller.update(state);
    orders = [];
    for (let second = 2; second < 31; second++) {
      state.time = second;
      controller.update(state);
    }
    assert(!orders.some(([, , x, y]) => x === tower.x && y === tower.y), 'Délai de 30 s après décès');
    state.time = 31;
    controller.update(state);
    assert(orders.some(([, , x, y]) => x === tower.x && y === tower.y));
  }
} finally {
  Sim.order = originalOrder;
}

for (let game = 0; game < 3; game++) {
  const state = Sim.create();
  const controllers = [0, 1].map((team) => createAI(team, 'normal', state));
  const captured = [false, false];
  for (let step = 0; step < 7200 && state.winner === null; step++) {
    for (const team of game % 2 ? [1, 0] : [0, 1]) {
      if (state.time >= team * game) controllers[team].update(state);
    }
    Sim.tick(state, 0.1);
    for (const tower of state.watchtowers) {
      if (tower.owner >= 0) captured[tower.owner] = true;
    }
  }
  assert(captured.every(Boolean), `Partie ${game + 1} : chaque IA capture une tour`);
  console.log(`Partie ${game + 1} : tours capturées par les deux IA en ${state.time.toFixed(1)} s`);
}
