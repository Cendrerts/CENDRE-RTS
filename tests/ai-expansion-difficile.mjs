import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

// Same placements, factions and decision order as ai.mjs, difficile-normal.
// Seeds 2 and 6 previously won without ever building an expansion.
const regressionSeeds = new Set([2, 6]);
let seed = 18;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

for (let game = 1; game <= 6; game++) {
  const state = Sim.create();
  for (const unit of state.units) {
    const cell = Sim.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
    unit.x = (cell % Sim.COLS) * Sim.CELL + 10;
    unit.y = Math.floor(cell / Sim.COLS) * Sim.CELL + 10;
  }
  if (!regressionSeeds.has(game)) {
    continue;
  }
  Sim.visibility(state);
  const strongTeam = (game - 1) % 2;
  const decisionOrder = strongTeam ? [1, 0] : [0, 1];
  const controllers = [0, 1].map((team) => createAI(team, team === strongTeam ? 'difficile' : 'normal'));
  let firstExpansion = null;
  while (state.time < 240 && state.winner === null) {
    for (const team of decisionOrder) {
      controllers[team].update(state);
    }
    Sim.tick(state, 0.1);
    if (state.mines.some((mine, index) => index >= 2 && mine.owner === strongTeam && mine.depot)) {
      firstExpansion = state.time;
      break;
    }
  }
  assert(firstExpansion !== null && firstExpansion < 240, `Seed ${game}: expansion ${firstExpansion}, expected before 240s`);
  console.log(`PASS: seed ${game}, difficile expansion at ${firstExpansion.toFixed(1)}s.`);
}
