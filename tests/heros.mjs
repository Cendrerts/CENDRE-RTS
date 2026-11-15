import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { view, pack, unpack } from '../lib/match.mjs';
import { productionModel } from '../public/game/production.js';

function fresh() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  state.rubies = [1000, 1000];
  return state;
}

function killNear(state, hero, distance, type = 'knight', team = 1 - hero.team) {
  Sim.spawn(state, 'knight', hero.team);
  const attacker = state.units.at(-1);
  Sim.spawn(state, 'knight', team);
  const victim = state.units.at(-1);
  victim.type = type;
  victim.hp = 1;
  victim.x = hero.x;
  victim.y = hero.y - distance;
  victim.hold = true;
  attacker.x = victim.x + 10;
  attacker.y = victim.y;
  attacker.target = victim;
  attacker.cool = 0;
  state.visible[hero.team].fill(1);
  if (type === 'sanglier') {
    state.units.pop();
    victim.team = -1;
    victim.camp = 'test';
    victim.homeX = victim.x;
    victim.homeY = victim.y;
    state.camps.push({ name: 'test', x: victim.x, y: victim.y, respawnAt: null });
    victim.cool = 10;
    state.monsters.push(victim);
  }
  Sim.tick(state, 0.01);
  assert(victim.hp <= 0, 'La victime doit mourir au combat');
  state.units = state.units.filter((unit) => unit !== attacker && unit !== victim);
}

for (const team of [0, 1]) {
  const state = fresh();
  assert.equal(Sim.recruit(state, 'hero', team, 'main_' + team), true);
  assert.equal(state.rubies[team], 850);
  assert.equal(state.queues[team][0].remaining, 35);
  assert.equal(Sim.populationUsed(state, team), 3);
  assert.equal(Sim.recruitBlockReason(state, team, 'hero'), 'heroQueued');
  assert.equal(Sim.recruit(state, 'hero', team), false);
  Sim.tick(state, 34.99);
  assert.equal(state.units.length, 0);
  Sim.tick(state, 0.01);
  const hero = state.units[0];
  assert.equal(hero.type, 'hero');
  assert.equal(hero.hp, team === 0 ? 420 : 360);
  assert.equal(Sim.stats('hero', team).speed, team === 0 ? 90 : 101);
  assert.equal(hero.level, 1);
  assert.equal(hero.xp, 0);
  assert.equal(Sim.populationUsed(state, team), 3);
  assert.equal(Sim.recruitBlockReason(state, team, 'hero'), 'heroAlive');
  assert.equal(Sim.recruit(state, 'hero', team), false);
  assert(!productionModel(state, team).some((item) => item.type === 'hero'));
  hero.x = 450;
  hero.y = 1950;
  hero.hold = true;
  killNear(state, hero, 350);
  assert.equal(hero.xp, 20);
  killNear(state, hero, 450);
  assert.equal(hero.xp, 20);
  killNear(state, hero, 350, 'sanglier');
  assert.equal(hero.xp, 50);
  killNear(state, hero, 350, 'commis');
  assert.equal(hero.xp, 60);
  killNear(state, hero, 350);
  const previousHp = hero.hp;
  killNear(state, hero, 350);
  assert.equal(hero.xp, 100);
  assert.equal(hero.level, 2);
  assert.equal(hero.max, Sim.stats('hero', team).hp * 1.15);
  assert(Math.abs(hero.hp - previousHp - Sim.stats('hero', team).hp * 0.15) < 1e-8);

  const target = state.bases[1 - team];
  hero.x = target.x - 20;
  hero.y = target.y;
  hero.target = target;
  hero.cool = 0;
  const previousBaseHp = target.hp;
  state.visible[team].fill(1);
  Sim.tick(state, 0.01);
  assert(Math.abs(previousBaseHp - target.hp - Sim.stats('hero', team).damage * 1.15) < 1e-8);
  hero.target = null;
  hero.x = 450;
  hero.y = 1950;
  for (let index = 0; index < 10; index++) killNear(state, hero, 350);
  assert.equal(hero.level, 3);
  assert.equal(hero.max, Sim.stats('hero', team).hp * 1.3);
  const savedXp = hero.xp;
  state.visible[1 - team].fill(1);
  const enemySnapshot = view(state, 1 - team).units.find((unit) => unit.id === hero.id);
  assert.equal(enemySnapshot.level, 3);
  assert.equal(enemySnapshot.xp, savedXp);
  const snapshot = view(state, team).units.find((unit) => unit.id === hero.id);
  assert.equal(snapshot.level, 3);
  assert.equal(snapshot.xp, savedXp);
  assert.equal(unpack(pack(state)).heroProgress[team].xp, savedXp);

  Sim.spawn(state, 'knight', 1 - team);
  const killer = state.units.at(-1);
  killer.x = hero.x + 10;
  killer.y = hero.y;
  killer.target = hero;
  hero.hp = 1;
  hero.cool = 10;
  state.visible[1 - team].fill(1);
  Sim.tick(state, 0.01);
  assert(hero.hp <= 0);
  assert(state.corpses.some((corpse) => corpse.id === hero.id));
  state.units = [];
  const rubiesBeforeReturn = state.rubies[team];
  assert.equal(Sim.recruit(state, 'hero', team), true);
  assert.equal(state.rubies[team], rubiesBeforeReturn - 150);
  assert.equal(state.queues[team][0].remaining, 35);
  Sim.tick(state, 35);
  const returned = state.units[0];
  assert.equal(returned.level, 3);
  assert.equal(returned.xp, savedXp);
  assert.equal(returned.hp, returned.max);

  state.units = [];
  state.queues[team] = [];
  for (let index = 0; index < Sim.populationCap(state, team) - 2; index++) Sim.spawn(state, 'knight', team);
  assert.equal(Sim.recruitBlockReason(state, team, 'hero'), 'population');
  state.units.pop();
  assert.equal(Sim.recruit(state, 'hero', team), true);
  assert.equal(Sim.populationUsed(state, team), Sim.populationCap(state, team));
  assert.equal(Sim.recruitBlockReason(state, team, 'commis'), 'population');
  const heroJob = state.queues[team][0];
  assert.equal(Sim.cancelProduction(state, team, heroJob.producerId, heroJob.id), true);
  assert.equal(Sim.canRecruit(state, team, 'hero'), true);
  state.units = [];
  state.rubies[team] = 149;
  assert.equal(Sim.recruitBlockReason(state, team, 'hero'), 'rubies');
  assert.equal(Sim.canRecruit(state, team, 'hero', 'invalid'), false);
}
console.log('PASS : héros des deux factions, production unique, population, XP, niveaux, dégâts, résurrection et view.');
