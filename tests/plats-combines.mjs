import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { command, view } from '../lib/match.mjs';

function scenario() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  Object.assign(state.bases[0], { x: 1000, y: 450 });
  Object.assign(state.bases[1], { x: 2500, y: 450 });
  return state;
}

function spawnAt(state, type, team, distance) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x: state.bases[team].x + distance, y: 450, hold: true });
  return unit;
}

const state = scenario();
const rotiStock = state.ingredients[0];
Object.assign(rotiStock, { viande: 29, epices: 19 });
assert.equal(Sim.cookDish(state, 0, 'roti').reason, 'Tour de niveau 2 nécessaire.');
state.bases[0].niveau = 2;
assert.equal(Sim.cookDish(state, 0, 'roti').reason, 'Viande insuffisante : 30 nécessaires.');
rotiStock.viande = 30;
assert.equal(Sim.cookDish(state, 0, 'roti').reason, 'Épices insuffisantes : 20 nécessaires.');
rotiStock.epices = 20;
assert.match(Sim.cookDish(state, 0, 'bouillon').reason, /Seuls les Rats-Goût/);
assert.match(Sim.cookDish(state, 1, 'roti').reason, /Seuls les Cuistots-Furieux/);

const inside = spawnAt(state, 'knight', 0, 300);
const outside = spawnAt(state, 'knight', 0, 400);
const boundary = spawnAt(state, 'archer', 0, 350);
const worker = spawnAt(state, 'commis', 0, 250);
worker.harvest = null;
command(state, 0, { kind: 'cookDish', dish: 'roti' });
assert.equal(rotiStock.viande, 0);
assert.equal(rotiStock.epices, 0);
assert.match(Sim.cookDish(state, 0, 'roti').reason, /déjà en préparation/);
assert.equal(view(state, 0).roti.readyAt, 20);
assert(!Object.hasOwn(view(state, 1), 'roti'));
assert.deepEqual(view(state, 1).fumets, [{ team: 0, x: 1000, y: 450 }]);

rotiStock.viande = 40;
assert(Sim.cookDish(state, 0, 'ragout').ok);
assert.equal(Sim.fumets(state).length, 1);
Sim.tick(state, 19.95);
assert.equal(inside.rotiUntil, undefined);
Sim.tick(state, 0.05);
assert.equal(inside.rotiUntil, 60);
assert.equal(boundary.rotiUntil, 60);
assert.equal(worker.rotiUntil, undefined);
assert.equal(outside.rotiUntil, undefined);
assert.deepEqual(Sim.fumets(state), []);
state.visible[1].fill(1);
assert.equal(view(state, 1).units.find(({ id }) => id === inside.id).rotiUntil, 60);
state.visible[1].fill(0);
assert(!view(state, 1).units.some(({ id }) => id === inside.id));

for (const unit of [inside, outside]) {
  command(state, 0, { kind: 'move', ids: [unit.id], x: 1800, y: 450 });
}
const startInside = inside.x;
const startOutside = outside.x;
Sim.tick(state, 0.05);
assert(outside.x > startOutside);
assert(Math.abs((inside.x - startInside) / (outside.x - startOutside) - 1.2) < 1e-9);

const camp = scenario();
camp.bases[0].niveau = 2;
Object.assign(camp.ingredients[0], { viande: 60, epices: 40 });
const chef = spawnAt(camp, 'hero', 0, 600);
camp.rubies[0] = 60;
assert(Sim.fieldKitchen(camp, 0).ok);
const kitchen = camp.fieldKitchens[0];
const soldier = spawnAt(camp, 'knight', 0, 900);
assert.equal(soldier.x - chef.x, 300);
assert(Sim.cookDish(camp, 0, 'roti', { at: 'campagne' }).ok);
assert.deepEqual(view(camp, 1).fumets, [{ team: 0, x: kitchen.x, y: kitchen.y, at: 'campagne' }]);
Sim.tick(camp, 20);
assert.equal(soldier.rotiUntil, 60);
assert(Sim.cookDish(camp, 0, 'roti', { at: 'campagne' }).ok);
Sim.tick(camp, 20);
assert.equal(soldier.rotiUntil, 80);

const rats = scenario();
rats.bases[1].niveau = 2;
const injured = spawnAt(rats, 'hero', 1, 300);
const nearMax = spawnAt(rats, 'knight', 1, 220);
const distant = spawnAt(rats, 'knight', 1, 400);
injured.hp = injured.max / 2;
nearMax.hp = nearMax.max - 1;
distant.hp = distant.max / 2;
const initial = injured.hp;
Object.assign(rats.ingredients[1], { viande: 70, epices: 20 });
assert(Sim.cookDish(rats, 1, 'festin').ok);
command(rats, 1, { kind: 'cookDish', dish: 'bouillon' });
assert.equal(rats.ingredients[1].viande, 0);
assert.equal(rats.ingredients[1].epices, 0);
assert(!Object.hasOwn(view(rats, 0), 'bouillon'));
assert.equal(view(rats, 1).bouillon.readyAt, 15);
Sim.tick(rats, 14.95);
assert.equal(injured.hp, initial);
Sim.tick(rats, 0.05);
assert.equal(injured.bouillonUntil, 35);
for (let tick = 0; tick < 400; tick++) Sim.tick(rats, 0.05);
assert(Math.abs(injured.hp - initial - 60) <= 1, injured.hp);
assert.equal(nearMax.hp, nearMax.max);
assert.equal(distant.hp, distant.max / 2);
const afterEffect = injured.hp;
Sim.tick(rats, 1);
assert(Math.abs(injured.hp - afterEffect) < 1e-9);
console.log('PASS : plats combinés, coûts, rayon, vitesse, régénération et confidentialité.');
