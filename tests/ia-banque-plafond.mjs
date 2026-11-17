import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { BUILD_ORDERS } from '../public/game/ai-config.js';

for (const difficulty of ['brutal', 'impitoyable']) {
  for (const team of [0, 1]) {
    const state = Sim.create();
    state.units = [];
    state.camps = [];
    state.monsters = [];
    state.watchtowers = [];
    state.time = 480;
    state.rubies[team] = 10000;
    for (const building of BUILD_ORDERS[team]) {
      assert(Sim.construct(state, team, building.id));
    }
    // Une armée dispersée au plafond : le retour au point de ralliement
    // ne doit pas retarder la conversion de la banque après un siège bloqué.
    for (let index = 0; index < Sim.unitLimit(team); index++) {
      Sim.spawn(state, index < Sim.unitLimit(team) - 10 ? 'knight' : 'commis', team);
      const unit = state.units.at(-1);
      unit.x = 1500;
      unit.y = 800;
      unit.path = [];
    }
    state.rubies[team] = 3000;
    const controller = createAI(team, difficulty);
    controller.update(state);
    assert.equal(controller.metrics.waves, 1, 'Une vague part sans attendre le rassemblement');
    state.time++;
    controller.update(state);
    // Sans déplacement, le siège reste sur son étape intermédiaire > 90 s.
    state.time += 91;
    state.rubies[team] = 3000;
    controller.update(state);
    assert.equal(controller.metrics.waves, 2, 'Le siège abandonné est relancé immédiatement');
    assert.equal(controller.metrics.lanes.length, 2);
    assert.notEqual(controller.metrics.lanes[0], controller.metrics.lanes[1]);
    const survivors = state.units.filter((unit) => unit.team === team).slice(4);
    state.units = survivors;
    const survivorIds = new Set(survivors.map((unit) => unit.id));
    const startedAt = state.time;
    let produced = 0;
    while (state.time - startedAt < 30 && state.winner === null) {
      controller.update(state);
      Sim.tick(state, 0.1);
      produced = state.units.filter((unit) => unit.team === team && unit.type !== 'commis' && !survivorIds.has(unit.id)).length;
      if (produced > 0) break;
    }
    assert(produced > 0, `${difficulty}, équipe ${team} : pertes remplacées en moins de 30 s`);
    Sim.tick(state, 0.3);
    controller.update(state);
    const reinforcements = state.units.filter((unit) => unit.team === team && unit.type !== 'commis' && !survivorIds.has(unit.id));
    assert(reinforcements.some((unit) => unit.orderQueue.length > 0 && !unit.retreat), 'Les renforts rejoignent le siège en flux sous le plafond');
  }
}
console.log('PASS : Brutal et Impitoyable au plafond relancent leur vague et remplacent leurs pertes en moins de 30 s.');
