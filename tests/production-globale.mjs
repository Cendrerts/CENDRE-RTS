import assert from 'node:assert/strict';
import { CendreSim as Sim, canRecruit } from '../public/game/sim.js';
import { command } from '../lib/match.mjs';
import { productionModel } from '../public/game/production.js';

for (const team of [0, 1]) {
  const state = Sim.create();
  state.rubies[team] = 9999;
  const assertAvailability = () => {
    for (const item of productionModel(state, team)) {
      assert.equal(item.disabled, !canRecruit(state, team, item.type));
    }
  };
  const archer = () => productionModel(state, team).find((item) => item.type === 'archer');
  assert.equal(archer(), undefined, 'Un bâtiment est requis');
  for (let index = 0; index < 3; index++) {
    assert(Sim.construct(state, team, Sim.BUILDINGS[team][1].id));
  }
  assert.equal(archer(), undefined);
  state.time = state.slots[team][0].batiment.readyAt;
  assert.equal(archer().disabled, false);
  const producers = Sim.producers(state, team, 'archer');
  assert.equal(producers.length, 3);
  for (let index = 0; index < 3; index++) {
    command(state, team, { kind: 'recruit', type: 'archer' });
  }
  assert.deepEqual(producers.map((producer) =>
    state.queues[team].filter((job) => job.producerId === producer.id).length), [1, 1, 1]);
  assert.equal(archer().queued, 3, 'La barre compte tous les producteurs');
  const cost = Sim.stats('archer', team).cost;
  state.rubies[team] = cost * 2;
  for (let index = 0; index < 5; index++) {
    try {
      command(state, team, { kind: 'recruit', type: 'archer' });
    } catch {
      assert.equal(state.rubies[team], 0);
    }
  }
  assert.equal(state.queues[team].length, 5, 'Le lot recrute autant que les rubis permettent');
  assert.equal(state.rubies[team], 0);
  assert.equal(archer().disabled, true);
  assert.equal(canRecruit(state, team, 'archer'), false, 'Rubis insuffisants');
  assertAvailability();
  assert.throws(() => command(state, team, { kind: 'recruit', type: 'archer' }));
  assert.equal(state.queues[team].length, 5);
  state.rubies[team] = 9999;
  while (state.units.filter((unit) => unit.team === team).length + state.queues[team].length < Sim.populationCap(state, team)) {
    Sim.spawn(state, 'commis', team);
  }
  assert(productionModel(state, team).every((item) => item.disabled));
  assert.equal(canRecruit(state, team, 'archer'), false, 'Population pleine');
  assertAvailability();
  assert.throws(() => command(state, team, { kind: 'recruit', type: 'archer' }));
  state.units = state.units.filter((unit) => unit.team !== team);
  state.queues[team] = producers.flatMap((producer) =>
    Array.from({ length: 8 }, () => ({ type: 'archer', producerId: producer.id, remaining: 1 })));
  assert.equal(canRecruit(state, team, 'archer'), false, 'Toutes les files sont pleines');
  assertAvailability();
  state.queues[team].pop();
  assert.equal(canRecruit(state, team, 'archer'), true, 'Une place suffit');
  assertAvailability();
}
console.log('PASS: production globale, deux factions, répartition 1/1/1, coût, file, rubis et population.');
