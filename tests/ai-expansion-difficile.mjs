import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

// A dead scout must not reserve a tenth worker slot at 44/45 population.
{
  const startedAt = performance.now();
  const state = Sim.create();
  const team = 1;
  const controller = createAI(team, 'difficile');
  const scout = state.units.find((unit) => unit.team === team);
  state.time = 60;
  state.rubies[team] = 0;
  controller.update(state);
  assert(scout.path.length > 0, 'The initial worker must become the scout');
  state.units = state.units.filter((unit) => unit.id !== scout.id);
  for (const mineIndex of [1, 3, 6]) {
    const mine = state.mines[mineIndex];
    mine.owner = team;
    mine.depot = true;
    for (let index = 0; index < 3; index++) {
      Sim.spawn(state, 'commis', team);
      const worker = state.units.at(-1);
      assert(Sim.gather(state, team, [worker.id], mineIndex));
    }
  }
  for (let index = 0; index < 35; index++) {
    Sim.spawn(state, 'knight', team);
  }
  state.rubies[team] = 2000;
  for (const building of ['niche_ordures', 'atelier_ferraille', 'autel_peste']) {
    assert(Sim.construct(state, team, building));
  }
  state.time = 360;
  state.rubies[team] = 775;
  assert.equal(Sim.populationUsed(state, team), 44);
  assert.equal(Sim.unitLimit(team), 45);
  controller.update(state);
  assert(state.queues[team].some((job) => ['knight', 'archer', 'mage'].includes(job.type)), 'Recruit a military unit after the scout dies');
  assert.equal(Sim.populationUsed(state, team), 45);
  console.log(`PASS: dead scout does not block military recruitment (${((performance.now() - startedAt) / 1000).toFixed(2)}s).`);
}

// Uncontested expansion must still leave room to saturate the third mine.
for (const team of [0, 1]) {
  const state = Sim.create();
  state.bases[1 - team].hp = 1000000;
  const controller = createAI(team, 'difficile');
  const startedAt = performance.now();
  while (state.time < 420) {
    controller.update(state);
    Sim.tick(state, 0.1);
  }
  assert(controller.metrics.expansions.length >= 2);
  assert(controller.metrics.expansions[0] < 240);
  assert(controller.metrics.expansions[1] < 360);
  for (const [index, mine] of state.mines.entries()) {
    if (mine.owner !== team) continue;
    const assignedWorkers = state.units.filter((unit) => unit.team === team && unit.type === 'commis' && unit.harvest?.mine === index);
    assert.equal(assignedWorkers.length, 3, `Team ${team}, mine ${index}: expected three workers`);
  }
  console.log(`PASS: team ${team}, two expansions and saturated mines (${((performance.now() - startedAt) / 1000).toFixed(1)}s).`);
}

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
