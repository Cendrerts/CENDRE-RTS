import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command, view, pack, unpack } from '../lib/match.mjs';

const state = Sim.create();
state.units = [];
state.camps = [];
state.monsters = [];
assert.match(Sim.cookDish(state, 0).reason, /Ingrédients/);
assert.equal(state.ragout.readyAt, null);
state.ingredients[0] = 80;
state.ingredients[1] = 80;
assert.match(Sim.cookDish(state, 1).reason, /Cuistots/);
assert.throws(() => command(state, 1, { kind: 'cookDish' }), /Cuistots/);
for (const type of ['knight', 'commis', 'archer', 'mage']) {
  Sim.spawn(state, type, 0);
}
const [soldier, worker] = state.units;
worker.harvest = null;
for (const unit of state.units) unit.hold = true;
command(state, 0, { kind: 'cookDish' });
assert.equal(state.ingredients[0], 40);
assert.match(Sim.cookDish(state, 0).reason, /cuisson/);
assert.equal(state.ingredients[0], 40);
assert.throws(() => command(state, 0, { kind: 'cookDish' }), /cuisson/);
assert.deepEqual(unpack(pack(state)).ragout, state.ragout);
assert.deepEqual(view(state, 0).ragout, state.ragout);
Sim.tick(state, 19.9);
assert.equal(Sim.ragoutActive(state, soldier), false);
Sim.tick(state, 0.1);
assert.equal(Sim.ragoutActive(state, soldier), true);
assert.equal(Sim.ragoutActive(state, worker), false);
for (const unit of state.units.filter((unit) => unit.type !== 'commis')) {
  assert.equal(Sim.ragoutActive(state, unit), true);
}
const expired = structuredClone(state);
Sim.tick(expired, 45);
assert.equal(Sim.ragoutActive(expired, expired.units[0]), false);
assert.equal(state.ragout.expiresAt, 65);

function checkDamage(unit, multiplier) {
  const target = state.bases[1];
  target.hp = 1500;
  unit.x = target.x - 40;
  unit.y = target.y;
  unit.target = target;
  unit.cool = 0;
  unit.harvest = null;
  for (const other of state.units.filter((candidate) => candidate !== unit)) {
    other.target = null;
    other.x = state.bases[0].x;
    other.y = state.bases[0].y;
  }
  state.visible[0].fill(1);
  state.fogClock = 0;
  Sim.tick(state, 0.01);
  assert(Math.abs(1500 - target.hp - Sim.stats(unit.type, 0).damage * multiplier) < 1e-8);
  unit.target = null;
  unit.x = state.bases[0].x;
  unit.y = state.bases[0].y;
}
checkDamage(soldier, 1.15);
checkDamage(worker, 1);
checkDamage(state.units[2], 1.15);
checkDamage(state.units[3], 1.15);
Sim.tick(state, 10);
assert.equal(Sim.cookDish(state, 0).ok, true);
Sim.tick(state, 20);
assert.equal(state.ragout.expiresAt, state.time + 45);
assert.equal(soldier.ragoutUntil, state.time + 45);
checkDamage(soldier, 1.15);
Sim.tick(state, 44.98);
assert.equal(Sim.ragoutActive(state, soldier), true);
Sim.tick(state, 0.01);
assert.equal(Sim.ragoutActive(state, soldier), false);
checkDamage(soldier, 1);
console.log('PASS : Ragoût, refus solo/serveur, cuisson, dégâts militaires, ouvriers, renouvellement et expiration.');
