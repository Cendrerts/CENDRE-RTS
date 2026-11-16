// Four focused D11 checks, independent of the four tournaments deferred to #113.
import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

const seeds = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [1, 2, 3, 4];
for (const initialSeed of seeds) {
  let seed = initialSeed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const state = Sim.create();
  const delays = [random() * 4, random() * 4];
  for (const unit of state.units) {
    const cell = Sim.nearest(unit.x + random() * 120 - 60, unit.y + random() * 120 - 60);
    unit.x = (cell % Sim.COLS) * Sim.CELL + 10;
    unit.y = Math.floor(cell / Sim.COLS) * Sim.CELL + 10;
  }
  Sim.visibility(state);
  const controllers = [0, 1].map((team) => createAI(team, 'brutal'));
  for (let step = 0; step < 18000 && state.winner === null; step++) {
    for (const team of [0, 1]) {
      if (state.time >= delays[team]) controllers[team].update(state);
    }
    Sim.tick(state, 0.1);
  }
  console.log(JSON.stringify({ seed: initialSeed, winner: state.winner, seconds: Number(state.time.toFixed(1)) }));
  // Report every seed even when a pre-existing AI stalemate remains.
  if (state.winner === null || state.time >= 1800) process.exitCode = 1;
}
assert(!process.exitCode, 'Chaque duel Brutal doit avoir un vainqueur avant 30 minutes (D29).');
