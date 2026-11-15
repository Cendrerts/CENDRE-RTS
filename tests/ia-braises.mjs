import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const originalOrder = Sim.order;
let orders = [];
Sim.order = (...args) => {
  orders.push(args);
  return originalOrder(...args);
};
function setup(team = 0, difficulty = 'normal') {
  const state = Sim.create();
  state.time = 239.9;
  state.rubies = [0, 0];
  const base = state.bases[team];
  const rally = { x: base.x + (team ? -110 : 110), y: base.y + (team ? 65 : -65) };
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', team);
    Object.assign(state.units.at(-1), rally);
  }
  Sim.tick(state, 0.1);
  const foyer = [...state.braises].sort((a, b) => distance(a, base) - distance(b, base))[0];
  orders = [];
  return { state, rally, foyer, controller: createAI(team, difficulty) };
}
function advance(state, controller, seconds) {
  for (let step = 0; step < seconds * 10; step++) {
    controller.update(state);
    Sim.tick(state, 0.1);
  }
}
try {
  for (const team of [0, 1]) {
    const { state, rally, foyer, controller } = setup(team);
    controller.update(state);
    const departure = orders.find(([, , x, y]) => x === foyer.x && y === foyer.y);
    assert(departure);
    const ids = departure[1];
    assert(ids.length >= 1 && ids.length <= 3);
    assert(ids.every((id) => state.units.find((unit) => unit.id === id).type !== 'commis'));
    const scouting = orders.find(([, , x, y]) => x === state.bases[1 - team].x && y === state.bases[1 - team].y);
    assert(!scouting || !ids.includes(scouting[1][0]));
    const captureOrders = orders.filter(([, , x, y]) => state.watchtowers.some((tower) =>
      tower.x === x && tower.y === y));
    assert(!captureOrders.some(([, units]) => units.some((id) => ids.includes(id))));
    const excluded = new Set([...(scouting?.[1] || []), ...captureOrders.flatMap(([, units]) => units)]);
    const closest = state.units.filter((unit) => unit.team === team &&
      unit.type !== 'commis' && !excluded.has(unit.id))
      .sort((a, b) => distance(a, foyer) - distance(b, foyer))
      .slice(0, ids.length)
      .map((unit) => unit.id);
    assert.deepEqual(ids, closest, 'Les militaires disponibles les plus proches sont choisis');
    advance(state, controller, 39);
    assert.equal(foyer.holder, team, 'Le foyer est tenu avant 40 secondes');
    assert(ids.every((id) => distance(state.units.find((unit) => unit.id === id), foyer) < 150));
    advance(state, controller, 22);
    assert.equal(foyer.lit, false);
    assert(orders.some(([, units, x, y, , retreat]) => retreat &&
      ids.every((id) => units.includes(id)) && x === rally.x && y === rally.y));
    const returned = new Set();
    for (let step = 0; step < 390; step++) {
      advance(state, controller, 0.1);
      for (const id of ids) {
        if (distance(state.units.find((unit) => unit.id === id), rally) < 60) {
          returned.add(id);
        }
      }
    }
    assert.equal(returned.size, ids.length);
  }
  for (const scenario of ['defense', 'wave', 'emergency']) {
    const { state, foyer, controller } = setup();
    if (scenario === 'defense') {
      Sim.spawn(state, 'knight', 1);
      state.units.at(-1).x = state.bases[0].x;
      state.units.at(-1).y = state.bases[0].y;
      state.visible[0].fill(1);
    } else if (scenario === 'wave') {
      for (let index = 0; index < 7; index++) {
        Sim.spawn(state, 'knight', 0);
      }
    } else {
      state.rubies[0] = 800;
    }
    controller.update(state);
    assert(!orders.some(([, , x, y]) => x === foyer.x && y === foyer.y),
      `La mission respecte la priorité ${scenario}`);
    if (scenario !== 'defense') {
      assert.equal(controller.metrics.waves, 1);
    }
  }
  {
    const { state, foyer, controller } = setup();
    controller.update(state);
    const ids = orders.find(([, , x, y]) => x === foyer.x && y === foyer.y)[1];
    state.time += 1;
    state.rubies[0] = 800;
    orders = [];
    controller.update(state);
    assert.equal(controller.metrics.waves, 1, 'Une vague urgente interrompt la mission');
    assert.equal(controller.metrics.waveSizes[0], 6);
    assert(ids.every((id) => orders.at(-1)[1].includes(id)));
  }
  {
    const { state, foyer, controller } = setup(0, 'facile');
    advance(state, controller, 40);
    assert(!orders.some(([, , x, y]) => x === foyer.x && y === foyer.y));
  }
  {
    const { state, foyer, rally, controller } = setup();
    controller.update(state);
    const ids = orders.find(([, , x, y]) => x === foyer.x && y === foyer.y)[1];
    advance(state, controller, 39);
    for (let index = 0; index < 5; index++) {
      Sim.spawn(state, 'knight', 1);
      Object.assign(state.units.at(-1), { x: foyer.x + 80, y: foyer.y, hold: true, cool: 999 });
    }
    state.visible[0].fill(1);
    orders = [];
    state.time += 1;
    controller.update(state);
    assert(orders.some(([, units, x, y, , retreat]) => retreat &&
      ids.every((id) => units.includes(id)) && x === rally.x && y === rally.y));
    state.units = state.units.filter((unit) => unit.team !== 1 || unit.type === 'commis');
    const returned = new Set();
    for (let step = 0; step < 300; step++) {
      advance(state, controller, 0.1);
      for (const id of ids) {
        if (distance(state.units.find((unit) => unit.id === id), rally) < 60) {
          returned.add(id);
        }
      }
    }
    assert.equal(returned.size, ids.length);
    assert(!orders.some(([, , x, y]) => x === foyer.x && y === foyer.y), 'Pas de nouvel essai pendant cet allumage');
    advance(state, controller, 100);
    assert(orders.some(([, , x, y]) => x === foyer.x && y === foyer.y), 'Nouvel essai au prochain allumage');
  }
} finally {
  Sim.order = originalOrder;
}
console.log('PASS : IA braises, deux factions, Facile, abandon et retour au ralliement.');
