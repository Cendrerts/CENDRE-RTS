import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pack, unpack, view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';
import { cellAt } from './helpers/map-path.mjs';

const state = Sim.create();
const [north, south] = state.caches;
assert.deepEqual(state.caches, [
  { name: 'cache-nord', x: 2000, y: 250, readyAt: 180, capturingTeam: -1, progress: 0 },
  { name: 'cache-sud', x: 2000, y: 1950, readyAt: 180, capturingTeam: -1, progress: 0 },
]);
assert.equal(north.x + south.x, Sim.W);
assert.equal(north.y + south.y, Sim.H);

// Référence de main avant l'ajout des caches.
const walkable = Sim.walk.reduce((sum, cell) => sum + cell, 0);
assert.equal(walkable, 16466);
assert.equal(((1 - walkable / Sim.walk.length) * 100).toFixed(1), '25.2');
assert.equal(createHash('sha256').update(Sim.walk).digest('hex'),
  '3889bf40ae6e58f8679a5f72344a2109d760da7060ff6588b2245c31ead12471');
for (const cache of state.caches) {
  for (let y = cache.y - 40; y <= cache.y + 40; y += Sim.CELL) {
    for (let x = cache.x - 40; x <= cache.x + 40; x += Sim.CELL) {
      assert(Sim.walk[cellAt(x, y)], `${cache.name} : terrain praticable`);
    }
  }
  for (const site of Sim.reservedSites) {
    assert(Math.hypot(site.x - cache.x, site.y - cache.y) >= 320);
  }
}

state.units = [];
state.monsters = [];
state.camps = [];
state.time = 179;

function addUnit(type, team, offset) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x: north.x + offset, y: north.y, hold: true, cool: 999, harvest: null, path: [] });
  return unit;
}

function advance(seconds) {
  for (let step = 0; step < seconds * 8; step++) Sim.tick(state, 0.125);
}

function conserves(team = 0) {
  return state.ingredients[team].conserves;
}

const military = addUnit('knight', 0, -40);
advance(0.5);
assert.equal(conserves(), 0);
assert.equal(north.progress, 0);
advance(0.5);
assert.equal(north.progress, 0);
advance(4.875);
assert.equal(conserves(), 0);
advance(0.125);
assert.equal(conserves(), 10);
assert.equal(north.readyAt, 335);
assert.deepEqual(view(state, 0).cacheCollectedAt, [185, null]);
assert.deepEqual(view(state, 1).cacheCollectedAt, [null, null]);

advance(60);
assert.equal(conserves(), 10);
assert.equal(north.progress, 0);
advance(90);
assert.equal(state.time, 335);
assert.equal(conserves(), 10);
advance(5);
assert.equal(conserves(), 20);
assert.equal(north.readyAt, 490);

state.time = 490;
state.units = [];
addUnit('commis', 0, -40);
advance(5);
assert.equal(conserves(), 20);
assert.equal(north.progress, 0);
state.units = [military];
advance(2);
assert.equal(north.progress, 2);
assert.equal(view(state, 0).caches[0].progress, 2);
assert.equal(view(state, 0).caches[0].capturingTeam, 0);
assert.equal(view(state, 1).caches[0].progress, 0);
assert.equal(view(state, 1).caches[0].capturingTeam, -1);
assert.deepEqual(Sim.restore(Sim.serialize(state)).caches, state.caches);
assert.deepEqual(unpack(pack(state)).caches, state.caches);

addUnit('knight', 1, 50);
advance(5);
assert.equal(north.progress, 0);
assert.equal(north.capturingTeam, -1);
assert.equal(conserves(), 20);
assert.equal(conserves(1), 0);
state.units = [military];
advance(2);
state.units = [];
advance(0.125);
assert.equal(north.progress, 0);

const rival = addUnit('knight', 1, 70);
advance(1);
assert.equal(north.progress, 0, 'Le rayon de 70 px est strict');
Sim.order(state, [rival.id], north.x, north.y);
advance(8);
assert.equal(conserves(1), 10, 'Un ordre de déplacement suffit pour collecter');

const legacy = Sim.create();
delete legacy.caches;
delete legacy.cacheCollectedAt;
assert.deepEqual(Sim.restore(Sim.serialize(legacy)).caches, Sim.create().caches);
assert.deepEqual(unpack(pack(legacy)).caches, Sim.create().caches);
console.log('PASS : carte inchangée, collecte et contestation, remplissage, vision et sauvegardes.');
