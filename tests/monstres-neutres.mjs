import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack, view, command } from '../lib/match.mjs';
import { resolveTap } from '../public/game/tap.js';

function advance(state, seconds) {
  const steps = Math.round(seconds / 0.05);
  for (let index = 0; index < steps; index++) S.tick(state, 0.05);
}
function hunter(state, team, x, y) {
  S.spawn(state, 'knight', team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, harvest: null, path: [], hold: true });
  S.visibility(state);
  return unit;
}
{
  const state = S.create();
  assert.equal(state.camps.length, 11);
  const boars = state.monsters.filter((monster) => monster.type === 'sanglier');
  assert.equal(boars.length, 18);
  assert.deepEqual(state.units.map((unit) => unit.id), [1, 2], 'Les monstres ne consomment pas les identifiants des armées');
  assert(state.monsters.every((monster) => monster.id < 0));
  for (const camp of state.camps) {
    if (camp.espece === 'sanglier') {
      assert.equal(boars.filter((monster) => monster.camp === camp.name).length, 2);
    }
    assert(state.camps.some((other) => other.x === S.W - camp.x && other.y === S.H - camp.y));
  }
  for (const monster of boars) {
    assert.equal(monster.hp, 220);
    assert(boars.some((other) => other.x === S.W - monster.x && other.y === S.H - monster.y));
  }
  assert.deepEqual(S.create(), state, 'Initialisation déterministe');
}
{
  const state = S.create();
  const camp = state.camps[0];
  const monster = state.monsters[0];
  const unit = hunter(state, 0, camp.x - 110, camp.y);
  unit.type = 'archer';
  S.tick(state, 0.05);
  assert.equal(monster.hp, monster.max, 'Aucun tir automatique sur un camp paisible');
  command(state, 0, { kind: 'move', ids: [unit.id], x: monster.x, y: monster.y, target: { id: monster.id } });
  S.tick(state, 0.05);
  assert.equal(monster.targetId, unit.id, 'Attaque explicite hors des 90 px : poursuite de l’attaquant');
  const restored = unpack(pack(state));
  S.tick(state, 0.05);
  S.tick(restored, 0.05);
  assert.deepEqual(restored, state, 'La poursuite reste déterministe après sérialisation');
}
{
  const state = S.create();
  const monster = state.monsters[0];
  const firstHunter = hunter(state, 0, monster.x, monster.y + 20);
  command(state, 0, { kind: 'move', ids: [firstHunter.id], x: monster.x, y: monster.y, target: { id: monster.id } });
  S.tick(state, 0.05);
  assert(monster.hp < monster.max);
  const lastHunter = hunter(state, 1, monster.x, monster.y - 20);
  monster.hp = 1;
  command(state, 1, { kind: 'move', ids: [lastHunter.id], x: monster.x, y: monster.y, target: { id: monster.id } });
  S.tick(state, 0.05);
  assert.deepEqual(state.ingredients.map((stock) => stock.viande), [0, 15], 'Le dernier coup prime sur le premier attaquant');
}
{
  const state = S.create();
  const monster = state.monsters[0];
  state.monsters = [monster];
  const unit = hunter(state, 0, monster.x, monster.y + 20);
  unit.retreat = true;
  S.tick(state, 0.05);
  assert.equal(unit.hp, unit.max - 12);
  advance(state, 1.1);
  assert.equal(unit.hp, unit.max - 12, 'Pas de deuxième coup avant 1,2 s');
  advance(state, 0.15);
  assert.equal(unit.hp, unit.max - 24, 'Deuxième coup après 1,2 s');
}
for (const team of [0, 1]) {
  const state = S.create();
  const monster = state.monsters[0];
  const unit = hunter(state, team, monster.x, monster.y + 20);
  monster.hp = 1;
  const tap = resolveTap(state, team, new Set([unit.id]), { x: monster.x, y: monster.y - 15 }, 1.3);
  assert.equal(tap.kind, 'attack');
  command(state, team, { kind: 'move', ids: [unit.id], x: monster.x, y: monster.y, target: { id: monster.id } });
  const restored = unpack(pack(state));
  assert.equal(restored.units.at(-1).target, restored.monsters[0]);
  S.tick(restored, 0.05);
  assert.equal(restored.ingredients[team].viande, 15);
  assert.equal(restored.ingredients[1 - team].viande, 0);
  assert.equal(restored.camps[0].respawnAt, null, 'Un camp partiellement vivant ne réapparaît pas');
  assert(view(restored, team).monsters.some((monster) => monster.camp === restored.camps[0].name));
  advance(restored, 0.1);
  assert.equal(restored.ingredients[team].viande, 15, 'Butin unique');
  assert.equal(view(restored, team).ingredients[team].viande, 15);
  assert.equal(view(restored, 1 - team).ingredients[team].viande, 0);
}
{
  const state = S.create();
  const monster = state.monsters[0];
  const camp = state.camps[0];
  const unit = hunter(state, 0, camp.x + 105, camp.y);
  advance(state, 2);
  assert.equal(unit.hp, unit.max, 'Passage hors des 90 px paisible');
  assert(state.monsters.every((monster) => monster.targetId === null));
  assert.equal(unit.autoTargetId, null, 'Aucune acquisition automatique des neutres paisibles');
  unit.x = monster.x;
  unit.y = monster.y + 20;
  S.visibility(state);
  S.tick(state, 0.05);
  assert.equal(unit.hp, unit.max - 12);
  assert.equal(unit.autoTargetId, monster.id, 'Riposte au sanglier qui attaque');
  monster.x = camp.x;
  monster.y = camp.y - 270;
  monster.hp = 10;
  S.tick(state, 0.05);
  assert(monster.returning);
  assert.equal(monster.targetId, null);
  assert.equal(monster.hp, 220);
  unit.x = 450;
  unit.y = 1750;
  advance(state, 10);
  assert(Math.hypot(monster.x - camp.x, monster.y - camp.y) < 2);
  assert.equal(monster.hp, 220);
  assert.equal(monster.returning, false);
}
{
  const state = S.create();
  const camp = state.camps[0];
  for (const monster of state.monsters.filter((monster) => monster.camp === camp.name)) {
    monster.hp = 0;
  }
  S.tick(state, 0.05);
  assert.equal(camp.respawnAt, state.time + 120);
  const restored = unpack(pack(state));
  advance(restored, 119.9);
  assert.equal(restored.monsters.filter((monster) => monster.camp === camp.name).length, 0);
  advance(restored, 0.15);
  assert.equal(restored.monsters.filter((monster) => monster.camp === camp.name).length, 2);
  assert.equal(restored.camps[0].respawnAt, null);
  assert.equal(view(restored, 0).monsters.length, 0, 'Brouillard multijoueur');
}
console.log('PASS : camps symétriques, chasse, butin, laisse, réapparition et état multijoueur.');
