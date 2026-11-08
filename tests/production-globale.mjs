import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command } from '../lib/match.mjs';
import { productionModel } from '../public/game/production.js';

for (const team of [0, 1]) {
  const state = Sim.create();
  state.rubies[team] = 9999;
  const archer = () => productionModel(state, team).find((item) => item.type === 'archer');
  assert.equal(archer().disabled, true, 'Un bâtiment est requis');
  for (let index = 0; index < 3; index++) {
    assert(Sim.construct(state, team, Sim.BUILDINGS[team][1].id));
  }
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
  assert.throws(() => command(state, team, { kind: 'recruit', type: 'archer' }));
  assert.equal(state.queues[team].length, 5);
  state.rubies[team] = 9999;
  while (state.units.filter((unit) => unit.team === team).length + state.queues[team].length < 30) {
    Sim.spawn(state, 'commis', team);
  }
  assert(productionModel(state, team).every((item) => item.disabled));
  assert.throws(() => command(state, team, { kind: 'recruit', type: 'archer' }));
}
console.log('PASS: production globale, deux factions, répartition 1/1/1, coût, file, rubis et population.');
