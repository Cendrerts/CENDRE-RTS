import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command, pack, unpack } from '../lib/match.mjs';
import { resolveTap } from '../public/game/tap.js';

function fresh() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  return state;
}
function spawn(state, type, team, x = 2000, y = 1100) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, hold: true, path: [], harvest: null });
  Sim.visibility(state);
  return unit;
}
function advance(state, seconds) {
  for (let step = 0; step < Math.round(seconds / 0.05); step++) {
    Sim.tick(state, 0.05);
  }
}
{
  const state = fresh();
  const soldier = spawn(state, 'knight', 0);
  const chef = spawn(state, 'hero', 0);
  const target = state.bases[1];
  soldier.x = target.x - 40;
  soldier.y = target.y;
  chef.y = soldier.y;
  for (const [distance, active, multiplier] of [[200, true, 1.25], [300, true, 1.15], [200, false, 1], [250, true, 1.15]]) {
    chef.x = soldier.x - distance;
    soldier.ragoutUntil = active ? state.time + 45 : 0;
    soldier.target = target;
    soldier.cool = 0;
    state.visible[0].fill(1);
    const health = target.hp;
    Sim.tick(state, 0.01);
    assert(Math.abs(health - target.hp - Sim.stats('knight', 0).damage * multiplier) < 1e-8);
  }
  chef.hp = 0;
  soldier.ragoutUntil = state.time + 45;
  soldier.cool = 0;
  const health = target.hp;
  Sim.tick(state, 0.01);
  assert(Math.abs(health - target.hp - Sim.stats('knight', 0).damage * 1.15) < 1e-8);
}
for (const alive of [true, false]) {
  const state = fresh();
  const chef = spawn(state, 'hero', 0);
  chef.hp = alive ? chef.max : 0;
  state.ingredients[0].viande = 120;
  for (let meal = 0; meal < 3; meal++) {
    assert.equal(Sim.cookDish(state, 0).ok, true);
    advance(state, 19.9);
    assert.equal(state.heroProgress[0].xp, alive ? meal * 40 : 0);
    advance(state, 0.1);
    assert.equal(state.heroProgress[0].xp, alive ? (meal + 1) * 40 : 0);
  }
  assert.equal(state.heroProgress[0].level, alive ? 2 : 1);
  assert.deepEqual(unpack(pack(state)).heroProgress, state.heroProgress);
}
for (const corpseType of ['knight', 'sanglier']) {
  const state = fresh();
  const king = spawn(state, 'hero', 1);
  king.hp = king.max / 2;
  const health = king.hp;
  const corpse = { id: 9999, x: king.x + 10, y: king.y, type: corpseType, team: 0, expiresAt: 30 };
  state.corpses.push(corpse);
  king.x -= 100;
  Sim.visibility(state);
  for (const scale of [0.4, 1, 2]) {
    const action = resolveTap(state, 1, new Set([king.id]), { x: corpse.x + 21 / scale, y: corpse.y }, scale);
    assert.equal(action.kind, 'devour');
    assert.deepEqual(action.ids, [king.id]);
  }
  king.x = corpse.x - 10;
  command(state, 1, { kind: 'devour', ids: [king.id], corpseId: corpse.id });
  Sim.tick(state, 0.05);
  assert(king.devour?.startedAt != null);
  advance(state, 2.9);
  assert.equal(king.xp, 0);
  assert.equal(state.ingredients[1].viande, 0);
  assert.equal(state.corpses.length, 1);
  advance(state, 0.1);
  assert.equal(king.xp, 40);
  assert.equal(state.heroProgress[1].xp, 40);
  assert.equal(state.ingredients[1].viande, corpseType === 'sanglier' ? 10 : 6);
  assert.equal(king.hp, health + king.max * 0.3);
  assert.equal(state.corpses.length, 0);
  state.corpses.push({ ...corpse, expiresAt: state.time + 30 });
  command(state, 1, { kind: 'devour', ids: [king.id], corpseId: corpse.id });
  Sim.tick(state, 0.05);
  advance(state, 2);
  const enemy = spawn(state, 'archer', 0, king.x + 15, king.y);
  enemy.target = king;
  state.visible[0].fill(1);
  Sim.tick(state, 0.05);
  assert.equal(king.devour, null);
  state.units = state.units.filter((unit) => unit !== enemy);
  advance(state, 4);
  assert.equal(king.xp, 40);
  assert.equal(state.corpses.length, 1);
}
console.log('PASS : Goûteur, XP des plats, Glouton en 3 s, gains, interruption et tap du Roi-Rat.');
