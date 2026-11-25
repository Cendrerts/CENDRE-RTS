import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { view } from '../lib/match.mjs';

const state = Sim.create();
assert.deepEqual(Sim.fumets(state), []);
for (const team of [0, 1]) {
  assert.deepEqual(view(state, team).fumets, []);
  state.ingredients[team].viande = 40;
}

const ragoutBase = state.bases[0];
ragoutBase.x += 0.25;
ragoutBase.y += 0.75;
const expected = state.bases.map(({ x, y }, team) => ({ team, x, y }));
assert.ok(Sim.cookDish(state, 0, 'ragout').ok);
assert.deepEqual(Sim.fumets(state), [expected[0]]);
assert.ok(Sim.cookDish(state, 1, 'festin').ok);
assert.deepEqual(Sim.fumets(state), expected);

const rounded = expected.map(({ team, x, y }) => ({ team, x: Math.round(x), y: Math.round(y) }));
for (const team of [0, 1]) {
  state.visible[team].fill(0);
  state.explored[team].fill(0);
  const enemy = expected[1 - team];
  assert.equal(Sim.visibleAt(state, team, enemy.x, enemy.y), false);
  const snapshot = view(state, team);
  assert.deepEqual(snapshot.fumets, rounded);
  if (team === 0) assert.deepEqual(snapshot.festin, { readyAt: null });
  else assert.deepEqual(snapshot.ragout, { readyAt: null, expiresAt: 0 });
}

Sim.tick(state, 14.95);
assert.deepEqual(Sim.fumets(state), expected);
Sim.tick(state, 0.05);
assert.deepEqual(Sim.fumets(state), [expected[0]]);
Sim.tick(state, 4.95);
assert.deepEqual(Sim.fumets(state), [expected[0]]);
Sim.tick(state, 0.05);
assert.deepEqual(Sim.fumets(state), []);
assert.deepEqual(view(state, 1).fumets, []);
console.log('PASS : fumets publics sous le brouillard, cuisson privée et disparition au tick de fin.');
