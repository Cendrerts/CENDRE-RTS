import assert from 'node:assert/strict';
import { pack } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { createMatch } from '../scripts/ia-diagnostic.mjs';
import { loadedScenario } from '../scripts/render-scenario.mjs';

// La séparation au repos change les positions, puis le déroulement du duel.
// Comparer deux exécutions des mêmes règles pour vérifier le déterminisme exact.
const loadedStates = [loadedScenario(Sim), loadedScenario(Sim)];
assert.equal(pack(loadedStates[0]), pack(loadedStates[1]), 'loadedScenario initial');
for (let tick = 1; tick <= 1200; tick++) {
  for (const state of loadedStates) Sim.tick(state, 1 / 60);
  if (tick % 60 === 0) {
    assert.equal(pack(loadedStates[0]), pack(loadedStates[1]), `loadedScenario tick ${tick}`);
  }
}

function brutalMatch() {
  const match = createMatch(18, false);
  // Les tours survivent à la première percée pour comparer les cinq minutes.
  for (const base of match.state.bases) {
    base.niveau = 3;
    base.hp = 1000000;
    base.max = base.hp;
  }
  const controllers = [0, 1].map((team) => createAI(team, 'brutal', match.state));
  return { ...match, controllers };
}

const matches = [brutalMatch(), brutalMatch()];
assert.equal(pack(matches[0].state), pack(matches[1].state), 'Brutal initial');
for (let step = 1; step <= 3000; step++) {
  for (const { state, delays, controllers } of matches) {
    for (const team of [0, 1]) {
      if (state.time >= delays[team]) controllers[team].update(state);
    }
    Sim.tick(state, 0.1);
  }
  if (step % 600 === 0) {
    assert.equal(pack(matches[0].state), pack(matches[1].state), `Brutal minute ${step / 600}`);
  }
}
assert.ok(matches.every(({ state }) => state.time >= 300 - 1e-8), 'Les parties doivent couvrir cinq minutes');
console.log('sim-identique : 1 200 ticks chargés et cinq minutes de Brutal/Brutal graine 18 identiques');
