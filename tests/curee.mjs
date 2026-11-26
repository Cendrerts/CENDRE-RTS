import assert from 'node:assert/strict';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';

function addUnit(state, type, x, y = 1100) {
  Sim.spawn(state, type, 1);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, path: [], hold: true });
  return unit;
}

function corpse(id, x, y = 1100, expiresAt = 60) {
  return { id, x, y, team: 0, type: 'knight', expiresAt };
}

function fixture() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  const king = addUnit(state, 'hero', 2000);
  const firstRat = addUnit(state, 'knight', 2020);
  const secondRat = addUnit(state, 'knight', 2050);
  addUnit(state, 'knight', 1900);
  addUnit(state, 'knight', 2100);
  const near = corpse(1000, 2012);
  const left = corpse(1001, 1984);
  const right = corpse(1002, 2030);
  const far = corpse(1003, 2300);
  state.corpses = [far, right, left, near];
  Sim.visibility(state);
  return { state, king, firstRat, secondRat, near, left, right, far };
}

function advanceTo(state, time) {
  while (state.time < time - 1e-9) {
    Sim.tick(state, Math.min(0.05, time - state.time));
  }
}

function checkMeals({ state, king, firstRat, secondRat, near, left, right, far }) {
  const eaters = state.units.filter((unit) => unit.devour);
  assert.deepEqual(eaters.map((unit) => [unit.id, unit.devour.corpseId]), [
    [king.id, left.id],
    [firstRat.id, near.id],
    [secondRat.id, right.id],
  ]);
  assert(state.corpses.includes(far));

  const meat = state.ingredients[1].viande;
  advanceTo(state, 3.1);
  assert.equal(state.ingredients[1].viande, meat + 6);
  advanceTo(state, 5);
  assert.equal(state.ingredients[1].viande, meat + 18);
  assert.deepEqual(state.corpses, [far]);
}

{
  const setup = fixture();
  const { state } = setup;
  assert.equal(Sim.kingFeastBlockReason(state, 1), null);
  assert.deepEqual(Sim.kingFeast(state, 1), { ok: true });
  checkMeals(setup);
  advanceTo(state, 10);
  state.corpses.push(corpse(1004, 2000));
  const reason = 'Curée prête dans 20 s.';
  assert.equal(Sim.kingFeastBlockReason(state, 1), reason);
  const beforeRefusal = Sim.serialize(state);
  assert.deepEqual(Sim.kingFeast(state, 1), { ok: false, reason });
  assert.deepEqual(Sim.serialize(state), beforeRefusal);

  const restored = Sim.restore(beforeRefusal);
  assert.equal(restored.kingFeastReadyAt, 30);
  assert.equal(Sim.kingFeastBlockReason(restored, 1), reason);
  advanceTo(state, 30);
  assert.deepEqual(Sim.kingFeast(state, 1), { ok: true });
  assert.equal(state.kingFeastReadyAt, 60);
}

{
  const setup = fixture();
  const { state, far } = setup;
  state.corpses = [far, corpse(1004, 2000, 1100, 0)];
  for (const [team, reason] of [
    [1, 'Aucun cadavre à portée.'],
    [0, 'Seuls les Rats-Goût ont la Curée.'],
  ]) {
    const before = Sim.serialize(state);
    assert.equal(Sim.kingFeastBlockReason(state, team), reason);
    assert.deepEqual(Sim.kingFeast(state, team), { ok: false, reason });
    assert.deepEqual(Sim.serialize(state), before);
  }
  assert.equal(state.kingFeastReadyAt, undefined);
  setup.king.hp = 0;
  assert.equal(Sim.kingFeastBlockReason(state, 1), 'Roi-Rat absent.');
  state.winner = 0;
  assert.throws(() => command(state, 1, { kind: 'kingFeast' }), { message: 'La partie est terminée.' });
}

{
  const setup = fixture();
  const { state, far, near, firstRat } = setup;
  state.corpses = [far, near, corpse(1004, 2200)];
  const worker = addUnit(state, 'commis', 2199);
  const outside = addUnit(state, 'knight', 2201);
  const boundary = addUnit(state, 'knight', 2200);
  Sim.visibility(state);
  assert(Sim.devour(state, 1, [firstRat.id], near.id));
  const ongoingMeal = firstRat.devour;
  assert.deepEqual(Sim.kingFeast(state, 1), { ok: true });
  assert.equal(firstRat.devour, ongoingMeal);
  assert.equal(boundary.devour.corpseId, 1004);
  assert.equal(worker.devour, undefined);
  assert.equal(outside.devour, undefined);
  assert.equal(state.units.filter((unit) => unit.devour).length, 2);
}

{
  const setup = fixture();
  const { state } = setup;
  const feast = { kind: 'kingFeast' };
  assert.throws(() => command(state, 0, feast), { message: 'Seuls les Rats-Goût ont la Curée.' });
  command(state, 1, feast);
  assert.equal(view(state, 1).kingFeastReadyAt, 30);
  assert.equal(view(state, 1).kingFeastReason, 'Curée prête dans 30 s.');
  assert.equal(Object.hasOwn(view(state, 0), 'kingFeastReadyAt'), false);
  assert.equal(Object.hasOwn(view(state, 0), 'kingFeastReason'), false);
  assert.equal(unpack(pack(state)).kingFeastReadyAt, 30);
  assert.throws(() => command(state, 1, feast), { message: 'Curée prête dans 30 s.' });
  checkMeals(setup);
}

console.log('PASS : Curée du Roi-Rat, repas, recharge et vue privée.');
