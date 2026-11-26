import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command, view } from '../lib/match.mjs';

function scenario() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  Object.assign(state.bases[0], { x: 1000, y: 450, niveau: 3 });
  Object.assign(state.bases[1], { x: 2500, y: 450, niveau: 3 });
  return state;
}

function spawnAt(state, type, team, x) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y: 450, hold: true });
  return unit;
}

const recipeCost = { viande: 30, epices: 20, conserves: 15 };
const cooks = scenario();
const stock = cooks.ingredients[0];
Object.assign(stock, recipeCost, { conserves: 14 });
cooks.bases[0].niveau = 2;
assert.equal(Sim.cookDish(cooks, 0, 'banquet').reason, 'Tour de niveau 3 nécessaire.');
cooks.bases[0].niveau = 3;
assert.equal(Sim.cookDish(cooks, 0, 'banquet').reason, 'Conserves insuffisantes : 15 nécessaires.');
assert.match(Sim.cookDish(cooks, 0, 'peste').reason, /Seuls les Rats-Goût/);
assert.match(Sim.cookDish(cooks, 1, 'banquet').reason, /Seuls les Cuistots-Furieux/);

const nearby = spawnAt(cooks, 'knight', 0, 1300);
const far = spawnAt(cooks, 'knight', 0, 1400);
nearby.hp = nearby.max * 0.4;
far.hp = far.max * 0.4;
stock.conserves = 15;
command(cooks, 0, { kind: 'cookDish', dish: 'banquet' });
assert.deepEqual(stock, { viande: 0, epices: 0, conserves: 0 });
assert.equal(view(cooks, 0).banquet.readyAt, 30);
assert(!Object.hasOwn(view(cooks, 1), 'banquet'));
assert.deepEqual(view(cooks, 1).fumets, [{ team: 0, x: 1000, y: 450 }]);

stock.viande = 40;
assert(Sim.cookDish(cooks, 0, 'ragout').ok);
Sim.tick(cooks, 29);
assert.equal(nearby.hp, nearby.max * 0.4);
Sim.tick(cooks, 1);
assert.equal(nearby.hp, nearby.max);
assert.equal(nearby.banquetUntil, 60);
assert.equal(nearby.ragoutUntil, 65);
assert.equal(far.hp, far.max * 0.4);
assert.equal(far.banquetUntil, undefined);

const victim = spawnAt(cooks, 'knight', 1, 1310);
victim.cool = 10;
const healthBefore = victim.hp;
Sim.tick(cooks, 0.05);
assert.equal(healthBefore - victim.hp, Sim.stats(nearby.type, 0).damage * 1.25);

// Une cuisine de campagne applique le soin et rafraîchit la durée à proximité.
const camp = scenario();
spawnAt(camp, 'hero', 0, 1600);
const soldier = spawnAt(camp, 'knight', 0, 1900);
camp.rubies[0] = 60;
assert(Sim.fieldKitchen(camp, 0).ok);
Object.assign(camp.ingredients[0], recipeCost);
assert(Sim.cookDish(camp, 0, 'banquet', { at: 'campagne' }).ok);
const { x, y } = camp.fieldKitchens[0];
assert.deepEqual(view(camp, 1).fumets, [{ team: 0, x, y, at: 'campagne' }]);
Sim.tick(camp, 30);
assert.equal(soldier.banquetUntil, 60);
Object.assign(camp.ingredients[0], recipeCost);
assert(Sim.cookDish(camp, 0, 'banquet', { at: 'campagne' }).ok);
Sim.tick(camp, 30);
assert.equal(soldier.banquetUntil, 90);

const rats = scenario();
const rat = spawnAt(rats, 'knight', 1, 2520);
rat.hp = rat.max / 2;
Object.assign(rats.ingredients[1], recipeCost);
command(rats, 1, { kind: 'cookDish', dish: 'peste', at: 'campagne' });
assert.deepEqual(rats.ingredients[1], { viande: 0, epices: 0, conserves: 0 });
assert.equal(view(rats, 1).peste.readyAt, 25);
assert(!Object.hasOwn(view(rats, 0), 'peste'));
assert.deepEqual(view(rats, 0).fumets, [{ team: 1, x: 2500, y: 450 }]);
Sim.tick(rats, 25);
assert.equal(rat.pesteUntil, 55);
assert.equal(rat.hp, rat.max / 2);

const enemy = spawnAt(rats, 'knight', 0, 2510);
enemy.cool = 10;
const ratStats = Sim.stats(rat.type, 1);
const originalDamage = ratStats.damage;
try {
  ratStats.damage = 20;
  Sim.tick(rats, 0.05);
  assert.equal(enemy.hp, enemy.max - 20);
  assert.equal(rat.hp, rat.max / 2 + 6);
  rat.hp = rat.max - 1;
  rat.cool = 0;
  Sim.tick(rats, 0.05);
  assert.equal(rat.hp, rat.max);
} finally {
  ratStats.damage = originalDamage;
}

rats.units = [rat];
rats.bases[0].x = 2510;
rat.hp = rat.max / 2;
rat.cool = 0;
const baseHealth = rats.bases[0].hp;
Sim.tick(rats, 0.05);
assert.equal(rats.bases[0].hp, baseHealth - originalDamage);
assert.equal(rat.hp, rat.max / 2);

const foyer = rats.braises[0];
Object.assign(foyer, { lit: true, x: rat.x, y: rat.y });
rats.braises = [foyer];
rat.cool = 10;
Sim.tick(rats, 1);
assert.equal(rat.hp, rat.max / 2 - 2);

console.log('PASS : plats à trois ingrédients, dégâts, vol de vie et confidentialité.');
