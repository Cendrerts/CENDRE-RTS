import assert from 'node:assert/strict';
import { view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';

const state = Sim.create();
state.time = 20;
Sim.spawn(state, 'knight', 0);
const cook = state.units.at(-1);
Sim.spawn(state, 'knight', 1);
const rat = state.units.at(-1);

assert.deepEqual(Sim.activeDishEffects(state, cook), []);
cook.rotiUntil = 30;
cook.banquetUntil = 40;
assert.deepEqual(Sim.activeDishEffects(state, cook), ['roti', 'banquet']);
cook.rotiUntil = state.time;
assert.deepEqual(Sim.activeDishEffects(state, cook), ['banquet']);
cook.rotiUntil = state.time + 1e-9;
assert.deepEqual(Sim.activeDishEffects(state, cook), ['banquet']);
assert.deepEqual(Sim.activeDishEffects(state, { ...cook, hp: 0 }), []);
assert.deepEqual(Sim.activeDishEffects(state, {
  ...cook,
  ragoutUntil: 30,
  rotiUntil: 30,
  bouillonUntil: 30,
  pesteUntil: 30,
}), ['ragout', 'roti', 'bouillon', 'banquet', 'peste']);
assert.deepEqual(Sim.activeDishEffects(state, { ...rat, ragoutUntil: 30 }), []);

cook.rotiUntil = 30;
rat.bouillonUntil = 35;
rat.pesteUntil = 45;
state.visible[0].fill(1);
state.visible[1].fill(1);
const visibleCook = view(state, 1).units.find(({ id }) => id === cook.id);
const visibleRat = view(state, 0).units.find(({ id }) => id === rat.id);
assert.equal(visibleCook.rotiUntil, cook.rotiUntil);
assert.equal(visibleCook.banquetUntil, cook.banquetUntil);
assert.equal(visibleRat.bouillonUntil, rat.bouillonUntil);
assert.equal(visibleRat.pesteUntil, rat.pesteUntil);
