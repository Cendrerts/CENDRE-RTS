import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

for (const { capped, stalled } of [
  { capped: true, stalled: false },
  { capped: false, stalled: false },
  { capped: true, stalled: true },
]) {
  const state = Sim.create();
  state.units = [];
  state.camps = [];
  state.monsters = [];
  for (let index = 0; index < 14; index++) {
    Sim.spawn(state, 'knight', 0);
    const unit = state.units.at(-1);
    unit.x = state.bases[0].x + 110;
    unit.y = state.bases[0].y - 65;
    unit.path = [];
  }
  state.rubies[0] = 0;
  state.time = 800;
  state.visible[0].fill(0);
  if (capped) {
    while (state.units.length + state.queues[0].length < Sim.unitLimit(0)) {
      state.queues[0].push({ type: 'knight' });
    }
  }
  const controller = createAI(0, 'brutal');
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);
  // Laisser le contrôleur mémoriser le siège avant les pertes.
  state.time++;
  controller.update(state);
  state.queues[0] = [];
  state.units.splice(-2);
  Sim.spawn(state, 'knight', 0);
  const reinforcement = state.units.at(-1);
  reinforcement.x = 2000;
  reinforcement.y = 1100;
  reinforcement.path = [];
  // Sans déplacement des membres, la vague reste à son étape intermédiaire initiale.
  state.time += stalled ? 91 : 1;
  controller.update(state);
  assert(state.units.length + state.queues[0].length < Sim.unitLimit(0));
  assert.equal(controller.metrics.waves, 1);
  assert.equal(reinforcement.orderQueue.length > 0, capped && !stalled,
    `Renfort sous le plafond : siège initialement au plafond=${capped}, bloqué=${stalled}`);
}
console.log('PASS: seul un siège établi au plafond et non bloqué conserve son flux de renforts après des pertes.');
