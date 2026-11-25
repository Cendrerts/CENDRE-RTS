import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command, view } from '../lib/match.mjs';

const state = Sim.create();
state.ingredients[0].viande = 80;
state.ingredients[1].viande = 80;
command(state, 0, { kind: 'cookDish' });
command(state, 1, { kind: 'cookDish', dish: 'festin' });
assert.notEqual(state.ragout.readyAt, null);
assert.notEqual(state.festin.readyAt, null);

Sim.spawn(state, 'knight', 0);
const buffedUnit = state.units.at(-1);
buffedUnit.ragoutUntil = state.time + 45;
state.ragout.expiresAt = buffedUnit.ragoutUntil;
state.visible[1].fill(1);
assert(Sim.canSee(state, 1, buffedUnit));

const cuistotsView = view(state, 0);
const ratsView = view(state, 1);
assert.deepEqual(cuistotsView.ragout, state.ragout);
assert.deepEqual(cuistotsView.festin, { readyAt: null });
assert.deepEqual(ratsView.festin, state.festin);
assert.deepEqual(ratsView.ragout, { readyAt: null, expiresAt: 0 });
const visibleBuffedUnit = ratsView.units.find((unit) => unit.id === buffedUnit.id);
assert(visibleBuffedUnit, 'Le Cuistot buffé reste visible pour les Rats-Goût');
assert.equal(visibleBuffedUnit.ragoutUntil, buffedUnit.ragoutUntil);

console.log('PASS : plats privés par équipe et buff du Cuistot ennemi visible conservé.');
