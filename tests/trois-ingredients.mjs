import assert from 'node:assert/strict';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';

const empty = { viande: 0, epices: 0, conserves: 0 };

function spawnAt(state, team, x, y) {
  Sim.spawn(state, 'knight', team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, hold: true });
  Sim.visibility(state);
  return unit;
}

function attack(state, unit, target) {
  command(state, unit.team, {
    kind: 'move', ids: [unit.id], x: target.x, y: target.y, target: { id: target.id },
  });
  Sim.tick(state, 0.05);
  assert(target.hp <= 0);
}

{
  const state = Sim.create();
  assert.deepEqual(state.ingredients, [empty, empty]);
  const boar = state.monsters[0];
  boar.hp = 1;
  const hunter = spawnAt(state, 0, boar.x, boar.y + 20);
  attack(state, hunter, boar);
  assert.deepEqual(state.ingredients, [{ ...empty, viande: 15 }, empty]);
}

{
  const state = Sim.create();
  state.monsters = [];
  const rat = spawnAt(state, 1, 2000, 1100);
  const victim = spawnAt(state, 0, 2010, 1100);
  victim.hp = 1;
  attack(state, rat, victim);
  command(state, 1, { kind: 'devour', ids: [rat.id], corpseId: victim.id });
  for (let step = 0; step < 81; step++) Sim.tick(state, 0.05);
  assert.deepEqual(state.ingredients, [empty, { ...empty, viande: 6 }]);
}

{
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.time = 240;
  const foyer = state.braises[0];
  spawnAt(state, 1, foyer.x, foyer.y);
  for (let step = 0; step < 100; step++) Sim.tick(state, 0.05);
  const ratStock = { ...empty, epices: 6 };
  assert.deepEqual(state.ingredients, [empty, ratStock]);
  assert.deepEqual(view(state, 0).ingredients, [empty, empty]);
  assert.deepEqual(view(state, 1).ingredients, [empty, ratStock]);
}

for (const [team, dish] of [[0, 'ragout'], [1, 'festin']]) {
  const state = Sim.create();
  const stock = state.ingredients[team];
  Object.assign(stock, { viande: 39, epices: 100 });
  assert.deepEqual(Sim.cookDish(state, team, dish), { ok: false, reason: 'Viande insuffisante : 40 nécessaires.' });
  assert.deepEqual(stock, { viande: 39, epices: 100, conserves: 0 });
  stock.viande = 40;
  assert.deepEqual(Sim.cookDish(state, team, dish), { ok: true, reason: null });
  assert.deepEqual(stock, { viande: 0, epices: 100, conserves: 0 });
  assert.deepEqual(Sim.restore(Sim.serialize(state)).ingredients, state.ingredients);
}

{
  const legacy = Sim.create();
  legacy.ingredients = [25, 7];
  const expected = [{ ...empty, viande: 25 }, { ...empty, viande: 7 }];
  assert.deepEqual(Sim.restore(Sim.serialize(legacy)).ingredients, expected);
  assert.deepEqual(unpack(pack(legacy)).ingredients, expected);
}

console.log('PASS : trois stocks, gains, coûts, confidentialité et migration.');
