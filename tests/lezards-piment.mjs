import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command, view } from '../lib/match.mjs';
import { resolveTap } from '../public/game/tap.js';

const lizardCamps = ['camp-chemin-nord-est', 'camp-chemin-sud-ouest'];
const step = 0.05;

function livingMonsters(state, camp) {
  return state.monsters.filter((monster) => monster.camp === camp.name && monster.hp > 0);
}

function spawnKnight(state, x, y) {
  Sim.spawn(state, 'knight', 0);
  const knight = state.units.at(-1);
  Object.assign(knight, { x, y });
  return knight;
}

{
  const state = Sim.create();
  assert.equal(state.camps.length, 10);
  assert.deepEqual(state.camps.filter((camp) => camp.espece === 'lezard').map((camp) => camp.name), lizardCamps);
  for (const camp of state.camps) {
    const lizards = lizardCamps.includes(camp.name);
    const type = lizards ? 'lezard' : 'sanglier';
    const offsets = lizards ? [-30, 0, 30] : [-24, 24];
    const hp = lizards ? 90 : 220;
    assert.equal(camp.espece, type);
    assert.deepEqual(livingMonsters(state, camp).map((monster) => [monster.type, monster.x - camp.x, monster.y, monster.hp]),
      offsets.map((offset) => [type, offset, camp.y, hp]));
  }

  const restored = Sim.restore(Sim.serialize(state));
  assert.deepEqual(restored.camps, state.camps);
  assert.deepEqual(restored.monsters, state.monsters);

  // Reproduire un camp de Sangliers de #273 qui attend sa réapparition.
  const legacyCamp = restored.camps.find((camp) => camp.name === lizardCamps[0]);
  for (const camp of restored.camps) delete camp.espece;
  restored.monsters = restored.monsters.filter((monster) => monster.type === 'sanglier');
  legacyCamp.respawnAt = restored.time + step;
  const legacy = Sim.restore(Sim.serialize(restored));
  assert(legacy.camps.every((camp) => camp.espece === 'sanglier'));
  Sim.tick(legacy, step);
  const respawned = livingMonsters(legacy, legacyCamp);
  assert.equal(respawned.length, 2);
  assert(respawned.every((monster) => monster.type === 'sanglier' && monster.hp === 220));
}

{
  const state = Sim.create();
  const camp = state.camps.find((camp) => camp.name === lizardCamps[1]);
  const knights = [-36, -12, 12, 36].map((offset) => spawnKnight(state, camp.x + offset, camp.y + 90));
  const ids = knights.map((knight) => knight.id);
  const initialStock = { ...state.ingredients[0] };
  const lizards = livingMonsters(state, camp);
  assert(!view(state, 0).monsters.some((monster) => monster.camp === camp.name));
  Sim.visibility(state);
  assert.deepEqual(view(state, 0).monsters.filter((monster) => monster.camp === camp.name).map((monster) => monster.id),
    lizards.map((monster) => monster.id));
  const tap = resolveTap(state, 0, new Set(ids), { x: camp.x, y: camp.y - 10 }, 1.3);
  assert.equal(tap.kind, 'attack');
  assert.equal(tap.target.id, lizards[1].id);
  Sim.tick(state, step);
  assert(lizards.every((monster) => monster.hp === 90), 'Les lézards paisibles ne sont pas attaqués');
  command(state, 0, { kind: 'attackMove', ids, x: camp.x, y: camp.y });

  while (state.time < 30 && livingMonsters(state, camp).length) Sim.tick(state, step);
  assert.equal(livingMonsters(state, camp).length, 0, 'Quatre Garde-Manger vident le camp');
  assert.equal(state.ingredients[0].epices, initialStock.epices + 24);
  assert.equal(state.ingredients[0].viande, initialStock.viande);
  assert.equal(state.ingredients[1].epices, 0);
  assert(!state.corpses.some((corpse) => corpse.type === 'lezard' || lizards.some((monster) => monster.id === corpse.id)));
  assert.equal(camp.respawnAt, state.time + 120);

  state.units = [];
  while (state.time + step < camp.respawnAt) {
    Sim.tick(state, step);
    assert.equal(livingMonsters(state, camp).length, 0);
  }
  Sim.tick(state, step);
  const respawned = livingMonsters(state, camp);
  assert.equal(respawned.length, 3);
  assert(respawned.every((monster) => monster.type === 'lezard' && monster.hp === 90));
  assert.equal(camp.respawnAt, null);
}

{
  const state = Sim.create();
  const camp = state.camps.find((camp) => camp.name === lizardCamps[1]);
  const monster = livingMonsters(state, camp)[1];
  const knight = spawnKnight(state, camp.x, camp.y + 20);
  knight.retreat = true;
  Sim.tick(state, step);
  assert.equal(knight.hp, knight.max - 7);
  assert.equal(monster.cool, 0.8);
  assert.equal(monster.targetId, knight.id);

  knight.x = camp.x + 310;
  knight.y = camp.y;
  monster.hp = 12;
  while (state.time < 15 && !monster.returning) Sim.tick(state, step);
  assert(monster.returning);
  assert(Math.hypot(monster.x - camp.x, monster.y - camp.y) >= 260 - Sim.stats('lezard', -1).speed * step);
  assert.equal(monster.targetId, null);
  assert.equal(monster.hp, 90);
  while (state.time < 30 && monster.returning) Sim.tick(state, step);
  assert(!monster.returning);
  assert(Math.hypot(monster.x - camp.x, monster.y - camp.y) < 2);
  assert.equal(monster.hp, 90);
}

console.log('PASS Lézards-Piment : camps, ciblage, butin, réapparition, laisse et sauvegardes.');
