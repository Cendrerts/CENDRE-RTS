import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

// Les décisions restent désactivées en Facile et la défense interrompt la chasse.
for (const difficulty of ['facile', 'normal', 'difficile', 'brutal', 'impitoyable']) {
  const state = Sim.create();
  state.rubies = [0, 0];
  state.ingredients[0] = 80;
  for (let index = 0; index < 6; index++) Sim.spawn(state, 'knight', 0);
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

for (let game = 0; game < 3; game++) {
  const state = Sim.create();
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
    eaten += state.devourEvents.filter((event) => !previousEvents.has(event) && event.team === 1).length;
    const dead = monsters.filter((monster) => monster.hp <= 0).length;
    if (dead) {
      for (const team of [0, 1]) {
        const gain = state.ingredients[team] - ingredients[team];
        const meals = state.devourEvents.filter((event) => !previousEvents.has(event) && event.team === team)
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
