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
function advance(state, controller, seconds) {
  for (let step = 0; step < Math.round(seconds * 10); step++) {
    controller.update(state);
    Sim.tick(state, 0.1);
  }
}
function setup(team = 0) {
  const state = Sim.create();
  state.rubies = [0, 0];
  state.monsters = [];
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', team);
  }
  const controller = createAI(team, 'normal');
  const base = state.bases[team];
  const tower = [...state.watchtowers].sort((a, b) => distance(a, base) - distance(b, base))[0];
  orders = [];
  controller.update(state);
  const departure = orders.find(([, , x, y]) => x === tower.x && y === tower.y);
  assert(departure, 'Une unité part capturer la tour');
  const capturer = state.units.find((unit) => unit.id === departure[1][0]);
  const startingDistance = distance(capturer, tower);
  while (distance(capturer, tower) > startingDistance / 2 && state.time < 30) {
    advance(state, controller, 0.1);
  }
  assert(capturer.retreat);
  return { state, controller, tower, capturer, base };
}
try {
  for (const duringCapture of [false, true]) {
    for (const ending of ['death', 'hidden']) {
      const { state, controller, tower, capturer, base } = setup(1);
      if (duringCapture) {
        while (distance(capturer, tower) >= 60) {
          advance(state, controller, 0.1);
        }
      }
      Sim.spawn(state, 'knight', 0);
      const attacker = state.units.at(-1);
      Object.assign(attacker, { x: capturer.x + 10, y: capturer.y, hold: true, cool: 0 });
      Sim.order(state, [attacker.id], capturer.x, capturer.y, capturer, false);
      const initialHp = capturer.hp;
      const attackStartedAt = state.time;
      Sim.tick(state, 0.1);
      while (state.time - attackStartedAt < 3 && capturer.retreat) {
        advance(state, controller, 0.1);
      }
      assert(capturer.hp < initialHp, 'Le Garde-Manger inflige réellement des dégâts');
      assert.equal(capturer.retreat, false, 'Riposte en moins de trois secondes');
      assert.equal(capturer.target, attacker, 'La cible est l’attaquant');
      assert.notEqual(tower.owner, 1, 'La capture est abandonnée');
      orders = [];
      if (ending === 'death') {
        attacker.hp = 0;
      } else {
        attacker.x = state.bases[0].x;
        attacker.y = state.bases[0].y;
        attacker.target = null;
      }
      advance(state, controller, 1.5);
      assert(orders.some(([, ids, x, y]) => ids.includes(capturer.id) &&
        x === base.x - 110 && y === base.y + 65), 'Retour au ralliement après le combat');
      advance(state, controller, 20);
      assert(!orders.some(([, , x, y]) => x === tower.x && y === tower.y),
        'Aucun nouvel essai pendant le délai de trente secondes');
    }
  }
  {
    const { state, controller, tower, capturer, base } = setup(1);
    Sim.spawn(state, 'knight', 0);
    const attacker = state.units.at(-1);
    Object.assign(attacker, { x: capturer.x + 10, y: capturer.y, hold: true, cool: 0 });
    Sim.order(state, [attacker.id], capturer.x, capturer.y, capturer, false);
    Sim.tick(state, 0.1);
    advance(state, controller, 1.5);
    assert.equal(capturer.target, attacker, 'La riposte précède la défense');

    // Garder l’ancien attaquant visible, vivant et à distance de la nouvelle capture.
    const observationPoint = { x: base.x, y: base.y + 1100 };
    Object.assign(attacker, { ...observationPoint, hp: 1000000, cool: Infinity, target: null });
    Sim.order(state, [attacker.id], observationPoint.x, observationPoint.y, null, true);
    Sim.spawn(state, 'commis', 1);
    const observer = state.units.at(-1);
    const advanceObserved = (seconds) => {
      for (let step = 0; step < Math.round(seconds * 10); step++) {
        Object.assign(observer, { ...observationPoint, hp: 1000000 });
        advance(state, controller, 0.1);
      }
    };
    Sim.spawn(state, 'knight', 0);
    const invader = state.units.at(-1);
    Object.assign(invader, { x: base.x - 100, y: base.y, cool: Infinity, hold: true });
    orders = [];
    advanceObserved(1.5);
    assert(orders.some(([, ids, x, y]) => ids.includes(capturer.id) &&
      x === invader.x && y === invader.y), 'La défense interrompt la riposte');
    invader.hp = 0;
    orders = [];
    let departure;
    const defenseEndedAt = state.time;
    while (!departure && state.time - defenseEndedAt < 45) {
      advanceObserved(0.1);
      departure = orders.find(([, , x, y, , retreat]) => x === tower.x && y === tower.y && retreat);
    }
    assert(departure, 'Une nouvelle capture commence après la défense');
    const nextCapturer = state.units.find((unit) => unit.id === departure[1][0]);
    while (tower.owner !== 1 && state.time - defenseEndedAt < 90) {
      advanceObserved(0.1);
    }
    assert.equal(tower.owner, 1, 'La nouvelle capture réussit');
    orders = [];
    advanceObserved(3);
    assert(attacker.hp > 0, 'L’ancien attaquant est toujours vivant');
    assert(Sim.canSee(state, 1, attacker), 'L’ancien attaquant est toujours visible');
    assert(orders.some(([, ids, x, y]) => ids.includes(nextCapturer.id) &&
      x === base.x - 110 && y === base.y + 65), 'Retour au ralliement dans les trois secondes après la nouvelle capture');
  }
  {
    const { state, controller, capturer } = setup(1);
    Sim.spawn(state, 'commis', 0);
    const attacker = state.units.at(-1);
    Object.assign(attacker, { x: capturer.x + 5, y: capturer.y, cool: 0 });
    Sim.order(state, [attacker.id], capturer.x, capturer.y, capturer, false);
    const initialHp = capturer.hp;
    Sim.tick(state, 0.1);
    advance(state, controller, 1.5);
    assert(capturer.hp < initialHp, 'L’ouvrier inflige des dégâts');
    assert.equal(capturer.retreat, false, 'Le captureur riposte aussi contre un ouvrier');
    assert.equal(capturer.target, attacker);
  }
  {
    const { state, controller, tower, capturer, base } = setup();
    while (state.time < 90 && tower.owner !== 0) {
      advance(state, controller, 0.1);
    }
    assert.equal(tower.owner, 0, 'Sans attaque, la tour est capturée');
    for (const candidate of state.watchtowers) {
      candidate.owner = 0;
    }
    orders = [];
    advance(state, controller, 1.5);
    assert(orders.some(([, ids, x, y]) => ids.includes(capturer.id) &&
      x === base.x + 110 && y === base.y - 65), 'Retour après capture');
  }
  {
    const { state, controller, tower, capturer } = setup(1);
    const foyer = state.braises[0];
    // Un foyer allumé sur le trajet : les dégâts viennent de la simulation.
    foyer.x = capturer.x;
    foyer.y = capturer.y;
    state.time = 240;
    const initialHp = capturer.hp;
    orders = [];
    advance(state, controller, 1.5);
    assert(capturer.hp < initialHp, 'Le Rats-Goût subit la brûlure du foyer');
    assert(capturer.retreat, 'La brûlure seule ne déclenche aucune riposte');
    assert(!orders.some(([, ids, , , target]) => ids.includes(capturer.id) && target),
      'Aucun ordre d’attaque pour une brûlure');
    while (state.time < 300 && tower.owner !== 1) {
      advance(state, controller, 0.1);
    }
    assert.equal(tower.owner, 1, 'La capture continue malgré la brûlure');
  }
} finally {
  Sim.order = originalOrder;
}
console.log('Capture : riposte, abandon, retour et brûlure vérifiés');
