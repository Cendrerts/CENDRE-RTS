import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

for (const team of [0, 1]) {
  for (const difficulty of ['facile', 'normal']) {
    const state = Sim.create();
    state.rubies[team] = 1000;
    assert(Sim.construct(state, team, team ? 'niche_ordures' : 'garde_manger'));
    state.rubies[team] = 150;
    const controller = createAI(team, difficulty);
    for (let step = 0; step < 90; step++) {
      controller.update(state);
      if (state.queues[team].some((job) => job.type === 'hero')) {
        break;
      }
      Sim.tick(state, 0.1);
    }
    assert.equal(state.queues[team].some((job) => job.type === 'hero'), difficulty === 'normal');
    if (difficulty === 'normal') {
      assert(state.time < 10);
      // La mort autorise une nouvelle production, sans second héros vivant.
      Sim.tick(state, 35);
      assert(state.units.some((unit) => unit.team === team && unit.type === 'hero'));
      state.units = state.units.filter((unit) => unit.team !== team || unit.type !== 'hero');
      state.rubies[team] = 150;
      controller.update(state);
      assert(state.queues[team].some((job) => job.type === 'hero'));
    }
  }
}

for (const team of [0, 1]) {
  const state = Sim.create();
  state.rubies = [0, 0];
  Sim.spawn(state, 'hero', team);
  const hero = state.units.at(-1);
  hero.x = state.bases[team].x + (team ? -1000 : 1000);
  hero.y = state.bases[team].y;
  hero.hp = hero.max * 0.25;
  const orders = [];
  const originalOrder = Sim.order;
  Sim.order = (...args) => {
    orders.push(args);
    return originalOrder(...args);
  };
  try {
    const controller = createAI(team, 'normal');
    controller.update(state);
    state.time = 120;
    state.rubies[team] = 800;
    controller.update(state);
    const heroOrders = orders.filter(([, ids]) => ids.includes(hero.id));
    assert(heroOrders.length > 0);
    assert(heroOrders.every(([, , x, y, , retreat]) => retreat &&
      x === state.bases[team].x + (team ? -110 : 110) &&
      y === state.bases[team].y + (team ? 65 : -65)));
    // Une fois rentré, le héros rejoint la prochaine vague même sans soin.
    hero.x = state.bases[team].x + (team ? -110 : 110);
    hero.y = state.bases[team].y + (team ? 65 : -65);
    const waveSize = Math.ceil(12 * Sim.stats('knight', 0).hp / Sim.stats('knight', team).hp) + 1;
    for (let index = 0; index < waveSize; index++) {
      Sim.spawn(state, 'knight', team);
      const soldier = state.units.at(-1);
      soldier.x = hero.x;
      soldier.y = hero.y;
    }
    orders.length = 0;
    state.time = 240;
    state.rubies[team] = 0;
    controller.update(state);
    assert(orders.some(([, ids, , , , retreat]) => ids.length > 1 && ids.includes(hero.id) && !retreat));
  } finally {
    Sim.order = originalOrder;
  }
}

{
  const state = Sim.create();
  state.rubies = [0, 0];
  state.watchtowers = [];
  // Le militaire précède volontairement le Roi-Rat dans la liste.
  Sim.spawn(state, 'knight', 1);
  const rat = state.units.at(-1);
  Sim.spawn(state, 'hero', 1);
  const hero = state.units.at(-1);
  rat.x = hero.x;
  rat.y = hero.y;
  state.corpses.push({ id: 9999, x: hero.x - 150, y: hero.y, expiresAt: 100 });
  state.visible[1].fill(1);
  createAI(1, 'normal').update(state);
  assert.equal(hero.devour?.corpseId, 9999);
  assert.equal(rat.devour, undefined);
}

// La défense conserve le budget d'une unité avant de recruter le héros.
{
  const state = Sim.create();
  assert(Sim.construct(state, 0, 'garde_manger'));
  state.rubies[0] = 150;
  Sim.spawn(state, 'knight', 1);
  const enemy = state.units.at(-1);
  enemy.x = state.bases[0].x;
  enemy.y = state.bases[0].y;
  state.visible[0].fill(1);
  createAI(0, 'normal').update(state);
  assert(!state.queues[0].some((job) => job.type === 'hero'));
}

// Aucun héros sans bâtiment militaire ou sans trois places disponibles.
for (const production of [false, true]) {
  const state = Sim.create();
  if (production) {
    assert(Sim.construct(state, 0, 'garde_manger'));
    while (Sim.populationUsed(state, 0) < Sim.unitLimit(0) - 2) {
      Sim.spawn(state, 'knight', 0);
    }
  }
  state.rubies[0] = 150;
  createAI(0, 'normal').update(state);
  assert(!state.queues[0].some((job) => job.type === 'hero'));
}

// Un héros seul ne reçoit ni mission d'éclaireur ni mission de capture.
{
  const state = Sim.create();
  state.units = [];
  state.rubies = [0, 0];
  Sim.spawn(state, 'hero', 0);
  const hero = state.units.at(-1);
  state.time = 60;
  createAI(0, 'normal').update(state);
  assert.equal(hero.retreat, false);
  assert.equal(hero.target, null);
}

// Le héros compense son investissement dans le groupe de chasse initial.
{
  const state = Sim.create();
  state.watchtowers = [];
  state.rubies = [0, 0];
  for (let index = 0; index < 4; index++) {
    Sim.spawn(state, 'knight', 0);
  }
  Sim.spawn(state, 'hero', 0);
  state.visible[0].fill(1);
  createAI(0, 'normal').update(state);
  const hunters = state.units.filter((unit) => unit.team === 0 && unit.type !== 'commis');
  assert(hunters.every((unit) => unit.target?.type === 'sanglier'));
}

for (let game = 0; game < 3; game++) {
  const state = Sim.create();
  const controllers = [0, 1].map((team) => createAI(team, 'normal', state));
  const producedAt = [null, null];
  for (let step = 0; step < 7200 && state.winner === null; step++) {
    for (const team of game % 2 ? [1, 0] : [0, 1]) {
      if (state.time >= team * game) {
        controllers[team].update(state);
      }
    }
    Sim.tick(state, 0.1);
    for (const team of [0, 1]) {
      if (producedAt[team] === null && state.units.some((unit) => unit.team === team && unit.type === 'hero')) {
        producedAt[team] = state.time;
      }
    }
  }
  assert(producedAt.every((time) => time !== null && time < 480));
  console.log(`Partie ${game + 1} : héros produits à ${producedAt.map((time) => time.toFixed(1)).join(' / ')} s`);
}
