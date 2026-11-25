import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

// Les décisions restent désactivées en Facile et la défense interrompt la chasse.
for (const difficulty of ['facile', 'normal', 'difficile', 'brutal', 'impitoyable']) {
  const state = Sim.create();
  // Isoler les décisions de chasse et de cuisine des missions de capture.
  state.watchtowers = [];
  state.rubies = [0, 0];
  state.ingredients[0] = 80;
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  state.visible[0].fill(1);
  const controller = createAI(0, difficulty);
  controller.update(state);
  const army = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis');
  if (difficulty === 'facile') {
    assert.equal(state.ragout.readyAt, null);
    assert(army.every((unit) => unit.target?.type !== 'sanglier'));
    continue;
  }
  assert.equal(state.ragout.readyAt, 20);
  const nearestCamp = [...state.camps].sort((a, b) =>
    Math.hypot(a.x - state.bases[0].x, a.y - state.bases[0].y) -
    Math.hypot(b.x - state.bases[0].x, b.y - state.bases[0].y))[0];
  assert(army.every((unit) => unit.target?.camp === nearestCamp.name));
  state.time = 21;
  state.ragout.readyAt = null;
  state.ragout.expiresAt = 65;
  Sim.spawn(state, 'knight', 1);
  const invader = state.units.at(-1);
  invader.x = state.mines[0].x;
  invader.y = state.mines[0].y;
  controller.update(state);
  assert(army.every((unit) => unit.target?.type !== 'sanglier'), 'La défense annule la chasse');
  assert.equal(state.ingredients[0], 40, 'Aucune cuisson pendant le bonus actif');
}

// D28 : les camps ne doivent jamais détourner une vague d'urgence.
for (const difficulty of ['normal', 'difficile', 'brutal']) {
  for (const rich of [false, true]) {
    for (const alreadyHunting of [false, true]) {
      const state = Sim.create();
      // Isoler les décisions de chasse et de cuisine des missions de capture.
      state.watchtowers = [];
      state.rubies[0] = 0;
      const controller = createAI(0, difficulty);
      const count = rich ? 4 : 29;
      for (let index = 0; index < (alreadyHunting ? 6 : count); index++) {
        Sim.spawn(state, 'knight', 0);
      }
      if (alreadyHunting) {
        state.visible[0].fill(1);
        controller.update(state);
        assert(state.units.some((unit) => unit.target?.type === 'sanglier'));
        const troops = state.units.filter((unit) => unit.team === 0 && unit.type === 'knight');
        for (const unit of troops.slice(count)) {
          state.units.splice(state.units.indexOf(unit), 1);
        }
        for (let index = troops.length; index < count; index++) {
          Sim.spawn(state, 'knight', 0);
        }
      }
      for (const unit of state.units.filter((unit) =>
        unit.team === 0 && unit.type !== 'commis')) {
        unit.x = 850;
        unit.y = 450;
        unit.path = [];
      }
      state.rubies[0] = rich ? 800 : 0;
      state.time = 120;
      state.visible[0].fill(0);
      assert(state.monsters.some((monster) => monster.hp > 0));
      controller.update(state);
      assert.equal(controller.metrics.waves, 1, `${difficulty}: emergency wave`);
      assert(state.units.every((unit) => unit.target?.type !== 'sanglier'));
    }
  }
}

