import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { measurePairs, melee, settledArmy } from './helpers/separation-scenarios.mjs';

function reportPairs(label, { overlaps, pairs, rate, minimumDistance }) {
  console.log(`${label} — ${(rate * 100).toFixed(2)} % (${overlaps}/${pairs}), distance min. ${minimumDistance.toFixed(2)} px monde`);
}

const restingRadii = { commis: 12, knight: 16, mage: 17, archer: 18, hero: 21 };
assert.deepEqual(Sim.RESTING_RADII, restingRadii);

for (const [label, options] of [
  ['destination identique', {}],
  ['ordre groupé', { groupOrder: true }],
  ['destination identique, unités mixtes', { types: ['commis', 'knight', 'archer', 'mage'] }],
]) {
  const { units } = settledArmy(Sim, options);
  assert.equal(units.length, 40);
  assert(units.every((unit) => !unit.path.length), 'Les 40 unités sont à l’arrêt');
  const metrics = measurePairs(units, (a, b) => 0.95 * (restingRadii[a.type] + restingRadii[b.type]));
  assert.equal(metrics.overlaps, 0, 'Chaque paire atteint 95 % de la somme des rayons de repos');
  const xs = units.map((unit) => unit.x);
  const ys = units.map((unit) => unit.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  assert(Math.min(width, height) / Math.max(width, height) >= 0.8, 'La formation reste arrondie');
  reportPairs(`Repos (${label})`, metrics);
}

// Mesures du même scénario sur main (44415dc), avant #296.
const mainOverlapRate = 93 / 780;
const mainDuration = 2120 / 60;
const combat = melee(Sim);
assert(combat.peak.rate < mainOverlapRate, 'Moins de chevauchements au pic de la mêlée');
assert.equal(combat.teamsInContact, 2, 'Les deux équipes frappent au contact des rayons');
assert(Math.abs(combat.duration / mainDuration - 1) <= 0.2, 'Durée du combat à ±20 %');
reportPairs(`Pic de mêlée (combat de ${combat.duration.toFixed(2)} s)`, combat.peak);
