import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { measurePairs, melee, settledArmy } from './helpers/separation-scenarios.mjs';

function reportPairs(label, { overlaps, pairs, rate, minimumDistance }) {
  console.log(`${label} — ${(rate * 100).toFixed(2)} % (${overlaps}/${pairs}), distance min. ${minimumDistance.toFixed(2)} px monde`);
}

for (const groupOrder of [false, true]) {
  const { units } = settledArmy(Sim, { groupOrder });
  assert.equal(units.length, 40);
  assert(units.every((unit) => !unit.path.length), 'Les 40 unités sont à l’arrêt');
  const metrics = measurePairs(units);
  assert(metrics.minimumDistance >= 0.9 * 24, 'Distance minimale à 5 s ≥ 90 % des rayons');
  assert.equal(metrics.overlaps, 0, 'Aucune paire ne se chevauche après stabilisation');
  const xs = units.map((unit) => unit.x);
  const ys = units.map((unit) => unit.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  assert(Math.min(width, height) / Math.max(width, height) >= 0.8, 'La formation reste arrondie');
  const orders = groupOrder ? 'ordre groupé' : 'destination identique';
  reportPairs(`Repos (${orders})`, metrics);
}

// Mesures du même scénario sur main (44415dc), avant #296.
const mainOverlapRate = 93 / 780;
const mainDuration = 2120 / 60;
const combat = melee(Sim);
assert(combat.peak.rate < mainOverlapRate, 'Moins de chevauchements au pic de la mêlée');
assert.equal(combat.teamsInContact, 2, 'Les deux équipes frappent au contact des rayons');
assert(Math.abs(combat.duration / mainDuration - 1) <= 0.2, 'Durée du combat à ±20 %');
reportPairs(`Pic de mêlée (combat de ${combat.duration.toFixed(2)} s)`, combat.peak);