// Une vague normale prête part aussi pendant une chasse.
for (const difficulty of ['normal', 'difficile', 'brutal']) {
  const state = Sim.create();
  // Isoler les décisions de chasse et de cuisine des missions de capture.
  state.watchtowers = [];
  state.rubies = [0, 0];
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  state.visible[0].fill(1);
  const controller = createAI(0, difficulty);
  controller.update(state);
  assert(state.units.some((unit) => unit.target?.type === 'sanglier'));
  for (let index = 6; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  for (const unit of state.units.filter((unit) =>
    unit.team === 0 && unit.type !== 'commis')) {
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.time = 240;
  controller.update(state);
  assert.equal(controller.metrics.waves, 1, `${difficulty}: normal wave`);
  assert(state.units.every((unit) => unit.target?.type !== 'sanglier'));
}

// En Normal, l'éclaireur militaire conserve sa mission pendant la chasse.
{
  const state = Sim.create();
  // Isoler les décisions de chasse et de cuisine des missions de capture.
  state.watchtowers = [];
  state.rubies = [0, 0];
  for (let index = 0; index < 7; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  state.time = 60;
  state.visible[0].fill(1);
  const army = state.units.filter((unit) => unit.team === 0 && unit.type === 'knight');
  createAI(0, 'normal').update(state);
  assert.equal(army[0].target, null);
  assert(army[0].retreat);
  assert(army.slice(1).every((unit) => unit.target?.type === 'sanglier'));
}

// Les raiders déjà affectés ne reçoivent aucun ordre de chasse.
{
  const state = Sim.create();
  // Isoler les décisions de chasse et de cuisine des missions de capture.
  state.watchtowers = [];
  state.rubies = [0, 0];
  for (let index = 0; index < 10; index++) {
    Sim.spawn(state, 'archer', 0);
  }
  Sim.spawn(state, 'knight', 1);
  const enemy = state.units.at(-1);
  enemy.x = state.bases[0].x;
  enemy.y = state.bases[0].y;
  state.time = 181;
  state.visible[0].fill(1);
  const orders = [];
  const originalOrder = Sim.order;
  Sim.order = (...args) => {
    orders.push(args);
    return originalOrder(...args);
  };
  try {
    const controller = createAI(0, 'difficile');
    controller.update(state);
    const raiderIds = orders.filter(([, , x, y]) =>
      x === state.mines[1].x && y === state.mines[1].y)
      .flatMap(([, ids]) => ids);
    assert.equal(raiderIds.length, 3);
    state.units.splice(state.units.indexOf(enemy), 1);
    orders.length = 0;
    state.time = 182;
    controller.update(state);
    assert(orders.every(([, ids, , , target]) =>
      target?.type !== 'sanglier' || ids.every((id) => !raiderIds.includes(id))));
  } finally {
    Sim.order = originalOrder;
  }
}

// Une rencontre loin de la base interrompt la chasse au même tick.
for (const difficulty of ['normal', 'difficile', 'brutal']) {
  const state = Sim.create();
  // Isoler les décisions de chasse et de cuisine des missions de capture.
  state.watchtowers = [];
  state.rubies = [0, 0];
  const camp = state.camps.find((candidate) => candidate.name === 'camp-nord-est');
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  const hunters = state.units.filter((unit) => unit.team === 0 && unit.type === 'knight');
  for (const unit of hunters) {
    unit.x = camp.x;
    unit.y = camp.y;
  }
  // Ce camp est le seul disponible pour rendre la destination déterministe.
  state.monsters = state.monsters.filter((monster) => monster.camp === camp.name);
  state.visible[0].fill(1);
  const controller = createAI(0, difficulty);
  controller.update(state);
  assert(hunters.every((unit) => unit.target?.camp === camp.name));
  for (let index = 0; index < 6; index++) {
    Sim.spawn(state, 'knight', 1);
    const enemy = state.units.at(-1);
    enemy.x = camp.x + 85;
    enemy.y = camp.y;
  }
  // La prochaine réaction Normal est à t = 1 ; l'ennemi arrive juste avant.
  state.time = 1;
  state.visible[0].fill(1);
  controller.update(state);
  assert(hunters.every((unit) => unit.target?.type !== 'sanglier'));
  assert(hunters.every((unit) => unit.target?.team === 1));
  for (let step = 0; step < 9; step++) {
    Sim.tick(state, 0.1);
    controller.update(state);
  }
  assert(hunters.every((unit) => unit.target?.team === 1));
}

for (let game = 0; game < 3; game++) {
  const state = Sim.create();
  // Démarrer avec des escouades de chasse pour tester la cuisine dès qu'elle
  // est possible, indépendamment du délai de construction des producteurs.
  for (const team of [0, 1]) {
    for (let index = 0; index < 6; index++) {
      Sim.spawn(state, 'knight', team);
    }
  }
  const controllers = [0, 1].map((team) => createAI(team, 'normal', state));
  const kills = [0, 0];
  let cooked = 0;
  let eaten = 0;
  for (let step = 0; step < 7200 && state.winner === null; step++) {
    for (const team of game % 2 ? [1, 0] : [0, 1]) {
      if (state.time < team * game) continue;
      const readyAt = state.ragout.readyAt;
      controllers[team].update(state);
      if (readyAt === null && state.ragout.readyAt !== null) cooked++;
    }
    const monsters = state.monsters.filter((monster) => monster.hp > 0);
    const ingredients = [...state.ingredients];
    const previousEvents = new Set(state.devourEvents);
    Sim.tick(state, 0.1);
    eaten += state.devourEvents.filter((event) =>
      !previousEvents.has(event) && event.team === 1).length;
    const dead = monsters.filter((monster) => monster.hp <= 0).length;
    if (dead) {
      for (const team of [0, 1]) {
        const gain = state.ingredients[team] - ingredients[team];
        const meals = state.devourEvents.filter((event) =>
          !previousEvents.has(event) && event.team === team)
          .reduce((sum, event) => sum + event.amount, 0);
        kills[team] += (gain - meals) / 15;
      }
    }
  }
  console.log(`Partie ${game + 1} : ${state.time.toFixed(1)} s, Sangliers ${kills}, Ragoûts ${cooked}, dévorations ${eaten}`);
  assert(kills.every((count) => count >= 1), 'Chaque IA tue un Sanglier');
  assert(cooked >= 1, 'Les Cuistots lancent le Ragoût');
  assert(eaten >= 1, 'Les Rats dévorent un cadavre');
}
