import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { resolveTap } from '../public/game/tap.js';
import { command, pack, unpack, view } from '../lib/match.mjs';

function scenario() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  state.ingredients[0].viande = 80;
  return state;
}

function unitAt(state, type, team, x, y) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, hold: true });
  return unit;
}

const towerState = scenario();
const tower = towerState.bases[0];
const nearTower = unitAt(towerState, 'archer', 0, tower.x + 300, tower.y);
const farFromTower = unitAt(towerState, 'archer', 0, tower.x + 500, tower.y);
assert.ok(Sim.cookDish(towerState, 0).ok);
Sim.tick(towerState, 20);
assert.equal(nearTower.ragoutUntil, 65);
assert.equal(Sim.ragoutActive(towerState, farFromTower), false);

const state = scenario();
const chef = unitAt(state, 'hero', 0, 2000, 1100);
assert.equal(Sim.cookDish(state, 0, 'ragout', { at: 'campagne' }).reason, 'Aucune cuisine de campagne.');
assert.equal(Sim.fieldKitchen(state, 1).reason, 'Seuls les Cuistots ont un Grand Chef.');
state.rubies[0] = 59;
assert.equal(Sim.fieldKitchen(state, 0).reason, 'Rubis insuffisants : 60 nécessaires.');
state.rubies[0] = 100;
command(state, 0, { kind: 'fieldKitchen' });
const firstKitchen = state.fieldKitchens[0];
const cell = Sim.nearest(firstKitchen.x, firstKitchen.y);
assert.equal(firstKitchen.x, (cell % Sim.COLS + 0.5) * Sim.CELL);
assert.equal(firstKitchen.y, (Math.floor(cell / Sim.COLS) + 0.5) * Sim.CELL);
assert.ok(Math.hypot(firstKitchen.x - chef.x, firstKitchen.y - chef.y) <= 20);
assert.equal(state.rubies[0], 40);
const kitchenTap = resolveTap(state, 0, new Set([chef.id]), firstKitchen, 0.38);
assert.deepEqual(kitchenTap, { kind: 'fieldKitchen', id: firstKitchen.structureId });
state.time = 10;
assert.throws(() => command(state, 0, { kind: 'fieldKitchen' }), /disponible dans 50 s/);
assert.equal(state.fieldKitchens[0], firstKitchen);
state.time = 50;
assert.ok(Sim.cookDish(state, 0, 'ragout', { at: 'campagne' }).ok);
state.time = 61;
state.rubies[0] = 100;
chef.x += 100;
assert.ok(Sim.fieldKitchen(state, 0).ok);
const kitchen = state.fieldKitchens[0];
assert.notEqual(kitchen.x, firstKitchen.x);
assert.equal(Sim.resolveTarget(state, Sim.targetReference(firstKitchen)), null);
assert.equal(Sim.resolveTarget(state, Sim.targetReference(kitchen)), kitchen);
assert.equal(state.ragout.readyAt, null);
assert.equal(state.ingredients[0].viande, 40);
assert.equal(state.rubies[0], 40);

const placement = Sim.restore(Sim.serialize(state));
assert.deepEqual(placement.fieldKitchens, state.fieldKitchens);
assert.deepEqual(unpack(pack(state)).fieldKitchens, state.fieldKitchens);
delete placement.fieldKitchens;
assert.deepEqual(Sim.restore(Sim.serialize(placement)).fieldKitchens, [null, null]);
const enemyTower = placement.bases[1];
const restoredChef = placement.units[0];
placement.time = 122;
placement.rubies[0] = 100;
Object.assign(restoredChef, { x: enemyTower.x - 500, y: enemyTower.y });
assert.equal(Sim.fieldKitchen(placement, 0).reason, 'Trop près de la base adverse.');
restoredChef.hp = 0;
assert.match(Sim.fieldKitchen(placement, 0).reason, /vivant/);

const nearKitchen = unitAt(state, 'archer', 0, kitchen.x + 300, kitchen.y);
const atBoundary = unitAt(state, 'archer', 0, kitchen.x, kitchen.y + 350);
const atTower = unitAt(state, 'archer', 0, state.bases[0].x, state.bases[0].y);
command(state, 0, { kind: 'cookDish', dish: 'ragout', at: 'campagne' });
const { x, y } = kitchen;
assert.deepEqual(Sim.fumets(state), [{ team: 0, x, y, at: 'campagne' }]);
assert.deepEqual(state.ragout, { readyAt: 81, expiresAt: 0, at: 'campagne', x, y });
state.visible[0].fill(0);
state.visible[1].fill(0);
assert.deepEqual(view(state, 0).fieldKitchens, [kitchen, null]);
assert.deepEqual(view(state, 1).fieldKitchens, [null, null]);
assert.deepEqual(view(state, 1).ragout, { readyAt: null, expiresAt: 0 });
Sim.tick(state, 19.95);
assert.equal(Sim.ragoutActive(state, nearKitchen), false);
Sim.tick(state, 0.05);
assert.equal(nearKitchen.ragoutUntil, 126);
assert.equal(atBoundary.ragoutUntil, 126);
assert.equal(Sim.ragoutActive(state, atTower), false);

state.bases[0].niveau = 2;
Object.assign(state.ingredients[0], { viande: 70, epices: 20 });
assert.ok(Sim.cookDish(state, 0, 'ragout', { at: 'campagne' }).ok);
assert.ok(Sim.cookDish(state, 0, 'roti', { at: 'campagne' }).ok);
const attacker = unitAt(state, 'archer', 1, x - 65, y);
state.visible[1].fill(1);
assert.deepEqual(view(state, 1).fieldKitchens, [kitchen, null]);
const selection = new Set([attacker.id]);
chef.x = x + 400;
assert.deepEqual(resolveTap(state, 1, selection, { x, y }), { kind: 'attack', target: kitchen });
const defender = unitAt(state, 'commis', 0, x + 6, y);
defender.harvest = null;
for (const scale of [0.4, 1, 2]) {
  defender.x = x + 6 / scale;
  assert.deepEqual(resolveTap(state, 1, selection, { x, y }, scale), { kind: 'attack', target: defender });
}
state.units = [chef, attacker, defender];
defender.x = x + 20;
Sim.tick(state, 0.05);
assert.equal(kitchen.hp, 250);
defender.x = x + 400;
for (let tick = 0; tick < 40 && kitchen.hp === 250; tick++) Sim.tick(state, 0.05);
assert.ok(kitchen.hp < 250);
const reinforcements = unitAt(state, 'archer', 1, x - 50, y + 30);
command(state, 1, { kind: 'attack', ids: [reinforcements.id], x, y, target: Sim.targetReference(kitchen) });
assert.equal(reinforcements.target, kitchen);
for (let tick = 0; tick < 390 && state.fieldKitchens[0]; tick++) Sim.tick(state, 0.05);
assert.equal(state.fieldKitchens[0], null);
assert.equal(state.ragout.readyAt, null);
assert.equal(state.roti.readyAt, null);
assert.equal(state.ingredients[0].viande, 0);
assert.deepEqual(Sim.fumets(state), []);
assert.match(Sim.fieldKitchen(state, 0).reason, /disponible dans/);

console.log('PASS : service local, pose et recharge, remplacement, fumet, brouillard, ciblage, destruction et sauvegarde.');
